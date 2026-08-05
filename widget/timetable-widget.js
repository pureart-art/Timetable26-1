// TIMETABLE_WIDGET v13 — 의학과 2학년 시간표 Scriptable 위젯 본체
// 로더가 이 파일을 받아 실행합니다. 직접 수정할 일은 없습니다.
// 기본은 이번 주 주간 격자. 위젯 파라미터에 정수 N을 넣으면 N주 이동해 표시:
// 양수=미래(1=다음 주, 3=3주 뒤), 음수=과거(-1=지난주, -2=지지난주). 범위 밖은 처음/끝 주로 클램프.
// 스마트 스택에 여러 주 위젯을 쌓아 스와이프 가능.
// v12: 모든 크기에서 과목명 1줄(클립) + 바로 아래 교수명(과명 제거, 예: (추일한)).
// v13: 느린 네트워크에서 Scriptable 강제 종료(빨간 "Received timeout...") 방지 —
//      요청 타임아웃 15→6초 + 데이터 로딩 총 8초 상한, 초과 시 캐시로 즉시 렌더('·오프').
// v14: 캐시를 주 이동값(offset)별로 분리 + 읽을 때 monday 대조. v13까지는 캐시 파일이
//      인스턴스 공유라, 다음 주 위젯이 느린 네트워크로 상한에 지면 이번 주 격자를 그렸다.
// v15: 위젯 탭 = 강제 새로고침(Scriptable 재실행). iOS는 위젯 안에서 '지금 새로고침'을
//      허용하지 않고 refreshAfterDate는 요청일 뿐이라, 인스턴스마다 최신도가 벌어진다
//      (덜 보는 다음 주 위젯이 예산에서 밀림). 탭이 유일한 즉시 갱신 수단.
//      PWA는 Scriptable 안에서 뜬 미리보기를 다시 탭하면 열린다.
// v16: 파라미터에 '2주간'을 넣으면 그 위젯만 이번 주+다음 주를 위아래로 그린다(대형·초대형).
//      1단계(C열 탐색)는 공유하고 주 블록만 2개 병렬로 받아 실행 예산은 그대로.
//      두 주가 같은 fetch에서 나오므로 두 위젯을 따로 두던 때의 최신도 차이가 사라진다.
// v17: '2주간가로' = 좌우 배치(초대형 전용). 반쪽이 357×356이라 대형 위젯보다 넓고,
//      행 높이도 35px로 위아래 배치(16px)보다 여유롭다. 데이터는 배치와 무관하므로
//      캐시는 세로/가로가 같은 파일을 공유한다.
// v18: 배치를 반드시 밝히게 — '2주간' 단독은 폐지하고 '2주간가로'/'2주간세로'만 받는다.
//      배치가 없거나 둘 다 적혀 있으면 임의로 고르지 않고 무엇을 넣어야 하는지 안내한다.
// v19: 탭 = PWA(사파리)로 통일. v15의 탭=강제 새로고침을 되돌린다 — 갱신보다 '시간표를 열고
//      싶다'가 훨씬 잦은 동작이었다. 위젯 그림은 refreshAfterDate(30분)와 iOS 예산에만
//      기대게 되지만, 탭해서 도착하는 PWA는 5분 폴링이라 최신도는 거기서 회복된다.
//      배지만 새로고침으로 남기는 안은 불가 — 격자가 addImage 한 장이라 이미지 안 영역에는
//      요소별 url을 못 붙이고, 쪼개면 잘림을 막는 contain 스케일 불변식이 깨진다.

const PWA_URL = 'https://pureart-art.github.io/Timetable26-1/';
const SHEET_ID = '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4';
const API_KEY = 'AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k';   // 사이트용(리퍼러 제한) 키
const WIDGET_KEY = '';                                        // 위젯 전용 예비 키 — 필요 시 입력
const TAB = '시간표';

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
        /* 개행으로만 분리 — 교수 키워드 '(이름, 과)'가 쉼표를 포함하므로 쉼표로 쪼개면 안 됨 */
        const kw = raw.split('\n').map(s => s.trim()).filter(Boolean);
        if (kw.length) return kw;
      }
    } catch (e) {}
  }
  return [];
}

