// ============================================================
// Tallyman Master · Cargo Plan Core (M6.81 Universal 포팅)
// ============================================================
// M6.81 build_cargo_plan_universal.py의 핵심 4함수를 JS로 그대로 포팅.
// 검증된 정답 알고리즘 (STSE 2631E 525 컨테이너 검증 완료).
//
// 베이사전 = 절대 기준. 각 베이의 cells 배열로 hull 단면 결정.
// STANDARD_DECK [94,92,90,88,86,84,82] + STANDARD_HOLD [10,8,6,4,2] tier 자리 통일.
// 각 베이의 실제 deck_t/hold_t는 그 베이의 cells 분포로 결정.
// 페이지 폭 통일 (globalRowRange/pageDeckUnion) 절대 사용 금지.
//
// M6.93.0: STANDARD_HOLD에 tier 10 추가 (마스터플랜 비교 결과 hold 가장 위 tier 10 누락 버그 fix).
// ============================================================

// M6.93.12 표준: 6 deck + 5 hold tier 자리 통일. 박스 간 정렬 보장.
//   STANDARD_DECK [94,92,90,88,86,84,82] + STANDARD_HOLD [10,8,6,4,2].
//   M6.94.24: tier 80 추가. deck/hold 경계(>=80=deck)의 최하단 deck 단.
//     일부 선박이 deck 최하단을 80으로 표기 → 매트릭스 deckTiers에 80 입력해도
//     STANDARD_DECK.map 루프 밖이라 카고플랜에 안 그려지던 버그 fix
//     (과거 STANDARD_HOLD 14/12 누락과 동일 패턴). 80 없는 배는 invisible row로 자리만 유지.
//   M6.81 검증된 표준 (build_cargo_plan_universal.py 참조).
export const STANDARD_DECK = [94, 92, 90, 88, 86, 84, 82, 80];
// M6.94.24: 베이 정보 없을 때 fallback용 기본 deck 6단. 80 제외(기존 동작 보존).
//   STANDARD_DECK에 80을 추가하면서 slice(1)이 7단이 되어 fallback에 80이
//   끼던 문제 방지 → 명시 상수로 고정.
const FALLBACK_DECK6 = [92, 90, 88, 86, 84, 82];
// M6.94.5: STANDARD_HOLD에 tier 12, 14 추가. BERO, MARS, KMTC 같은 큰 배(7-tier hold)에서
// holdTiers에 14,12 입력해도 STANDARD_HOLD에 없어서 시뮬레이션에 안 그려지던 버그 fix.
export const STANDARD_HOLD = [14, 12, 10, 8, 6, 4, 2];

// ------------------------------------------------------------
// 1. 베이 자동 페어링 (auto_pair_bays)
// ------------------------------------------------------------
// matrixBays: [{ bayNum, cells, rows, hasHold, ... }, ...]
// 반환: { trios: [[topKey, pairKey], ...], singles: [oddKey, ...], orphanEvens: [evenNum, ...] }
export function autoPairBays(matrixBays) {
  const byNum = new Map();
  matrixBays.forEach(b => byNum.set(b.bayNum, b));
  const evens = matrixBays.map(b => b.bayNum).filter(n => n % 2 === 0).sort((a, b) => a - b);
  const odds = matrixBays.map(b => b.bayNum).filter(n => n % 2 === 1).sort((a, b) => a - b);

  const trios = [];
  const usedOdds = new Set();
  const usedEvens = new Set();

  for (const e of evens) {
    if (byNum.has(e - 1) && byNum.has(e + 1)) {
      const topKey = String(e - 1).padStart(2, '0');
      const pairKey = `(${String(e).padStart(2, '0')})${String(e + 1).padStart(2, '0')}`;
      trios.push([topKey, pairKey]);
      usedOdds.add(e - 1);
      usedOdds.add(e + 1);
      usedEvens.add(e);
    }
  }

  // V7.98-11: pairEven 기반 페어 — 짝수 베이가 별도 엔트리로 없고 홀수 entry의 pairEven으로만
  //   묶인 경우(매트릭스 빌더 저장 방식: (04)05를 홀수 05에 pairEven='04'로, 04 키 없음)도 트리오 형성.
  //   detectMissingBays(M6.94.36)는 이미 같은 보정을 받았는데 여기만 빠져, 짝수가 matrixBays에
  //   없으면 트리오가 붕괴해 홀수 둘이 단독으로 떨어지던 버그("3 (4)5" → "3 5", 같은 배에서 들쭉날쭉).
  for (const o of odds) {
    if (usedOdds.has(o)) continue;
    const e = parseInt(byNum.get(o)?.pairEven, 10);
    if (!Number.isFinite(e) || e <= 0 || usedEvens.has(e)) continue; // pairEven 없음/이미 별도 처리
    const topOdd = e - 1; // (e)o 짝의 반대편 홀수 = 짝수-1 (예: (04)05 → top 03)
    if (byNum.has(topOdd) && !usedOdds.has(topOdd)) {
      const pairKey = `(${String(e).padStart(2, '0')})${String(o).padStart(2, '0')}`;
      trios.push([String(topOdd).padStart(2, '0'), pairKey]);
      usedOdds.add(topOdd);
      usedOdds.add(o);
      usedEvens.add(e);
    }
    // topOdd(반대편 홀수)가 없으면 기존 동작 보존 — o는 단독으로 남김(autoPageLayout 키 안전).
  }

  // M6.94.8: orphanEvens(trio에 못 묶인 짝수 단독 베이)를 singles에 합침.
  // 이전: orphanEvens를 반환만 하고 호출처가 안 받아서 카고플랜에 통째로 누락
  //   (일부 베이/마지막 베이 안 나오던 버그 — 짝수 단독 베이가 있는 선박 다수).
  const unusedOdds = odds.filter(o => !usedOdds.has(o));
  const orphanEvens = evens.filter(e => !usedEvens.has(e));
  const singles = [...unusedOdds, ...orphanEvens]
    .sort((a, b) => a - b)
    .map(n => String(n).padStart(2, '0'));

  return { trios, singles, orphanEvens };
}

