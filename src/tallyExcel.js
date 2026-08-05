// 마감 텔리 엑셀 렌더러 — V9.19 (2026-07-28)
//   computeTallyData(tallyReport.js) 결과를 실물 양식(GREEN MARINE TALLY REPORT 워크북)으로 그린다.
//   exceljs는 무거워서(≈1MB) 동적 import — 버튼을 누를 때만 로드.
//   시트 구성·순서는 실물 233개 분석 결과(마감텔리_양식_카탈로그) 그대로:
//   Final Work → Time Sheet → OS-IN → DM-IN → OS-OUT → DM-OUT → Act. Cntr-Seal → RF → Performance → SHIFTING

import { tenant } from './tenant.js';   // TallyUni 0.1: 회사·주소 단일 소스

const THIN = { style: 'thin' };
const CTR = { horizontal: 'center', vertical: 'middle' };   // V9.19-03: 드로잉 폴백도 전부 중앙정렬(사용자 확정)
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const TITLE_FONT = { name: 'Arial', size: 14, bold: true };
const HEAD_FONT = { name: 'Arial', size: 10, bold: true };
const BODY_FONT = { name: 'Arial', size: 10 };
const CO = () => tenant().companyEn;      // TallyUni 0.1: 리터럴 → 테넌트 값
const CITY = () => tenant().addressEn;

function head(ws, cols) {
  ws.getCell('A1').value = CO(); ws.getCell('A1').font = { ...HEAD_FONT, size: 12 };
  ws.getCell('A2').value = CITY(); ws.getCell('A2').font = BODY_FONT;
  void cols;
}
function sig(ws, row, leftLabel = 'CHIEF CHECKER', rightLabel = 'CHIEF OFFICER', rightCol = 'K', midLabel = '', midCol = 'F') {
  ws.getCell(`A${row}`).value = leftLabel;
  ws.getCell(`A${row}`).font = HEAD_FONT;
  if (midLabel) { ws.getCell(`${midCol}${row}`).value = midLabel; ws.getCell(`${midCol}${row}`).font = HEAD_FONT; }
  ws.getCell(`${rightCol}${row}`).value = rightLabel;
  ws.getCell(`${rightCol}${row}`).font = HEAD_FONT;
}
const d10 = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const nz = (v) => (v ? v : '');   // 실물 규칙: 빈 셀은 0이 아니라 공란

// ── 1. Final Work ─────────────────────────────────────────────
function sheetFinalWork(wb, D) {
  const ws = wb.addWorksheet('Final Work');
  ws.columns = [{ width: 9 }, { width: 7 }, { width: 12 }, ...Array(12).fill({ width: 6.5 })];
  ws.mergeCells('A1:O1'); ws.getCell('A1').value = CO();
  ws.getCell('A1').font = TITLE_FONT; ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:O2'); ws.getCell('A2').value = 'FINAL  WORKING  REPORT';
  ws.getCell('A2').font = { ...TITLE_FONT, size: 12, underline: true }; ws.getCell('A2').alignment = { horizontal: 'center' };
  const voy = [D.voyD, D.voyL].filter(Boolean).join(' & ');
  ws.getCell('A4').value = 'M/V :'; ws.getCell('B4').value = ` ${D.vslFull}`;
  ws.getCell('F4').value = 'VOY # :'; ws.getCell('G4').value = voy;
  ws.getCell('L4').value = 'DATE :'; ws.getCell('M4').value = d10(D.date);
  ws.getCell('A6').value = 'PIER :'; ws.getCell('B6').value = ` ${D.pier}`;
  ws.getCell('F6').value = 'BERTH :'; ws.getCell('G6').value = D.berth;
  ws.getCell('L6').value = 'PORT :'; ws.getCell('M6').value = ` ${CITY()}`;
  for (const a of ['A4', 'F4', 'L4', 'A6', 'F6', 'L6']) ws.getCell(a).font = HEAD_FONT;

  // 표 헤더 — OPERATOR | PORT | F/E | DISCH(n) 4칸 | LOAD(n) 4칸 | SHIFT(n) 4칸
  const hr = 8;
  ws.getCell(`A${hr}`).value = 'OPERATOR'; ws.getCell(`B${hr}`).value = 'PORT'; ws.getCell(`C${hr}`).value = 'FULL / EMPTY';
  ws.mergeCells(`D${hr}:G${hr}`); ws.getCell(`D${hr}`).value = `DISCH (${D.totals.dis.n})`;
  ws.mergeCells(`H${hr}:K${hr}`); ws.getCell(`H${hr}`).value = `LOAD (${D.totals.load.n})`;
  ws.mergeCells(`L${hr}:O${hr}`); ws.getCell(`L${hr}`).value = `SHIFT (${D.totals.shift.n})`;
  const sub = hr + 1;
  const szs = ["20'", "40'", 'HC', "45'"];
  ['D', 'H', 'L'].forEach((c0, gi) => szs.forEach((s, i) => {
    ws.getCell(`${String.fromCharCode(c0.charCodeAt(0) + i)}${sub}`).value = s;
    void gi;
  }));
  for (let c = 1; c <= 15; c++) {
    for (const r of [hr, sub]) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = HEAD_FONT; cell.alignment = { horizontal: 'center' }; cell.border = BOX;
    }
  }
  // 데이터 행
  let r = sub + 1;
  let lastOp = '', lastPort = '';
  for (const row of D.rows) {
    ws.getCell(`A${r}`).value = row.op !== lastOp ? row.op : '';
    ws.getCell(`B${r}`).value = (row.op !== lastOp || row.port !== lastPort) ? row.port : '';
    ws.getCell(`C${r}`).value = row.fe;
    const put = (c0, o) => ['20', '40', 'HC', '45'].forEach((s, i) =>
      ws.getCell(`${String.fromCharCode(c0.charCodeAt(0) + i)}${r}`).value = nz(o[s]));
    put('D', row.dis); put('H', row.load); put('L', row.shift);
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = BODY_FONT; cell.border = BOX; cell.alignment = { horizontal: 'center' };
    }
    lastOp = row.op; lastPort = row.port;
    r++;
  }
  // Total 2행 (F/E) — 실물 규칙: Total 행만 0 표기
  for (const fe of ['F', 'E']) {
    ws.getCell(`A${r}`).value = fe === 'F' ? 'Total' : '';
    ws.getCell(`C${r}`).value = fe;
    const put = (c0, t) => ['20', '40', 'HC', '45'].forEach((s, i) =>
      ws.getCell(`${String.fromCharCode(c0.charCodeAt(0) + i)}${r}`).value = t[s] || 0);
    put('D', D.totals.dis[fe]); put('H', D.totals.load[fe]); put('L', D.totals.shift[fe]);
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = HEAD_FONT; cell.border = BOX; cell.alignment = { horizontal: 'center' };
    }
    r++;
  }
  r += 1;
  ws.getCell(`A${r}`).value = 'Remarks : Discharging';
  ws.getCell(`H${r}`).value = 'Remarks : Loading';
  ws.getCell(`A${r}`).font = HEAD_FONT; ws.getCell(`H${r}`).font = HEAD_FONT;
  sig(ws, r + 12, 'CHIEF CHECKER', 'CHIEF OFFICER', 'K');
  return ws;
}

// ── 2. Time Sheet ─────────────────────────────────────────────
function sheetTimeSheet(wb, D) {
  const ws = wb.addWorksheet('Time Sheet');
  ws.columns = [{ width: 4 }, { width: 18 }, ...Array(8).fill({ width: 11 })];
  head(ws);
  ws.mergeCells('C3:H3'); ws.getCell('C3').value = 'T I M E    S H E E T';
  ws.getCell('C3').font = TITLE_FONT; ws.getCell('C3').alignment = { horizontal: 'center' };
  ws.getCell('A6').value = 'M / V :'; ws.getCell('B6').value = ` ${D.vslFull}`;
  ws.getCell('C6').value = 'VOY # :'; ws.getCell('D6').value = [D.voyD, D.voyL].filter(Boolean).join(' & ');
  ws.getCell('G6').value = 'DATE :'; ws.getCell('H6').value = d10(D.date);
  ws.getCell('A8').value = 'PIER :'; ws.getCell('B8').value = ` ${D.pier}`;
  ws.getCell('C8').value = 'BERTH :'; ws.getCell('D8').value = D.berth;
  ws.getCell('G8').value = 'WEATHER :'; ws.getCell('H8').value = 'Fine';
  ws.getCell('G10').value = `PORT : ${CITY()}`;
  for (const a of ['A6','C6','G6','A8','C8','G8','G10']) ws.getCell(a).font = HEAD_FONT;
  ws.getCell('B12').value = 'T I M E'; ws.getCell('C12').value = 'R E M A R K S';
  ws.getCell('B12').font = HEAD_FONT; ws.getCell('C12').font = HEAD_FONT;
  let r = 13;
  for (const row of D.timeSheet) {
    ws.getCell(`B${r}`).value = row.time; ws.getCell(`C${r}`).value = row.remark;
    ws.getCell(`B${r}`).font = BODY_FONT; ws.getCell(`C${r}`).font = BODY_FONT;
    r++;
  }
  // V9.19-03: 자료 없어도 틀 유지 — 빈 칸으로 (수기 기입 공간)
  sig(ws, Math.max(r + 4, 44), 'CHIEF CHECKER', 'CHIEF OFFICER', 'H');
  return ws;
}

