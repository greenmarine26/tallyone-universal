// M5.55: FINAL WORKING REPORT (VOUCHER) — DJCF 0145N&0146S 양식 확정판
//   - GREEN MARINE CO., LTD. / FINAL WORKING REPORT (VOUCHER)
//   - OPERATOR(선사 순서: SKR→NSL→DJS→HAS→HSL→기타) × PORT × F/E × SIZE
//   - DISCH(양하) / LOAD(선적) / SHIFT(이적)
//   - A4 풀 1페이지 강제, 굵은 선 구분, 빈 행 OPERATOR rowspan=3

// ============ 매핑 테이블 ============
// PORT 코드 매핑
import { openPrintWindow } from './printHelper.js';
import { formatBerth, isPyeongtaekPort } from './utils.js';
const PORT_MAP = {
  // 표준 5자
  // V9.57(G13): 평택 표기 7종(utils.isPyeongtaekPort의 PYEONGTAEK_CODES)과 정합 —
  //   KRPYOTM/PYOTM/KRPYO/PYT 누락 시 normalizePort 폴백(뒤 3자)이 'OTM'/'PYO' 같은 유령 항구를 만들었다.
  'KRPUS': 'PUS', 'KRKAN': 'KAN', 'KRPTK': 'PTK', 'KRPYT': 'PTK', 'KRINC': 'INC',
  'PYT': 'PTK', 'KRPYOTM': 'PTK', 'PYOTM': 'PTK', 'KRPYO': 'PTK',
  'VNSGN': 'SGN', 'VNHPP': 'HPP',
  'THLCH': 'LCH', 'THBKK': 'BKK',
  'JPTYO': 'TYO', 'JPYOK': 'YOK',
  'MYPEN': 'PEN', 'MYPKG': 'PKG',
  'CNTAG': 'TAG', 'CNNTG': 'NTG',
  // BL prefix 변형 (NSL JDCF 등)
  'BSE': 'PUS', 'HCC': 'SGN', 'LCC': 'LCH',
  // 3자 그대로
  'PUS': 'PUS', 'KAN': 'KAN', 'PTK': 'PTK', 'SGN': 'SGN',
  'LCH': 'LCH', 'BKK': 'BKK', 'TYO': 'TYO', 'PEN': 'PEN',
  'PKG': 'PKG', 'INC': 'INC', 'HPP': 'HPP', 'YOK': 'YOK',
  'TAG': 'TAG', 'NTG': 'NTG',
};

// 선사 코드 매핑 (BL prefix / 선사부호 → voucher 약자)
const CARRIER_MAP = {
  'DJSC': 'DJS', 'NSSL': 'NSL', 'HASL': 'HAS', 'SNKO': 'SKR',
  'HSLI': 'HSL', 'JEON': 'HSL',
  // M5.68 — 4자 약자 → 3자 변환 (voucher OPERATOR는 항상 3자)
  'DWIC': 'DWS', 'EASK': 'EAS', 'TJMS': 'TJM', 'WDFC': 'WDF', 'SCLK': 'SIT',
};

// 사진 양식의 선사 표시 순서
const OP_ORDER = ['SKR', 'NSL', 'DJS', 'HAS', 'HSL'];

// PORT 표시 순서 (voucher)
const PORT_VOUCHER_ORDER = ['PUS', 'KAN', 'SGN', 'LCH', 'BKK', 'PKG', 'PEN', 'TYO', 'YOK', 'HPP', 'INC', 'TAG', 'NTG'];

// 비표준 사이즈 코드 (DJS DONGJIN 양식)
const SIZE_MAP_DJS = { 'D2':'20', 'D5':'HC', 'D4':'40', 'R5':'HC', 'R2':'20' };

// ============ 헬퍼 ============
function normalizePort(code) {
  if (!code) return '?';
  const c = String(code).trim().toUpperCase();
  if (PORT_MAP[c]) return PORT_MAP[c];
  // 5자 unknown은 마지막 3자
  if (c.length >= 3) return c.slice(-3);
  return '?';
}

