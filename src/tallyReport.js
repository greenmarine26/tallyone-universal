// 마감 텔리(DEP.TALLY REPORT) 집계 엔진 — V9.19 (2026-07-28)
//   실물 텔리 233개 분석 기반. 실데이터 시뮬로 검증:
//   DJCT 0221W 선적 216대·ATPR 2634E 양하 251대 — 실제 텔리 매트릭스와 완전 일치.
//   순수 계산만(파이어베이스 접근 없음) — 시뮬 가능. 렌더는 tallyExcel.js.
import { isoToLabel, isPyeongtaekPort, computeShiftingMapCached } from './utils.js';
import { getTallyFormat, orderIndex } from './data/tallyFormats.js';
import { bayGroupCenter } from './swapGrade.js';   // 1.8-16: 해치 그룹 판정 단일 소스
import { getBayPairs } from './twin.js';

export const SIZE_COLS = ['20', '40', 'HC', '45'];

/** 텔리 규격 4분류 — 20' / 40' / HC(하이큐브·HC리퍼 포함) / 45' (실측 검증 규칙) */
export function tallySizeCol(c) {
  const iso = String(c.iso || '').toUpperCase().trim();
  const l = isoToLabel(iso) || '';
  if (l.startsWith('45') || /^L/.test(iso) || /^9[05]\d\d$/.test(iso)) return '45';
  if (/^4[5-9]/.test(iso)) return 'HC';
  if (/^4/.test(iso)) return '40';
  return '20';
}

/** 5자리 UN/LOCODE → 텔리 3자 포트 표기 (KRPTK→PTK, VNHPH→HPH) */
export function port3(code) {
  const s = String(code || '').toUpperCase().trim();
  return s.length >= 5 ? s.slice(2, 5) : s;
}

const sect = (v, m) => (v && v[m]) || {};
const vals = (o) => Object.values(o || {});

/** 모드별 평택분 컨 목록 (EDI 기준 + 리스트 병합은 호출부 책임 아님 — EDI가 집계의 진실) */
// V9.57(G6): 선적 평택 판정에 _inList(리스트 등록=평택) 반영 — 화면(BayPlan·카고플랜·별첨)과 동일 규칙.
//   엠티 선적 리스트는 pol이 비거나 목적지로 오염되는데, 종전엔 그 컨들이 마감 텔리에서 통째로 빠졌다.
//   TODO: utils.isPtk(c, mode)가 export되면(팀F 추가 중) 이 인라인을 임포트로 교체.
export function ptkContainers(voyage, mode) {
  const edi = vals(sect(voyage, mode).ediContainers);
  const recs = sect(voyage, mode).records || {};
  // TallyOne 1.8: **필드 보강** — records(양하/선적 리스트 + 검수원 입력)의 값을 EDI 컨에 덮는다.
  //   왜: BAPLIE에는 실번호도 리퍼 온도도 없다. 그 둘은 리스트에서 오고 records 에 있다.
  //   화면(VoyagePage 271~/624행)은 진작부터 병합해서 보여 주는데 텔리만 ediContainers 만 읽어서,
  //   RF condition report 의 SEAL NO·Setting 이 **상시 공란**이었다(TNJP 26355E 실측 2026-08-04).
  //   Lug 키 사고(1.3-02)와 같은 계열 — 화면과 텔리가 서로 다른 소스를 보던 문제다.
  //   ⚠ 컨을 **추가하지 않는다**. 필드만 채운다 — 추가하면 Final Work·OS·PORTPERFORMANCE
  //     집계가 통째로 흔들린다. 여기 목적은 빈칸 채우기지 대수 변경이 아니다.
  const merged = edi.map((c) => {
    const r = recs[c.cn];
    if (!r) return c;
    const out = { ...c };
    // 실번호: EDI가 비었거나, EDI 값이 records 값의 앞부분인 잘린 값이면 records 우선(M8.07과 같은 규칙).
    const es = String(c.sl || ''); const rs = String(r.sl || '');
    if (rs && (!es || (rs.length > es.length && rs.startsWith(es)))) out.sl = rs;
    // 리퍼 온도: EDI에 없으면 리스트 값으로.
    if ((c.tmp == null || String(c.tmp).trim() === '') && r.tmp != null && String(r.tmp).trim() !== '') out.tmp = r.tmp;
    // TallyOne 1.8: 리퍼 메모에서 검수원이 확인·수정한 값 — 있으면 그대로 들고 간다.
    if (r.rfSet != null && String(r.rfSet).trim() !== '') out.rfSet = r.rfSet;
    if (r.rfAct != null && String(r.rfAct).trim() !== '') out.rfAct = r.rfAct;
    // 1.8-04: 리퍼드라이·제작컨 표시는 records 에만 있다(수집기 패치·검수원 입력). 텔리가
    //   RF 목록에서 이 둘을 빼려면 여기서 들고 가야 한다 — 안 그러면 EDI에 없어 항상 false 다.
    if (r.rfdry === true) out.rfdry = true;
    if (r.mkcon === true) out.mkcon = true;
    return out;
  });
  return merged.filter(c => mode === 'discharge' ? isPyeongtaekPort(c.pod) : (c._inList || isPyeongtaekPort(c.pol)));
}

