# 기기별 개인 하이라이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 기기에서 사용자가 넣은 이름/키워드에 걸리는 시간표 줄을 그 기기에서만 빨갛게 표시한다. 키워드가 없으면 현행과 100% 동일(친구 무오류).

**Architecture:** `parseGrid`가 만든 `weeks[].cells[].lines[{text,color}]` 위에 렌더 직전 덧칠 레이어(`applyHighlights`)를 얹는다. 원색은 `line._base`에 보존해 키워드 추가/제거가 idempotent. 시험 판정(`isExam`)은 파싱 단계 값이라 안 건드린다. 앱 키워드는 localStorage(⚙ 설정 모달), 위젯 키워드는 레포 밖 `tt-hl.txt`.

**Tech Stack:** 바닐라 JS(빌드 없음), Scriptable(위젯), GitHub Pages. 테스트 러너 없음 → 검증은 로컬 프리뷰 `preview_eval`(포트 8741, launch.json `timetable`) + 위젯 모킹 하니스로 한다. 커밋은 로컬만; push/배포는 GY 승인 후 별도.

**환경 주의:** 이 PC엔 Node/npm 없음. 서버는 `preview_start`(name `timetable`). 각 태스크 검증 전 서버 실행 + `preview_eval`로 `location.reload()` 후 확인. 코드 수정 후 SW 캐시 걱정 없음(localhost는 SW 미등록).

**공통 상수(앱·위젯 동일):** `HL_RED = '#FF0000'`, 정규화 `normHL(s) = (s||'').replace(/\s+/g,'').toLowerCase()`, 매칭 `matchKeyword(text, kw)` = `kw.some(k => normHL(text).includes(normHL(k)))` (빈 kw/빈 text면 false).

---

## Task 1: 앱 하이라이트 엔진 + applyData 연결

**Files:**
- Modify: `app.js` (CONFIG 아래 상수, 유틸 함수 추가; `applyData` 내 1줄 연결)

- [ ] **Step 1: 상수·엔진 함수 추가**

`app.js`에서 `const FIELDS = ...` 정의 **바로 위**(CONFIG 블록 끝난 직후, 15번째 줄 근처)에 삽입:

```javascript
/* ===== 개인 하이라이트 (기기별) ===== */
const HL_KEY = 'tt_hl';       // localStorage 키
const HL_RED = '#FF0000';     // 개인/시험 공통 빨강
function normHL(s) { return (s || '').replace(/\s+/g, '').toLowerCase(); }
function getKeywords() {
  let raw = '';
  try { raw = localStorage.getItem(HL_KEY) || ''; } catch (e) {}
  return raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}
function matchKeyword(text, keywords) {
  if (!text || !keywords.length) return false;
  const t = normHL(text);
  return keywords.some(k => { const n = normHL(k); return n && t.includes(n); });
}
/* 각 줄 원색을 line._base에 보존하고, 키워드 매칭 줄만 빨강으로. 키워드 제거 시 _base로 복원(idempotent). */
function applyHighlights(weeks, keywords) {
  for (const w of weeks) {
    for (const c of w.cells) {
      for (const ln of c.lines) {
        if (ln._base === undefined) ln._base = ln.color;
        ln.color = (keywords.length && matchKeyword(ln.text, keywords)) ? HL_RED : ln._base;
      }
    }
  }
}
```

- [ ] **Step 2: applyData에 연결**

`app.js`의 `applyData` 함수에서 `state.weeks = weeks;` 줄 **바로 다음**에 삽입:

```javascript
    applyHighlights(state.weeks, getKeywords());
```

- [ ] **Step 3: 서버 실행 + 리로드**

`preview_start`(name `timetable`) → `preview_eval`: `(async()=>{location.reload();return 'r'})()` → 3초 대기.

- [ ] **Step 4: 회귀 검증 — 빈 키워드 = 현행과 색 동일 (1순위)**

`preview_eval`:
```javascript
(() => {
  try { localStorage.removeItem('tt_hl'); } catch(e){}
  const base = parseGrid(window.__SNAPSHOT__);           // 하이라이트 안 거친 원본
  const sig = ws => ws.flatMap(w => w.cells.flatMap(c => c.lines.map(l => l.color))).join('|');
  return { identical: sig(base) === sig(state.weeks), source: state.source };
})()
```
Expected: `{ identical: true, ... }` — 빈 키워드에서 색이 원본과 완전히 같아야 한다(친구 무오류 증명).