/* ===== 위젯 파라미터 =====
   원문을 한 번만 읽고, 여기서 파생되는 모든 값(주 이동·2주 보기·탭 URL·캐시 키)이
   이 원문 하나만 보게 한다 — 여러 곳에서 각자 파싱하면 드리프트한다.
   예: '1'=다음 주 / '-1'=지난주 / '2주간가로'=이번 주+다음 주를 좌우(초대형 전용)
       '2주간세로'=위아래(대형·초대형) / '2주간가로 1'=다음 주+다다음 주 */
const PARAM_RAW = (() => {
  try {
    if (typeof args !== 'undefined' && args) {
      if (args.widgetParameter) return String(args.widgetParameter);
      /* 위젯을 탭해 Scriptable로 들어온 실행에는 widgetParameter가 없다 —
         탭한 위젯과 같은 화면을 보여주려면 URL 쿼리(wk)로 받은 원문을 써야 한다. */
      if (args.queryParameters && args.queryParameters.wk) return String(args.queryParameters.wk);
    }
  } catch (e) {}
  return '';
})();

/* '2주간'은 PWA의 2주 보기와 같은 용어. '2주 뒤'(=정수 2)와 헷갈리지 않도록
   '간'까지 요구한다 — 숫자만 있는 기존 파라미터는 전부 예전 그대로 동작. */
const TWO_WEEK_RE = /2\s*주간|두\s*주간|2w\b/i;
/* 배치를 반드시 밝히게 한다 — '2주간'만으로는 어느 쪽인지 정할 수 없다.
   가로: 초대형(715×356)을 반으로 자르면 한 주가 357×356 — 대형 위젯보다 넓어
   글씨가 가장 크다. 세로: 반쪽 높이 178px(행 16px)이지만 대형에서도 된다. */
const HORIZ_RE = /가로/;
const VERT_RE = /세로/;
const TWO_WEEKS = TWO_WEEK_RE.test(PARAM_RAW);
/* 'horiz' | 'vert' | null. null = 2주간인데 배치가 없거나 둘 다 적힘
   → 조용히 한쪽을 고르지 않고 무엇을 입력해야 하는지 알린다. */
const LAYOUT = (() => {
  if (!TWO_WEEKS) return null;
  const h = HORIZ_RE.test(PARAM_RAW), v = VERT_RE.test(PARAM_RAW);
  if (h && !v) return 'horiz';
  if (v && !h) return 'vert';
  return null;
})();
const WEEK_OFFSET = (() => {
  const mt = PARAM_RAW.replace(TWO_WEEK_RE, ' ').replace(HORIZ_RE, ' ').replace(VERT_RE, ' ').match(/-?\d+/);
  return mt ? parseInt(mt[0], 10) : 0;
})();
/* 배치마다 한 주가 쓰는 변이 달라 최소 크기도 다르다:
   가로는 폭 절반이라 초대형에서만, 세로는 높이 절반이라 대형부터.
   (widgetFamily를 못 얻는 실행은 FAM 기본값과 같게 초대형으로 본다) */
const TWO_WEEK_OK = (() => {
  const f = (typeof config !== 'undefined' && config) ? config.widgetFamily : null;
  if (!f || f === 'extraLarge') return true;
  return f === 'large' && LAYOUT === 'vert';
})();

const PERIODS = [
  { no: '1', t1: '09:00' }, { no: '2', t1: '10:00' }, { no: '3', t1: '11:00' }, { no: '4', t1: '12:00' },
  { no: '점심', t1: '13:00' }, { no: '5', t1: '14:00' }, { no: '6', t1: '15:00' }, { no: '7', t1: '16:00' }, { no: '8', t1: '17:00' },
];
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

