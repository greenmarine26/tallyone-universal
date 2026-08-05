// src/shipMatrixBuilder.js
// EDI/사전/PDF에서 베이 매트릭스 구축 — M6.93.1
//
// 우선순위 (사용자 가르침):
//   1. EDI: 적재된 row/tier 실데이터 (가장 신뢰)
//   2. 베이사전: EDI 부족분 보강 (rowCount, hasZero, tier max 등)
//   3. PDF: 베이사전에도 없을 때 사용자 요청 → 추가 보강
//   4. 사용자 폼: 최종 검증/cells 입력

import { getShipBayDictData } from './shipStructure.js';

/**
 * voyage.info에서 선박 메타데이터 자동 추출
 *   M5.87: EDI TDT 세그먼트에서 callsign + vsl 자동 추출됨
 * @param {Object} voyage
 * @returns {Object} { code, name, imo, callsign, voy }
 */
export function extractShipMetaFromVoyage(voyage) {
  const info = voyage?.info || {};
  const callsign = (info.callsign || '').toUpperCase().trim();
  const vsl = info.vsl || info.vesselName || info.name || '';
  const imo = info.imo || '';
  const voy = info.voy_d || info.voy_l || info.voy || '';

  // CASP 코드 자동 추론 (사용자가 모르므로 자동)
  //   우선순위:
  //   1) info.code (베이사전이 이미 매칭됐으면 갖고 있음)
  //   2) callsign 처음 4자 (예: V7A576 → V7A5)
  //   3) vsl 단어들 첫 글자 (예: SAWASDEE ATLANTIC → SAAT)
  //   4) vsl 처음 4자
  let code = info.code || '';
  if (!code && callsign && callsign.length >= 4) {
    code = callsign.substring(0, 4);
  }
  if (!code && vsl) {
    const words = vsl.toUpperCase().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      code = words.slice(0, 4).map(w => w[0]).join('');
      if (code.length < 4 && words[0]) code = (code + words[0].substring(1)).substring(0, 4);
    } else if (words[0]) {
      code = words[0].substring(0, 4);
    }
  }

  return { code: code || '', name: vsl, imo, callsign, voy };
}

/**
 * 빈 베이 엔트리 생성 (사용자가 직접 베이 추가 시)
 * 기본값: 일반 컨선 베이 구조
 * @param {string} bayNum - "001" 형식
 * @param {string|null} pairEven - 페어 짝수 번호 (단독이면 null)
 * @returns {Object} 매트릭스 엔트리
 */
export function createEmptyBayEntry(bayNum, pairEven = null) {
  return {
    bayNum: String(parseInt(bayNum)).padStart(3, '0'),
    pairEven,
    rowCount: 9,
    hasZero: true,
    deckTiers: [88, 86, 84, 82],
    holdTiers: [8, 6, 4, 2],
    deckCells: [9, 9, 9, 9],
    holdCells: [9, 9, 9, 9],
    // M6.94.0 새 필드: 데크-홀드 시각 정렬 + padding (사용자 시각 편집)
    deckAlign: 'center',  // 'left' | 'center' | 'right'
    deckPadLeft: 0,        // cells 단위 사용자 미세 조정
    deckPadRight: 0,
    holdAlign: 'center',
    holdPadLeft: 0,
    holdPadRight: 0,
    sourceRows: [],
    sourceTiers: [],
    rowTierPairs: [],
    source: 'user',
  };
}

/**
 * 1부터 max까지 빠진 베이를 "추정" entry로 채움 (사용자 요청).
 * 페어 짝꿍 짝수 (이미 홀수에 흡수)는 제외.
 * 추정 entry는 isEstimated=true 마크 → UI에서 시각 구분.
 * @param {Object} matrix
 * @returns {Object}
 */
