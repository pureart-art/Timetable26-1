# 2학기 확장 · 3줄 메뉴 · 공지사항 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시간표 PWA가 26-1·26-2 두 학기를 한 URL에서 학기 구분과 함께 보여주고, 상단 3줄 메뉴 아래 개인 하이라이트 · 공지사항 · 설치 가이드를 모은다.

**Architecture:** 기존 단일 스크립트 구조(`index.html` + `app.js` + `styles.css`)를 유지하되, 공지사항만 `notices.js`로 분리한다. 공지는 시간표와 별개의 작은 `values.get` 호출을 쓰므로 한쪽이 실패해도 다른 쪽에 영향이 없다. 학기 판정의 정본은 `CONFIG.SEMESTERS` 배열 하나이고, 파서는 시트 날짜가 이미 월요일이면 덮어쓰지 않도록 방어한다.

**Tech Stack:** 바닐라 JS (모듈 없음, 빌드 없음), Google Sheets API v4, Google Apps Script, Scriptable(위젯), GitHub Pages.

## Global Constraints

- **기존 사용자 무중단.** 레포 `pureart-art/Timetable26-1`, 배포 URL `https://pureart-art.github.io/Timetable26-1/`, `manifest.json`의 앱 이름 `의학과 2학년 시간표`는 **바꾸지 않는다.** 바꾸면 친구들 홈화면 아이콘과 위젯 설치가 깨진다.
- **시트 ID·API 키는 그대로.** `SHEET_ID: '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4'`, `API_KEY: 'AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k'`.
- **공지 실패가 시간표를 막지 않는다.** 공지 코드의 모든 예외는 자체적으로 삼키고, 시간표 렌더 경로를 절대 호출하지 않는다.
- **없는 값을 지어내지 않는다.** 주차 라벨이 비면 빈 문자열 그대로, 공지 로드 실패는 "공지 없음"이 아니라 "불러오지 못함"으로.
- **테스트 러너가 없는 레포다.** 검증은 (1) `node --check` 구문검사, (2) `localhost:8741` 프리뷰에서 `tools/verify.js`의 어서션 실행, (3) 위젯은 브라우저 모킹 하니스. 새 테스트 프레임워크를 도입하지 않는다.
- **위젯 라벨 표시는 바꾸지 않는다** (GY 결정). 위젯 파일 수정은 Task 2의 날짜 교정 1줄뿐이다.
- **`공지` 탭은 절대 첫 번째 시트가 되면 안 된다.** `tools/extract.ps1`이 `xl/worksheets/sheet1.xml`을 하드코딩으로 읽는다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **push는 마지막 Task에서만.** 그 전까지 로컬 커밋만 쌓는다. push 직전 `git pull --rebase origin main` (스냅샷 Action이 30분마다 `data/snapshot.js` 커밋을 쌓는다).

## 사전 확인된 사실 (2026-08-12 실측, 다시 조사하지 말 것)

- 시트에 주 블록 **49개**. 전부 C열이 월요일(`serial % 7 === 2`), 인접 간격 1주, 10행 경계 정렬.
- 구조: 인덱스 0~20 = `1주`~`21주`(26-1) / 21 = `방학`(2026-08-24) / 22~40 = `1주`~`19주`(26-2, 08-31 시작) / 41~44 = `방학` / 45~48 = `미정`(2027-02-08 ~ 03-01).
- 빈 라벨 0건. 시트 파일명 `v88_26-1시간표_GY`. 탭은 `시간표` 하나뿐(`공지` 미생성).
- `dateToSerial(2026,3,30) === 46111`, `46111 % 7 === 2`. 과거 오타였던 `2025-06-15`·`2025-07-06`은 둘 다 `% 7 === 1`(일요일).
- 존재하지 않는 탭을 `values.get`으로 부르면 **HTTP 400 `Unable to parse range`**.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `index.html` | 셸 마크업 — 제목 구조, 3줄 버튼, 메뉴/공지/하이라이트 시트 | 수정 |
| `app.js` | 시트 파싱 · 시간표 렌더 · 학기 판정 · 메뉴 바인딩 | 수정 |
| `notices.js` | **공지 전담** — fetch · 정렬 · 캐시 · 읽음 · 패널 · 빨간 점 | **신규** |
| `styles.css` | 메뉴 리스트 · 공지 목록 · 빨간 점 스타일 | 수정 |
| `guide.html` | 사용자 매뉴얼 — `⚙` → `☰` 문구 | 수정 |
| `sw.js` | 캐시 버전 + 셸 목록에 `notices.js` | 수정 |
| `widget/timetable-widget.js` | 날짜 교정 1줄 | 수정 |
| `tools/make-notice-tab.gs` | GY가 1회 실행할 Apps Script | **신규** |
| `tools/verify.js` | 브라우저 붙여넣기 어서션 하니스 (Task마다 함수 추가) | **신규** |

`notices.js`를 분리하는 이유: 공지는 자체 데이터 출처 · 자체 캐시 · 자체 실패 모드를 가지며 시간표 데이터에 전혀 의존하지 않는다. 파일 경계를 물리적으로 나눠야 "공지가 죽어도 시간표는 산다"는 제약이 코드에서 보인다.

---

### Task 1: 공지 탭 생성 스크립트 (Apps Script)

GY가 시트에서 1회 실행할 스크립트. 나머지 Task와 독립이며, 먼저 만들어 두면 GY가 실행하는 동안 코드 작업을 이어갈 수 있다.

**Files:**
- Create: `tools/make-notice-tab.gs`

**Interfaces:**
- Consumes: 없음
- Produces: 스프레드시트에 `공지` 탭 (1행 헤더 `날짜 | 제목 | 내용`, A열 텍스트 서식, `시간표` 탭 바로 오른쪽). Task 6·7의 종단 검증이 이 탭에 의존한다.

- [ ] **Step 1: 스크립트 작성**

`tools/make-notice-tab.gs`:

```javascript
/**
 * 시간표 시트에 '공지' 탭을 만든다. 1회만 실행하면 된다.
 *
 * 실행 방법
 *   1) 시간표 구글 시트 열기
 *   2) 확장 프로그램 → Apps Script
 *   3) 이 파일 내용을 통째로 붙여넣기 (기존 myFunction 삭제)
 *   4) 함수 선택창에서 makeNoticeTab 고르고 ▶ 실행
 *   5) 첫 실행이면 권한 승인 (내 계정 → 고급 → 안전하지 않음으로 이동)
 *
 * 주의: '공지' 탭이 첫 번째 시트가 되면 스냅샷 추출기(tools/extract.ps1)가
 *       xl/worksheets/sheet1.xml을 하드코딩으로 읽기 때문에 깨진다.
 *       이 스크립트는 '시간표' 바로 오른쪽에 넣어 그 사고를 막는다.
 */
function makeNoticeTab() {
  var TAB = '공지';
  var MAIN = '시간표';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (ss.getSheetByName(TAB)) {
    throw new Error("'" + TAB + "' 탭이 이미 있습니다. 그대로 쓰시거나, 지우고 다시 실행하세요.");
  }
  var main = ss.getSheetByName(MAIN);
  if (!main) {
    throw new Error("'" + MAIN + "' 탭을 찾지 못했습니다. 탭 이름을 확인하세요.");
  }

  // insertSheet의 index는 0-based. main.getIndex()는 1-based이므로
  // 그 값을 그대로 주면 '시간표' 바로 다음 자리에 들어간다.
  var sh = ss.insertSheet(TAB, main.getIndex());

  sh.getRange('A1:C1')
    .setValues([['날짜', '제목', '내용']])
    .setFontWeight('bold')
    .setBackground('#f4f2ec');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 520);

  // A열은 일반 텍스트 — 앱이 'YYYY-MM-DD' 문자열을 그대로 읽고 사전순으로 정렬한다.
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('C:C').setWrap(true);

  // 첫 항목 초안. GY가 내용을 검수·수정한 뒤 남기거나 지운다.
  sh.getRange('A2:C2').setValues([[
    '2026-08-12',
    '2학기 시간표 반영',
    '8/31부터 2학기 일정이 들어갔어요. 상단 버튼이 3줄 메뉴로 바뀌었고, 공지사항이 생겼어요.'
  ]]);

  ss.setActiveSheet(sh);

  try {
    SpreadsheetApp.getUi().alert(
      "'공지' 탭을 만들었습니다.\n\n" +
      "· 날짜는 2026-08-12 형식으로 적어주세요\n" +
      "· 한 줄에 공지 하나\n" +
      "· 어디에 추가하든 앱에서는 최신이 위로 옵니다\n\n" +
      "2행의 첫 공지 초안을 확인하고 수정하거나 지우세요."
    );
  } catch (e) {
    Logger.log("'공지' 탭 생성 완료 (UI 알림은 건너뜀)");
  }
}
```