- [ ] **Step 5: 매칭 검증 — 키워드 넣으면 그 줄만 빨강**

`preview_eval` (매칭 대상은 스냅샷에 실재하는 이름 사용; 없으면 아래 스크립트가 후보를 알려줌):
```javascript
(() => {
  const KW = '이강윤';
  try { localStorage.setItem('tt_hl', KW); } catch(e){}
  applyHighlights(state.weeks, getKeywords());
  const lines = state.weeks.flatMap(w => w.cells.flatMap(c => c.lines));
  const hit = lines.filter(l => l.text.includes(KW));
  const other = lines.find(l => !l.text.includes(KW) && l._base !== '#FF0000');
  return {
    keyword: KW,
    matchedCount: hit.length,
    allMatchedRed: hit.length > 0 && hit.every(l => l.color === '#FF0000'),
    nonMatchStayNeutral: other ? other.color === other._base : null,
    sampleMatched: hit.slice(0,2).map(l => l.text),
  };
})()
```
Expected: `matchedCount >= 1`, `allMatchedRed: true`, `nonMatchStayNeutral: true`.

- [ ] **Step 6: 제거 복원 검증 — 키워드 지우면 원색 복귀**

`preview_eval`:
```javascript
(() => {
  try { localStorage.removeItem('tt_hl'); } catch(e){}
  applyHighlights(state.weeks, getKeywords());
  const base = parseGrid(window.__SNAPSHOT__);
  const sig = ws => ws.flatMap(w => w.cells.flatMap(c => c.lines.map(l => l.color))).join('|');
  return { restored: sig(base) === sig(state.weeks) };
})()
```
Expected: `{ restored: true }`.

- [ ] **Step 7: 커밋**

```bash
git add app.js
git commit -m "feat(app): 개인 하이라이트 엔진(applyHighlights) + applyData 연결"
```

---

## Task 2: 앱 설정 UI (⚙ 버튼 + 모달)

**Files:**
- Modify: `index.html` (헤더 메타에 ⚙ 버튼, 모달 마크업)
- Modify: `styles.css` (버튼·모달 스타일)
- Modify: `app.js` (`saveKeywords` + `bindUI` 이벤트)

- [ ] **Step 1: index.html — ⚙ 버튼 추가**

`index.html`에서 이 줄을
```html
      <div class="meta"><span id="verBadge" class="badge" hidden></span><span id="srcBadge" class="badge"></span><span id="updated"></span></div>
```
다음으로 교체:
```html
      <div class="meta"><span id="verBadge" class="badge" hidden></span><span id="srcBadge" class="badge"></span><span id="updated"></span><button id="btnHl" class="hlbtn" type="button" aria-label="개인 하이라이트 설정" title="개인 하이라이트 설정">⚙</button></div>
```

- [ ] **Step 2: index.html — 설정 모달 마크업 추가**

`index.html`에서 `<div id="sheetpop" ...>` 블록(닫는 `</div>` 포함) **다음 줄**에 삽입:
```html
<div id="hlpop" class="sheetpop" hidden>
  <div class="sheetpop-inner">
    <div class="hltitle">개인 하이라이트</div>
    <div class="hldesc">본인 이름이나 키워드를 <b>한 줄에 하나씩</b> 넣으면 그 줄이 <b>이 기기에서만</b> 빨갛게 표시돼요. 다른 사람이 볼 때는 영향이 없어요.<br>교수님은 <b>(이름, 과)</b> 형태로 넣으면 같은 이름 다른 과와 안 헷갈려요.</div>
    <textarea id="hlInput" class="hlinput" rows="6" placeholder="예: 홍길동&#10;(김철수, EM)"></textarea>
    <button id="hlSave" class="nbtn" type="button">저장</button>
    <button id="hlClose" class="nbtn hlclose" type="button">닫기</button>
  </div>
</div>
```

- [ ] **Step 3: styles.css — 버튼·모달 스타일 추가**