export function fillEmptyBaysSequential(matrix) {
  const present = Object.keys(matrix.byBay).map(k => parseInt(k)).filter(n => Number.isFinite(n));
  if (present.length === 0) return matrix;
  const max = Math.max(...present);
  // 이미 페어 짝꿍으로 흡수된 짝수 (홀수 entry의 pairEven에 표시됨)
  const evenInPair = new Set();
  for (const e of Object.values(matrix.byBay)) {
    if (e.pairEven) evenInPair.add(parseInt(e.pairEven));
  }
  // V7.94-13: 사전이 적용됐으면 사전 베이 목록 밖 번호는 추정 채움 금지 (실선에 없는 베이)
  const dictSet = Array.isArray(matrix.dictBaySet) && matrix.dictBaySet.length > 0 ? new Set(matrix.dictBaySet) : null;
  // V7.94-15: 사전 없는 신규 선박 — EDI 관측 베이에 4의 배수가 하나도 없으면(트리오 01,02,03 / 05,06,07 … 구조)
  //   4의 배수는 실선에 없는 번호이므로 추정 채움 제외. 실사례: SWRG — 4,8,…,36 가짜 추정 9개 생성되던 문제.
  const observed4k = Object.entries(matrix.byBay || {}).some(([k, e]) => !e?.isEstimated && parseInt(k, 10) % 4 === 0);
  for (let n = 1; n <= max; n++) {
    if (n % 2 === 0 && evenInPair.has(n)) continue; // 페어 짝꿍은 skip
    if (dictSet && !dictSet.has(n)) continue;       // 사전에 없는 베이는 채우지 않음
    if (!dictSet && !observed4k && n % 4 === 0) continue; // 트리오 구조 선박의 4의 배수 채움 금지
    const key = String(n).padStart(3, '0');
    if (!matrix.byBay[key]) {
      const e = createEmptyBayEntry(key, null);
      e.source = '추정';
      e.isEstimated = true;
      matrix.byBay[key] = e;
    }
  }
  return matrix;
}

/**
 * 누락된 베이 추정 (베이 번호 패턴 기반)
 * 예: 01, 03, 05, 09, 11 있음 → 07 누락 의심
 *     02, 06, 08 있음 → 04 누락 의심
 * @param {Object} matrix
 * @returns {Array} [{bayNum, reason}, ...]
 */
export function detectMissingBays(matrix) {
  const present = Object.keys(matrix?.byBay || {}).map(k => parseInt(k)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (present.length < 2) return [];

  const presentSet = new Set(present);
  // M6.94.36: 페어 짝수(pairEven)도 "존재"로 인정.
  //   원인: 페어 베이는 홀수 키(023)에 pairEven=22로 들어있고 짝수 키(022)는 없음.
  //   그래서 이미 (22)23 페어로 존재하는 22가 "짝수 누락"으로 잘못 떴다.
  for (const k of Object.keys(matrix?.byBay || {})) {
    const pe = matrix.byBay[k]?.pairEven;
    const peN = parseInt(pe, 10);
    if (Number.isFinite(peN) && peN > 0) presentSet.add(peN);
  }
  const suggestions = [];

  // 홀수 베이 누락 (홀수 베이가 2개 이상 있을 때)
  const odds = present.filter(n => n % 2 === 1);
  if (odds.length >= 2) {
    const minO = odds[0];
    const maxO = odds[odds.length - 1];
    for (let n = minO; n <= maxO; n += 2) {
      if (!presentSet.has(n)) suggestions.push({ bayNum: String(n).padStart(3, '0'), reason: '홀수 패턴 누락' });
    }
  }

  // 짝수 베이 누락 (페어의 짝수)
  const evens = present.filter(n => n % 2 === 0);
  if (evens.length >= 2) {
    const minE = evens[0];
    const maxE = evens[evens.length - 1];
    for (let n = minE; n <= maxE; n += 2) {
      if (!presentSet.has(n)) suggestions.push({ bayNum: String(n).padStart(3, '0'), reason: '짝수 패턴 누락' });
    }
  }

  // BAY 01 누락 (홀수 패턴이 03부터 시작하는데 01은 베이 통상 있음)
  if (odds.length > 0 && odds[0] >= 3 && !presentSet.has(1)) {
    suggestions.unshift({ bayNum: '001', reason: 'BAY 01 통상 존재 (선수)' });
  }

  // 중복 제거
  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.bayNum)) return false;
    seen.add(s.bayNum);
    return true;
  });
}

/**
 * 매트릭스 분석 요약 (UI 상태 카드용)
 * @param {Object} matrix
 * @returns {Object} { totalBays, pairCount, singleCount, hasHoldCount, deckOnlyCount, needReviewCount }
 */