/** Final Work 매트릭스: {op: {port: {F|E: {20,40,HC,45}}}} — 양하=POL별, 선적=POD별 */
export function buildMatrix(containers, mode) {
  const mat = {};
  for (const c of containers) {
    const op = String(c.op || '').toUpperCase().trim() || '???';
    const port = port3(mode === 'discharge' ? c.pol : c.pod) || '???';
    const fe = c.fe === 'E' ? 'E' : 'F';
    const sz = tallySizeCol(c);
    ((((mat[op] ??= {})[port] ??= {})[fe] ??= {}))[sz] = ((mat[op][port][fe] || {})[sz] || 0) + 1;
  }
  return mat;
}

/** 매트릭스 → 사전 순서대로 행 배열 [{op, port, fe, sizes:{}}]. 사전에 없는 op/port는 뒤에. */
export function matrixRows(matDis, matLoad, matShift, fmt) {
  const ops = new Set([...Object.keys(matDis), ...Object.keys(matLoad), ...Object.keys(matShift)]);
  const opList = [...ops].sort((a, b) => orderIndex(fmt.ops, a) - orderIndex(fmt.ops, b) || a.localeCompare(b));
  const rows = [];
  for (const op of opList) {
    const ports = new Set([
      ...Object.keys(matDis[op] || {}), ...Object.keys(matLoad[op] || {}), ...Object.keys(matShift[op] || {})]);
    const portList = [...ports].sort((a, b) => orderIndex(fmt.ports, a) - orderIndex(fmt.ports, b) || a.localeCompare(b));
    for (const port of portList) {
      for (const fe of ['F', 'E']) {
        rows.push({
          op, port, fe,
          dis: (matDis[op]?.[port]?.[fe]) || {},
          load: (matLoad[op]?.[port]?.[fe]) || {},
          shift: (matShift[op]?.[port]?.[fe]) || {},
        });
      }
    }
  }
  return rows;
}

function sumMat(mat, fe) {
  const t = { 20: 0, 40: 0, HC: 0, 45: 0 };
  for (const ports of Object.values(mat))
    for (const fes of Object.values(ports))
      for (const sz of SIZE_COLS) t[sz] += (fes[fe] || {})[sz] || 0;
  return t;
}
const matTotal = (mat) => SIZE_COLS.reduce((a, s) => a + sumMat(mat, 'F')[s] + sumMat(mat, 'E')[s], 0);

/** OS(과부족) 시트 데이터 — 포트×규격×F/E: manifested vs worked + 누락/초과 */
export function buildOS(containers, compMap, mode, fmt) {
  const g = {};
  let extra = 0;
  for (const c of containers) {
    const port = port3(mode === 'discharge' ? c.pol : c.pod) || '???';
    const sz = tallySizeCol(c);
    const szLbl = sz === '20' ? "20'" : sz === '45' ? "45'" : sz === '40' ? "40'" : 'HC';
    const fe = c.fe === 'E' ? 'EMPTY' : 'FULL';
    const k = `${port}|${szLbl}|${fe}`;
    g[k] ??= { port, size: szLbl, fe, manifested: 0, worked: 0, short: 0, rf: 0, rh: 0, dg: 0 };
    g[k].manifested++;
    const comp = compMap ? compMap[c.cn] : null;
    const missing = comp && comp.flag === 'missing';
    if (comp && !missing) g[k].worked++;
    if (missing) g[k].short++;
    const iso = String(c.iso || '').toUpperCase();
    const isRf = c.rf || iso[2] === 'R' || /^45[38]/.test(iso);
    if (isRf) (sz === 'HC' || sz === '45' ? g[k].rh++ : g[k].rf++);
    if (c.dg) g[k].dg++;
  }
  for (const comp of vals(compMap || {})) if (comp && comp.flag === 'extra') extra++;
  const rows = Object.values(g).sort((a, b) =>
    orderIndex(fmt.ports, a.port) - orderIndex(fmt.ports, b.port) ||
    a.size.localeCompare(b.size) || (a.fe === 'FULL' ? -1 : 1));
  // 선사별 규격 요약(REMARKS 줄) — "SKR : 20'F x 11 , 40'F x 58 ( RH x 2 )"
  const byOp = {};
  for (const c of containers) {
    const op = String(c.op || '').toUpperCase().trim() || '???';
    const sz = tallySizeCol(c);
    const fe = c.fe === 'E' ? 'E' : 'F';
    byOp[op] ??= {};
    const k = `${sz === '20' ? "20'" : sz === '45' ? "45'" : "40'"}${fe}`;
    byOp[op][k] = (byOp[op][k] || 0) + 1;
    const iso = String(c.iso || '').toUpperCase();
    if (c.rf || iso[2] === 'R' || /^45[38]/.test(iso)) byOp[op]._rh = (byOp[op]._rh || 0) + 1;
    if (c.dg) byOp[op]._dg = (byOp[op]._dg || 0) + 1;
  }
  const remarks = Object.entries(byOp)
    .sort((a, b) => orderIndex(fmt.ops, a[0]) - orderIndex(fmt.ops, b[0]))
    .map(([op, o]) => {
      const parts = Object.entries(o).filter(([k]) => !k.startsWith('_'))
        .map(([k, n]) => `${k} x ${n}`);
      const tags = [];
      if (o._rh) tags.push(`RH x ${o._rh}`);
      if (o._dg) tags.push(`DG x ${o._dg}`);
      return `${op} : ${parts.join(' , ')}${tags.length ? ` ( ${tags.join(' , ')} )` : ''}`;
    });
  return { rows, extra, remarks };
}