// ── 3. OS 시트 (IN/OUT 공용) ───────────────────────────────────
function sheetOS(wb, D, mode) {
  const isIn = mode === 'in';
  const ws = wb.addWorksheet(isIn ? 'OS-IN' : 'OS-OUT');
  const os = isIn ? D.osIn : D.osOut;
  ws.columns = [{ width: 10 }, { width: 12 }, { width: 4 }, { width: 9 }, { width: 8 }, { width: 9 },
    { width: 8 }, { width: 12 }, { width: 4 }, { width: 12 }, { width: 8 }, { width: 8 }, { width: 14 }];
  head(ws);
  ws.mergeCells('A4:M4'); ws.getCell('A4').value = 'CARGO  OVERAGE & SHORTAGE  REPORT';
  ws.getCell('A4').font = TITLE_FONT; ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.getCell('A6').value = 'M / V :'; ws.getCell('B6').value = D.vslFull;
  ws.getCell('G6').value = 'VOY. NO.:'; ws.getCell('H6').value = isIn ? D.voyD : D.voyL;
  ws.getCell('K6').value = 'DATE :'; ws.getCell('L6').value = d10(D.date);
  ws.getCell('A8').value = 'PORT :'; ws.getCell('B8').value = CITY();
  ws.getCell('G8').value = 'PIER :'; ws.getCell('H8').value = D.pier;
  ws.getCell('K8').value = 'BERTH :'; ws.getCell('L8').value = D.berth;
  for (const a of ['A6','G6','K6','A8','G8','K8']) ws.getCell(a).font = HEAD_FONT;
  const hd = ['B/L NO.', 'MARKS (PORT)', '', 'DESCRIPTION', '', '', 'TYPE OF PKGS', 'MANIFESTED', '',
    isIn ? 'DISCHARGED' : 'LOADED', 'OVER', 'SHORT', 'REMARKS'];
  hd.forEach((v, i) => { const c = ws.getRow(10).getCell(i + 1); c.value = v; c.font = HEAD_FONT; c.border = BOX; c.alignment = { horizontal: 'center' }; });
  let r = 12; let lastPort = '';
  let manTotal = 0, workTotal = 0;
  for (const row of os.rows) {
    ws.getCell(`B${r}`).value = row.port === lastPort ? '-ditto-' : row.port.split('').join(' ');
    ws.getCell(`D${r}`).value = row.size; ws.getCell(`E${r}`).value = row.fe;
    ws.getCell(`F${r}`).value = "CONT'R"; ws.getCell(`G${r}`).value = 'VAN';
    ws.getCell(`H${r}`).value = row.manifested; manTotal += row.manifested;
    ws.getCell(`J${r}`).value = row.manifested - row.short; workTotal += row.manifested - row.short;
    ws.getCell(`K${r}`).value = 'NIL';
    ws.getCell(`L${r}`).value = row.short ? row.short : 'NIL';
    const tags = [];
    if (row.rf) tags.push(`RF x ${row.rf}`);
    if (row.rh) tags.push(`RH x ${row.rh}`);
    if (row.dg) tags.push(`DG x ${row.dg}`);
    ws.getCell(`M${r}`).value = tags.join(' , ');
    for (let c = 1; c <= 13; c++) { const cell = ws.getRow(r).getCell(c); cell.font = BODY_FONT; cell.border = BOX; cell.alignment = CTR; }
    lastPort = row.port; r++;
  }
  ws.getCell(`D${r}`).value = 'T O T A L'; ws.getCell(`G${r}`).value = 'VAN';
  ws.getCell(`H${r}`).value = manTotal; ws.getCell(`J${r}`).value = workTotal;
  ws.getCell(`K${r}`).value = 'NIL'; ws.getCell(`L${r}`).value = manTotal - workTotal ? manTotal - workTotal : 'NIL';
  for (let c = 1; c <= 13; c++) { const cell = ws.getRow(r).getCell(c); cell.font = HEAD_FONT; cell.border = BOX; cell.alignment = CTR; }
  if (os.extra) { r += 1; ws.getCell(`B${r}`).value = `OVERLANDED (초과) x ${os.extra} — 별도 신고`; ws.getCell(`B${r}`).font = HEAD_FONT; }
  r += 3;
  ws.getCell(`A${r}`).value = 'REMARKS'; ws.getCell(`A${r}`).font = HEAD_FONT;
  for (const line of os.remarks) { r += 1; const m = line.indexOf(':'); ws.getCell(`A${r}`).value = line.slice(0, m + 1); ws.getCell(`B${r}`).value = line.slice(m + 1).trim(); ws.getCell(`A${r}`).font = BODY_FONT; ws.getCell(`B${r}`).font = BODY_FONT; }
  sig(ws, r + 5, 'CHIEF CHECKER', 'CHIEF OFFICER', 'K');
  return ws;
}

// ── 4. DM (빈 서식) ───────────────────────────────────────────
function sheetDM(wb, D, mode) {
  const isIn = mode === 'in';
  const ws = wb.addWorksheet(isIn ? 'DM-IN' : 'DM-OUT');
  // V9.19-03: 셀 짤림 보정 — 마지막 열(EXCEPTION) 넓게, 헤더 병합
  ws.columns = [{ width: 8 }, { width: 12 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 },
    { width: 8 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 9 }, { width: 26 }];
  head(ws);
  ws.mergeCells('A4:L4'); ws.getCell('A4').value = 'CARGO  DAMAGE  REPORT';
  ws.getCell('A4').font = TITLE_FONT; ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.getCell('A6').value = 'M / V :'; ws.getCell('B6').value = D.vslFull;
  ws.getCell('G6').value = 'VOY. NO. :'; ws.getCell('H6').value = isIn ? D.voyD : D.voyL;
  ws.getCell('K6').value = 'DATE :'; ws.getCell('L6').value = d10(D.date);
  ws.getCell('A8').value = 'PORT :'; ws.getCell('B8').value = CITY();
  ws.getCell('G8').value = 'PIER :'; ws.getCell('H8').value = D.pier;
  ws.getCell('K8').value = 'BERTH :'; ws.getCell('L8').value = D.berth;
  for (const a of ['A6','G6','K6','A8','G8','K8']) ws.getCell(a).font = HEAD_FONT;
  const hd = ['PORT', 'B/L NO.', 'MARKS', '', '', 'CONTENTS', '', '', '', 'NO. OF PKGS', 'TYPE', 'EXCEPTION ( Found In Stow )'];
  hd.forEach((v, i) => { const c = ws.getRow(10).getCell(i + 1); c.value = v; c.font = HEAD_FONT; c.border = BOX; c.alignment = CTR; });
  ws.mergeCells('C10:E10'); ws.mergeCells('F10:I10');   // MARKS·CONTENTS 병합 — 실물처럼
  for (let r = 11; r <= 28; r++) for (let c = 1; c <= 12; c++) { const cell = ws.getRow(r).getCell(c); cell.border = BOX; cell.alignment = CTR; }
  sig(ws, 32, 'CHIEF CHECKER', 'CHIEF OFFICER', 'K', `STEVEDORE  ${D.pier || ''}`, 'F');
  return ws;
}

// ── 5. Act. Cntr-Seal No List ─────────────────────────────────
function sheetSeal(wb, D) {
  const ws = wb.addWorksheet('Act. Cntr-Seal No List');
  ws.columns = [{ width: 15 }, { width: 4 }, { width: 12 }, { width: 7 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 }];
  head(ws);
  ws.getCell('A4').value = `M / V : ${D.vslFull}`; ws.getCell('F4').value = 'DATE :'; ws.getCell('G4').value = d10(D.date);
  ws.getCell('A6').value = `VOY.NO.: ${[D.voyD, D.voyL].filter(Boolean).join(' & ')}`;
  ws.getCell('F6').value = 'PORT :'; ws.getCell('G6').value = CITY();
  for (const a of ['A4','F4','A6','F6']) ws.getCell(a).font = HEAD_FONT;
  ws.mergeCells('A8:H8'); ws.getCell('A8').value = 'ACTUAL CONTAINER & SEAL NUMBER';
  ws.getCell('A8').font = TITLE_FONT; ws.getCell('A8').alignment = { horizontal: 'center' };
  const hd = ['MANIFEST CONT\'R NO.', '', 'SEAL NO.', 'SIZE', 'ACTUAL CONT\'R NO.', 'SEAL NO.', 'RESEAL NO.', 'REMARKS'];
  hd.forEach((v, i) => { const c = ws.getRow(10).getCell(i + 1); c.value = v; c.font = HEAD_FONT; c.border = BOX; c.alignment = { horizontal: 'center' }; });
  let r = 12;
  const all = [...D.sealIn.map(x => ({ ...x, leg: "DISCH'" })), ...D.sealOut.map(x => ({ ...x, leg: 'LOAD' }))];
  for (const row of all) {
    ws.getCell(`A${r}`).value = row.cn; ws.getCell(`C${r}`).value = row.manifestSeal;
    ws.getCell(`D${r}`).value = row.size; ws.getCell(`F${r}`).value = row.actualSeal;
    ws.getCell(`G${r}`).value = row.reseal; ws.getCell(`H${r}`).value = `${row.remarks} ${row.leg}`.trim();
    for (let c = 1; c <= 8; c++) { const cell = ws.getRow(r).getCell(c); cell.font = BODY_FONT; cell.border = BOX; cell.alignment = CTR; }
    r++;
  }
  if (!all.length) { r += 6; }   // V9.19-03: 빈 틀 유지(공간 확보)
  ws.getCell(`A${r + 2}`).value = `TOTAL : ${all.length}`; ws.getCell(`A${r + 2}`).font = HEAD_FONT;
  sig(ws, r + 4, 'CHIEF CHECKER', 'CHIEF OFFICER', 'G');
  return ws;
}

// ── 6. RF condition report ────────────────────────────────────
function sheetRF(wb, D) {
  const ws = wb.addWorksheet('RF Condition Report');
  ws.columns = [{ width: 15 }, { width: 12 }, { width: 8 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 13 }, { width: 10 }];
  head(ws);
  ws.mergeCells('A4:H4'); ws.getCell('A4').value = 'REEFER CONTAINER CONDITION REPORT';
  ws.getCell('A4').font = TITLE_FONT; ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.getCell('A5').value = 'Discharging  /  Loading'; ws.getCell('A5').font = BODY_FONT;
  ws.getCell('A7').value = `M / V : ${D.vslFull}`; ws.getCell('D7').value = `VOY # : ${[D.voyD, D.voyL].filter(Boolean).join(' & ')}`;
  ws.getCell('G7').value = `DATE : ${d10(D.date)}`;
  ws.getCell('A8').value = `PIER : ${D.pier}`; ws.getCell('D8').value = `BERTH : ${D.berth}`; ws.getCell('G8').value = `PORT : ${CITY()}`;
  for (const a of ['A7','D7','G7','A8','D8','G8']) ws.getCell(a).font = HEAD_FONT;
  const hd = ['CONTAINER NO.', 'SEAL NO.', 'SIZE', 'LOCATION (Bay/Row/Tier)', 'Setting', 'Actual', 'TIME (Plug In/Out)', 'REMARKS'];
  hd.forEach((v, i) => { const c = ws.getRow(10).getCell(i + 1); c.value = v; c.font = HEAD_FONT; c.border = BOX; c.alignment = { horizontal: 'center' }; });
  let r = 12;
  // TallyOne 1.8-17: 종전엔 `[...D.rfIn, ...D.rfOut]` 을 한 덩어리로 쏟아부어
  //   **양하 공리퍼와 선적 리퍼까지 섞여** 나왔다. 검수사 지적 2026-08-05:
  //   "양하 리퍼 점검 대상은 24대인데 다른건 어디서 온것인가요?"
  //   점검 대상은 **양하 풀 리퍼**다(공리퍼는 전원을 안 꽂아 잴 것이 없다).
  //   선사 양식 경로(`D.rfIn.filter(x => x.fe !== 'E')`)·리퍼 메모 화면·출항 임박 경고와 같은 기준 —
  //   네 곳을 일치시킨다(지침서 5-5).
  //   선적 리퍼는 버리지 않고 **구분줄을 넣어 따로** 싣는다(시트 제목이 Discharging / Loading 이다).
  const block = (rowsIn) => {
    for (const row of rowsIn) {
      ws.getCell(`A${r}`).value = row.cn; ws.getCell(`B${r}`).value = row.seal;
      ws.getCell(`C${r}`).value = row.size; ws.getCell(`D${r}`).value = row.loc;
      // TallyOne 1.8: F열(Actual)이 헤더에만 있고 값이 안 들어가고 있었다 — 리퍼 메모 확인값을 채운다.
      ws.getCell(`E${r}`).value = row.setting; ws.getCell(`F${r}`).value = row.actual || '';
      ws.getCell(`H${r}`).value = row.op;
      for (let c = 1; c <= 8; c++) { const cell = ws.getRow(r).getCell(c); cell.font = BODY_FONT; cell.border = BOX; cell.alignment = CTR; }
      r++;
    }
  };
  const label = (txt) => {
    ws.mergeCells(`A${r}:H${r}`);
    const c = ws.getCell(`A${r}`); c.value = txt; c.font = HEAD_FONT; c.border = BOX;
    c.alignment = { horizontal: 'left' };
    r++;
  };
  const dis = D.rfIn.filter((x) => x.fe !== 'E');
  const load = D.rfOut.filter((x) => x.fe !== 'E');
  if (dis.length) { label(`DISCHARGING  (${dis.length})`); block(dis); }
  if (load.length) { if (dis.length) r++; label(`LOADING  (${load.length})`); block(load); }
  if (r === 12) { r += 6; }   // V9.19-03: 빈 틀 유지
  sig(ws, r + 4, 'CHIEF CHECKER', 'CHIEF OFFICER', 'G');
  return ws;
}

