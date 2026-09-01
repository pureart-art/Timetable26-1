# timetable-sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학과 공식 시간표(.xlsx)가 바뀌면 GY의 구글 시트에 자동 반영하고, 결과를 PWA 버전 배지·공지·카톡까지 흘려보낸다.

**Architecture:** csmedst20224181 계정 소유 standalone Apps Script 프로젝트가 15분마다 공식 파일의 `md5Checksum`을 확인하고, 바뀐 실행에서만 네이티브 사본으로 변환→파싱→재조립→diff→쓰기를 한다. 파싱·재조립·diff는 GAS API를 쓰지 않는 순수 함수라 Node에서 그대로 테스트된다. 코드 정본은 로컬 git이고 clasp로 GAS에 push한다.

**Tech Stack:** Google Apps Script (V8) · Drive API v3 고급 서비스 · SpreadsheetApp · clasp · Node 24 `node:test` (의존성 0)

**Spec:** `C:\Users\wbnuj\timetable-pwa\docs\superpowers\specs\2026-09-01-timetable-sync-design.md`

## Global Constraints

- 공식 파일 ID: `1hpMg-jQrcDvm6gOwA84Ad2sa6WgU0JqQ` (업로드된 .xlsx, 33자)
- GY 시트 ID: `1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4` (네이티브, 44자, 소유 `sbfpo4@gmail.com`)
- GAS 실행 계정: **csmedst20224181@gmail.com** — 공식 파일이 이 계정에만 공유됨
- 코드 정본: `C:\claude\timetable-sync\` (git). GAS에는 clasp로 push
- 메모 마커: **`#`** (줄 시작). 현재 시트 2,046칸/3,161줄에서 0회 등장
- 학습부 블록 글자색: **`#2E75B5`** (메모리의 `#2E75B6`은 오기)
- 시험 글자색: `#FF0000` · 메모 줄 색: `#808080`
- 조인 키: **날짜 + 교시** (행 번호 금지)
- 무접촉: 26-1 전체(rowData idx 0~241) · 토·일 열(H·I) · 점심 행 · 저녁 행 · `#` 줄 · `공지` 탭 기존 행
- 가드레일: 값 40칸 / 병합 8건 / 삭제 10칸 / 미등록 5건 / 주차 수 변동
- 공지 탭 날짜는 **반드시 ISO 문자열** `2026-09-03` (표시 서식 `2026. 9. 3`은 `tt_notice_seen`을 영구 오염시킴)
- 시크릿(카카오 REST 키·refresh token)은 **스크립트 속성에만**. git·백업·채팅 금지
- 첫 2주는 dry-run: 쓰기 없음, v-bump 없음

---

## File Structure

```
C:\claude\timetable-sync\
  .gitignore              시크릿·임시파일 제외
  .clasp.json             scriptId (비밀 아님, 커밋함)
  .claspignore            test/·tools/·문서는 push 제외
  appsscript.json         V8·Seoul·Drive v3 고급서비스
  src/
    config.js             ID 상수, 스크립트 속성 접근자
    parse.js              공식 → IR             (순수, Node 테스트)
    compose.js            IR + 매핑 → 셀 목표값  (순수, Node 테스트)
    diff.js               현재 vs 목표 → 변경목록 + 가드레일 (순수)
    io.js                 Drive/Sheets 읽기·백업·쓰기
    notify.js             카톡·Gmail·공지 탭·v-bump
    diagnose.js           상설 진단
    Code.js               tick() 오케스트레이션
  test/
    parse.test.js
    compose.test.js
    diff.test.js
    fixtures/
      gy-sheet.json       GY 시트 스냅샷에서 추출한 골든 픽스처
      official.json       Phase 0에서 얻은 공식 구조 픽스처
  tools/
    make-gy-fixture.js    timetable-pwa/data/snapshot.js → fixtures/gy-sheet.json
  SETUP.md
  README.md
```

**GAS와 Node 양쪽에서 도는 방법**: 순수 모듈은 `.js`로 쓰고(clasp가 push 시 `.gs`로 변환), 파일 끝에 다음을 붙인다. GAS에서는 `module`이 undefined라 무시되고, Node에서는 export가 된다.

```js
if (typeof module !== 'undefined') module.exports = { fnA, fnB };
```

GAS는 모든 파일이 전역 스코프를 공유하므로 `require` 없이 서로 호출된다.

---

## Task 1: 스캐폴드 + clasp 연결 + diagnose() — **게이트**

이 태스크는 스펙 §12의 미결 5건을 확정한다. **결과를 보기 전에는 Task 4(parse) 이후를 시작하지 않는다.**

**Files:**
- Create: `C:\claude\timetable-sync\.gitignore`
- Create: `C:\claude\timetable-sync\appsscript.json`
- Create: `C:\claude\timetable-sync\.claspignore`
- Create: `C:\claude\timetable-sync\src\config.js`
- Create: `C:\claude\timetable-sync\src\diagnose.js`
- Create: `C:\claude\timetable-sync\SETUP.md`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `OFFICIAL_ID`, `GY_SHEET_ID` 상수 · `prop(key)`, `setProp(key, val)` · `diagnose()` — 이후 모든 태스크가 `config.js`의 상수를 쓴다

- [ ] **Step 1: 폴더와 git 초기화**

```bash
mkdir -p "C:/claude/timetable-sync/src" "C:/claude/timetable-sync/test/fixtures" "C:/claude/timetable-sync/tools"
cd "C:/claude/timetable-sync" && git init
```

- [ ] **Step 2: `.gitignore` 작성**

```
node_modules/
*.log
.DS_Store
secrets.json
_tmp/
```

`.clasp.json`은 **커밋한다** — scriptId는 비밀이 아니고, 다른 기기에서 clasp pull 하려면 필요하다. 시크릿은 전부 GAS 스크립트 속성에만 둔다.

- [ ] **Step 3: `appsscript.json` 작성**

```json
{
  "timeZone": "Asia/Seoul",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Drive", "serviceId": "drive", "version": "v3" }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://mail.google.com/"
  ]
}
```

- [ ] **Step 4: `.claspignore` 작성**

```
**/**
!appsscript.json
!src/**/*.js
```

- [ ] **Step 5: `src/config.js` 작성**

```js
// 공식 배포본 (.xlsx 호환 모드, csmedst20224181 에만 공유됨)
const OFFICIAL_ID = '1hpMg-jQrcDvm6gOwA84Ad2sa6WgU0JqQ';
// GY 시간표 시트 (네이티브, 소유 sbfpo4@gmail.com)
const GY_SHEET_ID = '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4';

const SHEET_TIMETABLE = '시간표';
const SHEET_NOTICE = '공지';
const SHEET_REFERENCE = '레퍼런스';
const SHEET_CHANGELOG = '변경로그';

const MEMO_MARK = '#';
const COLOR_LABEL = '#2E75B5';   // 학습부 블록
const COLOR_EXAM = '#FF0000';    // 시험
const COLOR_MEMO = '#808080';    // 메모 줄
const COLOR_DEFAULT = '#000000';

// GY 시트 구조 (실측 2026-09-01)
const BLOCK_ROWS = 11;           // 헤더 + 8교시 + 점심 + 저녁
const COL_FIRST_DAY = 3;         // C열 = 월 (1-indexed)
const COL_LAST_WRITABLE = 7;     // G열 = 금. H·I(토·일)는 무접촉
const GUARD = { values: 40, merges: 8, deletes: 10, unmapped: 5 };

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
function setProp(key, val) {
  PropertiesService.getScriptProperties().setProperty(key, String(val));
}
function isDryRun() {
  return prop('DRY_RUN') !== 'false';   // 기본값 = dry-run
}

if (typeof module !== 'undefined') module.exports = {
  OFFICIAL_ID, GY_SHEET_ID, SHEET_TIMETABLE, SHEET_NOTICE, SHEET_REFERENCE,
  SHEET_CHANGELOG, MEMO_MARK, COLOR_LABEL, COLOR_EXAM, COLOR_MEMO,
  COLOR_DEFAULT, BLOCK_ROWS, COL_FIRST_DAY, COL_LAST_WRITABLE, GUARD
};
```

- [ ] **Step 6: `src/diagnose.js` 작성**

```js
/**
 * Phase 0 정찰 + 상설 진단.
 * csmedst20224181 계정에서 실행할 것. 결과는 실행 로그에 찍힌다.
 * 스펙 §12의 미결 5건을 전부 확인한다.
 */
function diagnose() {
  const L = [];
  const log = (s) => { L.push(s); console.log(s); };

  log('=== timetable-sync diagnose ===');
  log('실행 계정: ' + Session.getEffectiveUser().getEmail());

  // [5] 공식 파일 메타 + 복사 허용 여부  ← A 방안 성립 조건
  let meta = null;
  try {
    meta = Drive.Files.get(OFFICIAL_ID, {
      fields: 'id,name,mimeType,size,md5Checksum,modifiedTime,' +
              'capabilities(canCopy,canDownload),copyRequiresWriterPermission,' +
              'owners(emailAddress)',
      supportsAllDrives: true
    });
    log('[5] 공식 파일: ' + meta.name);
    log('    mimeType = ' + meta.mimeType);
    log('    md5Checksum = ' + (meta.md5Checksum || '(없음 → modifiedTime 폴백 필요)'));
    log('    modifiedTime = ' + meta.modifiedTime);
    log('    canCopy = ' + (meta.capabilities && meta.capabilities.canCopy));
    log('    canDownload = ' + (meta.capabilities && meta.capabilities.canDownload));
    log('    copyRequiresWriterPermission = ' + meta.copyRequiresWriterPermission);
    log('    owner = ' + (meta.owners && meta.owners[0] && meta.owners[0].emailAddress));
  } catch (e) {
    log('[5] ✗ 공식 파일 접근 실패: ' + e);
    log('    → 계정이 csmedst20224181 인지 확인할 것');
    return L.join('\n');
  }

  // 변환 사본 생성 (복사 허용 실증) — finally 에서 반드시 삭제
  let copyId = null;
  try {
    const copy = Drive.Files.copy(
      { name: '_tmp_diagnose', mimeType: 'application/vnd.google-apps.spreadsheet' },
      OFFICIAL_ID, { supportsAllDrives: true });
    copyId = copy.id;
    log('[5] ✓ 변환 사본 생성 성공 id=' + copyId);

    const ss = SpreadsheetApp.openById(copyId);

    // 탭 목록
    log('\n[0] 탭 목록:');
    ss.getSheets().forEach(sh => log('    ' + sh.getName() +
      ' (' + sh.getLastRow() + '행 × ' + sh.getLastColumn() + '열)'));

    // [1] 시간표 탭 셀의 실제 개행 여부
    const tt = ss.getSheetByName('시간표');
    if (tt) {
      log('\n[1] 시간표 탭 A1:I25 (개행은 \\n 으로 표시):');
      tt.getRange(1, 1, Math.min(25, tt.getLastRow()), Math.min(9, tt.getLastColumn()))
        .getDisplayValues().forEach((row, i) => {
          const cells = row.map((v, j) => String.fromCharCode(65 + j) + '=' +
            JSON.stringify(String(v))).filter(s => !/=""$/.test(s));
          if (cells.length) log('    r' + (i + 1) + ' ' + cells.join(' '));
        });
      log('    → 값 안에 \\n 이 보이면 실제 개행, 안 보이면 워드랩');
    } else { log('[1] ✗ 시간표 탭 없음'); }

    // [2] 학습부배정 탭 병합 범위
    const asg = ss.getSheetByName('학습부배정');
    if (asg) {
      const merges = asg.getRange(1, 1, Math.min(40, asg.getLastRow()),
        Math.min(15, asg.getLastColumn())).getMergedRanges();
      log('\n[2] 학습부배정 탭 상단 병합 범위 ' + merges.length + '건:');
      merges.slice(0, 25).forEach(r => log('    ' + r.getA1Notation() +
        '  값=' + JSON.stringify(String(r.getDisplayValue()).slice(0, 30))));
      log('    → 세로 2행 병합(예: I6:I7)이 보이면 통합 판정 근거로 사용 가능');
    } else { log('[2] ✗ 학습부배정 탭 없음'); }

    // [3] 수업↔과목 매핑 근거
    ['그룹1', '설정', '명단'].forEach(name => {
      const sh = ss.getSheetByName(name);
      if (!sh) { log('\n[3] ' + name + ' 탭 없음'); return; }
      log('\n[3] ' + name + ' 탭 상단 15행:');
      sh.getRange(1, 1, Math.min(15, sh.getLastRow()), Math.min(8, sh.getLastColumn()))
        .getDisplayValues().forEach((row, i) => {
          const s = row.map(v => String(v)).join(' | ').replace(/(\s*\|\s*)+$/, '');
          if (s.trim()) log('    r' + (i + 1) + ': ' + s.slice(0, 160));
        });
    });

    // [4] 캐시 신선도 — 학습부배정 탭은 수식 시트다
    if (asg) {
      log('\n[4] 학습부배정 I4:M12 값 (수식 캐시 신선도 확인):');
      asg.getRange(4, 9, 9, 5).getDisplayValues().forEach((row, i) =>
        log('    r' + (i + 4) + ': ' + JSON.stringify(row)));
      log('    → 값이 비어 있으면 xlsx 캐시가 수식 결과를 안 담고 있다는 뜻');
      log('    → 공식 파일 modifiedTime = ' + meta.modifiedTime + ' 과 대조할 것');
    }
  } catch (e) {
    log('[5] ✗ 변환/열기 실패: ' + e);
    log('    → 소유자가 뷰어 복사·다운로드를 막아둔 경우일 수 있음');
    log('    → 그렇다면 소유자에게 요청할 것은 "복사 허용" (sbfpo4 공유가 아님)');
  } finally {
    if (copyId) {
      try { Drive.Files.delete(copyId, { supportsAllDrives: true }); log('\n임시 사본 삭제 완료'); }
      catch (e) { log('\n⚠ 임시 사본 삭제 실패 — 드라이브에서 수동 삭제: ' + copyId); }
    }
  }

  // GY 시트 쓰기 권한
  try {
    const gy = SpreadsheetApp.openById(GY_SHEET_ID);
    log('\n[G] GY 시트 열기 성공: ' + gy.getName());
    log('    탭: ' + gy.getSheets().map(s => s.getName()).join(', '));
  } catch (e) {
    log('\n[G] ✗ GY 시트 접근 실패: ' + e);
    log('    → 시트를 csmedst20224181 에 편집자로 공유했는지 확인');
  }

  return L.join('\n');
}
```

