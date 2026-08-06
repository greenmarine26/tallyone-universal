// 절차서 ③④ — 홈 카드 표기(작업일시 + 자료 상태) 시뮬 (TallyUni 0.10)
//
// 자료: tallyuni-gm RTDB `voyages` **실데이터 33키** (2026-08-06 읽기 GET, 익명인증).
//       /tmp/uni/vg/<키>.json 에 항차별로 받아 둔 것을 읽는다. ⛔ 쓰기는 하지 않는다.
//
// 확인하는 것
//   ⓐ 100% 항차가 ✅ 자료 확정 으로 판정되고 dataFixedAt 이 **한 번만** 기록되는가
//   ⓑ voy_l 이 있는데 선적이 아직 안 온 항차가 ⏳ 선적자료 대기중 인가 (TNJP 26356E 실사례)
//   ⓒ 한쪽만 하는 배(voy_d 만 / voy_l 만)는 그 한쪽만으로 100% 가 되는가 (ATPR류)
//   ⓓ 범용판 예정 카드(autoStatus 'expected' · info 만 · 섹션 없음)가 판정을 오염시키지 않는가
//   ⓔ 잘못 찍힌 확정 기록을 자가 정리하되, **정상 수정본은 보존**하는가 (조건이 좁은가)
//   ⓕ 0.8 회귀 — 카드 숫자 불변 · 정렬 2차 키 동작 · 한쪽만 하는 배의 완성율 불변
//
// ⚠ 복사본을 시험하지 않는다. HomePage.jsx 의 실제 문장을 뽑아서 돌린다.
//
// 실행: node _sim/cardstate.mjs
import fs from 'fs';
import path from 'path';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { isPyeongtaekPort, ownDirCns, isVirtualCn } = await import('../src/utils.js');

const VG = '/tmp/uni/vg';
const voyages = {};
for (const f of fs.readdirSync(VG).sort()) {
  if (!f.endsWith('.json')) continue;
  const v = JSON.parse(fs.readFileSync(path.join(VG, f), 'utf8'));
  if (v && v.info) voyages[f.replace(/\.json$/, '')] = v;
}
console.log(`실 항차 ${Object.keys(voyages).length}키 로드 (읽기 GET만)`);

// ── HomePage.jsx 에서 실제 코드를 뽑는다 ─────────────────────────────────────
const HOME = fs.readFileSync(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8');
function blockFrom(src, from, marker) {
  const i = src.indexOf(marker, from);
  if (i < 0) throw new Error(`HomePage.jsx 에서 못 찾음: ${marker}`);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('블록 끝을 못 찾음');
}
const between = (src, a, b) => {
  const i = src.indexOf(a); const j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`HomePage.jsx 에서 못 찾음: ${a}`);
  return src.slice(i, j);
};

const READY_SRC  = blockFrom(HOME, 0, 'const _readyOf = (sec, mode) => {');
const EXPECT_SRC = between(HOME, '        const _expect = [];', '        return { key: k, ...v,');
const FIELDS_SRC = between(HOME, '                 // TallyUni 0.8 → 0.10: 자료 완성율', '                 _etaSrc:');
const WORK_SRC   = blockFrom(HOME, 0, 'export function workTimeText(voyage) {');
const STATE_SRC  = blockFrom(HOME, 0, 'export function dataStateOf(voyage) {');
const WRITE_SRC  = blockFrom(HOME, HOME.indexOf('const _fixedWrote = useRef'), 'for (const v of voyagesWithPier) {');
const CLEAR_SRC  = blockFrom(HOME, HOME.indexOf('const _fixedCleared = useRef'), 'for (const v of voyagesWithPier) {');

const mapVoyage = new Function('isPyeongtaekPort', 'ownDirCns', `
  return function (k, v) {
    const info = v.info || {};
    ${READY_SRC}
    ${EXPECT_SRC}
    return { key: k, ...v, ${FIELDS_SRC} };
  };`)(isPyeongtaekPort, ownDirCns);