export function summarizeMatrix(matrix) {
  const bays = Object.values(matrix?.byBay || {});
  let pairCount = 0;
  let singleCount = 0;
  let hasHoldCount = 0;
  let deckOnlyCount = 0;
  let needReviewCount = 0;
  let estimatedCount = 0;
  for (const b of bays) {
    if (b.pairEven) pairCount++; else singleCount++;
    if (b.holdTiers && b.holdTiers.length > 0) hasHoldCount++;
    if ((!b.holdTiers || b.holdTiers.length === 0) && b.deckTiers && b.deckTiers.length > 0) deckOnlyCount++;
    if (!b.rowCount || b.rowCount < 5 || (!b.deckTiers?.length && !b.holdTiers?.length)) {
      needReviewCount++;
    }
    if (b.isEstimated) estimatedCount++;
  }
  return {
    totalBays: bays.length,
    pairCount, singleCount,
    hasHoldCount, deckOnlyCount,
    needReviewCount, estimatedCount,
  };
}

/**
 * 매트릭스 분석 요약 (UI 상태 카드용) — pad 헬퍼는 아래
 */

const pad3 = b => String(parseInt(b)).padStart(3, '0');
const pad2 = n => String(n).padStart(2, '0');

/**
 * EDI containers → 베이별 매트릭스 후보
 * @param {Array} containers - parseBAPLIE 결과
 * @returns {Object} { byBay: { '001': {rowCount, hasZero, deckTiers, holdTiers, sourceRows, sourceTiers, deckCells, holdCells}, ... } }
 */