function normalizeOp(c) {
  // M5.68 — 영구 규칙: voucher OPERATOR는 항상 3자 (4자 약자는 앞 3자만)
  const to3 = (s) => String(s || '').slice(0, 3).toUpperCase();

  // M5.79: 부킹 슬롯 (평택 적재 컨번호 미입력)은 선사 코드도 미정
  //   __BOOK_ 임시 ID의 앞 3자(__B/_BO)가 선사로 잡히는 사고 방지
  const isBooking = c.isBooking === true || c.pendingCn === true ||
                    (typeof c.cn === 'string' && c.cn.startsWith('__BOOK_'));

  // 1순위: EDI에서 추출된 op (NAD+CA)
  if (c.op) {
    const op = String(c.op).toUpperCase();
    if (CARRIER_MAP[op]) return CARRIER_MAP[op];  // 매핑된 값은 이미 3자
    return to3(op);
  }
  // 2순위: BL 번호 prefix (4자)
  if (c.bl && c.bl.length >= 4) {
    const blp = c.bl.slice(0, 4).toUpperCase();
    if (CARRIER_MAP[blp]) return CARRIER_MAP[blp];
  }
  // 3순위: 선사부호 컬럼
  if (c.carrierCode) {
    const cc = String(c.carrierCode).toUpperCase();
    if (CARRIER_MAP[cc]) return CARRIER_MAP[cc];
    return to3(cc);
  }
  // 폴백: cn prefix (앞 3자) — 부킹 슬롯이면 차단
  if (!isBooking && c.cn && c.cn.length >= 3) return c.cn.slice(0, 3).toUpperCase();
  return '?';
}

function getSizeKey(c) {
  // 1순위: 비표준 코드 (D2/D5 등)
  const iso = String(c.iso || '').toUpperCase().trim();
  if (SIZE_MAP_DJS[iso]) return SIZE_MAP_DJS[iso];

  if (iso) {
    const iu = iso.replace(/\s/g, '');
    // M5.65: SZTY 양식 우선 검사 (4HDC, 4HRF, 40HC, 45 등 → HC)
    if (iu.includes('4H') || iu.includes('40HC') || iu.includes('45')) return 'HC';
    // 진짜 45피트 (L로 시작)
    if (iu.startsWith('L')) return '45';
    // 20피트
    if (iu.startsWith('2') || iu.includes('20')) return '20';
    // M5.81: 명시적 40DC 표기만 '40'으로 분류 (평택항 도메인 - 40DC 매우 드묾)
    //   42xx = 40DC (42GP/42G0/42G1/42RE/42UT 등)
    //   기타 4로 시작은 모두 HC로 분류 (안전 디폴트)
    if (/^4[02]/.test(iu)) return '40';   // 42xx 또는 40xx만 진짜 40DC
    if (iu.startsWith('4')) return 'HC';  // 그 외 4로 시작 → HC (평택 도메인)
  }
  // M5.81 폴백: ISO 정보 없어 cn 끝자리로 추정
  //   평택항 도메인 반영 — 40DC는 하루 1-2개 매우 드묾
  //   따라서 모호한 경우 40 standard 대신 HC로 분류 (안전)
  if (c.cn && /^[A-Z]{4}\d{7}$/.test(c.cn)) {
    return parseInt(c.cn[10]) >= 4 ? 'HC' : '20';   // 이전: '40' / '20' → 변경: 'HC' / '20'
  }
  return '20';
}

function getFE(c) {
  // 1순위: c.fe 직접 (F/E)
  if (c.fe) {
    const fe = String(c.fe).toUpperCase().trim();
    if (fe === 'E' || fe === 'EMPTY' || fe === 'MT' || fe === 'P') return 'E';
    return 'F';
  }
  // 2순위: cargo type (DJS 양식: F=Full, P=Empty)
  if (c.cargoType) {
    return String(c.cargoType).toUpperCase() === 'F' ? 'F' : 'E';
  }
  // 3순위: ISO 끝자리 (E)
  const iso = String(c.iso || '').toUpperCase();
  if (iso.endsWith('E')) return 'E';
  return 'F';
}

// PORT 결정: 양하면 POL(출발지), 선적이면 TSPORT(환적) > POD(목적지)
function getPort(c, mode) {
  if (mode === 'disch') {
    return normalizePort(c.pol);
  } else {
    // 선적: TSPORT(환적 항구) 우선, 없으면 POD/printpod
    const target = c.tsport || c.printpod || c.pod;
    let port = normalizePort(target);
    // BL prefix에서 항구 추출 (NSL JDCF: NSSLPT[XXX] 패턴)
    if (port === '?' && c.bl) {
      const m = String(c.bl).toUpperCase().match(/^[A-Z]{4}PT([A-Z]{3})/);
      if (m && PORT_MAP[m[1]]) port = PORT_MAP[m[1]];
    }
    return port;
  }
}

