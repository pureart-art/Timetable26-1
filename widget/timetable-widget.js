// TIMETABLE_WIDGET v2 — 의학과 2학년 시간표 Scriptable 위젯 본체
// 로더가 이 파일을 받아 실행합니다. 직접 수정할 일은 없습니다.
// 모든 크기에서 이번 주 주간 격자를 보여줍니다 (크기에 맞춰 자동 축소).

const PWA_URL = 'https://pureart-art.github.io/Timetable26-1/';
const SHEET_ID = '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4';
const API_KEY = 'AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k';   // 사이트용(리퍼러 제한) 키
const WIDGET_KEY = '';                                        // 위젯 전용(제한 없는) 예비 키 — 필요 시 입력
const TAB = '시간표';
const FIELDS = 'sheets.properties,sheets.merges,' +
  'sheets.data.rowData.values(formattedValue,effectiveValue,' +
  'effectiveFormat.backgroundColor,effectiveFormat.textFormat.foregroundColor,' +
  'effectiveFormat.textFormat.foregroundColorStyle,textFormatRuns)';

const PERIODS = [
  { no: '1', t1: '09:00', t2: '09:50' }, { no: '2', t1: '10:00', t2: '10:50' },
  { no: '3', t1: '11:00', t2: '11:50' }, { no: '4', t1: '12:00', t2: '12:50' },
  { no: '점심', t1: '13:00', t2: '14:00' }, { no: '5', t1: '14:00', t2: '14:50' },
  { no: '6', t1: '15:00', t2: '15:50' }, { no: '7', t1: '16:00', t2: '16:50' },
  { no: '8', t1: '17:00', t2: '17:50' },
];
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
const FIRST_DAY_COL = 2, BLOCK_ROWS = 10;
const BG_MAP = { '#FDCBB5': '#FCE4D6', '#FFC000': '#FFF1D6' };

/* ===== 유틸 (앱 파서와 동일 로직) ===== */
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
function getCell(rowData, r, c) {
  const row = rowData[r];
  return (row && row.values && row.values[c]) || null;
}
function cellNumber(cell) {
  return cell && cell.effectiveValue && typeof cell.effectiveValue.numberValue === 'number'
    ? cell.effectiveValue.numberValue : null;
}
function isDateSerial(n) { return n !== null && n > 20000 && n < 80000; }

function parseGrid(api) {
  const sheet = api.sheets && api.sheets[0];
  const rowData = sheet.data[0].rowData;
  const merges = sheet.merges || [];
  const mergeAt = new Map();
  for (const m of merges)
    for (let r = m.startRowIndex; r < m.endRowIndex; r++)
      for (let c = m.startColumnIndex; c < m.endColumnIndex; c++)
        mergeAt.set(r + ',' + c, m);
  const headers = [];
  for (let r = 0; r < rowData.length; r++) {
    let n = 0;
    for (let c = FIRST_DAY_COL; c < FIRST_DAY_COL + 7; c++)
      if (isDateSerial(cellNumber(getCell(rowData, r, c)))) n++;
    if (n >= 3) headers.push(r);
  }
  const rawMon = headers.map(h => {
    const n = cellNumber(getCell(rowData, h, FIRST_DAY_COL));
    return isDateSerial(n) ? Math.round(n) : null;
  });
  const bases = rawMon.map((m, i) => (m === null ? null : m - 7 * i)).filter(v => v !== null).sort((a, b) => a - b);
  const baseMedian = bases.length ? bases[Math.floor(bases.length / 2)] : dateToSerial(2026, 3, 30);
  const mondays = rawMon.map((m, i) => {
    const ex = baseMedian + 7 * i;
    return (m === null || Math.abs(m - ex) > 1) ? ex : m;
  });
  return headers.map((h, wi) => {
    const aCell = getCell(rowData, h, 0);
    const label = (aCell && aCell.formattedValue || '').trim() || (wi + 1) + '주';
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
        cells.push({ p, d, rowSpan, colSpan, lines, bg: lightenBg(bgRaw), isEmpty: lines.length === 0 });
      }
    }
    return { label, monday: mondays[wi], cells };
  });
}

/* ===== 데이터 (네트워크 → 실패 시 캐시) ===== */
async function fetchApi(key, withReferer) {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID +
    '?ranges=' + encodeURIComponent(TAB) + '&includeGridData=true&fields=' +
    encodeURIComponent(FIELDS) + '&key=' + key;
  const req = new Request(url);
  req.timeoutInterval = 15;
  if (withReferer) req.headers = { 'Referer': PWA_URL };
  const api = await req.loadJSON();
  if (!api || !api.sheets) throw new Error(api && api.error ? 'API ' + api.error.code + ': ' + api.error.message : 'bad response');
  return api;
}
async function loadWeeks() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), 'timetable-data.json');
  let api = null, fromCache = false, lastErr = null;
  /* 1) 사이트용 키 + Referer → 2) 위젯 전용 키 → 3) 마지막 캐시 */
  try { api = await fetchApi(API_KEY, true); }
  catch (e1) {
    lastErr = e1;
    if (WIDGET_KEY) { try { api = await fetchApi(WIDGET_KEY, false); } catch (e2) { lastErr = e2; } }
  }
  if (api) {
    fm.writeString(cachePath, JSON.stringify(api));
  } else if (fm.fileExists(cachePath)) {
    api = JSON.parse(fm.readString(cachePath));
    fromCache = true;
  } else {
    throw lastErr || new Error('데이터 없음');
  }
  return { weeks: parseGrid(api), fromCache };
}