// ------------------------------------------------------------
// 2. 표준 PDF_BAYS 자동 생성 (generate_pdf_bays)
// ------------------------------------------------------------
// 각 박스의 deck_t / hold_t / has_zero 자동 결정 (v5 매트릭스 cells 기반)
export function generatePdfBays(matrixBays, trios, singles) {
  const baysByNum = new Map();
  matrixBays.forEach(b => baysByNum.set(b.bayNum, b));
  const pdfBays = {};

  const getKeyToOdd = (key) => {
    if (key.startsWith('(')) {
      const m = key.replace('(', '').replace(')', '');
      return parseInt(m.slice(2), 10);
    }
    return parseInt(key, 10);
  };

  const allKeys = [];
  trios.forEach(([top, pair]) => { allKeys.push(top); allKeys.push(pair); });
  singles.forEach(s => allKeys.push(s));

  for (const key of allKeys) {
    const oddNum = getKeyToOdd(key);
    const bay = baysByNum.get(oddNum);
    if (!bay) {
      pdfBays[key] = { deck_t: [...FALLBACK_DECK6], hold_t: [...STANDARD_HOLD], has_zero: false };
      continue;
    }

    // cells는 매트릭스 정의 순서대로 들어있음. M6.81 Python은 reversed() 사용 → tier 위→아래.
    // 검수앱 baysSummary의 cells는 stse_v5.json과 동일하게 들어있으므로 동일 처리.
    const cells = [...(bay.cells || [])].reverse(); // tier 위→아래
    const nTotal = cells.length;
    if (nTotal === 0) {
      pdfBays[key] = { deck_t: [...FALLBACK_DECK6], hold_t: [...STANDARD_HOLD], has_zero: false };
      continue;
    }

    const hasHold = bay.hasHold !== undefined ? bay.hasHold : true;
    let nHold, nDeck;
    if (hasHold) {
      // V9.57: 홀드 상한 4 고정 → STANDARD_HOLD 길이(7)까지 허용 — 큰 배(5~7단 홀드)에서
      //   홀드 단이 4로 잘려 데크로 밀리던 결함 교정. nTotal ≤ 8인 배(홀드 4단 이하)는
      //   nTotal-4 ≤ 4라 기존 출력 불변(시뮬 확인). nTotal 기반 추정 로직 자체는 유지.
      nHold = Math.min(STANDARD_HOLD.length, Math.max(0, nTotal - 4));
      nDeck = nTotal - nHold;
    } else {
      nHold = 0;
      nDeck = nTotal;
    }

    // deck_t: STANDARD_DECK에서 아래부터 nDeck개
    const deck_t = nDeck > 0 ? STANDARD_DECK.slice(-nDeck) : [];
    // hold_t: STANDARD_HOLD에서 위부터 nHold개
    const hold_t = nHold > 0 ? STANDARD_HOLD.slice(0, nHold) : [];

    // has_zero: deck_max가 홀수면 00 row 있음 (좌우 대칭 + 가운데 00)
    const deckCells = cells.slice(0, nDeck);
    const deckMax = deckCells.length > 0 ? Math.max(...deckCells) : 0;
    const has_zero = deckMax % 2 === 1;

    pdfBays[key] = { deck_t, hold_t, has_zero };
  }

  return pdfBays;
}

// ------------------------------------------------------------
// 3. 페이지 layout 자동 결정 (auto_page_layout)
// ------------------------------------------------------------
// 베이 번호 큰 것이 좌측 (선미가 좌측), 작은 번호=위 줄(선수쪽), 큰 번호=아래 줄(선미쪽)
// M6.86.8.11: 사용자 약속 layout 규칙 (확정)
//   상단 박스 수 = ⌈(N+1)/2⌉, 하단 박스 수 = N - 상단
//   별첨 자리 = 상단 - 하단 (짝수 N → 2자리, 홀수 N → 1자리)
//   예시: N=10 → 6+4 (별첨 2), N=11 → 6+5 (별첨 1), N=12 → 7+5 (별첨 2)
//   배치 원칙: 작은 번호(선수쪽) → 위 줄, 큰 번호(선미쪽) → 아래 줄
//             각 행 안에서 큰 번호 좌측 (카스피 정답 양식)
export function autoPageLayout(trios, singles, colsPerRow = 5, deckOnlyKeys = null) {
  const allBoxes = [];
  trios.forEach(([topKey, pairKey]) => {
    const oddNum = parseInt(topKey, 10);
    allBoxes.push({ type: 'trio', oddNum, topKey, pairKey });
  });
  singles.forEach(s => {
    allBoxes.push({ type: 'single', oddNum: parseInt(s, 10), topKey: s, pairKey: null });
  });

  const n = allBoxes.length;
  if (n === 0) return [];

  // 사용자 약속: 상단 = ⌈(N+1)/2⌉
  const topCount = Math.ceil((n + 1) / 2);
  // 작은 번호(선수)→위 줄, 큰 번호(선미)→아래 줄
  const sortedAsc = [...allBoxes].sort((a, b) => a.oddNum - b.oddNum);
  let topBoxes = sortedAsc.slice(0, topCount);
  let bottomBoxes = sortedAsc.slice(topCount);

  // V7.38: deck-only 하단배치 자리바꿈 규칙 제거 (2026-06-09 확정 사항 재적용).
  //   hold 유무와 상관없이 베이 번호 순서가 절대 우선 — deck-only라고 순서를 깨고 내리면
  //   BAY 01이 하단으로 밀리는 버그(TMPZ 재현, .def 사전 적용 후 KSKM 등에서 재발).
  //   SWRG의 33·35·38이 하단인 것은 번호가 커서이지 deck-only라서가 아님 (과잉 일반화였음).
  //   deckOnlyKeys 인자는 호환을 위해 받기만 하고 무시.

  // 각 행 내부: 큰 번호 좌측 (카스피 정답)
  topBoxes.sort((a, b) => b.oddNum - a.oddNum);
  bottomBoxes.sort((a, b) => b.oddNum - a.oddNum);
  return bottomBoxes.length > 0 ? [topBoxes, bottomBoxes] : [topBoxes];
}

// ------------------------------------------------------------
// 4. row 위치 / active cols 단면 (get_row_positions, get_active_cols_symmetric)
// ------------------------------------------------------------
// M6.86.8.24: row label 생성. EDI 실데이터 기준 정확한 라벨.
//   - has_zero=true: evens + ['00'] + odds (가운데 00)
//   - has_zero=false: evens + odds (00 없음)
//   - cell_count 홀수 + has_zero=false: 홀수 row가 1개 더 (예: 7개 = evens[06,04,02] + odds[01,03,05,07])
//   - cell_count 짝수 + has_zero=false: evens = odds 동수 (예: 8개 = [08..02] + [01..07])
export function getRowPositions(cellCount, hasZero) {
  if (cellCount <= 0) return [];
  const pad = (n) => String(n).padStart(2, '0');
  if (hasZero) {
    const half = Math.floor((cellCount - 1) / 2);
    const evens = [];
    for (let n = half * 2; n > 0; n -= 2) evens.push(pad(n));
    const odds = [];
    for (let n = 1; n <= half * 2 - 1; n += 2) odds.push(pad(n));
    return [...evens, '00', ...odds];
  } else {
    // has_zero=false: 홀수 cellCount면 odds가 1개 더, 짝수면 동수
    const halfEvens = Math.floor(cellCount / 2);
    const halfOdds = cellCount - halfEvens;
    const evens = [];
    for (let n = halfEvens * 2; n > 0; n -= 2) evens.push(pad(n));
    const odds = [];
    for (let n = 1; n <= halfOdds * 2 - 1; n += 2) odds.push(pad(n));
    return [...evens, ...odds];
  }
}

export function getActiveColsSymmetric(cellCount, nTotal) {
  const active = new Set();
  if (cellCount >= nTotal) {
    for (let i = 0; i < nTotal; i++) active.add(i);
    return active;
  }
  if (cellCount <= 0) return active;

  const center = Math.floor(nTotal / 2);
  if (nTotal % 2 === 1) {
    if (cellCount % 2 === 1) {
      const half = Math.floor((cellCount - 1) / 2);
      for (let i = center - half; i <= center + half; i++) active.add(i);
    } else {
      // M6.92.7: 짝수 cellCount + 홀수 nTotal (hasZero=true). row 라벨 [10,08,...,00,01,...,07,09]
      //   row 00은 idx=center, row 01은 idx=center+1. PDF 정답: 가운데 row 00,01 + 좌우 대칭 채움.
      //   cellCount=2 → {center, center+1} (row 00,01)
      //   cellCount=8 → {center-3..center+4} (row 06,04,02,00,01,03,05,07)
      const half = cellCount / 2;
      for (let i = center - half + 1; i <= center + half; i++) active.add(i);
    }
  } else {
    const half = Math.floor(cellCount / 2);
    for (let i = center - half; i < center; i++) active.add(i);
    for (let i = center; i < center + half; i++) active.add(i);
    if (cellCount % 2 === 1) {
      const extra = center + half;
      if (extra < nTotal) active.add(extra);
    }
  }
  return active;
}

