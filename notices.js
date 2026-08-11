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
