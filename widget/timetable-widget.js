// TIMETABLE_WIDGET v1 — 의학과 2학년 시간표 Scriptable 위젯 본체
// 로더가 이 파일을 받아 실행합니다. 직접 수정할 일은 없습니다.
// 파라미터: "today"(기본) = 오늘 시간표 / "week" = 주간 격자(아이패드 초대형 권장)

const PWA_URL = 'https://pureart-art.github.io/Timetable26-1/';
const SHEET_ID = '1xcH1X2AOqbEghejABgNL55EfL8zjOXB7AYVYJZ0IaB4';
const API_KEY = 'AIzaSyCGjLnlXFA_Bi2mCKlUHyBUMxbE5Dlbj0k';
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
async function loadWeeks() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), 'timetable-data.json');
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID +
    '?ranges=' + encodeURIComponent(TAB) + '&includeGridData=true&fields=' +
    encodeURIComponent(FIELDS) + '&key=' + API_KEY;
  let api = null, fromCache = false;
  try {
    const req = new Request(url);
    req.timeoutInterval = 15;
    req.headers = { 'Referer': PWA_URL };
    api = await req.loadJSON();
    if (!api || !api.sheets) throw new Error('bad response');
    fm.writeString(cachePath, JSON.stringify(api));
  } catch (e) {
    if (fm.fileExists(cachePath)) { api = JSON.parse(fm.readString(cachePath)); fromCache = true; }
    else throw e;
  }
  return { weeks: parseGrid(api), fromCache };
}

/* ===== 오늘 위젯 (ListWidget) ===== */
function nowHM() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function buildTodayWidget(weeks, fromCache) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#FFFFFF');
  w.url = PWA_URL;
  w.setPadding(14, 16, 12, 16);
  const ts = todaySerial();
  const week = weeks.find(x => ts >= x.monday && ts < x.monday + 7);
  const big = config.widgetFamily === 'large' || config.widgetFamily === 'extraLarge';

  const ymd = serialToYMD(ts);
  const dIdx = week ? ts - week.monday : (new Date().getDay() + 6) % 7;
  const head = w.addText(DAY_NAMES[dIdx] + '요일 · ' + ymd.m + '.' + ymd.d + (week ? ' · ' + week.label : '') + (fromCache ? ' (오프라인)' : ''));
  head.font = Font.boldSystemFont(13);
  head.textColor = new Color('#5f5e5a');
  w.addSpacer(8);

  if (!week) {
    w.addSpacer();
    const t = w.addText('이번 주 시간표가 없어요');
    t.font = Font.systemFont(14);
    t.textColor = new Color('#8a897f');
    w.addSpacer();
    return w;
  }
  const entries = week.cells
    .filter(c => !c.isEmpty && c.d <= dIdx && dIdx < c.d + c.colSpan)
    .sort((a, b) => a.p - b.p);
  if (!entries.length) {
    w.addSpacer();
    const t = w.addText('오늘은 수업이 없어요 🎉');
    t.font = Font.systemFont(15);
    t.textColor = new Color('#5f5e5a');
    w.addSpacer();
    return w;
  }
  const mins = nowHM();
  const maxRows = big ? 7 : 3;
  let shown = entries;
  if (entries.length > maxRows) {
    /* 좁은 위젯: 지금 이후 수업 위주로 */
    const upcoming = entries.filter(c => {
      const pe = PERIODS[c.p + c.rowSpan - 1];
      return (parseInt(pe.t2.slice(0, 2)) * 60 + parseInt(pe.t2.slice(3))) > mins;
    });
    shown = (upcoming.length ? upcoming : entries).slice(0, maxRows);
  }
  for (const cm of shown) {
    const p1 = PERIODS[cm.p], p2 = PERIODS[cm.p + cm.rowSpan - 1];
    const cur = mins >= (parseInt(p1.t1.slice(0, 2)) * 60 + parseInt(p1.t1.slice(3))) &&
                mins < (parseInt(p2.t2.slice(0, 2)) * 60 + parseInt(p2.t2.slice(3)));
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const time = row.addText(p1.t1);
    time.font = cur ? Font.boldSystemFont(12) : Font.systemFont(12);
    time.textColor = new Color(cur ? '#2E75B6' : '#8a897f');
    row.addSpacer(8);
    const col = row.addStack();
    col.layoutVertically();
    const l1 = cm.lines[0];
    const t1 = col.addText((cur ? '▸ ' : '') + l1.text);
    t1.font = Font.boldSystemFont(13);
    t1.textColor = new Color(l1.color && l1.color !== '#000000' ? l1.color : '#1f1e1c');
    t1.lineLimit = 1;
    if (big && cm.lines[1]) {
      const sub = cm.lines.slice(1).map(x => x.text).join('  ');
      const t2 = col.addText(sub);
      t2.font = Font.systemFont(11);
      t2.textColor = new Color(cm.lines[1].color && cm.lines[1].color !== '#000000' ? cm.lines[1].color : '#73726c');
      t2.lineLimit = 1;
    }
    w.addSpacer(big ? 7 : 5);
  }
  if (shown.length < entries.length) {
    const t = w.addText('+' + (entries.length - shown.length) + '개 더 · 탭해서 전체 보기');
    t.font = Font.systemFont(10);
    t.textColor = new Color('#8a897f');
  }
  return w;
}