/** Act. Cntr-Seal(실번호 상이) — sl_orig ≠ sl 또는 리씰 */
export function buildSealList(voyage, mode) {
  const recs = vals(sect(voyage, mode).records);
  const out = [];
  for (const r of recs) {
    const orig = String(r.sl_orig || '').trim();
    const act = String(r.sl || '').trim();
    const reseal = String(r.reseal || '').trim();
    if ((orig && act && orig !== act) || reseal) {
      out.push({
        cn: r.cn, manifestSeal: orig || act, size: tallySizeCol(r) === '20' ? "20'" : "40'",
        actualSeal: (orig && act && orig !== act) ? act : '',
        reseal, remarks: String(r.op || '').toUpperCase(),
        fe: r.fe === 'E' ? 'EMPTY' : 'FULL',
      });
    }
  }
  return out;
}

/** RF condition — 리퍼 목록.
 *  TallyOne 1.8: Setting/Actual 을 나눈다.
 *    setting = 검수원이 리퍼 메모에서 확인한 실제 셋팅온도(rfSet). 없으면 EDI·리스트 온도(tmp).
 *    actual  = 실제 측정 온도(rfAct). 확인 전에는 **빈칸으로 둔다** — tmp로 채우면
 *              재보지도 않은 값이 '실측'으로 서류에 박힌다.
 */
export function buildRF(containers) {
  const t = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
  return containers
    // TallyOne 1.8-04: 리퍼드라이(넌플러그)·제작컨은 **온도를 잴 수 없다**. 종전엔 이 둘이 그대로
    //   RF condition report 에 실려 Setting·Actual 이 영영 빈칸으로 남았다(서류 오류).
    //   지침서 5-5 "리퍼드라이=넌플러그, 제작컨=컨 자체가 상품 — 온도 경고 제외"와 같은 기준으로 맞춘다.
    //   리퍼 메모 화면·상단 버튼·출항 임박 경고도 전부 이 식이다(네 곳 일치, 시뮬 검증).
    .filter(c => !c.rfdry && !c.mkcon)
    .filter(c => c.rf || String(c.iso || '').toUpperCase()[2] === 'R' || /^45[38]/.test(String(c.iso || '')))
    .map(c => ({
      cn: c.cn, seal: c.sl || '', size: tallySizeCol(c) === '20' ? "20'RF" : "40'RH",
      loc: [c.bay, c.row, c.tier].filter(Boolean).join('/'),
      setting: t(c.rfSet) || t(c.tmp),
      actual: t(c.rfAct),
      op: String(c.op || '').toUpperCase(),
      fe: c.fe === 'E' ? 'E' : 'F',
      dg: !!c.dg,   // V9.21: 페리 RF REMARKS(DG) 표기용
    }));
}

/** V9.21: 페리(여객선) 집계 — 규격군(20 vs 40/HC/45) × F/E × 수화물(Lug) × 주간/야간.
 *  주야 분해: 완료 시각(completed[cn].at) 기준 07~17시=주간, 그 외=야간. 미완료는 총계에만.
 *  Lug: voyage.info.forecast(수화물 예보, V9.03)의 luggageCns 목록 — 모드 일치 시에만.
 *  TallyOne 1.4: 읽는 키를 fc.lugg -> fc.luggageCns 로 교정. 저장 경로(HomePage.jsx fbUpdateVoyageInfo)는
 *    처음부터 luggageCns 로 저장했고, lugg 를 저장하는 코드는 저장소 어디에도 없었다. 그래서 Lug 4행 x IN/OUT
 *    8칸과 PORTPERFORMANCE flug/elug 열이 상시 공란이었다. 구 데이터 호환을 위해 lugg 도 폴백으로 읽는다.
 *    (실물 대조: OBWH 2692W 20ft Empty 41->40, 20ft Empty(Lug) 0->1) */
