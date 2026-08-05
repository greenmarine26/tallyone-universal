// 실선적 EDI·ASC 내보내기 — 작업 완료 후 평택 선적분(실체 위치)을 카스피계 BAPLIE(D.95B/SMDG20 방언)와
// $604 ASC, 수정용 엑셀로 생성하고, 수정 엑셀을 다시 읽어 EDI를 재생성하는 왕복 모듈 (V8.93~95).
//   - EDI 형식: 실수신 EDI(SWDN 2603S) 실측 문법과 바이트 단위 일치 검증(sim_v895) — 카스피(CASP) 호환.
//   - 범위: 평택 선적분만(사용자 확정). 위치는 실체(bay_actual) 우선, 없으면 계획.
//   - 대상: 선적확인(completed)된 컨 우선 — 완료가 하나도 없으면 전체 평택 선적분(경고 표시).
import { isPyeongtaekPort, loadSheetJS, isoToLabel, isPtk, isValidCn } from './utils.js';   // V9.57: 규격·평택분·컨번호 판정 단일 소스

// ── 평택 선적분 컨테이너 조립 (ediContainers + records 병합, 실체 위치 우선) ──
export function collectActualLoading(voyage) {
  const sec = (voyage && voyage.loading) || {};
  const edi = sec.ediContainers || {};
  const recs = sec.records || {};
  const completed = sec.completed || {};
  const byCn = {};
  const put = (cn, src, fromList) => {
    if (!cn || cn.startsWith('__')) return;            // __BOOK/__SLOT 자리표시는 제외
    const cnu = String(cn).replace(/\s/g, '').toUpperCase();
    if (!byCn[cnu]) byCn[cnu] = { cn: cnu };
    const t = byCn[cnu];
    for (const [k, v] of Object.entries(src || {})) {
      if (v === '' || v == null) continue;
      if (t[k] === undefined || t[k] === '' || t[k] == null) t[k] = v;
    }
    if (fromList) t._inList = true;
  };
  for (const [cn, c] of Object.entries(edi)) put(cn, c, false);
  for (const [cn, r] of Object.entries(recs)) put(cn, r, true);

  const all = Object.values(byCn).filter(c => isPtk(c, 'loading'));   // 평택 선적분(리스트=평택 원칙) — V9.57: isPtk 단일 소스
  const doneKeys = new Set(Object.keys(completed).map(k => String(k).replace(/\s/g, '').toUpperCase()));
  const done = all.filter(c => doneKeys.has(c.cn));
  const useDoneOnly = done.length > 0;
  const rows = (useDoneOnly ? done : all).map(c => {
    const bay = String(c.bay_actual && c.bay_actual !== '__STG__' ? c.bay_actual : (c.bay || '')).trim();
    const row = String(c.bay_actual && c.bay_actual !== '__STG__' ? (c.row_actual || '') : (c.row || '')).trim();
    const tier = String(c.bay_actual && c.bay_actual !== '__STG__' ? (c.tier_actual || '') : (c.tier || '')).trim();
    return {
      cn: c.cn,
      iso: (c.iso_orig_parsed || c.iso || '').toUpperCase(),   // 파서가 엠티 정규화한 경우 원본 ISO 우선 (왕복 보존)
      fe: c.fe === 'E' ? 'E' : 'F',
      op: (c.op || '').toUpperCase(), pol: 'KRPTK', pod: (c.pod || '').toUpperCase(),
      npod: (c.npod || '').toUpperCase(), fpod: (c.fpod || '').toUpperCase(),
      tspot: (c.tspot || '').toUpperCase(),                    // 환적항 (수신 EDI의 LOC+83 — 파서 보존값)
      meaVgm: c.wtt ? c.wtt === 'VGM' : undefined,             // 수신 EDI의 MEA 종류 보존 (없으면 규칙으로 판정)
      bay, row, tier,
      wt: Number(c.wt) || 0, sl: c.sl || '', tmp: c.rf || c.tmp ? String(c.tmp ?? '') : '',
      dgc: c.dgc || '', un: c.un || '',
    };
  }).sort((a, b) => (a.bay + a.row + a.tier).localeCompare(b.bay + b.row + b.tier) || a.cn.localeCompare(b.cn));
  return { rows, useDoneOnly, totalPtk: all.length, doneCount: done.length };
}

