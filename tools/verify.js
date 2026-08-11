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

function runAll() {
  const checks = [checkParser, checkTitle, checkMenu, checkNoticeData];
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