export function buildFerry(voyage, disCs, loadCs) {
  const fc = voyage?.info?.forecast || null;
  const luggSet = new Set();
  const luggList = fc && (Array.isArray(fc.luggageCns) ? fc.luggageCns
    : (Array.isArray(fc.lugg) ? fc.lugg : null));
  if (luggList) for (const cn of luggList) luggSet.add(String(cn).toUpperCase());
  const zone = (voyage, mode, cs) => {
    const comp = sect(voyage, mode).completed || {};
    const recs = sect(voyage, mode).records || {};
    const mk = () => ({ total: 0, day: 0, night: 0 });
    const z = { f20: mk(), e20: mk(), f20lug: mk(), e20lug: mk(), f40: mk(), e40: mk(), f40lug: mk(), e40lug: mk(),
                pp: { f20: 0, f40: 0, fhc: 0, flug: 0, e20: 0, e40: 0, ehc: 0, elug: 0 }, total: mk(),
                // TallyOne 1.4: OBWH OS 시트는 20'(LUG) 행이 따로 있다(TNJP엔 없음) — LUG 버킷 신설.
                os: { '20F': { n: 0, hc: 0, rh: 0, dg: 0, port: '' }, '20E': { n: 0, hc: 0, rh: 0, dg: 0, port: '' },
                      '40F': { n: 0, hc: 0, rh: 0, dg: 0, port: '' }, '40E': { n: 0, hc: 0, rh: 0, dg: 0, port: '' },
                      '45F': { n: 0, hc: 0, rh: 0, dg: 0, port: '' }, '45E': { n: 0, hc: 0, rh: 0, dg: 0, port: '' },
                      '20LUGF': { n: 0, hc: 0, rh: 0, dg: 0, port: '' }, '20LUGE': { n: 0, hc: 0, rh: 0, dg: 0, port: '' },
                      '40LUGF': { n: 0, hc: 0, rh: 0, dg: 0, port: '' }, '40LUGE': { n: 0, hc: 0, rh: 0, dg: 0, port: '' } } };
    const fcOk = fc && fc.mode === mode;
    // V9.21-04: 일괄 마감 감지 — 완료 시각이 좁은 구간에 뭉치면(30분 내 20대+) 실제 작업시각이 아니다
    //   (26353 실측: 마감 일괄처리로 256대 전부 새벽 01시 → 주0/야256 오분해). 이때 주/야는 수기(빈칸).
    const ats = cs.map((c) => comp[c.cn]?.at || comp[String(c.cn).toUpperCase()]?.at).filter(Boolean);
    let bulkClose = false;
    if (ats.length >= 20) {
      const mn = Math.min(...ats), mx = Math.max(...ats);
      bulkClose = (mx - mn) < 30 * 60 * 1000;
    }
    for (const c of cs) {
      const sz = tallySizeCol(c);
      const g20 = sz === '20';
      const fe = c.fe === 'E' ? 'e' : 'f';
      // TallyOne 1.4: 두 소스 병합 — ① 리스트(CLL) 자동 판별로 컨에 직접 선 플래그 ② 카톡 예보 luggageCns.
      //   리스트가 진실에 가깝지만(선사 원본), 리스트가 없는 항차도 있으므로 OR로 둔다.
      const lug = c.lugg === true || (fcOk && luggSet.has(String(c.cn).toUpperCase()));
      const key = `${fe}${g20 ? '20' : '40'}${lug ? 'lug' : ''}`;
      const e = z[key]; e.total += 1; z.total.total += 1;
      const at = comp[c.cn]?.at || comp[String(c.cn).toUpperCase()]?.at;
      if (at && !bulkClose) {
        const h = new Date(at).getHours();
        const day = h >= 7 && h < 17;
        e[day ? 'day' : 'night'] += 1; z.total[day ? 'day' : 'night'] += 1;
      }
      // PORTPERFORMANCE: 20/40/40HC 분리 (45·HC → 40HC), Lug는 별도 열.
      //   LYG EDI는 40군을 43xx로 통칭 — 40일반/HC 구분은 선사 리스트 ISO가 진실(26353W 실측: 42GE 20대).
      //   43=HC는 연운항 관례일 뿐 전역 아님(DXQD 실물은 4300을 40'로 집계 — V9.21 실측 충돌) → 페리 전용 분류.
      const isoEff = String((recs[c.cn] || recs[String(c.cn).toUpperCase()] || {}).iso || c.iso || '').toUpperCase();
      const pcls = /^2/.test(isoEff) ? '20' : (/^4[3-9]|^L|^9[05]/.test(isoEff) ? 'hc' : '40');
      const pk = lug ? `${fe}lug` : (pcls === '20' ? `${fe}20` : (pcls === '40' ? `${fe}40` : `${fe}hc`));
      z.pp[pk] += 1;
      // OS(페리): 길이 3단(20/40/45 — 4x는 43·45Gx 포함 전부 40', L5/9x만 45') + HC/RH/DG 분해 (수석 실물 규칙)
      const oLen = /^2/.test(isoEff) ? '20' : (/^L|^9[05]/.test(isoEff) ? '45' : '40');
      // TallyOne 1.4: 수화물(Lug)은 전용 행으로 뺀다. LUG 버킷이 없는 규격(45')은 일반 행으로 폴백.
      const oKey = (lug && z.os[`${oLen}LUG${fe.toUpperCase()}`]) ? `${oLen}LUG${fe.toUpperCase()}` : `${oLen}${fe.toUpperCase()}`;
      const oe = z.os[oKey];
      oe.n += 1;
      const isRf = !!(c.rf || String(isoEff)[2] === 'R');
      if (isRf) oe.rh += 1;
      // TallyOne 1.4: 20' 하이큐브(26xx 등 높이코드 5~9)가 어느 분기에도 안 걸려 hc 미집계였다
      //   (2697E 실측: ZXJU0130463 ISO 2600 → 실물 REMARKS ' HC x 1' 인데 재현은 공란).
      //   ^228 = 연태훼리 자사 벌크컨(CLL Tp/Sz=BC20). 같은 박스가 항차에 따라 2600/2280으로 코딩되는데
      //     실물 텔리는 둘 다 HC로 계상한다(ZXJU0130463: 2697E=2600, 2692W=2280 — 실측).
      //   ^2[5-9]가 아니라 ^2[56]으로 좁힌다 — ISO 6346 2번째 자리 8=4'3", 9=<4'는 반높이라 HC가 아니다.
      else if (/^4[3-9]|^L|^9[05]|^2[56]|^228/.test(isoEff)) oe.hc += 1;   // 하이큐브 드라이
      if (c.dg) oe.dg += 1;
      if (!oe.port) oe.port = port3(mode === 'discharge' ? c.pol : c.pod) || '';
    }
    return z;
  };
  return { inb: zone(voyage, 'discharge', disCs), outb: zone(voyage, 'loading', loadCs) };
}