export function buildMatrixFromEdi(containers) {
  const byBay = {};
  for (const c of containers) {
    if (!c.bay || !c.row || !c.tier) continue;
    // M6.94.36: 비숫자 bay 차단 — parseInt('NaN')/비숫자가 byBay['NaN'] 유령 베이를 만들던 버그.
    const bayN = parseInt(c.bay, 10);
    if (!Number.isFinite(bayN) || bayN <= 0) continue;
    // V7.94-13: BAPLIE '위치 미정' 관례 코드(LOC+147+0999999 → 99-99-99) 제외
    //   실사례: MCSN 622N — 미정 1대가 max를 99로 끌어올려 1~max 자동 채움이 95베이 쓰레기 생성.
    if (bayN === 99 && parseInt(c.row, 10) === 99 && parseInt(c.tier, 10) === 99) continue;
    const b = pad3(c.bay);
    if (!byBay[b]) {
      byBay[b] = {
        bayNum: b,
        sourceRows: new Set(),
        sourceTiers: new Set(),
        rowTierPairs: new Set(), // "row-tier" — cells 계산용
      };
    }
    byBay[b].sourceRows.add(pad2(c.row));
    byBay[b].sourceTiers.add(pad2(c.tier));
    byBay[b].rowTierPairs.add(`${pad2(c.row)}-${pad2(c.tier)}`);
  }

  // 각 베이 매트릭스 계산
  for (const b of Object.keys(byBay)) {
    const entry = byBay[b];
    const rows = Array.from(entry.sourceRows).sort();
    const tiers = Array.from(entry.sourceTiers).sort();

    // rowCount: 실 적재 row max → 일반 컨선 row 패턴 추정
    // hasZero: 00 있으면 true
    const hasZero = rows.includes('00');
    // row max (홀짝 분리)
    const oddMax = Math.max(...rows.filter(r => parseInt(r) % 2 === 1).map(Number), 0);
    const evenMax = Math.max(...rows.filter(r => parseInt(r) % 2 === 0).map(Number), 0);
    // rowCount 추정: max 짝수 + max 홀수 (+1 if hasZero)
    // 예: oddMax=9, evenMax=10, hasZero=true → 11 rows (10,8,6,4,2,0,1,3,5,7,9)
    //     oddMax=9, evenMax=10, hasZero=false → 10 rows
    let rowCount = 0;
    if (oddMax > 0 || evenMax > 0) {
      const odds = oddMax > 0 ? Math.floor(oddMax / 2) + 1 : 0; // 1,3,5,7,9 → max 9면 5개
      const evens = evenMax > 0 ? Math.floor(evenMax / 2) : 0;  // 2,4,6,8,10 → max 10면 5개
      rowCount = odds + evens + (hasZero ? 1 : 0);
    }

    // deck/hold 분리: tier ≥ 80 = deck, < 80 = hold (관행)
    const deckTiers = tiers.filter(t => parseInt(t) >= 80).map(Number).sort((a, b) => b - a);
    const holdTiers = tiers.filter(t => parseInt(t) < 80).map(Number).sort((a, b) => b - a);

    // M6.93.9: cells 기본 = rowCount (hull 가득).
    //   이전: 컨테이너 개수 기반 → 적재 적은 tier에서 hull 좁아져 셀 누락 (사용자 보고).
    //   EDI는 컨테이너 분포만 알려주지 실제 hull 단면은 모름.
    //   정확한 cells는 PDF 업로드 또는 사용자 모달에서 수정.
    const deckCells = deckTiers.map(() => rowCount);
    const holdCells = holdTiers.map(() => rowCount);

    entry.rowCount = rowCount;
    entry.hasZero = hasZero;
    entry.deckTiers = deckTiers;
    entry.holdTiers = holdTiers;
    entry.deckCells = deckCells;
    entry.holdCells = holdCells;
    entry.source = 'edi';
    // 정리 (직렬화 위해)
    entry.sourceRows = rows;
    entry.sourceTiers = tiers;
    entry.rowTierPairs = Array.from(entry.rowTierPairs);
  }

  // ===== Pass 2: 페어링 후처리 (사용자 규칙) =====
  //   짝수 b의 양옆 (b-1, b+1) 둘 다 있어야 페어 짝꿍.
  //   페어 시: b는 b+1의 짝꿍 → byBay[b+1].pairEven = b, byBay[b] 삭제
  //   양옆 한쪽만/둘 다 없음 → b는 단독 (orphan_even, entry 유지)
  const bayIntsP = Object.keys(byBay).map(k => parseInt(k)).filter(n => Number.isFinite(n)).sort((a,b) => a-b);
  const baySetP = new Set(bayIntsP);
  for (const b of bayIntsP) {
    if (b % 2 !== 0) continue;
    if (!baySetP.has(b - 1) || !baySetP.has(b + 1)) continue; // 양옆 둘 다 없으면 단독 (orphan_even)
    const evenStr = pad3(b);
    const oddStr = pad3(b + 1);
    const evenE = byBay[evenStr];
    const oddE = byBay[oddStr];
    if (!evenE || !oddE) continue;

    // 짝수 row/tier → 홀수 entry에 합치기 (중복 제거)
    const rowSet = new Set([...oddE.sourceRows, ...evenE.sourceRows]);
    const tierSet = new Set([...oddE.sourceTiers, ...evenE.sourceTiers]);
    const pairSet = new Set([...oddE.rowTierPairs, ...evenE.rowTierPairs]);
    oddE.sourceRows = Array.from(rowSet).sort();
    oddE.sourceTiers = Array.from(tierSet).sort();
    oddE.rowTierPairs = Array.from(pairSet);

    // rowCount, hasZero, tier, cells 재계산
    const rows = oddE.sourceRows;
    oddE.hasZero = rows.includes('00');
    const oddMaxR = Math.max(...rows.filter(r => parseInt(r) % 2 === 1).map(Number), 0);
    const evenMaxR = Math.max(...rows.filter(r => parseInt(r) % 2 === 0).map(Number), 0);
    const oddCnt = oddMaxR > 0 ? Math.floor(oddMaxR / 2) + 1 : 0;
    const evenCnt = evenMaxR > 0 ? Math.floor(evenMaxR / 2) : 0;
    oddE.rowCount = oddCnt + evenCnt + (oddE.hasZero ? 1 : 0);

    const allT = oddE.sourceTiers;
    oddE.deckTiers = allT.filter(t => parseInt(t) >= 80).map(Number).sort((a, b) => b - a);
    oddE.holdTiers = allT.filter(t => parseInt(t) < 80).map(Number).sort((a, b) => b - a);
    // M6.93.9: cells = rowCount (hull 가득). 컨테이너 분포 기반 X.
    oddE.deckCells = oddE.deckTiers.map(() => oddE.rowCount);
    oddE.holdCells = oddE.holdTiers.map(() => oddE.rowCount);

    // 페어 표시
    oddE.pairEven = pad2(b);
    oddE.source = (oddE.source || 'edi') + '+pair';

    // 짝수 entry 삭제 (홀수가 페어 박스 대표)
    delete byBay[evenStr];
  }

  return { byBay };
}