// ── 컨테이너 타입 정규화 — 구형 숫자 ISO('2200'/'4530'/'9500'/'450E')·신형 ISO('45G1'/'22R1')·
//    문자형 타입 문자열('20DC'/'40HC'/'40RH'/'20BK'…) 모두 {len, kind, high}로 통일 (V8.95).
export function normalizeCntrType(iso) {
  const s = String(iso || '').toUpperCase().trim();
  // 문자형 타입 라벨 (리스트 유래): 20DC/40HC/40RH/20BK… — 앞 두 자리가 피트 길이.
  //   단 '45GP'·'45RE'·'45RF'는 라벨이 아니라 ISO식(4=40피트·5=9'6) — 이 앱 관례상 진짜 45피트 라벨은 45HC/45DC뿐.
  const m = s.match(/^(20|40)['\s]?(DC|GP|HC|HQ|RF|RH|OT|OP|FR|FL|TK|BK)$/) || s.match(/^(45)['\s]?(DC|HC)$/);
  if (m) {
    const len = m[1];
    const k = m[2];
    const kind = (k === 'RF' || k === 'RH') ? 'RF'
      : (k === 'OT' || k === 'OP') ? 'OT' : (k === 'FR' || k === 'FL') ? 'FR'
      : k === 'TK' ? 'TK' : k === 'BK' ? 'BK' : 'GP';
    const high = k === 'HC' || k === 'HQ' || k === 'RH' || len === '45';
    return { len, kind, high };
  }
  const c1 = s[0] || '', c2 = s[1] || '', c3 = s[2] || '';
  const len = c1 === '2' ? '20' : c1 === '4' ? '40' : (c1 === '9' || c1 === 'L' || c1 === 'M') ? '45' : '20';
  const high = c2 === '4' || c2 === '5' || c2 === '6' || c2 === 'E' || c2 === 'F';
  if (/^\d/.test(c3) || c3 === '') {
    // 구형 숫자 ISO: 3번째 숫자 = 종류 (0·1=GP, 2=벌크, 3·4=리퍼, 5=오픈탑, 6=플랫, 7=탱크)
    // V9.57: 8·9를 GP로 처리해 4582(40RF)→GP, 4583(FR)→GP, 4590(OT)→GP가 되던 결함 —
    //   규격 라벨 단일 소스 isoToLabel이 특수 종류를 확정하면 그것을 따르고(4582→40RF·4583→40FR·
    //   4590→40OT·9530→라벨은 45HC지만 숫자 규칙 '3'=RF로 왕복 보존), 라벨이 일반(DC/HC)인 코드만
    //   구형 숫자 규칙으로 판정한다 (라벨이 모르는 2270=탱크 등은 숫자 규칙이 살린다 — numericIso 왕복 유지).
    const lbl = String(isoToLabel(s) || '');
    const lk = lbl.endsWith('RF') ? 'RF' : lbl.endsWith('FR') ? 'FR'
      : lbl.endsWith('OT') ? 'OT' : lbl.endsWith('TK') ? 'TK' : '';
    const kind = lk || ((c3 === '3' || c3 === '4') ? 'RF' : c3 === '2' ? 'BK'
      : c3 === '5' ? 'OT' : c3 === '6' ? 'FR' : c3 === '7' ? 'TK' : 'GP');
    return { len, kind, high };
  }
  // 신형 ISO: 3번째 문자 (G=GP, R·H=리퍼, U=오픈탑, P=플랫, T=탱크, B=벌크)
  const kind = (c3 === 'R' || c3 === 'H') ? 'RF' : c3 === 'U' ? 'OT'
    : c3 === 'P' ? 'FR' : c3 === 'T' ? 'TK' : c3 === 'B' ? 'BK' : 'GP';
  return { len, kind, high };
}