/** Performance — 선사별 IN/OUT × F/E × 규격 */
export function buildPerformance(disCs, loadCs, fmt) {
  const agg = (cs) => {
    const m = {};
    for (const c of cs) {
      const op = String(c.op || '').toUpperCase().trim() || '???';
      const fe = c.fe === 'E' ? 'E' : 'F';
      ((m[op] ??= { F: {}, E: {} })[fe])[tallySizeCol(c)] = (m[op][fe][tallySizeCol(c)] || 0) + 1;
    }
    return m;
  };
  const inb = agg(disCs), outb = agg(loadCs);
  const ops = [...new Set([...Object.keys(inb), ...Object.keys(outb)])]
    .sort((a, b) => orderIndex(fmt.ops, a) - orderIndex(fmt.ops, b) || a.localeCompare(b));
  return { inbound: inb, outbound: outb, ops };
}

/** SHIFTING 행 */
export function buildShifting(voyage) {
  let map = {};
  try { map = computeShiftingMapCached(voyage.key || voyage?.info?.vsl || 'k', voyage) || {}; } catch { /* 계산 실패 시 빈 목록 */ }
  return Object.values(map).map((s, i) => ({
    no: i + 1, cn: s.cn || s.CN || '', type: s.iso ? (tallySizeCol(s) === '20' ? "20'" : "40'") : '',
    fe: s.fe || '', wt: s.wt || '', op: String(s.op || '').toUpperCase(),
    oldPos: s.oldPos || [s.bay, s.row, s.tier].filter(Boolean).join(''),
    newPos: s.newPos || '', pod: port3(s.pod), pol: port3(s.pol),
  }));
}

/** Time Sheet — 작업 보고 이력에서 시각록 구성 */
/**
 * TallyOne 1.8-16: **닫았는데 보고가 없는 커버를 추론해 넣는다.**
 *
 *  검수사 확정 2026-08-05
 *    "기본 선적은 홀드 다 채우고 데크를 채웁니다. 6번 해치를 닫고 14번도 닫았으면
 *     10번은 닫았다는 보고가 없습니다. 그런데 앱상에서 10번 데크 컨테이너가 실렸습니다.
 *     이럴땐 아 10번이 닫혔구나. 그런데 앱은 시간을 모릅니다. 단 6번과 14번 사이라는 것은
 *     예상할 수 있습니다. 그럼 보고서엔 **시간만 빼고 기록**합니다. 수기로 나중에 시간 기록을
 *     할 수 있게" · "그건 찾을 필요가 없습니다. **완료처리 했다는게 중요** 합니다."
 *
 *  즉 데크 적재를 일일이 뒤질 필요가 없다. **그 모드가 완료 처리됐다는 것 자체가 근거다** —
 *  커버를 안 닫으면 데크에 못 싣고, 못 실으면 완료가 안 된다.
 *
 *  ⚠ 시각은 **지어내지 않는다.** 앞뒤 클로즈 사이에 놓아 순서만 맞추고 시각 칸은 비운다.
 *    수석이 나중에 수기로 채운다. `inferred:true` 로 표시해 호출부가 구분할 수 있게 한다.
 *  실증(STMJ 2643E): 오픈된 슬롯 2·6·10·14·18·26 중 클로즈 보고가 없는 것은 10(09&11) 하나.
 *    검수사 확인 — "최검수사의 실수로 서류 정리 때도 보고 누락 이야기가 나왔다".
 */