/**
 * 베이사전 데이터로 EDI 매트릭스 보강
 * @param {Object} matrix - buildMatrixFromEdi 결과
 * @param {string} imo
 * @param {string} code
 * @returns {Object} 보강된 matrix + bayDict 메타
 */
export function augmentMatrixFromBayDict(matrix, imo, code) {
  const dictData = getShipBayDictData(imo, code);
  if (!dictData) {
    return { ...matrix, bayDictUsed: false };
  }

  const baysSummary = dictData.bayDef?.baysSummary || [];

  // V7.94-12: 정합성 게이트 — 약자 재사용(용선 교체) 충돌 방어 (실사례: MCSN가 과거 SPIL NIKEN 코드)
  //   EDI에서 실측된 최대 베이가 사전의 최대 베이보다 크면 = 사전이 더 작은(다른) 배 → 사전 적용 거부.
  //   원칙: EDI 실측이 진실, 사전은 보강일 뿐 — 사전이 실측을 못 덮으면 신뢰 불가.
  const ediBays = Object.keys(matrix.byBay || {}).map(b => parseInt(b, 10)).filter(Number.isFinite);
  const dictBays = baysSummary.map(bs => parseInt(bs.bayNo ?? bs.bay, 10)).filter(Number.isFinite);
  if (ediBays.length > 0 && dictBays.length > 0) {
    const ediMax = Math.max(...ediBays);
    const dictMax = Math.max(...dictBays);
    if (ediMax > dictMax) {
      return {
        ...matrix,
        bayDictUsed: false,
        bayDictRejected: {
          name: dictData.name,
          code: dictData.code || code,
          reason: `EDI 실측 최대 베이 ${ediMax} > 사전 최대 베이 ${dictMax} — 다른 선박의 사전(약자 재사용 의심)`,
        },
      };
    }
  }
  // V7.94-12: PDF box-region 오염 entry 거부 (실사례: MCSN 등 8척 — bayNo 00 + 트리오 3번째 베이 결손)
  //   오염 entry로 보강하면 베이 구조 전체가 무너지므로 사전 미적용 (entry 데이터 자체는 보존).
  if (dictBays.length > 0) {
    const baySet = new Set(dictBays);
    let miss3 = 0;
    for (let g = 1; g <= 97; g += 4) {
      if (baySet.has(g) && baySet.has(g + 1) && !baySet.has(g + 2)) miss3++;
    }
    if (baySet.has(0) && miss3 >= 2) {
      return {
        ...matrix,
        bayDictUsed: false,
        bayDictRejected: {
          name: dictData.name,
          code: dictData.code || code,
          reason: `사전 베이 목록 오염 의심(00 베이 + 트리오 결손 ${miss3}건, PDF 자동 파싱 오류) — 미적용`,
        },
      };
    }
  }
  for (const bs of baysSummary) {
    const bay = pad3(bs.bay ?? bs.bayNo);   // V7.94-12: V2 사전은 bayNo 필드
    if (!matrix.byBay[bay]) {
      // EDI에 없는 베이도 사전에서 추가 (빈 베이)
      matrix.byBay[bay] = {
        bayNum: bay,
        sourceRows: [],
        sourceTiers: [],
        rowTierPairs: [],
        rowCount: 0,
        hasZero: false,
        deckTiers: [],
        holdTiers: [],
        deckCells: [],
        holdCells: [],
        source: 'baydict',
      };
    }
    const entry = matrix.byBay[bay];
    if (typeof bs.hatchCount === 'number' && typeof entry.hatchCount !== 'number') entry.hatchCount = bs.hatchCount;  // M6.94.44: 0 포함 복원
    // 베이사전이 더 큰 rowCount/tier 가지고 있으면 그것 사용
    if (bs.rowMaxOdd != null || bs.rowMaxEven != null) {
      // 베이사전 row max 정보로 보강
      const dictOddMax = bs.rowMaxOdd || 0;
      const dictEvenMax = bs.rowMaxEven || 0;
      const dictHasZero = !!bs.hasZero || entry.hasZero;
      const odds = dictOddMax > 0 ? Math.floor(dictOddMax / 2) + 1 : 0;
      const evens = dictEvenMax > 0 ? Math.floor(dictEvenMax / 2) : 0;
      const dictRowCount = odds + evens + (dictHasZero ? 1 : 0);
      if (dictRowCount > entry.rowCount) {
        entry.rowCount = dictRowCount;
        entry.hasZero = dictHasZero;
        entry.source = entry.source === 'edi' ? 'edi+dict' : 'baydict';
      }
    }
    // tier 정보 (사전이 더 풍부하면 채택)
    if (bs.deckTiers && bs.deckTiers.length > entry.deckTiers.length) {
      entry.deckTiers = [...bs.deckTiers].sort((a, b) => b - a);
      // cells 재구성 (cells 정보가 사전에 없으면 rowCount로 기본 채움)
      entry.deckCells = entry.deckTiers.map(() => entry.rowCount);
      entry.source = entry.source.includes('dict') ? entry.source : entry.source + '+dict';
    }
    if (bs.holdTiers && bs.holdTiers.length > entry.holdTiers.length) {
      entry.holdTiers = [...bs.holdTiers].sort((a, b) => b - a);
      entry.holdCells = entry.holdTiers.map(() => entry.rowCount);
      entry.source = entry.source.includes('dict') ? entry.source : entry.source + '+dict';
    }
  }

  // V7.94-13: 사전 베이 목록 기록 — 자동 채움이 사전에 없는 베이(4의 배수 등 실선 부재)를 만들지 않게
  const dictBaySet = [...new Set(dictBays)];
  return { ...matrix, bayDictUsed: true, bayDictMeta: { imo, code, name: dictData.name }, dictBaySet };
}

