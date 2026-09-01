/* 브라우저 검증 하니스 — http://localhost:8741 프리뷰의 페이지 컨텍스트에 붙여넣어 실행한다.
   각 check*()는 [{name, pass, detail}] 를 반환하고, runAll()이 전부 모아 출력한다.
   테스트 러너가 없는 레포라 이 파일이 회귀 방지선이다. */

/* --- 합성 시트: parseGrid에 먹일 최소 형태의 Sheets API 응답 --- */
function fakeCellNum(n) { return { effectiveValue: { numberValue: n }, formattedValue: String(n) }; }
function fakeCellStr(s) { return { formattedValue: s }; }
/* 헤더 1행(A=라벨, C~I=날짜) + 교시행(빈 칸). 행 수는 app.js의 PERIODS가 정본 */
function fakeWeekRows(label, monday) {
  const hdr = { values: [fakeCellStr(label), fakeCellStr('')] };
  for (let d = 0; d < 7; d++) hdr.values.push(fakeCellNum(monday + d));
  const rows = [hdr];
  for (let p = 0; p < PERIODS.length; p++) rows.push({ values: [] });
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

  /* 빈 라벨 주: 유령 구분자가 남으면 안 된다. 라이브 시트엔 지금 빈 라벨이 없지만,
     번들 스냅샷은 갱신 주기가 달라 실제로 담고 있었다 — 합성 주를 끼워 직접 검증한다. */
  const lastW = state.weeks[state.weeks.length - 1];
  state.weeks.push({ label: '', monday: lastW.monday + 7, cells: [], holidays: [false, false, false, false, false, false, false] });
  const bIdx = state.weeks.length - 1;
  state.view = 'week'; state.weekIdx = bIdx; state.dayIdx = 0; render();
  const blankWeekTitle = t();
  state.view = 'two'; state.weekIdx = bIdx - 1; render();
  const blankTwoTitle = t();
  const twLabels = Array.prototype.map.call(document.querySelectorAll('.twlabel'), e => e.textContent.trim());
  state.weeks.pop();
  out.push({
    name: '제목 · 빈 라벨에 유령 구분자가 안 남는다',
    pass: blankWeekTitle === '의학과 시간표'
       && !/–\s*$/.test(blankTwoTitle)
       && !twLabels.some(s => s.indexOf('·') === 0),
    detail: 'week="' + blankWeekTitle + '" two="' + blankTwoTitle + '" tw=' + JSON.stringify(twLabels),
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
  /* 이 값은 checkNoticeUI가 끝에 renderNoticeDot()을 부르며 되돌린다 — runAll 안에서 치유됨 */
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

  /* 읽음 판정 — 이 검증은 공유 localStorage를 건드리므로 원래 값을 저장하고 되돌린다.
     안 되돌리면 실배포 페이지에서 하니스를 돌렸을 때 진짜 공지가 '이미 읽음'으로 보인다. */
  const items = parseNotices([['2026-08-12', 'x', ''], ['2026-08-01', 'y', '']]);
  let savedSeen = null;
  try { savedSeen = localStorage.getItem('tt_notice_seen'); localStorage.removeItem('tt_notice_seen'); } catch (e) {}
  const beforeSeen = hasUnreadNotices(items);
  markNoticesSeen(items);
  const afterSeen = hasUnreadNotices(items);
  const withNewer = hasUnreadNotices(parseNotices([['2026-08-20', 'z', '']]));
  try {
    if (savedSeen === null) localStorage.removeItem('tt_notice_seen');
    else localStorage.setItem('tt_notice_seen', savedSeen);
  } catch (e) {}
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

function checkNoticeUI() {
  const out = [];
  const $$ = id => document.getElementById(id);
  const save = { status: noticeState.status, items: noticeState.items, at: noticeState.at };
  /* openNotices()가 refreshNotices()를 부른다 — 비동기 응답이 어서션 뒤에 noticeState를
     덮어써 테스트가 들쭉날쭉해지지 않도록, 테스트 동안 스텁으로 갈아끼운다.
     최상위 function 선언은 전역 객체의 쓰기 가능한 속성이라 이 교체가 실제로 먹는다. */
  const realRefresh = window.refreshNotices;
  window.refreshNotices = async () => {};
  /* 이 검증은 openNotices()를 실제로 불러 읽음 기록과 접힘 상태를 바꾼다 — 둘 다 되돌린다.
     checkNoticeData에서 이미 한 번 물린 것과 같은 부류다. */
  let savedSeen = null;
  try { savedSeen = localStorage.getItem('tt_notice_seen'); localStorage.removeItem('tt_notice_seen'); } catch (e) {}
  const setState = (status, items, at) => {
    noticeState.status = status; noticeState.items = items; noticeState.at = at || null;
    renderNoticePanel(); renderNoticeDot();
  };
  const text = () => $$('ntcBody').textContent;

  out.push({ name: '공지UI · 패널 요소가 있다', pass: !!$$('ntcpop') && !!$$('ntcBody') && !!$$('ntcClose'), detail: '' });

  /* 상태별 문구 — '없음'과 '못 읽음'이 구분돼야 한다 */
  setState('empty', []);
  const emptyMsg = text();
  setState('no-tab', []);
  const noTabMsg = text();
  setState('error', []);
  const errMsg = text().indexOf('불러오지 못했어요') >= 0;
  out.push({
    name: '공지UI · 빈 공지와 탭 없음이 서로 다른 문구다',
    pass: emptyMsg.indexOf('아직 공지가 없어요') >= 0 && noTabMsg.indexOf('찾지 못했어요') >= 0 && emptyMsg !== noTabMsg,
    detail: 'empty="' + emptyMsg + '" noTab="' + noTabMsg + '"',
  });
  out.push({ name: '공지UI · 로드 실패는 "불러오지 못했어요"', pass: errMsg, detail: text().slice(0, 40) });

  /* 실패 상태에서는 점이 뜨지 않는다 (tt_notice_seen은 위에서 이미 비워 둠) */
  setState('error', []);
  out.push({ name: '공지UI · 아는 공지가 0건이면 점이 안 뜬다', pass: $$('ntcDot').hidden && $$('btnMenuDot').hidden, detail: 'ntcDot=' + $$('ntcDot').hidden + ' btnDot=' + $$('btnMenuDot').hidden });

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
  noticeExpanded = false;              /* '더 보기'를 눌렀던 것을 되돌린다 */
  try {
    if (savedSeen === null) localStorage.removeItem('tt_notice_seen');
    else localStorage.setItem('tt_notice_seen', savedSeen);
  } catch (e) {}
  setState(save.status, save.items, save.at);
  return out;
}

/* --- 개인 하이라이트 v2: 이행·타입 범위·우선순위·멱등 복원.
       localStorage 두 키를 건드리므로 반드시 원상복구한다(실기기에서 돌려도 무해해야 함). --- */
function checkHighlights() {
  const out = [];
  const KEYS = [HL_KEY, HL_KEY2];
  const saved = {};
  KEYS.forEach(k => { saved[k] = localStorage.getItem(k); });
  try {
    /* 1) 구버전 이행: '(' 시작 = 교수, 그 외 = 학생, 색은 기존 빨강 */
    localStorage.removeItem(HL_KEY2);
    localStorage.setItem(HL_KEY, '이강윤\n(정아리, Nuc Med)\n');
    const mig = getEntries();
    out.push({
      name: '구 tt_hl 키워드가 학생/교수 항목으로 이행된다',
      pass: mig.length === 2 && mig[0].type === 'stu' && mig[0].name === '이강윤' && mig[0].color === HL_RED &&
            mig[1].type === 'prof' && mig[1].name === '(정아리, Nuc Med)',
      detail: JSON.stringify(mig),
    });

    /* 2) tt_hl2가 존재하면(빈 배열 포함) 구버전을 무시한다 — 전부 삭제 후 저장이 유지돼야 함 */
    localStorage.setItem(HL_KEY2, '[]');
    out.push({
      name: '빈 tt_hl2가 구 tt_hl보다 우선한다',
      pass: getEntries().length === 0,
      detail: JSON.stringify(getEntries()),
    });

    /* 3) 깨진 tt_hl2는 빈 목록으로 (구버전 폴백 금지 — 반쯤 이행된 상태로 안 돌아감) */
    localStorage.setItem(HL_KEY2, '{broken');
    out.push({ name: '깨진 tt_hl2는 빈 목록', pass: getEntries().length === 0, detail: localStorage.getItem(HL_KEY2) });

    /* 4) 타입이 대상 줄을 좁힌다: 학생=초안자/검안자 줄(l3)만, 교수=괄호줄(l2)만 */
    const stu = [{ name: '이강윤', type: 'stu', color: '#1A73E8' }];
    const prof = [{ name: '(정아리, Nuc Med)', type: 'prof', color: '#188038' }];
    out.push({
      name: '학생 항목은 초안자/검안자 줄에서만 매칭된다',
      pass: entryColorFor('초안: 이강윤/박정연', stu) === '#1A73E8' &&
            entryColorFor('(이강윤, EM)', stu) === null &&
            entryColorFor('이강윤개론 총론', stu) === null,
      detail: [entryColorFor('초안: 이강윤/박정연', stu), entryColorFor('(이강윤, EM)', stu), entryColorFor('이강윤개론 총론', stu)].join(' | '),
    });
    out.push({
      name: '교수 항목은 괄호줄에서만 매칭된다',
      pass: entryColorFor('(정아리, Nuc Med)', prof) === '#188038' &&
            entryColorFor('초안: 정아리/홍길동', prof) === null,
      detail: [entryColorFor('(정아리, Nuc Med)', prof), entryColorFor('초안: 정아리/홍길동', prof)].join(' | '),
    });

    /* 5) 한 줄에 두 항목이 걸리면 목록 위 항목 우선 (초안자/검안자 한 줄에 두 명) */
    const both = [
      { name: '박정연', type: 'stu', color: '#7B1FA2' },
      { name: '이현서', type: 'stu', color: '#C2185B' },
    ];
    out.push({
      name: '겹칠 때 목록 위 항목 색이 이긴다',
      pass: entryColorFor('검안: 이현서/박정연', both) === '#7B1FA2',
      detail: String(entryColorFor('검안: 이현서/박정연', both)),
    });

    /* 6) applyHighlights 멱등 복원: 항목 제거 시 원색으로 돌아온다 */
    const weeks = [{ cells: [{ lines: [
      { text: '초안: 이강윤/박정연', color: '#2E75B6' },
      { text: '(정아리, Nuc Med)', color: '#555555' },
      { text: '해부학 총론', color: '#000000' },
    ] }] }];
    applyHighlights(weeks, stu.concat(prof));
    const colored = weeks[0].cells[0].lines.map(l => l.color);
    applyHighlights(weeks, []);
    const restored = weeks[0].cells[0].lines.map(l => l.color);
    out.push({
      name: '항목 적용 후 제거하면 원색으로 복원된다',
      pass: JSON.stringify(colored) === JSON.stringify(['#1A73E8', '#188038', '#000000']) &&
            JSON.stringify(restored) === JSON.stringify(['#2E75B6', '#555555', '#000000']),
      detail: 'colored ' + JSON.stringify(colored) + ' restored ' + JSON.stringify(restored),
    });

    /* 7) 설정 화면 파스텔 변환: 흰색과 반씩 — 시간표에 칠하는 색은 이 함수를 안 거친다 */
    out.push({
      name: 'hlPastel은 원색을 흰색과 반씩 섞는다',
      pass: hlPastel('#FF0000') === '#FF8080' && hlPastel('#188038') === '#8CC09C',
      detail: hlPastel('#FF0000') + ' / ' + hlPastel('#188038'),
    });

    /* 8) 스와치 표시는 파스텔이어도 dataset(저장값)은 원색 — 표시용 변환이 저장 경로에 새면 안 됨 */
    const rowsEl = document.getElementById('hlRows');
    if (rowsEl) {
      rowsEl.innerHTML = '';   /* openHlEditor가 열 때마다 다시 그리므로 비워도 안전 */
      hlAddRow({ name: '검증용', type: 'stu', color: '#FF0000' });
      const r0 = rowsEl.querySelector('.hlrow');
      out.push({
        name: '스와치 표시는 파스텔, 저장값은 원색 유지',
        pass: r0.dataset.color === '#FF0000' &&
              r0.querySelector('.hlsw').style.background === 'rgb(255, 128, 128)',
        detail: r0.dataset.color + ' / ' + r0.querySelector('.hlsw').style.background,
      });
      rowsEl.innerHTML = '';
    }
  } finally {
    KEYS.forEach(k => {
      try {
        if (saved[k] === null) localStorage.removeItem(k);
        else localStorage.setItem(k, saved[k]);
      } catch (e) {}
    });
  }
  return out;
}

function runAll() {
  const checks = [checkParser, checkTitle, checkMenu, checkNoticeData, checkNoticeUI, checkHighlights];
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