- [ ] **Step 7: clasp 설치 및 로그인**

메모리에 *"npm은 ExecutionPolicy에 막혀 안 돎"* 기록이 있다. PowerShell에서 `npm`이 막히면 `npm.cmd`를 쓰거나 Bash 툴을 경유한다.

```bash
npm.cmd install -g @google/clasp
clasp --version
clasp login
```

`clasp login`은 브라우저를 연다. **반드시 csmedst20224181 계정으로 로그인할 것.** 크롬에 계정이 여럿이면 계정 선택 화면에서 확인한다.

성공 기준: `clasp --version`이 버전을 출력하고, `clasp login`이 `Authorization successful`을 찍는다. `npm.cmd`도 막히면 Step 7을 중단하고 GY에게 보고한다 — 붙여넣기 방식으로 임시 진행할 수 있다.

- [ ] **Step 8: GAS 프로젝트 생성 및 push**

```bash
cd "C:/claude/timetable-sync"
clasp create --type standalone --title "timetable-sync" --rootDir .
clasp push --force
clasp open
```

`clasp create`가 `.clasp.json`을 만든다. `appsscript.json`이 이미 있으면 덮어쓰기를 묻는데 **우리 것을 유지**한다.

- [ ] **Step 9: GY가 diagnose() 1회 실행 — 게이트**

GY에게 요청할 것:
1. `clasp open`으로 열린 편집기에서 함수 선택창을 `diagnose`로 바꾸고 **실행**
2. 첫 실행이라 권한 승인 팝업이 뜬다: 계정 선택 → "Google에서 확인하지 않은 앱" → **고급 → timetable-sync(안전하지 않음)으로 이동 → 허용** (draft-radar SETUP.md와 같은 화면)
3. **실행 로그 전체를 복사해서 전달**

- [ ] **Step 10: 결과를 스펙에 반영하고 커밋**

로그를 보고 스펙 §12 표의 5행을 `확인됨: <결과>`로 갱신한다. `[5] canCopy = false`거나 변환이 실패했으면 **여기서 멈추고 GY와 설계를 재검토한다.**

```bash
cd "C:/claude/timetable-sync"
git add -A && git commit -m "feat: 스캐폴드 + clasp 연결 + diagnose() 정찰"
cd "C:/Users/wbnuj/timetable-pwa"
git add docs/superpowers/specs/2026-09-01-timetable-sync-design.md
git commit -m "docs: Phase 0 정찰 결과 반영"
```

---

## Task 2: Node 테스트 하네스 + GY 골든 픽스처

**Files:**
- Create: `C:\claude\timetable-sync\tools\make-gy-fixture.js`
- Create: `C:\claude\timetable-sync\test\fixtures\gy-sheet.json`
- Create: `C:\claude\timetable-sync\test\fixture.test.js`

**Interfaces:**
- Consumes: Task 1의 폴더 구조
- Produces: `test/fixtures/gy-sheet.json` — `{ title, rows: [[{v, bg, fg, runs}, ...], ...] }` 형태. `rows[r][c].v`는 셀 문자열(개행 포함), `bg`/`fg`는 `#RRGGBB` 또는 null, `runs`는 `[{start, color}]`. Task 5~8의 모든 테스트가 이걸 쓴다.

- [ ] **Step 1: 픽스처 추출기 작성**

```js
// tools/make-gy-fixture.js
// timetable-pwa/data/snapshot.js (Sheets API 모양) → test/fixtures/gy-sheet.json
const fs = require('fs');
const path = require('path');

const SNAP = 'C:/Users/wbnuj/timetable-pwa/data/snapshot.js';
const OUT = path.join(__dirname, '..', 'test', 'fixtures', 'gy-sheet.json');

global.window = {};
eval(fs.readFileSync(SNAP, 'utf8').replace(/^\/\/.*$/m, ''));
const snap = global.window.__SNAPSHOT__;

const hex = (o) => o
  ? '#' + [o.red, o.green, o.blue]
      .map(x => Math.round((x || 0) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
  : null;

const sh = snap.sheets[0];
const rowData = (sh.data[0].rowData) || [];
const rows = rowData.map(r => {
  const vals = r.values || [];
  return vals.slice(0, 9).map(v => {
    if (!v) return { v: '', bg: null, fg: null, runs: [] };
    const ef = v.effectiveFormat || {};
    return {
      v: v.formattedValue != null ? String(v.formattedValue) : '',
      bg: hex(ef.backgroundColor),
      fg: hex(ef.textFormat && ef.textFormat.foregroundColor),
      runs: (v.textFormatRuns || []).map(x => ({
        start: x.startIndex || 0,
        color: hex(x.format && x.format.foregroundColor)
      }))
    };
  });
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ title: snap.properties.title, rows }, null, 0));
console.log('wrote', OUT, '| title=', snap.properties.title, '| rows=', rows.length);
```

- [ ] **Step 2: 실행해서 픽스처 생성**

```bash
cd "C:/Users/wbnuj/timetable-pwa" && git pull --rebase
cd "C:/claude/timetable-sync" && node tools/make-gy-fixture.js
```

기대: `wrote ... | title= v97_시간표_GY | rows= 1049` (v 번호는 더 높을 수 있음)

- [ ] **Step 3: 픽스처가 알려진 사실과 맞는지 검증하는 테스트 작성**

```js
// test/fixture.test.js
const test = require('node:test');
const assert = require('node:assert');
const fx = require('./fixtures/gy-sheet.json');

const cell = (r, c) => (fx.rows[r] && fx.rows[r][c]) || { v: '', bg: null, fg: null, runs: [] };

test('49개 주 블록, 11행 주기', () => {
  const headers = [];
  for (let r = 0; r < fx.rows.length; r++) {
    if (/^(\d+주|방학|미정)/.test(cell(r, 0).v)) headers.push(r);
  }
  assert.strictEqual(headers.length, 49);
  assert.deepStrictEqual(headers.slice(0, 4), [0, 11, 22, 33]);
});

test('26-2 첫 주는 idx 242, 월요일 2026. 8. 31', () => {
  assert.strictEqual(cell(242, 0).v, '1주');
  assert.strictEqual(cell(242, 2).v, '2026. 8. 31');
});

test('교시 라벨은 1~8 + 점심 + 저녁', () => {
  const labels = [];
  for (let r = 243; r < 253; r++) labels.push(cell(r, 0).v);
  assert.deepStrictEqual(labels, ['1','2','3','4','점심','5','6','7','8','저녁']);
});

test('# 마커는 시트 어디에도 없다', () => {
  let n = 0;
  for (const row of fx.rows) for (const c of row) if (c.v.includes('#')) n++;
  assert.strictEqual(n, 0);
});

test('통합 12건 / 분할 2건', () => {
  let split = 0;
  const merged = new Set();
  for (let r = 242; r < fx.rows.length; r++) {
    for (let c = 2; c < 9; c++) {
      const lines = cell(r, c).v.split('\n');
      const labels = lines.filter(l => /^[가-힣A-Za-z]+\d+(-\d)?:/.test(l));
      if (labels.length >= 2) split++;
      else if (labels.length === 1 && /-\d:/.test(labels[0])) {
        merged.add(labels[0].split('-')[0]);
      }
    }
  }
  assert.strictEqual(split, 2, '한 수업 두 팀 = 2건');
  assert.strictEqual(merged.size, 12, '한 팀 두 수업 = 12건');
});
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/
```

기대: 5 passing. 실패하면 픽스처 추출기나 위 상수(242, 12, 2)를 실제 값에 맞춰 조정하고, **스펙의 숫자도 함께 고친다.**