- [ ] **Step 2: 구문검사**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && cp tools/make-notice-tab.gs /tmp/gs-check.js && node --check /tmp/gs-check.js && echo OK
```
Expected: `OK` (Apps Script는 ES5 문법이라 Node로 파싱된다)

- [ ] **Step 3: 커밋**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add tools/make-notice-tab.gs
git commit -m "feat(notices): 공지 탭 생성 Apps Script

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: GY에게 실행 요청**

GY에게 `tools/make-notice-tab.gs` 경로와 위 주석의 실행 5단계를 전달하고, 실행 완료 회신을 기다린다. **회신 전이라도 Task 2~5는 진행 가능하다.** Task 6의 종단 검증에서만 필요하다.

- [ ] **Step 5: 탭 생성 확인 (GY 회신 후)**

Run:
```bash
cd /c/Users/wbnuj/AppData/Local/Temp/claude/C--Users-wbnuj/f93ecec3-427c-4800-b1ee-1615d9afdc94/scratchpad
ID=1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4
KEY=AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k
curl -fsSL -H "Referer: https://pureart-art.github.io/Timetable26-1/" \
  "https://sheets.googleapis.com/v4/spreadsheets/$ID?fields=sheets.properties.title&key=$KEY"
curl -fsSL -H "Referer: https://pureart-art.github.io/Timetable26-1/" \
  "https://sheets.googleapis.com/v4/spreadsheets/$ID/values/%EA%B3%B5%EC%A7%80!A1:C10?key=$KEY"
```
Expected: 첫 응답의 탭 목록이 `["시간표","공지"]` **순서**(공지가 두 번째). 둘째 응답에 헤더 행과 2행 초안이 보인다.

---

### Task 2: 날짜 교정 안전장치 + 라벨 폴백 제거

시트 날짜가 이미 월요일이면 덮어쓰지 않는다. 현재 데이터에서는 발동하지 않아야 하며(회귀 0), 주 블록을 빠뜨린 합성 입력에서만 차이가 난다.

**Files:**
- Modify: `app.js` (상수 추가, `parseGrid()` 내 `mondays` 계산과 `label` 폴백)
- Modify: `widget/timetable-widget.js` (`findWeekPicks()` 내 교정 조건)
- Create: `tools/verify.js`

**Interfaces:**
- Consumes: 기존 전역 `parseGrid(api)`, `dateToSerial(y,m,d)`, `state.weeks`
- Produces: 전역 상수 `MONDAY_MOD = 2`. `tools/verify.js`의 `checkParser()` → `{name, pass, detail}[]`, `runAll()` → 콘솔 표 출력 + `{passed, failed}` 반환. Task 3·4·6이 `verify.js`에 함수를 추가한다.

- [ ] **Step 1: 검증 하니스 작성 (실패하는 테스트)**

`tools/verify.js` 신규:

```javascript
/* 브라우저 검증 하니스 — http://localhost:8741 프리뷰의 페이지 컨텍스트에 붙여넣어 실행한다.
   각 check*()는 [{name, pass, detail}] 를 반환하고, runAll()이 전부 모아 출력한다.
   테스트 러너가 없는 레포라 이 파일이 회귀 방지선이다. */

/* --- 합성 시트: parseGrid에 먹일 최소 형태의 Sheets API 응답 --- */
function fakeCellNum(n) { return { effectiveValue: { numberValue: n }, formattedValue: String(n) }; }
function fakeCellStr(s) { return { formattedValue: s }; }
/* 헤더 1행(A=라벨, C~I=날짜) + 교시 9행(빈 칸) = 10행 */
function fakeWeekRows(label, monday) {
  const hdr = { values: [fakeCellStr(label), fakeCellStr('')] };
  for (let d = 0; d < 7; d++) hdr.values.push(fakeCellNum(monday + d));
  const rows = [hdr];
  for (let p = 0; p < 9; p++) rows.push({ values: [] });
  return rows;
}
function fakeApi(weeks) {
  let rowData = [];
  for (const w of weeks) rowData = rowData.concat(fakeWeekRows(w.label, w.monday));
  return { properties: { title: 'vTEST' }, sheets: [{ merges: [], data: [{ rowData }] }] };
}

function checkParser() {
  const out = [];
  const M = dateToSerial(2026, 3, 30);   /* 월요일, serial 46111 */

  /* 1) 주 공백(방학 등)이 있어도 시트 날짜를 그대로 신뢰해야 한다.
        세 번째 블록이 2주 뒤(M+21)인데, 연속 가정만 쓰면 M+14로 덮어쓴다. */
  const gapped = parseGrid(fakeApi([
    { label: '1주', monday: M },
    { label: '2주', monday: M + 7 },
    { label: '3주', monday: M + 21 },
  ])).map(w => w.monday);
  out.push({
    name: '주 공백이 있어도 날짜를 덮어쓰지 않는다',
    pass: JSON.stringify(gapped) === JSON.stringify([M, M + 7, M + 21]),
    detail: 'got ' + JSON.stringify(gapped) + ' want ' + JSON.stringify([M, M + 7, M + 21]),
  });

  /* 2) 연도 오타(월요일이 아닌 날짜)는 여전히 교정돼야 한다.
        2025-06-15는 일요일(%7===1) → 기대값 M+7로 교정. */
  const typo = parseGrid(fakeApi([
    { label: '1주', monday: M },
    { label: '2주', monday: dateToSerial(2025, 6, 15) },
    { label: '3주', monday: M + 14 },
  ])).map(w => w.monday);
  out.push({
    name: '월요일이 아닌 오타 날짜는 교정한다',
    pass: JSON.stringify(typo) === JSON.stringify([M, M + 7, M + 14]),
    detail: 'got ' + JSON.stringify(typo) + ' want ' + JSON.stringify([M, M + 7, M + 14]),
  });

  /* 3) A열이 비면 주차 번호를 지어내지 않는다. */
  const blank = parseGrid(fakeApi([
    { label: '1주', monday: M },
    { label: '', monday: M + 7 },
  ])).map(w => w.label);
  out.push({
    name: '빈 라벨에 주차 번호를 지어내지 않는다',
    pass: JSON.stringify(blank) === JSON.stringify(['1주', '']),
    detail: 'got ' + JSON.stringify(blank),
  });

  /* 4) 실제 시트 회귀 — 49주, 전부 월요일, 간격 1주 */
  const ws = state.weeks;
  const allMon = ws.every(w => w.monday % 7 === 2);
  let contiguous = true;
  for (let i = 1; i < ws.length; i++) if (ws[i].monday - ws[i - 1].monday !== 7) contiguous = false;
  out.push({
    name: '실제 시트: 49주 · 전부 월요일 · 간격 1주',
    pass: ws.length === 49 && allMon && contiguous,
    detail: 'len=' + ws.length + ' allMon=' + allMon + ' contiguous=' + contiguous,
  });

  return out;
}

function runAll() {
  const checks = [checkParser];
  let rows = [];
  for (const fn of checks) {
    try { rows = rows.concat(fn()); }
    catch (e) { rows.push({ name: fn.name + ' (예외)', pass: false, detail: String(e) }); }
  }
  console.table(rows.map(r => ({ 결과: r.pass ? 'PASS' : 'FAIL', 항목: r.name, 상세: r.detail })));
  const failed = rows.filter(r => !r.pass);
  console.log(failed.length ? 'FAILED ' + failed.length + '/' + rows.length : 'ALL PASS (' + rows.length + ')');
  return { passed: rows.length - failed.length, failed: failed.length, rows };
}
```

- [ ] **Step 2: 실패 확인**

프리뷰를 띄운다 — `preview_start` with `{name: "timetable"}` → `http://localhost:8741/`.
페이지가 뜨면 `tools/verify.js` 전체 내용을 페이지 컨텍스트에서 평가한 뒤 `runAll()` 실행.

Expected: **FAILED 2/4**
- `주 공백이 있어도 날짜를 덮어쓰지 않는다` → FAIL (`got [46111,46118,46125]`)
- `빈 라벨에 주차 번호를 지어내지 않는다` → FAIL (`got ["1주","2주"]`)
- 나머지 2개는 PASS

- [ ] **Step 3: 회귀 기준선 저장**

코드 수정 **전에** 현재 파싱 결과를 저장한다.

페이지 컨텍스트에서 평가:
```javascript
JSON.stringify({ mondays: state.weeks.map(w => w.monday), labels: state.weeks.map(w => w.label) })
```
결과 문자열을 `C:\Users\wbnuj\AppData\Local\Temp\claude\C--Users-wbnuj\f93ecec3-427c-4800-b1ee-1615d9afdc94\scratchpad\baseline.json`에 저장한다.

- [ ] **Step 4: app.js 수정**

`app.js:67` 아래(`const BLOCK_ROWS = 10;` 다음 줄)에 상수 추가:

```javascript
const MONDAY_MOD = 2;    // 구글 시트 시리얼: serial % 7 === 2 이면 월요일 (46111 = 2026-03-30)
```

`parseGrid()`의 `mondays` 계산을 교체 — 기존:

```javascript
  const mondays = rawMon.map((m, i) => {
    const expect = baseMedian + 7 * i;
    return (m === null || Math.abs(m - expect) > 1) ? expect : m;
  });
```

새로:

```javascript
  const mondays = rawMon.map((m, i) => {
    const expect = baseMedian + 7 * i;
    if (m === null) return expect;
    /* 시트 날짜가 이미 월요일이면 그대로 신뢰 — 방학 등 주 공백이 있어도 밀리지 않는다.
       연도 오타는 월요일이 아니므로(2025-06-15는 일요일) 아래 교정에 그대로 걸린다. */
    if (m % 7 === MONDAY_MOD) return m;
    return Math.abs(m - expect) > 1 ? expect : m;
  });
```

