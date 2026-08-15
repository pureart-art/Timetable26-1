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

/**
 * 진단: 스크립트가 실제로 어떤 파일의 어떤 값을 보고 있는지 로그로 찍는다.
 * addDinnerRows가 '주 헤더를 찾지 못했습니다'로 실패하면 먼저 이걸 실행할 것.
 * 앱이 읽는 파일 ID는 1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4 — 다르면 파일이 잘못된 것.
 */
function diagnose() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('활성 스프레드시트가 없습니다 — 시트에서 확장 프로그램 → Apps Script로 열었는지 확인');
  Logger.log('파일 이름: %s', ss.getName());
  Logger.log('파일 ID  : %s', ss.getId());
  Logger.log('URL      : %s', ss.getUrl());
  Logger.log('탭 목록  : %s', ss.getSheets().map(function (s) { return '[' + s.getName() + ']'; }).join(' '));

  var sh = ss.getSheetByName(TAB_NAME);
  if (!sh) { Logger.log('!! 탭 "%s" 없음 — 위 탭 목록의 정확한 이름(공백 포함)을 확인', TAB_NAME); return; }
  Logger.log('마지막 행: %s / 마지막 열: %s', sh.getLastRow(), sh.getLastColumn());

  var n = Math.min(12, sh.getLastRow());
  var vals = sh.getRange(1, 1, n, 9).getValues();
  for (var i = 0; i < n; i++) {
    var types = [];
    for (var c = 2; c < 9; c++) {          // C~I
      var v = vals[i][c];
      types.push(v instanceof Date ? 'Date' : (v === '' ? '-' : typeof v));
    }
    Logger.log('%s행 A=%s B=%s | C~I 타입: %s | 날짜로 센 개수: %s',
      i + 1, vals[i][0], vals[i][1], types.join(','), countDateish_(vals[i]));
  }
  Logger.log('→ 찾은 헤더 행: %s', JSON.stringify(findHeaderRows_(sh).slice(0, 10)));
}

function countDateish_(row) {
  var n = 0;
  for (var c = 2; c < 9; c++) if (isDateish_(row[c])) n++;
  return n;
}

function addDinnerRows() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('활성 스프레드시트가 없습니다 — 시트에서 확장 프로그램 → Apps Script로 열었는지 확인');
  var sh = ss.getSheetByName(TAB_NAME);
  if (!sh) {
    throw new Error('탭을 찾을 수 없습니다: ' + TAB_NAME + ' / 이 파일의 탭: '
      + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
  }

  var headers = findHeaderRows_(sh);
  if (!headers.length) {
    /* 실패할 땐 증거와 함께 실패한다 — 파일이 틀린 건지, 값 타입이 다른 건지 바로 갈리게 */
    var probe = sh.getRange(1, 3, Math.min(3, sh.getLastRow()), 7).getValues();
    throw new Error('주 헤더(C~I에 날짜 3개 이상)를 찾지 못했습니다.'
      + ' 파일="' + ss.getName() + '" ID=' + ss.getId()
      + ' 마지막행=' + sh.getLastRow()
      + ' 1~3행 C~I 샘플=' + JSON.stringify(probe)
      + ' — diagnose()를 실행해 로그를 확인하세요.');
  }

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