- [ ] **Step 5: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add tools/make-gy-fixture.js test/
git commit -m "test: GY 시트 골든 픽스처 + 구조 검증 5건"
```

---

## Task 3: 레퍼런스 탭 부트스트랩

현재 GY 시트에서 팔레트·약어·라벨 매핑을 추출해 `레퍼런스` 탭을 만든다. **이 탭이 이후 모든 생성의 정본**이다.

**Files:**
- Create: `C:\claude\timetable-sync\src\reference.js`
- Create: `C:\claude\timetable-sync\test\reference.test.js`

**Interfaces:**
- Consumes: `test/fixtures/gy-sheet.json` (Task 2)
- Produces:
  - `extractReference(rows)` → `{ palette: {'#RRGGBB': '#RRGGBB'}, abbrev: {교수: '약어'}, labels: string[], examKeywords: string[] }`
  - `loadReference()` → `{ palette: {과목: '#RRGGBB'}, abbrev: {교수: '약어'}, examKeywords: string[] }`
  - `bootstrapReferenceTab()` → GAS. 탭이 없으면 생성하고 추출 결과를 채운다
  - `splitBlocks(text, memoMark)` → `{ className[], professor[], labels[], memo[], unknown[] }` (Task 6이 소비)
  - `parseProfessorLine(line)` → `{name, abbrev}` · `parseLabelLine(line)` → `{label, num, part, drafter, reviewer}`

> **palette의 두 모양은 의도된 것이다.** `extractReference`는 시트에서 색만 긁어오므로 키가 색이고(어느 과목인지는 사람만 안다), `bootstrapReferenceTab`이 그 색을 탭에 뿌린 뒤 **GY가 과목명 칸을 채운다**. 그래서 `loadReference`는 과목→색이 된다. 색을 자동으로 과목에 붙이려 하지 말 것.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/reference.test.js
const test = require('node:test');
const assert = require('node:assert');
const fx = require('./fixtures/gy-sheet.json');
const { extractReference } = require('../src/reference.js');

test('팔레트: 배경색 → 과목 후보를 뽑는다', () => {
  const ref = extractReference(fx.rows);
  const colors = Object.values(ref.palette);
  assert.ok(colors.includes('#FBE4D5'), '혈액종양학 살구색');
  assert.ok(colors.includes('#DEEAF6'), 'PBL3 하늘색');
  assert.ok(colors.includes('#FFC000'), '법의학 주황');
  assert.ok(colors.length >= 12, '과목 색이 12개 이상');
});

test('약어: 교수 → 소속 영문약어', () => {
  const ref = extractReference(fx.rows);
  assert.strictEqual(ref.abbrev['강성호'], 'Clinical Path');
  assert.strictEqual(ref.abbrev['박치영'], 'Hem-Onc');
  assert.strictEqual(ref.abbrev['류성엽'], 'Upper GI Surg');
});

test('약어: 괄호 안에 약어가 없던 교수는 등록되지 않는다', () => {
  const ref = extractReference(fx.rows);
  assert.ok(!('한미아' in ref.abbrev), '한미아는 시트에 약어가 없음');
});

test('라벨: 셀에서 쓰인 라벨 단축명을 모은다', () => {
  const ref = extractReference(fx.rows);
  assert.ok(ref.labels.includes('혈종'));
  assert.ok(ref.labels.includes('신경'));
  assert.ok(ref.labels.includes('내분비'));
  assert.ok(ref.labels.includes('PBL'));
});

test('시험 키워드: 빨간 글씨 셀의 수업명에서 유도', () => {
  const ref = extractReference(fx.rows);
  assert.ok(ref.examKeywords.includes('총괄평가'));
  assert.ok(!ref.examKeywords.includes('과정형성평가'));
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/reference.test.js
```

기대: FAIL — `Cannot find module '../src/reference.js'`

- [ ] **Step 3: `src/reference.js` 구현**

```js
/**
 * 레퍼런스(정본) 추출·로드.
 * 팔레트·약어·라벨·시험키워드는 전부 여기서 나온다. 코드에 박지 않는다.
 */

function isHeaderLabel(s) { return /^(\d+주|방학|미정)/.test(s); }
function isPeriodRow(label) { return /^[1-8]$/.test(label); }

/** 셀 문자열을 블록으로 쪼갠다. 형태로 판정하며 위치에 의존하지 않는다. */
function splitBlocks(text, memoMark) {
  const mark = memoMark || '#';
  const out = { className: [], professor: [], labels: [], memo: [], unknown: [] };
  const lines = String(text || '').split('\n');
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (t.startsWith(mark)) out.memo.push(ln);
    else if (/^[가-힣A-Za-z][가-힣A-Za-z0-9]*\d+(-\d)?\s*:/.test(t)) out.labels.push(ln);
    else if (/^\(.*\)$/.test(t)) out.professor.push(ln);
    else if (out.professor.length || out.labels.length) out.unknown.push(ln);
    else out.className.push(ln);
  }
  return out;
}

/** '(강성호, Clinical Path)' → {name:'강성호', abbrev:'Clinical Path'} */
function parseProfessorLine(line) {
  const m = String(line || '').trim().match(/^\((.*)\)$/);
  if (!m) return null;
  const inner = m[1];
  const i = inner.indexOf(',');
  if (i < 0) return { name: inner.trim(), abbrev: null };
  return { name: inner.slice(0, i).trim(), abbrev: inner.slice(i + 1).trim() };
}

/** '혈종2-1: 강현승/임유진' → {label:'혈종', num:2, part:1, drafter, reviewer} */
function parseLabelLine(line) {
  const m = String(line || '').trim()
    .match(/^([가-힣A-Za-z][가-힣A-Za-z0-9]*?)(\d+)(?:-(\d))?\s*:\s*(.+?)\s*\/\s*(.+)$/);
  if (!m) return null;
  return {
    label: m[1], num: Number(m[2]), part: m[3] ? Number(m[3]) : null,
    drafter: m[4].trim(), reviewer: m[5].trim()
  };
}

/** 현재 시트에서 정본 후보를 추출한다 (최초 1회 부트스트랩용) */
function extractReference(rows) {
  const palette = {};      // 색 → 색 (과목명은 GY가 채운다)
  const abbrev = {};
  const labelSet = new Set();
  const examSet = new Set();
  const colorSeen = new Set();

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const rowLabel = (row[0] && row[0].v) || '';
    if (isHeaderLabel(rowLabel) || !isPeriodRow(rowLabel)) continue;

    for (let c = 2; c < 9; c++) {
      const cell = row[c]; if (!cell || !cell.v) continue;
      const b = splitBlocks(cell.v);

      if (cell.bg && !colorSeen.has(cell.bg)) { colorSeen.add(cell.bg); palette[cell.bg] = cell.bg; }

      for (const line of b.professor) {
        const p = parseProfessorLine(line);
        if (p && p.name && p.abbrev) abbrev[p.name] = p.abbrev;
      }
      for (const line of b.labels) {
        const l = parseLabelLine(line);
        if (l) labelSet.add(l.label);
      }
      if (cell.fg === '#FF0000' && b.className.length) {
        const name = b.className.join(' ').trim();
        const m = name.match(/([가-힣]*평가|피드백)$/);
        if (m) examSet.add(m[1]);
      }
    }
  }
  return {
    palette, abbrev,
    labels: Array.from(labelSet).sort(),
    examKeywords: Array.from(examSet).sort()
  };
}

if (typeof module !== 'undefined') module.exports = {
  extractReference, splitBlocks, parseProfessorLine, parseLabelLine,
  isHeaderLabel, isPeriodRow
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/reference.test.js
```

기대: 5 passing. 실패하면 정규식을 실제 데이터에 맞춰 조정한다 — 픽스처가 정답이다.

- [ ] **Step 5: `bootstrapReferenceTab()` 추가 (GAS 전용, `src/reference.js` 끝에)**

```js
/** GY 시트에 레퍼런스 탭을 만들고 현재 값으로 채운다. 이미 있으면 아무것도 안 한다. */
function bootstrapReferenceTab() {
  const ss = SpreadsheetApp.openById(GY_SHEET_ID);
  if (ss.getSheetByName(SHEET_REFERENCE)) {
    console.log('레퍼런스 탭이 이미 있음 — 건드리지 않음');
    return;
  }
  const sh = ss.insertSheet(SHEET_REFERENCE);
  sh.getRange('A1:B1').setValues([['# 이 탭이 정본입니다. 시트에서 직접 고치지 말고 여기서 고치세요.', '']]);
  sh.getRange('A3:C3').setValues([['[팔레트] 과목', '색', '']]);
  sh.getRange('A3:C3').setFontWeight('bold');
  sh.getRange('E3:F3').setValues([['[약어] 교수', '소속']]);
  sh.getRange('E3:F3').setFontWeight('bold');
  sh.getRange('H3:H3').setValues([['[시험키워드]']]);
  sh.getRange('H3').setFontWeight('bold');
  console.log('레퍼런스 탭 생성 완료 — 팔레트의 과목명은 GY가 채워야 함');
}

/** 레퍼런스 탭 → 매핑 객체 */
function loadReference() {
  const ss = SpreadsheetApp.openById(GY_SHEET_ID);
  const sh = ss.getSheetByName(SHEET_REFERENCE);
  if (!sh) throw new Error('레퍼런스 탭이 없습니다. bootstrapReferenceTab() 을 먼저 실행하세요.');
  const grab = (col, n) => sh.getRange(4, col, Math.max(1, sh.getLastRow() - 3), n)
    .getDisplayValues().filter(r => String(r[0]).trim());
  const palette = {}, abbrev = {};
  grab(1, 2).forEach(r => { palette[String(r[0]).trim()] = String(r[1]).trim(); });
  grab(5, 2).forEach(r => { abbrev[String(r[0]).trim()] = String(r[1]).trim(); });
  const examKeywords = grab(8, 1).map(r => String(r[0]).trim());
  return { palette, abbrev, examKeywords };
}
```

- [ ] **Step 6: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/reference.js test/reference.test.js
git commit -m "feat: 레퍼런스 추출·로드 + 블록 분리 술어"
```

---

## Task 4: parse.js — 공식 → IR

> **선행 조건:** Task 1의 `diagnose()` 로그를 읽고 미결 1·2·3·4를 확정했을 것. 로그에서 확인한 실제 좌표·개행 형태에 맞춰 아래 상수를 조정한다.

**Files:**
- Create: `C:\claude\timetable-sync\src\parse.js`
- Create: `C:\claude\timetable-sync\test\parse.test.js`
- Create: `C:\claude\timetable-sync\test\fixtures\official.json`

**Interfaces:**
- Consumes: `splitBlocks`, `parseProfessorLine` (Task 3)
- Produces: `parseOfficial(ttGrid, asgGrid, asgMerges)` → `IR[]`
  ```js
  { date: '2026-09-03', period: 3, weekday: 4,
    className: '외과 종양학', professor: '류성엽',
    drafter: '강현승', reviewer: '임유진',        // = teams[0], 편의용
    teams: [{drafter: '강현승', reviewer: '임유진'}],  // 분할이면 2개
    mergeGroup: 'g12'|null }
  ```
  **`teams`가 2개 이상 = 분할**(한 수업 두 팀). `composeCell`이 이걸 보고 `-1`/`-2`를 붙인다.
  `ttGrid`/`asgGrid`는 `string[][]` (0-indexed, `getDisplayValues()` 결과),
  `asgMerges`는 `[{r0, c0, r1, c1}]` (0-indexed, 끝 배타적)

- [ ] **Step 1: 공식 픽스처 작성**

`diagnose()` 로그의 `[1]`·`[2]` 출력을 그대로 옮겨 `test/fixtures/official.json`을 만든다. 최소 2주 분량(20행)이어야 통합·분할·점심이 다 들어간다.

```json
{
  "timetable": [
    ["주차", "", "의학과 2학년", "", "", "", ""],
    ["", "", "월", "화", "수", "목", "금"],
    ["1주", "", "8/31", "9/1", "9/2", "9/3", "9/4"],
    ["1", "(09:00-09:50)", "종양의 이해(한미아)", "적혈구질환에서의 진단검사의학적 기초(강성호)", "재생불량성 빈혈, 골수이형성증(박치영)", "백혈구질환에서의 진단검사의학적 기초(강성호)", "종양학각론(박상곤)"],
    ["2", "(10:00-10:50)", "", "", "", "", ""],
    ["3", "(11:00-11:50)", "종양의 병기(류성엽)", "유전성 종양(김경종)", "골수증식성질환 암환자의 심리(박치영)", "", "자반증, 후천성혈액응고장애(박상곤)"],
    ["4", "(12:00-12:50)", "외과 종양학(류성엽)", "", "", "", ""],
    ["", "13:00-14:00", "혈액종양학", "", "", "", ""],
    ["5", "(14:00-14:50)", "PBL3", "적혈구 질환(박치영)", "PBL3", "급만성백혈병(이희정)", "수혈의학(박건)"],
    ["6", "(15:00-15:50)", "", "", "", "", ""],
    ["7", "(16:00-16:50)", "조혈과 골수(강성호)", "종양의 진단 및 치료(박상곤)", "법의학", "소아혈액학: 빈혈, 출혈질환(고영권)", ""],
    ["8", "(17:00-17:50)", "혈액종양에서의 진단검사기초(강성호)", "", "", "", ""]
  ],
  "assignment": [
    ["주차", "", "학습부 배정 (초안자 / 검안자)", "", "", "", ""],
    ["", "", "월", "화", "수", "목", "금"],
    ["1주", "", "8/31", "9/1", "9/2", "9/3", "9/4"],
    ["1", "(09:00-09:50)", "박세현\n오철민", "이채은\n박강희", "윤아영\n성지민", "조영헌\n오철민", "최효영\n박강희"],
    ["2", "(10:00-10:50)", "", "", "", "", ""],
    ["3", "(11:00-11:50)", "강현승\n임유진", "이서윤\n강현성", "이명연\n박주용", "", "김태민\n강현성"],
    ["4", "(12:00-12:50)", "", "", "", "", ""],
    ["", "13:00-14:00", "혈액종양학", "", "", "", ""],
    ["5", "(14:00-14:50)", "홍재영\n한유진", "김태경\n고승우", "김성수\n고재연", "박민서\n임유진", "박주하\n고승우"],
    ["6", "(15:00-15:50)", "", "", "", "", ""],
    ["7", "(16:00-16:50)", "김예찬\n서정우", "조기상\n전혜인", "이세훈\n한현구", "안성민\n서정우", ""],
    ["8", "(17:00-17:50)", "", "", "", "", ""]
  ],
  "assignmentMerges": [
    { "r0": 5, "c0": 2, "r1": 7, "c1": 3 },
    { "r0": 10, "c0": 2, "r1": 12, "c1": 3 }
  ]
}
```

> `assignmentMerges`의 두 항목이 `혈종2`(3~4교시)와 `혈종3`(7~8교시) 통합이다. **`diagnose()` `[2]` 출력이 이 가정과 다르면 픽스처와 `parse.js`를 실제에 맞춘다.**

- [ ] **Step 2: 실패하는 테스트 작성**

```js
// test/parse.test.js
const test = require('node:test');
const assert = require('node:assert');
const fx = require('./fixtures/official.json');
const { parseOfficial } = require('../src/parse.js');

