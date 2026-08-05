// 베이사전 자동 보정 (M6.57)
//
// 목적:
//   v2 베이사전의 baysSummary가 entry별로 비어있거나 (예: PCBJ가 {bayNo, section, hasHold, hasDeck, isStandalone}만 있음),
//   사용자가 STOWAGE PDF로 정밀 등록하지 않은 선박이라도,
//   사용 가능한 모든 데이터 소스를 활용해서 카고플랜이 정상 그려질 수 있는 상태로 자동 보정.
//
// 설계 원칙:
//   1. verified 데이터는 절대 덮어쓰지 않음 — "비어있는 필드만" 채움
//   2. 보정 출처를 _enrichedFrom 메타로 명시 (디버그/검수용)
//   3. 부수 효과 없음 — 원본 entry 미수정, deep clone 후 보강
//
// Fallback 우선순위 (각 필드별):
//   L1: 베이 entry 자체에 이미 값 있음 (verified) → 그대로
//   L2: v5 매트릭스 (.def 자동 추출)
//   L3: v2 사전 level (전체 deckTiers/holdTiers, rowMaxEven/Odd)
//   L4: 안전한 default
//
// 변경 양식:
//   원본 entry: {bayNo: "01", hasHold: true, hasDeck: true}
//   보정 후:    {bayNo: "01", hasHold: true, hasDeck: true,
//                deckTiersLocal: [92,90,88,86,84,82,80],  // L3에서 보강
//                holdTiersLocal: [8,6,4,2],                // L3에서 보강
//                rowMaxEvenLocal: 8, rowMaxOddLocal: 7,   // L2 또는 L3
//                _enrichedFrom: {deckTiersLocal: 'L3', rowMaxEvenLocal: 'L2-v5'}}

/**
 * 베이사전 entry를 자동 보정.
 *
 * @param {object} entry         v2/v5/user/firebase의 베이사전 entry
 * @param {object} v5Matrix      v5 매트릭스 정보 (없으면 null)
 * @param {Array}  ediContainers M6.59: 현재 항차 EDI 컨테이너 배열 (없으면 null)
 *                                있으면 베이별 deckTiersLocal/holdTiersLocal을 EDI 실측 분포로 채움
 * @returns {object}             보정된 entry (deep clone, 원본 미수정)
 */