// ── 7. Performance ────────────────────────────────────────────
function sheetPerformance(wb, D) {
  const ws = wb.addWorksheet('Performance');
  ws.columns = [{ width: 12 }, { width: 10 }, ...Array(8).fill({ width: 7 })];
  head(ws);
  ws.mergeCells('A4:J4'); ws.getCell('A4').value = 'PERFORMANCE  REPORT';
  ws.getCell('A4').font = TITLE_FONT; ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.getCell('A6').value = `M / V : ${D.vslFull}`; ws.getCell('G6').value = `VOY # : ${[D.voyD, D.voyL].filter(Boolean).join(' & ')}`;
  ws.getCell('A8').value = `PIER : ${D.pier}`; ws.getCell('G8').value = `BERTH : ${D.berth}`;
  for (const a of ['A6','G6','A8','G8']) ws.getCell(a).font = HEAD_FONT;
  const r0 = 10;
  ws.getCell(`A${r0}`).value = 'Status'; ws.getCell(`B${r0}`).value = 'Operator';
  ws.mergeCells(`C${r0}:F${r0}`); ws.getCell(`C${r0}`).value = 'FULL';
  ws.mergeCells(`G${r0}:J${r0}`); ws.getCell(`G${r0}`).value = 'EMPTY';
  const szs = ["20'", "40'", 'HC', "45'"];
  szs.forEach((s, i) => { ws.getRow(r0 + 1).getCell(3 + i).value = s; ws.getRow(r0 + 1).getCell(7 + i).value = s; });
  for (const rr of [r0, r0 + 1]) for (let c = 1; c <= 10; c++) { const cell = ws.getRow(rr).getCell(c); cell.font = HEAD_FONT; cell.border = BOX; cell.alignment = { horizontal: 'center' }; }
  let r = r0 + 2;
  const S = { 20: 0, 40: 1, HC: 2, 45: 3 };
  for (const [label, agg] of [['IN BOUND', D.perf.inbound], ['OUT BOUND', D.perf.outbound]]) {
    let first = true;
    const st = { F: { 20: 0, 40: 0, HC: 0, 45: 0 }, E: { 20: 0, 40: 0, HC: 0, 45: 0 } };
    for (const op of D.perf.ops) {
      const o = agg[op]; if (!o) continue;
      ws.getCell(`A${r}`).value = first ? label : ''; first = false;
      ws.getCell(`B${r}`).value = op;
      for (const fe of ['F', 'E']) for (const [sz, i] of Object.entries(S)) {
        const v = (o[fe] || {})[sz] || 0;
        if (v) ws.getRow(r).getCell((fe === 'F' ? 3 : 7) + i).value = v;
        st[fe][sz] += v;
      }
      for (let c = 1; c <= 10; c++) { const cell = ws.getRow(r).getCell(c); cell.font = BODY_FONT; cell.border = BOX; cell.alignment = { horizontal: 'center' }; }
      r++;
    }
    ws.getCell(`B${r}`).value = 'S-TOTAL';
    for (const fe of ['F', 'E']) for (const [sz, i] of Object.entries(S))
      ws.getRow(r).getCell((fe === 'F' ? 3 : 7) + i).value = st[fe][sz];
    for (let c = 1; c <= 10; c++) { const cell = ws.getRow(r).getCell(c); cell.font = HEAD_FONT; cell.border = BOX; cell.alignment = { horizontal: 'center' }; }
    r += 2;
  }
  sig(ws, r + 3, 'CHIEF CHECKER', 'CHIEF OFFICER', 'H');
  return ws;
}

// ── 8. SHIFTING ───────────────────────────────────────────────
function sheetShifting(wb, D) {
  const ws = wb.addWorksheet('SHIFTING');
  ws.columns = [{ width: 4 }, { width: 14 }, { width: 9 }, { width: 5 }, { width: 8 }, { width: 6 }, { width: 9 }, { width: 9 }, { width: 6 }, { width: 6 }, { width: 9 }];
  head(ws);
  ws.getCell('A3').value = 'SHIFTING REPORT'; ws.getCell('A3').font = TITLE_FONT;
  ws.getCell('A5').value = `M.V. : ${D.vslFull}`; ws.getCell('H5').value = `VOY # : ${[D.voyD, D.voyL].filter(Boolean).join(' & ')}`;
  ws.getCell('A6').value = `DATE : ${d10(D.date)}`; ws.getCell('H6').value = `PORT : ${CITY()}`;
  for (const a of ['A5','H5','A6','H6']) ws.getCell(a).font = HEAD_FONT;
  const hd = ['NO', "CON'T NO", 'TYPE', 'F/E', 'W/T', 'OPR', 'OLD POSN', 'NEW POSN', 'POD', 'POL', 'ACCOUNT'];
  hd.forEach((v, i) => { const c = ws.getRow(8).getCell(i + 1); c.value = v; c.font = HEAD_FONT; c.border = BOX; c.alignment = { horizontal: 'center' }; });
  let r = 10;
  for (const s of D.shifting) {
    [s.no, s.cn, s.type, s.fe, s.wt, s.op, s.oldPos, s.newPos, s.pod, s.pol, s.op].forEach((v, i) =>
      ws.getRow(r).getCell(i + 1).value = v);
    for (let c = 1; c <= 11; c++) { const cell = ws.getRow(r).getCell(c); cell.font = BODY_FONT; cell.border = BOX; cell.alignment = CTR; }
    r++;
  }
  if (!D.shifting.length) { ws.getCell('A10').value = 'NIL'; ws.getCell('A10').font = BODY_FONT; }
  return ws;
}

// ═══ V9.19-01: 실물 템플릿 필 모드 ══════════════════════════════════════
//   사용자 피드백: "셀 크기·간격·글씨 크기가 실물과 다르고 짤린다. 중앙정렬 원함."
//   → 실물 마감 텔리 파일을 그대로 서식 틀로 쓰고(public/tally_templates/{code}.xlsx,
//     빌더가 가변 값만 비움) 숫자만 채운다. 서식·정렬·열너비·글꼴 = 실물 100%.
//   합계·헤더(DISCH (n))는 원본이 수식이지만, 모바일 뷰어가 재계산을 안 하는 경우를
//   위해 검증된 계산값으로 덮어쓴다. 템플릿 없는 배(TMPZ·DXQD·OBWH 등)는 드로잉 폴백.
import TEMPLATE_MAP from './data/tallyTemplateMap.js';

const zv = (v) => (v ? v : null);   // 실물 규칙: 빈 값은 공란