export function buildTimeSheet(reports, opts = {}) {
  const rows = [];
  const list = vals(reports || {}).filter((r) => r && r.ts).sort((a, b) => a.ts - b.ts);
  const t = (ms) => new Date(ms).toTimeString().slice(0, 5);
  const groupOf = typeof opts.groupOf === 'function' ? opts.groupOf : null;
  const doneModes = new Set(opts.doneModes || []);   // 'discharge' | 'loading'

  // 베이는 두 자리로 맞춘다 — 앱은 `9,11`, 손으로 친 카톡은 `09,10,11` 로 와서
  // 같은 커버가 서로 다르게 찍혔다(검수사 지적 2026-08-05).
  const bayStr = (b) => (Array.isArray(b) ? b : [b]).filter(Boolean)
    .map((x) => String(x).trim().padStart(2, '0')).join(',');
  const modeOf = (r) => {
    const act = String(r.action || '');
    return act.startsWith('discharge') ? 'discharge'
      : act.startsWith('loading') ? 'loading' : (r.mode || '');
  };
  const BLANK = '        HRS';                       // 시각 미상 — 수기로 채운다

  // ── 0) 카톡이 정본 ─────────────────────────────────────────────
  // 검수사 확정 2026-08-05.
  //   해치커버는 카톡 작업방에 손으로 보고한 것이 실제다. 앱은 그걸 **모르는 상태**로
  //   "이 커버를 여세요" 라고 단정했고, 사람은 앱이 시키는 대로 눌렀다. STMJ 2643E 실측 —
  //   자동 모드가 낸 해치 보고 네 건이 전부 오보다.
  //     00:51 `13,14,15` · 00:52 `09,10,11`  이미 22:47·23:15 에 카톡으로 열린 커버
  //     03:05 `14`                            03:01 에 카톡으로 닫은 커버
  //     08:19 `05,06,07` · 08:20 `01,03`      03:17·02:28 에 카톡으로 닫은 커버
  //   검수사: "실제 연시간은 22:47 입니다. 00:51 은 텔리 테스트 하기위해 제가 앱기록을 한것입니다.
  //           그런데 자동으로 테스트를 할려고 하니 14번커버를 안열었다고 열어야 한다는것입니다."
  //
  // 그래서 **카톡 기록이 있는 그룹은 카톡만으로 상태를 정한다.** 그 그룹의 앱 보고는 메아리다.
  //   ⚠ 카톡 기록이 **없는** 그룹은 손대지 않는다 — 앱 보고가 유일한 진실이다(BAY 26·18).
  //   ⚠ 조용히 버리지 않는다 — 몇 줄 뺐는지 `_echo` 로 돌려준다.
  let echoDropped = 0;
  const keep = new Set(list);
  if (groupOf) {
    const kakaoGroups = new Set();
    for (const r of list) {
      if (r.type !== 'hatch' || r._src !== 'kakao') continue;
      for (const g of (r.bays || []).map(groupOf)) if (g != null) kakaoGroups.add(g);
    }
    if (kakaoGroups.size) {
      for (const r of list) {
        if (r.type !== 'hatch' || r._src === 'kakao') continue;
        const gs = (r.bays || []).map(groupOf).filter((g) => g != null);
        if (gs.length && gs.every((g) => kakaoGroups.has(g))) { keep.delete(r); echoDropped += 1; }
      }
    }
  }

  // ── 1) 중복 접기 ───────────────────────────────────────────────
  // 같은 보고가 앱에서 한 번, 손으로 친 카톡에서 또 한 번 들어온다(검수사 확정: "앱이 보낸것과
  // 수동으로 보낸것과 섞여 있어 그렇습니다"). **지우는 게 아니라 접는다** — 판단 기준은 상태다.
  //   해치: 사이에 반대 동작 없이 같은 그룹이 또 열리면(또는 또 닫히면) 같은 사건이다.
  //   상태: 사이에 다른 상태 없이 COMMENCED 가 또 오면 같은 사건이다. 먼저 온 것을 남긴다.
  const hatchState = new Map();     // 그룹 → 'open' | 'close'
  const stLast = new Map();         // 모드 → 마지막 상태 낱말
  let lastTs = 0;
  let dupHatch = 0, dupSt = 0;

  for (const r of list) {
    if (!keep.has(r)) continue;
    lastTs = r.ts;
    if (r.type === 'work_status') {
      const md = modeOf(r);
      const modeLbl = md === 'discharge' ? "DISCH'G" : 'LOADING';
      const act = String(r.action || '');
      const word = /_start$|^start$/.test(act) ? 'COMMENCED'
        : /_pause$|^stop$/.test(act) ? 'SUSPENDED'
        : /_resume$|^resume$/.test(act) ? 'RESUMED'
        : /_done$|^complete$/.test(act) ? 'COMPLETED' : '';
      if (!word) continue;
      if (stLast.get(md) === word) { dupSt += 1; continue; }
      stLast.set(md, word);
      const extra = (word === 'SUSPENDED' && r.reason) ? ` (${r.reason})` : '';
      rows.push({ ts: r.ts, time: `${t(r.ts)}    HRS`, remark: `${word} ${modeLbl}${extra}` });
    } else if (r.type === 'hatch') {
      const act = String(r.action || '').toLowerCase();
      const gs = groupOf ? [...new Set((r.bays || []).map(groupOf).filter((g) => g != null))] : [];
      if (gs.length && gs.every((g) => hatchState.get(g) === act)) { dupHatch += 1; continue; }
      for (const g of gs) hatchState.set(g, act);
      rows.push({ ts: r.ts, time: `${t(r.ts)}    HRS`,
        remark: `HATCH COVER ${act.toUpperCase()}${r.bays ? ` (BAY ${bayStr(r.bays)})` : ''}` });
    }
  }

  // ── 2) 완료 처리 = 커버는 닫혔다 ───────────────────────────────
  // 검수사 확정 2026-08-05: "완료처리 했다는게 중요 합니다."
  //   커버를 안 닫으면 데크에 못 싣고, 못 실으면 완료가 안 된다.
  //   ⚠ **마지막 상태**로 판단한다 — 닫았다가 아침에 다시 연 커버가 있다(STMJ 03:05 BAY 14,
  //     08:19 BAY 05,06,07, 08:20 BAY 01,03). 종전엔 '한 번이라도 닫혔으면 끝'으로 봐서
  //     이 셋을 통째로 놓쳤다.
  //   시각은 지어내지 않는다 — 순서만 맞추고 칸은 비운다.
  if (groupOf && doneModes.size) {
    const openG = new Map();                 // 그룹 → 마지막 오픈 보고
    for (const r of list) {
      if (!r || r.type !== 'hatch' || !keep.has(r)) continue;
      if (r.mode && !doneModes.has(r.mode)) continue;
      const act = String(r.action || '').toLowerCase();
      for (const g of (r.bays || []).map(groupOf).filter((x) => x != null)) {
        // 닫힌 뒤 **처음** 열린 보고를 잡는다 — 접힌 중복이 아니라 실제로 시트에 찍힌 줄과
        // 같은 베이 표기를 쓰기 위해서다(BAY 09,11 로 열었는데 닫힘만 09,10,11 로 나오면 안 된다).
        if (act === 'open') { if (!openG.has(g)) openG.set(g, r); }
        else if (act === 'close') openG.delete(g);
      }
    }
    let n = 0;
    for (const r of openG.values()) {
      rows.push({ ts: lastTs + (++n), inferred: true, time: BLANK,
        remark: `HATCH COVER CLOSE (BAY ${bayStr(r.bays)})   ※ 시각 미기록` });
    }
    // 완료 처리됐는데 COMPLETED 줄이 없는 모드도 같은 이치다 — 시각만 비운다.
    for (const md of doneModes) {
      if (stLast.get(md) === 'COMPLETED') continue;
      if (!stLast.has(md)) continue;         // 아예 시작 기록도 없으면 손대지 않는다
      rows.push({ ts: lastTs + 100, inferred: true, time: BLANK,
        remark: `COMPLETED ${md === 'discharge' ? "DISCH'G" : 'LOADING'}   ※ 시각 미기록` });
    }
  }

  rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (dupHatch || dupSt) rows._folded = dupHatch + dupSt;   // 화면에 몇 줄 접었는지 알린다
  if (echoDropped) rows._echo = echoDropped;               // 카톡과 어긋나 뺀 앱 보고 수
  return rows;
}