/* ===== 주간 위젯 (DrawContext 격자) ===== */
function buildWeekWidget(weeks, fromCache) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#FFFFFF');
  w.url = PWA_URL;
  w.setPadding(0, 0, 0, 0);
  const ts = todaySerial();
  let week = weeks.find(x => ts >= x.monday && ts < x.monday + 7);
  if (!week) week = weeks[0];

  const isXL = config.widgetFamily === 'extraLarge';
  const W = isXL ? 1160 : 720, H = isXL ? 530 : 690;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color('#FFFFFF'));
  ctx.fillRect(new Rect(0, 0, W, H));

  const TOP = 34, HDR = 34;
  const timeW = isXL ? 64 : 52;
  const dayW = (W - timeW) / 7;
  const rowH = (H - TOP - HDR) / 9;
  const line = new Color('#CFCCC4');
  const ymdM = serialToYMD(week.monday), ymdS = serialToYMD(week.monday + 6);

  /* 상단 제목 */
  ctx.setTextAlignedLeft();
  ctx.setFont(Font.boldSystemFont(15));
  ctx.setTextColor(new Color('#1f1e1c'));
  ctx.drawTextInRect('의학과 2학년 — ' + week.label + '  (' + ymdM.m + '.' + ymdM.d + '–' + ymdS.m + '.' + ymdS.d + ')' + (fromCache ? ' · 오프라인' : ''), new Rect(10, 7, W - 20, 22));

  const gx = c => timeW + c * dayW;
  const gy = p => TOP + HDR + p * rowH;

  /* 요일 헤더 */
  const todayD = (ts >= week.monday && ts < week.monday + 7) ? ts - week.monday : -1;
  for (let d = 0; d < 7; d++) {
    const bg = d === 6 ? '#F7D2D2' : (d === 5 ? '#E7EEF6' : '#F1EFE8');
    ctx.setFillColor(new Color(bg));
    ctx.fillRect(new Rect(gx(d), TOP, dayW, HDR));
    const ymd = serialToYMD(week.monday + d);
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(13));
    ctx.setTextColor(new Color('#3a3a37'));
    ctx.drawTextInRect(DAY_NAMES[d] + ' ' + ymd.m + '.' + ymd.d, new Rect(gx(d), TOP + 8, dayW, 18));
  }
  /* 시간 열 */
  ctx.setFillColor(new Color('#F1EFE8'));
  ctx.fillRect(new Rect(0, TOP, timeW, HDR + 9 * rowH));
  for (let p = 0; p < 9; p++) {
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(11));
    ctx.setTextColor(new Color('#5f5e5a'));
    ctx.drawTextInRect(PERIODS[p].no, new Rect(0, gy(p) + rowH / 2 - 14, timeW, 13));
    ctx.setFont(Font.systemFont(9));
    ctx.setTextColor(new Color('#8a897f'));
    ctx.drawTextInRect(PERIODS[p].t1, new Rect(0, gy(p) + rowH / 2, timeW, 11));
  }

  /* 칸 */
  const strokeRectPx = (x, y, ww, hh) => {
    ctx.setStrokeColor(line);
    ctx.setLineWidth(1);
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
      const showSub = cm.lines.length > 1 && hh > 46;
      const f1 = isXL ? 11 : 10;
      ctx.setTextAlignedCenter();
      ctx.setFont(Font.boldSystemFont(f1));
      ctx.setTextColor(new Color(l1.color && l1.color !== '#000000' ? l1.color : '#000000'));
      const titleH = Math.min(hh - 6, showSub ? hh * 0.62 : hh - 8);
      ctx.drawTextInRect(l1.text, new Rect(x + 3, y + (showSub ? 4 : Math.max(3, (hh - titleH) / 2)), ww - 6, titleH));
      if (showSub) {
        const sub = cm.lines.slice(1).map(s => s.text).join(' ');
        ctx.setFont(Font.boldSystemFont(f1 - 2));
        ctx.setTextColor(new Color(cm.lines[cm.lines.length - 1].color || '#73726c'));
        ctx.drawTextInRect(sub, new Rect(x + 3, y + hh * 0.66, ww - 6, hh * 0.3));
      }
    }
  }
  /* 외곽선 */
  strokeRectPx(0, TOP, timeW + 7 * dayW, HDR + 9 * rowH);
  /* 오늘 열 강조 */
  if (todayD >= 0) {
    ctx.setStrokeColor(new Color('#2E75B6'));
    ctx.setLineWidth(3);
    const path = new Path();
    path.addRect(new Rect(gx(todayD) + 1.5, TOP + 1.5, dayW - 3, HDR + 9 * rowH - 3));
    ctx.addPath(path);
    ctx.strokePath();
  }

  w.backgroundImage = ctx.getImage();
  return w;
}

/* ===== 메인 ===== */
async function main() {
  let widget;
  try {
    const { weeks, fromCache } = await loadWeeks();
    const param = (args.widgetParameter || '').trim().toLowerCase();
    const mode = param === 'week' || param === '주간' ? 'week'
      : param === 'today' || param === '오늘' ? 'today'
      : (config.widgetFamily === 'extraLarge' ? 'week' : 'today');
    widget = mode === 'week' ? buildWeekWidget(weeks, fromCache) : buildTodayWidget(weeks, fromCache);
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
    else await widget.presentLarge();
  }
  Script.complete();
}
await main();
