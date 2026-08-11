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