`styles.css` 맨 끝에 추가:
```css
.hlbtn{font:inherit;font-size:13px;line-height:1;color:#8a897f;background:none;border:0;padding:1px 4px;margin-left:2px;cursor:pointer;vertical-align:1px;-webkit-tap-highlight-color:transparent}
.hlbtn:active{color:#3a3a37}
.hltitle{font-size:15px;font-weight:600;margin-bottom:8px}
.hldesc{font-size:12.5px;color:#73726c;text-align:left;line-height:1.55;margin-bottom:10px}
.hlinput{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:14px;line-height:1.5;border:0.5px solid #b5b2aa;border-radius:8px;padding:8px 10px;resize:vertical}
.sheetpop-inner .nbtn.hlclose{margin-top:8px;background:#f4f2ec}
```

- [ ] **Step 4: app.js — saveKeywords 추가**

`app.js`의 `applyHighlights` 함수 정의 **바로 다음**에 추가:
```javascript
function saveKeywords(raw) {
  try { localStorage.setItem(HL_KEY, raw); } catch (e) {}
  applyHighlights(state.weeks, getKeywords());
  render();
}
```

- [ ] **Step 5: app.js — bindUI에 이벤트 연결**

`app.js`의 `bindUI` 함수 안, `$('sheetpop').addEventListener(...)` 줄 **다음**에 추가:
```javascript
  $('btnHl').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(HL_KEY) || ''; } catch (e) {}
    $('hlInput').value = raw;
    $('hlpop').hidden = false;
  });
  $('hlSave').addEventListener('click', () => { saveKeywords($('hlInput').value); $('hlpop').hidden = true; });
  $('hlClose').addEventListener('click', () => { $('hlpop').hidden = true; });
  $('hlpop').addEventListener('click', e => { if (e.target === $('hlpop')) $('hlpop').hidden = true; });
```

- [ ] **Step 6: 리로드 + UI 검증**

`preview_eval`: `location.reload()` → 3초 대기 → `preview_eval`:
```javascript
(() => {
  const btn = document.getElementById('btnHl');
  btn.click();
  const opened = !document.getElementById('hlpop').hidden;
  document.getElementById('hlInput').value = '이강윤';
  document.getElementById('hlSave').click();
  let saved=''; try{ saved = localStorage.getItem('tt_hl'); }catch(e){}
  const closed = document.getElementById('hlpop').hidden;
  const anyRed = state.weeks.flatMap(w=>w.cells.flatMap(c=>c.lines)).some(l=>l.text.includes('이강윤') && l.color==='#FF0000');
  return { opened, saved, closedAfterSave: closed, appliedRed: anyRed };
})()
```
Expected: `{ opened:true, saved:'이강윤', closedAfterSave:true, appliedRed:true }`.

- [ ] **Step 7: 모바일 레이아웃 무영향 검증**

`preview_resize`(preset `mobile`) → `preview_eval`:
```javascript
(() => ({ noOverflow: document.body.scrollWidth <= window.innerWidth, btnVisible: !!document.getElementById('btnHl').offsetParent }))()
```
Expected: `{ noOverflow: true, btnVisible: true }`. 이어서 `preview_screenshot`으로 ⚙ 버튼이 갱신시각 옆에 자연스러운지 육안 확인.

- [ ] **Step 8: 정리 + 커밋**

`preview_eval`로 테스트 키워드 제거: `(()=>{try{localStorage.removeItem('tt_hl')}catch(e){}return 'cleared'})()`
```bash
git add index.html styles.css app.js
git commit -m "feat(app): 개인 하이라이트 설정 모달(⚙ 버튼)"
```

---

## Task 3: 위젯 개인 하이라이트 (레포 밖 로컬 파일)

**Files:**
- Modify: `widget/timetable-widget.js` (상수/함수, `main` 로드, 교수·제목 색)

- [ ] **Step 1: 상수·함수 추가**