/* ===== 유틸 ===== */
function dateToSerial(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569; }
function serialToYMD(s) {
  const dt = new Date((s - 25569) * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function todaySerial() {
  const n = new Date();
  return dateToSerial(n.getFullYear(), n.getMonth() + 1, n.getDate());
}
function colorToHex(c) {
  if (!c) return null;
  const f = v => Math.round((v || 0) * 255).toString(16).padStart(2, '0').toUpperCase();
  return '#' + f(c.red) + f(c.green) + f(c.blue);
}
function fgOf(fmt) {
  if (!fmt) return null;
  return fmt.foregroundColor || (fmt.foregroundColorStyle && fmt.foregroundColorStyle.rgbColor) || null;
}
function isWhite(hex) { return !hex || hex === '#FFFFFF'; }
function isRedHex(hex) {
  if (!hex) return false;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return r >= 180 && g <= 115 && b <= 115;
}
/* "(추일한, Psych)" → "(추일한)": 괄호 안 마지막 콤마 뒤가 영문/슬래시(과명)면 제거.
   "(조용진, 송한수)"처럼 뒤가 한글 이름이면 그대로 둠. */
function profName(text) {
  const m = text.match(/^\(([\s\S]*)\)$/);
  if (!m) return text;
  let inside = m[1];
  const ci = inside.lastIndexOf(',');
  if (ci >= 0 && /[A-Za-z/]/.test(inside.slice(ci + 1))) inside = inside.slice(0, ci);
  return '(' + inside.trim() + ')';
}
/* 시트 원색에 흰색을 섞음 — 기본 42%(가독성), 시험 칸은 12%(원색에 가깝게 진하게) */
function lightenBg(hex, mix) {
  if (isWhite(hex)) return '#FFFFFF';
  const m = mix === undefined ? 0.42 : mix;
  const f = i => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * m).toString(16).padStart(2, '0').toUpperCase();
  };
  return '#' + f(1) + f(3) + f(5);
}
function examBg(bgRaw) { return bgRaw ? lightenBg(bgRaw, 0.12) : '#FFFFFF'; }
function splitLines(text, runs, defaultColor) {
  const out = [];
  let pos = 0;
  for (const seg of text.split('\n')) {
    const start = pos, end = pos + seg.length;
    pos = end + 1;
    const trimmed = seg.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    let color = defaultColor;
    if (runs && runs.length) {
      const weight = new Map();
      for (let i = start; i < end; i++) {
        if (/\s/.test(text[i])) continue;
        let run = null;
        for (const ru of runs) { if ((ru.startIndex || 0) <= i) run = ru; else break; }
        const rf = run && fgOf(run.format);
        const c = rf ? colorToHex(rf) : defaultColor;
        weight.set(c, (weight.get(c) || 0) + 1);
      }
      let best = defaultColor, bw = -1;
      for (const [c, w] of weight) if (w > bw) { best = c; bw = w; }
      color = best;
    }
    out.push({ text: trimmed, color });
  }
  return out;
}

/* ===== 데이터: 2단계 경량 로딩 ===== */
async function apiGet(params, key, withReferer) {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '?' + params + '&key=' + key;
  const req = new Request(url);
  req.timeoutInterval = 6;
  if (withReferer) req.headers = { 'Referer': PWA_URL };
  const json = await req.loadJSON();
  if (!json || !json.sheets) {
    throw new Error(json && json.error ? 'API ' + json.error.code + ': ' + json.error.message : '응답 형식 오류');
  }
  return json;
}
async function apiGetWithFallback(params) {
  try { return await apiGet(params, API_KEY, true); }
  catch (e1) {
    if (WIDGET_KEY) { try { return await apiGet(params, WIDGET_KEY, false); } catch (e2) { throw e2; } }
    throw e1;
  }
}
function isDateSerial(n) { return typeof n === 'number' && n > 20000 && n < 80000; }

/* 1단계: C열(월요일 날짜)만 받아 주 헤더 행 위치들 찾기 (+파일명 버전).
   반환 picks = 그릴 주 목록(1개 또는 2주 보기의 2개) — 2주여도 이 호출은 한 번뿐. */