같은 함수의 라벨 폴백 제거 — 기존:

```javascript
    const label = (aCell && aCell.formattedValue || '').trim() || (wi + 1) + '주';
```

새로:

```javascript
    /* 폴백으로 주차 번호를 지어내지 않는다 — 틀린 숫자보다 빈칸이 정직하다. */
    const label = (aCell && aCell.formattedValue || '').trim();
```

- [ ] **Step 5: 위젯 수정**

`widget/timetable-widget.js`의 `findWeekPicks()` — 기존:

```javascript
  headers.forEach((h, i) => {
    const ex = base + 7 * i;
    if (Math.abs(h.monday - ex) > 1) h.monday = ex;
  });
```

새로:

```javascript
  headers.forEach((h, i) => {
    const ex = base + 7 * i;
    /* 시트 날짜가 이미 월요일(serial % 7 === 2)이면 신뢰 — 방학 등 주 공백 허용 */
    if (h.monday % 7 !== 2 && Math.abs(h.monday - ex) > 1) h.monday = ex;
  });
```

- [ ] **Step 6: 구문검사**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && node --check app.js && node --check tools/verify.js && cp widget/timetable-widget.js /tmp/w.mjs && node --check /tmp/w.mjs && echo ALL-OK
```
Expected: `ALL-OK` (위젯은 top-level await 때문에 `.mjs`로 복사해 검사한다)

- [ ] **Step 7: 통과 확인 + 회귀 대조**

프리뷰를 새로고침하고 `tools/verify.js`를 다시 평가한 뒤 `runAll()`.
Expected: `ALL PASS (4)`

이어서 같은 컨텍스트에서 평가:
```javascript
JSON.stringify({ mondays: state.weeks.map(w => w.monday), labels: state.weeks.map(w => w.label) })
```
Expected: Step 3에 저장한 `baseline.json`과 **문자열이 완전히 동일**. 다르면 이 변경은 회귀를 낸 것이므로 되돌리고 원인을 찾는다.

- [ ] **Step 8: 위젯 하니스**

`C:\Users\wbnuj\.claude\skills\deploying-timetable-pwa\widget-mock-harness.js`를 프리뷰 페이지 컨텍스트에 붙여넣어 실행.
Expected: 4개 크기 전부 `errTexts` 비고 `set = true`

- [ ] **Step 9: 커밋**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add app.js widget/timetable-widget.js tools/verify.js
git commit -m "fix(parser): 시트 날짜가 월요일이면 덮어쓰지 않음 + 라벨 폴백 제거

주 블록을 빠뜨렸을 때 이후 전체가 조용히 7일씩 밀리는 문제를 막는다.
연도 오타 교정은 그대로 유지(오타 날짜는 월요일이 아님).
현재 시트 49주에서는 발동하지 않아 파싱 결과가 변경 전과 동일함을 확인.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 학기 판정 · 제목

`의학과 2학년 시간표 — 20주` → `의학과 26-1 시간표: 20주`.

**Files:**
- Modify: `index.html` (제목 마크업)
- Modify: `app.js` (CONFIG.SEMESTERS, `semesterOf`/`weekSemester`/`setTitle`, 4개 호출 지점)
- Modify: `tools/verify.js` (`checkTitle()` 추가)

**Interfaces:**
- Consumes: `dateToSerial(y,m,d)`, `state.weeks`, `state.monthY`/`state.monthM`, `$(id)`
- Produces:
  - `CONFIG.SEMESTERS: {name: string, start: 'YYYY-MM-DD'}[]`
  - `semesterOf(monday: number) → string | null`
  - `weekSemester(w: {label, monday}) → string | null`
  - `setTitle(label: string, semName: string | null) → void` — `#titleMain`의 textContent를 세팅
  - DOM: `#titleMain` (신규), `#weekLabel` **제거**

- [ ] **Step 1: 검증 함수 추가 (실패하는 테스트)**

`tools/verify.js`에 추가하고, `runAll()`의 `checks` 배열을 `[checkParser, checkTitle]`로 바꾼다:

```javascript
function checkTitle() {
  const out = [];
  const t = () => document.getElementById('titleMain').textContent;
  /* 이 함수는 뷰 상태를 휘젓는다 — 건드리는 것을 전부 저장하고 끝에 되돌린다 */
  const saveView = state.view, saveIdx = state.weekIdx, saveDay = state.dayIdx,
        saveY = state.monthY, saveM = state.monthM;

  const cases = [
    /* [weekIdx, view, 기대 제목, 설명] */
    [20, 'week', '의학과 26-1 시간표: 21주', '1학기 마지막 주'],
    [21, 'week', '의학과 시간표: 방학',      '방학 주는 학기명 없음'],
    [22, 'week', '의학과 26-2 시간표: 1주',  '2학기 첫 주'],
    [45, 'week', '의학과 시간표: 미정',      '미정 주는 학기명 없음'],
    [22, 'day',  '의학과 26-2 시간표: 1주',  '오늘 보기도 동일'],
    [22, 'two',  '의학과 26-2 시간표: 1주–2주', '2주간은 첫 주 기준'],
    [21, 'two',  '의학과 시간표: 방학–1주',  '2주간 경계: 첫 주가 방학'],
  ];
  for (const [idx, view, want, desc] of cases) {
    state.view = view; state.weekIdx = idx; state.dayIdx = 0;
    render();
    out.push({ name: '제목 · ' + desc, pass: t() === want, detail: 'got "' + t() + '" want "' + want + '"' });
  }

  /* 월간은 그 달 1일 기준 — 1일이 어느 학기 시작일보다도 앞서면 학기명이 없다.
     이 범위에서 그런 달은 2026년 3월(1일 < 개강 3/30) 하나뿐이다. */
  const months = [
    [2026, 8, '의학과 26-1 시간표: 2026년 8월', '경계 달(8/1은 26-1)'],
    [2026, 9, '의학과 26-2 시간표: 2026년 9월', '2학기 달'],
    [2026, 4, '의학과 26-1 시간표: 2026년 4월', '1학기 달'],
    [2026, 3, '의학과 시간표: 2026년 3월', '개강 전 달은 학기명 없음'],
  ];
  for (const [y, m, want, desc] of months) {
    state.view = 'month'; state.monthY = y; state.monthM = m;
    render();
    out.push({ name: '제목 · 월간 ' + desc, pass: t() === want, detail: 'got "' + t() + '" want "' + want + '"' });
  }

  /* semesterOf 경계값 */
  out.push({
    name: 'semesterOf 경계',
    pass: semesterOf(dateToSerial(2026, 8, 24)) === '26-1'
       && semesterOf(dateToSerial(2026, 8, 31)) === '26-2'
       && semesterOf(dateToSerial(2026, 3, 23)) === null,
    detail: [dateToSerial(2026, 8, 24), dateToSerial(2026, 8, 31), dateToSerial(2026, 3, 23)]
      .map(semesterOf).join(' / '),
  });

  state.view = saveView; state.weekIdx = saveIdx; state.dayIdx = saveDay;
  state.monthY = saveY; state.monthM = saveM;
  render();
  return out;
}
```

- [ ] **Step 2: 실패 확인**

프리뷰 새로고침 → `tools/verify.js` 평가 → `runAll()`
Expected: `checkTitle (예외)` 한 줄이 FAIL로 뜬다 (`titleMain`이 null이거나 `semesterOf is not defined`). `checkParser` 4개는 PASS 유지.

- [ ] **Step 3: index.html 제목 마크업 교체**

기존:

```html
      <div class="title">의학과 2학년 시간표 — <span id="weekLabel">·</span><small id="weekRange"></small></div>
```

새로:

```html
      <div class="title"><span id="titleMain">의학과 시간표</span><small id="weekRange"></small></div>
```

- [ ] **Step 4: app.js에 학기 설정과 헬퍼 추가**

`CONFIG`(app.js:9)에 항목 추가 — `FETCH_TIMEOUT_MS` 줄 다음에:

```javascript
  /* 학기 정본. 새 학기가 시작되면 여기 한 줄만 추가한다.
     start = 그 학기 1주차의 월요일. 시트에서 유추하지 않는다. */
  SEMESTERS: [
    { name: '26-1', start: '2026-03-30' },
    { name: '26-2', start: '2026-08-31' },
  ],
```

`state` 정의(app.js:70) 바로 앞에 헬퍼 추가:

```javascript
/* ===== 학기 · 제목 ===== */
function semesterOf(monday) {
  let name = null;
  for (const s of CONFIG.SEMESTERS) {
    const p = s.start.split('-');
    if (monday >= dateToSerial(+p[0], +p[1], +p[2])) name = s.name;
  }
  return name;
}
/* 주차 라벨이 'N주' 꼴일 때만 학기명을 붙인다.
   방학·미정 주는 어느 학기로도 부를 수 없으므로 학기명을 생략한다. */
function weekSemester(w) {
  return (w && /^\d+\s*주$/.test(w.label)) ? semesterOf(w.monday) : null;
}
function setTitle(label, semName) {
  $('titleMain').textContent =
    '의학과 ' + (semName ? semName + ' ' : '') + '시간표' + (label ? ': ' + label : '');
}
```