`widget/timetable-widget.js`에서 `const TAB = '시간표';` 줄 **다음**에 추가:
```javascript

/* ===== 개인 하이라이트 (레포 밖 로컬 파일 tt-hl.txt) ===== */
let HL_KEYWORDS = [];
function normHL(s) { return (s || '').replace(/\s+/g, '').toLowerCase(); }
function matchKeyword(text, keywords) {
  if (!text || !keywords.length) return false;
  const t = normHL(text);
  return keywords.some(k => { const n = normHL(k); return n && t.includes(n); });
}
function loadKeywords() {
  const tryFm = [() => FileManager.iCloud(), () => FileManager.local()];
  for (const mk of tryFm) {
    try {
      const fm = mk();
      const path = fm.joinPath(fm.documentsDirectory(), 'tt-hl.txt');
      if (fm.fileExists(path)) {
        try { if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) fm.downloadFileFromiCloud(path); } catch (e) {}
        const raw = fm.readString(path) || '';
        const kw = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        if (kw.length) return kw;
      }
    } catch (e) {}
  }
  return [];
}
```

- [ ] **Step 2: main에서 키워드 로드**

`widget/timetable-widget.js`의 `async function main() {` 다음 첫 줄(`let widget;` 위)에 추가:
```javascript
  HL_KEYWORDS = loadKeywords();
```

- [ ] **Step 3: 교수·제목 색에 매칭 반영**

`buildWeekWidget` 안에서 이 줄들을
```javascript
      const titleColor = new Color(tLine.color && tLine.color !== '#000000' ? tLine.color : '#000000');
      const prof = profLines.length ? profName(profLines[0].text) : '';   /* 과명 제거: (추일한) */
      const profColor = new Color(profLines[0] && isRedHex(profLines[0].color) ? '#FF0000' : '#000000');
```
다음으로 교체:
```javascript
      let titleHex = tLine.color && tLine.color !== '#000000' ? tLine.color : '#000000';
      if (matchKeyword(tLine.text, HL_KEYWORDS)) titleHex = '#FF0000';
      const titleColor = new Color(titleHex);
      const prof = profLines.length ? profName(profLines[0].text) : '';   /* 과명 제거: (추일한) */
      const profRed = profLines[0] && (isRedHex(profLines[0].color) || matchKeyword(profLines[0].text, HL_KEYWORDS));
      const profColor = new Color(profRed ? '#FF0000' : '#000000');
```
(교수 매칭은 과명 포함 원본 `profLines[0].text`, 예 `(김성중, EM)` 기준 — 표시용 `profName` 아님.)

- [ ] **Step 4: 회귀 검증 — 로컬 파일 없음 = 현행과 동일 (1순위)**

로컬 프리뷰(포트 8741)에서 `preview_eval`로 아래 하니스 실행. 하니스의 `FileManager` mock은 `iCloud`/`documentsDirectory` 미제공이라 `loadKeywords()`가 `[]`를 반환 → 현행과 동일해야 함. (하니스 본문은 `~/.claude/skills/deploying-timetable-pwa/widget-mock-harness.js` 내용을 붙여 실행하되, 위젯 코드를 `/widget/timetable-widget.js`에서 fetch.)

Expected: 4개 크기 모두 `ok:true, set:true, fit:true, errTexts:[]` — 즉 현행 통과 기준과 동일(색 회귀 없음, 에러 없음).

- [ ] **Step 5: 매칭 검증 — 키워드 주입 시 교수 줄 빨강**

`preview_eval`로 하니스를 실행하되, mock `FileManager`에 `iCloud`/`documentsDirectory`/`fileExists`/`readString`를 추가해 `tt-hl.txt` = `"(김성중, EM)\n이강윤"`를 주입하고, `DrawContext.setTextColor` 호출 색을 기록하도록 확장한다. 이번 주 셀에 `(김성중, EM)` 교수가 없으면 스크립트가 해당 주로 이동하도록 offset을 조정하거나, 실재하는 교수 키워드로 바꿔 검증한다.