/** 부위 표기 — 실물 서류 관례. 오라클은 2639E 실물 문구
 *  (`R/SIDE TOP RAIL 1 POINT PUSHED IN ( 60 x 30 x 10 )` · `L/SIDE PANEL 1 POINT DENTED ( 80 x 120 x 20 )`).
 *  앱 코드값(DAMAGE_PARTS)은 화면용이라 서류 표기와 다르다 — 여기서만 바꾼다. */
const DMG_PART_LABEL = {
  'ROOF': 'TOP PANEL', 'FLOOR': 'FLOOR',
  'LEFT SIDE': 'L/SIDE PANEL', 'RIGHT SIDE': 'R/SIDE PANEL',
  'FRONT END': 'FRONT PANEL', 'BACK END/DOOR': 'REAR DOOR',
  'DOOR HANDLE': 'DOOR HANDLE', 'DOOR LATCH': 'DOOR LATCH', 'DOOR HINGE': 'DOOR HINGE',
  'DOOR GASKET': 'DOOR GASKET', 'CORNER POST': 'CORNER POST', 'LOCK ROD': 'LOCK ROD', 'SEAL': 'SEAL',
};

/** CARGO DAMAGE REPORT (DM-IN·DM-OUT) + 개별 손상보고서(DAMAGE-EACH·DAMAGE REPORT).
 *  TallyOne 1.10: 손상은 예전부터 `voyages/{key}/photos` 에 정상 기록되고 있었는데
 *    텔리가 그 노드를 한 번도 읽지 않아 서류가 늘 비어 있었다(검수사 신고 2026-08-05, STMJ 2643E).
 *    `reports` 는 타임시트용이고 손상은 `photos` 에 있다 — 소스가 다르다.
 *  같은 컨의 같은 자리·같은 종류는 **사진만 여러 장**이므로 한 건으로 묶는다
 *    (실측: SKHU6312247 이 07:21·07:22·07:29 세 장, 전부 LEFT SIDE DENTED).
 */