const ir = () => parseOfficial(fx.timetable, fx.assignment, fx.assignmentMerges, 2026);

test('교시 셀만 IR 이 된다 (헤더·점심 제외)', () => {
  const out = ir();
  assert.ok(out.length > 0);
  assert.ok(out.every(x => x.period >= 1 && x.period <= 8));
});

test('날짜를 ISO 로 정규화한다', () => {
  const first = ir().find(x => x.className === '종양의 이해');
  assert.strictEqual(first.date, '2026-08-31');
  assert.strictEqual(first.period, 1);
});

test('마지막 괄호쌍으로 수업명·교수를 가른다', () => {
  const x = ir().find(x => x.professor === '고영권');
  assert.strictEqual(x.className, '소아혈액학: 빈혈, 출혈질환');
});

test('괄호 없는 셀은 교수가 null', () => {
  const x = ir().find(x => x.className === 'PBL3');
  assert.strictEqual(x.professor, null);
});

test('초안자/검안자를 개행으로 가른다', () => {
  const x = ir().find(x => x.className === '종양의 이해');
  assert.strictEqual(x.drafter, '박세현');
  assert.strictEqual(x.reviewer, '오철민');
});

test('이름이 4개면 팀 2개로 가른다 (분할)', () => {
  const { parseAssignmentCell } = require('../src/parse.js');
  assert.deepStrictEqual(parseAssignmentCell('이세훈\n안성민\n김예찬\n박지영'), [
    { drafter: '이세훈', reviewer: '안성민' },
    { drafter: '김예찬', reviewer: '박지영' }
  ]);
});

test('보통 셀은 팀 1개', () => {
  const x = ir().find(x => x.className === '종양의 이해');
  assert.strictEqual(x.teams.length, 1);
});

test('배정 병합 범위가 같은 mergeGroup 을 준다', () => {
  const out = ir();
  const a = out.find(x => x.className === '종양의 병기');
  const b = out.find(x => x.className === '외과 종양학');
  assert.ok(a.mergeGroup);
  assert.strictEqual(a.mergeGroup, b.mergeGroup);
});

test('병합 아닌 슬롯은 mergeGroup 이 null', () => {
  const x = ir().find(x => x.className === '유전성 종양');
  assert.strictEqual(x.mergeGroup, null);
});
```

- [ ] **Step 3: 실패 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/parse.test.js
```

기대: FAIL — `Cannot find module '../src/parse.js'`

- [ ] **Step 4: `src/parse.js` 구현**

```js
/**
 * 공식 배포본(.xlsx 를 네이티브로 변환한 사본) → IR.
 * 이 파일만 공식 파일 구조를 안다. GY 시트 구조는 전혀 모른다.
 */

const OFFICIAL_HEADER_RE = /^(\d+주|방학|미정)/;

/** '8/31' + 기준연도 → '2026-08-31' (연말 넘어가면 +1년) */
function officialDateToIso(cell, baseYear, prevIso) {
  const s = String(cell || '').trim();
  let m = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  let mo, d;
  if (m) { mo = Number(m[1]); d = Number(m[2]); }
  else {
    m = s.match(/^(\d{4})[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})/);
    if (!m) return null;
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }
  let y = baseYear;
  if (prevIso) {
    const pm = Number(prevIso.slice(5, 7));
    if (pm >= 11 && mo <= 2) y = Number(prevIso.slice(0, 4)) + 1;
    else y = Number(prevIso.slice(0, 4));
  }
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** '소아혈액학: 빈혈, 출혈질환(고영권)' → {className, professor} */
function splitClassAndProfessor(text) {
  const s = String(text || '').replace(/\s+$/, '');
  if (!s.trim()) return null;
  const close = s.lastIndexOf(')');
  if (close === s.length - 1) {
    const open = s.lastIndexOf('(');
    if (open > 0) {
      return {
        className: s.slice(0, open).replace(/\s+$/, '').replace(/\n+$/, ''),
        professor: s.slice(open + 1, close).trim() || null
      };
    }
  }
  return { className: s, professor: null };
}

/**
 * 학습부배정 셀 → 팀 배열. 이름 2개마다 한 팀.
 * '박세현\n오철민'          → [{박세현, 오철민}]              보통
 * '이세훈\n안성민\n김예찬\n박지영' → [{이세훈,안성민},{김예찬,박지영}]  분할(한 수업 두 팀)
 */
function parseAssignmentCell(text) {
  const parts = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const teams = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    teams.push({ drafter: parts[i], reviewer: parts[i + 1] });
  }
  if (parts.length === 1) teams.push({ drafter: parts[0], reviewer: null });
  return teams;
}

/** 0-indexed (r,c) 를 감싸는 병합 범위를 찾아 id 를 준다 */
function mergeIdAt(merges, r, c) {
  for (let i = 0; i < (merges || []).length; i++) {
    const m = merges[i];
    if (r >= m.r0 && r < m.r1 && c >= m.c0 && c < m.c1) {
      if (m.r1 - m.r0 < 2) return null;      // 세로 2행 이상만 통합으로 본다
      return 'g' + m.r0 + '_' + m.c0;
    }
  }
  return null;
}

/**
 * @param {string[][]} tt   공식 시간표 탭 (0-indexed)
 * @param {string[][]} asg  공식 학습부배정 탭 (같은 좌표계)
 * @param {Array} asgMerges 학습부배정 병합 범위 [{r0,c0,r1,c1}] 0-indexed 끝 배타
 * @param {number} baseYear 학기 시작 연도
 * @returns {Array} IR
 */
function parseOfficial(tt, asg, asgMerges, baseYear) {
  const out = [];
  let dates = null, prevIso = null;

  for (let r = 0; r < tt.length; r++) {
    const row = tt[r] || [];
    const a = String(row[0] || '').trim();

    if (OFFICIAL_HEADER_RE.test(a)) {
      dates = [];
      for (let c = 2; c <= 6; c++) {
        const iso = officialDateToIso(row[c], baseYear, prevIso);
        dates.push(iso);
        if (iso) prevIso = iso;
      }
      continue;
    }
    if (!/^[1-8]$/.test(a)) continue;        // 점심·빈 행 제외
    if (!dates) continue;

    const period = Number(a);
    for (let c = 2; c <= 6; c++) {
      const date = dates[c - 2];
      if (!date) continue;
      const sp = splitClassAndProfessor(row[c]);
      if (!sp) continue;

      const teams = parseAssignmentCell((asg[r] || [])[c]);
      out.push({
        date, period, weekday: c - 1,
        className: sp.className, professor: sp.professor,
        drafter: teams.length ? teams[0].drafter : null,
        reviewer: teams.length ? teams[0].reviewer : null,
        teams: teams,
        mergeGroup: mergeIdAt(asgMerges, r, c)
      });
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = {
  parseOfficial, splitClassAndProfessor, officialDateToIso, mergeIdAt, parseAssignmentCell
};
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/parse.test.js
```

기대: 9 passing

- [ ] **Step 6: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/parse.js test/parse.test.js test/fixtures/official.json
git commit -m "feat: parse.js — 공식 배포본을 IR 로 정규화"
```

---

## Task 5: compose.js — 라벨 번호 (시간순·통합·분할)

**Files:**
- Create: `C:\claude\timetable-sync\src\compose.js`
- Create: `C:\claude\timetable-sync\test\compose-number.test.js`

**Interfaces:**
- Consumes: `parseOfficial` 결과 IR (Task 4)
- Produces: `assignNumbers(ir, subjectOf)` → IR 각 원소에 `{ labelText: '혈종2' | '내분비11-1' | null, mergeKey }` 추가.
  `subjectOf(irItem)` → `'혈종'` 같은 라벨 단축명 또는 null

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/compose-number.test.js
const test = require('node:test');
const assert = require('node:assert');
const { assignNumbers } = require('../src/compose.js');

const S = (x) => x.className.startsWith('PBL') ? 'PBL'
  : x.className === '법의학' ? '법의학' : '혈종';

const base = [
  { date: '2026-08-31', period: 1, className: 'A', drafter: '가', reviewer: '나', mergeGroup: null },
  { date: '2026-08-31', period: 3, className: 'B', drafter: '다', reviewer: '라', mergeGroup: 'g1' },
  { date: '2026-08-31', period: 4, className: 'C', drafter: '다', reviewer: '라', mergeGroup: 'g1' },
  { date: '2026-09-01', period: 1, className: 'D', drafter: '마', reviewer: '바', mergeGroup: null }
];

test('시간순으로 1부터 매긴다', () => {
  const out = assignNumbers(base.map(x => ({ ...x })), S);
  assert.strictEqual(out[0].labelText, '혈종1');
  assert.strictEqual(out[3].labelText, '혈종3');
});

test('통합은 번호 하나를 공유하고 -N 이 없다', () => {
  const out = assignNumbers(base.map(x => ({ ...x })), S);
  assert.strictEqual(out[1].labelText, '혈종2');
  assert.strictEqual(out[2].labelText, '혈종2');
  assert.ok(!out[1].labelText.includes('-'));
});

test('통합 다음 수업은 번호가 하나만 증가한다', () => {
  const out = assignNumbers(base.map(x => ({ ...x })), S);
  assert.strictEqual(out[3].labelText, '혈종3');
});

test('과목이 다르면 번호 시퀀스가 독립이다', () => {
  const mixed = [
    { date: '2026-08-31', period: 1, className: 'A', drafter: '가', reviewer: '나', mergeGroup: null },
    { date: '2026-08-31', period: 5, className: 'PBL3', drafter: '다', reviewer: '라', mergeGroup: null },
    { date: '2026-09-01', period: 5, className: 'PBL3', drafter: '마', reviewer: '바', mergeGroup: null }
  ];
  const out = assignNumbers(mixed, S);
  assert.strictEqual(out[0].labelText, '혈종1');
  assert.strictEqual(out[1].labelText, 'PBL1');
  assert.strictEqual(out[2].labelText, 'PBL2');
});

test('배정이 없으면 labelText 가 null', () => {
  const out = assignNumbers([
    { date: '2026-08-31', period: 1, className: 'A', drafter: null, reviewer: null, mergeGroup: null }
  ], S);
  assert.strictEqual(out[0].labelText, null);
});

test('과목을 모르면 labelText 가 null (추측 금지)', () => {
  const out = assignNumbers([
    { date: '2026-08-31', period: 1, className: 'A', drafter: '가', reviewer: '나', mergeGroup: null }
  ], () => null);
  assert.strictEqual(out[0].labelText, null);
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/compose-number.test.js
```