async function findWeekPicks() {
  const params = 'ranges=' + encodeURIComponent(TAB + '!C1:C1000') +
    '&includeGridData=true&fields=' + encodeURIComponent('properties.title,sheets.data.rowData.values(effectiveValue.numberValue)');
  const json = await apiGetWithFallback(params);
  const title = (json.properties && json.properties.title) || '';
  const vm = title.match(/v\s?\d+/i);
  const ver = vm ? vm[0].replace(/\s/, '') : '';
  const rowData = (json.sheets[0].data && json.sheets[0].data[0] && json.sheets[0].data[0].rowData) || [];
  const headers = [];   // {row(0-based), monday}
  for (let r = 0; r < rowData.length; r++) {
    const v = rowData[r] && rowData[r].values && rowData[r].values[0] &&
      rowData[r].values[0].effectiveValue && rowData[r].values[0].effectiveValue.numberValue;
    if (isDateSerial(v)) headers.push({ row: r, monday: Math.round(v) });
  }
  if (!headers.length) throw new Error('주 헤더를 찾지 못했어요');
  /* 날짜 오타 보정: 기준선 = median(monday - 7*i) */
  const bases = headers.map((h, i) => h.monday - 7 * i).sort((a, b) => a - b);
  const base = bases[Math.floor(bases.length / 2)];
  headers.forEach((h, i) => {
    const ex = base + 7 * i;
    if (Math.abs(h.monday - ex) > 1) h.monday = ex;
  });
  const ts = todaySerial();
  let pi = 0;
  for (let i = 0; i < headers.length; i++) if (ts >= headers[i].monday) pi = i;   // 오늘 이전 시작 중 가장 늦은 주
  if (ts >= headers[pi].monday + 7) pi = headers.length - 1;                      // 학기 끝나면 마지막 주
  /* WEEK_OFFSET(위젯 파라미터) 만큼 이동 — 다음 주 위젯 + 스마트 스택 스와이프용 */
  if (WEEK_OFFSET) pi = Math.max(0, Math.min(headers.length - 1, pi + WEEK_OFFSET));
  const picks = [headers[pi]];
  /* 2주 보기: 다음 주가 있을 때만 함께. 학기 마지막 주엔 다음 주가 없으므로
     한 주만 담아 아래에서 전체 크기로 그린다 — 같은 주를 두 번 그리지 않는다. */
  if (TWO_WEEKS && pi + 1 < headers.length) picks.push(headers[pi + 1]);
  return { picks, ver };
}

/* 2단계: 이번 주 블록 10행만 서식 포함으로 */
const BLOCK_FIELDS = 'sheets.merges,sheets.data.startRow,' +
  'sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,' +
  'effectiveFormat.textFormat.foregroundColor,effectiveFormat.textFormat.foregroundColorStyle,textFormatRuns)';
async function loadWeekBlock(headerRow, monday) {
  const r1 = headerRow + 1, r2 = headerRow + 10;   // 1-based
  const params = 'ranges=' + encodeURIComponent(TAB + '!A' + r1 + ':I' + r2) +
    '&includeGridData=true&fields=' + encodeURIComponent(BLOCK_FIELDS);
  const json = await apiGetWithFallback(params);
  const sheet = json.sheets[0];
  const data = sheet.data[0];
  const startRow = data.startRow || 0;
  const rowData = data.rowData || [];
  const merges = sheet.merges || [];
  const mergeAt = new Map();
  for (const m of merges)
    for (let r = m.startRowIndex; r < m.endRowIndex; r++)
      for (let c = m.startColumnIndex; c < m.endColumnIndex; c++)
        mergeAt.set(r + ',' + c, m);
  const cellAt = (lr, c) => (rowData[lr] && rowData[lr].values && rowData[lr].values[c]) || null;
  const hdrA = cellAt(0, 0);
  const label = (hdrA && hdrA.formattedValue || '').trim();
  /* 헤더 날짜 글자가 빨간 요일 = 공휴일 */
  const holidays = [];
  for (let d = 0; d < 7; d++) {
    const hc = cellAt(0, 2 + d);
    const fg = hc && hc.effectiveFormat ? colorToHex(fgOf(hc.effectiveFormat.textFormat)) : null;
    holidays.push(isRedHex(fg));
  }
  const cells = [];
  const covered = new Set();
  for (let p = 0; p < 9; p++) {
    for (let d = 0; d < 7; d++) {
      if (covered.has(p + ',' + d)) continue;
      const gr = startRow + 1 + p, gc = 2 + d;   // 전역 좌표
      const m = mergeAt.get(gr + ',' + gc);
      let rowSpan = 1, colSpan = 1;
      if (m) {
        const rEnd = Math.min(m.endRowIndex, startRow + 10);
        const cEnd = Math.min(m.endColumnIndex, 9);
        if (m.startRowIndex < gr || m.startColumnIndex < gc) {
          if (m.startRowIndex >= startRow + 1 && m.startColumnIndex >= 2) continue;
        }
        rowSpan = Math.max(1, rEnd - gr);
        colSpan = Math.max(1, cEnd - gc);
        for (let pp = p; pp < p + rowSpan; pp++)
          for (let dd = d; dd < d + colSpan; dd++)
            if (pp !== p || dd !== d) covered.add(pp + ',' + dd);
      }
      const cell = cellAt(1 + p, gc);
      const fmt = (cell && cell.effectiveFormat) || {};
      const bgRaw = colorToHex(fmt.backgroundColor);
      const defColor = colorToHex(fgOf(fmt.textFormat)) || '#000000';
      const text = (cell && cell.formattedValue) || '';
      const lines = text ? splitLines(text, cell.textFormatRuns, defColor) : [];
      cells.push({
        p, d, rowSpan, colSpan, lines, bg: lightenBg(bgRaw),
        bgRaw: isWhite(bgRaw) ? null : bgRaw, isEmpty: lines.length === 0,
        isExam: lines.length > 0 && isRedHex(lines[0].color),
      });
    }
  }
  return { label, monday, cells, holidays };
}