> `semesterOf`는 `dateToSerial`을, `setTitle`은 `$`를 쓴다. 둘 다 같은 파일 아래쪽에 `function`/`const`로 선언돼 있고 호출은 렌더 시점이라 순서 문제는 없다.

- [ ] **Step 5: 호출 지점 4곳 교체**

`renderSheet()` — 기존 두 줄을 각각 교체:

```javascript
    $('weekLabel').textContent = w.label;
```
→ (day 분기와 else 분기 **둘 다**)
```javascript
    setTitle(w.label, weekSemester(w));
```

`renderTwoWeek()` — 기존:

```javascript
    $('weekLabel').textContent = shown.length > 1 ? w1.label + '–' + wl.label : w1.label;
```
새로:

```javascript
    setTitle(shown.length > 1 ? w1.label + '–' + wl.label : w1.label, weekSemester(w1));
```

`renderMonth()` — 기존:

```javascript
  $('weekLabel').textContent = y + '년 ' + m + '월';
```
새로:

```javascript
  setTitle(y + '년 ' + m + '월', semesterOf(dateToSerial(y, m, 1)));
```

- [ ] **Step 6: `weekLabel` 잔재 확인**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && grep -rn "weekLabel" app.js index.html styles.css guide.html sw.js ; echo "exit=$?"
```
Expected: 매치 없음 (`exit=1`). 남아 있으면 그 지점도 `setTitle`로 바꾼다.

- [ ] **Step 7: 구문검사 + 통과 확인**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && node --check app.js && node --check tools/verify.js && echo OK
```
Expected: `OK`

프리뷰 새로고침 → `tools/verify.js` 평가 → `runAll()`
Expected: `ALL PASS (16)` — checkParser 4 + checkTitle 12

- [ ] **Step 8: 모바일 폭 확인**

`resize_window`로 375×812. 페이지 컨텍스트에서 평가:
```javascript
JSON.stringify({ over: document.body.scrollWidth > window.innerWidth, title: document.getElementById('titleMain').textContent })
```
Expected: `over: false`. 데스크톱 폭으로 되돌린다.

- [ ] **Step 9: 커밋**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add index.html app.js tools/verify.js
git commit -m "feat(title): 학기 표시 — '의학과 26-1 시간표: 20주'

학기 정본은 CONFIG.SEMESTERS 배열 하나. 라벨이 'N주' 꼴일 때만
학기명을 붙여 방학·미정 주의 경계 문제를 없앤다. 월간은 그 달 1일 기준.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 3줄 메뉴

`⚙` 버튼을 3줄 아이콘으로 바꾸고, 눌렀을 때 아래에서 올라오는 시트에 3개 항목을 넣는다. 이 Task에서는 **공지 항목이 자리만 잡고 아직 아무 것도 열지 않는다** (Task 6에서 연결).

**Files:**
- Modify: `index.html` (버튼 교체, 메뉴 시트 마크업)
- Modify: `styles.css` (메뉴 리스트, 빨간 점)
- Modify: `app.js` (`bindUI()` 바인딩)
- Modify: `tools/verify.js` (`checkMenu()` 추가)

**Interfaces:**
- Consumes: 기존 `.sheetpop` / `.sheetpop-inner` / `.nbtn` / `.hlbtn` 스타일, `#hlpop`, `HL_KEY`
- Produces: DOM `#btnMenu`, `#btnMenuDot`, `#menupop`, `#miHl`, `#miNtc`, `#ntcDot`, `#miGuide`, `#menuClose`. `#btnHl` **제거**. Task 6이 `#miNtc`·`#ntcDot`·`#btnMenuDot`를 쓴다.

- [ ] **Step 1: 검증 함수 추가 (실패하는 테스트)**

`tools/verify.js`에 추가하고 `runAll()`의 `checks`를 `[checkParser, checkTitle, checkMenu]`로:

```javascript
function checkMenu() {
  const out = [];
  const $$ = id => document.getElementById(id);

  out.push({
    name: '메뉴 · 옛 톱니 버튼이 사라졌다',
    pass: !$$('btnHl') && !!$$('btnMenu'),
    detail: 'btnHl=' + !!$$('btnHl') + ' btnMenu=' + !!$$('btnMenu'),
  });

  const ids = ['menupop', 'miHl', 'miNtc', 'ntcDot', 'miGuide', 'menuClose', 'btnMenuDot'];
  const missing = ids.filter(id => !$$(id));
  out.push({ name: '메뉴 · 필요한 요소가 전부 있다', pass: missing.length === 0, detail: 'missing=' + JSON.stringify(missing) });

  out.push({
    name: '메뉴 · 가이드 링크가 guide.html을 가리킨다',
    pass: !!$$('miGuide') && $$('miGuide').getAttribute('href') === 'guide.html',
    detail: $$('miGuide') ? $$('miGuide').getAttribute('href') : 'no element',
  });

  /* 열기 → 하이라이트 → 메뉴는 닫히고 하이라이트가 열린다 */
  $$('btnMenu').click();
  const opened = !$$('menupop').hidden;
  $$('miHl').click();
  const swapped = $$('menupop').hidden && !$$('hlpop').hidden;
  $$('hlClose').click();
  out.push({ name: '메뉴 · 버튼을 누르면 열린다', pass: opened, detail: 'menupop.hidden=' + $$('menupop').hidden });
  out.push({ name: '메뉴 · 하이라이트 항목이 기존 팝업을 연다', pass: swapped, detail: 'menupop.hidden=' + $$('menupop').hidden + ' hlpop.hidden=' + $$('hlpop').hidden });

  /* 배경 탭으로 닫힌다 */
  $$('btnMenu').click();
  $$('menupop').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  out.push({ name: '메뉴 · 배경을 누르면 닫힌다', pass: $$('menupop').hidden, detail: 'hidden=' + $$('menupop').hidden });

  /* 점은 hidden 속성으로 숨겨지고 CSS가 이를 존중해야 한다 */
  $$('ntcDot').hidden = true;
  const dotHidden = getComputedStyle($$('ntcDot')).display === 'none';
  out.push({ name: '메뉴 · [hidden] 점이 실제로 안 보인다', pass: dotHidden, detail: 'display=' + getComputedStyle($$('ntcDot')).display });

  return out;
}
```

- [ ] **Step 2: 실패 확인**

프리뷰 새로고침 → 평가 → `runAll()`
Expected: `checkMenu (예외)` FAIL (`$$('btnMenu')` 가 null이라 `.click()`에서 예외). checkParser·checkTitle은 PASS 유지.

- [ ] **Step 3: index.html — 버튼 교체**

`.meta` 안의 `<button id="btnHl" ...>...</button>` 전체(톱니 SVG 포함)를 아래로 교체:

```html
<button id="btnMenu" class="hlbtn" type="button" aria-label="메뉴" title="메뉴" aria-haspopup="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg><span id="btnMenuDot" class="dot" hidden></span></button>
```

- [ ] **Step 4: index.html — 메뉴 시트 추가**

`<div id="hlpop" ...>` 블록 **앞에** 삽입:

```html
<div id="menupop" class="sheetpop" hidden>
  <div class="sheetpop-inner">
    <div class="hltitle">메뉴</div>
    <ul class="menulist">
      <li><button id="miHl" class="menuitem" type="button"><span class="mi-ico">🎨</span>개인 하이라이트 설정</button></li>
      <li><button id="miNtc" class="menuitem" type="button"><span class="mi-ico">📢</span>공지사항<span id="ntcDot" class="dot" hidden></span></button></li>
      <li><a id="miGuide" class="menuitem" href="guide.html"><span class="mi-ico">📖</span>설치 가이드 및 사용법</a></li>
    </ul>
    <button id="menuClose" class="nbtn hlclose" type="button">닫기</button>
  </div>
</div>
```

- [ ] **Step 5: styles.css — 메뉴 스타일 추가**

`.hlbtn{...}` 규칙 **바로 앞**에 `position:relative`를 얹기 위해, 파일 끝에 다음을 추가한다 (뒤에 오는 규칙이 이긴다):

```css
/* ===== 3줄 메뉴 ===== */
.hlbtn{position:relative}
.menulist{list-style:none;margin:0;padding:0;text-align:left}
.menulist li+li{margin-top:6px}
.menuitem{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;font:inherit;font-size:14.5px;color:#1f1e1c;text-decoration:none;background:#f4f2ec;border:0.5px solid #e2ded4;border-radius:10px;padding:12px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.menuitem:active{background:#e9e6dd}
.mi-ico{font-size:16px;line-height:1;flex:none}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#FF0000;margin-left:6px;flex:none}
.dot[hidden]{display:none}
#btnMenuDot{position:absolute;top:-1px;right:-1px;margin:0;width:6px;height:6px}
```

> `.dot[hidden]{display:none}`은 필수다. 자체 `display:inline-block`이 브라우저 기본 `[hidden]`을 이겨서, 없으면 점이 안 숨겨진다.

- [ ] **Step 6: app.js — 바인딩 교체**

`bindUI()`의 기존 하이라이트 바인딩:

```javascript
  $('btnHl').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(HL_KEY) || ''; } catch (e) {}
    $('hlInput').value = raw;
    $('hlpop').hidden = false;
  });
```

새로:

```javascript
  /* 3줄 메뉴 */
  const openMenu = () => { $('menupop').hidden = false; };
  const closeMenu = () => { $('menupop').hidden = true; };
  $('btnMenu').addEventListener('click', openMenu);
  $('menuClose').addEventListener('click', closeMenu);
  $('menupop').addEventListener('click', e => { if (e.target === $('menupop')) closeMenu(); });
  $('miHl').addEventListener('click', () => {
    closeMenu();
    let raw = ''; try { raw = localStorage.getItem(HL_KEY) || ''; } catch (e) {}
    $('hlInput').value = raw;
    $('hlpop').hidden = false;
  });
  /* 공지 항목은 Task 6에서 notices.js가 연결한다 */
```

- [ ] **Step 7: 구문검사 + 통과 확인**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && node --check app.js && node --check tools/verify.js && echo OK
```
Expected: `OK`

프리뷰 새로고침 → 평가 → `runAll()`
Expected: `ALL PASS (23)` — 4 + 12 + 7

- [ ] **Step 8: 눈으로 확인**

375×812로 리사이즈, `#btnMenu`를 클릭한 뒤 스크린샷.
Expected: 하단 시트에 3개 항목이 세로로 쌓이고, 가로 스크롤이 없다. 확인 후 닫고 데스크톱 폭 복귀.

- [ ] **Step 9: 커밋**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add index.html styles.css app.js tools/verify.js
git commit -m "feat(menu): 톱니 버튼을 3줄 메뉴로 교체

하이라이트 · 공지사항 · 설치 가이드 3개 항목을 하단 시트에 모은다.
공지 항목은 자리만 잡고 다음 커밋에서 연결.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 공지 데이터 계층 (`notices.js`)

fetch · 파싱 · 정렬 · 캐시 · 읽음 판정. UI는 아직 없다.

**Files:**
- Create: `notices.js`
- Modify: `index.html` (`<script src="notices.js">` 추가)
- Modify: `sw.js` (셸 목록 + 버전)
- Modify: `tools/verify.js` (`checkNoticeData()` 추가)

**Interfaces:**
- Consumes: `CONFIG.SHEET_ID`, `CONFIG.API_KEY` (app.js 전역)
- Produces:
  - `noticeState: {status, items, at}` — `status` ∈ `'loading' | 'ok' | 'empty' | 'no-tab' | 'stale' | 'error'`, `items: {date, title, body, _i}[]`, `at: Date | null`
  - `parseNotices(values: any[][]) → items[]` (날짜 내림차순, 동률 시 시트 행 순서)
  - `noticeDate(v) → 'YYYY-MM-DD' | ''`
  - `latestNoticeDate(items) → string`
  - `hasUnreadNotices(items) → boolean`
  - `markNoticesSeen(items) → void`
  - `fetchNotices() → Promise<{status, items}>`
  - `refreshNotices(force?: boolean) → Promise<void>`
  - `initNotices() → void`
  - `renderNoticeDot() → void` — Task 5에서는 빈 함수, Task 6에서 채운다
  - localStorage 키: `tt_notices`(캐시), `tt_notice_seen`(읽음)

- [ ] **Step 1: 검증 함수 추가 (실패하는 테스트)**

`tools/verify.js`에 추가하고 `runAll()`의 `checks`를 `[checkParser, checkTitle, checkMenu, checkNoticeData]`로:

```javascript
function checkNoticeData() {
  const out = [];

  /* 정렬: 날짜 내림차순, 동률이면 시트 행 순서 유지 */
  const sorted = parseNotices([
    ['2026-08-01', '가장 오래됨', 'a'],
    ['2026-08-12', '같은 날 첫째', 'b'],
    ['2026-08-12', '같은 날 둘째', 'c'],
    ['2026-08-05', '중간', 'd'],
  ]).map(n => n.title);
  out.push({
    name: '공지 · 날짜 내림차순 + 동률은 행 순서',
    pass: JSON.stringify(sorted) === JSON.stringify(['같은 날 첫째', '같은 날 둘째', '중간', '가장 오래됨']),
    detail: JSON.stringify(sorted),
  });

  /* 빈 행과 공백 행은 버린다 */
  const cleaned = parseNotices([['2026-08-12', '살아남음', ''], ['', '', ''], [null, null, null]]);
  out.push({ name: '공지 · 빈 행을 버린다', pass: cleaned.length === 1, detail: 'len=' + cleaned.length });

  /* 시리얼 숫자로 와도 YYYY-MM-DD로 정규화 */
  out.push({
    name: '공지 · 날짜 시리얼을 정규화한다',
    pass: noticeDate(46246) === '2026-08-12' && noticeDate('2026-08-12') === '2026-08-12' && noticeDate(null) === '',
    detail: noticeDate(46246) + ' / ' + noticeDate('2026-08-12') + ' / "' + noticeDate(null) + '"',
  });

  /* 읽음 판정 */
  const items = parseNotices([['2026-08-12', 'x', ''], ['2026-08-01', 'y', '']]);
  localStorage.removeItem('tt_notice_seen');
  const beforeSeen = hasUnreadNotices(items);
  markNoticesSeen(items);
  const afterSeen = hasUnreadNotices(items);
  const withNewer = hasUnreadNotices(parseNotices([['2026-08-20', 'z', '']]));
  out.push({
    name: '공지 · 읽음 처리 후 안읽음이 사라지고 새 항목엔 다시 뜬다',
    pass: beforeSeen === true && afterSeen === false && withNewer === true,
    detail: [beforeSeen, afterSeen, withNewer].join(' / '),
  });
  out.push({ name: '공지 · 아는 공지가 없으면 안읽음이 아니다', pass: hasUnreadNotices([]) === false, detail: String(hasUnreadNotices([])) });

  /* 상태 계약 */
  out.push({
    name: '공지 · noticeState 초기 형태',
    pass: !!noticeState && Array.isArray(noticeState.items)
       && ['loading', 'ok', 'empty', 'no-tab', 'stale', 'error'].indexOf(noticeState.status) >= 0,
    detail: JSON.stringify({ status: noticeState.status, n: noticeState.items.length }),
  });

  return out;
}
```

- [ ] **Step 2: 실패 확인**

프리뷰 새로고침 → 평가 → `runAll()`
Expected: `checkNoticeData (예외)` FAIL (`parseNotices is not defined`). 앞선 23개는 PASS 유지.

- [ ] **Step 3: `notices.js` 작성**