기대: FAIL — 모듈 없음

- [ ] **Step 3: `src/compose.js` 에 `assignNumbers` 구현**

```js
/**
 * IR → GY 시트 목표값. 이 파일만 GY 시트 구조를 안다.
 */

/** (날짜, 교시) 오름차순 정렬 키 */
function sortKey(x) { return x.date + '#' + String(x.period).padStart(2, '0'); }

/**
 * 과목별 시간순 번호를 매긴다.
 * 통합(mergeGroup 동일)은 번호 하나를 공유하고 -N 을 붙이지 않는다.
 * 분할(한 슬롯 두 팀)은 Task 6 에서 셀 단위로 -1/-2 를 붙인다.
 */
function assignNumbers(ir, subjectOf) {
  const items = ir.slice().sort((a, b) => sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);
  const counter = {};          // 과목 → 마지막 번호
  const groupNum = {};         // 과목+mergeGroup → 이미 부여된 번호

  for (const x of items) {
    x.labelText = null;
    if (!x.drafter && !x.reviewer) continue;
    const subj = subjectOf(x);
    if (!subj) continue;                      // 모르면 매기지 않는다

    let n;
    if (x.mergeGroup) {
      const key = subj + '|' + x.mergeGroup;
      if (groupNum[key] != null) n = groupNum[key];
      else { n = (counter[subj] || 0) + 1; counter[subj] = n; groupNum[key] = n; }
    } else {
      n = (counter[subj] || 0) + 1; counter[subj] = n;
    }
    x.subject = subj;
    x.labelNum = n;
    x.labelText = subj + n;
  }
  return items;
}

if (typeof module !== 'undefined') module.exports = { assignNumbers, sortKey };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/compose-number.test.js
```

기대: 6 passing

- [ ] **Step 5: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/compose.js test/compose-number.test.js
git commit -m "feat: 시간순 라벨 번호 — 통합은 번호 공유, 미지 과목은 null"
```

---

## Task 6: compose.js — 셀 목표값 조립 (블록 + 메모 보존)

**Files:**
- Modify: `C:\claude\timetable-sync\src\compose.js`
- Create: `C:\claude\timetable-sync\test\compose-cell.test.js`

**Interfaces:**
- Consumes: `splitBlocks` (Task 3), `assignNumbers` (Task 5)
- Produces: `composeCell(items, currentText, ref)` → `{ text, labelStart, unknownLines, unmappedProfs }`
  - `items`: 이 셀에 들어갈 IR 배열 (통합이면 2개, 분할이면 1개인데 팀 2개)
  - `currentText`: GY 시트의 현재 셀 문자열 (메모 보존용)
  - `labelStart`: 학습부 블록이 시작하는 문자 인덱스 (`#2E75B5` run 시작점). 없으면 -1

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/compose-cell.test.js
const test = require('node:test');
const assert = require('node:assert');
const { composeCell } = require('../src/compose.js');

const REF = { abbrev: { '류성엽': 'Upper GI Surg', '강성호': 'Clinical Path' }, examKeywords: ['총괄평가'] };

test('기본 3블록을 조립한다', () => {
  const r = composeCell([{ className: '종양의 병기', professor: '류성엽',
    drafter: '강현승', reviewer: '임유진', labelText: '혈종2' }], '', REF);
  assert.strictEqual(r.text, '종양의 병기\n(류성엽, Upper GI Surg)\n혈종2: 강현승/임유진');
});

test('통합: 수업명 2줄, 교수 1줄, 번호 하나', () => {
  const items = [
    { className: '종양의 병기', professor: '류성엽', drafter: '강현승', reviewer: '임유진', labelText: '혈종2' },
    { className: '외과 종양학', professor: '류성엽', drafter: '강현승', reviewer: '임유진', labelText: '혈종2' }
  ];
  const r = composeCell(items, '', REF);
  assert.strictEqual(r.text,
    '종양의 병기\n외과 종양학\n(류성엽, Upper GI Surg)\n혈종2: 강현승/임유진');
});

test('통합인데 교수가 다르면 교수도 2줄', () => {
  const items = [
    { className: 'X', professor: '류성엽', drafter: '가', reviewer: '나', labelText: '혈종2' },
    { className: 'Y', professor: '강성호', drafter: '가', reviewer: '나', labelText: '혈종2' }
  ];
  const r = composeCell(items, '', REF);
  assert.strictEqual(r.text,
    'X\nY\n(류성엽, Upper GI Surg)\n(강성호, Clinical Path)\n혈종2: 가/나');
});

test('분할: 한 수업 두 팀은 -1/-2 로 라벨 2줄', () => {
  const items = [{ className: '당뇨병의 급성합병증과 저혈당', professor: '김상용',
    labelText: '내분비11',
    teams: [{ drafter: '이세훈', reviewer: '안성민' }, { drafter: '김예찬', reviewer: '박지영' }] }];
  const r = composeCell(items, '', REF);
  assert.strictEqual(r.text,
    '당뇨병의 급성합병증과 저혈당\n(김상용)\n내분비11-1: 이세훈/안성민\n내분비11-2: 김예찬/박지영');
});

test('약어 미등록 교수는 약어 없이 쓰고 보고한다', () => {
  const r = composeCell([{ className: '종양의 이해', professor: '한미아',
    drafter: '박세현', reviewer: '오철민', labelText: '혈종1' }], '', REF);
  assert.strictEqual(r.text, '종양의 이해\n(한미아)\n혈종1: 박세현/오철민');
  assert.deepStrictEqual(r.unmappedProfs, ['한미아']);
});

test('교수가 없으면 교수 줄을 생략한다 (빈 줄 아님)', () => {
  const r = composeCell([{ className: 'PBL3', professor: null,
    drafter: '홍재영', reviewer: '한유진', labelText: 'PBL1' }], '', REF);
  assert.strictEqual(r.text, 'PBL3\nPBL1: 홍재영/한유진');
});

test('배정이 없으면 1줄만', () => {
  const r = composeCell([{ className: '과정형성평가', professor: null,
    drafter: null, reviewer: null, labelText: null }], '', REF);
  assert.strictEqual(r.text, '과정형성평가');
});

test('# 메모는 맨 뒤에 보존한다', () => {
  const cur = '종양의 병기\n(류성엽, Upper GI Surg)\n혈종2: 강현승/임유진\n# 강의실 302';
  const r = composeCell([{ className: '종양의 병기', professor: '류성엽',
    drafter: '강현승', reviewer: '임유진', labelText: '혈종2' }], cur, REF);
  assert.ok(r.text.endsWith('\n# 강의실 302'));
});

test('정체불명 줄은 지우지 않고 보존하며 보고한다', () => {
  const cur = '종양의 병기\n(류성엽, Upper GI Surg)\n혈종2: 강현승/임유진\n보강 11/20';
  const r = composeCell([{ className: '종양의 병기', professor: '류성엽',
    drafter: '강현승', reviewer: '임유진', labelText: '혈종2' }], cur, REF);
  assert.ok(r.text.includes('보강 11/20'));
  assert.deepStrictEqual(r.unknownLines, ['보강 11/20']);
});