// ------------------------------------------------------------
// 5. 마크 빌드 (build_bay_marks)
// ------------------------------------------------------------
// containers: [{ bay, row, tier, pod, iso, dg, awk, oog, ... }, ...]
// posMap: Map("bay|tier" → Map(rowLbl → container))
// getSelfMarkFn: (container, pod) => 'o'|'R'|'D'|'P'|'U'|'T'|'A'|'G'|'X'
//   (검수앱 자체 마크 로직을 호출자가 주입 — AWK, OOG 등 검수앱 고유 마크 보존)
export function buildPosMap(containers) {
  // bay/tier는 string("01") or number(1) 양쪽 케이스 안전 처리 — Number로 통일
  const posMap = new Map();
  for (const c of containers) {
    const bay = Number(c.bay);
    const tier = Number(c.tier);
    if (!Number.isFinite(bay) || !Number.isFinite(tier)) continue;
    const rowLbl = String(c.row).padStart(2, '0');
    const key = `${bay}|${tier}`;
    if (!posMap.has(key)) posMap.set(key, new Map());
    posMap.get(key).set(rowLbl, c);
  }
  return posMap;
}

// 페어 키 형식: "(EE)OO" — 짝수 EE + 홀수 OO 데이터를 합쳐 그림.
// 단독 키 형식: "OO" — 홀수 OO 자체 + 양옆 짝수 shadow X.
// xrayMap: { cn: true } 형태. 해당 컨테이너 위치에 xray 플래그 표시.
// getColorKeyFn(c): 컨테이너의 컬러 매핑 key 반환 (양하: 선사코드, 선적: POD 3자). 평택분 외엔 null.
// isThroughFn(c): 통과화물 판정. 회색 셀 처리용.
export function buildBayMarks(bayKey, posMap, pod, getSelfMarkFn, xrayMap, getColorKeyFn, isThroughFn, shiftMap, coveredBays) {
  const marks = new Map();
  const xrays = new Map();
  const shifts = new Map();  // V8.98: 쉬프팅(재적부) 컨테이너 위치 플래그
  const urgents = new Map(); // V9.03: 긴급 화물 (예보의 긴급리스트 — c.urgent 플래그)
  const luggs = new Map();   // V9.03: 수화물 컨테이너 (c.lugg 플래그)
  const colors = new Map();
  const throughs = new Map();
  const shadow20s = new Map(); // M6.86.8.19: 양옆 짝수 20ft 자리 = 회색 표시
  const ensureTier = (tier) => {
    if (!marks.has(tier)) marks.set(tier, new Map());
    return marks.get(tier);
  };
  const ensureXrayTier = (tier) => {
    if (!xrays.has(tier)) xrays.set(tier, new Map());
    return xrays.get(tier);
  };
  const ensureShiftTier = (tier) => {
    if (!shifts.has(tier)) shifts.set(tier, new Map());
    return shifts.get(tier);
  };
  const ensureColorTier = (tier) => {
    if (!colors.has(tier)) colors.set(tier, new Map());
    return colors.get(tier);
  };
  const ensureThroughTier = (tier) => {
    if (!throughs.has(tier)) throughs.set(tier, new Map());
    return throughs.get(tier);
  };
  const ensureShadow20Tier = (tier) => {
    if (!shadow20s.has(tier)) shadow20s.set(tier, new Map());
    return shadow20s.get(tier);
  };
  const tagXray = (c, tier, rowLbl) => {
    if (xrayMap && c.cn && xrayMap[c.cn]) {
      ensureXrayTier(tier).set(rowLbl, true);
    }
  };
  const tagShift = (c, tier, rowLbl) => {
    if (shiftMap && c.cn && shiftMap[c.cn]) {
      ensureShiftTier(tier).set(rowLbl, true);
    }
  };
  const ensureUrgentTier = (tier) => { if (!urgents.has(tier)) urgents.set(tier, new Map()); return urgents.get(tier); };
  const ensureLuggTier = (tier) => { if (!luggs.has(tier)) luggs.set(tier, new Map()); return luggs.get(tier); };
  const tagUrgentLugg = (c, tier, rowLbl) => {   // V9.03: 컨테이너 플래그 기반 (예보 저장 시 태깅)
    if (c && c.urgent) ensureUrgentTier(tier).set(rowLbl, true);
    if (c && c.lugg) ensureLuggTier(tier).set(rowLbl, true);
  };
  const tagColor = (c, tier, rowLbl) => {
    if (getColorKeyFn) {
      const k = getColorKeyFn(c);
      if (k) ensureColorTier(tier).set(rowLbl, k);
    }
  };
  const tagThrough = (c, tier, rowLbl) => {
    if (isThroughFn && isThroughFn(c)) {
      ensureThroughTier(tier).set(rowLbl, true);
    }
  };

  if (bayKey.startsWith('(')) {
    const m = bayKey.replace('(', '').replace(')', '');
    const even = parseInt(m.slice(0, 2), 10);
    const odd = parseInt(m.slice(2), 10);
    for (const b of [even, odd]) {
      for (const [key, rowMap] of posMap.entries()) {
        const [bb, tier] = key.split('|').map(Number);
        if (bb === b) {
          const tierMap = ensureTier(tier);
          for (const [rowLbl, c] of rowMap.entries()) {
            // V9.57: 짝수·홀수 베이가 같은 tier·row를 주장하면 조용히 덮어쓰지 않는다 —
            //   단독 분기(아래 tierMap.has 가드)와 동일하게 먼저 그린 셀 유지 + 충돌을 경고로 드러냄
            //   (물리적으로 같은 슬롯에 2대 = 데이터 이상. 무음 덮어쓰기는 표에서 1대를 증발시킨다).
            if (tierMap.has(rowLbl)) {
              console.warn(`[cargoPlanCore] 페어 ${bayKey} 좌표 충돌: bay ${b} tier ${tier} row ${rowLbl} — ${(c && c.cn) || '?'} 표시 생략(먼저 그린 셀 유지)`);
              continue;
            }
            tierMap.set(rowLbl, getSelfMarkFn(c, pod));
            tagXray(c, tier, rowLbl);
            tagShift(c, tier, rowLbl);
            tagUrgentLugg(c, tier, rowLbl);
            tagColor(c, tier, rowLbl);
            tagThrough(c, tier, rowLbl);
          }
        }
      }
    }
  } else {
    const odd = parseInt(bayKey, 10);
    for (const [key, rowMap] of posMap.entries()) {
      const [bb, tier] = key.split('|').map(Number);
      if (bb === odd) {
        const tierMap = ensureTier(tier);
        for (const [rowLbl, c] of rowMap.entries()) {
          tierMap.set(rowLbl, getSelfMarkFn(c, pod));
          tagXray(c, tier, rowLbl);
          tagShift(c, tier, rowLbl);
          tagUrgentLugg(c, tier, rowLbl);
          tagColor(c, tier, rowLbl);
          tagThrough(c, tier, rowLbl);
        }
      }
    }
    for (const adjEven of [odd - 1, odd + 1]) {
      if (adjEven > 0) {
        for (const [key, rowMap] of posMap.entries()) {
          const [bb, tier] = key.split('|').map(Number);
          if (bb === adjEven) {
            const tierMap = ensureTier(tier);
            for (const [rowLbl, c] of rowMap.entries()) {
              // M6.91.2: ISO 6346 표준 사이즈 판정.
              //   isoToLabel로 정규화 (45GP → 40HC, L5G1 → 45HC, 45R1 → 40RF 등)
              //   → 양하/선적이 다른 표기로 들어와도 일관 분류.
              const lbl = isoToLabel(c.iso) || '';
              const is40OrMore = lbl.startsWith('40') || lbl.startsWith('45');
              if (tierMap.has(rowLbl)) continue;
              if (is40OrMore) {
                tierMap.set(rowLbl, 'X');
                // V8.89: 인접 40ft 점유 표시(X) 셀에도 색·통과 태그 상속 — 같은 통과 컨이
                //   쌍 박스에선 회색인데 단독 박스에선 흰 배경 검정 X로 갈라지던 비일관(사용자 보고 2026-07-13).
                //   평택분 X는 선사/포트 색 글자, 통과분 X는 회색 배경(쌍 박스와 동일 규칙).
                tagColor(c, tier, rowLbl);
                tagThrough(c, tier, rowLbl);
                // V8.98: 자기 박스가 없는 베이(골격 밖, 예: MAMP 27번)의 쉬프팅 컨은
                //   이 인접 점유 셀이 유일한 표시 자리 — 여기에만 ◆ (자기 박스 있으면 중복 방지 위해 생략)
                if (coveredBays && !coveredBays.has(bb)) tagShift(c, tier, rowLbl);
              } else {
                // 20ft 짝수: 셀 자리 차지 + 회색 (마크 없음)
                ensureShadow20Tier(tier).set(rowLbl, true);
                if (coveredBays && !coveredBays.has(bb)) tagShift(c, tier, rowLbl);   // V8.98: 위와 동일 원칙
              }
            }
          }
        }
      }
    }
  }
  return { marks, xrays, shifts, urgents, luggs, colors, throughs, shadow20s };
}