/* ===== 주간 위젯 (DrawContext 격자) — 모든 크기 공통, 크기에 맞춰 축소 ===== */
function buildWeekWidget(weeks, fromCache) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#FFFFFF');
  w.url = PWA_URL;
  w.setPadding(0, 0, 0, 0);
  const ts = todaySerial();
  let week = weeks.find(x => ts >= x.monday && ts < x.monday + 7);
  if (!week) week = weeks[0];

  /* 위젯 포인트 크기 근사 (캔버스를 실제 크기로 그려야 글자가 선명) */
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

  const big = H >= 300;                 /* large/XL */
  const TOP = big ? 26 : 0;             /* 제목 줄 (작은 위젯은 생략) */
  const HDR = big ? 26 : 17;
  const timeW = W >= 600 ? 56 : (W >= 300 ? 26 : 20);
  const dayW = (W - timeW) / 7;
  const rowH = (H - TOP - HDR) / 9;
  const fTitle = Math.max(6, Math.min(11, Math.floor(rowH * 0.36)));
  const fHdr = Math.max(7, Math.min(12, Math.floor(HDR * 0.46)));
  const line = new Color('#CFCCC4');
  const ymdM = serialToYMD(week.monday), ymdS = serialToYMD(week.monday + 6);

  if (big) {
    ctx.setTextAlignedLeft();
    ctx.setFont(Font.boldSystemFont(13));
    ctx.setTextColor(new Color('#1f1e1c'));
    ctx.drawTextInRect('의학과 2학년 — ' + week.label + ' (' + ymdM.m + '.' + ymdM.d + '–' + ymdS.m + '.' + ymdS.d + ')' + (fromCache ? ' · 오프라인' : ''), new Rect(8, 5, W - 16, 18));
  }

  const gx = c => timeW + c * dayW;
  const gy = p => TOP + HDR + p * rowH;
  const todayD = (ts >= week.monday && ts < week.monday + 7) ? ts - week.monday : -1;

  /* 요일 헤더 */
  for (let d = 0; d < 7; d++) {
    const bg = d === 6 ? '#F7D2D2' : (d === 5 ? '#E7EEF6' : '#F1EFE8');
    ctx.setFillColor(new Color(bg));
    ctx.fillRect(new Rect(gx(d), TOP, dayW, HDR));
    const ymd = serialToYMD(week.monday + d);
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(fHdr));
    ctx.setTextColor(new Color('#3a3a37'));
    ctx.drawTextInRect(DAY_NAMES[d] + (dayW >= 38 ? ' ' + ymd.m + '.' + ymd.d : ''), new Rect(gx(d), TOP + (HDR - fHdr) / 2 - 1, dayW, fHdr + 4));
  }
  /* 교시 열 (좁으면 교시 번호만, 작은 위젯은 주차 라벨을 코너에) */
  ctx.setFillColor(new Color('#F1EFE8'));
  ctx.fillRect(new Rect(0, TOP, timeW, HDR + 9 * rowH));
  if (!big) {
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(Math.max(6, fHdr - 2)));
    ctx.setTextColor(new Color('#5f5e5a'));
    ctx.drawTextInRect(week.label, new Rect(0, TOP + (HDR - fHdr) / 2, timeW, fHdr + 3));
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
  /* 칸 */
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
      const showSub = big && cm.lines.length > 1 && hh > 46;
      ctx.setTextAlignedCenter();
      ctx.setFont(Font.boldSystemFont(fTitle));
      ctx.setTextColor(new Color(l1.color && l1.color !== '#000000' ? l1.color : '#000000'));
      const titleH = Math.max(fTitle + 2, showSub ? hh * 0.58 : hh - 4);
      ctx.drawTextInRect(l1.text, new Rect(x + 2, y + (showSub ? 3 : Math.max(2, (hh - titleH) / 2)), ww - 4, titleH));
      if (showSub) {
        const sub = cm.lines.slice(1).map(s => s.text).join(' ');
        ctx.setFont(Font.boldSystemFont(Math.max(6, fTitle - 2)));
        ctx.setTextColor(new Color(cm.lines[cm.lines.length - 1].color || '#73726c'));
        ctx.drawTextInRect(sub, new Rect(x + 2, y + hh * 0.62, ww - 4, hh * 0.34));
      }
    }
  }
  /* 외곽선 + 오늘 열 강조 */
  strokeRectPx(0, TOP, timeW + 7 * dayW, HDR + 9 * rowH);
  if (todayD >= 0) {
    strokeRectPx(gx(todayD) + 1, TOP + 1, dayW - 2, HDR + 9 * rowH - 2, new Color('#2E75B6'), 2);
  }

  w.backgroundImage = ctx.getImage();
  return w;
}

/* ===== 메인 ===== */
async function main() {
  let widget;
  try {
    const { weeks, fromCache } = await loadWeeks();
    widget = buildWeekWidget(weeks, fromCache);   /* 모든 크기 = 주간 격자 */
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