// EDI(EQD)용 구형 숫자 ISO 4자리 — 카스피계 수신 EDI 실측값(2200/2230/2270/4300/4500/4530/9500)에 맞춤.
//   타입을 알 수 없으면 2200(20DC) 기본값 (2026-07-13 결정).
export function numericIso(iso) {
  const s = String(iso || '').toUpperCase().trim();
  if (/^\d{4}$/.test(s)) return s;                                   // 이미 구형 숫자
  if (/^\d{3}E$/.test(s)) return s.slice(0, 3) + '0';                // 엠티 정규화('450E') 복원
  if (!s) return '2200';
  const t = normalizeCntrType(s);
  if (t.len === '45') return t.kind === 'RF' ? '9530' : '9500';
  if (t.len === '40') {
    if (t.kind === 'RF') return '4530';
    if (t.kind === 'TK') return '4370';
    return t.high ? '4500' : '4300';
  }
  if (t.kind === 'RF') return '2230';
  if (t.kind === 'TK') return '2270';
  if (t.kind === 'BK') return '2220';
  return '2200';
}

// EDI(EQD)용 ISO — 이미 ISO꼴(4자리 숫자·문자)은 그대로, 문자 라벨('20DC'/'40HC'…)과 빈 값만
//   수신 선적 EDI(LOAD FILE) 실측 문자쌍(22GP/45GP/45RE/22RE)으로 변환. 엠티 정규화('450E')는 복원.
export function ediIso(iso) {
  const s = String(iso || '').toUpperCase().trim();
  if (!s) return '22GP';                                             // 타입 미상 기본값(20DC 상당, 2026-07-13 결정)
  if (/^\d{3}E$/.test(s)) return s.slice(0, 3) + '0';                // '450E' → '4500'
  const label = s.match(/^(20|40)['\s]?(DC|GP|HC|HQ|RF|RH|OT|OP|FR|FL|TK|BK)$/) || s.match(/^(45)['\s]?(DC|HC)$/);
  if (!label) return s;                                              // '45G1'·'22GP'·'4530' 등 ISO꼴은 그대로 (카스피 판독 실증)
  const t = normalizeCntrType(s);
  const len = t.len === '20' ? '22' : t.len === '45' ? 'L5' : (t.high ? '45' : '42');
  const kind = t.kind === 'RF' ? 'RE' : t.kind === 'OT' ? 'UT' : t.kind === 'FR' ? 'PL'
    : t.kind === 'TK' ? 'TK' : t.kind === 'BK' ? 'BU' : 'GP';
  return len + kind;
}