export function buildDamage(voyage, disCs, loadCs) {
  const norm = (x) => String(x || '').toUpperCase().replace(/\s/g, '');
  const byCn = new Map();
  for (const c of [...disCs, ...loadCs]) if (c?.cn) byCn.set(norm(c.cn), c);
  const disSet = new Set(disCs.map((c) => norm(c.cn)));
  const loadSet = new Set(loadCs.map((c) => norm(c.cn)));
  const seen = new Set();
  const out = { dmIn: [], dmOut: [] };
  const list = vals(voyage?.photos || {})
    .filter((p) => p && p.type === 'damage' && p.cn)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  for (const p of list) {
    const cn = norm(p.cn);
    const types = (Array.isArray(p.damageTypes) ? p.damageTypes : []).filter(Boolean);
    const parts = (Array.isArray(p.damageParts) ? p.damageParts : []).filter(Boolean);
    const key = `${cn}|${parts.join(',')}|${types.join(',')}`;
    if (seen.has(key)) continue;                 // 같은 자리·같은 종류 = 사진만 여러 장
    seen.add(key);
    // 방향: 컨이 어느 쪽에 있는지가 먼저. photos.mode 는 'unknown' 으로 오는 경우가 많다(실측).
    const isLoad = loadSet.has(cn) ? true : disSet.has(cn) ? false : (p.mode === 'loading');
    const c = byCn.get(cn) || {};
    const sz = tallySizeCol(c);
    const szLbl = sz === '20' ? "20'" : sz === '45' ? "45'" : sz === '40' ? "40'" : "40'";
    const fe = c.fe === 'E' ? 'EMPTY' : 'FULL';
    const partTxt = parts.map((x) => DMG_PART_LABEL[x] || x).join(' & ');
    const ptTxt = p.points ? `${p.points} POINT` : '';
    const dimTxt = String(p.dims || '').trim() ? `( ${String(p.dims).trim()} )` : '';
    const exception = [partTxt, ptTxt, types.join(' & '), dimTxt, String(p.note || '').trim()]
      .filter(Boolean).join(' ');
    const row = {
      cn: c.cn || p.cn,
      port: port3(isLoad ? c.pod : c.pol) || '???',
      op: String(c.op || '').toUpperCase(),
      contents: `${szLbl} ${fe} CONT'R`,
      pkgs: 1, kind: 'VAN',
      exception,
      seal: String(c.sl || c.sl_orig || '').trim(),
      fe, size: szLbl, ts: p.ts || 0,
    };
    (isLoad ? out.dmOut : out.dmIn).push(row);
  }
  return out;
}

/** 전체 집계 — voyage 하나로 모든 시트 데이터 생성 */
export function computeTallyData(voyage) {
  const info = voyage?.info || {};
  const code = String(info.vsl || '').toUpperCase();
  const fmt = getTallyFormat(code) || { ops: [], ports: [], damage: null, shifting: true, performance: true, _unknown: true };
  const disCs = ptkContainers(voyage, 'discharge');
  const loadCs = ptkContainers(voyage, 'loading');
  const shiftRows = buildShifting(voyage);
  const matDis = buildMatrix(disCs, 'discharge');
  const matLoad = buildMatrix(loadCs, 'loading');
  // 쉬프팅 매트릭스: op×POD 기준 (실측: DJCT SHIFT 열 = 20' 자리)
  const matShift = {};
  for (const s of shiftRows) {
    const op = s.op || '???'; const port = s.pod || '???';
    const fe = s.fe === 'E' ? 'E' : 'F';
    const sz = s.type === "20'" ? '20' : 'HC';
    ((((matShift[op] ??= {})[port] ??= {})[fe] ??= {}))[sz] = ((matShift[op][port][fe] || {})[sz] || 0) + 1;
  }
  return {
    fmt, code,
    ferry: buildFerry(voyage, disCs, loadCs),   // V9.21: 여객선(TNJP) 바우처용 — 타선박도 무해(집계만)
    vslFull: info.vslFull || info.vsl || '',
    voyD: info.voy_d || '', voyL: info.voy_l || '',
    pier: info.pier || '', berth: info.berth || '',
    date: new Date(),
    rows: matrixRows(matDis, matLoad, matShift, fmt),
    totals: {
      dis: { F: sumMat(matDis, 'F'), E: sumMat(matDis, 'E'), n: matTotal(matDis) },
      load: { F: sumMat(matLoad, 'F'), E: sumMat(matLoad, 'E'), n: matTotal(matLoad) },
      shift: { F: sumMat(matShift, 'F'), E: sumMat(matShift, 'E'), n: matTotal(matShift) },
    },
    osIn: buildOS(disCs, sect(voyage, 'discharge').completed, 'discharge', fmt),
    osOut: buildOS(loadCs, sect(voyage, 'loading').completed, 'loading', fmt),
    sealIn: buildSealList(voyage, 'discharge'),
    sealOut: buildSealList(voyage, 'loading'),
    rfIn: buildRF(disCs), rfOut: buildRF(loadCs),
    damage: buildDamage(voyage, disCs, loadCs),   // TallyOne 1.10: photos → DM-IN/DM-OUT·DAMAGE 시트
    perf: buildPerformance(disCs, loadCs, fmt),
    shifting: shiftRows,
    // 1.8-16: 완료 처리된 모드에서 **닫았는데 보고가 없는 커버**를 시각 없이 채운다.
    //   베이 짝 사전은 양하·선적 컨을 다 넣어야 온전하다(한쪽만 보면 홀수 짝을 못 찾는다).
    timeSheet: buildTimeSheet(voyage?.reports, {
      groupOf: (b) => bayGroupCenter(b, getBayPairs([...disCs, ...loadCs], info.imo || '', info.vsl || '')),
      doneModes: [
        ...(info.dischargeDone || info.inspectorDone ? ['discharge'] : []),
        ...(info.loadingDone || info.inspectorDone ? ['loading'] : []),
      ],
    }),
  };
}