test('labelStart 가 학습부 블록의 문자 인덱스를 가리킨다', () => {
  const r = composeCell([{ className: 'AB', professor: null,
    drafter: '가', reviewer: '나', labelText: 'X1' }], '', REF);
  assert.strictEqual(r.text, 'AB\nX1: 가/나');
  assert.strictEqual(r.labelStart, 3);
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/compose-cell.test.js
```

기대: FAIL — `composeCell is not a function`

- [ ] **Step 3: `composeCell` 구현 (`src/compose.js` 에 추가)**

```js
/** 교수 줄 문자열. 약어가 없으면 이름만. */
function professorLine(name, ref) {
  const ab = ref.abbrev && ref.abbrev[name];
  return ab ? '(' + name + ', ' + ab + ')' : '(' + name + ')';
}

/**
 * 한 셀의 목표 문자열을 만든다.
 * @param {Array} items       이 셀에 들어갈 IR (통합이면 2개)
 * @param {string} currentText GY 시트 현재 값 (메모·정체불명 줄 보존용)
 * @param {object} ref        { abbrev, examKeywords }
 */
function composeCell(items, currentText, ref) {
  const classNames = [], profLines = [], labelLines = [];
  const unmappedProfs = [];

  for (const it of items) {
    if (it.className) {
      String(it.className).split('\n').forEach(s => { if (s.trim()) classNames.push(s); });
    }
    if (it.professor) {
      const line = professorLine(it.professor, ref);
      if (profLines.indexOf(line) < 0) profLines.push(line);
      if (!(ref.abbrev && ref.abbrev[it.professor]) && unmappedProfs.indexOf(it.professor) < 0) {
        unmappedProfs.push(it.professor);
      }
    }
    if (!it.labelText) continue;
    if (it.teams && it.teams.length > 1) {
      it.teams.forEach((t, i) => {
        labelLines.push(it.labelText + '-' + (i + 1) + ': ' + t.drafter + '/' + t.reviewer);
      });
    } else if (it.drafter || it.reviewer) {
      const line = it.labelText + ': ' + (it.drafter || '') + '/' + (it.reviewer || '');
      if (labelLines.indexOf(line) < 0) labelLines.push(line);
    } else if (it.teams && it.teams.length === 1) {
      const t = it.teams[0];
      const line = it.labelText + ': ' + t.drafter + '/' + t.reviewer;
      if (labelLines.indexOf(line) < 0) labelLines.push(line);
    }
  }

  // 보존 블록
  const prev = splitBlocks(currentText || '');
  const memo = prev.memo.slice();
  const unknownLines = prev.unknown.slice();

  const generated = classNames.concat(profLines).concat(labelLines);
  const all = generated.concat(unknownLines).concat(memo);
  const text = all.join('\n');

  let labelStart = -1;
  if (labelLines.length) {
    const before = classNames.concat(profLines);
    labelStart = before.length ? before.join('\n').length + 1 : 0;
  }
  return { text, labelStart, unknownLines, unmappedProfs };
}
```

`module.exports`에 `composeCell`, `professorLine`을 추가한다. `splitBlocks`는 GAS에서는 전역이지만 Node에서는 require가 필요하므로 `src/compose.js` 맨 위에 다음을 넣는다:

```js
if (typeof require !== 'undefined' && typeof splitBlocks === 'undefined') {
  var { splitBlocks } = require('./reference.js');
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/compose-cell.test.js
```

기대: 10 passing

- [ ] **Step 5: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/compose.js test/compose-cell.test.js
git commit -m "feat: 셀 조립 — 3블록 + 메모 보존 + 정체불명 줄 보고"
```

---

## Task 7: compose.js — 서식 목표값

**Files:**
- Modify: `C:\claude\timetable-sync\src\compose.js`
- Create: `C:\claude\timetable-sync\test\compose-format.test.js`

**Interfaces:**
- Consumes: `composeCell` (Task 6), 레퍼런스 `palette`·`examKeywords` (Task 3)
- Produces: `composeFormat(cellResult, subject, ref)` → `{ bg, baseColor, runs: [{start, color}] }`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/compose-format.test.js
const test = require('node:test');
const assert = require('node:assert');
const { composeCell, composeFormat } = require('../src/compose.js');

const REF = {
  abbrev: { '강성호': 'Clinical Path' },
  palette: { '혈종': '#FBE4D5', 'PBL': '#DEEAF6' },
  examKeywords: ['총괄평가']
};

test('배경색은 과목 팔레트에서 온다', () => {
  const c = composeCell([{ className: 'X', professor: null, drafter: '가', reviewer: '나', labelText: '혈종1' }], '', REF);
  const f = composeFormat(c, '혈종', REF);
  assert.strictEqual(f.bg, '#FBE4D5');
});

test('미등록 과목은 배경색 null (추측 금지)', () => {
  const c = composeCell([{ className: 'X', professor: null, drafter: null, reviewer: null, labelText: null }], '', REF);
  const f = composeFormat(c, '신경', REF);
  assert.strictEqual(f.bg, null);
});

test('학습부 블록에 파란 run 이 붙는다', () => {
  const c = composeCell([{ className: 'AB', professor: null, drafter: '가', reviewer: '나', labelText: 'X1' }], '', REF);
  const f = composeFormat(c, '혈종', REF);
  assert.strictEqual(f.baseColor, '#000000');
  assert.ok(f.runs.some(r => r.start === 3 && r.color === '#2E75B5'));
});

test('시험 키워드가 있으면 셀 전체가 빨강, run 없음', () => {
  const c = composeCell([{ className: '혈액종양학 총괄평가', professor: null, drafter: null, reviewer: null, labelText: null }], '', REF);
  const f = composeFormat(c, '혈종', REF);
  assert.strictEqual(f.baseColor, '#FF0000');
  assert.strictEqual(f.runs.length, 0);
});

test('과정형성평가는 시험이 아니다', () => {
  const c = composeCell([{ className: '과정형성평가', professor: null, drafter: null, reviewer: null, labelText: null }], '', REF);
  const f = composeFormat(c, '혈종', REF);
  assert.strictEqual(f.baseColor, '#000000');
});

test('메모 줄에는 회색 run 이 붙는다', () => {
  const c = composeCell([{ className: 'AB', professor: null, drafter: null, reviewer: null, labelText: null }], 'AB\n# 강의실 302', REF);
  const f = composeFormat(c, '혈종', REF);
  assert.ok(f.runs.some(r => r.color === '#808080'));
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/compose-format.test.js
```

기대: FAIL — `composeFormat is not a function`

- [ ] **Step 3: `composeFormat` 구현**

```js
/**
 * 셀 서식 목표값.
 * 정규화: 항상 기본색 + run 형태로 쓴다 (현재 시트의 두 표현을 하나로 통일).
 */
function composeFormat(cellResult, subject, ref) {
  const text = cellResult.text || '';
  const isExam = (ref.examKeywords || []).some(k => k && text.split('\n')[0].indexOf(k) >= 0);
  const bg = (ref.palette && ref.palette[subject]) || null;

  if (isExam) return { bg, baseColor: '#FF0000', runs: [] };

  const runs = [];
  if (cellResult.labelStart >= 0) runs.push({ start: cellResult.labelStart, color: '#2E75B5' });

  const memoIdx = text.indexOf('\n#');
  if (memoIdx >= 0) runs.push({ start: memoIdx + 1, color: '#808080' });
  else if (text.startsWith('#')) runs.push({ start: 0, color: '#808080' });

  runs.sort((a, b) => a.start - b.start);
  return { bg, baseColor: '#000000', runs };
}
```

`module.exports`에 `composeFormat`을 추가한다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/
```

기대: 전체 통과 (fixture 5 + reference 5 + parse 9 + number 6 + cell 10 + format 6 = 41)

- [ ] **Step 5: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/compose.js test/compose-format.test.js
git commit -m "feat: 서식 목표값 — 배경/시험빨강/학습부파랑/메모회색 정규화"
```

---

## Task 8: diff.js — 변경 목록 + 가드레일

**Files:**
- Create: `C:\claude\timetable-sync\src\diff.js`
- Create: `C:\claude\timetable-sync\test\diff.test.js`

**Interfaces:**
- Consumes: `composeCell`·`composeFormat` 결과
- Produces:
  - `diffCells(current, target)` → `{ changes: [{row, col, kind, before, after}], counts: {values, merges, deletes} }`
    - `current`/`target`: `{ 'r,c': {text, bg, baseColor, runs, merge} }`
    - `kind`: `'value' | 'format' | 'merge' | 'delete'`
  - `checkGuards(counts, extra, GUARD)` → `{ ok: boolean, reasons: string[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// test/diff.test.js
const test = require('node:test');
const assert = require('node:assert');
const { diffCells, checkGuards } = require('../src/diff.js');

const G = { values: 40, merges: 8, deletes: 10, unmapped: 5 };
const C = (text, extra) => Object.assign({ text, bg: null, baseColor: '#000000', runs: [], merge: null }, extra || {});

test('같으면 변경 0', () => {
  const cur = { '1,2': C('A') }, tgt = { '1,2': C('A') };
  assert.strictEqual(diffCells(cur, tgt).changes.length, 0);
});

test('값 변경을 잡는다', () => {
  const d = diffCells({ '1,2': C('A') }, { '1,2': C('B') });
  assert.strictEqual(d.changes.length, 1);
  assert.strictEqual(d.changes[0].kind, 'value');
  assert.strictEqual(d.counts.values, 1);
});

test('내용 있던 칸이 빈칸이 되면 delete 로 센다', () => {
  const d = diffCells({ '1,2': C('A') }, { '1,2': C('') });
  assert.strictEqual(d.changes[0].kind, 'delete');
  assert.strictEqual(d.counts.deletes, 1);
});

test('서식만 달라도 잡는다', () => {
  const d = diffCells({ '1,2': C('A') }, { '1,2': C('A', { bg: '#FBE4D5' }) });
  assert.strictEqual(d.changes[0].kind, 'format');
  assert.strictEqual(d.counts.values, 0);
});

test('병합 변경은 따로 센다', () => {
  const d = diffCells({ '1,2': C('A') }, { '1,2': C('A', { merge: 'r1c2:r2c2' }) });
  assert.strictEqual(d.counts.merges, 1);
});

test('가드레일: 임계 이하면 통과', () => {
  const r = checkGuards({ values: 5, merges: 1, deletes: 0 }, { unmapped: 0, weeksChanged: false }, G);
  assert.strictEqual(r.ok, true);
});

test('가드레일: 값 초과면 보류하고 이유를 준다', () => {
  const r = checkGuards({ values: 41, merges: 0, deletes: 0 }, { unmapped: 0, weeksChanged: false }, G);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reasons[0].includes('값 변경'));
});

test('가드레일: 주차 수 변동은 무조건 보류', () => {
  const r = checkGuards({ values: 1, merges: 0, deletes: 0 }, { unmapped: 0, weeksChanged: true }, G);
  assert.strictEqual(r.ok, false);
});

test('가드레일: 이유가 여러 개면 전부 보고한다', () => {
  const r = checkGuards({ values: 99, merges: 99, deletes: 99 }, { unmapped: 99, weeksChanged: true }, G);
  assert.strictEqual(r.reasons.length, 5);
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/diff.test.js
```

기대: FAIL — 모듈 없음

- [ ] **Step 3: `src/diff.js` 구현**

```js
/** 현재 상태와 목표 상태를 비교해 변경 목록과 카운트를 만든다. 순수 함수. */

function sameRuns(a, b) {
  const x = a || [], y = b || [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].start !== y[i].start || x[i].color !== y[i].color) return false;
  }
  return true;
}

function diffCells(current, target) {
  const changes = [];
  const counts = { values: 0, merges: 0, deletes: 0 };
  const keys = new Set(Object.keys(current).concat(Object.keys(target)));

  for (const key of keys) {
    const a = current[key] || { text: '', bg: null, baseColor: null, runs: [], merge: null };
    const b = target[key];
    if (!b) continue;                                  // 목표에 없는 좌표 = 무접촉
    const [row, col] = key.split(',').map(Number);

    if (a.merge !== b.merge) {
      counts.merges++;
      changes.push({ row, col, kind: 'merge', before: a.merge, after: b.merge });
    }
    if (a.text !== b.text) {
      if (a.text && !b.text) { counts.deletes++; changes.push({ row, col, kind: 'delete', before: a.text, after: '' }); }
      else { counts.values++; changes.push({ row, col, kind: 'value', before: a.text, after: b.text }); }
      continue;                                        // 값이 바뀌면 서식은 어차피 같이 쓴다
    }
    if (a.bg !== b.bg || a.baseColor !== b.baseColor || !sameRuns(a.runs, b.runs)) {
      changes.push({ row, col, kind: 'format', before: a.bg + '/' + a.baseColor, after: b.bg + '/' + b.baseColor });
    }
  }
  return { changes, counts };
}

function checkGuards(counts, extra, GUARD) {
  const reasons = [];
  if (counts.values > GUARD.values) reasons.push('값 변경 ' + counts.values + '칸 > ' + GUARD.values);
  if (counts.merges > GUARD.merges) reasons.push('병합 변경 ' + counts.merges + '건 > ' + GUARD.merges);
  if (counts.deletes > GUARD.deletes) reasons.push('삭제 ' + counts.deletes + '칸 > ' + GUARD.deletes);
  if (extra.unmapped > GUARD.unmapped) reasons.push('미등록 ' + extra.unmapped + '건 > ' + GUARD.unmapped);
  if (extra.weeksChanged) reasons.push('주차 수가 직전 실행과 다름');
  return { ok: reasons.length === 0, reasons };
}

if (typeof module !== 'undefined') module.exports = { diffCells, checkGuards, sameRuns };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "C:/claude/timetable-sync" && node --test test/diff.test.js
```

기대: 9 passing

- [ ] **Step 5: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/diff.js test/diff.test.js
git commit -m "feat: diff + 가드레일 5종"
```

---

## Task 9: io.js — 읽기·백업·쓰기

**Files:**
- Create: `C:\claude\timetable-sync\src\io.js`

**Interfaces:**
- Consumes: `config.js` 상수
- Produces:
  - `fetchOfficialHash()` → `{ hash, modifiedTime }`
  - `withOfficialCopy(fn)` → 변환 사본을 만들어 `fn(Spreadsheet)` 실행 후 **반드시 삭제**
  - `readGySheet()` → `{ cells: {'r,c': {...}}, weekIndex: {iso: rowIdx}, weeks: number }`
  - `backupGySheet()` → 백업 파일 id
  - `applyChanges(changes, target)` → 실제 쓰기
  - `bumpVersion()` → `{ from, to }`

이 태스크는 GAS API에 의존하므로 Node 단위 테스트가 없다. **검증은 GAS 편집기에서 함수를 직접 실행**한다.

- [ ] **Step 1: `src/io.js` 작성**

```js
/** Drive/Sheets 입출력. 순수 로직은 여기 두지 않는다. */

function fetchOfficialHash() {
  const f = Drive.Files.get(OFFICIAL_ID, {
    fields: 'md5Checksum,modifiedTime', supportsAllDrives: true
  });
  return { hash: f.md5Checksum || ('mt:' + f.modifiedTime), modifiedTime: f.modifiedTime };
}

/** 변환 사본을 만들어 fn 에 넘기고, 성공·실패와 무관하게 삭제한다. */
function withOfficialCopy(fn) {
  let id = null;
  try {
    const copy = Drive.Files.copy(
      { name: '_tmp_sync_' + Date.now(), mimeType: 'application/vnd.google-apps.spreadsheet' },
      OFFICIAL_ID, { supportsAllDrives: true });
    id = copy.id;
    return fn(SpreadsheetApp.openById(id));
  } finally {
    if (id) {
      try { Drive.Files.delete(id, { supportsAllDrives: true }); }
      catch (e) { console.error('임시 사본 삭제 실패 ' + id + ': ' + e); }
    }
  }
}

function colorToHex(c) {
  if (!c) return null;
  const s = String(c).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(s) ? s : null;
}

/** GY 시트를 읽어 셀 맵과 날짜→행 인덱스를 만든다. */
function readGySheet() {
  const ss = SpreadsheetApp.openById(GY_SHEET_ID);
  const sh = ss.getSheetByName(SHEET_TIMETABLE);
  const lastRow = sh.getLastRow();
  const rng = sh.getRange(1, 1, lastRow, 9);
  const values = rng.getDisplayValues();
  const bgs = rng.getBackgrounds();
  const rich = rng.getRichTextValues();

  const merged = {};
  sh.getRange(1, 1, lastRow, 9).getMergedRanges().forEach(r => {
    const key = 'r' + r.getRow() + 'c' + r.getColumn() + ':r' + r.getLastRow() + 'c' + r.getLastColumn();
    for (let rr = r.getRow(); rr <= r.getLastRow(); rr++)
      for (let cc = r.getColumn(); cc <= r.getLastColumn(); cc++) merged[rr + ',' + cc] = key;
  });

  const cells = {}, weekIndex = {};
  let weeks = 0;
  for (let r = 0; r < lastRow; r++) {
    const label = String(values[r][0] || '').trim();
    if (/^(\d+주|방학|미정)/.test(label)) {
      weeks++;
      for (let c = 2; c <= 8; c++) {
        const iso = normalizeSheetDate(values[r][c]);
        if (iso) weekIndex[iso] = r + 1;               // 1-indexed 헤더 행
      }
      continue;
    }
    if (!/^[1-8]$/.test(label)) continue;
    for (let c = 2; c <= 6; c++) {                     // C~G 만. H·I 는 무접촉
      const rt = rich[r][c];
      const runs = [];
      if (rt && rt.getRuns) {
        rt.getRuns().forEach(run => {
          const st = run.getStartIndex();
          const col = colorToHex(run.getTextStyle().getForegroundColor());
          if (st > 0 && col) runs.push({ start: st, color: col });
        });
      }
      const baseColor = colorToHex(rt && rt.getTextStyle && rt.getTextStyle().getForegroundColor()) || '#000000';
      cells[(r + 1) + ',' + (c + 1)] = {
        text: String(values[r][c] || ''),
        bg: colorToHex(bgs[r][c]),
        baseColor: baseColor,
        runs: runs,
        merge: merged[(r + 1) + ',' + (c + 1)] || null
      };
    }
  }
  return { cells, weekIndex, weeks };
}

/** '2026. 8. 31' 또는 '2026-08-31' → '2026-08-31' */
function normalizeSheetDate(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})/);
  if (!m) return null;
  return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
}

/** 쓰기 직전 전체 백업. 최근 10개만 남긴다. */
function backupGySheet() {
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HHmm");
  const copy = Drive.Files.copy({ name: '시간표백업_' + stamp }, GY_SHEET_ID, { supportsAllDrives: true });
  const list = Drive.Files.list({
    q: "name contains '시간표백업_' and trashed = false",
    orderBy: 'createdTime desc', fields: 'files(id,name)', pageSize: 50
  });
  (list.files || []).slice(10).forEach(f => {
    try { Drive.Files.delete(f.id); } catch (e) { console.error('백업 정리 실패 ' + f.name); }
  });
  return copy.id;
}

/** 변경 목록을 실제로 쓴다. 병합 → 값·서식 순서. */
function applyChanges(changes, target) {
  const ss = SpreadsheetApp.openById(GY_SHEET_ID);
  const sh = ss.getSheetByName(SHEET_TIMETABLE);

  changes.filter(c => c.kind === 'merge').forEach(c => {
    const t = target[c.row + ',' + c.col];
    const cell = sh.getRange(c.row, c.col);
    if (c.before) { try { cell.breakApart(); } catch (e) {} }
    if (t && t.merge) {
      const m = t.merge.match(/^r(\d+)c(\d+):r(\d+)c(\d+)$/);
      if (m) sh.getRange(Number(m[1]), Number(m[2]),
        Number(m[3]) - Number(m[1]) + 1, Number(m[4]) - Number(m[2]) + 1).merge();
    }
  });

  changes.filter(c => c.kind !== 'merge').forEach(c => {
    const t = target[c.row + ',' + c.col];
    if (!t) return;
    const cell = sh.getRange(c.row, c.col);
    const b = SpreadsheetApp.newRichTextValue().setText(t.text)
      .setTextStyle(SpreadsheetApp.newTextStyle().setForegroundColor(t.baseColor).build());
    (t.runs || []).forEach(run => {
      if (run.start < t.text.length) {
        b.setTextStyle(run.start, t.text.length,
          SpreadsheetApp.newTextStyle().setForegroundColor(run.color).build());
      }
    });
    cell.setRichTextValue(b.build());
    if (t.bg) cell.setBackground(t.bg);
  });
  SpreadsheetApp.flush();
}

/** 파일명 v97_ → v98_ */
function bumpVersion() {
  const f = Drive.Files.get(GY_SHEET_ID, { fields: 'name', supportsAllDrives: true });
  const m = String(f.name).match(/^v(\d+)_(.*)$/);
  if (!m) return { from: f.name, to: null, skipped: true };
  const to = 'v' + (Number(m[1]) + 1) + '_' + m[2];
  Drive.Files.update({ name: to }, GY_SHEET_ID, null, { supportsAllDrives: true });
  return { from: f.name, to: to, skipped: false };
}
```

- [ ] **Step 2: push 하고 `readGySheet()` 를 GAS 편집기에서 실행**

```bash
cd "C:/claude/timetable-sync" && clasp push --force
```

편집기에서 함수 `readGySheet` 실행 후, 로그가 없으므로 임시 확인 함수를 하나 만들어 돌린다:

```js
function _checkRead() {
  const g = readGySheet();
  console.log('주차 수 = ' + g.weeks);
  console.log('셀 수 = ' + Object.keys(g.cells).length);
  console.log('2026-08-31 헤더 행 = ' + g.weekIndex['2026-08-31']);
  console.log('샘플 = ' + JSON.stringify(g.cells['244,3']));
}
```

기대: `주차 수 = 49`, `2026-08-31 헤더 행 = 243`, 샘플 셀에 `종양의 이해\n(한미아)\n혈종1: ...`과 `bg=#FBE4D5`, `runs`에 `#2E75B5`.

값이 다르면 `readGySheet`의 좌표 계산을 고친다. **여기서 맞지 않으면 다음 태스크로 가지 않는다.**

- [ ] **Step 3: `backupGySheet()` 1회 실행 후 드라이브에서 확인**

기대: `시간표백업_2026-09-..T....` 파일이 생기고 열린다. 확인 후 수동 삭제해도 된다.

- [ ] **Step 4: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/io.js && git commit -m "feat: io — 해시·변환사본·읽기·백업·쓰기·v-bump"
```

---

## Task 10: notify.js — 카톡·Gmail·공지·변경로그

**Files:**
- Create: `C:\claude\timetable-sync\src\notify.js`
- Modify: `C:\claude\timetable-sync\SETUP.md`

**Interfaces:**
- Consumes: `config.js`
- Produces: `notify(subject, body)` · `appendNotice(isoDate, title, body)` · `appendChangelog(changes)` · `kakaoExchangeAuthCode()`

- [ ] **Step 1: `src/notify.js` 작성**

```js
/** 알림 채널. 시크릿은 스크립트 속성에서만 읽는다. */

const GMAIL_TO = 'sbfpo4@gmail.com';

function notify(subject, body) {
  try { MailApp.sendEmail(GMAIL_TO, '[시간표동기화] ' + subject, body); }
  catch (e) { console.error('메일 실패: ' + e); }
  try { kakaoSendToMe('[시간표동기화] ' + subject + '\n\n' + body); }
  catch (e) { console.error('카톡 실패: ' + e); }
}

function kakaoAccessToken() {
  const key = prop('KAKAO_REST_KEY'), refresh = prop('KAKAO_REFRESH_TOKEN');
  if (!key || !refresh) throw new Error('카카오 키/토큰 미설정');
  const res = UrlFetchApp.fetch('https://kauth.kakao.com/oauth/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'refresh_token', client_id: key, refresh_token: refresh }
  });
  const j = JSON.parse(res.getContentText());
  if (!j.access_token) throw new Error('토큰 갱신 실패: ' + res.getContentText());
  if (j.refresh_token) setProp('KAKAO_REFRESH_TOKEN', j.refresh_token);
  return j.access_token;
}

function kakaoSendToMe(text) {
  const res = UrlFetchApp.fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'post', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + kakaoAccessToken() },
    payload: { template_object: JSON.stringify({
      object_type: 'text', text: String(text).slice(0, 900),
      link: { web_url: 'https://pureart-art.github.io/Timetable26-1/' }
    }) }
  });
  if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
}

/** 1회용: kauth 에서 받은 code 를 refresh_token 으로 교환 */
function kakaoExchangeAuthCode() {
  const CODE = '<여기에 code 붙여넣기>';
  const res = UrlFetchApp.fetch('https://kauth.kakao.com/oauth/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'authorization_code', client_id: prop('KAKAO_REST_KEY'),
      redirect_uri: 'https://localhost', code: CODE }
  });
  const j = JSON.parse(res.getContentText());
  if (!j.refresh_token) throw new Error(res.getContentText());
  setProp('KAKAO_REFRESH_TOKEN', j.refresh_token);
  console.log('✅ refresh_token 저장 완료 — CODE 를 도로 지우고 저장하세요');
}