// ── 실선적 BAPLIE 생성 — 수신 "선적 EDI(LOAD EDI FILE)" 실측 문법 (V8.96 전면 교체) ──
//   근거: KSKM-2610S·XTPG-0522W LOAD EDI FILE (PCTC 발신, 카스피가 선적분으로 판독하는 실파일).
//   머리 = DTM+137(작성):201 → LOC+5+KRPTK → DTM+132(입항)·DTM+133(출항) → RFF+VON.
//   컨 블록 = LOC147 → MEA(평택 만재분은 VGM, 그 외 WT) → TMP(정수 3자리) → LOC9/11/83(:139:6)
//   → RFF+BM → EQD(컨번호 4+7 사이 공백, ISO꼴 유지) → NAD → DGS. CRLF.
export function buildActualBaplie(rows, meta = {}) {
  const now = new Date();
  const p = (n, w) => String(n).padStart(w, '0');
  const yymmddhhmm = p(now.getFullYear() % 100, 2) + p(now.getMonth() + 1, 2) + p(now.getDate(), 2)
    + p(now.getHours(), 2) + p(now.getMinutes(), 2);
  const ref = String(meta.ref != null ? meta.ref : Date.now());
  const bgmRef = String(meta.bgmRef != null ? meta.bgmRef : ref);
  const sender = (meta.sender || 'GMT').toUpperCase();
  const rcpt = (meta.rcpt || 'CASP').toUpperCase();
  const voy = (meta.voy || '').toUpperCase();
  const vslName = (meta.vslFull || meta.vsl || '').toUpperCase();
  const callsign = (meta.callsign || meta.imo || meta.vsl || 'UNKNOWN').toUpperCase();
  const carrier = (meta.carrier || (rows[0] && rows[0].op) || 'XXX').toUpperCase();
  const pol = (meta.pol || 'KRPTK').toUpperCase();
  const dtm137 = meta.dtm137 || yymmddhhmm;
  const eta = meta.eta || yymmddhhmm;
  const etd = meta.etd || yymmddhhmm;

  const segs = [];
  segs.push(`UNB+UNOA:2+${sender}+${rcpt}+${dtm137.slice(0, 6)}:${dtm137.slice(6)}+${ref}+++++`);
  segs.push('UNH+1+BAPLIE:D:95B:UN:SMDG22');
  segs.push(`BGM++${bgmRef}+9`);
  segs.push(`DTM+137:${dtm137}:201`);
  segs.push(`TDT+20+${voy}+++${carrier}:172:20+++${callsign}:103:11:${vslName}`);
  segs.push(`LOC+5+${pol}:139:6`);
  segs.push(`DTM+132:${eta}:201`);
  segs.push(`DTM+133:${etd}:201`);
  segs.push(`RFF+VON:${voy}`);
  for (const r of rows) {
    const bay3 = p(String(parseInt(r.bay, 10) || 0), 3);
    const row2 = p(String(parseInt(r.row, 10) || 0), 2);
    const tier2 = p(String(parseInt(r.tier, 10) || 0), 2);
    segs.push(`LOC+147+${bay3}${row2}${tier2}::5`);
    const rpol = (r.pol || pol).toUpperCase();
    const wtKg = Math.max(0, Math.round(Number(r.wt) || 0));
    const vgm = r.meaVgm !== undefined ? !!r.meaVgm : (rpol === pol && r.fe !== 'E' && wtKg > 0);
    segs.push(`MEA+${vgm ? 'VGM' : 'WT'}++KGM:${wtKg}`);
    if (r.tmp !== '' && r.tmp != null && String(r.tmp).trim() !== '') {
      const tv = Math.round(parseFloat(r.tmp) || 0);
      segs.push(`TMP+2+${tv < 0 ? '-' : ''}${p(Math.abs(tv), 3)}:CEL`);   // 실측: 025 / -018
    }
    if (Array.isArray(r.dims)) for (const d of r.dims) segs.push(d);
    segs.push(`LOC+9+${rpol}:139:6`);
    if (r.pod) segs.push(`LOC+11+${r.pod}:139:6`);
    if (r.npod) segs.push(`LOC+76+${r.npod}:139:6`);
    const l83 = r.tspot || r.fpod;                             // 앱 파서는 LOC+83을 tspot(환적항)에 저장
    if (l83) segs.push(`LOC+83+${l83}:139:6`);
    segs.push(r.rff || 'RFF+BM:1');
    const cnTxt = isValidCn(r.cn) ? r.cn.slice(0, 4) + ' ' + r.cn.slice(4) : r.cn;   // 실측: 'KMTU 9321484' — V9.57: 단일 소스
    segs.push(`EQD+CN+${cnTxt}+${ediIso(r.iso)}+++${r.fe === 'E' ? '4' : '5'}`);
    segs.push(`NAD+CA+${(r.op || carrier).toUpperCase()}:172:20`);
    const dgs = Array.isArray(r.dgs) && r.dgs.length ? r.dgs : (r.dgc || r.un ? [{ dgc: r.dgc, un: r.un }] : []);
    for (const d of dgs) segs.push(`DGS+IMD+${d.dgc || ''}+${d.un || ''}`);
  }
  const untCount = segs.length - 1 + 1;              // UNH부터 UNT 자신까지 (UNB 제외)
  segs.push(`UNT+${untCount}+1`);
  segs.push(`UNZ+1+${ref}`);
  return segs.join("'") + "'";                       // 실측 LOAD EDI FILE: 줄바꿈 없이 아포스트로피 연속, 끝 개행 없음
}