const workTimeText = new Function(`${WORK_SRC.replace('export function', 'function')}; return workTimeText;`)();
const dataStateOf  = new Function(`${STATE_SRC.replace('export function', 'function')}; return dataStateOf;`)();
console.log(`HomePage.jsx 에서 추출: _readyOf(${READY_SRC.length}자) · 예정섹션 판정(${EXPECT_SRC.length}자)`
  + ` · 반환필드(${FIELDS_SRC.length}자) · workTimeText · dataStateOf · 확정기록 useEffect 2개`);

// 확정 기록 / 자가 정리 useEffect 의 몸통도 그대로 뽑아서 돌린다.
const runWrite = new Function('voyagesWithPier', '_fixedWrote', 'fbUpdateVoyageInfo', WRITE_SRC);
const runClear = new Function('voyagesWithPier', '_fixedCleared', 'fbUpdateVoyageInfo', CLEAR_SRC);

// ── 카드 숫자 (파급 검증용) ───────────────────────────────────────────────────
//   ⚠ 재현본이 아니라 **HomePage.jsx 의 computeStats 자체**를 뽑아 돌린다.
//   수정 전(git HEAD = TallyUni 0.9-01) 파일도 같이 뽑아 33항차 전건을 대조한다.
const mkComputeStats = (src) => new Function('isPyeongtaekPort', 'ownDirCns', 'isVirtualCn',
  `${blockFrom(src, 0, 'function computeStats(section, mode, info) {')}; return computeStats;`
)(isPyeongtaekPort, ownDirCns, isVirtualCn);
const computeStats = mkComputeStats(HOME);
const HEAD_PATH = '/tmp/uni/HomePage_HEAD.jsx';
const computeStats08 = fs.existsSync(HEAD_PATH) ? mkComputeStats(fs.readFileSync(HEAD_PATH, 'utf8')) : null;
const cardOf = (sec, mode, info, fn = computeStats) => (sec ? fn(sec, mode, info) : null);

// ── 0.8 의 완성율(수정 전) 재현 — 회귀 대조용 ─────────────────────────────────
const readyOf08 = new Function('isPyeongtaekPort', 'ownDirCns', `${READY_SRC}; return _readyOf;`)(isPyeongtaekPort, ownDirCns);
const ready08 = (v) => {
  const rs = [readyOf08(v.discharge, 'discharge'), readyOf08(v.loading, 'loading')].filter(Boolean);
  const num = rs.reduce((s, x) => s + x.matched, 0), den = rs.reduce((s, x) => s + x.den, 0);
  return { _ready: den > 0 ? num / den : 0, _hasData: den > 0 };
};

