/* =========================================================
   의학과 2학년 시간표 PWA
   데이터: Google Sheets API v4 spreadsheets.get(includeGridData)
   보기: 오늘(하루) / 주간 / 월간 — 모든 기기 공통, 화면 폭에 맞춤
   ========================================================= */
'use strict';

/* ===== CONFIG ===== */
const CONFIG = {
  SHEET_ID: '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4',
  API_KEY: 'AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k',
  TAB: '시간표',
  POLL_MS: 45000,
};

const FIELDS = 'properties.title,sheets.properties,sheets.merges,' +
  'sheets.data.rowData.values(formattedValue,effectiveValue,' +
  'effectiveFormat.backgroundColor,effectiveFormat.textFormat.foregroundColor,' +
  'effectiveFormat.textFormat.foregroundColorStyle,textFormatRuns)';

/* 교시 → 시간 (고정) */
const PERIODS = [
  { no: '1',   time: '09:00–09:50', sh: 9,  sm: 0,  eh: 9,  em: 50 },
  { no: '2',   time: '10:00–10:50', sh: 10, sm: 0,  eh: 10, em: 50 },
  { no: '3',   time: '11:00–11:50', sh: 11, sm: 0,  eh: 11, em: 50 },
  { no: '4',   time: '12:00–12:50', sh: 12, sm: 0,  eh: 12, em: 50 },
  { no: '점심', time: '13:00–14:00', sh: 13, sm: 0,  eh: 14, em: 0  },
  { no: '5',   time: '14:00–14:50', sh: 14, sm: 0,  eh: 14, em: 50 },
  { no: '6',   time: '15:00–15:50', sh: 15, sm: 0,  eh: 15, em: 50 },
  { no: '7',   time: '16:00–16:50', sh: 16, sm: 0,  eh: 16, em: 50 },
  { no: '8',   time: '17:00–17:50', sh: 17, sm: 0,  eh: 17, em: 50 },
];
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
const FIRST_DAY_COL = 2; // C열
const BLOCK_ROWS = 10;   // 헤더 1 + 교시 9

/* ===== 상태 ===== */
const state = {
  weeks: [],
  weekIdx: 0,
  dayIdx: 0,
  view: 'week',         // 'day' | 'week' | 'month'
  monthY: 0, monthM: 0,
  source: '',           // 'live' | 'cache' | 'snapshot'
  lastFetched: null,
  ver: '',              // 시트 파일명에서 추출한 버전 (예: v34)
  dataSig: '',
};