/* 데이터 로딩 총 대기 상한. 로더의 코드 fetch(최대 10초)와 합쳐도 iOS 위젯 실행 예산 안에
   끝나야 Scriptable의 강제 종료(빨간 에러)를 안 맞는다 — 초과 시 네트워크를 포기하고 캐시 렌더. */
const FETCH_BUDGET_MS = 8000;
function afterMs(ms) { return new Promise(r => Timer.schedule(ms, false, () => r(null))); }

async function loadWeeks() {
  const fm = FileManager.local();
  /* 캐시는 파라미터 조합별로 분리 — v13까지는 한 파일을 모든 인스턴스가 공유해서
     다음 주 위젯이 상한에 지면 이번 주 위젯이 써둔 격자를 그렸다.
     2주 보기는 담는 내용이 달라 키에 포함해야 한다.
     배치(세로/가로)는 그리는 방법일 뿐 담기는 주가 같으므로 일부러 키에 안 넣는다
     — 캐시 키는 '무엇을 담았나'로 잡는다. */
  const cachePath = fm.joinPath(fm.cacheDirectory(),
    'timetable-week-v5-' + WEEK_OFFSET + (TWO_WEEKS ? 'x2' : '') + '.json');
  /* 캐시를 그릴 땐 어느 주인지 반드시 대조한다.
     expected(월요일 목록)를 아는 경우(1단계 성공) 불일치 캐시는 버린다 — 틀린 주를 그리는 건 실패다.
     1단계까지 실패해 대조 자체가 불가한 경우는 '판정 실패'로 구분해 '오프?'로 표시. */
  const readCache = (expected) => {
    if (!fm.fileExists(cachePath)) return null;
    let weeks = null;
    try { weeks = JSON.parse(fm.readString(cachePath)); } catch (e) { return null; }
    if (!Array.isArray(weeks) || !weeks.length) return null;
    if (weeks.some(w => !w || typeof w.monday !== 'number' || !Array.isArray(w.cells))) return null;
    if (expected === null) return { weeks, stale: 'unverified' };
    return weeks.map(w => w.monday).join() === expected.join() ? { weeks, stale: 'verified' } : null;
  };
  let expected = null;   /* 1단계 결과 — 상한에 진 뒤 캐시를 대조하는 데 쓴다 */
  try {
    const fetchP = (async () => {
      const h = await findWeekPicks();
      expected = h.picks.map(p => p.monday);
      /* 주 블록은 병렬 — 2주여도 실행 예산은 1주와 거의 같게 */
      const weeks = await Promise.all(h.picks.map(p => loadWeekBlock(p.row, p.monday)));
      weeks.forEach(w => { w.ver = h.ver; });
      return weeks;
    })();
    /* 상한에 져서 캐시로 넘어간 뒤 뒤늦게 도착한 결과도 다음 새로고침을 위해 캐시에 반영 */
    fetchP.then(ws => { try { fm.writeString(cachePath, JSON.stringify(ws)); } catch (e) {} }, () => {});
    const weeks = await Promise.race([fetchP, afterMs(FETCH_BUDGET_MS)]);
    if (weeks) {
      fm.writeString(cachePath, JSON.stringify(weeks));
      return { weeks, stale: null };
    }
    const c = readCache(expected);
    if (c) return c;
    throw new Error('네트워크가 느려 시간표를 못 받았어요. 다음 새로고침 때 다시 시도해요.');
  } catch (e) {
    const c = readCache(expected);
    if (c) return c;
    throw e;
  }
}