검증 하니스(붙여넣어 실행):
```javascript
(async () => {
  const code = await (await fetch('/widget/timetable-widget.js?t=' + Date.now())).text();
  const KWFILE = '(김성중, EM)\n이강윤';
  const reds = [];
  class MColor { constructor(hex){ this.hex = hex; } }
  const MFont = { boldSystemFont: () => ({}), systemFont: () => ({}) };
  class MSize{} class MRect{constructor(){}} class MPath{addRect(){}}
  class MText{ set font(v){} set textColor(v){} set lineLimit(v){} }
  class MWImg{ centerAlignImage(){} applyFittingContentMode(){} set resizable(v){} }
  class MListWidget{ addText(t){return new MText();} addImage(i){return new MWImg();} setPadding(){}
    set backgroundColor(v){} set url(v){} set refreshAfterDate(v){} set backgroundImage(v){}
    async presentExtraLarge(){} async presentLarge(){} async presentMedium(){} async presentSmall(){} }
  let curColor = null;
  class MDrawContext{ set size(v){} set opaque(v){} set respectScreenScale(v){}
    setFillColor(){} fillRect(){} setStrokeColor(){} setLineWidth(){} addPath(){} strokePath(){}
    setTextAlignedLeft(){} setTextAlignedCenter(){} setFont(){} setTextColor(c){ curColor = c && c.hex; }
    drawTextInRect(t){ if (curColor === '#FF0000') reds.push(t); } getImage(){ return {i:1}; } }
  class MRequest{ constructor(u){ this.url=u; } set headers(h){} set timeoutInterval(v){}
    async loadJSON(){ return (await fetch(this.url)).json(); } async loadString(){ return (await fetch(this.url)).text(); } }
  const docs = { 'DOCS/tt-hl.txt': KWFILE };
  const mkFm = () => ({ joinPath:(a,b)=>a+'/'+b, documentsDirectory:()=>'DOCS', cacheDirectory:()=>'C',
    fileExists:p=>p in docs, readString:p=>docs[p], writeString:(p,s)=>{docs[p]=s;},
    isFileStoredIniCloud:()=>false, isFileDownloaded:()=>true });
  const MFM = { iCloud: mkFm, local: mkFm };
  const env = { Request:MRequest, FileManager:MFM, ListWidget:MListWidget, Color:MColor, Font:MFont,
    Size:MSize, Rect:MRect, Path:MPath, DrawContext:MDrawContext,
    config:{ runsInWidget:true, widgetFamily:'large' }, args:{ widgetParameter:null },
    Script:{ setWidget(){}, complete(){} } };
  try {
    await new Function(...Object.keys(env), 'return (async()=>{'+code+'})()')(...Object.values(env));
    return { redTexts: reds, hasKimSeongjung: reds.some(t => t.includes('김성중')) };
  } catch (e) { return { err: e.message }; }
})()
```
Expected: `redTexts`에 빨강으로 그려진 텍스트가 나오고, 이번 주에 `(김성중, EM)`가 실재하면 `hasKimSeongjung: true`. (해당 교수가 이번 주에 없으면 `redTexts`가 비거나 다른 매칭만 — 그때는 KWFILE을 이번 주 실재 교수로 바꿔 재확인.)

- [ ] **Step 6: 커밋**

```bash
git add widget/timetable-widget.js
git commit -m "feat(widget): 개인 하이라이트(tt-hl.txt 로컬 파일, 교수 줄 매칭)"
```

---

## Task 4: 가이드 문서(guide.html) 사용법 섹션

**Files:**
- Modify: `guide.html` (개인 하이라이트 `.card` 섹션 추가)

- [ ] **Step 1: 섹션 카드 추가**

`guide.html`에서 첫 `.card`(1단계 설치) 블록의 닫는 `</div>` **다음**에 새 카드 삽입:
```html
  <div class="card">
    <h2>🎨 내 이름·교수 빨갛게 (선택) <span class="badge">10초</span></h2>
    <p class="why">시간표 상단 갱신시각 옆의 <span class="k">⚙</span> 버튼을 누르면, 내가 넣은 이름/키워드가 든 줄만 <b class="warn">빨갛게</b> 보여요. <b>이 기기에서만</b> 적용되고 다른 친구가 볼 때는 영향이 없어요.</p>
    <ol class="steps">
      <li>시간표 상단 <b>갱신시각 옆 <span class="k">⚙</span></b> 버튼을 누른다.</li>
      <li>본인 <b>이름</b>을 한 줄에 하나씩 입력 (예: 홍길동).</li>
      <li>특정 <b>교수님</b>도 표시하려면 <span class="k">(이름, 과)</span> 형태로 (예: (김철수, EM)) — 같은 이름 다른 과와 안 헷갈려요.</li>
      <li><b>저장</b>을 누르면 끝. 그 줄들이 빨갛게 바뀌어요.</li>
    </ol>
    <div class="note">📌 <b>시험 빨강과 같은 색</b>이에요. 시험(총괄평가·재시험)은 제목 줄, 내 개인 표시는 교수/조원 줄이라 위치로 구분돼요. 키워드를 비우면 원래대로 돌아와요.</div>
  </div>
```