// ------------------------------------------------------------
// 6. 한 베이의 모든 렌더 데이터를 한 번에 계산 (편의 함수)
// ------------------------------------------------------------
// 컴포넌트는 이 함수가 반환하는 객체를 그대로 JSX로 렌더.
import { getBayOverride } from './data/shipBayDict_pdf_override.js';
import { isoToLabel } from './utils.js';

// M6.91.0: PDF STOWAGE INSTRUCTION에서 추출한 베이별 정답 데이터 사용 (DJCT/SWAT 우선).
//   override가 있으면 추측 안 함. 없으면 베이사전 기본 fallback.

export function computeBayRenderData(bayKey, pdfBays, matrixBays, posMap, pod, getSelfMarkFn, xrayMap, getColorKeyFn, isThroughFn, shipBayDef, shipCode, shiftMap) {
  // V8.98: 레이아웃이 자기 박스로 커버하는 베이 번호 집합 — "(EE)OO"는 EE·OO 둘 다, "NN"은 NN.
  const coveredBays = new Set();
  for (const k of Object.keys(pdfBays || {})) {
    const mm = String(k).match(/^\((\d+)\)(\d+)$/);
    if (mm) { coveredBays.add(parseInt(mm[1], 10)); coveredBays.add(parseInt(mm[2], 10)); }
    else { const n = parseInt(k, 10); if (Number.isFinite(n)) coveredBays.add(n); }
  }
  const pdf = pdfBays[bayKey];
  if (!pdf) return null;

  // M6.94.0 사용자 원칙: shipBayDef.source==='user' 또는 entry에 _userOwned 마크 있으면
  //   AI 자동 보강/추론/union 모두 차단. 사용자 입력 그대로 사용.
  const isUserSource = shipBayDef?.source === 'user' || shipBayDef?._userOwned === true;

  const isPair = bayKey.startsWith('(');
  let oddNum;
  if (isPair) {
    oddNum = parseInt(bayKey.replace('(', '').replace(')', '').slice(2), 10);
  } else {
    oddNum = parseInt(bayKey, 10);
  }
  const bayData = matrixBays.find(b => b.bayNum === oddNum);

  // M6.93.10: 사용자가 매트릭스 빌더로 저장한 cells 우선 사용.
  //   bayData는 v5 matrixBays라 사용자 수정 cells 무시됨 (사용자 보고).
  //   shipBayDef.baysSummary에서 직접 lookup. 필드명 호환 (bayNo 2자리 / bay 3자리).
  const oddKey2 = String(oddNum).padStart(2, '0');
  const oddKey3 = String(oddNum).padStart(3, '0');
  const userBay = shipBayDef?.baysSummary?.find(b =>
    b.bayNo === oddKey2 || b.bay === oddKey3 || b.bay === oddKey2
  );
  // V9.04: 사용불가 셀(blockedCells — 선박 구조상 없는 자리) 조회 세트.
  //   XTPG BAY25 80티어처럼 한 티어에 로우가 부분 부분만 있는 구조를 카고플랜에도 반영
  //   (기존엔 buildEmptyBayRenderData(베이플랜·미리보기)만 지원 → 82티어가 허공에 뜬 그림).
  //   페어 박스면 짝수 베이 entry의 blockedCells도 합친다.
  const _evenNumForBlk = isPair ? parseInt(bayKey.replace('(', '').replace(')', '').slice(0, 2), 10) : null;
  const _evenBayForBlk = (_evenNumForBlk != null) ? shipBayDef?.baysSummary?.find(b =>
    b.bayNo === String(_evenNumForBlk).padStart(2, '0') || b.bay === String(_evenNumForBlk).padStart(3, '0') || b.bay === String(_evenNumForBlk).padStart(2, '0')
  ) : null;
  const _blkDeckC = new Set();
  const _blkHoldC = new Set();
  for (const _bsrc of [userBay, _evenBayForBlk]) {
    if (!_bsrc || !_bsrc.blockedCells) continue;
    (_bsrc.blockedCells.deckBlocked || []).forEach(x => _blkDeckC.add(`${Number(x.tier)}-${String(x.row).padStart(2, '0')}`));
    (_bsrc.blockedCells.holdBlocked || []).forEach(x => _blkHoldC.add(`${Number(x.tier)}-${String(x.row).padStart(2, '0')}`));
  }

  // M6.91.0: PDF override가 있으면 그대로 사용 (베이마다 다른 row 구조 정확히)
  // M6.93.12 fix #2 (지침서 §6.2): userBay > override 우선순위 역전.
  //   사용자가 매트릭스 빌더에서 직접 입력한 정답이 개발자가 박은 PDF override보다 우선.
  //   rowCount, hasZero, deckTiers, holdTiers, deckCells, holdCells 모두 사용자 우선.
  const override = getBayOverride(shipCode, oddNum);
  const rowMaxOdd = shipBayDef?.rowMaxOdd;
  const rowMaxEven = shipBayDef?.rowMaxEven;
  // M6.93.12 fix #9 → M6.94.0 수정:
  //   사용자 데이터 보호 원칙: userBay 있으면 (사용자가 입력한 베이) rowCount + 사전 통일값만 사용.
  //   다른 베이 cells max로 추론(inferredMax)은 AI 임시 베이사전일 때만 적용.
  //   사용자가 BAY 11에 rowCount=8 입력 + BAY 23에 rowCount=10 입력하면, BAY 11은 8 그대로 (BAY 23의 10으로 추론 X).
  const userRowCount = (typeof userBay?.rowCount === 'number' && userBay.rowCount > 0) ? userBay.rowCount : null;
  const isUserOwnedBay = isUserSource && userBay; // 이 베이는 사용자가 직접 저장한 베이
  const allBays = shipBayDef?.baysSummary || [];
  const allDeckCells = allBays.flatMap(b => Array.isArray(b.deckCells) ? b.deckCells : []).filter(c => c > 0);
  const allHoldCells = allBays.flatMap(b => Array.isArray(b.holdCells) ? b.holdCells : []).filter(c => c > 0);
  const inferredDeckMax = allDeckCells.length > 0 ? Math.max(...allDeckCells) : null;
  const inferredHoldMax = allHoldCells.length > 0 ? Math.max(...allHoldCells) : null;

  // 사용자 데이터 보호 (M6.94.9 강화): user dict면 inferredMax 차단.
  // 이전 isUserOwnedBay(=isUserSource && userBay)는 userBay 베이번호 매칭 실패 시 보호 풀림.
  // → isUserSource(dict 전체 user)로 넓혀 매칭 실패해도 절대 보호.
  // V7.38: 지침 5.1 정합 — user 아닐 때 override(.def/PDF, 검증된 설계값)가
  //   자동 사전(rowMax/inferred)보다 우선. (이전: 자동값이 override를 가려
  //   .def 정답 4행 베이가 v5의 8행으로 그려지는 버그 — KSKM bay01)
  const ovDeckRow = (!isUserSource && override && typeof override.rowCount === 'number' && override.rowCount > 0)
    ? override.rowCount : null;
  // .def는 홀드 폭을 holdCells로 따로 가짐 (데크보다 좁은 홀드 — NBTD bay01)
  const ovHoldRow = (!isUserSource && override)
    ? ((override.defSource && override.holdCells?.length > 0) ? override.holdCells[0] : ovDeckRow)
    : null;
  const deckRowMax = userRowCount
    || ovDeckRow
    || (rowMaxEven && rowMaxEven > 0 ? rowMaxEven : null)
    || (isUserSource ? null : inferredDeckMax)
    || (override ? override.rowCount : 10);
  const holdRowMax = userRowCount
    || ovHoldRow
    || (rowMaxOdd && rowMaxOdd > 0 ? rowMaxOdd : null)
    || (isUserSource ? null : inferredHoldMax)
    || (override ? override.rowCount : 9);
  let hasZero;
  let deckHasZero, holdHasZero;
  // EDI 실데이터로 데크/홀드 00 + 구역 유무 먼저 계산 (단일 진실)
  const bayNumsToCheck = isPair
    ? [parseInt(bayKey.replace('(', '').replace(')', '').slice(0, 2), 10), oddNum]
    : [oddNum];
  const ediRows = new Set();
  let ediDeckHas0 = false, ediHoldHas0 = false, ediHasDeck = false, ediHasHold = false;
  for (const [key, rowMap] of posMap.entries()) {
    const [bb, tt] = key.split('|').map(Number);
    if (bayNumsToCheck.includes(bb)) {
      const isDeck = tt >= 80;
      if (isDeck) ediHasDeck = true; else ediHasHold = true;
      for (const [rowLbl] of rowMap.entries()) {
        const rn = Number(rowLbl);
        ediRows.add(rn);
        if (rn === 0) { if (isDeck) ediDeckHas0 = true; else ediHoldHas0 = true; }
      }
    }
  }
  hasZero = ediRows.has(0);
  // 사전값 폴백 (EDI에 해당 구역 컨테이너가 없을 때만)
  // V7.38: user 아닐 때 override hasZero가 자동 사전보다 우선 (지침 5.1)
  const dictHasZero = (isUserSource && typeof userBay?.hasZero === 'boolean') ? userBay.hasZero
    : (override && typeof override.hasZero === 'boolean') ? override.hasZero
    : (typeof userBay?.hasZero === 'boolean') ? userBay.hasZero : false;
  const dictDeckZero = (isUserSource && userBay?.deckHasZero != null) ? userBay.deckHasZero
    : (override?.deckHasZero != null) ? override.deckHasZero
    : (userBay?.deckHasZero != null) ? userBay.deckHasZero : dictHasZero;
  const dictHoldZero = (isUserSource && userBay?.holdHasZero != null) ? userBay.holdHasZero
    : (override?.holdHasZero != null) ? override.holdHasZero
    : (userBay?.holdHasZero != null) ? userBay.holdHasZero : dictHasZero;
  // 베이매트릭스가 기본(진실): 매트릭스 명시값(null 아님) 우선 → 없을 때만 EDI 판정.
  //   사용자가 데크00 체크 → EDI에 00 화물 없어도(선적 등) 09 안 생김.
  deckHasZero = (dictDeckZero != null) ? dictDeckZero : (ediHasDeck ? ediDeckHas0 : false);
  holdHasZero = (dictHoldZero != null) ? dictHoldZero : (ediHasHold ? ediHoldHas0 : false);

  // M6.93.12 fix #2: userBay tiers > override tiers > bayData > pdf
  // M6.94.14: isUserSource면 user가 비운 tier(빈 배열)를 그대로 존중 — pdf 자동 채움 금지.
  //   증상: 매트릭스에서 hold 없는 베이인데 카고플랜에 hold가 pdf.hold_t로 채워져 그려짐.
  let deckTiers, holdTiers;
  if (isUserSource && userBay) {
    deckTiers = (userBay.deckTiers?.length > 0) ? userBay.deckTiers
      : (userBay.deckTiersLocal?.length > 0) ? userBay.deckTiersLocal : [];
    holdTiers = (userBay.holdTiers?.length > 0) ? userBay.holdTiers
      : (userBay.holdTiersLocal?.length > 0) ? userBay.holdTiersLocal : [];
  } else if (override) {
    // V7.38: override(.def/PDF)가 있으면 자동 사전(baysSummary/v5)보다 우선 (지침 5.1).
    //   빈 holdTiers=[]도 "홀드 없음"으로 그대로 존중 — 자동값이 유령 홀드를 채우던 버그 제거 (KSKM bay27).
    deckTiers = override.deckTiers || [];
    holdTiers = override.holdTiers || [];
  } else {
    deckTiers = (userBay?.deckTiers && userBay.deckTiers.length > 0 ? userBay.deckTiers : null)
      || (userBay?.deckTiersLocal && userBay.deckTiersLocal.length > 0 ? userBay.deckTiersLocal : null)
      || (bayData?.deckTiers && bayData.deckTiers.length > 0 ? bayData.deckTiers : pdf.deck_t);
    holdTiers = (userBay?.holdTiers && userBay.holdTiers.length > 0 ? userBay.holdTiers : null)
      || (userBay?.holdTiersLocal && userBay.holdTiersLocal.length > 0 ? userBay.holdTiersLocal : null)
      || (bayData?.holdTiers && bayData.holdTiers.length > 0 ? bayData.holdTiers : pdf.hold_t);
  }

  // M6.93.12 fix #10 → M6.94.0 수정:
  //   사용자 데이터 보호 원칙: userBay (사용자가 입력한 베이)는 EDI union 절대 안 함.
  //   사용자가 빈 배열 [] 입력했어도 그대로 (의도 존중).
  //   AI 임시 베이사전 (user source 아님)일 때만 EDI 새 tier union (컨테이너 누락 방지).
  const ediHoldSet = new Set();
  const ediDeckSet = new Set();
  const bayNumsForTier = isPair
    ? [parseInt(bayKey.replace('(', '').replace(')', '').slice(0, 2), 10), oddNum]
    : [oddNum, oddNum - 1, oddNum + 1].filter(b => b > 0);
  for (const [key] of posMap.entries()) {
    const [bb, t] = key.split('|').map(Number);
    if (bayNumsForTier.includes(bb) && Number.isFinite(t) && t > 0) {
      if (t >= 80) ediDeckSet.add(t);
      else ediHoldSet.add(t);
    }
  }
  // M6.94.9: user dict면 EDI tier union 절대 차단 (isUserSource 기준).
  //   이전 (!isUserOwnedBay): userBay 베이번호 매칭 실패 시 union 적용되어
  //   저장 직후엔 맞다가 나중에 EDI 로드하면 user tier에 EDI tier가 합쳐지던 버그.
  //   사용자 명시: 수정한 매트릭스는 절대 불변. AI 임시 사전(user 아님)만 EDI union.
  if (!isUserSource && deckTiers && Array.isArray(deckTiers)) {
    const merged = new Set([...deckTiers.map(Number), ...ediDeckSet]);
    deckTiers = [...merged].sort((a, b) => b - a);
  }
  if (!isUserSource && holdTiers && Array.isArray(holdTiers)) {
    const merged = new Set([...holdTiers.map(Number), ...ediHoldSet]);
    holdTiers = [...merged].sort((a, b) => b - a);
  }

  const nDeck = deckTiers.length;
  const nHold = holdTiers.length;


  // M6.93.12 fix #2: cells 우선순위 — userBay > override > v5 cells > v5 deckCells > fallback
  let deckCells, holdCells;
  // V7.38: .def override(defSource)는 무추측 원칙 — 명시 cells 또는 영역 가득(rowMax).
  //   v5 cells 추정이 .def 직사각을 피라미드로 왜곡하던 버그 제거 (KSKM bay01).
  //   PDF override(수기, cells 없음)는 기존 폴백 유지 (DJCT/SWAT 회귀 방지).
  const defStrict = !isUserSource && !!override?.defSource;
  if (!defStrict && userBay?.deckCells && userBay.deckCells.length > 0) {
    deckCells = userBay.deckCells.slice(0, nDeck);
  } else if (override?.deckCells && override.deckCells.length > 0) {
    deckCells = override.deckCells;
  } else if (defStrict) {
    deckCells = new Array(nDeck).fill(deckRowMax);
  } else if (bayData?.cells && bayData.cells.length > 0) {
    deckCells = bayData.cells.slice(0, nDeck);
  } else if (bayData?.deckCells && bayData.deckCells.length > 0) {
    deckCells = bayData.deckCells.slice(0, nDeck);
  } else {
    deckCells = new Array(nDeck).fill(deckRowMax);
  }
  if (!defStrict && userBay?.holdCells && userBay.holdCells.length > 0) {
    holdCells = userBay.holdCells.slice(0, nHold);
  } else if (override?.holdCells && override.holdCells.length > 0) {
    holdCells = override.holdCells;
  } else if (defStrict) {
    holdCells = new Array(nHold).fill(holdRowMax);
  } else if (bayData?.cells && bayData.cells.length > 0) {
    holdCells = bayData.cells.slice(nDeck, nDeck + nHold);
  } else if (bayData?.holdCells && bayData.holdCells.length > 0) {
    holdCells = bayData.holdCells.slice(0, nHold);
  } else {
    holdCells = new Array(nHold).fill(holdRowMax);
  }
  // 길이 보정 (cells 부족하면 rowMax로 채움)
  if (deckCells.length < nDeck) deckCells = [...deckCells, ...new Array(nDeck - deckCells.length).fill(deckRowMax)];
  if (holdCells.length < nHold) holdCells = [...holdCells, ...new Array(nHold - holdCells.length).fill(holdRowMax)];

  // M6.94.1: deck/hold 그리드 통일 (사용자 정정 모델 — BayPlan의 pageBayDictGrid와 동일 정신)
  //   기존 (M6.90.0): deck/hold 별도 폭 (deckRowMax vs holdRowMax) → 좌우 비대칭
  //   변경: 그리드 폭 = max(deckRowMax, holdRowMax) → deck/hold 같은 폭 → 중앙선 일치
  //   좁은 쪽(deck 또는 hold)은 align/padding으로 위치 결정 (홀 cells 안에서)
  // M6.94.7: deck/hold 폭 모두 cells 실제 max 기반 (rowCount/rowMax 아님 — 사용자 확정 원칙).
  // 매트릭스 빌더에 입력한 deck/hold cells가 폭의 기준. rowCount 필드는 옛값일 수 있어 무시.
  // 미리보기(buildEmptyBayRenderData)와 동일 계산 → 두 화면 일치.
  const _deckCellsMax = deckCells.map(Number).filter(v => v > 0).length ? Math.max(...deckCells.map(Number).filter(v => v > 0)) : deckRowMax;
  const _holdCellsMax = holdCells.map(Number).filter(v => v > 0).length ? Math.max(...holdCells.map(Number).filter(v => v > 0)) : holdRowMax;
  // V7.01 원본 방식 복원: cells_max가 곧 최종 폭(00 포함). +1 중복 금지(셀 늘어남 회귀).
  //   데크/홀드 hasZero만 따로 적용.
  const deckRowPos = getRowPositions(_deckCellsMax, deckHasZero);
  const holdRowPos = getRowPositions(_holdCellsMax, holdHasZero);
  const nDeckCols = deckRowPos.length;
  const nHoldCols = Math.min(holdRowPos.length, nDeckCols);

  const { marks: bayMarks, xrays: bayXrays, shifts: bayShifts, urgents: bayUrgents, luggs: bayLuggs, colors: bayColors, throughs: bayThroughs, shadow20s: bayShadow20s } = buildBayMarks(bayKey, posMap, pod, getSelfMarkFn, xrayMap, getColorKeyFn, isThroughFn, shiftMap, coveredBays);

  // deck tier별 셀 배열 (자리 통일: STANDARD_DECK 6 tier 모두 렌더)
  const deckRows = STANDARD_DECK.map((stdT) => {
    if (deckTiers.includes(stdT)) {
      const idx = deckTiers.indexOf(stdT);
      const cc = idx < deckCells.length ? deckCells[idx] : 0;
      const activeSet = getActiveColsSymmetric(cc, nDeckCols);
      const rowMarks = bayMarks.get(stdT) || new Map();
      const rowXrays = bayXrays.get(stdT) || new Map();
      const rowShifts = bayShifts.get(stdT) || new Map();
      const rowUrgents = bayUrgents.get(stdT) || new Map();
      const rowLuggs = bayLuggs.get(stdT) || new Map();
      const rowColors = bayColors.get(stdT) || new Map();
      const rowThroughs = bayThroughs.get(stdT) || new Map();
      const rowShadow20 = bayShadow20s.get(stdT) || new Map();
      const cells = [];
      for (let c = 0; c < nDeckCols; c++) {
        const rowLbl = deckRowPos[c];
        const inActive = activeSet.has(c);
        const mark = rowLbl ? (rowMarks.get(rowLbl) || null) : null;
        const isShadow20 = rowLbl ? !!rowShadow20.get(rowLbl) : false;
        // V9.04: 사용불가 셀(구조상 없는 자리)은 빈칸으로 — 단 실데이터(mark)가 있으면 데이터 우선(사전 오설정 안전장치).
        if (inActive && !mark && rowLbl && _blkDeckC.has(`${stdT}-${rowLbl}`)) {
          cells.push({ active: false, blocked: true, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
          continue;
        }
        if (inActive) {
          // M6.90.3: hull 단면 안쪽만 active. 바깥은 cell-empty (visibility:hidden) — 사용 못하는 셀 안 보임.
          cells.push({ active: true, rowLbl, mark, isXray: rowLbl ? !!rowXrays.get(rowLbl) : false, isShift: rowLbl ? !!rowShifts.get(rowLbl) : false, isUrgent: rowLbl ? !!rowUrgents.get(rowLbl) : false, isLugg: rowLbl ? !!rowLuggs.get(rowLbl) : false, colorKey: rowLbl ? (rowColors.get(rowLbl) || null) : null, isThrough: rowLbl ? !!rowThroughs.get(rowLbl) : false, isShadow20 });
        } else {
          cells.push({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
        }
      }
      return { tier: stdT, invisible: false, cells };
    } else {
      const cells = new Array(nDeckCols).fill(null).map(() => ({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false }));
      return { tier: stdT, invisible: true, cells };
    }
  });

  // M6.94.6: hold cells를 nHoldCols 폭으로만 생성 (active 가운데). 정수 offsetHold 제거.
  // deck 안에서의 좌우 위치는 BayBoxV2가 holdPadStyle(% DOM padding)으로 처리 → 0.5칸 여백 가능 → center 정중앙.
  const holdRows = STANDARD_HOLD.map((stdT) => {
    if (holdTiers.includes(stdT)) {
      const idx = holdTiers.indexOf(stdT);
      const cc = idx < holdCells.length ? holdCells[idx] : 0;
      const activeInHold = getActiveColsSymmetric(cc, nHoldCols);
      const rowMarks = bayMarks.get(stdT) || new Map();
      const rowXrays = bayXrays.get(stdT) || new Map();
      const rowShifts = bayShifts.get(stdT) || new Map();
      const rowUrgents = bayUrgents.get(stdT) || new Map();
      const rowLuggs = bayLuggs.get(stdT) || new Map();
      const rowColors = bayColors.get(stdT) || new Map();
      const rowThroughs = bayThroughs.get(stdT) || new Map();
      const rowShadow20 = bayShadow20s.get(stdT) || new Map();
      const cells = [];
      for (let c = 0; c < nHoldCols; c++) {
        const inActive = activeInHold.has(c);
        if (inActive) {
          const rowLbl = (c >= 0 && c < nHoldCols) ? holdRowPos[c] : null;
          const mark = rowLbl ? (rowMarks.get(rowLbl) || null) : null;
          const isShadow20 = rowLbl ? !!rowShadow20.get(rowLbl) : false;
          // V9.04: 사용불가 셀 — 실데이터(mark) 없을 때만 빈칸 처리(데이터 우선 안전장치).
          if (!mark && rowLbl && _blkHoldC.has(`${stdT}-${rowLbl}`)) {
            cells.push({ active: false, blocked: true, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
            continue;
          }
          cells.push({ active: true, rowLbl, mark, isXray: rowLbl ? !!rowXrays.get(rowLbl) : false, isShift: rowLbl ? !!rowShifts.get(rowLbl) : false, isUrgent: rowLbl ? !!rowUrgents.get(rowLbl) : false, isLugg: rowLbl ? !!rowLuggs.get(rowLbl) : false, colorKey: rowLbl ? (rowColors.get(rowLbl) || null) : null, isThrough: rowLbl ? !!rowThroughs.get(rowLbl) : false, isShadow20 });
        } else {
          cells.push({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
        }
      }
      return { tier: stdT, invisible: false, cells };
    } else {
      const cells = new Array(nHoldCols).fill(null).map(() => ({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false }));
      return { tier: stdT, invisible: true, cells };
    }
  });

  return {
    bayKey,
    isPair: bayKey.startsWith('('),
    deckTiers, holdTiers, nDeck, nHold, hasZero,
    deckRowPos, holdRowPos, nDeckCols, nHoldCols,
    deckRows, holdRows,
    // M6.94.0 사용자 시각 정렬/padding (BayBox에서 우선 적용)
    deckAlign: userBay?.deckAlign || 'center',
    deckPadLeft: typeof userBay?.deckPadLeft === 'number' ? userBay.deckPadLeft : 0,
    deckPadRight: typeof userBay?.deckPadRight === 'number' ? userBay.deckPadRight : 0,
    holdAlign: userBay?.holdAlign || 'center',
    holdPadLeft: typeof userBay?.holdPadLeft === 'number' ? userBay.holdPadLeft : 0,
    holdPadRight: typeof userBay?.holdPadRight === 'number' ? userBay.holdPadRight : 0,
    // V7.57: 해치커버 수 복구 — V7.05에서 computeBayRenderData를 V7.01 방식으로 원복할 때
    //   M6.94.13의 hatchCount 반환이 함께 누락됨 (카고플랜만 해치 등분 안 됨 회귀).
    //   M6.94.15: 페어는 짝수(even) 베이 우선, 없으면 홀수(odd). M6.94.44: 0 허용, 홀드 없으면 0.
    hatchCount: (() => {
      const findBay = (n) => {
        if (n == null || Number.isNaN(n)) return null;
        const k2 = String(n).padStart(2, '0');
        const k3 = String(n).padStart(3, '0');
        return shipBayDef?.baysSummary?.find(b => b.bayNo === k2 || b.bay === k3 || b.bay === k2) || null;
      };
      const evenNum = isPair ? parseInt(bayKey.replace('(', '').replace(')', '').slice(0, 2), 10) : null;
      let src = null;
      for (const n of [evenNum, oddNum]) {
        const e = findBay(n);
        if (e && typeof e.hatchCount === 'number') { src = e; break; }
      }
      return Math.max(0, Math.min(3, (typeof src?.hatchCount === 'number') ? src.hatchCount : ((holdTiers && holdTiers.length > 0) ? 1 : 0)));
    })(),
  };
}

// ------------------------------------------------------------
// 7. 기본 get_self_mark (검수앱이 확장해서 주입)
// ------------------------------------------------------------
// M6.81 기본 마크 7종: o, R, D, P, U, T, X
export function defaultGetSelfMark(c, pod) {
  if (c.pod !== pod) return 'X';
  if (c.dg) return 'D';
  const iso = c.iso || '';
  const typeChar = iso.length >= 3 ? iso[2] : 'G';
  // V9.28-07: 비표준 리퍼 코드 보강 — YKTD 2612E 실측: EDI가 4530(40ft 리퍼 HC, 온도 동봉)으로
  //   보낸 12대가 iso[2]='3'이라 R마크를 못 받아 "인식은 되는데 카고플랜엔 안 보이는" 상태였다.
  //   rf 플래그·isoToLabel(4530→40RF)을 함께 본다 — 카운트·리스트·카고플랜 판정 통일.
  if (typeChar === 'R' || c.rf || (isoToLabel(iso) || '').endsWith('RF')) return 'R';
  if (typeChar === 'P') return 'P';
  if (typeChar === 'U') return 'U';
  if (typeChar === 'T') return 'T';
  return 'o';
}

// ------------------------------------------------------------
// M6.94.0: 매트릭스 빌더용 — 컨테이너 없는 빈 베이 박스 데이터 생성
//   사용자가 베이사전 만들 때 1개 베이씩 시각 미리보기 (베이플랜).
//   bayEntry: { rowCount, hasZero, deckTiers, holdTiers, deckCells, holdCells,
//              deckAlign, deckPadLeft, deckPadRight, holdAlign, holdPadLeft, holdPadRight }
//   bayKey: 단독 '11' 또는 페어 '(12)13'
// ------------------------------------------------------------
export function buildEmptyBayRenderData(bayEntry, bayKey, isPair = false) {
  if (!bayEntry) return null;
  const {
    rowCount = 9, hasZero = true,
    deckTiers = [], holdTiers = [],
    deckCells = [], holdCells = [],
    deckAlign = 'center', deckPadLeft = 0, deckPadRight = 0,
    holdAlign = 'center', holdPadLeft = 0, holdPadRight = 0,
    deckHasZero, holdHasZero,
    blockedCells,   // V7.99-4: 중력 위반 자동 탐지 사용불가 셀 { deckBlocked:[{row,tier}], holdBlocked:[{row,tier}] }
  } = bayEntry;

  // blockedCells를 빠른 조회용 Set으로. 키 "tier-rowLbl"(rowLbl은 2자리 문자열).
  const _blkDeck = new Set((blockedCells?.deckBlocked || []).map(x => `${x.tier}-${String(x.row).padStart(2, '0')}`));
  const _blkHold = new Set((blockedCells?.holdBlocked || []).map(x => `${x.tier}-${String(x.row).padStart(2, '0')}`));

  // V7.03: 데크/홀드 00(가운데 row) 유무를 따로 적용. 선박에 따라 데크는 00 없고 홀드만 00 있음
  //   (예: ATPR BAY1 데크 08~07 / 홀드 04,02,00,01,03). 분리값 없으면 기존 통합 hasZero로 폴백(회귀 없음).
  const _deckHasZero = (deckHasZero != null) ? deckHasZero : hasZero;
  const _holdHasZero = (holdHasZero != null) ? holdHasZero : hasZero;

  // M6.94.7: nDeckCols를 deckCells 실제 max 기반으로 계산 (rowCount 필드 아님).
  // 매트릭스 빌더에서 deck cells를 6으로 줄여도 rowCount 필드는 옛값(8)으로 남아
  // 미리보기가 8칸으로 그려지던 버그 (카고플랜은 deckCells 기준 6, 베이상세는 rowCount 기준 8 불일치).
  // 사용자 확정: deck 폭 기준 = 매트릭스 빌더에 입력한 deck cells.
  const _deckCellsNums = deckCells.map(Number).filter(v => !isNaN(v) && v > 0);
  const _deckCellsMax = _deckCellsNums.length > 0 ? Math.max(..._deckCellsNums) : 0;
  const _effDeckRows = _deckCellsMax > 0 ? _deckCellsMax : rowCount;
  // 사용자 매트릭스 입력 기준: cells = 00 포함 전체 칸 수.
  //   데크00 체크 = 그 단에 00 row 있음 = cells(9) 안에 이미 00 포함(08,06,04,02,00,01,03,05,07).
  //   → +1 하면 00을 두 번 세서 10칸이 되고 없는 09가 생김(버그). cells 그대로가 폭.
  const nDeckCols = _effDeckRows;
  // nHoldCols 강제 통일 해제. 실제 hold cells 최대값 기준으로 계산.
  // hold 폭이 deck보다 작은 게 정상 (선체 형태). 차이만큼 BayBoxV2가 % padding으로 가운데.
  const _holdCellsNums = holdCells.map(Number).filter(v => !isNaN(v) && v > 0);
  const _holdCellsMax = _holdCellsNums.length > 0 ? Math.max(..._holdCellsNums) : 0;
  const nHoldCols = _holdCellsMax > 0
    ? Math.min(_holdCellsMax, nDeckCols)
    : nDeckCols;
  const deckRowPos = getRowPositions(nDeckCols, _deckHasZero);
  const holdRowPos = getRowPositions(nHoldCols, _holdHasZero);
  const nDeck = deckTiers.length;
  const nHold = holdTiers.length;

  // deck rows: STANDARD_DECK 순서대로, deckTiers에 있으면 active cells 표시, 없으면 invisible row
  const deckRows = STANDARD_DECK.map((stdT) => {
    if (deckTiers.map(Number).includes(stdT)) {
      const idx = deckTiers.map(Number).indexOf(stdT);
      const cc = idx < deckCells.length ? deckCells[idx] : 0;
      // cells = 00 포함 개수 → 그 tier의 active 칸 수 그대로 (00 자리 추가 안 함).
      const ccEff = cc;
      const active = getActiveColsSymmetric(ccEff, nDeckCols);
      const cells = [];
      for (let c = 0; c < nDeckCols; c++) {
        if (active.has(c)) {
          const rowLbl = deckRowPos[c];
          // V7.99-4: 중력 위반 사용불가 셀이면 비활성(빈칸)으로.
          if (_blkDeck.has(`${stdT}-${rowLbl}`)) {
            cells.push({ active: false, blocked: true, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
          } else {
            cells.push({ active: true, rowLbl, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
          }
        } else {
          cells.push({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
        }
      }
      return { tier: stdT, invisible: false, cells };
    } else {
      const cells = new Array(nDeckCols).fill(null).map(() => ({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false }));
      return { tier: stdT, invisible: true, cells };
    }
  });

  // M6.94.5: hold cells는 nHoldCols 폭으로만 생성 (active 가운데 정렬).
  // deck(nDeckCols) 안에서의 좌우 위치는 BayBoxV2가 holdPadStyle(% DOM padding)으로 처리.
  // 이전 (M6.94.0~M6.94.5초안): cells를 nDeckCols 폭 + 정수 offsetHold로 이동시켜서
  // deck8/hold7 같은 1칸 차이를 0.5칸씩 못 나눠 center가 왼쪽 쏠림 → "중앙정렬 안 됨".
  const holdRows = STANDARD_HOLD.map((stdT) => {
    if (holdTiers.map(Number).includes(stdT)) {
      const idx = holdTiers.map(Number).indexOf(stdT);
      const cc = idx < holdCells.length ? holdCells[idx] : 0;
      // cells = 00 포함 개수 → 그대로. (홀드00 미체크면 00 없는 cells)
      const ccEff = cc;
      const activeInHold = getActiveColsSymmetric(ccEff, nHoldCols);
      const cells = [];
      for (let c = 0; c < nHoldCols; c++) {
        if (activeInHold.has(c)) {
          const rowLbl = (c >= 0 && c < nHoldCols) ? holdRowPos[c] : null;
          // V7.99-4: 중력 위반 사용불가 셀이면 비활성(빈칸)으로.
          if (rowLbl != null && _blkHold.has(`${stdT}-${rowLbl}`)) {
            cells.push({ active: false, blocked: true, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
          } else {
            cells.push({ active: true, rowLbl, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
          }
        } else {
          cells.push({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false });
        }
      }
      return { tier: stdT, invisible: false, cells };
    } else {
      const cells = new Array(nHoldCols).fill(null).map(() => ({ active: false, rowLbl: null, mark: null, isXray: false, colorKey: null, isThrough: false, isShadow20: false }));
      return { tier: stdT, invisible: true, cells };
    }
  });

  return {
    bayKey,
    isPair,
    deckTiers: deckTiers.map(Number), holdTiers: holdTiers.map(Number),
    nDeck, nHold, hasZero,
    deckRowPos, holdRowPos, nDeckCols, nHoldCols,
    deckRows, holdRows,
    deckAlign, deckPadLeft, deckPadRight,
    holdAlign, holdPadLeft, holdPadRight,
    hatchCount: Math.max(0, Math.min(3, (typeof bayEntry?.hatchCount === 'number' ? bayEntry.hatchCount : ((holdTiers && holdTiers.length > 0) ? 1 : 0)))),  // M6.94.44: 0 허용. 홀드 없으면 0.
  };
}

// V9.57: buildBayGrid3D·fillBayGrid3D·resolveBayEntry 체인 삭제 — 저장소 전체 grep 참조 0
//   (V7.95 3D 좌표 매핑 시도 잔재. 진실원 buildEmptyBayRenderData는 그대로 살아 있음).