/* ===== 유틸 ===== */
function kstNow() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  return {
    y: +p.year, m: +p.month, d: +p.day,
    hh: +p.hour === 24 ? 0 : +p.hour, mm: +p.minute, ss: +p.second,
    serial: dateToSerial(+p.year, +p.month, +p.day),
  };
}
function dateToSerial(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569; }
function serialToYMD(serial) {
  const dt = new Date((serial - 25569) * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
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
/* 시트에서 빨간 글자(공휴일 표시) 판정 */
function isRedHex(hex) {
  if (!hex) return false;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return r >= 180 && g <= 115 && b <= 115;
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

/* ===== 파서 ===== */
function getCell(rowData, r, c) {
  const row = rowData[r];
  return (row && row.values && row.values[c]) || null;
}
function cellNumber(cell) {
  return cell && cell.effectiveValue && typeof cell.effectiveValue.numberValue === 'number'
    ? cell.effectiveValue.numberValue : null;
}
function isDateSerial(n) { return n !== null && n > 20000 && n < 80000; }

/* 줄별 색: 해당 줄을 가장 많이 덮는 런 색 (없으면 셀 기본색) */
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
        const runFg = run && fgOf(run.format);
        const c = runFg ? colorToHex(runFg) : defaultColor;
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

function parseGrid(api) {
  const sheet = api.sheets && api.sheets[0];
  if (!sheet || !sheet.data || !sheet.data[0] || !sheet.data[0].rowData) {
    throw new Error('시트 데이터 형식이 예상과 다릅니다');
  }
  const rowData = sheet.data[0].rowData;
  const merges = sheet.merges || [];

  const mergeAt = new Map();
  for (const m of merges) {
    for (let r = m.startRowIndex; r < m.endRowIndex; r++)
      for (let c = m.startColumnIndex; c < m.endColumnIndex; c++)
        mergeAt.set(r + ',' + c, m);
  }

  const headers = [];
  for (let r = 0; r < rowData.length; r++) {
    let dateCount = 0;
    for (let c = FIRST_DAY_COL; c < FIRST_DAY_COL + 7; c++) {
      if (isDateSerial(cellNumber(getCell(rowData, r, c)))) dateCount++;
    }
    if (dateCount >= 3) headers.push(r);
  }

  const rawMon = headers.map(h => {
    const n = cellNumber(getCell(rowData, h, FIRST_DAY_COL));
    return isDateSerial(n) ? Math.round(n) : null;
  });
  const bases = rawMon.map((m, i) => (m === null ? null : m - 7 * i)).filter(v => v !== null).sort((a, b) => a - b);
  const baseMedian = bases.length ? bases[Math.floor(bases.length / 2)] : dateToSerial(2026, 3, 30);
  const mondays = rawMon.map((m, i) => {
    const expect = baseMedian + 7 * i;
    return (m === null || Math.abs(m - expect) > 1) ? expect : m;
  });

  const weeks = headers.map((h, wi) => {
    const aCell = getCell(rowData, h, 0);
    const label = (aCell && aCell.formattedValue || '').trim() || (wi + 1) + '주';
    /* 헤더 날짜 글자가 빨간 요일 = 공휴일 */
    const holidays = [];
    for (let d = 0; d < 7; d++) {
      const hc = getCell(rowData, h, FIRST_DAY_COL + d);
      const fg = hc && hc.effectiveFormat ? colorToHex(fgOf(hc.effectiveFormat.textFormat)) : null;
      holidays.push(isRedHex(fg));
    }
    const cells = [];
    const covered = new Set();

    for (let p = 0; p < 9; p++) {
      for (let d = 0; d < 7; d++) {
        if (covered.has(p + ',' + d)) continue;
        const r = h + 1 + p, c = FIRST_DAY_COL + d;
        const m = mergeAt.get(r + ',' + c);
        let rowSpan = 1, colSpan = 1;
        if (m) {
          const rEnd = Math.min(m.endRowIndex, h + BLOCK_ROWS);
          const cEnd = Math.min(m.endColumnIndex, FIRST_DAY_COL + 7);
          if (m.startRowIndex < r || m.startColumnIndex < c) {
            if (m.startRowIndex >= h + 1 && m.startColumnIndex >= FIRST_DAY_COL) continue;
          }
          rowSpan = Math.max(1, rEnd - r);
          colSpan = Math.max(1, cEnd - c);
          for (let pp = p; pp < p + rowSpan; pp++)
            for (let dd = d; dd < d + colSpan; dd++)
              if (pp !== p || dd !== d) covered.add(pp + ',' + dd);
        }
        const cell = getCell(rowData, r, c);
        const fmt = (cell && cell.effectiveFormat) || {};
        const bgRaw = colorToHex(fmt.backgroundColor);
        const defColor = colorToHex(fgOf(fmt.textFormat)) || '#000000';
        const text = (cell && cell.formattedValue) || '';
        const lines = text ? splitLines(text, cell.textFormatRuns, defColor) : [];
        cells.push({
          p, d, rowSpan, colSpan, lines,
          bg: lightenBg(bgRaw), bgRaw: isWhite(bgRaw) ? null : bgRaw,
          isLunch: p === 4, isEmpty: lines.length === 0,
          /* 제목 줄이 빨간 칸 = 시험(총괄평가/재시험) → 강조 */
          isExam: lines.length > 0 && isRedHex(lines[0].color),
        });
      }
    }
    return { label, monday: mondays[wi], cells, holidays };
  });

  if (!weeks.length) throw new Error('주 블록을 찾지 못했습니다');
  return weeks;
}

/* ===== 데이터 로딩 ===== */
function apiUrl() {
  return 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SHEET_ID +
    '?ranges=' + encodeURIComponent(CONFIG.TAB) +
    '&includeGridData=true&fields=' + encodeURIComponent(FIELDS) +
    '&key=' + CONFIG.API_KEY;
}
function loadSnapshot() {
  return new Promise((resolve, reject) => {
    if (window.__SNAPSHOT__) return resolve(window.__SNAPSHOT__);
    const s = document.createElement('script');
    s.src = 'data/snapshot.js';
    s.onload = () => window.__SNAPSHOT__ ? resolve(window.__SNAPSHOT__) : reject(new Error('snapshot empty'));
    s.onerror = () => reject(new Error('snapshot load fail'));
    document.head.appendChild(s);
  });
}
async function fetchData(isFirst) {
  if (!CONFIG.API_KEY) {
    const snap = await loadSnapshot();
    state.source = 'snapshot';
    return snap;
  }
  try {
    const res = await fetch(apiUrl());
    if (!res.ok) throw new Error('Sheets API HTTP ' + res.status);
    const json = await res.json();
    state.source = 'live';
    state.lastFetched = new Date();
    return json;
  } catch (e) {
    console.warn('API 실패, 폴백:', e.message);
    if (isFirst) {
      const snap = await loadSnapshot();
      state.source = 'snapshot';
      return snap;
    }
    return null;
  }
}

/* ===== 공통 ===== */
const $ = id => document.getElementById(id);
function isCompact() { return window.innerWidth < 720; }

function weekOfToday() {
  const t = kstNow().serial;
  let idx = -1;
  state.weeks.forEach((w, i) => { if (t >= w.monday && t < w.monday + 7) idx = i; });
  return idx;
}
function currentPeriodIdx() {
  const n = kstNow();
  const mins = n.hh * 60 + n.mm;
  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i];
    if (mins >= p.sh * 60 + p.sm && mins < p.eh * 60 + p.em) return i;
  }
  return -1;
}
function gotoToday() {
  const tw = weekOfToday();
  if (tw >= 0) {
    state.weekIdx = tw;
    const t = kstNow().serial - state.weeks[tw].monday;
    state.dayIdx = (t >= 0 && t < 7) ? t : 0;
  } else {
    state.weekIdx = 0;
    state.dayIdx = 0;
  }
}

/* ===== 뷰 디스패처 ===== */
function render() {
  $('tabDay').classList.toggle('sel', state.view === 'day');
  $('tabWeek').classList.toggle('sel', state.view === 'week');
  $('tabTwo').classList.toggle('sel', state.view === 'two');
  $('tabMonth').classList.toggle('sel', state.view === 'month');
  if (state.view === 'month') renderMonth();
  else if (state.view === 'two') renderTwoWeek();
  else renderSheet(state.view);
}

/* 줄 분류: 괄호줄 = 교수/과명(l2), `라벨: A/B` = 초안자/검안자(l3), 나머지 = 과목명(l1)
   — 한 수업에 주제가 여러 줄일 수 있어 위치가 아닌 패턴으로 판정 */
function lineClass(text) {
  if (text.startsWith('(') && text.endsWith(')')) return 'l2';
  if (text.includes(':') && text.includes('/')) return 'l3';
  return 'l1';
}

/* ===== 하루/주간 (엑셀 격자) ===== */
function makeCellDiv(cellModel, gridCol, gridRow, colSpan, rowSpan, extraCls) {
  const div = document.createElement('div');
  div.className = 'cell' + (extraCls ? ' ' + extraCls : '') + (cellModel && cellModel.isExam ? ' exam' : '');
  div.style.gridColumn = gridCol + (colSpan > 1 ? ' / span ' + colSpan : '');
  div.style.gridRow = gridRow + (rowSpan > 1 ? ' / span ' + rowSpan : '');
  if (cellModel) {
    const bg = cellModel.isExam ? examBg(cellModel.bgRaw) : cellModel.bg;
    if (bg && bg !== '#FFFFFF') div.style.background = bg;
    cellModel.lines.forEach(ln => {
      const el = document.createElement('div');
      el.className = lineClass(ln.text);
      el.textContent = ln.text;
      el.style.color = ln.color || '#000000';
      div.appendChild(el);
    });
    if (cellModel.lines.length) {
      div.addEventListener('click', () => showPop(cellModel));
    }
  }
  return div;
}

/* 한 주 격자를 주어진 grid 엘리먼트에 그림 (오늘/주간/2주간 공용)
   opts: { day(단일 요일), compact(좁은 화면 축소), fill(세로 꽉 채움) } */
function buildWeekGrid(grid, w, opts) {
  const day = !!opts.day, compact = !!opts.compact, fill = !!opts.fill;
  const minRow = opts.minRow != null ? opts.minRow : 44;
  grid.innerHTML = '';
  grid.style.gridTemplateRows = fill
    ? 'auto repeat(9, minmax(' + minRow + 'px, 1fr))'  /* 화면 꽉 차게 (minRow=0이면 완전 분할) */
    : 'auto repeat(9, minmax(56px, auto))';            /* 내용에 맞춰 늘어남(글자 안 잘림) */
  grid.className = 'gridc ' + (day ? 'dayview' : 'weekwide') + (compact ? ' compact' : '');

  const todaySerial = kstNow().serial;
  const todayD = (todaySerial >= w.monday && todaySerial < w.monday + 7) ? todaySerial - w.monday : -1;
  const nowP = todayD >= 0 ? currentPeriodIdx() : -1;

  const days = day ? [state.dayIdx] : [0, 1, 2, 3, 4, 5, 6];

  /* 코너 + 요일 헤더 */
  const corner1 = document.createElement('div'); corner1.className = 'cell cor'; corner1.textContent = '교시';
  const corner2 = document.createElement('div'); corner2.className = 'cell cor'; corner2.textContent = '시간';
  corner1.style.gridColumn = 1; corner1.style.gridRow = 1;
  corner2.style.gridColumn = 2; corner2.style.gridRow = 1;
  grid.append(corner1, corner2);
  days.forEach((d, i) => {
    const ymd = serialToYMD(w.monday + d);
    const div = document.createElement('div');
    const isHol = d === 6 || (w.holidays && w.holidays[d]);
    div.className = 'cell hdr' + (isHol ? ' sun' : (d === 5 ? ' wknd' : '')) + (d === todayD ? ' todaycol' : '');
    div.style.gridColumn = 3 + i; div.style.gridRow = 1;
    div.innerHTML = '<div class="dn"></div><div class="dd"></div>';
    div.firstChild.textContent = DAY_NAMES[d];
    div.lastChild.textContent = ymd.m + '.' + ymd.d;
    grid.appendChild(div);
  });

  /* 교시/시간 열 */
  PERIODS.forEach((p, i) => {
    const per = document.createElement('div');
    per.className = 'cell per' + (i === nowP ? ' nowper' : '');
    per.style.gridColumn = 1; per.style.gridRow = 2 + i;
    per.textContent = p.no;
    const tim = document.createElement('div');
    tim.className = 'cell tim' + (i === nowP ? ' nowper' : '');
    tim.style.gridColumn = 2; tim.style.gridRow = 2 + i;
    tim.textContent = compact ? p.time.slice(0, 5) : p.time;
    grid.append(per, tim);
  });

  /* 본문 칸 */
  if (!day) {
    for (const cm of w.cells) {
      const cls = (cm.d <= todayD && todayD < cm.d + cm.colSpan)
        ? 'todaybody' + (cm.p + cm.rowSpan === 9 ? ' lastrow' : '') : '';
      grid.appendChild(makeCellDiv(cm, 3 + cm.d, 2 + cm.p, cm.colSpan, cm.rowSpan, cls));
    }
  } else {
    const d = state.dayIdx;
    const placed = new Set();
    for (const cm of w.cells) {
      if (cm.d <= d && d < cm.d + cm.colSpan) {
        grid.appendChild(makeCellDiv(cm, 3, 2 + cm.p, 1, cm.rowSpan, d === todayD ? 'todaybody' : ''));
        for (let pp = cm.p; pp < cm.p + cm.rowSpan; pp++) placed.add(pp);
      }
    }
    for (let p = 0; p < 9; p++) if (!placed.has(p)) grid.appendChild(makeCellDiv(null, 3, 2 + p, 1, 1, ''));
  }
}

function renderSheet(mode) {
  const w = state.weeks[state.weekIdx];
  if (!w) return;
  const day = mode === 'day';
  buildWeekGrid($('grid'), w, { day, compact: !day && isCompact(), fill: true });

  if (day) {
    const ymd = serialToYMD(w.monday + state.dayIdx);
    $('weekLabel').textContent = w.label;
    $('weekRange').textContent = ymd.y + '. ' + ymd.m + '. ' + ymd.d + ' (' + DAY_NAMES[state.dayIdx] + ')';
  } else {
    const mon = serialToYMD(w.monday), sun = serialToYMD(w.monday + 6);
    $('weekLabel').textContent = w.label;
    $('weekRange').textContent = mon.y + '. ' + mon.m + '. ' + mon.d + ' – ' + sun.m + '. ' + sun.d;
  }
  renderMeta();
}

/* ===== 2주간 보기: 이번 주 + 다음 주를 세로로 쌓아 모든 줄(과목·교수·검안자)이 보이게 ===== */
function renderTwoWeek() {
  const grid = $('grid');
  grid.className = 'twoweek';
  grid.style.gridTemplateRows = '';
  grid.innerHTML = '';
  const compact = isCompact();
  const shown = [state.weeks[state.weekIdx], state.weeks[state.weekIdx + 1]].filter(Boolean);
  for (const w of shown) {
    const lab = document.createElement('div');
    lab.className = 'twlabel';
    const mon = serialToYMD(w.monday), sun = serialToYMD(w.monday + 6);
    lab.textContent = w.label + ' · ' + mon.m + '. ' + mon.d + ' – ' + sun.m + '. ' + sun.d;
    grid.appendChild(lab);
    const sub = document.createElement('div');
    grid.appendChild(sub);
    buildWeekGrid(sub, w, { day: false, compact, fill: true, minRow: 0 });
  }
  const w1 = shown[0], wl = shown[shown.length - 1];
  if (w1) {
    const a = serialToYMD(w1.monday), b = serialToYMD(wl.monday + 6);
    $('weekLabel').textContent = shown.length > 1 ? w1.label + '–' + wl.label : w1.label;
    $('weekRange').textContent = a.m + '. ' + a.d + ' – ' + b.m + '. ' + b.d;
  }
  renderMeta();
}

/* ===== 월간 보기 ===== */
function weekOfSerial(s) {
  return state.weeks.find(w => s >= w.monday && s < w.monday + 7) || null;
}
/* 월간 칩 라벨: "28장 " 같은 번호 접두사 제거 + 좁은 화면이면 앞 4글자만 */
function chipLabel(text) {
  const clean = text.replace(/^\d+장\s*/, '').trim();
  const lim = window.innerWidth < 720 ? 4 : 12;
  return clean.length > lim ? clean.slice(0, lim).trim() : clean;
}
function renderMonth() {
  const grid = $('grid');
  grid.innerHTML = '';
  grid.className = 'gridc monthview';

  const y = state.monthY, m = state.monthM;
  $('weekLabel').textContent = y + '년 ' + m + '월';
  $('weekRange').textContent = '';

  const first = dateToSerial(y, m, 1);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dowMon0 = (new Date((first - 25569) * 86400000).getUTCDay() + 6) % 7;
  const start = first - dowMon0;
  const rows = Math.ceil((dowMon0 + daysInMonth) / 7);
  grid.style.gridTemplateRows = 'auto repeat(' + rows + ', minmax(var(--mrowh), 1fr))';
  const todaySerial = kstNow().serial;

  DAY_NAMES.forEach((nm, d) => {
    const h = document.createElement('div');
    h.className = 'cell hdr' + (d === 5 ? ' wknd' : '') + (d === 6 ? ' sun' : '');
    h.style.gridColumn = 1 + d; h.style.gridRow = 1;
    h.innerHTML = '<div class="dn"></div>';
    h.firstChild.textContent = nm;
    grid.appendChild(h);
  });

  for (let i = 0; i < rows * 7; i++) {
    const s = start + i;
    const ymd = serialToYMD(s);
    const d = i % 7;
    const w = weekOfSerial(s);
    const div = document.createElement('div');
    div.className = 'cell mday' + (ymd.m !== m ? ' outm' : '') + (s === todaySerial ? ' todaym' : '');
    div.style.gridColumn = 1 + d;
    div.style.gridRow = 2 + Math.floor(i / 7);
    const dt = document.createElement('div');
    const isHol = d === 6 || (w && w.holidays && w.holidays[d]);
    dt.className = 'mdate' + (isHol ? ' sun' : (d === 5 ? ' sat' : ''));
    dt.textContent = ymd.m !== m ? ymd.m + '.' + ymd.d : ymd.d;
    div.appendChild(dt);
    if (w) {
      /* 시간대 4슬롯: 9–11(교시1·2) / 11–13(3·4) / 14–16(5·6) / 16–18(7·8), 점심 제외 */
      const SLOT_PERIODS = [[0, 1], [2, 3], [5, 6], [7, 8]];
      const entries = w.cells
        .filter(c => !c.isEmpty && c.d <= d && d < c.d + c.colSpan)
        .filter(c => !(c.p === 4 && c.p + c.rowSpan <= 5))
        .sort((a, b) => a.p - b.p);
      const slotEntries = [[], [], [], []];
      for (const cm of entries) {
        let firstSlot = true;
        SLOT_PERIODS.forEach((ps, k) => {
          if (ps.some(p => p >= cm.p && p < cm.p + cm.rowSpan)) {
            slotEntries[k].push({ cm, first: firstSlot });
            firstSlot = false;
          }
        });
      }
      const slots = document.createElement('div');
      slots.className = 'mslots';
      slotEntries.forEach((list, k) => {
        const slot = document.createElement('div');
        slot.className = 'mslot' + (k === 2 ? ' afterlunch' : '');
        list.slice(0, 2).forEach(({ cm, first }) => {
          const chip = document.createElement('div');
          chip.className = 'mchip' + (first ? '' : ' cont') + (cm.isExam ? ' exam' : '');
          chip.style.background = (cm.isExam ? examBg(cm.bgRaw) : cm.bg) || '#FFFFFF';
          if (first) {
            chip.textContent = chipLabel(cm.lines[0].text);
            chip.title = cm.lines[0].text;
            if (cm.lines[0].color && cm.lines[0].color !== '#000000') chip.style.color = cm.lines[0].color;
          }
          slot.appendChild(chip);
        });
        if (list.length > 2) {
          const more = document.createElement('div');
          more.className = 'mmore';
          more.textContent = '+' + (list.length - 2);
          slot.appendChild(more);
        }
        slots.appendChild(slot);
      });
      div.appendChild(slots);
      /* 날짜 탭 → 그 주의 주간 보기 */
      div.addEventListener('click', () => {
        state.weekIdx = state.weeks.indexOf(w);
        state.dayIdx = d;
        state.view = 'week';
        render();
      });
    }
    grid.appendChild(div);
  }
  renderMeta();
}

function renderMeta() {
  const ver = $('verBadge');
  ver.textContent = state.ver;
  ver.hidden = !state.ver;
  const badge = $('srcBadge');
  if (state.source === 'live') { badge.textContent = 'LIVE'; badge.className = 'badge live'; }
  else if (state.source === 'snapshot') { badge.textContent = '스냅샷'; badge.className = 'badge'; }
  else { badge.textContent = '캐시'; badge.className = 'badge'; }
  $('updated').textContent = state.lastFetched
    ? '마지막 갱신 ' + state.lastFetched.toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })
    : '';
  const notice = $('notice');
  if (!CONFIG.API_KEY) {
    notice.hidden = false;
    notice.textContent = 'API 키가 아직 없어 내장 스냅샷을 표시 중입니다. app.js 상단 CONFIG.API_KEY에 키를 넣으면 구글 시트와 실시간 동기화됩니다.';
  } else notice.hidden = true;
}