/**
 * 공지 탭에 기입. 날짜는 반드시 ISO 문자열.
 * 표시 서식 '2026. 9. 3' 이 들어가면 tt_notice_seen 이 영구 오염된다.
 */
function appendNotice(isoDate, title, body) {
  const ss = SpreadsheetApp.openById(GY_SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NOTICE);
  if (!sh) { console.error('공지 탭 없음 — 건너뜀'); return; }
  const last = sh.getLastRow();
  const vals = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getDisplayValues() : [];
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === isoDate) {
      const row = i + 2;
      sh.getRange(row, 2).setValue(title);
      sh.getRange(row, 3).setValue(String(vals[i][2] || '') + ' · ' + body);
      return;
    }
  }
  const row = last + 1;
  sh.getRange(row, 1).setNumberFormat('@').setValue(isoDate);   // 텍스트 서식 강제
  sh.getRange(row, 2).setValue(title);
  sh.getRange(row, 3).setValue(body);
}

function appendChangelog(changes) {
  const ss = SpreadsheetApp.openById(GY_SHEET_ID);
  let sh = ss.getSheetByName(SHEET_CHANGELOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_CHANGELOG);
    sh.appendRow(['실행시각', '좌표', '종류', '이전값', '새값']);
  }
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  const rows = changes.map(c => [stamp, 'R' + c.row + 'C' + c.col, c.kind,
    String(c.before || '').slice(0, 500), String(c.after || '').slice(0, 500)]);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}
```

- [ ] **Step 2: 카카오 앱 생성 및 토큰 발급 (GY 액션)**

`SETUP.md`에 draft-radar와 같은 형식으로 적는다. **draft-radar 앱을 재사용하지 않는다** — 양쪽이 각자 refresh_token을 갱신하다 서로를 무효화한다.

1. developers.kakao.com → 애플리케이션 추가, 이름 `timetable-sync`
2. REST API 키 복사 → GAS 스크립트 속성 `KAKAO_REST_KEY`
3. 카카오 로그인 ON, Redirect URI `https://localhost`
4. 동의항목 → 카카오톡 메시지 전송(`talk_message`) 사용
5. Client Secret은 **OFF 그대로**
6. 브라우저에서 `https://kauth.kakao.com/oauth/authorize?client_id=<키>&redirect_uri=https://localhost&response_type=code&scope=talk_message` → code 복사
7. `kakaoExchangeAuthCode()`의 CODE에 붙여넣고 실행 → 로그 확인 → **CODE 지우고 저장**

- [ ] **Step 3: 채널 테스트**

```js
function _testNotify() { notify('테스트', '카톡과 메일이 둘 다 오면 성공입니다.'); }
```

기대: 폰 카톡(나와의 채팅) + sbfpo4 Gmail 둘 다 수신.

