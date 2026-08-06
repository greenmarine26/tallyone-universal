// 절차서 §4 — ① 카고플랜 정본 판정 시뮬 (TallyUni 0.7-02)
//
// 재현 대상: **로컬 사본이 없는 브라우저**(크롬). localStorage 를 비우고 Firebase 항목만 준다.
//   → 조회 결과 source='firebase' → "source==='user' 로 정본 판정"하던 코드가 정본을 자동본 취급.
//
// 실행: node _sim/dict.mjs
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
globalThis.window = globalThis;

const { makeNsfrFbEntry } = await import('./fixture_nsfr.mjs');
const fb = { NSFR: makeNsfrFbEntry() };
globalThis.window.__fbShipBayDict = fb;

const { getShipBayDictData } = await import('../src/shipStructure.js');
const utils = await import('../src/utils.js');
const isUserOwnedBayDict = utils.isUserOwnedBayDict;

let fail = 0;
const eq = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`);
};

if (typeof isUserOwnedBayDict !== 'function') {
  console.log('FAIL  isUserOwnedBayDict 가 utils.js 에 없다 (수정 전 상태)');
  fail++;
} else {
  eq('Firebase 정본 판정', isUserOwnedBayDict(fb.NSFR), true);
  eq('source=firebase 라도 정본', isUserOwnedBayDict({ source: 'firebase', bayDef: fb.NSFR.bayDef }), true);
  eq('자동본(v2)은 아님', isUserOwnedBayDict({ source: 'v2', bayDef: { verified: true, grade: 'auto-box-region' } }), false);
  eq('null 안전', isUserOwnedBayDict(null), false);
  eq('bayDef 를 직접 줘도 됨', isUserOwnedBayDict(fb.NSFR.bayDef), true);
}

const d = getShipBayDictData('', 'NSFR', { vslCode: 'NSFR', ediBayCount: 22 });
eq('조회 경로는 firebase 그대로(표시용)', d.source, 'firebase');
eq('정본으로 판정', d._userOwned, true);

// 핵심: 검수사가 저장한 값이 한 글자도 안 바뀌어야 한다
const orig = fb.NSFR.bayDef.baysSummary;
const got = d.bayDef.baysSummary;
eq('베이 수 보존', got.length, orig.length);
let diff = 0;
for (const o of orig) {
  const g = got.find(x => x.bayNo === o.bayNo);
  for (const k of ['rowCount', 'deckTiers', 'holdTiers', 'deckCells', 'holdCells', 'hasZero', 'deckHasZero', 'holdHasZero', 'hasDeck', 'hasHold']) {
    if (JSON.stringify(o[k]) !== JSON.stringify(g?.[k])) {
      diff++;
      console.log('  ✗', o.bayNo, k, JSON.stringify(o[k]), '→', JSON.stringify(g?.[k]));
    }
  }
}
eq('전 필드 무손실', diff, 0);

// ── 파급 검증 — 자동본(정본 아님)은 종전 동작 그대로여야 한다 ────────────────
//   같은 NSFR 항목에서 정본 표식만 떼면 v2 union 이 다시 걸려야 한다(M6.25 보완 기능 보존).
{
  const auto = JSON.parse(JSON.stringify(fb.NSFR));
  delete auto.source; delete auto._userOwned;
  delete auto.bayDef.source; delete auto.bayDef._userOwned;
  auto.bayDef.sourceFile = 'NSFR-stowage (M6.71 box-region)';
  globalThis.window.__fbShipBayDict = { NSFR: auto };
  const { getShipBayDictData: g2 } = await import('../src/shipStructure.js?auto');
  const a = g2('', 'NSFR', { vslCode: 'NSFR', ediBayCount: 22 });
  eq('자동본은 정본 아님', a._userOwned, false);
  const b27 = a.bayDef.baysSummary.find(x => x.bayNo === '27');
  eq('자동본은 v2 union 그대로 걸린다(BAY27 홀드 복원)', b27.holdTiers, [8, 6, 4]);
  globalThis.window.__fbShipBayDict = fb;
}

console.log(fail === 0 ? '\n✅ 전체 PASS' : `\n❌ FAIL ${fail}건`);
process.exit(fail ? 1 : 0);