```javascript
/* =========================================================
   공지사항 — 시간표와 완전히 분리된 데이터 경로.
   시간표는 includeGridData(대용량)로 읽지만 공지는 values.get(~2KB)이라
   서로의 실패에 영향을 주지 않는다. 이 파일의 예외는 전부 자체적으로 삼킨다.
   ========================================================= */
'use strict';

const NOTICE = {
  TAB: '공지',
  RANGE: 'A2:C100',
  CACHE_KEY: 'tt_notices',
  SEEN_KEY: 'tt_notice_seen',
  MIN_REFETCH_MS: 1800000,   // 30분 — 공지는 자주 바뀌지 않는다
  TIMEOUT_MS: 8000,
  SHOW_EXPANDED: 5,          // 펼쳐 보여줄 최신 개수
};

/* status 계약
   loading : 아직 아무 데이터 없음 (첫 요청 진행 중)
   ok      : 라이브 성공, 항목 있음
   empty   : 라이브 성공, 항목 0 → "아직 공지가 없어요"
   no-tab  : 공지 탭 없음(HTTP 400/404) → "아직 공지가 없어요"
   stale   : 라이브 실패했지만 캐시가 있음 → 목록 + 마지막 확인 시각
   error   : 라이브 실패 + 캐시 없음 → "불러오지 못했어요"
   '없음'과 '못 읽음'을 절대 같은 값으로 흘리지 않는다. */
const noticeState = { status: 'loading', items: [], at: null };

let noticeLastOk = 0;

/* 시트 시리얼(A열이 날짜 서식일 때) 또는 문자열 → 'YYYY-MM-DD' */
function noticeDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date((v - 25569) * 86400000).toISOString().slice(0, 10);
  }
  return String(v == null ? '' : v).trim();
}

/* 시트 행 배열 → 정렬된 공지 항목. 날짜·제목이 둘 다 비면 버린다. */
function parseNotices(values) {
  const items = (values || []).map((row, i) => ({
    date: noticeDate(row && row[0]),
    title: String(row && row[1] != null ? row[1] : '').trim(),
    body: String(row && row[2] != null ? row[2] : '').trim(),
    _i: i,
  })).filter(n => n.date || n.title);
  /* 날짜 내림차순. ISO 문자열이라 사전순 = 시간순. 동률이면 시트 행 순서 유지. */
  items.sort((a, b) => (a.date === b.date ? a._i - b._i : (a.date < b.date ? 1 : -1)));
  return items;
}

function latestNoticeDate(items) {
  return (items || []).reduce((mx, n) => (n.date > mx ? n.date : mx), '');
}
function noticeSeen() {
  try { return localStorage.getItem(NOTICE.SEEN_KEY) || ''; } catch (e) { return ''; }
}
function markNoticesSeen(items) {
  const d = latestNoticeDate(items);
  if (d) { try { localStorage.setItem(NOTICE.SEEN_KEY, d); } catch (e) {} }
}
/* 빨간 점 판정은 '아는 공지'(라이브 또는 캐시)만 근거로 한다.
   아는 게 없으면 안읽음이 아니다 — 로드 실패를 '새 공지 있음'으로 둔갑시키지 않는다. */
function hasUnreadNotices(items) {
  const d = latestNoticeDate(items);
  return !!d && d > noticeSeen();
}

function readNoticeCache() {
  try {
    const o = JSON.parse(localStorage.getItem(NOTICE.CACHE_KEY) || 'null');
    return (o && Array.isArray(o.items)) ? o : null;
  } catch (e) { return null; }
}
function writeNoticeCache(items) {
  try {
    localStorage.setItem(NOTICE.CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), items }));
  } catch (e) {}
}

function noticeUrl() {
  return 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SHEET_ID +
    '/values/' + encodeURIComponent(NOTICE.TAB + '!' + NOTICE.RANGE) +
    '?key=' + CONFIG.API_KEY;
}

async function fetchNotices() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NOTICE.TIMEOUT_MS);
  try {
    const res = await fetch(noticeUrl(), { signal: ctrl.signal, cache: 'no-store' });
    /* 없는 탭을 부르면 400 'Unable to parse range' — 실패가 아니라 '탭 없음'이다 */
    if (res.status === 400 || res.status === 404) return { status: 'no-tab', items: [] };
    if (!res.ok) return { status: 'error', items: [] };
    const json = await res.json();
    const items = parseNotices(json && json.values);
    return { status: items.length ? 'ok' : 'empty', items };
  } catch (e) {
    return { status: 'error', items: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function refreshNotices(force) {
  if (!force && noticeLastOk && Date.now() - noticeLastOk < NOTICE.MIN_REFETCH_MS) return;
  const r = await fetchNotices();
  if (r.status === 'ok' || r.status === 'empty') {
    noticeLastOk = Date.now();
    noticeState.status = r.status;
    noticeState.items = r.items;
    noticeState.at = new Date();
    writeNoticeCache(r.items);
  } else if (r.status === 'no-tab') {
    noticeState.status = 'no-tab';
    noticeState.items = [];
    noticeState.at = new Date();
  } else {
    const c = readNoticeCache();
    noticeState.status = c ? 'stale' : 'error';
    noticeState.items = c ? c.items : [];
    noticeState.at = c ? new Date(c.at) : null;
  }
  renderNoticeDot();
  renderNoticePanel();
}

function initNotices() {
  const c = readNoticeCache();
  if (c) {   /* 오프라인에서도 마지막 공지가 즉시 보인다 */
    noticeState.status = 'stale';
    noticeState.items = c.items;
    noticeState.at = new Date(c.at);
  }
  renderNoticeDot();
  refreshNotices(true);
}

/* UI는 Task 6에서 채운다 — 지금은 호출만 안전하게 받아둔다 */
function renderNoticeDot() {}
function renderNoticePanel() {}
```

- [ ] **Step 4: index.html에 스크립트 추가**

기존:

```html
<script src="app.js"></script>
```

새로 (**notices.js가 먼저**: app.js 끝에서 `main()`이 즉시 실행되며 `initNotices()`를 부른다):

```html
<script src="notices.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 5: app.js에서 초기화 호출**

`main()` 안, `refreshLive();` 줄 **다음**에 추가:

```javascript
  /* 공지는 시간표와 독립적으로 로드 — 실패해도 시간표에 영향 없음 */
  initNotices();
```

`main()` 안의 `visibilitychange` 리스너를 교체 — 기존:

```javascript
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CONFIG.API_KEY) refreshLive(); });
```

새로:

```javascript
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !CONFIG.API_KEY) return;
    refreshLive();
    refreshNotices(false);   /* 마지막 성공이 30분 넘었을 때만 실제로 나간다 */
  });
```

- [ ] **Step 6: sw.js 갱신**

```javascript
const VERSION = 'v11';
```
→
```javascript
const VERSION = 'v12';
```

```javascript
  './', 'index.html', 'styles.css', 'app.js', 'manifest.json',
```
→
```javascript
  './', 'index.html', 'styles.css', 'app.js', 'notices.js', 'manifest.json',
```

- [ ] **Step 7: 구문검사 + 통과 확인**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && node --check notices.js && node --check app.js && node --check sw.js && node --check tools/verify.js && echo OK
```
Expected: `OK`

프리뷰 새로고침 → 평가 → `runAll()`
Expected: `ALL PASS (29)` — 4 + 12 + 7 + 6

- [ ] **Step 8: 실제 호출 상태 확인**

페이지 컨텍스트에서 평가:
```javascript
fetchNotices().then(r => JSON.stringify({ status: r.status, n: r.items.length }))
```
Expected: GY가 Task 1을 실행했으면 `{"status":"ok","n":1}`, 아직이면 `{"status":"no-tab","n":0}`. **둘 다 정상 결과다** — `error`가 나오면 안 된다.

- [ ] **Step 9: 커밋**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add notices.js index.html app.js sw.js tools/verify.js
git commit -m "feat(notices): 공지 데이터 계층 — 별도 values.get + 캐시 + 읽음 판정

시간표와 완전히 분리된 호출이라 서로의 실패에 영향받지 않는다.
'탭 없음'(400)과 '불러오기 실패'를 다른 상태로 구분한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 공지 패널 + 빨간 점

**Files:**
- Modify: `index.html` (공지 시트 마크업)
- Modify: `styles.css` (공지 목록)
- Modify: `notices.js` (`renderNoticeDot`/`renderNoticePanel`/`openNotices`/`bindNotices` 구현)
- Modify: `app.js` (`bindUI()`에서 `#miNtc` 연결)
- Modify: `tools/verify.js` (`checkNoticeUI()` 추가)

**Interfaces:**
- Consumes: Task 4의 `#miNtc`·`#ntcDot`·`#btnMenuDot`, Task 5의 `noticeState`·`hasUnreadNotices`·`markNoticesSeen`·`NOTICE.SHOW_EXPANDED`
- Produces: DOM `#ntcpop`, `#ntcBody`, `#ntcClose`. 전역 `openNotices() → void`, `bindNotices() → void`. Task 5의 빈 `renderNoticeDot()`/`renderNoticePanel()`을 실제 구현으로 대체.

- [ ] **Step 1: 검증 함수 추가 (실패하는 테스트)**

`tools/verify.js`에 추가하고 `runAll()`의 `checks`에 `checkNoticeUI`를 더한다:

```javascript
function checkNoticeUI() {
  const out = [];
  const $$ = id => document.getElementById(id);
  const save = { status: noticeState.status, items: noticeState.items, at: noticeState.at };
  /* openNotices()가 refreshNotices()를 부른다 — 비동기 응답이 어서션 뒤에 noticeState를
     덮어써 테스트가 들쭉날쭉해지지 않도록, 테스트 동안 스텁으로 갈아끼운다.
     최상위 function 선언은 전역 객체의 쓰기 가능한 속성이라 이 교체가 실제로 먹는다. */
  const realRefresh = window.refreshNotices;
  window.refreshNotices = async () => {};
  const setState = (status, items, at) => {
    noticeState.status = status; noticeState.items = items; noticeState.at = at || null;
    renderNoticePanel(); renderNoticeDot();
  };
  const text = () => $$('ntcBody').textContent;

  out.push({ name: '공지UI · 패널 요소가 있다', pass: !!$$('ntcpop') && !!$$('ntcBody') && !!$$('ntcClose'), detail: '' });

  /* 상태별 문구 — '없음'과 '못 읽음'이 구분돼야 한다 */
  setState('empty', []);
  const emptyMsg = text().indexOf('아직 공지가 없어요') >= 0;
  setState('no-tab', []);
  const noTabMsg = text().indexOf('아직 공지가 없어요') >= 0;
  setState('error', []);
  const errMsg = text().indexOf('불러오지 못했어요') >= 0;
  out.push({ name: '공지UI · 빈 공지와 탭 없음은 "없어요"', pass: emptyMsg && noTabMsg, detail: 'empty=' + emptyMsg + ' noTab=' + noTabMsg });
  out.push({ name: '공지UI · 로드 실패는 "불러오지 못했어요"', pass: errMsg, detail: text().slice(0, 40) });

  /* 실패 상태에서는 점이 뜨지 않는다 */
  localStorage.removeItem('tt_notice_seen');
  setState('error', []);
  out.push({ name: '공지UI · 실패 시 빨간 점이 안 뜬다', pass: $$('ntcDot').hidden && $$('btnMenuDot').hidden, detail: 'ntcDot=' + $$('ntcDot').hidden + ' btnDot=' + $$('btnMenuDot').hidden });

  /* stale: 목록 + 마지막 확인 */
  const two = parseNotices([['2026-08-12', '최신 공지', '내용1'], ['2026-08-01', '옛 공지', '내용2']]);
  setState('stale', two, new Date('2026-08-11T09:00:00+09:00'));
  out.push({ name: '공지UI · 캐시 표시에 마지막 확인이 붙는다', pass: text().indexOf('마지막 확인') >= 0 && text().indexOf('최신 공지') >= 0, detail: text().slice(0, 60) });

  /* ok: 목록 + 안읽음 점 */
  setState('ok', two, new Date());
  const dotOn = !$$('ntcDot').hidden && !$$('btnMenuDot').hidden;
  const ordered = text().indexOf('최신 공지') < text().indexOf('옛 공지');
  out.push({ name: '공지UI · 새 공지에 점이 뜬다', pass: dotOn, detail: 'ntcDot=' + $$('ntcDot').hidden + ' btnDot=' + $$('btnMenuDot').hidden });
  out.push({ name: '공지UI · 최신이 위에 온다', pass: ordered, detail: 'ordered=' + ordered });

  /* 열면 읽음 처리 → 점이 사라진다 */
  openNotices();
  const opened = !$$('ntcpop').hidden;
  const dotOff = $$('ntcDot').hidden && $$('btnMenuDot').hidden;
  $$('ntcClose').click();
  out.push({ name: '공지UI · 열면 열리고 읽음 처리된다', pass: opened && dotOff, detail: 'opened=' + opened + ' dotOff=' + dotOff });

  /* 6개 이상이면 접힌다 */
  const many = parseNotices([
    ['2026-08-17', 'n7', ''], ['2026-08-16', 'n6', ''], ['2026-08-15', 'n5', ''],
    ['2026-08-14', 'n4', ''], ['2026-08-13', 'n3', ''], ['2026-08-12', 'n2', ''], ['2026-08-11', 'n1', ''],
  ]);
  setState('ok', many, new Date());
  const moreBtn = $$('ntcBody').querySelector('.ntcmore');
  const shownBefore = $$('ntcBody').querySelectorAll('.ntcitem').length;
  if (moreBtn) moreBtn.click();
  const shownAfter = $$('ntcBody').querySelectorAll('.ntcitem').length;
  out.push({
    name: '공지UI · 5개 펼침 + 더 보기로 전체',
    pass: !!moreBtn && shownBefore === 5 && shownAfter === 7,
    detail: 'more=' + !!moreBtn + ' before=' + shownBefore + ' after=' + shownAfter,
  });

  window.refreshNotices = realRefresh;
  setState(save.status, save.items, save.at);
  return out;
}
```

