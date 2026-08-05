// 신규 선박 EDI 매트릭스 ↔ 등록 베이사전 구조 매칭 (자동 복제 후보 추천)
// 원칙(검수앱지침서 7.1·6부): EDI는 "실린 화물"이라 베이별 capacity가 항차마다 다름.
//   → EDI에서 신뢰: 베이집합·deckonly/holdonly·데크최대단 상한.
//   → EDI가 못 정함: 베이별 정확 capacity = 사전이 진실.
//   판정: ① 베이집합 부분집합 일치(가장 강함) ② deckonly 패턴 ③ 사전 capacity ≥ EDI 실측 최대단(수용성).

// 매트릭스(byBay) 또는 사전 entry(baysSummary) 어느 쪽에서든 동일 지문 추출.
function _bayList(src) {
  // 매트릭스: {byBay:{...}}  /  사전 entry: {bayDef:{baysSummary:[...]}}
  if (src?.byBay) {
    return Object.values(src.byBay).map(b => ({
      bay: parseInt(b.bayNum ?? b.bay, 10),
      deckTiers: Array.isArray(b.deckTiers) ? b.deckTiers : [],
      holdTiers: Array.isArray(b.holdTiers) ? b.holdTiers : [],
    }));
  }
  const bs = src?.bayDef?.baysSummary || src?.baysSummary || [];
  return bs.map(b => ({
    bay: parseInt(b.bay ?? b.bayNo, 10),
    deckTiers: Array.isArray(b.deckTiers) ? b.deckTiers : [],
    holdTiers: Array.isArray(b.holdTiers) ? b.holdTiers : [],
  }));
}

// 홀짝 정규화: 짝수 베이(40ft 페어 통로)를 인접 홀수(짝-1)로 흡수.
//   EDI 매트릭스(홀수 베이만) ↔ 사전(짝수 포함) 베이집합을 같은 좌표계로 맞춤.
const _odd = b => (b % 2 === 0 ? b - 1 : b);

// 구조 지문 추출. 깨진 베이번호(NaN/<=0) 제외.
export function extractFingerprint(src) {
  const bays = new Set();        // raw 베이
  const baysN = new Set();       // 홀짝 정규화 베이(비교 기준)
  const deckonly = new Set();    // 홀드 없고 데크만(정규화)
  const holdonly = new Set();    // 데크 없고 홀드만(정규화)
  const deckMaxByBay = {};       // 정규화 베이별 데크 최고단(여러 베이 흡수 시 max)
  let deckMaxAll = 0;            // 전체 데크 최고단(이 배가 쌓는 최대 높이)
  for (const b of _bayList(src)) {
    if (!Number.isFinite(b.bay) || b.bay <= 0) continue;
    bays.add(b.bay);
    const on = _odd(b.bay);
    baysN.add(on);
    const hasDeck = b.deckTiers.length > 0;
    const hasHold = b.holdTiers.length > 0;
    if (hasDeck && !hasHold) deckonly.add(on);
    if (hasHold && !hasDeck) holdonly.add(on);
    if (hasDeck) {
      const m = Math.max(...b.deckTiers);
      if (m > (deckMaxByBay[on] || 0)) deckMaxByBay[on] = m;
      if (m > deckMaxAll) deckMaxAll = m;
    }
  }
  return { bays, baysN, deckonly, holdonly, deckMaxByBay, deckMaxAll, bayCount: baysN.size };
}

function _jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}