/**
 * PDF 파싱 결과로 매트릭스 보강
 * @param {Object} matrix
 * @param {Object} pdfResult - pdfBayParser.parsePdfStowage 결과
 * @returns {Object}
 */
export function augmentMatrixFromPdf(matrix, pdfResult) {
  if (!pdfResult || !pdfResult.bays) return matrix;
  let added = 0;
  let augmented = 0;
  for (const pb of pdfResult.bays) {
    const bay = pad3(pb.bayNum);
    const isNew = !matrix.byBay[bay];
    if (isNew) {
      matrix.byBay[bay] = { bayNum: bay, source: 'pdf', sourceRows: [], sourceTiers: [], rowTierPairs: [] };
      added++;
    } else {
      augmented++;
    }
    const entry = matrix.byBay[bay];
    // PDF가 더 큰 rowCount 가지고 있으면 채택 (또는 entry.rowCount=0이면 무조건)
    if ((pb.rowCount || 0) > (entry.rowCount || 0)) {
      entry.rowCount = pb.rowCount;
      entry.hasZero = pb.hasZero;
    }
    // tier: PDF가 더 풍부하거나, 기존 비어있으면 채택
    if (pb.deckTiers && pb.deckTiers.length > 0 && pb.deckTiers.length > (entry.deckTiers?.length || 0)) {
      entry.deckTiers = [...pb.deckTiers].sort((a, b) => b - a);
      entry.deckCells = pb.deckCells || entry.deckTiers.map(() => entry.rowCount);
    }
    if (pb.holdTiers && pb.holdTiers.length > 0 && pb.holdTiers.length > (entry.holdTiers?.length || 0)) {
      entry.holdTiers = [...pb.holdTiers].sort((a, b) => b - a);
      entry.holdCells = pb.holdCells || entry.holdTiers.map(() => entry.rowCount);
    }
    // 페어 정보 (사용자 규칙: 짝수 양옆 둘 다 있을 때만 페어 — PDF 표기 그대로 신뢰)
    if (pb.pairEven) entry.pairEven = pb.pairEven;
    entry.source = entry.source && entry.source !== 'pdf' ? entry.source + '+pdf' : 'pdf';
  }
  matrix.pdfUsed = true;
  matrix.pdfStats = { added, augmented, totalPdfBays: pdfResult.bays.length };
  return matrix;
}

/**
 * .def 단면 디코드 결과로 매트릭스 보강 — V7.36
 * .def는 설계 원본(PDF 대조 검증 완료)이므로 EDI 추정값을 덮어쓴다.
 * 단, 매트릭스 빌더 안에서의 보강이므로 사용자 확인·수정 후 저장된다 (userBayDict 절대 보호와 무관).
 * @param {Object} matrix
 * @param {Object} defResult - defSectionParser.parseDefSections 결과
 * @returns {Object}
 */