async function fillTemplate(D, ExcelJS) {
  // V9.19-03: 미보유 선박은 STANDARD(표준 GM 서식) 템플릿으로 — 드로잉 폴백은 최후 수단.
  //   OBWH(바우처형)만 예외 — 표준 서식이 오히려 틀리므로 드로잉 유지.
  //   TallyOne 1.4: OBWH 전용 템플릿·좌표를 넣었으므로 이 예외는 이제 타지 않는다(안전망으로 유지).
  let tplCode = D.code;
  let M = TEMPLATE_MAP[D.code];
  if (!M && D.code !== 'OBWH') { M = TEMPLATE_MAP.STANDARD; tplCode = 'STANDARD'; D._stdNote = '이 배 전용 템플릿 없음 — 표준 GM 서식으로 생성'; }
  if (!M || !M.sheets || !M.sheets.finalWork) return null;
  const base = (typeof document !== 'undefined' ? './' : 'public/');
  let ab;
  if (typeof document !== 'undefined') {
    const res = await fetch(`${base}tally_templates/${tplCode}.xlsx`, { cache: 'no-store' });
    if (!res.ok) return null;
    ab = await res.arrayBuffer();
  } else {
    const fs = await import('fs');
    ab = fs.readFileSync(`public/tally_templates/${tplCode}.xlsx`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(ab);
  // TallyUni 0.1: 템플릿에 박힌 회사명·주소를 테넌트 값으로 치환 —
  //   NaN 스크럽과 같은 전 시트 전 셀 스캔. 기본 테넌트면 같은 값이라 결과 불변.
  {
    const _T = tenant();
    const _SUB = { 'GREEN MARINE CO., LTD.': _T.companyEn, 'PYEONGTAEK, KOREA': _T.addressEn };
    //   실물 템플릿엔 자간용 이중 공백 변형('GREEN  MARINE  CO.,  LTD.  ')이 섞여 있다(Final Work·SHIFTING 실측).
    //   공백 런을 하나로 접어 비교해야 전 시트가 잡힌다.
    const _key = (x) => String(x).replace(/\s+/g, ' ').trim();
    wb.worksheets.forEach((ws0) => ws0.eachRow({ includeEmpty: true }, (row0) => row0.eachCell({ includeEmpty: true }, (c0) => {
      const v0 = c0.value;
      if (typeof v0 === 'string') {
        const k0 = _key(v0);
        const r0 = _SUB[k0];
        //   테넌트 값이 정규화 결과와 같으면(=기본 테넌트) 원본 문자열을 건드리지 않는다 —
        //   실물 양식의 자간 공백까지 그대로 보존(결과 완전 불변).
        if (r0 !== undefined && r0 !== k0) c0.value = r0;
      } else if (v0 && typeof v0 === 'object' && Array.isArray(v0.richText)) {
        const flat = v0.richText.map((t0) => t0.text || '').join('');
        const k0 = _key(flat);
        const r0 = _SUB[k0];
        if (r0 !== undefined && r0 !== k0) {
          c0.value = { richText: [{ ...(v0.richText[0] || {}), text: r0 }] };
        }
      }
    })));
  }
  // exceljs 라운드트립 버그 방어 — 원본의 정의명(인쇄영역 등)이 깨진 채 남으면
  //   재저장본을 일부 뷰어가 못 연다. 정의명은 서식이 아니므로 비운다.
  try { wb.definedNames.model = []; } catch { /* skip */ }
  for (const ws0 of wb.worksheets) { try { if (ws0.pageSetup) delete ws0.pageSetup.printArea; } catch { /* skip */ } }
  const get = (key) => M.sheets[key] ? wb.getWorksheet(M.sheets[key].name) : null;
  const voy = [D.voyD, D.voyL].filter(Boolean).join(' & ');
  const dstr = d10(D.date);

  // ── V9.19-06: 전 시트 헤더 자동 기입 ─────────────────────────────────────
  //   템플릿에 남은 원본 배 잔재(선명·항차·날짜 캐시)가 그대로 노출되던 문제(SHIFTING에서 실측).
  //   1~9행에서 라벨(M/V·VOY·DATE·PIER·BERTH·PORT)을 찾아 값 셀에 이번 항차 값을 쓴다.
  //   합성 라벨("M / V : 배이름")은 콜론 뒤만 교체. 값 셀 위치는 라벨 병합 범위 오른쪽 칸.
  fillAllHeaders(wb, D, dstr);

  // ── Final Work (변형 cn: 선사 반복·하위선사 괄호·소계/총계 수식) ──
  if (M.variant === 'ferry') {
    fillFerrySheets(wb, M, D, dstr);
  } else if (M.variant === 'cn') {
    fillVariantFinalWork(wb, M, D, dstr);
  } else {
  // ── Final Work (표준) ──
  {
    const cfg = M.sheets.finalWork;
    const ws = get('finalWork');
    ws.getCell('B4').value = ` ${D.vslFull}`;
    ws.getCell('G4').value = voy;
    ws.getCell('L4').value = dstr;
    ws.getCell('B6').value = ` ${D.pier}`;
    ws.getCell('G6').value = D.berth;
    const cap = cfg.totalRow - cfg.dataStart;
    if (D.rows.length > cap) ws.duplicateRow(cfg.totalRow - 1, D.rows.length - cap, true);
    const totalRow = cfg.totalRow + Math.max(0, D.rows.length - cap);
    // 라벨 쓰기 + 블록 추적 (템플릿은 A/B 병합을 풀어둔 상태 — 실제 블록 크기로 재병합해 실물 모양 재현)
    const opBlocks = [];   // {op, r1, r2}
    const portBlocks = [];
    for (let i = 0; i < Math.max(D.rows.length, cap); i++) {
      const r = cfg.dataStart + i;
      const row = D.rows[i];
      const cells = ws.getRow(r);
      if (row) {
        if (!opBlocks.length || opBlocks[opBlocks.length - 1].op !== row.op) {
          cells.getCell(1).value = row.op;
          opBlocks.push({ op: row.op, r1: r, r2: r });
        } else opBlocks[opBlocks.length - 1].r2 = r;
        const pb = portBlocks[portBlocks.length - 1];
        if (!pb || pb.op !== row.op || pb.port !== row.port) {
          cells.getCell(2).value = row.port;
          portBlocks.push({ op: row.op, port: row.port, r1: r, r2: r });
        } else portBlocks[portBlocks.length - 1].r2 = r;
        cells.getCell(3).value = row.fe;
        ['20','40','HC','45'].forEach((sz, k) => {
          cells.getCell(4 + k).value = zv(row.dis[sz]);
          cells.getCell(8 + k).value = zv(row.load[sz]);
          cells.getCell(12 + k).value = zv(row.shift[sz]);
        });
      } else {
        for (const c of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) cells.getCell(c).value = null;
      }
    }
    // V9.19-04: exceljs mergeCells는 범위 전체에 마스터 스타일을 덮어써 실물과 선이 달라진다
    //   (실측: 아래칸 top 선이 생기고 bottom 선이 사라짐). 병합 전 스타일 보존 → 병합 → 복원.
    const mergeKeepStyle = (r1, c, r2) => {
      const saved = [];
      for (let r = r1; r <= r2; r++) saved.push(JSON.parse(JSON.stringify(ws.getRow(r).getCell(c).style || {})));
      try { ws.mergeCells(r1, c, r2, c); } catch { return; }
      for (let r = r1; r <= r2; r++) ws.getRow(r).getCell(c).style = saved[r - r1];
    };
    for (const b of opBlocks) if (b.r2 > b.r1) mergeKeepStyle(b.r1, 1, b.r2);
    for (const b of portBlocks) if (b.r2 > b.r1) mergeKeepStyle(b.r1, 2, b.r2);
    // V9.19-06: 선사간 구분선 — 템플릿의 선 패턴은 원본 배의 블록 크기(예: DJCT 6행) 기준이라
    //   이 배의 실제 블록과 어긋난다(사용자 실측: "선사간 구분선이 없다").
    //   실물 규칙(DJCT 실측): F행 아래=hair, 짝(F/E) 끝=thin, 선사 블록 끝=medium.
    {
      const blockEnd = new Set(opBlocks.map((b2) => b2.r2));
      const pairEnd = new Set(portBlocks.map((b2) => b2.r2));
      const lastUsed = opBlocks.length ? opBlocks[opBlocks.length - 1].r2 : cfg.dataStart - 1;
      for (let r = cfg.dataStart; r < totalRow; r++) {
        let st;
        if (blockEnd.has(r)) st = 'medium';
        else if (pairEnd.has(r)) st = 'thin';
        else if (r <= lastUsed) st = 'hair';
        else st = ((r - lastUsed) % 2 === 1) ? "hair" : "thin";
        for (let c = 1; c <= 15; c++) {
          // exceljs는 파싱 시 같은 서식 셀끼리 style 객체를 공유한다 — 그대로 대입하면
          //   뒤 행의 지정이 앞 행까지 덮는다(실측: r21 thin이 r11 medium을 지움). 셀별 딥클론.
          const cell = ws.getRow(r).getCell(c);
          const st0 = JSON.parse(JSON.stringify(cell.style || {}));
          st0.border = { ...(st0.border || {}), bottom: { style: st } };
          cell.style = st0;
          if (r + 1 < totalRow) {
            const below = ws.getRow(r + 1).getCell(c);
            const st1 = JSON.parse(JSON.stringify(below.style || {}));
            if (st1.border) delete st1.border.top;   // 옛 패턴의 top 선 겹침 방지
            below.style = st1;
          }
        }
      }
    }
    // 합계·헤더 — 검증된 계산값으로 (수식 덮어씀: 모바일 뷰어 재계산 문제 방지)
    for (const [off, fe] of [[0,'F'],[1,'E']]) {
      const cells = ws.getRow(totalRow + off);
      ['20','40','HC','45'].forEach((sz, k) => {
        cells.getCell(4 + k).value = D.totals.dis[fe][sz] || 0;
        cells.getCell(8 + k).value = D.totals.load[fe][sz] || 0;
        cells.getCell(12 + k).value = D.totals.shift[fe][sz] || 0;
      });
    }
    ws.getCell(`D8`).value = `DISCH (${D.totals.dis.n})`;
    ws.getCell(`H8`).value = `LOAD (${D.totals.load.n})`;
    ws.getCell(`L8`).value = `SHIFT (${D.totals.shift.n})`;
  }
  }
  // ── Time Sheet ──
  if (get('timeSheet')) {
    const cfg = M.sheets.timeSheet;
    const ws = get('timeSheet');
    for (let r = cfg.dataStart, i = 0; r <= cfg.dataEnd; r++, i++) {
      const row = D.timeSheet[i];
      ws.getRow(r).getCell(2).value = row ? row.time : null;
      ws.getRow(r).getCell(3).value = row ? row.remark : null;
    }
  }
  // ── OS-IN / OS-OUT ──
  for (const key of ['osIn', 'osOut']) {
    const cfg = M.sheets[key];
    if (!cfg) continue;
    const ws = get(key);
    const os = key === 'osIn' ? D.osIn : D.osOut;
    ws.getCell('H6').value = key === 'osIn' ? D.voyD : D.voyL;
    ws.getCell('L6').value = dstr;
    ws.getCell('H8').value = D.pier;
    ws.getCell('L8').value = D.berth;
    const cap = cfg.totalRow - cfg.dataStart;
    const ins = Math.max(0, os.rows.length - cap);
    // V9.19-11: duplicateRow는 아래쪽 REMARKS 병합 행을 파괴(실측) — insertRows(스타일 위 행 상속)로 교체
    if (ins) ws.insertRows(cfg.totalRow, Array.from({ length: ins }, () => []), 'i');
    const totalRow = cfg.totalRow + ins;
    // V9.19-11: 원본 배가 숨겨둔 데이터 행(예: DJCT OS-OUT 12행)에 쓰면 안 보인다 — 쓰는 구간은 숨김 해제
    for (let r = cfg.dataStart; r <= totalRow; r++) ws.getRow(r).hidden = false;
    // V9.19-08: 실물은 데이터 행마다 B:C(MARKS/PORT)·H:I(MANIFESTED) 병합 — 템플릿 생성 때 풀림(사용자 실측)
    for (let r = cfg.dataStart; r < totalRow; r++) {
      for (const [c1, c2] of [[2, 3], [8, 9]]) {
        const saved = [];
        for (let c = c1; c <= c2; c++) saved.push(JSON.parse(JSON.stringify(ws.getRow(r).getCell(c).style || {})));
        try { ws.mergeCells(r, c1, r, c2); }
        catch {
          // insertRows 후 유령 병합 레지스트리로 실패(실측) — 풀고 재병합
          try { ws.unMergeCells(r, c1, r, c2); ws.mergeCells(r, c1, r, c2); } catch { /* 포기 */ }
        }
        for (let c = c1; c <= c2; c++) ws.getRow(r).getCell(c).style = saved[c - c1];
      }
    }
    let last = ''; let man = 0, wk = 0;
    for (let i = 0; i < Math.max(os.rows.length, cap); i++) {
      const r = ws.getRow(cfg.dataStart + i);
      const o = os.rows[i];
      if (o) {
        r.getCell(2).value = o.port === last ? '-ditto-' : o.port.split('').join(' ');
        r.getCell(4).value = o.size; r.getCell(5).value = o.fe;
        r.getCell(6).value = "CONT'R"; r.getCell(7).value = 'VAN';
        r.getCell(8).value = o.manifested; r.getCell(10).value = o.manifested - o.short;
        r.getCell(11).value = 'NIL'; r.getCell(12).value = o.short ? o.short : 'NIL';
        const tags = [];
        if (o.rf) tags.push(`RF x ${o.rf}`);
        if (o.rh) tags.push(`RH x ${o.rh}`);
        if (o.dg) tags.push(`DG x ${o.dg}`);
        r.getCell(13).value = tags.join(' , ') || null;
        man += o.manifested; wk += o.manifested - o.short;
        last = o.port;
      } else {
        for (const c of [1,2,3,4,5,6,7,8,9,10,11,12,13]) r.getCell(c).value = null;
      }
    }
    const tr = ws.getRow(totalRow);
    tr.getCell(8).value = man; tr.getCell(10).value = wk;
    tr.getCell(11).value = 'NIL'; tr.getCell(12).value = (man - wk) ? (man - wk) : 'NIL';
    if (cfg.remarksRow > 0) {
      for (let r = cfg.remarksRow + ins + 1, i = 0; r <= cfg.remarksEnd + ins; r++, i++) {
        const line = os.remarks[i] || '';
        const m = line.indexOf(':');
        ws.getRow(r).getCell(1).value = line ? line.slice(0, m + 1) : null;
        ws.getRow(r).getCell(2).value = line ? line.slice(m + 1).trim() : null;
      }
    }
  }
  // ── Act Seal ──
  if (M.sheets.seal) {
    const cfg = M.sheets.seal;
    const ws = get('seal');
    ws.getCell('G4').value = dstr;
    const all = [...D.sealIn.map(x => ({ ...x, leg: "DISCH'" })), ...D.sealOut.map(x => ({ ...x, leg: 'LOAD' }))];
    const cap = cfg.dataEnd - cfg.dataStart + 1;
    if (all.length > cap) ws.duplicateRow(cfg.dataEnd, all.length - cap, true);
    for (let i = 0; i < Math.max(all.length, cap); i++) {
      const r = ws.getRow(cfg.dataStart + i);
      const o = all[i];
      r.getCell(1).value = o ? o.cn : null;
      r.getCell(3).value = o ? o.manifestSeal : null;
      r.getCell(4).value = o ? o.size : null;
      r.getCell(6).value = o ? o.actualSeal : null;
      r.getCell(7).value = o ? o.reseal : null;
      r.getCell(8).value = o ? `${o.remarks} ${o.leg}`.trim() : null;
      // TallyOne 1.9: 컨번호 칸 A:B 병합 — 머리글 A11:B11 은 병합인데 데이터 행은 아니어서
      //   컨번호가 좁은 A열에 갇혀 잘려 보였다(검수사 지적 2026-08-05, STMJ 2643E 실번호 시트).
      //   RF 시트 D:E 와 같은 방식 — 스타일 보존 병합.
      const rn = cfg.dataStart + i;
      const sv = [JSON.parse(JSON.stringify(r.getCell(1).style || {})), JSON.parse(JSON.stringify(r.getCell(2).style || {}))];
      try { ws.mergeCells(rn, 1, rn, 2); } catch { /* 이미 병합 */ }
      r.getCell(1).style = sv[0]; r.getCell(2).style = sv[1];
      const s1 = JSON.parse(JSON.stringify(r.getCell(1).style || {}));
      s1.alignment = { ...(s1.alignment || {}), horizontal: 'center', vertical: 'middle' };
      r.getCell(1).style = s1;
    }
  }
  // ── RF ──
  if (M.sheets.rf) {
    const cfg = M.sheets.rf;
    const ws = get('rf');
    // TallyOne 1.8-14: 리퍼 시트가 어수선하던 이유 셋 (검수사 지적 2026-08-05, STMJ 2643E)
    //   ① **양하·선적 리퍼를 구분 없이 한 표에 섞었다** — 실물 관례는 양하 F 리퍼 기재다
    //      (페리 경로 rfFerry 는 이미 `fe !== 'E'` 로 거르는데 여기만 안 걸렀다).
    //   ② **공 리퍼가 섞였다** — 전원을 안 꽂아 온도가 없으니 빈 줄만 늘어난다.
    //   ③ **Actual(7열)이 비어 있고, 9열에 선사코드(op)를 넣고 있었다** — 그 자리는 REMARKS 다.
    //   양하 F 리퍼만, 확인한 실제온도까지 채운다. 선적 리퍼는 실물에 안 싣는다.
    const all = D.rfIn.filter((x) => x.fe !== 'E');
    const cap = cfg.dataEnd - cfg.dataStart + 1;
    if (all.length > cap) ws.duplicateRow(cfg.dataEnd, all.length - cap, true);
    for (let i = 0; i < Math.max(all.length, cap); i++) {
      const rn = cfg.dataStart + i;
      const r = ws.getRow(rn);
      const o = all[i];
      r.getCell(1).value = o ? o.cn : null;
      r.getCell(2).value = o ? (o.seal || null) : null;
      r.getCell(3).value = o ? o.size : null;
      r.getCell(4).value = o ? (o.loc || null) : null;
      // 실물 열 구성(TNJP 템플릿 실측과 동일): D:E LOCATION · F Setting · G Actual · H TIME · I REMARKS
      r.getCell(6).value = o ? (o.setting || null) : null;
      r.getCell(7).value = o ? (o.actual || null) : null;   // 1.8-14: 실제온도 — 확인한 것만
      r.getCell(9).value = o && o.dg ? 'DG' : null;         // 1.8-14: REMARKS 자리에 선사코드를 넣던 것 교정
      // V9.19-08: LOCATION(D:E)은 병합 — 사용자 확정(실물 2·3페이지와 동일). 스타일 보존 병합.
      const saved = [JSON.parse(JSON.stringify(r.getCell(4).style || {})), JSON.parse(JSON.stringify(r.getCell(5).style || {}))];
      try { ws.mergeCells(rn, 4, rn, 5); } catch { /* 이미 병합 */ }
      r.getCell(4).style = saved[0]; r.getCell(5).style = saved[1];
      const st4 = JSON.parse(JSON.stringify(r.getCell(4).style || {}));
      st4.alignment = { ...(st4.alignment || {}), horizontal: 'center', vertical: 'middle' };
      r.getCell(4).style = st4;
    }
  }
  // ── CARGO DAMAGE REPORT (DM-IN / DM-OUT) + 개별 손상보고서 ──────────────
  //   TallyOne 1.10: 템플릿맵에 DM·DAMAGE 키가 없어 **본문을 아무도 안 쓰고 있었다**.
  //     머리글만 V9.19-06 라벨 스캔이 갱신해서, 이전 항차 손상이 이번 항차 서류로 둔갑했다.
  //     좌표는 선박별로 넣지 않는다 — 19개 템플릿 DM 시트가 전부 같은 구조(머리글 10행,
  //     A PORT · B B/L NO. · C:E MARKS · F:I CONTENTS · J NO.OF PKGS · K TYPE · L EXCEPTION)임을
  //     전수 확인했다. 머리글을 찾아 쓰므로 양식이 바뀌어도 좌표를 고칠 일이 없다.
  {
    const D2 = D.damage || { dmIn: [], dmOut: [] };
    const norm = (x) => String(x || '').trim().toUpperCase();
    const findWs = (want) => wb.worksheets.find((w) => norm(w.name) === want);
    const txt = (v) => (typeof v === 'string') ? v
      : (v && typeof v === 'object' && v.richText) ? v.richText.map((t) => t.text).join('')
      : (v == null ? '' : String(v));

    for (const [name, rows] of [['DM-IN', D2.dmIn], ['DM-OUT', D2.dmOut]]) {
      const ws = findWs(name);
      if (!ws) continue;
      // 머리글 행 찾기 — PORT + MARKS 가 같은 행에 있는 곳
      let hr = 0;
      for (let r = 6; r <= 16 && !hr; r++) {
        let hasPort = false, hasMarks = false;
        for (let c = 1; c <= 20; c++) {
          const t = norm(txt(ws.getRow(r).getCell(c).value));
          if (t === 'PORT') hasPort = true;
          if (t.includes('MARKS')) hasMarks = true;
        }
        if (hasPort && hasMarks) hr = r;
      }
      if (!hr) continue;
      // 표 마지막 행 = 머리글 아래로 테두리가 이어지는 마지막 행
      let last = hr + 1;
      for (let r = hr + 2; r <= hr + 40; r++) {
        const b = ws.getRow(r).getCell(1).border || {};
        if (b.left || b.right || b.top || b.bottom) last = r; else break;
      }
      const start = hr + 2;                      // 머리글이 2행 병합(10:11)이라 +2
      for (let i = 0; start + i <= last; i++) {
        const r = ws.getRow(start + i), o = rows[i];
        r.getCell(1).value = o ? o.port : null;
        r.getCell(2).value = o ? o.op : null;
        r.getCell(3).value = o ? o.cn : null;
        r.getCell(6).value = o ? o.contents : null;
        r.getCell(10).value = o ? o.pkgs : null;
        r.getCell(11).value = o ? o.kind : null;
        r.getCell(12).value = o ? o.exception : null;
      }
      if (rows.length > last - start + 1) D._overflow = (D._overflow || 0) + (rows.length - (last - start + 1));
    }

    // 개별 손상보고서 — 'CONTAINER NO' 라벨이 있는 행이 블록 시작. 컨 1대 = 블록 1장.
    //   값 칸은 좌표를 박지 않는다. 8개 템플릿(STMJ·STSE·DJCF·YKTD·DXQD·TMPZ·OBWH·TNJP)의
    //   실제 배치를 전수 확인한 결과 아래 두 규칙으로 전부 맞는다.
    //     ① 값 칸 = 라벨 병합이 끝난 다음부터 오른쪽으로 훑어 **첫 병합 마스터**. 없으면 바로 다음 칸.
    //        (A8:B8 라벨→C8 · A8 라벨+C8:E8 병합→C8 · A8 라벨+병합없음→B8 — 셋 다 실물과 일치)
    //     ② FULL/EMPTY 칸 = 'SEAL NO' 라벨 병합이 끝난 바로 다음 칸.
    //   ⚠ 씰번호는 **쓰지 않는다.** 실물(2639E)에서 SEAL NO. 뒤는 곧바로 FULL/EMPTY 칸이고
    //     씰 값 칸 자체가 없다. 여기 쓰면 FULL/EMPTY 를 덮는다.
    const dmgWs = wb.worksheets.find((w) => norm(w.name).includes('DAMAGE-EACH') || norm(w.name).includes('DAMAGE REPORT'));
    if (dmgWs) {
      const all = [...D2.dmIn, ...D2.dmOut];
      const isMaster = (cell) => cell.isMerged && cell.master && cell.master.address === cell.address;
      const mergedEnd = (r, c) => {
        const base = dmgWs.getRow(r).getCell(c);
        let e = c;
        while (e < 30) {
          const nx = dmgWs.getRow(r).getCell(e + 1);
          if (nx.isMerged && nx.master && base.master && nx.master.address === base.master.address) e++; else break;
        }
        return e;
      };
      const valueCol = (r, labelCol) => {
        const st = mergedEnd(r, labelCol) + 1;
        for (let c = st; c <= st + 6; c++) {
          const cell = dmgWs.getRow(r).getCell(c);
          if (txt(cell.value).includes(':')) break;        // 다음 라벨에 닿음
          if (isMaster(cell)) return c;
        }
        return st;
      };
      const labelCol = (r, want) => {
        for (let c = 1; c <= 12; c++) {
          if (norm(txt(dmgWs.getRow(r).getCell(c).value)).replace(/\s/g, '').startsWith(want)) return c;
        }
        return 0;
      };
      const heads = [];
      for (let r = 1; r <= dmgWs.rowCount; r++) {
        if (labelCol(r, 'CONTAINERNO')) heads.push(r);
      }
      heads.forEach((h, i) => {
        const o = all[i];
        const lc = labelCol(h, 'CONTAINERNO');
        dmgWs.getRow(h).getCell(valueCol(h, lc)).value = o ? o.cn : null;
        // FULL / EMPTY
        const sc = labelCol(h, 'SEALNO');
        if (sc) dmgWs.getRow(h).getCell(mergedEnd(h, sc) + 1).value = o ? o.fe : null;
        // OPERATOR (바로 아랫줄에 있는 템플릿이 대부분)
        for (let r2 = h + 1; r2 <= h + 2; r2++) {
          const oc = labelCol(r2, 'OPERATOR');
          if (oc) { dmgWs.getRow(r2).getCell(valueCol(r2, oc)).value = o ? (o.op || null) : null; break; }
        }
        // Description of Damage — 라벨 다음 줄은 '( Found In Stow )' 안내라 +2
        for (let r2 = h; r2 < h + 55; r2++) {
          let hit = 0;
          for (let c = 1; c <= 3; c++) {
            if (norm(txt(dmgWs.getRow(r2).getCell(c).value)).startsWith('DESCRIPTION OF DAMAGE')) { hit = 1; break; }
          }
          if (hit) { dmgWs.getRow(r2 + 2).getCell(2).value = o ? o.exception : null; break; }
        }
      });
      if (all.length > heads.length) D._overflow = (D._overflow || 0) + (all.length - heads.length);
    }
  }

  // ── Performance (표준 열: op=D(4), FULL 20/40/HC/45 = H/J/L/N(8,10,12,14), EMPTY = P/R/T/V(16,18,20,22)) ──
  if (M.sheets.perf) {
    const cfg = M.sheets.perf;
    const ws = get('perf');
    const S = { 20: 0, 40: 1, HC: 2, 45: 3 };
    const fill = (agg, r0, r1, stRow) => {
      const st = { F: {20:0,40:0,HC:0,45:0}, E: {20:0,40:0,HC:0,45:0} };
      let i = 0;
      for (const op of D.perf.ops) {
        const o = agg[op]; if (!o) continue;
        const r = ws.getRow(r0 + i);
        if (r0 + i < r1) {
          r.getCell(4).value = op;
          for (const fe of ['F','E']) for (const [sz, k] of Object.entries(S)) {
            const v = (o[fe] || {})[sz] || 0;
            r.getCell((fe === 'F' ? 8 : 16) + k * 2).value = v || null;
          }
        }
        for (const fe of ['F','E']) for (const sz of ['20','40','HC','45']) st[fe][sz] += (o[fe]||{})[sz] || 0;
        i++;
      }
      for (; r0 + i < r1; i++) { const r = ws.getRow(r0 + i); r.getCell(4).value = null; for (let c = 8; c <= 22; c++) r.getCell(c).value = null; }
      const tr = ws.getRow(stRow);
      for (const fe of ['F','E']) for (const [sz, k] of Object.entries(S))
        tr.getCell((fe === 'F' ? 8 : 16) + k * 2).value = st[fe][sz];
    };
    fill(D.perf.inbound, cfg.inRow, cfg.st1, cfg.st1);
    fill(D.perf.outbound, cfg.outRow, cfg.st2, cfg.st2);
    // ── V9.19-08: 데이터 행 병합 복원 — 실물은 매 행 D:G(선사)+짝(H:I…V:W) 병합인데 템플릿 생성 때 풀림.
    //   (사용자 실측: 선사명 칸 분리·H열 숫자 ####·격자선이 실물과 다름)
    const mergeRow = (rn) => {
      const pairs = [[4,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],[20,21],[22,23]];
      for (const [c1,c2] of pairs) {
        const saved = [];
        for (let c=c1;c<=c2;c++) saved.push(JSON.parse(JSON.stringify(ws.getRow(rn).getCell(c).style || {})));
        try { ws.mergeCells(rn, c1, rn, c2); } catch { /* 이미 병합 */ }
        for (let c=c1;c<=c2;c++) ws.getRow(rn).getCell(c).style = saved[c-c1];
      }
    };
    for (let r = cfg.inRow; r <= cfg.st1 - 1; r++) mergeRow(r);
    for (let r = cfg.outRow; r <= cfg.st2 - 1; r++) mergeRow(r);
    // ── V9.19-06: 원본 배 잔재 청소 + 합계 갱신 (사용자 실측: X열 TOTAL·REMARKS·SHIFT·워킹피리어드 잔재) ──
    const rowSum = (r) => { let t2 = 0; for (let c = 8; c <= 23; c++) {
      const cell2 = ws.getRow(r).getCell(c);
      if (cell2.master && cell2.master.address !== cell2.address) continue;   // 병합 슬레이브 중복 방지
      const v2 = cell2.value;
      if (typeof v2 === 'number') t2 += v2;
      else if (v2 && typeof v2 === 'object' && typeof v2.result === 'number') t2 += v2.result;
    } return t2; };
    const setX = (r, v2) => { const c2 = ws.getRow(r).getCell(24); c2.value = (v2 === 0 && !ws.getRow(r).getCell(4).value) ? null : v2; };
    for (const [r0, r1] of [[cfg.inRow, cfg.st1 - 1], [cfg.outRow, cfg.st2 - 1]]) {
      for (let r = r0; r <= r1; r++) {
        setX(r, rowSum(r));                       // X(TOTAL) — 잔재 숫자/수식 캐시 → 우리 값
        ws.getRow(r).getCell(27).value = null;    // AA(REMARKS) 잔재 제거
      }
    }
    setX(cfg.st1, rowSum(cfg.st1)); setX(cfg.st2, rowSum(cfg.st2));
    ws.getRow(cfg.st1).getCell(27).value = null; ws.getRow(cfg.st2).getCell(27).value = null;
    // GRAND TOTAL·SHIFT·WORKING PERIOD 구역 — 라벨 탐지
    let grandRow = 0, wpRow = 0;
    for (let r = cfg.st2 + 1; r <= Math.min(ws.rowCount, cfg.st2 + 40); r++) {
      const a2 = String(ws.getRow(r).getCell(1).value || '');
      if (!grandRow && /GRAND/i.test(a2)) grandRow = r;
      if (!wpRow && /WORKING\s*PERIOD/i.test(a2)) { wpRow = r; break; }
    }
    if (grandRow) {
      for (let r = cfg.st2 + 1; r < grandRow; r++) {   // SHIFT 행 — 잔재 제거 후 우리 값
        const rw = ws.getRow(r);
        const isFirst = r === cfg.st2 + 1;
        rw.getCell(4).value = (isFirst && D.shifting.length) ? `${D.shifting.length} TIME` : null;
        for (let c = 8; c <= 27; c++) rw.getCell(c).value = null;
      }
      const gr = ws.getRow(grandRow);
      for (let c = 8; c <= 22; c += 2) {
        const t2 = (Number(ws.getRow(cfg.st1).getCell(c).value) || 0) + (Number(ws.getRow(cfg.st2).getCell(c).value) || 0);
        const cell = gr.getCell(c);
        // exceljs가 result:0을 직렬화에서 떨어뜨림(실측) — 0은 리터럴로 쓴다
        cell.value = (cell.formula && t2) ? { formula: cell.formula, result: t2 } : t2;
      }
      const gx = gr.getCell(24);
      const gt = rowSum(grandRow);
      gx.value = (gx.formula && gt) ? { formula: gx.formula, result: gt } : gt;
    }
    if (wpRow) {
      // 워킹피리어드: 틀은 유지(공간 확보), 내용(크레인·시각·비고 잔재)만 비움 — 수기 기입용
      for (let r = wpRow + 1; r <= Math.min(ws.rowCount, wpRow + 45); r++) {
        for (let c = 1; c <= 36; c++) {
          const cell = ws.getRow(r).getCell(c);
          if (cell.master && cell.master.address !== cell.address) continue;
          if (cell.formula) {
            // 빈 입력에도 0을 그리는 수식(=E35 체인·SUM)은 제거 — '00:00 HRS' 유령 표시 방지.
            //   IF(ISBLANK...) 계열은 빈칸에서 공백이므로 남김(수석 수기 입력 시 자동계산 편의 유지).
            const f2 = String(cell.formula);
            cell.value = /^IF\s*\(/i.test(f2) ? { formula: cell.formula } : null;
            continue;
          }
          const v2 = cell.value;
          if (typeof v2 === 'number' || v2 instanceof Date) cell.value = null;   // 시각은 Date로 읽힘(실측)
          else if (typeof v2 === 'string' && v2.trim() && !/FROM|^TO$|HOURS|REMARKS|TOTAL|CRANE/i.test(v2.trim())) cell.value = null;
        }
      }
    }
  }
  // ── SHIFTING ──
  if (M.sheets.shifting) {
    const cfg = M.sheets.shifting;
    const ws = get('shifting');
    for (let i = 0; i < Math.max(D.shifting.length, cfg.dataEnd - cfg.dataStart + 1); i++) {
      const r = ws.getRow(cfg.dataStart + i);
      const s2 = D.shifting[i];
      [s2?.no, s2?.cn, s2?.type, s2?.fe, s2?.wt, s2?.op, s2?.oldPos, s2?.newPos, s2?.pod, s2?.pol, s2?.op]
        .forEach((v, k) => { r.getCell(k + 1).value = v ?? null; });
    }
  }
  return wb;
}

// ── V9.21: 여객선(페리) 바우처 채우기 — TNJP 실물 26353E&W 기준 ─────────────
function fillFerrySheets(wb, M, D, dstr) {
  const F = D.ferry || { inb: null, outb: null };
  const zv2 = (n) => (n ? n : null);   // 0은 빈칸 (실물 관례)
  // ── Final work rpt-voucher
  {
    const cfg = M.sheets.finalWork;
    const ws = wb.getWorksheet(cfg.name);
    if (cfg.voyCells) { ws.getCell(cfg.voyCells[0]).value = ` ${D.voyD}`; ws.getCell(cfg.voyCells[1]).value = D.voyL; }
    const put = (rows, z) => {
      if (!z) return;
      for (const k of ['f20', 'e20', 'f20lug', 'e20lug', 'f40', 'e40', 'f40lug', 'e40lug']) {
        const r = rows[k]; const e = z[k];
        ws.getRow(r).getCell(cfg.cols.total).value = zv2(e.total);
        ws.getRow(r).getCell(cfg.cols.day).value = zv2(e.day);
        ws.getRow(r).getCell(cfg.cols.night).value = zv2(e.night);
      }
      ws.getRow(rows.total).getCell(cfg.cols.total).value = z.total.total;
      ws.getRow(rows.total).getCell(cfg.cols.day).value = zv2(z.total.day);
      ws.getRow(rows.total).getCell(cfg.cols.night).value = zv2(z.total.night);
    };
    put(cfg.inRows, F.inb);
    put(cfg.outRows, F.outb);
  }
  // ── RF condition report (3페이지, 오버플로는 다음 페이지로 — 페이지 초과분은 노트)
  if (M.sheets.rfFerry) {
    const cfg = M.sheets.rfFerry;
    const ws = wb.getWorksheet(cfg.name);
    for (const vc of cfg.voyCells || []) { try { ws.getCell(vc).value = D.voyD || D.voyL; } catch { /* skip */ } }
    // 실물 관례(26353 실측): 양하 F 리퍼만 기재 — 공리퍼·선적 리퍼는 미기재 (실물 40대와 일치)
    const all = D.rfIn.filter((x) => x.fe !== 'E');
    let i = 0;
    for (const [r1, r2] of cfg.pages) {
      for (let r = r1; r <= r2 && i < all.length; r++, i++) {
        const o = all[i]; const row = ws.getRow(r);
        row.getCell(1).value = o.cn;
        row.getCell(2).value = o.seal || null;
        row.getCell(3).value = o.size;
        row.getCell(4).value = o.loc || null;
        // TallyOne 1.8: 실물 템플릿 병합 실측 — D:E=LOCATION, F:G=TEMPERATURE(F=Setting, G=Atual),
        //   H=TIME(Plug In/Out), I=REMARKS. Actual 은 검수원이 확인한 값이 있을 때만 찍는다.
        row.getCell(6).value = o.setting || null;
        row.getCell(7).value = o.actual || null;
        row.getCell(9).value = o.dg ? 'DG' : null;
      }
    }
    if (i < all.length) D._overflow = (D._overflow || 0) + (all.length - i);
  }
  // ── PORTPERFORMANCE
  if (M.sheets.ppFerry) {
    const cfg = M.sheets.ppFerry;
    const ws = wb.getWorksheet(cfg.name);
    ws.getCell(cfg.vslCell).value = D.vslFull;
    ws.getCell(cfg.voyCell).value = D.voyL ? `${D.voyD}/${D.voyL.slice(-1)}` : D.voyD;
    const put = (rn, pp) => {
      if (!pp) return;
      let ttl = 0;
      for (const k of ['f20', 'f40', 'fhc', 'flug', 'e20', 'e40', 'ehc', 'elug']) {
        ws.getRow(rn).getCell(cfg.cols[k]).value = zv2(pp[k]); ttl += pp[k];
      }
      ws.getRow(rn).getCell(cfg.cols.ttl).value = ttl;
    };
    put(cfg.rows.inCk, F.inb && F.inb.pp); put(cfg.rows.inTtl, F.inb && F.inb.pp);
    put(cfg.rows.outCk, F.outb && F.outb.pp); put(cfg.rows.outTtl, F.outb && F.outb.pp);
    if (D.shifting.length) ws.getRow(cfg.rows.shift).getCell(2).value = `${D.shifting.length} TIME`;
  }
  // ── OS-IN/OUT (페리 고정행: 20'/40'/45' × F/E, 40HC는 40'에 합산·REMARKS로 HC/RH(+DG) 분해 — 수석 실물 규칙)
  for (const [key, zk] of [['osFerryIn', 'inb'], ['osFerryOut', 'outb']]) {
    const cfg = M.sheets[key];
    if (!cfg) continue;
    const ws = wb.getWorksheet(cfg.name);
    const z = F[zk];
    if (!ws || !z) continue;
    let man = 0; let portDone = false;
    for (const rr of cfg.rows) {
      const o = z.os[`${rr.sz}${rr.fe}`] || { n: 0, hc: 0, rh: 0, dg: 0, port: '' };
      const row = ws.getRow(rr.r);
      if (!portDone && o.n && o.port) { row.getCell(2).value = o.port.split('').join(' '); portDone = true; }
      row.getCell(8).value = o.n ? o.n : null;
      row.getCell(10).value = o.n ? o.n : null;
      row.getCell(11).value = 'NIL';
      row.getCell(12).value = 'NIL';
      const parts = [];
      if (o.hc) parts.push(`HC x ${o.hc}`);
      // TallyOne 1.4: 리퍼 라벨은 규격별로 다르다 — 20'는 RF, 40'/45'는 RH (실물 관례·buildRF와 동일).
      if (o.rh) parts.push(`${String(rr.sz).startsWith('20') ? 'RF' : 'RH'} x ${o.rh}`);
      let rm = parts.join(' , ');
      if (o.dg) rm += `${rm ? ' ' : ''}( DG x ${o.dg} )`;
      row.getCell(13).value = rm || null;
      man += o.n;
    }
    // TallyOne 1.4: 템플릿 행에 없는 분류에 값이 있으면 조용히 사라진다 — 반드시 드러낸다(3금지 3번).
    {
      const covered = new Set(cfg.rows.map((rr) => `${rr.sz}${rr.fe}`));
      const missed = Object.entries(z.os).filter(([k, v]) => v && v.n > 0 && !covered.has(k));
      if (missed.length) {
        D._osMissed = (D._osMissed || []).concat(missed.map(([k, v]) => `${cfg.name} ${k}=${v.n}`));
      }
    }
    const tr = ws.getRow(cfg.totalRow);
    // ⚠ H:I 병합 — 슬레이브(9)에 쓰면 마스터가 지워진다(실측). 마스터(8)만 쓴다. 잔재는 템플릿 빌드에서 이미 청소.
    tr.getCell(8).value = man; tr.getCell(10).value = man;
    tr.getCell(11).value = 'NIL'; tr.getCell(12).value = 'NIL';
  }
}

// ── V9.19-03: 변형(cn) Final Work 채우기 ─────────────────────────────────
//   구조(실측 DXQD·TMPZ): 선사 블록마다 [포트쌍 F/E … + Total F/E(수식)] · 마지막 G.Total(수식) ·
//   헤더 DISCH( n )도 수식. → 쌍 행 값만 쓰고, 수식 셀은 계산 결과를 캐시에 넣는다
//   (모바일 뷰어는 재계산을 안 하므로 {formula, result}로 저장).
function fillVariantFinalWork(wb, M, D, dstr) {
  const cfg = M.sheets.finalWork;
  const ws = wb.getWorksheet(cfg.name);
  const h = cfg.hdr || {};
  if (h.voy) ws.getCell(h.voy).value = `VOY # : ${[D.voyD, D.voyL].filter(Boolean).join(' / ')}`;
  if (h.date) ws.getCell(h.date).value = dstr;
  if (h.pier) ws.getCell(h.pier).value = D.pier;
  if (h.berth) ws.getCell(h.berth).value = D.berth;
  ws.getCell('B4').value = D.vslFull;

  // 매트릭스 → 행 매칭: 행 키 = (sub || 블록op, port). 우리 rows는 op·port·fe 순.
  const want = {};   // `${op}|${port}|${fe}` → sizes
  for (const row of D.rows) {
    want[`${row.op}|${row.port}|${row.fe}`] = { dis: row.dis, load: row.load, shift: row.shift };
  }
  const used = new Set();
  const writeRow = (r, v) => {
    ['20','40','HC','45'].forEach((sz, k) => {
      ws.getRow(r).getCell(4 + k).value = zv(v.dis[sz]);
      ws.getRow(r).getCell(8 + k).value = zv(v.load[sz]);
      ws.getRow(r).getCell(12 + k).value = zv(v.shift[sz]);
    });
  };
  const empt = { dis: {}, load: {}, shift: {} };
  const freeRows = [];
  for (const pr of cfg.pairRows) {
    const key = (fe) => `${pr.sub || pr.op}|${pr.port}|${fe}`;
    if (!pr.op && !pr.port) { freeRows.push(pr.r); continue; }
    const vF = want[key('F')]; const vE = want[key('E')];
    writeRow(pr.r, vF || empt);
    writeRow(pr.r + 1, vE || empt);
    if (vF) used.add(key('F'));
    if (vE) used.add(key('E'));
  }
  // 템플릿에 없는 (선사,포트) — 빈 쌍 행에 라벨 써서 배치
  const leftovers = Object.keys(want).filter(k => !used.has(k) && k.endsWith('|F'));
  let li = 0;
  for (const k of leftovers) {
    if (li >= freeRows.length) { D._overflow = (D._overflow || 0) + 1; continue; }
    const [op, port] = k.split('|');
    const r = freeRows[li++];
    try { ws.getCell(`A${r}`).value = op; } catch { /* skip */ }
    try { ws.getCell(`B${r}`).value = port; } catch { /* skip */ }
    writeRow(r, want[k] || empt);
    writeRow(r + 1, want[`${op}|${port}|E`] || empt);
  }
  refreshFormulaResults(ws, 8, (cfg.grandRow || 40) + 1, D);
}

/** 시트 구역의 수식 셀 결과 캐시 갱신 — SUM(...)·+A+B 체인·헤더 문자열 수식 지원 */
function refreshFormulaResults(ws, r1, r2, D) {
  const val = (addr) => {
    const c = ws.getCell(addr);
    if (c.formula) return evalF(c.formula);
    const v = c.value;
    return (typeof v === 'number') ? v : 0;
  };
  const evalF = (f) => {
    const s2 = String(f);
    const sum = s2.match(/^SUM\(([^)]+)\)$/i);
    let refs = null;
    if (sum) refs = sum[1].split(/[,;:]/);
    else if (/^\+?[A-Z]+\d+([+][A-Z]+\d+)*$/.test(s2.replace(/^\+/, '').replace(/\s/g, ''))) refs = s2.replace(/\s/g, '').replace(/^\+/, '').split('+');
    if (!refs) return null;
    let t = 0;
    for (const ref of refs) {
      const rr = ref.trim();
      if (/^[A-Z]+\d+$/.test(rr)) t += val(rr);
      else if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(rr)) {
        const [a, b] = rr.split(':');
        const c1 = a.match(/[A-Z]+/)[0], n1 = +a.match(/\d+/)[0], c2b = b.match(/[A-Z]+/)[0], n2 = +b.match(/\d+/)[0];
        const ci = (x) => x.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
        for (let rr2 = n1; rr2 <= n2; rr2++) for (let cc = ci(c1); cc <= ci(c2b); cc++) {
          const v2 = ws.getRow(rr2).getCell(cc).value;
          t += (typeof v2 === 'number') ? v2 : (v2 && typeof v2 === 'object' && typeof v2.result === 'number' ? v2.result : 0);
        }
      }
    }
    return t;
  };
  // 2패스 — 소계 먼저, 총계(소계 참조)는 소계 결과 반영 후
  for (let pass = 0; pass < 2; pass++) {
    for (let r = r1; r <= r2; r++) {
      for (let c = 1; c <= 16; c++) {
        const cell = ws.getRow(r).getCell(c);
        if (!cell.formula) continue;
        const f = String(cell.formula);
        if (/DISCH|LOAD|SHIFT/i.test(f) || /&/.test(f)) {
          // 헤더 문자열 수식 — 총계로 문자열 구성
          const label = /DISCH/i.test(f) ? `DISCH ( ${D.totals.dis.n} )` : /LOAD/i.test(f) ? `LOAD ( ${D.totals.load.n} )` : `SHIFT ( ${D.totals.shift.n} )`;
          cell.value = label;   // 문자열 수식은 값으로 대체(뷰어 호환)
          continue;
        }
        const rres = evalF(f);
        if (rres !== null) cell.value = { formula: f, result: rres };
      }
    }
  }
}

// ── V9.19-06: 라벨 스캔 헤더 기입 ──────────────────────────────────────────
function fillAllHeaders(wb, D, dstr) {
  const voyAll = [D.voyD, D.voyL].filter(Boolean).join(' & ');
  const valFor = (kind, sheetName) => {
    const sn = sheetName.toUpperCase();
    if (kind === 'MV') return D.vslFull;
    if (kind === 'VOY') {
      if (/-IN\b|DISCH/.test(sn)) return D.voyD || D.voyL;
      if (/-OUT\b|LOAD/.test(sn)) return D.voyL || D.voyD;
      if (/SEAL/.test(sn) || /^RF|REEFER/.test(sn)) return D.voyD || D.voyL;
      return voyAll;
    }
    if (kind === 'DATE') return dstr;
    if (kind === 'PIER') return D.pier;
    if (kind === 'BERTH') return D.berth;
    if (kind === 'PORT') return CITY();
    return null;
  };
  const kindOf = (t) => {
    const u = t.toUpperCase();
    if (/^M\s*\.?\s*\/?\s*V\s*\.?\s*:?/.test(u.replace(/\s+/g, ' ').trim()) && /M\s*\.?\s*[\/.]\s*V/.test(u)) return 'MV';
    if (/^VOY/.test(u.trim())) return 'VOY';
    if (/^DATE/.test(u.trim())) return 'DATE';
    if (/^PIER/.test(u.trim())) return 'PIER';
    if (/^BERTH/.test(u.trim())) return 'BERTH';
    if (/^\s*PORT/.test(u)) return 'PORT';
    return null;
  };
  for (const ws of wb.worksheets) {
    // 병합 범위 목록 (라벨 병합의 오른쪽 끝 찾기용)
    const merges = (ws.model.merges || []).map((m0) => {
      const mm = String(m0).match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (!mm) return null;
      const cn = (c) => c.split('').reduce((a2, ch) => a2 * 26 + ch.charCodeAt(0) - 64, 0);
      return { c1: cn(mm[1]), r1: +mm[2], c2: cn(mm[3]), r2: +mm[4] };
    }).filter(Boolean);
    // 2·3페이지 사본 헤더(예: Seal 41행, RF 50·93행)도 잔재가 남으므로 전 행 스캔.
    //   오인 방지 장치: 콜론 필수 + kindOf 라벨 패턴 + 길이 제한(라벨은 짧다).
    for (let r = 1; r <= Math.min(ws.rowCount, 200); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= 30; c++) {
        const cell = row.getCell(c);
        if (cell.master && cell.master.address !== cell.address) continue;   // 병합 슬레이브 skip
        const v = cell.value;
        const txt = (typeof v === 'string') ? v : (v && typeof v === 'object' && typeof v.richText !== 'undefined') ? v.richText.map(t2 => t2.text).join('') : null;
        if (!txt || !txt.trim()) continue;
        if (!txt.includes(':') || txt.length > 60) continue;   // 라벨은 콜론 포함·짧음 — 열머리/데이터 오인 방지
        const kind = kindOf(txt);
        if (!kind) continue;
        const nv = valFor(kind, ws.name);
        if (nv == null) continue;
        const ci = txt.indexOf(':');
        const tail = ci >= 0 ? txt.slice(ci + 1).trim() : '';
        if (ci >= 0 && tail) {
          // 합성 라벨 — 콜론 뒤만 교체 (앞 공백 형식 유지)
          const pad = txt.slice(ci + 1).match(/^\s*/)[0] || ' ';
          cell.value = txt.slice(0, ci + 1) + (pad.length ? pad : ' ') + nv;
        } else {
          // 값 셀 = 라벨(병합 포함) 오른쪽에서 첫 병합 마스터 또는 기존 값(수식 캐시 잔재) 셀.
          //   (Performance: O6 라벨 ↔ R6 값처럼 사이가 떠 있는 레이아웃 대응)
          const mg = merges.find((m2) => m2.r1 <= r && r <= m2.r2 && m2.c1 <= c && c <= m2.c2);
          const start = (mg ? mg.c2 : c) + 1;
          let vc = start;
          const cellText = (cv) => (typeof cv === 'string') ? cv
            : (cv && typeof cv === 'object' && cv.richText) ? cv.richText.map(t3 => t3.text).join('')
            : '';   // richText 라벨(BERTH 등)도 문자열로 — V9.19-07 실측 사고
          for (let k2 = start; k2 <= start + 7; k2++) {
            const cand = ws.getRow(r).getCell(k2);
            const ctxt = cellText(cand.value);
            if (ctxt.includes(':') || kindOf(ctxt || '')) { vc = start; break; }   // 다음 라벨 도달 → 기본 칸
            const isMaster = merges.some((m2) => m2.r1 === r && m2.c1 === k2);
            const hasVal = cand.value !== null && cand.value !== undefined && cand.value !== '';
            if (isMaster || hasVal) { vc = k2; break; }
          }
          ws.getRow(r).getCell(vc).value = nv;   // 수식 캐시(잔재)도 리터럴로 덮음
          c = vc;   // 값 셀 다음부터 계속 (라벨 재감지 방지)
        }
      }
    }
  }
}