/* ===== 격자 1주를 캔버스의 지정 영역 (ox,oy)~(ox+W,oy+H) 에 그림 =====
   2주 보기가 같은 캔버스를 위아래로 나눠 쓰기 때문에 영역을 인자로 받는다.
   좌표는 전부 PX/PY 기준 — 여기에 PAD를 직접 쓰면 아래쪽 주가 위로 겹쳐 그려진다. */
function drawWeekGrid(ctx, week, staleTag, ox, oy, W, H) {
  const ts = todaySerial();
  const big = H >= 300;
  const PAD = 6;                        /* 모든 크기 공통 가장자리 여백 */
  const PX = ox + PAD, PY = oy + PAD;
  const innerW = W - PAD * 2, innerH = H - PAD * 2;
  const HDR = big ? 24 : 18;
  const timeW = W >= 600 ? 56 : (W >= 300 ? 26 : 20);
  const dayW = (innerW - timeW) / 7;
  const rowH = (innerH - HDR) / 9;
  const fTitle = Math.max(6, Math.min(11, Math.floor(rowH * 0.36)));
  const fHdr = Math.max(7, Math.min(12, Math.floor(HDR * 0.46)));
  const line = new Color('#CFCCC4');

  const gx = c => PX + timeW + c * dayW;
  const gy = p => PY + HDR + p * rowH;
  const todayD = (ts >= week.monday && ts < week.monday + 7) ? ts - week.monday : -1;

  for (let d = 0; d < 7; d++) {
    const isHol = d === 6 || (week.holidays && week.holidays[d]);
    const bg = isHol ? '#F7D2D2' : (d === 5 ? '#E7EEF6' : '#F1EFE8');
    ctx.setFillColor(new Color(bg));
    ctx.fillRect(new Rect(gx(d), PY, dayW, HDR));
    const ymd = serialToYMD(week.monday + d);
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(fHdr));
    ctx.setTextColor(new Color('#3a3a37'));
    ctx.drawTextInRect(DAY_NAMES[d] + (dayW >= 38 ? ' ' + ymd.m + '.' + ymd.d : ''), new Rect(gx(d), PY + (HDR - fHdr) / 2 - 1, dayW, fHdr + 4));
  }
  ctx.setFillColor(new Color('#F1EFE8'));
  ctx.fillRect(new Rect(PX, PY, timeW, HDR + 9 * rowH));
  /* 코너 칸: 주차 라벨 + 시트 버전 (예: 11주 / v34) */
  {
    const f1 = big ? 9 : 7, f2 = big ? 7 : 6;
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(f1));
    ctx.setTextColor(new Color('#5f5e5a'));
    ctx.drawTextInRect((week.label || '') + staleTag, new Rect(PX, PY + 2, timeW, f1 + 3));
    if (week.ver) {
      ctx.setFont(Font.boldSystemFont(f2));
      ctx.setTextColor(new Color('#8a897f'));
      ctx.drawTextInRect(week.ver, new Rect(PX, PY + 3 + f1 + 2, timeW, f2 + 3));
    }
  }
  for (let p = 0; p < 9; p++) {
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(Math.max(6, Math.min(10, Math.floor(rowH * 0.32)))));
    ctx.setTextColor(new Color('#5f5e5a'));
    /* 교시+시각 2줄은 23px을 쓴다 — 행이 그보다 낮으면(2주 보기의 초대형 반쪽 등)
       위아래 행으로 넘쳐서 교시만 그린다. 넓은 시간열 하나만 보고 판단하면 안 됨. */
    if (timeW >= 40 && rowH >= 28) {
      ctx.drawTextInRect(PERIODS[p].no, new Rect(PX, gy(p) + rowH / 2 - 12, timeW, 12));
      ctx.setFont(Font.systemFont(8));
      ctx.setTextColor(new Color('#8a897f'));
      ctx.drawTextInRect(PERIODS[p].t1, new Rect(PX, gy(p) + rowH / 2 + 1, timeW, 10));
    } else {
      ctx.drawTextInRect(PERIODS[p].no === '점심' ? '점' : PERIODS[p].no, new Rect(PX, gy(p) + rowH / 2 - 5, timeW, 11));
    }
  }

  const strokeRectPx = (x, y, ww, hh, color, width) => {
    ctx.setStrokeColor(color || line);
    ctx.setLineWidth(width || 1);
    const path = new Path();
    path.addRect(new Rect(x, y, ww, hh));
    ctx.addPath(path);
    ctx.strokePath();
  };
  for (const cm of week.cells) {
    const x = gx(cm.d), y = gy(cm.p);
    const ww = dayW * cm.colSpan, hh = rowH * cm.rowSpan;
    const cellBg = cm.isExam ? examBg(cm.bgRaw) : cm.bg;
    if (cellBg && cellBg !== '#FFFFFF') {
      ctx.setFillColor(new Color(cellBg));
      ctx.fillRect(new Rect(x, y, ww, hh));
    }
    strokeRectPx(x, y, ww, hh);
    if (cm.isExam) strokeRectPx(x + 1, y + 1, ww - 2, hh - 2, new Color('#FF3B30'), 2);
    if (!cm.isEmpty) {
      /* 패턴 분류: 괄호줄 = 교수/과명, `라벨: A/B`(초안자/검안자·그룹) 줄 = 제외, 나머지 = 과목명 */
      const isProf = l => l.text.startsWith('(') && l.text.endsWith(')') && !(l.text.includes(':') && l.text.includes('/'));
      const isStaff = l => l.text.includes(':') && l.text.includes('/');
      const titleLines = cm.lines.filter(l => !isProf(l) && !isStaff(l));
      const profLines = cm.lines.filter(isProf);
      const tLine = titleLines[0] || cm.lines[0];
      /* 과목명: 여러 줄이어도 한 줄로 합쳐 무조건 1줄(넘치면 클립) */
      const titleText = (titleLines.length ? titleLines : [cm.lines[0]]).map(l => l.text).join(' ');
      let titleHex = tLine.color && tLine.color !== '#000000' ? tLine.color : '#000000';
      if (matchKeyword(tLine.text, HL_KEYWORDS)) titleHex = '#FF0000';
      const titleColor = new Color(titleHex);
      const prof = profLines.length ? profName(profLines[0].text) : '';   /* 과명 제거: (추일한) */
      const profRed = profLines[0] && (isRedHex(profLines[0].color) || matchKeyword(profLines[0].text, HL_KEYWORDS));
      const profColor = new Color(profRed ? '#FF0000' : '#000000');
      ctx.setTextAlignedCenter();

      const lh = fTitle + 2;                 /* 한 줄 높이 */
      const profFs = Math.max(7, fTitle - 1);
      if (prof && hh >= lh + profFs + 3) {
        /* 과목명 1줄 + 바로 아래 줄에 교수명(빈 줄 없이). 2줄 블록을 세로 가운데 */
        const top = y + Math.max(2, (hh - (lh + profFs + 3)) / 2);
        ctx.setFont(Font.boldSystemFont(fTitle));
        ctx.setTextColor(titleColor);
        ctx.drawTextInRect(titleText, new Rect(x + 2, top, ww - 4, lh));
        ctx.setFont(Font.boldSystemFont(profFs));
        ctx.setTextColor(profColor);
        ctx.drawTextInRect(prof, new Rect(x + 2, top + lh, ww - 4, hh - (top - y) - lh - 1));
      } else {
        /* 교수명 없거나 칸이 너무 작음: 과목명만 1줄 가운데 */
        ctx.setFont(Font.boldSystemFont(cm.isExam ? fTitle + 1 : fTitle));
        ctx.setTextColor(titleColor);
        ctx.drawTextInRect(titleText, new Rect(x + 2, y + Math.max(2, (hh - lh) / 2), ww - 4, lh));
      }
    }
  }
  strokeRectPx(PX, PY, timeW + 7 * dayW, HDR + 9 * rowH);
  if (todayD >= 0) {
    strokeRectPx(gx(todayD) + 1, PY + 1, dayW - 2, HDR + 9 * rowH - 2, new Color('#2E75B6'), 2);
  }
}