/* ===== 팝업 ===== */
function showPop(cm) {
  const body = $('popBody');
  body.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'poptime';
  const pStart = PERIODS[cm.p], pEnd = PERIODS[cm.p + cm.rowSpan - 1];
  t.textContent = (pStart.no === '점심' ? '점심' : pStart.no + '교시' + (cm.rowSpan > 1 ? '–' + pEnd.no + '교시' : '')) +
    ' · ' + pStart.time.slice(0, 5) + '–' + pEnd.time.slice(6);
  body.appendChild(t);
  cm.lines.forEach(ln => {
    const el = document.createElement('div');
    el.className = lineClass(ln.text);
    el.textContent = ln.text;
    el.style.color = ln.color || '#000000';
    body.appendChild(el);
  });
  $('sheetpop').hidden = false;
}

/* ===== 이동 ===== */
function navDelta(dir) {
  if (state.view === 'month') {
    state.monthM += dir;
    if (state.monthM < 1) { state.monthM = 12; state.monthY--; }
    if (state.monthM > 12) { state.monthM = 1; state.monthY++; }
  } else if (state.view === 'week' || state.view === 'two') {
    state.weekIdx = Math.max(0, Math.min(state.weeks.length - 1, state.weekIdx + dir));
  } else {
    /* 하루 보기: 주 경계 넘어 이동 */
    let abs = state.weekIdx * 7 + state.dayIdx + dir;
    abs = Math.max(0, Math.min(state.weeks.length * 7 - 1, abs));
    state.weekIdx = Math.floor(abs / 7);
    state.dayIdx = abs % 7;
  }
  render();
}