export function enrichBayDef(entry, v5Matrix, ediContainers = null, source = null) {
  if (!entry || !entry.bayDef) return entry;

  // ═══════════════════════════════════════════════════════════════
  // M6.94.0 사용자 원칙 1: 사용자가 저장한 베이구조는 AI 절대 수정 금지
  //   source='user'면 어떤 보강/추론/union도 안 함. entry 그대로 반환.
  //   L1, L2, L3, L4 모든 fallback 차단.
  //   사용자가 빈 배열로 입력한 것도 그대로 (의도 존중).
  // ═══════════════════════════════════════════════════════════════
  if (source === 'user') {
    return entry;
  }

  // M6.93.12 fix #4 (사용자 통찰: CASPI=고정 빈 구조, EDI가 베이사전 바꾸면 안 됨):
  //   source='user'면 EDI 자동 채움(L4) 절대 금지. 사용자 입력 그대로 사용.
  //   사용자가 입력한 hold 4단 [08,06,04,02]을 EDI에 없는 tier라고 [6,4,2]로 줄이는 사고 방지.
  const isUserSource = source === 'user';

  // deep clone (원본 보호)
  const enriched = JSON.parse(JSON.stringify(entry));
  const bd = enriched.bayDef;

  // M6.58: baysSummary가 빈 배열이거나 없으면 v5 매트릭스로 자동 생성
  //   STSE 같은 grade='needs-review' 선박이 v2에 등록되어 있지만 데이터가 빈약한 경우 대응
  //   v2 미수정 (deep clone 후 보강).
  const isBaysSummaryEmpty = !Array.isArray(bd.baysSummary) || bd.baysSummary.length === 0;
  if (isBaysSummaryEmpty && v5Matrix && Array.isArray(v5Matrix.matrixBays) && v5Matrix.matrixBays.length > 0) {
    bd.baysSummary = v5Matrix.matrixBays
      .filter(b => b.bayNum != null && typeof b.bayNum === 'number')
      .map(b => {
        const bayNum = b.bayNum;
        const isEvenBay = bayNum % 2 === 0;
        const entry = {
          bayNo: String(bayNum).padStart(2, '0'),
          // hasHold/hasDeck/isStandalone는 v5 정보로 가능한 만큼 (6.10 포맷은 hasHold 미정확)
          hasHold: !!b.hasHold,
          hasDeck: true,
          isStandalone: false,
          _enrichedFrom: { entry: 'L2-v5-matrix-auto-create' },
        };
        // row 폭 자동 계산
        if (b.maxRow > 0) {
          if (isEvenBay) {
            entry.rowMaxEvenLocal = b.maxRow % 2 === 0 ? b.maxRow : b.maxRow + 1;
            entry.rowMaxOddLocal = Math.max(entry.rowMaxEvenLocal - 1, 1);
          } else {
            entry.rowMaxOddLocal = b.maxRow % 2 === 1 ? b.maxRow : Math.max(b.maxRow - 1, 1);
            entry.rowMaxEvenLocal = entry.rowMaxOddLocal + 1;
          }
          entry._enrichedFrom.rowMaxEvenLocal = 'L2-v5-maxRow';
          entry._enrichedFrom.rowMaxOddLocal = 'L2-v5-maxRow';
        }
        return entry;
      });

    // bayList도 v5 bayNumbers로 보강
    if (Array.isArray(v5Matrix.bayNumbers) && v5Matrix.bayNumbers.length > 0) {
      bd.bayList = v5Matrix.bayNumbers
        .filter(n => n != null)
        .map(n => String(n).padStart(2, '0'))
        .sort();
    }

    // 보강 메타
    enriched._enrichMeta = {
      totalFieldsEnriched: bd.baysSummary.length,
      sourceCounts: { 'baysSummary-auto-create': bd.baysSummary.length },
      v5MatrixUsed: true,
      baysSummaryAutoCreated: true,
    };
  }

  if (!Array.isArray(bd.baysSummary)) return enriched;

  // 사전 level fallback 소스
  const shipDeckTiers = Array.isArray(bd.deckTiers) ? bd.deckTiers.map(Number) : [];
  const shipHoldTiers = Array.isArray(bd.holdTiers) ? bd.holdTiers.map(Number) : [];
  const shipRowMaxEven = typeof bd.rowMaxEven === 'number' ? bd.rowMaxEven : null;
  const shipRowMaxOdd = typeof bd.rowMaxOdd === 'number' ? bd.rowMaxOdd : null;

  // v5 매트릭스를 bayNum 기준 맵으로
  const v5ByBayNum = new Map();
  if (v5Matrix && Array.isArray(v5Matrix.matrixBays)) {
    v5Matrix.matrixBays.forEach(b => {
      if (b.bayNum != null) v5ByBayNum.set(b.bayNum, b);
    });
  }

  // 각 베이 entry 보정 (기존 로직)
  let totalEnriched = enriched._enrichMeta?.totalFieldsEnriched || 0;
  const enrichSources = enriched._enrichMeta?.sourceCounts || {};

  bd.baysSummary = bd.baysSummary.map(orig => {
    const bay = { ...orig };
    const bayNum = parseInt(bay.bayNo, 10);
    if (isNaN(bayNum)) return bay;
    const isEvenBay = bayNum % 2 === 0;
    const v5b = v5ByBayNum.get(bayNum);

    const sourcesUsed = bay._enrichedFrom || {};

    // ── deckTiersLocal ──────────────────────────────────────
    // L1 verified가 있으면 그대로
    if (!Array.isArray(bay.deckTiersLocal) || bay.deckTiersLocal.length === 0) {
      if (Array.isArray(bay.deckTiers) && bay.deckTiers.length > 0) {
        // L1 bay.deckTiers (옛 필드명)
        bay.deckTiersLocal = bay.deckTiers.map(Number);
        sourcesUsed.deckTiersLocal = 'L1-bay-deckTiers';
      } else if (bay.hasDeck !== false && shipDeckTiers.length > 0) {
        // L3 사전 level deckTiers
        bay.deckTiersLocal = [...shipDeckTiers];
        sourcesUsed.deckTiersLocal = 'L3-ship-deckTiers';
        totalEnriched++;
      }
    }

    // ── holdTiersLocal ──────────────────────────────────────
    if (!Array.isArray(bay.holdTiersLocal) || bay.holdTiersLocal.length === 0) {
      if (Array.isArray(bay.holdTiers) && bay.holdTiers.length > 0) {
        bay.holdTiersLocal = bay.holdTiers.map(Number);
        sourcesUsed.holdTiersLocal = 'L1-bay-holdTiers';
      } else if (bay.hasHold !== false && shipHoldTiers.length > 0) {
        bay.holdTiersLocal = [...shipHoldTiers];
        sourcesUsed.holdTiersLocal = 'L3-ship-holdTiers';
        totalEnriched++;
      }
    }

    // ── rowMaxEvenLocal / rowMaxOddLocal ────────────────────
    if (typeof bay.rowMaxEvenLocal !== 'number' || typeof bay.rowMaxOddLocal !== 'number') {
      // L2 v5 매트릭스 maxRow
      if (v5b && typeof v5b.maxRow === 'number' && v5b.maxRow > 0) {
        // v5의 maxRow는 해당 베이의 cell 폭. 짝수 베이면 maxRow가 짝수, 홀수 베이면 홀수에 가까움
        // 안전한 규칙: maxRow 그대로 + 반대편은 maxRow-1
        if (isEvenBay) {
          if (typeof bay.rowMaxEvenLocal !== 'number') {
            bay.rowMaxEvenLocal = v5b.maxRow % 2 === 0 ? v5b.maxRow : v5b.maxRow + 1;
            sourcesUsed.rowMaxEvenLocal = 'L2-v5-maxRow';
            totalEnriched++;
          }
          if (typeof bay.rowMaxOddLocal !== 'number') {
            bay.rowMaxOddLocal = Math.max(bay.rowMaxEvenLocal - 1, 1);
            sourcesUsed.rowMaxOddLocal = 'L2-v5-maxRow-derived';
          }
        } else {
          if (typeof bay.rowMaxOddLocal !== 'number') {
            bay.rowMaxOddLocal = v5b.maxRow % 2 === 1 ? v5b.maxRow : v5b.maxRow - 1;
            if (bay.rowMaxOddLocal < 1) bay.rowMaxOddLocal = 1;
            sourcesUsed.rowMaxOddLocal = 'L2-v5-maxRow';
            totalEnriched++;
          }
          if (typeof bay.rowMaxEvenLocal !== 'number') {
            bay.rowMaxEvenLocal = bay.rowMaxOddLocal + 1;
            sourcesUsed.rowMaxEvenLocal = 'L2-v5-maxRow-derived';
          }
        }
      } else {
        // L3 사전 level rowMaxEven/Odd
        if (typeof bay.rowMaxEvenLocal !== 'number' && shipRowMaxEven != null) {
          bay.rowMaxEvenLocal = shipRowMaxEven;
          sourcesUsed.rowMaxEvenLocal = 'L3-ship-rowMaxEven';
          totalEnriched++;
        }
        if (typeof bay.rowMaxOddLocal !== 'number' && shipRowMaxOdd != null) {
          bay.rowMaxOddLocal = shipRowMaxOdd;
          sourcesUsed.rowMaxOddLocal = 'L3-ship-rowMaxOdd';
          totalEnriched++;
        }
      }
    }

    // 보강 출처 기록 (있을 때만)
    if (Object.keys(sourcesUsed).length > 0) {
      bay._enrichedFrom = sourcesUsed;
      Object.keys(sourcesUsed).forEach(k => {
        enrichSources[k] = (enrichSources[k] || 0) + 1;
      });
    }

    return bay;
  });

  // M6.59: L4 EDI 실측 fallback — 베이별 deckTiersLocal/holdTiersLocal이 비어있고
  //   ediContainers가 주어졌으면 베이별 컨테이너 tier 분포로 자동 채움.
  //   80 기준 분리 (>=80 deck, <80 hold) — 카고플랜 표시 로직과 동일 규칙.
  //   짝수 베이는 양옆 홀수 베이의 40ft 컨테이너도 포함 (짝꿍 처리).
  //   M6.93.12 fix #4: source='user'면 EDI 자동 채움 차단. 사용자 입력은 절대 변경 안 함.
  if (!isUserSource && Array.isArray(ediContainers) && ediContainers.length > 0) {
    // 베이별 컨테이너 인덱싱
    const contsByBay = new Map();
    ediContainers.forEach(c => {
      const bn = parseInt(c.bay_actual || c.bay, 10);
      if (isNaN(bn) || bn === 0) return;
      if (!contsByBay.has(bn)) contsByBay.set(bn, []);
      contsByBay.get(bn).push(c);
    });

    let l4Enriched = 0;
    bd.baysSummary.forEach(bay => {
      const bayNum = parseInt(bay.bayNo, 10);
      if (isNaN(bayNum)) return;

      // 자기 베이 + 짝꿍 처리: 짝수면 양옆 홀수 베이의 40ft 컨테이너도 포함
      //   (실제 컨테이너가 짝수 베이를 차지하면 양옆 홀수 베이 좌표로 표시됨)
      const candidates = [];
      if (contsByBay.has(bayNum)) candidates.push(...contsByBay.get(bayNum));
      const isEvenBay = bayNum % 2 === 0;
      if (isEvenBay) {
        [bayNum - 1, bayNum + 1].forEach(odd => {
          if (odd <= 0) return;
          if (!contsByBay.has(odd)) return;
          // 40/45ft 컨테이너만 (짝꿍)
          contsByBay.get(odd).forEach(c => {
            const iso = String(c.iso || '').toUpperCase();
            const len = iso.charAt(0);
            if (len === '4' || len === 'L' || len === 'M' || len === 'N') candidates.push(c);
          });
        });
      }
      if (candidates.length === 0) return;

      // tier 분리
      const deckSet = new Set();
      const holdSet = new Set();
      candidates.forEach(c => {
        const t = parseInt(c.tier, 10);
        if (isNaN(t) || t <= 0) return;
        if (t >= 80) deckSet.add(t);
        else holdSet.add(t);
      });

      const sourcesUsed = bay._enrichedFrom || {};
      let bayUpdated = false;

      // deckTiersLocal 비어있으면 EDI에서 보강
      if ((!Array.isArray(bay.deckTiersLocal) || bay.deckTiersLocal.length === 0) && deckSet.size > 0) {
        bay.deckTiersLocal = [...deckSet].sort((a, b) => b - a);
        sourcesUsed.deckTiersLocal = 'L4-edi-actual';
        l4Enriched++;
        bayUpdated = true;
      }
      // holdTiersLocal 비어있으면 EDI에서 보강
      if ((!Array.isArray(bay.holdTiersLocal) || bay.holdTiersLocal.length === 0) && holdSet.size > 0) {
        bay.holdTiersLocal = [...holdSet].sort((a, b) => b - a);
        sourcesUsed.holdTiersLocal = 'L4-edi-actual';
        l4Enriched++;
        bayUpdated = true;
      }
      // hasHold/hasDeck도 EDI에서 보정 (false로 자동 생성됐다가 실제 컨테이너 있으면 true)
      if (holdSet.size > 0 && !bay.hasHold) {
        bay.hasHold = true;
        sourcesUsed.hasHold = 'L4-edi-actual';
        bayUpdated = true;
      }
      if (deckSet.size > 0 && !bay.hasDeck) {
        bay.hasDeck = true;
        sourcesUsed.hasDeck = 'L4-edi-actual';
        bayUpdated = true;
      }

      if (bayUpdated) {
        bay._enrichedFrom = sourcesUsed;
      }
    });

    if (l4Enriched > 0) {
      totalEnriched += l4Enriched;
      enrichSources['L4-edi-actual'] = (enrichSources['L4-edi-actual'] || 0) + l4Enriched;
    }
  }

  // 사전 level _enrichedMeta (디버그용) - M6.58: 기존 메타 보존하면서 누적
  if (totalEnriched > 0) {
    const prev = enriched._enrichMeta || {};
    enriched._enrichMeta = {
      ...prev,
      totalFieldsEnriched: totalEnriched,
      sourceCounts: { ...(prev.sourceCounts || {}), ...enrichSources },
      v5MatrixUsed: v5MaT_used(v5Matrix),
      ediUsed: Array.isArray(ediContainers) && ediContainers.length > 0,
    };
  }

  return enriched;
}

function v5MaT_used(v5) {
  if (!v5 || !v5.matrixBays) return false;
  return v5.matrixBays.length > 0;
}

/**
 * 보정 결과를 사람 읽기 좋은 형태로 (디버그용)
 */
export function describeEnrichment(enriched) {
  if (!enriched?._enrichMeta) return '보정 없음 (이미 완전)';
  const m = enriched._enrichMeta;
  const sources = Object.entries(m.sourceCounts)
    .map(([k, n]) => `${k}×${n}`).join(', ');
  return `필드 ${m.totalFieldsEnriched}개 자동 보정 (${sources})`;
}