function orderPorts(ports) {
  const arr = Array.from(ports);
  const inOrder = PORT_VOUCHER_ORDER.filter(p => arr.includes(p));
  const rest = arr.filter(p => !PORT_VOUCHER_ORDER.includes(p)).sort();
  return [...inOrder, ...rest];
}

// ============ 데이터 집계 ============
function buildBuckets(voyage, mode = 'settlement') {
  const disch = {}, load = {};

  const addToBucket = (bucket, op, port, size, fe) => {
    if (!bucket[op]) bucket[op] = {};
    if (!bucket[op][port]) bucket[op][port] = {};
    if (!bucket[op][port][size]) bucket[op][port][size] = { F: 0, E: 0 };
    bucket[op][port][size][fe]++;
  };

  // 작업용(actual): records에 있는 cn만 (실제 검수 완료된 것)
  const actualCns = mode === 'actual' && voyage.records
    ? new Set(Object.keys(voyage.records).map(k => String(k).toUpperCase()))
    : null;

  const processContainers = (containers, dlMode) => {
    const bucket = dlMode === 'disch' ? disch : load;
    (containers || []).forEach(c => {
      if (!c) return;
      // 작업용 모드: records에 없으면 skip
      if (actualCns && c.cn && !actualCns.has(String(c.cn).toUpperCase())) return;
      const op = normalizeOp(c);
      const port = getPort(c, mode);
      const size = getSizeKey(c);
      const fe = getFE(c);
      addToBucket(bucket, op, port, size, fe);
    });
  };

  // 양하 + 선적 처리 — 실제 구조: voyage.discharge / voyage.loading 객체
  //   각 section = { ediContainers: {cn: c, ...}, records: {cn: r, ...}, ... }
  if (voyage) {
    // 양하/선적 공통 처리 — LIST 기반 (records의 cn)
    //   결제용(settlement): records 전체 (LIST 컨테이너 = 평택 대상)
    //   작업용(actual): completed 또는 records 중 작업 완료된 것
    const processSection = (section, bucket, dlMode) => {
      if (!section) return;
      const ediCs = section.ediContainers || {};
      const recs = section.records || {};
      const completedCns = section.completed ? new Set(Object.keys(section.completed).map(k => String(k).toUpperCase())) : null;

      // 결제용: records의 모든 cn (LIST 데이터). 작업용: completed의 cn (실제 작업)
      let targetCns;
      if (mode === 'actual') {
        // 작업용: completed 있으면 그것, 없으면 records
        targetCns = section.completed && Object.keys(section.completed).length > 0
          ? Object.keys(section.completed)
          : Object.keys(recs);
      } else {
        // 결제용: records 전체 (LIST 평택 대상)
        targetCns = Object.keys(recs);
        // records가 비어 있으면 ediContainers의 PTK 필터로 폴백
        if (targetCns.length === 0) {
          // V7.40: 모드별 평택 판정 (지침 7.1 — 양하=POD평택, 선적=POL평택)
          targetCns = Object.values(ediCs)
            .filter(c => dlMode === 'disch' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol))
            .map(c => c.cn);
        }
      }

      targetCns.forEach(cn => {
        // M5.67: voucher는 EDI 우선 (ISO/POD/사이즈 정확). LIST는 필터링용 + 폴백.
        const cnUpper = String(cn).toUpperCase();
        const ediC = ediCs[cnUpper] || ediCs[cn] || {};
        const recC = recs[cnUpper] || recs[cn] || {};
        // EDI에 컨테이너 있으면 EDI 데이터 (POD/ISO/OP 정확)
        // EDI에 없으면 LIST 데이터 사용
        let c;
        if (ediC && ediC.cn) {
          // EDI 데이터 우선, LIST는 빈 필드만 보강
          c = { ...ediC };
          for (const [k, v] of Object.entries(recC)) {
            if ((c[k] === null || c[k] === undefined || c[k] === '') && v) c[k] = v;
          }
        } else {
          // EDI에 없는 컨테이너 = LIST 단독
          c = { ...recC };
        }
        c.cn = cn;
        if (!c.cn) return;
        const op = normalizeOp(c);
        const port = getPort(c, dlMode);
        const size = getSizeKey(c);
        const fe = getFE(c);
        if (!bucket[op]) bucket[op] = {};
        if (!bucket[op][port]) bucket[op][port] = {};
        if (!bucket[op][port][size]) bucket[op][port][size] = { F: 0, E: 0 };
        bucket[op][port][size][fe]++;
      });
    };

    processSection(voyage.discharge || voyage.disch, disch, 'disch');
    processSection(voyage.loading || voyage.load, load, 'load');
  }

  // Total 합계
  const totalDS = { '20':{F:0,E:0}, '40':{F:0,E:0}, 'HC':{F:0,E:0}, '45':{F:0,E:0} };
  const totalLD = { '20':{F:0,E:0}, '40':{F:0,E:0}, 'HC':{F:0,E:0}, '45':{F:0,E:0} };
  for (const op of Object.keys(disch)) {
    for (const port of Object.keys(disch[op])) {
      for (const sz of Object.keys(disch[op][port])) {
        if (totalDS[sz]) {
          totalDS[sz].F += disch[op][port][sz].F;
          totalDS[sz].E += disch[op][port][sz].E;
        }
      }
    }
  }
  for (const op of Object.keys(load)) {
    for (const port of Object.keys(load[op])) {
      for (const sz of Object.keys(load[op][port])) {
        if (totalLD[sz]) {
          totalLD[sz].F += load[op][port][sz].F;
          totalLD[sz].E += load[op][port][sz].E;
        }
      }
    }
  }
  const dischTotal = Object.values(totalDS).reduce((a,t) => a+t.F+t.E, 0);
  const loadTotal = Object.values(totalLD).reduce((a,t) => a+t.F+t.E, 0);

  return { disch, load, totalDS, totalLD, dischTotal, loadTotal };
}