export function augmentMatrixFromDef(matrix, defResult) {
  if (!defResult || defResult.error || !defResult.bays) return matrix;
  let added = 0, augmented = 0;
  for (const bayNo of defResult.order || []) {
    const e = defResult.bays[bayNo];
    if (!e) continue;
    const bay = pad3(bayNo);
    if (!matrix.byBay[bay]) {
      matrix.byBay[bay] = { bayNum: bay, source: 'def', sourceRows: [], sourceTiers: [], rowTierPairs: [] };
      added++;
    } else {
      augmented++;
    }
    const m = matrix.byBay[bay];
    // .def가 정답 — rowCount/hasZero/tier를 덮어씀
    m.rowCount = e.rowCount;
    m.hasZero = e.hasZero;
    m.deckHasZero = e.hasZero;
    m.holdHasZero = (e.holdRows || []).includes('00');
    m.deckTiers = [...e.deckTiers];
    m.deckCells = e.deckTiers.map(() => e.rowCount);
    m.holdTiers = [...e.holdTiers];
    // 홀드 폭은 .def의 홀드 행 수 (데크보다 좁은 베이 — 예: NBTD bay01 데크6/홀드4)
    const holdW = (e.holdRows && e.holdRows.length) ? e.holdRows.length : e.rowCount;
    m.holdCells = e.holdTiers.map(() => holdW);
    m.sourceRows = [...e.deckRows];
    m.sourceTiers = [...e.holdTiers, ...e.deckTiers].map(String);
    m.source = m.source && m.source !== 'def' ? m.source + '+def' : 'def';
  }
  // 미확정 베이는 검토 필요 표시
  for (const bayNo of defResult.unparsedBays || []) {
    const bay = pad3(bayNo);
    if (!matrix.byBay[bay]) {
      matrix.byBay[bay] = { ...createEmptyBayEntry(bay), source: 'def-unparsed', isEstimated: true };
      added++;
    } else {
      matrix.byBay[bay].isEstimated = true;
    }
  }
  matrix.defUsed = true;
  matrix.defStats = {
    added, augmented,
    format: defResult.format,
    unparsed: (defResult.unparsedBays || []).length,
    warnings: defResult.warnings || [],
  };
  return matrix;
}

/**
 * 매트릭스 → userBayDict entry 형식 변환
 * @param {Object} matrix
 * @param {string} code
 * @param {string} name
 * @param {string} imo
 * @param {string} callsign  M6.94.5: 추가 — 단일 책임 (호출처에서 따로 보강 X)
 * @returns {Object} bayDictEntry
 */
export function matrixToBayDictEntry(matrix, code, name, imo, callsign) {
  const baysSummary = Object.keys(matrix.byBay)
    // M6.94.36: 깨진 베이 키(NaN/0/비숫자)는 저장에서 제외 — 유령 entry 영구 제거.
    .filter(bay => { const n = parseInt(bay, 10); return Number.isFinite(n) && n > 0; })
    .sort().map(bay => {
    const e = matrix.byBay[bay];
    return {
      bay,                                                    // '001' 3자리
      bayNo: String(parseInt(bay)).padStart(2, '0'),          // '01' 2자리 (v2 호환)
      rowCount: e.rowCount,
      hasZero: e.hasZero,
      deckHasZero: e.deckHasZero != null ? e.deckHasZero : e.hasZero,  // 데크 00 (없으면 통합 hasZero 폴백)
      holdHasZero: e.holdHasZero != null ? e.holdHasZero : e.hasZero,  // 홀드 00
      deckTiers: e.deckTiers,
      holdTiers: e.holdTiers,
      deckCells: e.deckCells,
      holdCells: e.holdCells,
      hasDeck: e.deckTiers && e.deckTiers.length > 0,
      hasHold: e.holdTiers && e.holdTiers.length > 0,
      hatchCount: (typeof e.hatchCount === 'number') ? e.hatchCount : ((e.holdTiers && e.holdTiers.length > 0) ? 1 : 0),  // M6.94.44: 0=해치 없음. 홀드 없는 베이 기본 0.
      pairEven: e.pairEven || null,
      source: e.source,
      // M6.94.0 새 필드: 데크-홀드 시각 정렬 + padding (사용자 시각 편집 저장)
      deckAlign: e.deckAlign || 'center',
      deckPadLeft: typeof e.deckPadLeft === 'number' ? e.deckPadLeft : 0,
      deckPadRight: typeof e.deckPadRight === 'number' ? e.deckPadRight : 0,
      holdAlign: e.holdAlign || 'center',
      holdPadLeft: typeof e.holdPadLeft === 'number' ? e.holdPadLeft : 0,
      holdPadRight: typeof e.holdPadRight === 'number' ? e.holdPadRight : 0,
      // V7.99-4: 중력 위반 사용불가 셀(자동 탐지/수동 보정) 보존.
      ...(e.blockedCells ? { blockedCells: e.blockedCells } : {}),
    };
  });
  return {
    imo: imo || '',
    code: code || '',
    name: name || '',
    callsign: callsign || '',  // M6.94.5: 인자로 받음 (이전엔 ''로 하드코딩)
    bayDef: {
      // M6.94.4: 카고플랜이 사용자 데이터로 인식하도록 source/_userOwned 명시
      //   원인: 이게 없으면 cargoPlanCore의 isUserSource=false → 자동 보강 분기로 흘러
      //   사용자 매트릭스 빌더 정의(cells/rowCount/tiers)가 카고플랜에 반영 안 됨.
      source: 'user',
      _userOwned: true,
      recordCount: baysSummary.length,
      sourceFile: 'matrix_builder',
      parsedAt: new Date().toISOString(),
      sourceVersion: 'M6.94.5',
      verified: true,
      baysSummary,
    },
  };
}