// ── 카스피 ASC($604) 타입코드 — normalizeCntrType 기반 (선적 ASC는 길이-종류 순: 40HC/20DC/40RH/20RF/45DC/20BK…) ──
export function ascTypeCode(iso) {
  const t = normalizeCntrType(iso);
  if (t.kind === 'GP') return t.len + (t.len === '45' ? 'DC' : (t.high ? 'HC' : 'DC'));   // 45피트는 카스피 표기상 45DC
  if (t.kind === 'RF') return t.len + (t.high ? 'RH' : 'RF');
  return t.len + t.kind;
}

// ── 카스피 ASC($604) 생성 — 업로드 샘플 TNJP26349W.ASC(카스피 산출물)와 바이트 단위 동일 형식 ──
//   고정폭 198자 + CRLF. 컬럼: 위치6 / 컨번호11(7) / 선사LINE3(19) / POL3+POD3(27) / 타입4+중량백kg3+FE(44)
//   / 온도(56, 값×10+'C') / 위험물참조4(60) / 중량kg5(87) / POL5+POD5(188). 하단 IMDG 목록.
//   V8.95: 19열은 POD가 아니라 선사 코드(실측 SWDN2603S: HSL·NSL — TNJP는 선사 LYG=POD LYG 우연 일치였음).
export function buildActualAsc(rows, meta = {}) {
  const W = 198;
  const num = (v, n) => String(Math.max(0, Math.round(Number(v) || 0))).padStart(n, '0');
  const line = (fields) => {
    const buf = new Array(W).fill(' ');
    for (const [at, text] of fields) {
      const t = String(text ?? '');
      for (let i = 0; i < t.length && at + i < W; i++) buf[at + i] = t[i];
    }
    return buf.join('');
  };
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const yymmdd = p2(now.getFullYear() % 100) + p2(now.getMonth() + 1) + p2(now.getDate());
  const shipCode = String(meta.shipCode || meta.vsl || 'XXXX').toUpperCase().slice(0, 4).padEnd(4, ' ');
  const vslName = String(meta.vslFull || meta.vsl || '').toUpperCase().slice(0, 20);
  const voy = String(meta.voy || '').toUpperCase().slice(0, 12);
  const pol5 = 'KRPTK', pol3 = 'PTK';

  const out = [];
  out.push(line([[0, '$604' + shipCode], [8, '/'], [9, vslName], [29, '/'], [30, voy], [42, '/'],
                 [55, '/POL:' + pol3], [63, '/'], [64, yymmdd], [72, '/RECORD=' + num(rows.length, 4)], [84, '/']]));
  out.push(line([[0, '$609PORT ROTATION/']]));

  const dgList = [];
  for (const r of rows) {
    const pos = num(r.bay, 2) + num(r.row, 2) + num(r.tier, 2);
    const pod5 = String(r.pod || '').toUpperCase();
    const pod3 = pod5.slice(-3);
    // 백kg 자리: 카스피 실측(샘플 대조)은 .5에서 짝수 쪽 반올림(banker's) — 5650→056, 12450→124, 4155→042
    const wtKg = Math.max(0, Math.round(Number(r.wt) || 0));
    const rem = wtKg % 100;
    const w100 = num(Math.floor(wtKg / 100) + (rem > 50 || (rem === 50 && Math.floor(wtKg / 100) % 2 === 1) ? 1 : 0), 3);
    const fe = r.fe === 'E' ? 'E' : 'F';
    let dgRef = '';
    const dgs = Array.isArray(r.dgs) && r.dgs.length ? r.dgs : (r.dgc || r.un ? [{ dgc: r.dgc, un: r.un }] : []);
    if (dgs.length) { dgList.push(dgs); dgRef = num(dgList.length, 4); }
    const hasTmp = r.tmp !== '' && r.tmp != null && String(r.tmp).trim() !== '';
    const tmpTxt = hasTmp ? String(Math.round(parseFloat(r.tmp) * 10)) + 'C' : '';
    const op3 = String(r.op || '').toUpperCase().slice(0, 3);
    out.push(line([[0, pos], [7, r.cn], [19, op3], [27, pol3 + pod3], [44, ascTypeCode(r.iso) + w100 + fe],
                   [56, tmpTxt], [60, dgRef], [87, num(r.wt, 5)], [188, pol5 + pod5]]));
  }
  out.push(line([[0, '***Refer to the following remark.']]));
  out.push(line([[0, '***Refer to the following IMDG.']]));
  dgList.forEach((dgs, i) => {
    // 실측(SWDN2603S): 참조4 + 순번2 + 주클래스1 + 보조숫자1(없으면 공백) + UN4 + '00000'
    //   예: 3→'003 3272', 6.1→'00612810', 4.1→'00411325' — 한 컨에 여러 위험물이면 순번 00,01,02…
    dgs.forEach((d, j) => {
      const [major, sub] = String(d.dgc || '0').split('.');
      const un = String(d.un || '').padStart(4, '0');
      out.push(line([[0, num(i + 1, 4) + num(j, 2) + (major || '0').slice(-1) + (sub ? sub[0] : ' ') + un + '00000']]));
    });
  });
  out.push(line([[0, '***Refer to the following VGM remark.']]));
  return out.join('\r\n') + '\r\n';
}

