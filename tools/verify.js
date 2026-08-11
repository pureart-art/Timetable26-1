/* 브라우저 검증 하니스 — http://localhost:8741 프리뷰의 페이지 컨텍스트에 붙여넣어 실행한다.
   각 check*()는 [{name, pass, detail}] 를 반환하고, runAll()이 전부 모아 출력한다.
   테스트 러너가 없는 레포라 이 파일이 회귀 방지선이다. */

/* --- 합성 시트: parseGrid에 먹일 최소 형태의 Sheets API 응답 --- */
function fakeCellNum(n) { return { effectiveValue: { numberValue: n }, formattedValue: String(n) }; }
function fakeCellStr(s) { return { formattedValue: s }; }
/* 헤더 1행(A=라벨, C~I=날짜) + 교시 9행(빈 칸) = 10행 */
function fakeWeekRows(label, monday) {
  const hdr = { values: [fakeCellStr(label), fakeCellStr('')] };
  for (let d = 0; d < 7; d++) hdr.values.push(fakeCellNum(monday + d));
  const rows = [hdr];
  for (let p = 0; p < 9; p++) rows.push({ values: [] });
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

function runAll() {
  const checks = [checkParser];
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
