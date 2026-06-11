// 의학과 2학년 시간표 위젯 — 이 코드만 Scriptable에 붙여넣으면 됩니다.
// 본체는 매번 최신 버전을 자동으로 받아오므로 수정/재설치가 필요 없습니다.
// 모든 위젯 크기에서 이번 주 주간 시간표가 나옵니다.
const SRC = 'https://pureart-art.github.io/Timetable26-1/widget/timetable-widget.js';
const fm = FileManager.local();
const cache = fm.joinPath(fm.cacheDirectory(), 'timetable-widget-code.js');
let code = null;
try {
  const req = new Request(SRC + '?v=' + Math.floor(Date.now() / 3600000));
  req.timeoutInterval = 10;
  const s = await req.loadString();
  if (s && s.includes('TIMETABLE_WIDGET')) { code = s; fm.writeString(cache, s); }
} catch (e) {}
if (!code && fm.fileExists(cache)) code = fm.readString(cache);
if (!code) {
  const w = new ListWidget();
  const t = w.addText('시간표 위젯: 네트워크 연결 후 다시 시도해주세요');
  t.font = Font.systemFont(12);
  if (config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
  Script.complete();
} else {
  await new Function('return (async () => {' + code + '})()')();
}