/* ===== 위젯 조립: 주 1개면 전체, 2개면 위아래로 반씩 ===== */
function buildWidget(weeks, stale) {
  /* 오프 = 캐시 렌더(주 대조 통과) / 오프? = 대조 불가(1단계 실패) — 같은 분기로 흘리지 않는다 */
  const staleTag = stale === 'verified' ? '·오프' : (stale === 'unverified' ? '·오프?' : '');
  const w = new ListWidget();
  w.backgroundColor = new Color('#FFFFFF');
  w.url = PWA_URL;              /* 탭 = 사파리로 시간표 앱 (v19) */
  w.setPadding(0, 0, 0, 0);

  const FAM = {
    small: [158, 158], medium: [338, 158], large: [338, 354], extraLarge: [715, 356],
  }[config.widgetFamily] || [715, 356];
  const W = FAM[0], H = FAM[1];
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color('#FFFFFF'));
  ctx.fillRect(new Rect(0, 0, W, H));

  if (weeks.length >= 2 && LAYOUT === 'horiz') {
    const halfW = Math.floor(W / 2);
    drawWeekGrid(ctx, weeks[0], staleTag, 0, 0, halfW, H);
    drawWeekGrid(ctx, weeks[1], staleTag, halfW, 0, W - halfW, H);
  } else if (weeks.length >= 2) {
    const half = Math.floor(H / 2);
    drawWeekGrid(ctx, weeks[0], staleTag, 0, 0, W, half);
    drawWeekGrid(ctx, weeks[1], staleTag, 0, half, W, H - half);
  } else {
    /* 2주 보기를 켰어도 학기 마지막 주면 다음 주가 없다 — 그 한 주를 전체 크기로 */
    drawWeekGrid(ctx, weeks[0], staleTag, 0, 0, W, H);
  }

  /* contain 배치: 기기마다 위젯 실제 크기가 달라도 잘리지 않음 */
  const wi = w.addImage(ctx.getImage());
  wi.resizable = true;
  wi.applyFittingContentMode();   /* 전체가 보이도록 축소(잘림 방지) */
  wi.centerAlignImage();
  return w;
}