// EDI 지문(fp) vs 사전 후보 지문(cand) 점수 계산.
//   subset: EDI 베이가 사전 프레임의 부분집합인가(같은 배면 EDI는 사전의 일부만 실림).
//   capacityFit: 사전 베이별 데크 capacity가 EDI 실측 최대단을 수용하는가.
function _scorePair(fp, cand) {
  const sBays = _jaccard(fp.baysN, cand.baysN);            // 정규화 베이집합 유사
  const sDeckonly = _jaccard(fp.deckonly, cand.deckonly);  // deckonly 패턴(정규화)
  const sHoldonly = _jaccard(fp.holdonly, cand.holdonly);

  // 부분집합: EDI(정규화) 베이가 사전에 전부 있는가
  let missing = 0;
  for (const b of fp.baysN) if (!cand.baysN.has(b)) missing++;
  const subset = missing === 0;

  // 수용성: EDI가 실제로 쌓은 데크 최대단을 사전 capacity가 받아주는가.
  //   같은 배면 사전 capacity ≥ EDI 실측. 여유 0 → 90단 사전이 92단 EDI를 못 받으면 위반.
  //   이게 SWRG(92) vs D7XF(90) 같은 동형 프레임 내 데크 높이 차이를 가름.
  let capChecked = 0, capViolate = 0;
  for (const [bayStr, ediMax] of Object.entries(fp.deckMaxByBay)) {
    const bay = parseInt(bayStr, 10);
    const candMax = cand.deckMaxByBay[bay];
    if (candMax == null) continue;
    capChecked++;
    if (ediMax > candMax) capViolate++;   // 사전이 EDI 높이를 못 받음 → 다른(작은) 배
  }
  const capacityFit = capChecked ? 1 - capViolate / capChecked : 1;

  // 데크 높이 등급: EDI 전체 최대단 ≤ 사전 전체 최대단이면 OK.
  const deckTopFit = cand.deckMaxAll >= fp.deckMaxAll ? 1
    : Math.max(0, 1 - (fp.deckMaxAll - cand.deckMaxAll) / 6);

  // 최대베이 근접(선체 길이): 정규화 끝베이 번호 차이.
  const maxFp = fp.baysN.size ? Math.max(...fp.baysN) : 0;
  const maxCand = cand.baysN.size ? Math.max(...cand.baysN) : 0;
  const sMaxBay = 1 - Math.min(1, Math.abs(maxFp - maxCand) / 10);

  // 가중 종합. 베이집합·부분집합·수용성(capacity)이 핵심.
  let score =
    sBays * 0.30 +
    (subset ? 0.18 : 0) +
    capacityFit * 0.22 +
    deckTopFit * 0.10 +
    sDeckonly * 0.10 +
    sMaxBay * 0.06 +
    sHoldonly * 0.04;

  return {
    score,
    subset, missing,
    sBays, sDeckonly, sHoldonly, capacityFit, deckTopFit, sMaxBay,
    maxBayFp: maxFp, maxBayCand: maxCand,
    ediDeckMax: fp.deckMaxAll, candDeckMax: cand.deckMaxAll,
  };
}