/** 워크북 생성 → Blob 다운로드. 반환: 파일명 */
// TallyOne 1.7: opts.download === false 면 파일을 내려받지 않고 buf 만 돌려준다.
//   호출부가 TALLYBOX에 직접 쓰는 경로(tallyboxFs)를 쓸 때를 위한 것. 기본값은 종전대로 다운로드.
export async function generateTallyExcel(D, opts = {}) {
  const _wantDownload = opts.download !== false;
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
  // V9.19-01: 실물 템플릿 우선 — 실패 시 드로잉 폴백
  let note = '';
  let tplWb = null;
  try { tplWb = await fillTemplate(D, ExcelJS); } catch (e) { note = `템플릿 실패(${e?.message || e}) — 표준 서식으로 생성`; }
  if (tplWb) {
    // V9.19-05: NaN/Infinity 캐시 결과 스크럽 — 엑셀이 <v>NaN</v>을 거부해 '복구' 경고를 띄우고
    //   복구 과정에서 서식이 깎인다 (KKAK/MCAP 실측, RF 시트 H98=H55 수식 캐시가 NaN).
    tplWb.worksheets.forEach((ws0) => ws0.eachRow({ includeEmpty: true }, (row0) => row0.eachCell({ includeEmpty: true }, (c0) => {
      const v0 = c0.value;
      if (typeof v0 === 'number' && !isFinite(v0)) c0.value = null;
      else if (v0 && typeof v0 === 'object' && typeof v0.result === 'number' && !isFinite(v0.result)) c0.value = { formula: v0.formula, sharedFormula: v0.sharedFormula };
    })));
    const voy0 = [D.voyD, D.voyL].filter(Boolean).join('&');
    const fname0 = `${D.code} ${voy0} PTK TALLY REPORT.xlsx`;
    const buf0 = await tplWb.xlsx.writeBuffer();
    if (_wantDownload) _download(buf0, fname0);
    const notes = [note, D._stdNote, D._overflow ? `⚠ 자리 부족으로 못 실은 선사·포트 ${D._overflow}건 — 확인 필요` : ''].filter(Boolean);
    return { fname: fname0, buf: buf0, note: notes.join(' · ') || '실물 서식(템플릿) 기반' };
  }
  if (!note) note = '이 배는 템플릿 미보유 — 표준 서식으로 생성(배치가 실물과 다를 수 있음)';
  const wb = new ExcelJS.Workbook();
  wb.creator = `${tenant().companyEn} Tallyman`;
  sheetFinalWork(wb, D);
  sheetTimeSheet(wb, D);
  sheetOS(wb, D, 'in');
  sheetDM(wb, D, 'in');
  sheetOS(wb, D, 'out');
  sheetDM(wb, D, 'out');
  sheetSeal(wb, D);
  sheetRF(wb, D);
  if (D.fmt.performance !== false) sheetPerformance(wb, D);
  if (D.fmt.shifting && D.shifting.length) sheetShifting(wb, D);
  const voy = [D.voyD, D.voyL].filter(Boolean).join('&');
  const fname = `${D.code} ${voy} PTK TALLY REPORT.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  if (_wantDownload) _download(buf, fname);
  return { fname, buf, note };
}

function _download(buf, fname) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}