/* 안내 화면 — 조용히 한 주만 그려서 '2주간이 안 먹네?'로 헷갈리게 두지 않는다 */
function noticeWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#FFFFFF');
  w.url = PWA_URL;
  const t = w.addText(msg);
  t.font = Font.systemFont(12);
  t.textColor = new Color('#8a5a00');
  return w;
}

/* ===== 메인 ===== */
async function main() {
  HL_KEYWORDS = loadKeywords();
  let widget;
  try {
    if (TWO_WEEKS && !LAYOUT) {
      widget = noticeWidget('두 주를 보려면 배치도 적어주세요.\n「2주간가로」 = 좌우 (초대형)\n「2주간세로」 = 위아래 (대형·초대형)');
    } else if (TWO_WEEKS && !TWO_WEEK_OK) {
      widget = noticeWidget(LAYOUT === 'horiz'
        ? '「2주간가로」는 초대형 위젯에서만 돼요.\n초대형으로 바꾸거나, 대형이면 「2주간세로」를 써주세요.'
        : '「2주간세로」는 대형·초대형 위젯에서만 돼요.\n위젯을 더 큰 크기로 바꿔주세요.');
    } else {
      const { weeks, stale } = await loadWeeks();
      widget = buildWidget(weeks, stale);
    }
  } catch (e) {
    widget = new ListWidget();
    widget.backgroundColor = new Color('#FFFFFF');
    const t = widget.addText('시간표를 불러오지 못했어요\n' + e.message);
    t.font = Font.systemFont(12);
    t.textColor = new Color('#C04848');
    widget.url = PWA_URL;    /* 위젯이 못 불러왔을 때도 탭하면 라이브 앱에서는 볼 수 있다 */
  }
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    if (config.widgetFamily === 'extraLarge') await widget.presentExtraLarge();
    else if (config.widgetFamily === 'large') await widget.presentLarge();
    else await widget.presentMedium();
  }
  Script.complete();
}
await main();