// 메인: EDI 매트릭스 ↔ 사전 전체에서 상위 후보 정렬.
//   matrix: 현재 빌더 매트릭스(byBay)
//   dict: loadUserBayDict() 결과 {code: entry}
//   opts.minBays: 너무 작은 entry(빈 깡통) 제외 임계(기본 1)
//   returns: [{code, name, callsign, bayCount, score, detail}] score 내림차순
export function findSimilarShips(matrix, dict, opts = {}) {
  const minBays = opts.minBays ?? 1;
  const fp = extractFingerprint(matrix);
  if (fp.bayCount === 0) return [];
  const out = [];
  for (const [code, entry] of Object.entries(dict || {})) {
    const cand = extractFingerprint(entry);
    if (cand.bayCount < minBays) continue;
    const d = _scorePair(fp, cand);
    out.push({
      code,
      name: entry?.name || '',
      callsign: entry?.callsign || '',
      bayCount: cand.bayCount,
      score: d.score,
      detail: d,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// 복제본 적합성 검증: 복제한 매트릭스에 현재 EDI 컨테이너를 얹어 수용률 계산.
//   사용자 원칙: "실린 컨테이너가 다 보이면 복제 성공". tier 기준(베이별 데크/홀드 단에 해당 tier 존재?).
//   누락 = 매트릭스에 그 베이의 그 단이 없어 표시 안 되는 컨테이너 → 보정 대상.
//   returns: { total, fit, miss, missByBay: [{bay, tier, kind, count}], pass }
export function verifyMatrixFit(matrix, containers) {
  // 매트릭스 베이별 존재 tier 집합
  const tiersByBay = {};   // 'bay'(int) -> { deck:Set, hold:Set }
  for (const b of Object.values(matrix?.byBay || {})) {
    const bay = parseInt(b.bayNum ?? b.bay, 10);
    if (!Number.isFinite(bay) || bay <= 0) continue;
    tiersByBay[bay] = {
      deck: new Set(Array.isArray(b.deckTiers) ? b.deckTiers : []),
      hold: new Set(Array.isArray(b.holdTiers) ? b.holdTiers : []),
    };
  }
  // 매트릭스가 40ft로 홀수 베이만 가지면, EDI 짝수 베이는 인접 홀수로 흡수해 조회.
  const _odd2 = n => (n % 2 === 0 ? n - 1 : n);
  const lookup = (bay) => tiersByBay[bay] || tiersByBay[_odd2(bay)];

  let fit = 0, miss = 0;
  const missMap = {};   // "bay-tier-kind" -> count
  for (const c of (containers || [])) {
    const bay = parseInt(c.bay, 10);
    const tier = parseInt(c.tier, 10);
    if (!Number.isFinite(bay) || !Number.isFinite(tier)) continue;
    const tb = lookup(bay);
    const kind = tier >= 80 ? 'deck' : 'hold';   // 80단↑ 데크 관례
    if (tb && ((tier >= 80 && tb.deck.has(tier)) || (tier < 80 && tb.hold.has(tier)))) {
      fit++;
    } else {
      miss++;
      const k = `${bay}-${tier}-${kind}`;
      missMap[k] = (missMap[k] || 0) + 1;
    }
  }
  const missByBay = Object.entries(missMap)
    .map(([k, count]) => {
      const [bay, tier, kind] = k.split('-');
      return { bay: parseInt(bay, 10), tier: parseInt(tier, 10), kind, count };
    })
    .sort((a, b) => a.bay - b.bay || a.tier - b.tier);

  return {
    total: fit + miss,
    fit, miss,
    missByBay,
    pass: miss === 0,
  };
}

// 사용불가 셀 탐지 (기준 A — 중력 제약): 한 베이·한 row에서 컨테이너가 적재된 최저단보다
//   아래에 있는 빈 단은 물리적으로 채울 수 없으므로 "셀 아님"(blocked).
//   위(상단)에 컨테이너가 있는데 그 아래가 비면 = 그 자리는 구조상 없는 칸.
//   단일 항차 EDI로도 100% 확실(중력). 위가 비어있으면 건드리지 않음(미적재일 뿐).
//   tierStep: 단 간격(홀드·데크 모두 통상 2).
//   returns: { byBay: { '003': { deckBlocked:[{row,tier}], holdBlocked:[{row,tier}] } }, totalBlocked }
export function detectBlockedCells(containers, tierStep = 2) {
  const _odd2 = n => (n % 2 === 0 ? n - 1 : n);
  // 베이(정규화) → side → row → 적재 tier 집합
  const acc = {};
  for (const c of (containers || [])) {
    const bay = _odd2(parseInt(c.bay, 10));
    const row = parseInt(c.row, 10);
    const tier = parseInt(c.tier, 10);
    if (!Number.isFinite(bay) || !Number.isFinite(row) || !Number.isFinite(tier)) continue;
    const side = tier >= 80 ? 'deck' : 'hold';
    acc[bay] = acc[bay] || { deck: {}, hold: {} };
    (acc[bay][side][row] = acc[bay][side][row] || new Set()).add(tier);
  }
  const byBay = {};
  let totalBlocked = 0;
  for (const [bayStr, sides] of Object.entries(acc)) {
    const bayKey = String(parseInt(bayStr, 10)).padStart(3, '0');
    const out = { deckBlocked: [], holdBlocked: [] };
    for (const side of ['deck', 'hold']) {
      const rowsObj = sides[side];
      const rows = Object.keys(rowsObj).map(Number);
      if (!rows.length) continue;
      // 이 베이·side의 이론적 바닥 = 모든 row 통틀어 최저 적재단
      const allTiers = [...new Set(rows.flatMap(r => [...rowsObj[r]]))];
      const floor = Math.min(...allTiers);
      for (const row of rows) {
        const rmin = Math.min(...rowsObj[row]);   // 이 row에서 적재된 최저단
        // floor ~ (rmin-step) 까지가 "위는 찼는데 아래 빈" 사용불가 셀
        for (let t = floor; t < rmin; t += tierStep) {
          out[side === 'deck' ? 'deckBlocked' : 'holdBlocked'].push({ row, tier: t });
          totalBlocked++;
        }
      }
    }
    if (out.deckBlocked.length || out.holdBlocked.length) byBay[bayKey] = out;
  }
  return { byBay, totalBlocked };
}
