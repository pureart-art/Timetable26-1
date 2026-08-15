/**
 * 시간표 시트에 '저녁(18:00-19:00)' 행을 주 블록마다 한 줄씩 넣는다.
 *
 * 쓰는 법: 시트에서 확장 프로그램 → Apps Script → 이 파일 내용을 붙여넣고
 *          addDinnerRows 를 실행. 되돌리려면 removeDinnerRows.
 *
 * 먼저 사본(파일 → 사본 만들기)에서 한 번 돌려보고 눈으로 확인한 뒤 원본에 적용하기를 권함.
 *
 * 규칙(앱 파서와 같은 계약):
 *  - 주 헤더 = C~I에 날짜가 3개 이상인 행
 *  - 블록 = 헤더 1행 + 교시 9행(1~4·점심·5~8) → 8교시 행 바로 아래에 한 줄 삽입
 *  - 삽입 행의 C~I에는 날짜를 절대 넣지 않는다(넣으면 파서가 주 헤더로 오인)
 *  - A는 비우고(점심 행과 같은 방식) B에만 시간 라벨을 쓴다
 *
 * 재실행해도 안전: 이미 11행인 블록은 건너뛴다.
 */

var TAB_NAME = '시간표';
var PERIODS_BEFORE = 9;              // 헤더 아래 기존 교시 행 수(1~4·점심·5~8)
var DINNER_A = '';                   // 교시 번호 없음 — 점심 행과 동일
var DINNER_B = '(18:00-19:00)';

function isDateish_(v) {
  if (v instanceof Date) return true;
  return typeof v === 'number' && v > 20000 && v < 80000;   // 구글 시트 날짜 시리얼
}

/** C~I에 날짜가 3개 이상인 행(1-based)들 */
function findHeaderRows_(sh) {
  var lastRow = sh.getLastRow();
  var vals = sh.getRange(1, 3, lastRow, 7).getValues();     // C~I
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var n = 0;
    for (var c = 0; c < vals[i].length; c++) if (isDateish_(vals[i][c])) n++;
    if (n >= 3) out.push(i + 1);
  }
  return out;
}

function addDinnerRows() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB_NAME);
  if (!sh) throw new Error('탭을 찾을 수 없습니다: ' + TAB_NAME);

  var headers = findHeaderRows_(sh);
  if (!headers.length) throw new Error('주 헤더(C~I에 날짜 3개 이상)를 찾지 못했습니다');

  /* 아래에서 위로 — 삽입 지점이 항상 그 블록의 아래쪽이라 위 블록 행 번호가 안 밀린다 */
  var inserted = 0, skipped = 0;
  for (var k = headers.length - 1; k >= 0; k--) {
    var h = headers[k];
    var next = (k + 1 < headers.length) ? headers[k + 1] : null;
    var lastPeriodRow = h + PERIODS_BEFORE;                 // 8교시 행

    /* 이미 넣은 블록은 건너뛴다.
       다음 헤더가 있으면 블록 간격으로, 마지막 블록은 B열 라벨로 판정한다. */
    var already = next
      ? (next - h) > (PERIODS_BEFORE + 1)
      : String(sh.getRange(lastPeriodRow + 1, 2).getValue()).indexOf('18:00') >= 0;
    if (already) { skipped++; continue; }

    sh.insertRowAfter(lastPeriodRow);                       // 위 행 서식을 물려받는다
    var nr = lastPeriodRow + 1;
    sh.getRange(nr, 1, 1, 9).clearContent();                // A~I 비움(날짜가 들어가면 안 된다)
    sh.getRange(nr, 1).setValue(DINNER_A);
    sh.getRange(nr, 2).setValue(DINNER_B);
    inserted++;
  }

  SpreadsheetApp.getActive().toast(
    '삽입 ' + inserted + '개 · 건너뜀 ' + skipped + '개', '저녁 행 추가 완료', 10);
}

/** 되돌리기: A가 비어 있고 B가 18:00-19:00 인 행만 지운다 */
function removeDinnerRows() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB_NAME);
  if (!sh) throw new Error('탭을 찾을 수 없습니다: ' + TAB_NAME);

  var lastRow = sh.getLastRow();
  var ab = sh.getRange(1, 1, lastRow, 2).getValues();
  var removed = 0;
  for (var i = ab.length - 1; i >= 0; i--) {               // 아래에서 위로
    var a = String(ab[i][0]).trim(), b = String(ab[i][1]);
    if (a === '' && b.indexOf('18:00') >= 0 && b.indexOf('19:00') >= 0) {
      sh.deleteRow(i + 1);
      removed++;
    }
  }
  SpreadsheetApp.getActive().toast('삭제 ' + removed + '개', '저녁 행 되돌리기 완료', 10);
}