- [ ] **Step 4: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/notify.js SETUP.md
git commit -m "feat: 카톡·Gmail·공지·변경로그 (공지 날짜 ISO 강제)"
```

---

## Task 11: Code.js — tick() 오케스트레이션 + 트리거

**Files:**
- Create: `C:\claude\timetable-sync\src\Code.js`

**Interfaces:**
- Consumes: 앞의 모든 모듈
- Produces: `tick()` · `installTrigger()` · `setDryRun(bool)`

- [ ] **Step 1: `src/Code.js` 작성**

```js
/** 오케스트레이션. 판단은 각 모듈이 하고 여기서는 순서만 정한다. */

function tick() {
  const started = new Date();
  try {
    const { hash, modifiedTime } = fetchOfficialHash();
    if (hash === prop('LAST_HASH')) return;                 // 대부분의 실행이 여기서 끝

    console.log('공식 파일 변경 감지: ' + modifiedTime);
    const ref = loadReference();
    const gy = readGySheet();

    const ir = withOfficialCopy(function (ss) {
      const tt = ss.getSheetByName('시간표');
      const asg = ss.getSheetByName('학습부배정');
      if (!tt || !asg) throw new Error('공식 파일에 시간표/학습부배정 탭이 없습니다');
      const merges = asg.getRange(1, 1, asg.getLastRow(), asg.getLastColumn())
        .getMergedRanges().map(r => ({
          r0: r.getRow() - 1, c0: r.getColumn() - 1,
          r1: r.getLastRow(), c1: r.getLastColumn()
        }));
      return parseOfficial(tt.getDisplayValues(), asg.getDisplayValues(), merges, 2026);
    });

    const subjectOf = makeSubjectResolver(gy, ref);
    const numbered = assignNumbers(ir, subjectOf);
    const built = buildTarget(numbered, gy, ref);

    const d = diffCells(gy.cells, built.target);
    const extra = { unmapped: built.unmappedProfs.length, weeksChanged:
      prop('LAST_WEEKS') && Number(prop('LAST_WEEKS')) !== gy.weeks };
    const guard = checkGuards(d.counts, extra, GUARD);

    if (!guard.ok) {
      notify('가드레일 보류 — 사람 확인 필요', guard.reasons.join('\n') + '\n\n' + summarize(d));
      setProp('LAST_HASH', hash);
      return;
    }
    if (!d.changes.length) { setProp('LAST_HASH', hash); return; }

    if (isDryRun()) {
      notify('[DRY-RUN] 반영하지 않음 — 변경 ' + d.changes.length + '건', summarize(d));
      setProp('LAST_HASH', hash);
      setProp('LAST_WEEKS', gy.weeks);
      setProp('LAST_OK', String(Date.now()));
      return;
    }

    backupGySheet();
    applyChanges(d.changes, built.target);
    appendChangelog(d.changes);
    const v = bumpVersion();
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    appendNotice(today, '시간표 변경 ' + d.changes.length + '건', summarize(d));

    let msg = summarize(d) + '\n\n버전 ' + v.from + ' → ' + v.to;
    if (built.renumbered.length) msg += '\n\n번호 변경: ' + built.renumbered.join(' · ');
    if (built.unknownLines.length) msg += '\n\n정체불명 줄(보존됨, # 를 붙여주세요):\n' + built.unknownLines.join('\n');
    if (built.unmappedProfs.length) msg += '\n\n약어 미등록: ' + built.unmappedProfs.join(', ');
    notify('반영 완료 ' + d.changes.length + '건', msg);

    setProp('LAST_HASH', hash);
    setProp('LAST_WEEKS', gy.weeks);
    setProp('LAST_OK', String(Date.now()));
  } catch (e) {
    console.error(e);
    notify('실행 실패', String(e && e.stack || e));
  } finally {
    checkHeartbeat(started);
  }
}

/** 24시간 동안 성공이 없으면 알린다 (조용한 죽음 방지) */
function checkHeartbeat(now) {
  const last = Number(prop('LAST_OK') || 0);
  const warned = Number(prop('HEARTBEAT_WARNED') || 0);
  if (!last) { setProp('LAST_OK', String(now.getTime())); return; }
  const stale = now.getTime() - last > 24 * 3600 * 1000;
  if (stale && now.getTime() - warned > 24 * 3600 * 1000) {
    setProp('HEARTBEAT_WARNED', String(now.getTime()));
    notify('24시간 무성공', '마지막 성공: ' + new Date(last));
  }
}

function summarize(d) {
  return d.changes.slice(0, 20).map(c =>
    'R' + c.row + 'C' + c.col + ' [' + c.kind + '] ' +
    String(c.before || '').replace(/\n/g, ' / ').slice(0, 40) + ' → ' +
    String(c.after || '').replace(/\n/g, ' / ').slice(0, 40)
  ).join('\n') + (d.changes.length > 20 ? '\n… 외 ' + (d.changes.length - 20) + '건' : '');
}

/** 과목 판정: GY 시트의 기존 배경색 → 과목. 모르면 null. */
function makeSubjectResolver(gy, ref) {
  const byColor = {};
  Object.keys(ref.palette || {}).forEach(subj => { byColor[ref.palette[subj]] = subj; });
  return function (item) {
    const row = gy.weekIndex[item.date];
    if (!row) return null;
    const key = (row + periodOffset(item.period)) + ',' + (item.weekday + 2);
    const cell = gy.cells[key];
    if (cell && cell.bg && byColor[cell.bg]) return byColor[cell.bg];
    return null;
  };
}

/** 교시 → 헤더 행으로부터의 오프셋 (1~4 = +1~+4, 점심 = +5, 5~8 = +6~+9, 저녁 = +10) */
function periodOffset(period) { return period <= 4 ? period : period + 1; }

/** IR → 좌표별 목표 셀 */
function buildTarget(items, gy, ref) {
  const bySlot = {};
  const unknownLines = [], unmappedProfs = [], renumbered = [];

  items.forEach(function (x) {
    const row = gy.weekIndex[x.date];
    if (!row) return;                                   // 26-1·미대응 날짜 = 무접촉
    const r = row + periodOffset(x.period), c = x.weekday + 2;
    if (c > COL_LAST_WRITABLE) return;                  // 토·일 무접촉
    const key = x.mergeGroup ? 'g:' + x.mergeGroup : r + ',' + c;
    (bySlot[key] = bySlot[key] || { r: r, c: c, items: [] }).items.push(x);
    if (r < bySlot[key].r) { bySlot[key].r = r; }
  });

  const target = {};
  Object.keys(bySlot).forEach(function (key) {
    const slot = bySlot[key];
    const anchor = slot.r + ',' + slot.c;
    const cur = (gy.cells[anchor] || {}).text || '';
    const built = composeCell(slot.items, cur, ref);
    const subj = slot.items[0].subject || null;
    const fmt = composeFormat(built, subj, ref);

    const span = slot.items.length > 1 ? slot.items.length : 1;
    const merge = span > 1
      ? 'r' + slot.r + 'c' + slot.c + ':r' + (slot.r + span - 1) + 'c' + slot.c
      : ((gy.cells[anchor] || {}).merge || null);

    target[anchor] = { text: built.text, bg: fmt.bg, baseColor: fmt.baseColor,
      runs: fmt.runs, merge: merge };

    // 통합으로 흡수된 아래 셀은 비운다
    for (let i = 1; i < span; i++) {
      target[(slot.r + i) + ',' + slot.c] = { text: '', bg: fmt.bg,
        baseColor: '#000000', runs: [], merge: merge };
    }

    built.unknownLines.forEach(l => unknownLines.push('R' + slot.r + 'C' + slot.c + ': ' + l));
    built.unmappedProfs.forEach(p => { if (unmappedProfs.indexOf(p) < 0) unmappedProfs.push(p); });

    const prevLabel = (cur.split('\n').find(l => /^[가-힣A-Za-z]+\d+(-\d)?\s*:/.test(l)) || '').split(':')[0];
    const newLabel = (built.text.split('\n').find(l => /^[가-힣A-Za-z]+\d+(-\d)?\s*:/.test(l)) || '').split(':')[0];
    if (prevLabel && newLabel && prevLabel !== newLabel) renumbered.push(prevLabel + ' → ' + newLabel);
  });

  return { target, unknownLines, unmappedProfs, renumbered };
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(15).create();
  console.log('15분 트리거 설치 완료');
}

function setDryRun(on) { setProp('DRY_RUN', on ? 'true' : 'false'); console.log('DRY_RUN = ' + on); }
```

- [ ] **Step 2: push 후 dry-run 으로 1회 수동 실행**

```bash
cd "C:/claude/timetable-sync" && clasp push --force
```

편집기에서 `setDryRun(true)` → `tick()` 실행.

기대: 첫 실행이므로 `LAST_HASH`가 없어 전체 경로를 탄다. 카톡·메일로 `[DRY-RUN] 반영하지 않음 — 변경 N건`이 온다.

**여기가 진짜 검증 지점이다.** 변경 N건이 0에 가까워야 한다 — GY가 08-31에 손으로 맞춰둔 상태와 자동화 결과가 같아야 하기 때문이다. 수십 건이 나오면 그 diff 목록이 곧 규칙 오류 목록이다. `summarize` 출력을 보고 `compose`·`parse`를 고친 뒤 다시 돌린다. **차이가 설명 가능해질 때까지 반복한다.**

- [ ] **Step 3: 트리거 설치**

편집기에서 `installTrigger()` 실행. 트리거 목록(⏰)에서 15분 주기가 보이는지 확인.

- [ ] **Step 4: 커밋**

```bash
cd "C:/claude/timetable-sync"
git add src/Code.js && git commit -m "feat: tick 오케스트레이션 + 15분 트리거 + dry-run"
```

---

## Task 12: SETUP.md·README + 백업 편입 + 운영 인계

**Files:**
- Modify: `C:\claude\timetable-sync\SETUP.md`
- Create: `C:\claude\timetable-sync\README.md`
- Modify: `C:\claude\RESTORE.md` (백업 런북에 항목 추가)

- [ ] **Step 1: `README.md` 작성**

운영자가 알아야 할 것만: 무엇을 하는가, 실행 계정, 켜고 끄는 법(`setDryRun`), 문제 생겼을 때 첫 수(`diagnose()`), 롤백 방법(백업 사본 열어서 `시간표` 탭 복사), 무접촉 영역 목록.

- [ ] **Step 2: `SETUP.md` 완성**

draft-radar 형식. 1단계 GAS 프로젝트 · 2단계 시트 공유 · 3단계 카카오 앱 · 4단계 토큰 · 5단계 채널 테스트 · 6단계 `bootstrapReferenceTab()` · 7단계 레퍼런스 탭 과목명 채우기 · 8단계 dry-run · 9단계 `setDryRun(false)`.

**7단계 주의**: 부트스트랩은 색만 넣는다. **과목명 칸은 GY가 채워야 한다** — 색이 어느 과목인지는 사람만 안다.

- [ ] **Step 3: 월 백업에 편입**

`C:\claude\RESTORE.md`에 `timetable-sync` 항목 추가: 코드는 git(claude-hub), **시크릿은 백업하지 않음**(카카오 토큰은 재발급). 복구 절차는 SETUP.md 3~4단계 재실행.

- [ ] **Step 4: 2주 dry-run 관찰 후 실운영 전환**

2주 동안 카톡 알림을 보며 확인할 것:
- 가드레일 오발동 0건
- 정체불명 줄 보고가 실제 GY 메모인지
- 변경 건수가 상식적인지(휴강 하나 = 한 자릿수)

전부 맞으면 `setDryRun(false)` 실행. 스펙 §13 성공 기준 5개를 하나씩 확인하고 결과를 README에 적는다.

- [ ] **Step 5: 커밋 및 push**

```bash
cd "C:/claude/timetable-sync"
git add -A && git commit -m "docs: SETUP·README + 백업 편입"
cd "C:/Users/wbnuj/timetable-pwa" && git pull --rebase && git push
```