- [ ] **Step 2: 실패 확인**

프리뷰 새로고침 → 평가 → `runAll()`
Expected: `checkNoticeUI (예외)` FAIL (`ntcBody`가 null). 앞선 29개는 PASS 유지.

- [ ] **Step 3: index.html — 공지 시트 추가**

`<div id="hlpop" ...>` 블록 **뒤에** 삽입:

```html
<div id="ntcpop" class="sheetpop" hidden>
  <div class="sheetpop-inner">
    <div class="hltitle">공지사항</div>
    <div id="ntcBody" class="ntclist"></div>
    <button id="ntcClose" class="nbtn hlclose" type="button">닫기</button>
  </div>
</div>
```

- [ ] **Step 4: styles.css — 공지 스타일 추가**

파일 끝에 추가:

```css
/* ===== 공지사항 ===== */
.ntclist{text-align:left;max-height:52vh;overflow-y:auto;-webkit-overflow-scrolling:touch}
.ntcitem{padding:10px 0;border-bottom:0.5px solid #e6e2d9}
.ntcitem:last-child{border-bottom:0}
.ntcdate{font-size:11px;color:#8a897f;font-variant-numeric:tabular-nums}
.ntctitle{font-size:14px;font-weight:600;margin-top:2px}
.ntcbody{font-size:13px;color:#4a4945;line-height:1.55;margin-top:3px;white-space:pre-wrap;word-break:break-word}
.ntcmsg{font-size:13px;color:#73726c;padding:16px 0;text-align:center;line-height:1.6}
.ntcmore{display:block;width:100%;font:inherit;font-size:13px;color:#73726c;background:none;border:0;padding:10px 0;cursor:pointer}
```

- [ ] **Step 5: notices.js — UI 구현**

파일 끝의 빈 스텁 두 개를 아래로 교체:

```javascript
/* ===== UI ===== */
let noticeExpanded = false;   /* '더 보기'를 눌렀는지 (패널 닫으면 초기화) */

function noticeStatusMessage() {
  switch (noticeState.status) {
    case 'loading': return '공지를 불러오는 중이에요…';
    case 'empty':
    case 'no-tab':  return '아직 공지가 없어요.';
    case 'error':   return '공지를 불러오지 못했어요.\n인터넷 연결을 확인하고 다시 열어보세요.';
    default:        return '';
  }
}

function renderNoticePanel() {
  const body = document.getElementById('ntcBody');
  if (!body) return;
  body.innerHTML = '';

  if (!noticeState.items.length) {
    const msg = document.createElement('div');
    msg.className = 'ntcmsg';
    msg.textContent = noticeStatusMessage();
    body.appendChild(msg);
    return;
  }

  const all = noticeState.items;
  const shown = noticeExpanded ? all : all.slice(0, NOTICE.SHOW_EXPANDED);
  for (const n of shown) {
    const item = document.createElement('div');
    item.className = 'ntcitem';
    if (n.date) {
      const d = document.createElement('div');
      d.className = 'ntcdate'; d.textContent = n.date;
      item.appendChild(d);
    }
    if (n.title) {
      const t = document.createElement('div');
      t.className = 'ntctitle'; t.textContent = n.title;
      item.appendChild(t);
    }
    if (n.body) {
      const b = document.createElement('div');
      b.className = 'ntcbody'; b.textContent = n.body;
      item.appendChild(b);
    }
    body.appendChild(item);
  }

  if (!noticeExpanded && all.length > NOTICE.SHOW_EXPANDED) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ntcmore';
    more.textContent = '이전 공지 ' + (all.length - NOTICE.SHOW_EXPANDED) + '개 더 보기';
    more.addEventListener('click', () => { noticeExpanded = true; renderNoticePanel(); });
    body.appendChild(more);
  }

  /* 캐시를 보여주는 중이면 언제 확인한 것인지 밝힌다 */
  if (noticeState.status === 'stale' && noticeState.at) {
    const at = document.createElement('div');
    at.className = 'ntcmsg';
    at.textContent = '마지막 확인 ' +
      noticeState.at.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
    body.appendChild(at);
  }
}

function renderNoticeDot() {
  const unread = hasUnreadNotices(noticeState.items);
  const a = document.getElementById('ntcDot');
  const b = document.getElementById('btnMenuDot');
  if (a) a.hidden = !unread;
  if (b) b.hidden = !unread;
}

function openNotices() {
  noticeExpanded = false;
  renderNoticePanel();
  document.getElementById('ntcpop').hidden = false;
  markNoticesSeen(noticeState.items);
  renderNoticeDot();
  refreshNotices(false);   /* 열 때 갱신 시도 — 30분 스로틀에 걸리면 조용히 넘어간다 */
}

function bindNotices() {
  const pop = document.getElementById('ntcpop');
  document.getElementById('ntcClose').addEventListener('click', () => { pop.hidden = true; });
  pop.addEventListener('click', e => { if (e.target === pop) pop.hidden = true; });
}
```

- [ ] **Step 6: app.js — 메뉴 항목 연결**

`bindUI()`의 `/* 공지 항목은 Task 6에서 notices.js가 연결한다 */` 주석을 교체:

```javascript
  $('miNtc').addEventListener('click', () => { closeMenu(); openNotices(); });
  bindNotices();
```

- [ ] **Step 7: 구문검사 + 통과 확인**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && node --check notices.js && node --check app.js && node --check tools/verify.js && echo OK
```
Expected: `OK`

프리뷰 새로고침 → 평가 → `runAll()`
Expected: `ALL PASS (38)` — 4 + 12 + 7 + 6 + 9

- [ ] **Step 8: 시간표 격리 확인**

공지 호출을 강제로 실패시켜도 시간표가 멀쩡한지 확인한다. 페이지 컨텍스트에서 평가:

```javascript
(async () => {
  const real = window.fetch;
  window.fetch = (u, o) => (String(u).indexOf('/values/') >= 0 ? Promise.reject(new Error('forced')) : real(u, o));
  localStorage.removeItem('tt_notices');
  noticeState.items = []; noticeState.status = 'loading';
  await refreshNotices(true);
  const r = {
    noticeStatus: noticeState.status,
    dotHidden: document.getElementById('btnMenuDot').hidden,
    weeks: state.weeks.length,
    title: document.getElementById('titleMain').textContent,
    cells: document.querySelectorAll('#grid .cell, #grid > div').length > 0,
  };
  window.fetch = real;
  return JSON.stringify(r);
})()
```
Expected: `noticeStatus:"error"`, `dotHidden:true`, `weeks:49`, 제목 정상, `cells:true`. 즉 **공지가 죽어도 시간표는 산다.**

- [ ] **Step 9: 모바일 눈확인**

375×812로 리사이즈 → `#btnMenu` 클릭 → `#miNtc` 클릭 → 스크린샷.
Expected: 공지 목록이 읽히고 가로 스크롤이 없다. 확인 후 닫고 데스크톱 폭 복귀.