/* ===== 메인 ===== */
async function refresh(isFirst) {
  const json = await fetchData(isFirst);
  if (!json) { renderMeta(); return; }
  try {
    const str = JSON.stringify(json);
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    const sig = h + '|' + str.length;
    const weeks = parseGrid(json);
    const title = (json.properties && json.properties.title) || '';
    const vm = title.match(/v\s?\d+/i);
    state.ver = vm ? vm[0].replace(/\s/, '') : '';
    const changed = sig !== state.dataSig;
    state.dataSig = sig;
    state.weeks = weeks;
    if (isFirst) {
      gotoToday();
      const n = kstNow();
      state.monthY = n.y; state.monthM = n.m;
    }
    if (isFirst || changed) render(); else renderMeta();
  } catch (e) {
    console.error(e);
    if (isFirst) {
      $('grid').innerHTML = '<div style="grid-column:1/-1;padding:20px;font-size:13px">시트 파싱 오류: ' + e.message + '</div>';
    }
  }
}

function bindUI() {
  $('btnPrev').addEventListener('click', () => navDelta(-1));
  $('btnNext').addEventListener('click', () => navDelta(1));
  $('tabDay').addEventListener('click', () => { state.view = 'day'; gotoToday(); render(); });
  $('tabWeek').addEventListener('click', () => { state.view = 'week'; gotoToday(); render(); });
  $('tabTwo').addEventListener('click', () => { state.view = 'two'; gotoToday(); render(); });
  $('tabMonth').addEventListener('click', () => {
    state.view = 'month';
    const n = kstNow();
    state.monthY = n.y; state.monthM = n.m;
    render();
  });
  $('popClose').addEventListener('click', () => { $('sheetpop').hidden = true; });
  $('sheetpop').addEventListener('click', e => { if (e.target === $('sheetpop')) $('sheetpop').hidden = true; });

  /* 스와이프 = 화살표와 동일한 이동 */
  let tx = null;
  $('grid').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('grid').addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 48) navDelta(dx < 0 ? 1 : -1);
    tx = null;
  }, { passive: true });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });
}

async function main() {
  bindUI();
  await refresh(true);
  setInterval(() => { if (!document.hidden && CONFIG.API_KEY) refresh(false); }, CONFIG.POLL_MS);
  /* 현재 교시 강조 갱신 */
  setInterval(() => { if (!document.hidden) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CONFIG.API_KEY) refresh(false); });
  /* localhost(개발)에서는 SW 미등록 — 캐시가 코드 수정을 가리는 것 방지 */
  if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
main();