/**
 * 저장된 userBayDict entry → 매트릭스 역변환 (모달 재오픈 시 복원용)
 * @param {Object} entry - lookupUserBayDict 결과
 * @returns {Object|null} matrix
 */
export function bayDictEntryToMatrix(entry) {
  if (!entry?.bayDef?.baysSummary?.length) return null;
  const byBay = {};
  for (const bs of entry.bayDef.baysSummary) {
    if (!bs.bay) continue;
    // M6.94.36: 깨진 베이 번호(NaN/0/비숫자) 차단 — "BAY NaN" 유령 entry 방지.
    const bayN = parseInt(bs.bay, 10);
    if (!Number.isFinite(bayN) || bayN <= 0) continue;
    const bayKey = String(bayN).padStart(3, '0');
    byBay[bayKey] = {
      bayNum: bayKey,
      rowCount: bs.rowCount || 0,
      hasZero: !!bs.hasZero,
      deckHasZero: bs.deckHasZero != null ? !!bs.deckHasZero : !!bs.hasZero,
      holdHasZero: bs.holdHasZero != null ? !!bs.holdHasZero : !!bs.hasZero,
      deckTiers: Array.isArray(bs.deckTiers) ? [...bs.deckTiers] : [],
      holdTiers: Array.isArray(bs.holdTiers) ? [...bs.holdTiers] : [],
      deckCells: Array.isArray(bs.deckCells) ? [...bs.deckCells] : [],
      holdCells: Array.isArray(bs.holdCells) ? [...bs.holdCells] : [],
      hatchCount: (typeof bs.hatchCount === 'number') ? bs.hatchCount : ((Array.isArray(bs.holdTiers) && bs.holdTiers.length > 0) ? 1 : 0),   // M6.94.44: 저장된 해치 수 복원(0 보존). 홀드 없으면 0.
      pairEven: bs.pairEven || null,
      source: bs.source || 'saved',
      // M6.94.0 새 필드: 데크-홀드 시각 정렬 + padding (기본값으로 fallback, 기존 데이터 호환)
      deckAlign: bs.deckAlign || 'center',
      deckPadLeft: typeof bs.deckPadLeft === 'number' ? bs.deckPadLeft : 0,
      deckPadRight: typeof bs.deckPadRight === 'number' ? bs.deckPadRight : 0,
      holdAlign: bs.holdAlign || 'center',
      holdPadLeft: typeof bs.holdPadLeft === 'number' ? bs.holdPadLeft : 0,
      holdPadRight: typeof bs.holdPadRight === 'number' ? bs.holdPadRight : 0,
      ...(bs.blockedCells ? { blockedCells: bs.blockedCells } : {}),   // V7.99-4: 사용불가 셀 복원
      sourceRows: [],
      sourceTiers: [],
      rowTierPairs: [],
    };
  }
  return { byBay, fromSaved: true, savedAt: entry.bayDef.parsedAt || '' };
}