// ============ HTML 생성 ============
function getCells(op, port, fe, dataset) {
  const sd = (dataset[op] || {})[port] || {};
  return ['20','40','HC','45'].map(sz => {
    const v = (sd[sz] || {})[fe] || 0;
    return v > 0 ? String(v) : '';
  });
}

function generateVoucherHTML(voyage, mode = 'settlement', overrides = {}) {
  const { disch, load, totalDS, totalLD, dischTotal, loadTotal } = buildBuckets(voyage, mode);
  // info는 voyage.info 또는 discharge/loading의 info에서
  const info = voyage.info || voyage.discharge?.info || voyage.loading?.info || {};
  const vesselName = info.vsl || info.vessel || info.vesselName || 'VESSEL';

  // M5.634: 양하+선적 항차 둘 다 있으면 모두 표시 / M5.64: overrides 우선
  const dVoy = overrides.dischVoy || voyage.discharge?.info?.voy || voyage.discharge?.info?.voyNo || info.voy_d || '';
  const lVoy = overrides.loadVoy || voyage.loading?.info?.voy || voyage.loading?.info?.voyNo || info.voy_l || '';
  let voyNo;
  if (dVoy && lVoy && dVoy !== lVoy) voyNo = `${dVoy} & ${lVoy}`;
  else if (dVoy) voyNo = dVoy;
  else if (lVoy) voyNo = lVoy;
  else voyNo = overrides.voy || info.voy || info.voyNo || '';
  const date = overrides.date || info.date || new Date().toISOString().slice(0, 10);
  // M5.82: PORT-MIS의 berth → PIER 자동 판별
  //   info.berth가 "동부두 7번선석" 형식이면 7번 → PCTC 자동
  //   info.pier가 명시되어 있으면 그것 우선
  const berthRaw = overrides.berth || info.berth || '';
  let autoPier = info.pier;
  if (!autoPier && berthRaw) {
    const m = String(berthRaw).match(/(\d+)\s*번선석/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 6 && n <= 9) autoPier = 'PCTC';
      else if (n >= 13 && n <= 16) autoPier = 'PNCT';
    }
  }
  const pier = autoPier || 'PCTC';   // 폴백: 평택항 주력 부두
  const berth = berthRaw ? formatBerth(berthRaw) : '-';  // M6.11: E7/W6 단축 양식
  const port = info.port || 'PYEONGTAEK, KOREA';

  // op 등장 set (실제 데이터)
  const presentOps = new Set([...Object.keys(disch), ...Object.keys(load)]);
  const sortedOps = [...OP_ORDER.filter(o => presentOps.has(o)),
                     ...Array.from(presentOps).filter(o => !OP_ORDER.includes(o)).sort()];

  // 본문 행
  const rows = [];
  for (const op of sortedOps) {
    const opPorts = new Set([
      ...Object.keys(disch[op] || {}),
      ...Object.keys(load[op] || {})
    ]);
    if (opPorts.size === 0) continue;
    const ports = orderPorts(opPorts);
    const rs = ports.length * 2;
    let opAdded = false;
    ports.forEach((p, pi) => {
      const isLast = pi === ports.length - 1;
      ['F', 'E'].forEach(fe => {
        const cells = [];
        if (!opAdded) { cells.push(`<td rowspan="${rs}" class="op-cell">${op}</td>`); opAdded = true; }
        if (fe === 'F') cells.push(`<td rowspan="2" class="port-cell">${p}</td>`);
        cells.push(`<td class="fe-cell">${fe}</td>`);
        const dc = getCells(op, p, fe, disch);
        cells.push(`<td class="disch-first">${dc[0]}</td>`);
        cells.push(...dc.slice(1).map(v => `<td>${v}</td>`));
        const lc = getCells(op, p, fe, load);
        cells.push(`<td class="load-first">${lc[0]}</td>`);
        cells.push(...lc.slice(1).map(v => `<td>${v}</td>`));
        cells.push('<td class="shift-first"></td><td></td><td></td><td></td>');
        const cls = (isLast && fe === 'E') ? ' class="op-end"' : '';
        rows.push(`<tr${cls}>${cells.join('')}</tr>`);
      });
    });
  }

  // Total 행
  const totalRow = (fe, first) => {
    const c = [];
    if (first) c.push('<td colspan="2" rowspan="2" class="total-label">Total</td>');
    c.push(`<td class="fe-cell">${fe}</td>`);
    ['20','40','HC','45'].forEach(sz => {
      const v = totalDS[sz][fe];
      const cls = sz === '20' ? ' class="disch-first"' : '';
      c.push(`<td${cls}>${v || '-'}</td>`);
    });
    ['20','40','HC','45'].forEach(sz => {
      const v = totalLD[sz][fe];
      const cls = sz === '20' ? ' class="load-first"' : '';
      c.push(`<td${cls}>${v || '-'}</td>`);
    });
    for (let k = 0; k < 4; k++) {
      const cls = k === 0 ? ' class="shift-first"' : '';
      c.push(`<td${cls}>-</td>`);
    }
    return `<tr class="total-row">${c.join('')}</tr>`;
  };

  // 빈 행 (A4 풀 채우기, OPERATOR 셀 rowspan — Total 침범 방지)
  const PAD_TARGET = 45;
  const needed = Math.max(0, PAD_TARGET - rows.length - 2);
  const emptyRows = [];
  for (let idx = 0; idx < needed; idx++) {
    const c = [];
    if (idx % 3 === 0) {
      // 마지막 그룹이 3 미만이면 남은 행 수에 맞춤 (Total 행 침범 방지)
      const rs = Math.min(3, needed - idx);
      c.push(`<td rowspan="${rs}" class="op-cell"></td>`);
    }
    c.push('<td></td>');  // PORT
    c.push('<td></td>');  // F/E
    c.push('<td class="disch-first"></td>','<td></td>','<td></td>','<td></td>');
    c.push('<td class="load-first"></td>','<td></td>','<td></td>','<td></td>');
    c.push('<td class="shift-first"></td>','<td></td>','<td></td>','<td></td>');
    emptyRows.push(`<tr class="empty-row">${c.join('')}</tr>`);
  }

  // Remarks 동적: 양하 + 선적 모두면 둘 다, 한쪽만이면 그 한쪽만
  let remarksHtml;
  if (dischTotal > 0 && loadTotal > 0) {
    remarksHtml = `<div class="bottom-row"><div><b>Remarks : Discharging</b></div><div><b>Remarks : Loading</b></div></div>`;
  } else if (loadTotal > 0) {
    remarksHtml = `<div class="bottom-single"><div><b>Remarks : Loading</b></div></div>`;
  } else {
    remarksHtml = `<div class="bottom-single"><div><b>Remarks : Discharging</b></div></div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FINAL WORKING REPORT (VOUCHER)</title>
<style>
@page { size: A4 portrait; margin: 0.8cm; }
body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 0; font-size: 9pt; color: #000; }
.content { padding: 4mm; }
.title { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 4pt; }
.subtitle { text-align: center; font-size: 13pt; font-weight: bold; border: 1pt solid #000; padding: 3pt; margin-bottom: 6pt; }
.info-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8pt; margin-bottom: 6pt; font-size: 10pt; }
.info-row b { display: inline-block; min-width: 60pt; }
table.voucher { width: 100%; border-collapse: collapse; font-size: 9pt; border: 1.5pt solid #000; }
table.voucher th, table.voucher td { border: 0.5pt solid #000; text-align: center; padding: 0 2pt; height: 11.5pt; line-height: 1.05; }
table.voucher th { background: #f0f0f0; font-weight: bold; font-size: 8pt; }
.op-cell { font-weight: bold; vertical-align: middle; font-size: 10pt; }
.port-cell { font-weight: bold; vertical-align: middle; }
.fe-cell { font-weight: bold; }
.total-row { font-weight: bold; background: #f8f8f8; }
.total-label { text-align: right; font-weight: bold; vertical-align: middle; }
table.voucher .disch-first { border-left: 1.5pt solid #000; }
table.voucher .load-first { border-left: 1.5pt solid #000; }
table.voucher .shift-first { border-left: 1.5pt solid #000; }
table.voucher thead th[colspan="4"] { border-left: 1.5pt solid #000; border-right: 1.5pt solid #000; }
table.voucher tr.op-end > td { border-bottom: 1.5pt solid #000; }
table.voucher tr.total-row:first-of-type > td { border-top: 1.5pt solid #000; }
.bottom-row { display: grid; grid-template-columns: 7fr 8fr; gap: 0; }
.bottom-row > div { border: 1pt solid #000; min-height: 55pt; padding: 4pt; font-size: 9pt; }
.bottom-row > div:nth-child(2) { border-left: none; }
.bottom-single > div { border: 1pt solid #000; min-height: 55pt; padding: 4pt; font-size: 9pt; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 20pt; }
.signs > div { text-align: center; padding-top: 4pt; font-weight: bold; font-size: 10pt; border-top: 0.5pt solid #000; }
</style></head><body><div class="content">
<div class="title">GREEN MARINE CO., LTD.</div>
<div class="subtitle">FINAL WORKING REPORT (VOUCHER)${mode === 'actual' ? ' — 작업용 (현재 진행)' : ''}</div>
<div class="info-row">
<div><b>M/V :</b> ${vesselName}</div>
<div><b>VOY # :</b> ${voyNo}</div>
<div><b>DATE :</b> ${date}</div>
<div><b>PIER :</b> ${pier}</div>
<div><b>BERTH :</b> ${berth}</div>
<div><b>PORT :</b> ${port}</div>
</div>
<table class="voucher">
<thead><tr>
<th rowspan="2">OPERATOR</th><th rowspan="2">PORT</th><th rowspan="2">FULL (F)<br>EMPTY (E)</th>
<th colspan="4">DISCH (${dischTotal})</th>
<th colspan="4">LOAD (${loadTotal})</th>
<th colspan="4">SHIFT (0)</th>
</tr><tr>
<th class="disch-first">20'</th><th>40'</th><th>HC</th><th>45'</th>
<th class="load-first">20'</th><th>40'</th><th>HC</th><th>45'</th>
<th class="shift-first">20'</th><th>40'</th><th>HC</th><th>45'</th>
</tr></thead>
<tbody>${rows.join('')}${emptyRows.join('')}${totalRow('F', true)}${totalRow('E', false)}</tbody></table>
${remarksHtml}
<div class="signs"><div>CHIEF CHECKER</div><div>CHIEF OFFICER</div></div>
</div></body></html>`;
}

export { generateVoucherHTML, buildBuckets, normalizeOp, normalizePort, getSizeKey, getFE, getPort };
export default generateVoucherHTML;

// 새 창에 voucher 출력 (PrintHubModal에서 호출)
export function openWorkingReportPrint(voyage, info = {}, mode = 'settlement', overrides = {}) {
  // M5.661: printHelper 사용 — toolbar 3가지 옵션 (인쇄/PDF/엑셀)
  const html = generateVoucherHTML(voyage, mode, overrides);
  openPrintWindow(html, 'FINAL_WORKING_REPORT');
}