- [ ] **Step 2: 렌더 검증**

`preview_eval`로 guide 페이지 확인(같은 서버가 `/guide.html` 제공):
```javascript
(async () => {
  const html = await (await fetch('/guide.html?t=' + Date.now())).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = [...doc.querySelectorAll('.card h2')].map(h => h.textContent.trim());
  return { hasHlCard: cards.some(t => t.includes('빨갛게')), cardCount: cards.length };
})()
```
Expected: `{ hasHlCard: true, ... }`. (선택) `preview_eval`로 `location.href='/guide.html'` 후 `preview_screenshot`로 육안 확인.

- [ ] **Step 3: 커밋**

```bash
git add guide.html
git commit -m "docs(guide): 개인 하이라이트 사용법 섹션"
```

---

## Task 5: SW 버전 올림 + 통합 검증

**Files:**
- Modify: `sw.js` (VERSION)

- [ ] **Step 1: VERSION 올림**

`sw.js`에서 `const VERSION = 'v9';` → `const VERSION = 'v10';`

- [ ] **Step 2: 앱 전체 통합 재검증**

`location.reload()` → 3초 → `preview_eval`:
```javascript
(() => {
  try { localStorage.removeItem('tt_hl'); } catch(e){}
  const base = parseGrid(window.__SNAPSHOT__);
  const sig = ws => ws.flatMap(w=>w.cells.flatMap(c=>c.lines.map(l=>l.color))).join('|');
  const friendIdentical = sig(base) === sig(state.weeks);   // 친구 무오류
  const btnPresent = !!document.getElementById('btnHl');
  return { friendIdentical, btnPresent, source: state.source, ver: state.ver };
})()
```
Expected: `{ friendIdentical: true, btnPresent: true, ... }`. `preview_console_logs`(level error) → 오류 0 확인.

- [ ] **Step 3: 커밋**

```bash
git add sw.js
git commit -m "chore: SW 캐시 v9→v10 (개인 하이라이트 반영)"
```

---

## 배포 (GY 승인 후 별도)

- 위 커밋들 `git push origin main` → Pages 자동 재배포. (push는 정책상 GY 명시 승인 필요.)
- **GY 액션 3가지:**
  1. **시트 중립화**: 구글 시트에서 GY 이름(초안자/검안자 줄)을 파랑으로, GY 교수를 검정으로 되돌림. 시험 빨강은 유지. → 30분 스냅샷 크론이 자동 반영.
  2. **앱**: 아이폰·컴퓨터 각각 ⚙ 열고 키워드(이름 1 + 교수 11, `(이름, 과)` 형태) 붙여넣고 저장.
  3. **위젯**: Scriptable iCloud/local Documents 폴더에 `tt-hl.txt` 생성(같은 키워드 붙여넣기). 위젯 스크립트 갱신.
- 실제 키워드는 앱 패널·`tt-hl.txt`에만 — 레포엔 안 올림(익명 유지).

## 자기 검토 (계획 작성자용, 완료)

- 스펙 커버리지: 엔진(T1)·설정 UI(T2)·위젯(T3)·가이드(T4)·SW(T5)·시트 중립화(배포 절차) 모두 태스크 존재. ✓
- 친구 무오류(1순위): T1-S4, T3-S4, T5-S2에서 "빈 키워드/파일 없음 = 현행 동일" 명시 검증. ✓
- 타입 일관성: `matchKeyword`·`normHL`·`applyHighlights`·`HL_KEY`·`HL_RED`·`getKeywords`·`saveKeywords`·`HL_KEYWORDS`·`loadKeywords` 이름 앱/위젯 전체 일치. ✓
- 위젯 특이사항: 초안자/검안자 줄은 위젯에 안 그려짐 → 이름 키워드는 앱 전용, 교수 키워드가 위젯의 실질 대상(명시). ✓
