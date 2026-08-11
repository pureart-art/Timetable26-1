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

/* ===== UI ===== */
let noticeExpanded = false;   /* '더 보기'를 눌렀는지 (패널 닫으면 초기화) */

function noticeStatusMessage() {
  switch (noticeState.status) {
    case 'loading': return '공지를 불러오는 중이에요…';
    case 'empty':
    case 'no-tab':  return '아직 공지가 없어요.';
    /* stale이 여기까지 오는 건 캐시가 '0건'일 때뿐이다(항목이 있으면 목록이 그려진다).
       아래 '마지막 확인'이 함께 붙어 "언제 기준으로 0건인지"가 드러난다. */
    case 'stale':   return '아직 공지가 없어요.';
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
    appendNoticeStamp(body);   /* 0건일 때도 "언제 기준 0건인지"를 붙인다 */
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

  appendNoticeStamp(body);
}

/* 캐시를 보여주는 중이면 언제 확인한 것인지 밝힌다. 목록이 있든 0건이든 똑같이 붙는다 —
   "못 읽어서 옛 걸 보여주는 중"이라는 사실이 두 경우 모두에서 드러나야 한다. */
function appendNoticeStamp(body) {
  if (noticeState.status !== 'stale' || !noticeState.at) return;
  const at = document.createElement('div');
  at.className = 'ntcmsg';
  at.textContent = '마지막 확인 ' +
    noticeState.at.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  body.appendChild(at);
}

function renderNoticeDot() {
  const unread = hasUnreadNotices(noticeState.items);
  const a = document.getElementById('ntcDot');
  const b = document.getElementById('btnMenuDot');
  if (a) a.hidden = !unread;
  if (b) b.hidden = !unread;
}

/* DOM 조회는 전부 가드한다. bindNotices()는 main()의 첫 문장인 bindUI()에서 불리므로,
   여기서 던지면 시간표가 그려지기도 전에 앱 전체가 죽는다 — "공지 실패가 시간표를 막지
   않는다"는 이 파일의 존재 이유가 바로 이 지점에서 깨진다. */
function openNotices() {
  const pop = document.getElementById('ntcpop');
  if (!pop) return;
  noticeExpanded = false;
  renderNoticePanel();
  pop.hidden = false;
  markNoticesSeen(noticeState.items);
  renderNoticeDot();
  refreshNotices(false);   /* 열 때 갱신 시도 — 30분 스로틀에 걸리면 조용히 넘어간다 */
}

function bindNotices() {
  const pop = document.getElementById('ntcpop');
  const close = document.getElementById('ntcClose');
  if (!pop || !close) return;
  close.addEventListener('click', () => { pop.hidden = true; });
  pop.addEventListener('click', e => { if (e.target === pop) pop.hidden = true; });
}
