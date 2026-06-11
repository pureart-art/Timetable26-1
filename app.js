/* =========================================================
   의학과 2학년 시간표 PWA
   데이터: Google Sheets API v4 spreadsheets.get(includeGridData)
   ========================================================= */
'use strict';

/* ===== CONFIG — API_KEY는 GY가 직접 입력 ===== */
const CONFIG = {
  SHEET_ID: '1ApcQRzpRt5J3qHysCEq7uzCekYp_RusG',
  API_KEY: '',            // ← 여기에 Google Cloud API 키 입력
  TAB: '시간표',
  POLL_MS: 45000,
};

const FIELDS = 'sheets.properties,sheets.merges,' +
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

/* 알려진 블록색 → 과목명 (범례용, 그 외 색은 이름 없이 스와치만) */
const KNOWN_BLOCKS = { '#FDCBB5': '검사·영상의학', '#FFC000': '임상표현', '#FCE4D6': '검사·영상의학' };

/* ===== 상태 ===== */
const state = {
  weeks: [],            // 파싱된 주 블록들
  weekIdx: 0,           // 현재 표시 주
  dayIdx: 0,            // 좁은 화면 선택 요일
  source: '',           // 'live' | 'cache' | 'snapshot'
  lastFetched: null,
  forceWeekWide: false, // 좁은 화면에서 주간 보기 토글
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
/* textFormat에서 글자색: foregroundColor 또는 foregroundColorStyle.rgbColor */
function fgOf(fmt) {
  if (!fmt) return null;
  return fmt.foregroundColor || (fmt.foregroundColorStyle && fmt.foregroundColorStyle.rgbColor) || null;
}
function isWhite(hex) { return !hex || hex === '#FFFFFF'; }
/* 브리프 권장 매핑 (그 외 색은 HSL 명도 0.915 규칙) */
const BG_MAP = { '#FDCBB5': '#FCE4D6', '#FFC000': '#FFF1D6' };
/* 시트 원색 → 연한 블록색 (HSL 명도 0.915로) */
function lightenBg(hex) {
  if (isWhite(hex)) return '#FFFFFF';
  if (BG_MAP[hex]) return BG_MAP[hex];
  let [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const dd = max - min;
    s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    if (max === r) h = ((g - b) / dd + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / dd + 2) / 6;
    else h = ((r - g) / dd + 4) / 6;
  }
  l = Math.max(l, 0.915);
  const hue = t => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const f = v => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
  return s === 0 ? '#' + f(l) + f(l) + f(l) : '#' + f(hue(h + 1 / 3)) + f(hue(h)) + f(hue(h - 1 / 3));
}

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

  /* 병합 lookup: "r,c" → merge */
  const mergeAt = new Map();
  for (const m of merges) {
    for (let r = m.startRowIndex; r < m.endRowIndex; r++)
      for (let c = m.startColumnIndex; c < m.endColumnIndex; c++)
        mergeAt.set(r + ',' + c, m);
  }

  /* 1) 주 헤더행 탐지: C~I 중 3칸 이상이 날짜 시리얼 */
  const headers = [];
  for (let r = 0; r < rowData.length; r++) {
    let dateCount = 0;
    for (let c = FIRST_DAY_COL; c < FIRST_DAY_COL + 7; c++) {
      if (isDateSerial(cellNumber(getCell(rowData, r, c)))) dateCount++;
    }
    if (dateCount >= 3) headers.push(r);
  }

  /* 2) 주별 월요일 시리얼 + 오타 보정 (기준선 = median(monday - 7*i)) */
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

  /* 3) 각 주 블록 파싱 */
  const weeks = headers.map((h, wi) => {
    const aCell = getCell(rowData, h, 0);
    const label = (aCell && aCell.formattedValue || '').trim() || (wi + 1) + '주';
    const cells = [];           // 배치된 칸(수업/병합 빈칸)
    const covered = new Set();  // 병합으로 덮인 (p,d)

    for (let p = 0; p < 9; p++) {
      for (let d = 0; d < 7; d++) {
        if (covered.has(p + ',' + d)) continue;
        const r = h + 1 + p, c = FIRST_DAY_COL + d;
        const m = mergeAt.get(r + ',' + c);
        let rowSpan = 1, colSpan = 1;
        if (m) {
          /* 블록/요일 범위로 클립 */
          const rEnd = Math.min(m.endRowIndex, h + BLOCK_ROWS);
          const cEnd = Math.min(m.endColumnIndex, FIRST_DAY_COL + 7);
          if (m.startRowIndex < r || m.startColumnIndex < c) {
            /* anchor가 아님 — 이 칸이 블록 내 첫 등장이 아닌 경우만 스킵
               (위 covered 체크로 보통 안 옴; 블록 경계 넘는 병합 방어) */
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
        });
      }
    }
    return { label, monday: mondays[wi], cells };
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
    /* SW 캐시 폴백은 fetch 단계에서 처리됨. 그래도 실패하면 스냅샷 */
    console.warn('API 실패, 폴백:', e.message);
    if (isFirst) {
      const snap = await loadSnapshot();
      state.source = 'snapshot';
      return snap;
    }
    return null; /* 폴링 중 실패 — 기존 화면 유지 */
  }
}

/* ===== 렌더 ===== */
const $ = id => document.getElementById(id);
function isNarrow() { return window.innerWidth < 720 && !state.forceWeekWide; }

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

function makeCellDiv(cellModel, gridCol, gridRow, colSpan, rowSpan, extraCls) {
  const div = document.createElement('div');
  div.className = 'cell' + (extraCls ? ' ' + extraCls : '');
  div.style.gridColumn = gridCol + (colSpan > 1 ? ' / span ' + colSpan : '');
  div.style.gridRow = gridRow + (rowSpan > 1 ? ' / span ' + rowSpan : '');
  if (cellModel) {
    if (cellModel.bg && cellModel.bg !== '#FFFFFF') div.style.background = cellModel.bg;
    cellModel.lines.forEach((ln, i) => {
      const el = document.createElement('div');
      el.className = i === 0 ? 'l1' : (i >= 2 && i === cellModel.lines.length - 1 ? 'l3' : 'l2');
      el.textContent = ln.text;
      if (ln.color && ln.color !== '#000000') el.style.color = ln.color;
      el.style.color = ln.color || '#000000';
      div.appendChild(el);
    });
    if (cellModel.lines.length) {
      div.addEventListener('click', () => showPop(cellModel));
    }
  }
  return div;
}

function renderWeek() {
  const w = state.weeks[state.weekIdx];
  if (!w) return;
  const grid = $('grid');
  grid.innerHTML = '';
  const narrow = isNarrow();
  grid.className = 'gridc ' + (narrow ? 'dayview' : 'weekwide');

  const todayWeek = weekOfToday() === state.weekIdx;
  const todaySerial = kstNow().serial;
  const todayD = todayWeek ? todaySerial - w.monday : -1;
  const nowP = todayWeek ? currentPeriodIdx() : -1;

  /* 헤더/범위 표시 */
  const mon = serialToYMD(w.monday), sun = serialToYMD(w.monday + 6);
  $('weekLabel').textContent = w.label;
  $('weekRange').textContent = mon.y + '. ' + mon.m + '. ' + mon.d + ' – ' + sun.m + '. ' + sun.d;

  const days = narrow ? [state.dayIdx] : [0, 1, 2, 3, 4, 5, 6];

  /* 코너 + 요일 헤더 */
  const corner1 = document.createElement('div'); corner1.className = 'cell cor'; corner1.textContent = '교시';
  const corner2 = document.createElement('div'); corner2.className = 'cell cor'; corner2.textContent = '시간';
  corner1.style.gridColumn = 1; corner1.style.gridRow = 1;
  corner2.style.gridColumn = 2; corner2.style.gridRow = 1;
  grid.append(corner1, corner2);
  days.forEach((d, i) => {
    const ymd = serialToYMD(w.monday + d);
    const div = document.createElement('div');
    div.className = 'cell hdr' + (d === 5 ? ' wknd' : '') + (d === 6 ? ' sun' : '') + (d === todayD ? ' todaycol' : '');
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
    tim.textContent = p.time;
    grid.append(per, tim);
  });

  /* 본문 칸 */
  if (!narrow) {
    for (const cm of w.cells) {
      const cls = (cm.d <= todayD && todayD < cm.d + cm.colSpan)
        ? 'todaybody' + (cm.p + cm.rowSpan === 9 ? ' lastrow' : '') : '';
      grid.appendChild(makeCellDiv(cm, 3 + cm.d, 2 + cm.p, cm.colSpan, cm.rowSpan, cls));
    }
  } else {
    /* 단일 요일: 선택 요일을 덮는 칸만, 가로 병합은 1칸으로 */
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

  renderDayTabs(narrow, w, todayD);
  renderLegend(w);
  renderMeta();
}

function renderDayTabs(narrow, w, todayD) {
  const tabs = $('daytabs');
  tabs.hidden = !narrow;
  if (!narrow) return;
  tabs.innerHTML = '';
  for (let d = 0; d < 7; d++) {
    const ymd = serialToYMD(w.monday + d);
    const b = document.createElement('button');
    b.className = 'dtab' + (d === 5 ? ' sat' : '') + (d === 6 ? ' sun' : '') + (d === state.dayIdx ? ' sel' : '');
    b.innerHTML = '<span></span><span class="dtd"></span>';
    b.firstChild.textContent = DAY_NAMES[d] + (d === todayD ? '·오늘' : '');
    b.lastChild.textContent = ymd.m + '.' + ymd.d;
    b.addEventListener('click', () => { state.dayIdx = d; renderWeek(); });
    tabs.appendChild(b);
  }
}

function renderLegend(w) {
  const seen = new Map();
  for (const cm of w.cells) if (cm.bgRaw && !cm.isEmpty) {
    const key = cm.bg;
    if (!seen.has(key)) seen.set(key, KNOWN_BLOCKS[cm.bgRaw] || '');
  }
  let html = '<span class="tk">칸 배경(과목 블록):</span> ';
  for (const [hex, name] of seen) {
    html += '<span><span class="sw" style="background:' + hex + '"></span>' + (name || '과목 블록') + '</span>&nbsp;&nbsp;';
  }
  html += '<span><span class="sw" style="background:#FFFFFF"></span>점심·기타(채우기 없음)</span><br>' +
    '<span class="tk">글자색(시트 그대로):</span> <span style="color:#000">■ 검정 = 과목·교수</span>&nbsp;&nbsp;' +
    '<span style="color:#2E75B6">■ 파랑 = 초안자/검안자 줄·점심 그룹</span>&nbsp;&nbsp;' +
    '<span style="color:#FF0000">■ 빨강 = 시험/평가</span><br>' +
    '3번째 줄 = 초안자/검안자 · 점심 칸 = 과목 (그룹N: 그룹장/학습부장) · 빈 칸 = 공강 · 병합된 칸 = 연강 · 토 파랑 · 일 빨강';
  $('legend').innerHTML = html;
}

function renderMeta() {
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
  cm.lines.forEach((ln, i) => {
    const el = document.createElement('div');
    el.className = i === 0 ? 'l1' : (i >= 2 && i === cm.lines.length - 1 ? 'l3' : 'l2');
    el.textContent = ln.text;
    el.style.color = ln.color || '#000000';
    body.appendChild(el);
  });
  $('sheetpop').hidden = false;
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
    const changed = sig !== state.dataSig;
    state.dataSig = sig;
    state.weeks = weeks;
    if (isFirst) {
      const tw = weekOfToday();
      state.weekIdx = tw >= 0 ? tw : 0;
      const t = kstNow().serial - weeks[state.weekIdx].monday;
      state.dayIdx = (t >= 0 && t < 7) ? t : 0;
    }
    if (isFirst || changed) renderWeek(); else renderMeta();
  } catch (e) {
    console.error(e);
    if (isFirst) {
      $('grid').innerHTML = '<div style="grid-column:1/-1;padding:20px;font-size:13px">시트 파싱 오류: ' + e.message + '</div>';
    }
  }
}

function bindUI() {
  $('btnPrev').addEventListener('click', () => { if (state.weekIdx > 0) { state.weekIdx--; renderWeek(); } });
  $('btnNext').addEventListener('click', () => { if (state.weekIdx < state.weeks.length - 1) { state.weekIdx++; renderWeek(); } });
  $('btnToday').addEventListener('click', () => {
    const tw = weekOfToday();
    if (tw >= 0) {
      state.weekIdx = tw;
      const t = kstNow().serial - state.weeks[tw].monday;
      state.dayIdx = (t >= 0 && t < 7) ? t : 0;
      renderWeek();
    }
  });
  $('btnView').addEventListener('click', () => {
    state.forceWeekWide = !state.forceWeekWide;
    $('btnView').textContent = state.forceWeekWide ? '요일' : '주간';
    document.querySelector('.page').classList.toggle('gridwrap-scroll', state.forceWeekWide);
    renderWeek();
  });
  $('popClose').addEventListener('click', () => { $('sheetpop').hidden = true; });
  $('sheetpop').addEventListener('click', e => { if (e.target === $('sheetpop')) $('sheetpop').hidden = true; });

  /* 좁은 화면 스와이프로 요일 이동 */
  let tx = null;
  $('grid').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('grid').addEventListener('touchend', e => {
    if (tx === null || !isNarrow()) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 48) {
      if (dx < 0 && state.dayIdx < 6) state.dayIdx++;
      else if (dx > 0 && state.dayIdx > 0) state.dayIdx--;
      renderWeek();
    }
    tx = null;
  }, { passive: true });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderWeek, 150);
  });
}

async function main() {
  bindUI();
  await refresh(true);
  setInterval(() => { if (!document.hidden && CONFIG.API_KEY) refresh(false); }, CONFIG.POLL_MS);
  /* 현재 교시 강조 갱신 */
  setInterval(() => { if (!document.hidden) renderWeek(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CONFIG.API_KEY) refresh(false); });
  /* localhost(개발)에서는 SW 미등록 — 캐시가 코드 수정을 가리는 것 방지 */
  if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
main();