// ── 수정용 엑셀 (왕복 규격 — 헤더 고정) ──
const EXCEL_HEADERS = ['NO', 'CNTR NO', 'ISO', 'F/E', 'LINE', 'POL', 'POD', 'BAY', 'ROW', 'TIER', 'WEIGHT(KG)', 'SEAL', 'TEMP', 'DG CLASS', 'UN NO'];

export async function buildEditExcel(rows, meta = {}) {
  const XLSX = await loadSheetJS();
  const aoa = [EXCEL_HEADERS].concat(rows.map((r, i) => [
    i + 1, r.cn, r.iso, r.fe, r.op, r.pol, r.pod,
    r.bay, r.row, r.tier, r.wt || '', r.sl, r.tmp, r.dgc, r.un,
  ]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 4 }, { wch: 13 }, { wch: 6 }, { wch: 4 }, { wch: 5 }, { wch: 7 }, { wch: 7 },
                 { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 11 }, { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ACTUAL_LOADING');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export async function parseEditExcel(arrayBuffer) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    const hi = aoa.findIndex(r => (r || []).some(c => String(c).trim().toUpperCase() === 'CNTR NO'));
    if (hi < 0) continue;
    const header = aoa[hi].map(c => String(c).trim().toUpperCase());
    const col = (label) => header.indexOf(label);
    const iCn = col('CNTR NO'), iIso = col('ISO'), iFe = col('F/E'), iOp = col('LINE'),
          iPod = col('POD'), iBay = col('BAY'), iRow = col('ROW'), iTier = col('TIER'),
          iWt = col('WEIGHT(KG)'), iSl = col('SEAL'), iTmp = col('TEMP'), iDg = col('DG CLASS'), iUn = col('UN NO');
    const rows = [];
    const errors = [];
    for (let r = hi + 1; r < aoa.length; r++) {
      const line = aoa[r] || [];
      const cn = String(line[iCn] || '').replace(/\s/g, '').toUpperCase();
      if (!cn) continue;
      if (!isValidCn(cn)) errors.push(`${r + 1}행 컨번호 형식 이상: ${cn}`);   // V9.57: 단일 소스
      rows.push({
        cn, iso: String(line[iIso] || '').toUpperCase(),
        fe: String(line[iFe] || 'F').toUpperCase() === 'E' ? 'E' : 'F',
        op: String(line[iOp] || '').toUpperCase(), pol: 'KRPTK',
        pod: String(line[iPod] || '').toUpperCase(),
        bay: String(line[iBay] || '').trim(), row: String(line[iRow] || '').trim(), tier: String(line[iTier] || '').trim(),
        wt: Number(String(line[iWt] || '').replace(/[, ]/g, '')) || 0,
        sl: String(line[iSl] || '').trim(), tmp: String(line[iTmp] || '').trim(),
        dgc: String(line[iDg] || '').trim(), un: String(line[iUn] || '').trim(),
      });
    }
    return { rows, errors };
  }
  return { rows: [], errors: ["'CNTR NO' 헤더를 찾지 못했습니다 — 수정용 엑셀의 헤더 줄을 그대로 두세요."] };
}