- [ ] **Step 10: 커밋**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add index.html styles.css notices.js app.js tools/verify.js
git commit -m "feat(notices): 공지 패널 + 안읽음 빨간 점

최신 5개 펼침 + 더 보기. 실패 시 점을 띄우지 않고 캐시엔 마지막 확인 시각을 붙인다.
공지 호출을 강제 실패시켜도 시간표 렌더가 영향받지 않음을 확인.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 가이드 문구 · 종단 검증 · 배포

**Files:**
- Modify: `guide.html` (205행·207행의 `⚙`, 사용법 표에 메뉴 행)

**Interfaces:**
- Consumes: 앞선 모든 Task의 산출물
- Produces: 배포된 `https://pureart-art.github.io/Timetable26-1/`

- [ ] **Step 1: guide.html 205행 교체**

기존:

```html
    <p class="why">시간표 상단 갱신시각 옆의 <span class="k">⚙</span> 버튼을 누르면, 내가 넣은 이름/키워드가 든 줄만 <b class="warn">빨갛게</b> 보여요.
```

새로 (뒷부분 `<b>이 기기에서만</b>…` 이후는 그대로 둔다):

```html
    <p class="why">시간표 상단 갱신시각 옆의 <span class="k">☰</span> 버튼을 누르고 <b>개인 하이라이트 설정</b>을 고르면, 내가 넣은 이름/키워드가 든 줄만 <b class="warn">빨갛게</b> 보여요.
```

- [ ] **Step 2: guide.html 207행 교체**

기존:

```html
      <li>시간표 상단 <b>갱신시각 옆 <span class="k">⚙</span></b> 버튼을 누른다.</li>
```

새로:

```html
      <li>시간표 상단 <b>갱신시각 옆 <span class="k">☰</span></b> 버튼을 누르고 <b>개인 하이라이트 설정</b>을 고른다.</li>
```

- [ ] **Step 3: guide.html 사용법 표에 메뉴 행 추가**

`<tr><td>색</td>…</tr>` 행 **다음**에 삽입:

```html
      <tr><td>☰ 메뉴</td><td><b>새로 생겼어요!</b> 상단 갱신시각 옆 3줄 버튼 — <b>개인 하이라이트 설정</b> · <b>공지사항</b>(앱/위젯 업데이트 내역) · <b>설치 가이드</b>. 새 공지가 있으면 <span class="warn">빨간 점</span>이 떠요</td></tr>
```

- [ ] **Step 4: `⚙` 잔재 확인**

Run:
```bash
cd /c/Users/wbnuj/timetable-pwa && grep -c "⚙" guide.html ; grep -rn "btnHl" . --include=*.html --include=*.js --exclude-dir=.git --exclude-dir=docs ; echo "done"
```
Expected: `0`, 그리고 `btnHl` 매치 없음

- [ ] **Step 5: 전체 검증 재실행**

프리뷰 새로고침 → `tools/verify.js` 평가 → `runAll()`
Expected: `ALL PASS (38)`

위젯 하니스(`C:\Users\wbnuj\.claude\skills\deploying-timetable-pwa\widget-mock-harness.js`)를 붙여넣어 실행.
Expected: 4개 크기 전부 `errTexts` 비고 `set = true`

- [ ] **Step 6: 공휴일 회귀 확인**

페이지 컨텍스트에서 평가:
```javascript
JSON.stringify(state.weeks.flatMap((w, i) =>
  w.holidays.map((h, d) => (h ? new Date((w.monday + d - 25569) * 86400000).toISOString().slice(0, 10) : null)).filter(Boolean)))
```
Expected: `2026-05-01, 2026-05-05, 2026-05-24, 2026-05-25, 2026-06-03, 2026-06-06, 2026-07-17, 2026-08-15, 2026-08-17, 2026-09-24, 2026-09-25, 2026-09-26, 2026-10-03, 2026-10-05, 2026-10-09, 2026-12-25, 2027-01-01, 2027-02-06, 2027-02-07, 2027-02-08, 2027-02-09, 2027-03-01`

- [ ] **Step 7: 커밋 + push**

```bash
cd /c/Users/wbnuj/timetable-pwa
git add guide.html
git commit -m "docs(guide): 톱니 → 3줄 메뉴 문구 + 사용법에 메뉴 행 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git pull --rebase origin main
git push origin main
```
Expected: rebase가 깨끗하게 통과(스냅샷 Action은 `data/snapshot.js`만 건드린다), push 성공

- [ ] **Step 8: 배포 확인**

Run (시도마다 **다른** 캐시버스터를 쓴다 — 같은 값을 재사용하면 CDN이 미스를 캐시한다):
```bash
curl -fsSL "https://pureart-art.github.io/Timetable26-1/notices.js?r=$(date +%s)" | head -3
curl -fsSL "https://pureart-art.github.io/Timetable26-1/index.html?r=$(date +%s)" | grep -c "btnMenu"
```
Expected: `notices.js` 헤더 주석이 보이고, `index.html`의 `btnMenu` 카운트가 1 이상. 2~3분 내 반영 안 되면 `gh run list`로 빌드를 확인하고, 멈췄으면 빈 커밋으로 재촉발한다.

- [ ] **Step 9: 배포본 육안 확인**

`preview_start` with `{url: "https://pureart-art.github.io/Timetable26-1/"}` → 375×812 → 3줄 메뉴 → 공지사항 열어 스크린샷.
Expected: 제목이 `의학과 26-1 시간표: <현재 주차>`, 메뉴 3항목, 공지 목록 정상

- [ ] **Step 10: GY에게 공지 초안 전달**

배포가 확인되면 GY에게 아래 초안을 전달하고, 검수 후 시트 `공지` 탭에 직접 입력(또는 Task 1이 넣어둔 2행을 수정)하도록 안내한다.

| 날짜 | 제목 | 내용 |
|---|---|---|
| (배포일) | 2학기 시간표 반영 | 2학기 일정이 들어갔어요. 상단 톱니 버튼이 3줄 메뉴로 바뀌었고, 공지사항이 생겼어요. |

개인정보·이름·학번·연락처·내부 링크는 넣지 않는다.

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | Task |
|---|---|
| A. 시트 — 주 블록 (완료) | — (GY 완료, Task 2 Step 7에서 49주 검증) |
| A. 시트 — 공지 탭 생성 | Task 1 |
| B. 날짜 교정 안전장치 (app + 위젯) | Task 2 |
| C. 학기 · 제목 (SEMESTERS, 4개 뷰) | Task 3 |
| C. 라벨 폴백 제거 | Task 2 |
| C. 앱 이름 유지 | Global Constraints |
| D. 3줄 메뉴 · 3항목 · 시트 UI | Task 4 |
| D. 하이라이트 재사용 · 가이드 링크 | Task 4 |
| D. guide.html `⚙` 수정 | Task 7 |
| E. 공지 데이터 · 별도 호출 · 캐시 · 읽음 | Task 5 |
| E. 공지 6개 상태 구분 | Task 5(계약) + Task 6(문구) |
| E. 빨간 점 (햄버거 + 메뉴 항목) | Task 6 |
| E. 최신 5개 + 더 보기 | Task 6 |
| E. 작성 흐름 / 노출 규칙 | Task 7 Step 10 |
| 검증 — 49주 · 회귀 대조 · 제목 실측 · 공휴일 | Task 2, 3, 7 |
| 검증 — 공지 4상태 · 격리 | Task 5 Step 8, Task 6 Step 1·8 |
| 검증 — 375px · 위젯 하니스 | Task 3, 4, 6, 7 |
| 배포 — pull --rebase · 유니크 캐시버스터 | Task 7 |
| sw.js 캐시 버전 | Task 5 Step 6 |

빠진 항목 없음.

**2. 플레이스홀더**: 없음. 모든 코드 블록이 실제 내용이고, 모든 명령이 실행 가능한 형태다.

**3. 타입 일관성**
- `noticeState.status` 6개 값이 Task 5 계약 · Task 5 검증 · Task 6 문구에서 동일하게 쓰인다.
- `parseNotices` 반환 항목의 필드명 `date/title/body/_i`가 Task 5·6에서 일치한다.
- `setTitle(label, semName)` 인자 순서가 Task 3의 정의와 4개 호출 지점에서 일치한다.
- `renderNoticeDot()`/`renderNoticePanel()`은 Task 5에서 빈 함수로 선언되고 Task 6에서 같은 이름으로 대체된다 — `refreshNotices()`가 둘 다 호출하므로 Task 5 시점에도 정의돼 있어야 한다.
- `closeMenu`는 Task 4에서 `bindUI()` 지역 `const`로 선언되고 Task 6 Step 6이 같은 함수 안에서 쓴다 — 스코프 일치.
- 누적 검증 개수: 4 → 16 → 23 → 29 → 38 (checkParser 4 · checkTitle 12 · checkMenu 7 · checkNoticeData 6 · checkNoticeUI 9). 각 Task의 기대값과 일치.
- `openNotices()`가 `refreshNotices(false)`를 부르므로, `checkNoticeUI`는 테스트 중 이 함수를 스텁으로 갈아끼워 비동기 응답이 어서션 뒤에 상태를 덮어쓰지 않게 한다 (Task 6 Step 1).
