// TIMETABLE_WIDGET v5 — 의학과 2학년 시간표 Scriptable 위젯 본체
// 로더가 이 파일을 받아 실행합니다. 직접 수정할 일은 없습니다.
// 모든 크기에서 이번 주 주간 격자를 보여줍니다.
// v5: 공휴일(헤더 날짜 빨간 글자) 요일 헤더를 일요일과 같은 분홍으로.

const PWA_URL = 'https://pureart-art.github.io/Timetable26-1/';
const SHEET_ID = '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4';
const API_KEY = 'AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k';   // 사이트용(리퍼러 제한) 키
const WIDGET_KEY = '';                                        // 위젯 전용 예비 키 — 필요 시 입력
const TAB = '시간표';

const PERIODS = [
  { no: '1', t1: '09:00' }, { no: '2', t1: '10:00' }, { no: '3', t1: '11:00' }, { no: '4', t1: '12:00' },
  { no: '점심', t1: '13:00' }, { no: '5', t1: '14:00' }, { no: '6', t1: '15:00' }, { no: '7', t1: '16:00' }, { no: '8', t1: '17:00' },
];
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
const BG_MAP = { '#FDCBB5': '#FCE4D6', '#FFC000': '#FFF1D6' };

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
  req.timeoutInterval = 15;
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

/* 1단계: C열(월요일 날짜)만 받아 주 헤더 행 위치들 찾기 */
async function findCurrentWeekRow() {
  const params = 'ranges=' + encodeURIComponent(TAB + '!C1:C1000') +
    '&includeGridData=true&fields=' + encodeURIComponent('sheets.data.rowData.values(effectiveValue.numberValue)');
  const json = await apiGetWithFallback(params);
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
  let pick = headers[0];
  for (const h of headers) if (ts >= h.monday) pick = h;          // 오늘 이전 시작 중 가장 늦은 주
  if (ts >= pick.monday + 7) pick = headers[headers.length - 1];  // 학기 끝나면 마지막 주
  return pick;
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
      cells.push({ p, d, rowSpan, colSpan, lines, bg: lightenBg(bgRaw), isEmpty: lines.length === 0 });
    }
  }
  return { label, monday, cells, holidays };
}

async function loadWeek() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), 'timetable-week-v3.json');
  try {
    const hdr = await findCurrentWeekRow();
    const week = await loadWeekBlock(hdr.row, hdr.monday);
    fm.writeString(cachePath, JSON.stringify(week));
    return { week, fromCache: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) return { week: JSON.parse(fm.readString(cachePath)), fromCache: true };
    throw e;
  }
}