let fail = 0;
const chk = (n, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  ' + extra : ''}`); };

// ── 실데이터 전 항차 표 ───────────────────────────────────────────────────────
const rows = Object.entries(voyages).map(([k, v]) => {
  const m = mapVoyage(k, v);
  const info = v.info || {};
  return {
    key: k, m, info,
    decl: [info.voy_d ? '양' : '', info.voy_l ? '선' : ''].filter(Boolean).join('+') || '(mode:' + (info.mode || '?') + ')',
    have: [v.discharge ? 'D' : '', v.loading ? 'L' : ''].filter(Boolean).join('+') || '-',
    r08: ready08(v),
    cards: { discharge: cardOf(v.discharge, 'discharge', info), loading: cardOf(v.loading, 'loading', info) },
    cards08: computeStats08 ? { discharge: cardOf(v.discharge, 'discharge', info, computeStats08),
                                loading: cardOf(v.loading, 'loading', info, computeStats08) } : null,
    st: dataStateOf(m),
  };
});
const LABEL = { fixed: '✅ 자료 확정', revised: '✏ 수정본', waiting: '⏳ 대기중', updated: '갱신', unknown: '갱신 —', none: '자료 없음' };
console.log('\n항차            선언  보유  0.8완성율 0.10완성율 대기  자료  누락섹션  카드 표기');
console.log('---------------------------------------------------------------------------------------');
for (const r of [...rows].sort((a, b) => b.m._ready - a.m._ready)) {
  const at = r.m._dataAt ? new Date(r.m._dataAt) : null;
  const two = (n) => String(n).padStart(2, '0');
  const atS = at ? `${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}` : '';
  console.log(
    r.key.padEnd(14) + ' ' + r.decl.padEnd(5) + ' ' + r.have.padEnd(5) + ' ' +
    r.r08._ready.toFixed(4).padStart(8) + ' ' + r.m._ready.toFixed(4).padStart(9) + '  ' +
    (r.m._waitFor || '-').padEnd(5) + ' ' + (r.m._hasData ? '있음' : '없음') + '  ' +
    (r.m._missingSection ? '있음  ' : '없음  ') + '  · ' +
    (LABEL[r.st.kind] + (r.st.kind === 'waiting' ? ` (${r.st.waitFor}자료)` : '')) +
    (r.st.at && r.st.kind !== 'fixed' ? ' ' + atS : ''));
}
console.log('');

// ⓑ TNJP 26356E — voy_l 이 있는데 선적이 안 왔다 → 대기중
const tnjp = rows.find(r => r.key === 'TNJP_26356E');
chk('ⓑ TNJP_26356E 선언은 양+선, 보유는 양하뿐', !!tnjp && tnjp.decl === '양+선' && tnjp.have === 'D',
  tnjp ? `선언 ${tnjp.decl} · 보유 ${tnjp.have}` : '항차 없음');
chk('ⓑ 예정 섹션이 둘로 잡힌다(선적이 계산에서 안 빠진다)', !!tnjp && tnjp.m._missingSection === true,
  tnjp ? `_missingSection=${tnjp.m._missingSection} · _ready=${tnjp.m._ready.toFixed(4)}` : '');
chk('ⓑ 0.8 보다 완성율이 내려간다(양하만으로 100% 가 아니다)',
  !!tnjp && tnjp.m._ready < tnjp.r08._ready + 1e-9 && tnjp.m._ready <= 0.5 + 1e-9,
  tnjp ? `0.8=${tnjp.r08._ready.toFixed(4)} → 0.10=${tnjp.m._ready.toFixed(4)}` : '');

// ⓒ 한쪽만 하는 배 — 선언이 한쪽뿐이면 그 한쪽만으로 100% 가능
const oneSide = rows.filter(r => (!!r.info.voy_d) !== (!!r.info.voy_l));
chk('ⓒ 한쪽만 선언된 항차가 있다', oneSide.length > 0,
  oneSide.map(r => `${r.key}(${r.decl})`).join(', '));
const oneSideKeeps = oneSide.every(r => Math.abs(r.m._ready - r.r08._ready) < 1e-9 || !r.r08._hasData);
chk('ⓒ 한쪽만 하는 배의 완성율은 0.8 과 같다(그 한쪽만 본다)', oneSideKeeps,
  oneSide.map(r => `${r.key} ${r.r08._ready.toFixed(3)}→${r.m._ready.toFixed(3)}`).join(' · '));

// ⓓ 예정 카드 — autoStatus 'expected' · 섹션 없음 이 판정을 오염시키지 않는가
const expected = rows.filter(r => r.info.autoStatus === 'expected');
chk('ⓓ 예정 카드가 존재한다', expected.length > 0, `${expected.length}개`);
chk('ⓓ 예정 카드는 완성율 0 · 자료 없음 · 대기중 표기 없음',
  expected.every(r => r.m._ready === 0 && r.m._hasData === false && r.m._waitFor === '' && r.st.kind === 'none'),
  expected.map(r => `${r.key}:${r.m._ready}/${r.m._hasData}/${r.st.kind}`).join(' '));
chk('ⓓ 예정 카드는 dataFixedAt 을 쓰지도 지우지도 않는다', (() => {
  const w = []; const c = [];
  runWrite(expected.map(r => r.m), { current: new Set() }, (k, p) => { w.push([k, p]); return Promise.resolve(); });
  runClear(expected.map(r => r.m), { current: new Set() }, (k, p) => { c.push([k, p]); return Promise.resolve(); });
  return w.length === 0 && c.length === 0;
})());

// ⓐ 100% 항차 — 실데이터에 없으면 실 항차를 바탕으로 합성해서 확인한다
const clone = (o) => JSON.parse(JSON.stringify(o));
function makeFull(base, modes) {
  const v = clone(base);
  v.info = { ...v.info };
  delete v.info.dataFixedAt;
  v.info.voy_d = modes.includes('discharge') ? (v.info.voy_d || '1111E') : null;
  v.info.voy_l = modes.includes('loading') ? (v.info.voy_l || '1111W') : null;
  if (!v.info.voy_d) delete v.info.voy_d;
  if (!v.info.voy_l) delete v.info.voy_l;
  for (const m of ['discharge', 'loading']) {
    if (!modes.includes(m)) { delete v[m]; continue; }
    const cns = ['ABCU1234560', 'ABCU1234561', 'ABCU1234562'];
    const edi = {}, recs = {};
    cns.forEach((cn, i) => {
      edi[cn] = { cn, pod: m === 'discharge' ? 'KRPTK' : 'CNTAO', pol: m === 'loading' ? 'KRPTK' : 'CNTAO', _mode: m };
      recs[cn] = { cn, pod: m === 'discharge' ? 'KRPTK' : 'CNTAO', pol: m === 'loading' ? 'KRPTK' : 'CNTAO', sl: 'S' + i };
    });
    v[m] = { ediContainers: edi, records: recs };
  }
  return v;
}
const both = mapVoyage('SIM_BOTH', makeFull(voyages['PCSZ_2623E'], ['discharge', 'loading']));
chk('ⓐ 양+선 둘 다 채워진 항차 = 완성율 1.0', Math.abs(both._ready - 1) < 1e-9, `_ready=${both._ready}`);
chk('ⓐ 그 항차는 누락 섹션 없음 · 대기중 아님', both._missingSection === false && both._waitFor === '');
chk('ⓐ 카드 표기 = 갱신(확정 기록 전)', dataStateOf(both).kind === 'updated' || dataStateOf(both).kind === 'unknown',
  dataStateOf(both).kind);
{
  const writes = []; const ref = { current: new Set() };
  const fb = (k, p) => { writes.push([k, p]); return Promise.resolve(); };
  runWrite([both], ref, fb);
  runWrite([both], ref, fb);            // 같은 화면에서 두 번 렌더
  chk('ⓐ dataFixedAt 이 한 번만 기록된다', writes.length === 1 && typeof writes[0][1].dataFixedAt === 'number',
    JSON.stringify(writes.map(w => w[0])));
  const already = { ...both, info: { ...both.info, dataFixedAt: Date.now() - 3600000 } };
  const w2 = []; runWrite([already], { current: new Set() }, (k, p) => { w2.push(k); return Promise.resolve(); });
  chk('ⓐ 이미 있으면 절대 덮지 않는다(수정본 판정을 살린다)', w2.length === 0, JSON.stringify(w2));
  const fixedAt = Date.now() - 3600000;
  const painted = { ...already, info: { ...already.info, dataFixedAt: fixedAt }, _dataAt: fixedAt - 1000 };
  chk('ⓐ 확정 뒤 자료가 없으면 ✅ 자료 확정', dataStateOf(painted).kind === 'fixed', dataStateOf(painted).kind);
  chk('ⓐ 확정과 저장이 1분 안이면 뒤집히지 않는다',
    dataStateOf({ ...painted, _dataAt: fixedAt + 59000 }).kind === 'fixed');
  chk('ⓐ 확정 1분 뒤 자료가 또 오면 ✏ 수정본',
    dataStateOf({ ...painted, _dataAt: fixedAt + 61000 }).kind === 'revised');
}

// ⓑ-2 한쪽만 채워진 양+선 항차 → ⏳ 선적자료 대기중
{
  const v = makeFull(voyages['PCSZ_2623E'], ['discharge', 'loading']);
  v.info.voy_l = '1111W'; delete v.loading;                  // 선적 섹션이 아직 없다
  const m = mapVoyage('SIM_WAIT_L', v);
  chk('ⓑ-2 양하만 100% · 선적 미도착 → 완성율 0.5', Math.abs(m._ready - 0.5) < 1e-9, `_ready=${m._ready}`);
  chk('ⓑ-2 카드 표기 = ⏳ 선적자료 대기중',
    dataStateOf(m).kind === 'waiting' && dataStateOf(m).waitFor === '선적',
    `${dataStateOf(m).kind}/${dataStateOf(m).waitFor}`);
  const v2 = makeFull(voyages['PCSZ_2623E'], ['discharge', 'loading']);
  v2.info.voy_d = '1111E'; delete v2.discharge;
  const m2 = mapVoyage('SIM_WAIT_D', v2);
  chk('ⓑ-2 반대 경우는 ⏳ 양하자료 대기중', dataStateOf(m2).waitFor === '양하', dataStateOf(m2).waitFor);
}

// ⓒ-2 선언이 한쪽뿐인 배는 그 한쪽만으로 확정된다
{
  const d = mapVoyage('SIM_D_ONLY', makeFull(voyages['ATPR_2636E'], ['discharge']));
  const l = mapVoyage('SIM_L_ONLY', makeFull(voyages['ATPR_2637W'], ['loading']));
  chk('ⓒ-2 양하만 하는 배가 양하만으로 1.0', Math.abs(d._ready - 1) < 1e-9 && d._missingSection === false, `${d._ready}`);
  chk('ⓒ-2 선적만 하는 배가 선적만으로 1.0', Math.abs(l._ready - 1) < 1e-9 && l._missingSection === false, `${l._ready}`);
}

// ⓔ 자가 정리 — 조건이 좁은가
{
  // (1) 잘못 찍힌 확정: 예정 섹션 중 자료가 한 번도 안 온 것이 있다 → 지운다
  const bad = { ...tnjp.m, info: { ...tnjp.m.info, dataFixedAt: Date.now() - 7200000 } };
  const cleared = []; runClear([bad], { current: new Set() }, (k, p) => { cleared.push([k, p]); return Promise.resolve(); });
  chk('ⓔ 자료 없는 예정 섹션이 있으면 확정 기록을 지운다',
    cleared.length === 1 && cleared[0][1].dataFixedAt === null, JSON.stringify(cleared));
  // (2) 정상 수정본: 모든 섹션에 자료가 있는데 매칭이 잠깐 어긋난 상태 → 지우면 안 된다
  const v = makeFull(voyages['PCSZ_2623E'], ['discharge', 'loading']);
  v.loading.records['ZZZU9999999'] = { cn: 'ZZZU9999999', pol: 'KRPTK' };   // 리스트에 EDI 없는 컨이 하나 붙었다
  const fixedAt = Date.now() - 7200000;
  v.info.dataFixedAt = fixedAt;
  const m = mapVoyage('SIM_REVISED', v);
  m._dataAt = fixedAt + 600000;
  chk('ⓔ 정상 수정본은 완성율이 1.0 미만이지만 누락 섹션이 없다',
    m._ready < 0.9999 && m._missingSection === false, `_ready=${m._ready.toFixed(4)}`);
  const c2 = []; runClear([m], { current: new Set() }, (k, p) => { c2.push(k); return Promise.resolve(); });
  chk('ⓔ ⛔ 정상 수정본의 확정 기록은 지우지 않는다(넓히면 수정본이 영영 안 뜬다)', c2.length === 0, JSON.stringify(c2));
  chk('ⓔ 그래서 ✏ 수정본 표기가 살아 있다', dataStateOf(m).kind === 'revised', dataStateOf(m).kind);
  // (3) 같은 화면에서 두 번 지우지 않는다
  const ref = { current: new Set() }; const c3 = [];
  runClear([bad], ref, (k) => { c3.push(k); return Promise.resolve(); });
  runClear([bad], ref, (k) => { c3.push(k); return Promise.resolve(); });
  chk('ⓔ 같은 화면에서 확정 정리는 한 번만', c3.length === 1);
}

// ⓕ 회귀 — 카드 숫자 불변 (수정 전 HomePage.jsx 의 computeStats 와 33항차 전건 대조)
{
  if (!computeStats08) { fail++; console.log('FAIL  ⓕ 수정 전 HomePage.jsx(/tmp/uni/HomePage_HEAD.jsx)가 없다'); }
  else {
    const bad = rows.filter(r => JSON.stringify(r.cards) !== JSON.stringify(r.cards08));
    chk('ⓕ 카드 숫자(평택·매칭·누락·총계·완료) 33항차 전건 불변', bad.length === 0,
      `대조 ${rows.length}키 · 차이 ${bad.length}`);
    for (const r of bad) console.log('  ✗', r.key, JSON.stringify(r.cards08), '→', JSON.stringify(r.cards));
  }
}
// ⓕ-2 자료 유무(정렬 2차 키)는 0.8 과 같아야 한다 — 예정 섹션 판정은 '자료가 있나'를 바꾸지 않는다
{
  const diff = rows.filter(r => r.m._hasData !== r.r08._hasData);
  chk('ⓕ-2 _hasData 는 0.8 과 동일', diff.length === 0, diff.map(r => r.key).join(', '));
}
// ⓕ-3 완성율은 **일부러** 달라진다 — 0.8 은 대수 가중(Σmatched/Σden), 0.10 은 예정 섹션 균등 평균.
//   절차서 ④: "가중치는 균등하다 — 아직 안 온 섹션이 몇 대일지 모르므로 대수 가중은 불가능하다."
//   여기서 지켜야 할 것은 값의 동일성이 아니라 **안전 불변식**이다.
{
  // (1) 없던 100% 가 새로 생기면 안 된다 — 오확정 도입 금지
  const newFull = rows.filter(r => r.m._ready >= 0.9999 && r.r08._ready < 0.9999);
  chk('ⓕ-3 0.8 에서 100% 가 아니던 항차가 새로 100% 가 되지 않는다', newFull.length === 0,
    newFull.map(r => r.key).join(', ') || '없음');
  // (2) 100% 에서 내려간 항차는 전부 "예정 섹션이 아직 안 온 배" — ④가 고치려던 바로 그 항차
  const lostFull = rows.filter(r => r.r08._ready >= 0.9999 && r.m._ready < 0.9999);
  chk('ⓕ-3 100% 에서 내려간 항차는 전부 예정 섹션 미도착', lostFull.every(r => r.m._missingSection),
    lostFull.map(r => `${r.key}(선언 ${r.decl}·보유 ${r.have})`).join(' · ') || '없음');
  // (3) 값 자체가 예정 섹션 비율의 산술평균과 맞는가 (독립 계산으로 대조)
  const bad = rows.filter(r => {
    const info = r.info, v = voyages[r.key];
    const exp = [];
    if (info.voy_d) exp.push('discharge');
    if (info.voy_l) exp.push('loading');
    if (!exp.length) exp.push(info.mode === 'loading' ? 'loading' : 'discharge');
    const by = { discharge: readyOf08(v.discharge, 'discharge'), loading: readyOf08(v.loading, 'loading') };
    for (const m of ['discharge', 'loading']) if (by[m] && !exp.includes(m)) exp.push(m);
    const want = exp.reduce((t, m) => t + (by[m] ? by[m].matched / by[m].den : 0), 0) / exp.length;
    return Math.abs(want - r.m._ready) > 1e-9;
  });
  chk('ⓕ-3 완성율 = 예정 섹션 비율의 산술평균 (33항차 전건)', bad.length === 0, bad.map(r => r.key).join(', '));
  const moved = rows.filter(r => Math.abs(r.m._ready - r.r08._ready) > 1e-9);
  console.log('      완성율 변동(대수 가중 → 섹션 균등): '
    + (moved.map(r => `${r.key} ${r.r08._ready.toFixed(3)}→${r.m._ready.toFixed(3)}`).join(' · ') || '없음'));
}
// ⓕ-4 작업일시 문자열 — 같은 날이면 종료 날짜 생략
{
  const d1 = new Date(2026, 7, 7, 6, 0).getTime(), d2 = new Date(2026, 7, 7, 21, 0).getTime();
  const d3 = new Date(2026, 7, 8, 5, 0).getTime();
  chk('ⓕ-4 같은 날 = 종료 날짜 생략', workTimeText({ _etaMs: d1, _etdMs: d2 }) === '08-07 06:00 ~ 21:00',
    workTimeText({ _etaMs: d1, _etdMs: d2 }));
  chk('ⓕ-4 날이 넘어가면 날짜를 붙인다', workTimeText({ _etaMs: d1, _etdMs: d3 }) === '08-07 06:00 ~ 08-08 05:00',
    workTimeText({ _etaMs: d1, _etdMs: d3 }));
  chk('ⓕ-4 일정이 없으면 빈 문자열(카드가 "작업일시 미상")', workTimeText({}) === '');
}
// ⓕ-5 dataAt 폴백 — dataAt 이 없으면 raw/edi.uploadedAt, 그것도 없고 리스트만 있으면 '갱신 —'
{
  const v = makeFull(voyages['ATPR_2636E'], ['discharge']);
  v.discharge.raw = { edi: { uploadedAt: 1786000000000 } };
  const m = mapVoyage('SIM_FALLBACK', v);
  chk('ⓕ-5 dataAt 이 없으면 EDI 업로드 시각으로 폴백', m._dataAt === 1786000000000, String(m._dataAt));
  const v2 = makeFull(voyages['ATPR_2636E'], ['discharge']);
  delete v2.discharge.ediContainers;                       // 리스트만 있는 항차
  const m2 = mapVoyage('SIM_LIST_ONLY', v2);
  chk('ⓕ-5 리스트만 있고 시각을 모르면 갱신 —', m2._hasData === true && m2._dataAt === 0 && dataStateOf(m2).kind === 'unknown',
    `${m2._hasData}/${m2._dataAt}/${dataStateOf(m2).kind}`);
  const m3 = mapVoyage('SIM_REAL_DATAAT', (() => {
    const x = makeFull(voyages['ATPR_2636E'], ['discharge']);
    x.discharge.dataAt = 1786100000000; x.discharge.raw = { edi: { uploadedAt: 1786000000000 } };
    return x;
  })());
  chk('ⓕ-5 dataAt 이 있으면 그것이 이긴다', m3._dataAt === 1786100000000, String(m3._dataAt));
}
// ⓖ 범용판 보강 — 선언에 없어도 자료가 실제로 있는 섹션은 예정에 들어간다 (KSKM_2615S 실사례)
{
  const kskm = rows.find(r => r.key === 'KSKM_2615S');
  chk('ⓖ KSKM_2615S — 선언은 선적뿐인데 양하 섹션에 EDI 가 있다',
    !!kskm && !kskm.info.voy_d && !!kskm.info.voy_l && !!voyages['KSKM_2615S'].discharge,
    kskm ? `선언 ${kskm.decl} · 보유 ${kskm.have}` : '');
  const v = clone(voyages['KSKM_2615S']);
  // 선적만 100% 로 채우고 양하는 미매칭인 상태를 만든다 — 선언만 보면 ✅확정 이 되어 버린다
  const cns = ['ABCU1234560', 'ABCU1234561'];
  const edi = {}, recs = {};
  cns.forEach((cn, i) => { edi[cn] = { cn, pol: 'KRPTK', pod: 'CNTAO' }; recs[cn] = { cn, pol: 'KRPTK', pod: 'CNTAO', sl: 'S' + i }; });
  v.loading = { ediContainers: edi, records: recs };
  const m = mapVoyage('KSKM_2615S', v);
  chk('ⓖ 자료 있는 미선언 섹션이 완성율에 들어가 오확정을 막는다', m._ready < 0.9999,
    `_ready=${m._ready.toFixed(4)} · _waitFor=${m._waitFor || '-'}`);
  chk('ⓖ 그 섹션은 자료가 있으므로 _missingSection 을 넓히지 않는다', m._missingSection === false);
}

console.log(fail === 0 ? '\n✅ 전체 PASS' : `\n❌ FAIL ${fail}건`);
process.exit(fail ? 1 : 0);