/* ===== 주간 격자 렌더 (전 크기 공통) ===== */
function buildWeekWidget(week, fromCache) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#FFFFFF');
  w.url = PWA_URL;
  w.setPadding(0, 0, 0, 0);
  const ts = todaySerial();

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

  const big = H >= 300;
  const TOP = 0;                        /* 제목 줄 없음 — 격자가 전체 공간 사용 */
  const HDR = big ? 24 : 17;
  const timeW = W >= 600 ? 56 : (W >= 300 ? 26 : 20);
  const dayW = (W - timeW) / 7;
  const rowH = (H - TOP - HDR) / 9;
  const fTitle = Math.max(6, Math.min(11, Math.floor(rowH * 0.36)));
  const fHdr = Math.max(7, Math.min(12, Math.floor(HDR * 0.46)));
  const line = new Color('#CFCCC4');

  const gx = c => timeW + c * dayW;
  const gy = p => TOP + HDR + p * rowH;
  const todayD = (ts >= week.monday && ts < week.monday + 7) ? ts - week.monday : -1;

  for (let d = 0; d < 7; d++) {
    const isHol = d === 6 || (week.holidays && week.holidays[d]);
    const bg = isHol ? '#F7D2D2' : (d === 5 ? '#E7EEF6' : '#F1EFE8');
    ctx.setFillColor(new Color(bg));
    ctx.fillRect(new Rect(gx(d), TOP, dayW, HDR));
    const ymd = serialToYMD(week.monday + d);
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(fHdr));
    ctx.setTextColor(new Color('#3a3a37'));
    ctx.drawTextInRect(DAY_NAMES[d] + (dayW >= 38 ? ' ' + ymd.m + '.' + ymd.d : ''), new Rect(gx(d), TOP + (HDR - fHdr) / 2 - 1, dayW, fHdr + 4));
  }
  ctx.setFillColor(new Color('#F1EFE8'));
  ctx.fillRect(new Rect(0, TOP, timeW, HDR + 9 * rowH));
  if (week.label) {
    /* 코너 칸에 주차 라벨 (예: 11주) */
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(Math.max(6, fHdr - 2)));
    ctx.setTextColor(new Color('#5f5e5a'));
    ctx.drawTextInRect(week.label + (fromCache ? '·오프라인' : ''), new Rect(0, TOP + (HDR - fHdr) / 2, timeW, fHdr + 3));
  }
  for (let p = 0; p < 9; p++) {
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(Math.max(6, Math.min(10, Math.floor(rowH * 0.32)))));
    ctx.setTextColor(new Color('#5f5e5a'));
    if (timeW >= 40) {
      ctx.drawTextInRect(PERIODS[p].no, new Rect(0, gy(p) + rowH / 2 - 12, timeW, 12));
      ctx.setFont(Font.systemFont(8));
      ctx.setTextColor(new Color('#8a897f'));
      ctx.drawTextInRect(PERIODS[p].t1, new Rect(0, gy(p) + rowH / 2 + 1, timeW, 10));
    } else {
      ctx.drawTextInRect(PERIODS[p].no === '점심' ? '점' : PERIODS[p].no, new Rect(0, gy(p) + rowH / 2 - 5, timeW, 11));
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
    if (cm.bg && cm.bg !== '#FFFFFF') {
      ctx.setFillColor(new Color(cm.bg));
      ctx.fillRect(new Rect(x, y, ww, hh));
    }
    strokeRectPx(x, y, ww, hh);
    if (!cm.isEmpty) {
      const l1 = cm.lines[0];
      const showSub = big && cm.lines.length > 1 && hh > 42;
      ctx.setTextAlignedCenter();
      ctx.setFont(Font.boldSystemFont(fTitle));
      ctx.setTextColor(new Color(l1.color && l1.color !== '#000000' ? l1.color : '#000000'));
      const titleH = Math.max(fTitle + 2, showSub ? hh * 0.55 : hh - 4);
      ctx.drawTextInRect(l1.text, new Rect(x + 2, y + (showSub ? 3 : Math.max(2, (hh - titleH) / 2)), ww - 4, titleH));
      if (showSub) {
        const sub = cm.lines.slice(1).map(s => s.text).join(' ');
        ctx.setFont(Font.boldSystemFont(Math.max(7, fTitle - 2)));
        ctx.setTextColor(new Color(cm.lines[cm.lines.length - 1].color || '#73726c'));
        ctx.drawTextInRect(sub, new Rect(x + 2, y + hh * 0.58, ww - 4, hh * 0.38));
      }
    }
  }
  strokeRectPx(0, TOP, timeW + 7 * dayW, HDR + 9 * rowH);
  if (todayD >= 0) {
    strokeRectPx(gx(todayD) + 1, TOP + 1, dayW - 2, HDR + 9 * rowH - 2, new Color('#2E75B6'), 2);
  }

  /* contain 배치: 기기마다 위젯 실제 크기가 달라도 잘리지 않음 */
  const wi = w.addImage(ctx.getImage());
  wi.centerAlignImage();
  return w;
}

/* ===== 메인 ===== */
async function main() {
  let widget;
  try {
    const { week, fromCache } = await loadWeek();
    widget = buildWeekWidget(week, fromCache);
  } catch (e) {
    widget = new ListWidget();
    widget.backgroundColor = new Color('#FFFFFF');
    const t = widget.addText('시간표를 불러오지 못했어요\n' + e.message);
    t.font = Font.systemFont(12);
    t.textColor = new Color('#C04848');
    widget.url = PWA_URL;
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
