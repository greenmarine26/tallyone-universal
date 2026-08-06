// 시뮬 픽스처 — NSFR 검수사 정본 매트릭스(matrix_builder 저장본) 재현.
//
// ⚠ 왜 픽스처인가 — tallyuni-gm DB 의 `ship_bay_dict_v3` 는 **null(항목 0)** 이다(2026-08-06 실측,
//    범용판 빈깡통 원칙). 그래서 절차서 §4 가 요구하는 "실제 Firebase 항목"을 이 DB 에서 받을 수 없다.
//    대신 절차서 §1-1 이 실측으로 남긴 정본 앱 NSFR 값(source:'user' · _userOwned:true ·
//    sourceFile:'matrix_builder' · 22베이 · BAY01 holdCells[3,1,1]·holdTiers[8,6,4]·deckCells[7,7,7,7])과
//    `matrixToBayDictEntry` 의 실제 필드 모양을 그대로 재현한다.
//    베이 목록 22개는 이 저장소가 번들한 v5 매트릭스 NSFR 의 bayNumbers 를 쓴다
//    (절차서 §4 한계: "NSFR은 우연히 번들 v5 베이목록이 검수사 목록과 같아 둘 다 22베이").
//
// 재현의 핵심: v2 임베드 NSFR(자동본 auto-box-region)은 BAY27 holdTiers[8,6,4] · BAY28 [8,6] 을 갖는데
//   검수사 정본은 그 두 베이의 홀드를 비웠다. 조회 경로가 firebase 면 v2 union 이 그 홀드를 되살린다.

const BAY_NUMBERS = [1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29];

// 검수사가 홀드를 비운 베이 — v2 자동본에는 홀드가 있다(오염 재현 대상)
const NO_HOLD = new Set([27, 28]);

function bayEntry(n) {
  const hasHold = !NO_HOLD.has(n);
  const deckTiers = [92, 90, 88, 86, 84, 82];
  const holdTiers = hasHold ? [8, 6, 4] : [];
  return {
    bay: String(n).padStart(3, '0'),
    bayNo: String(n).padStart(2, '0'),
    rowCount: 8,
    hasZero: true,
    deckHasZero: true,
    holdHasZero: true,
    deckTiers,
    holdTiers,
    deckCells: [7, 7, 7, 7],
    holdCells: hasHold ? [3, 1, 1] : [],
    hasDeck: true,
    hasHold,
    hatchCount: hasHold ? 1 : 0,
    pairEven: null,
    source: 'matrix',
    deckAlign: 'center',
    deckPadLeft: 0,
    deckPadRight: 0,
    holdAlign: 'center',
    holdPadLeft: 0,
    holdPadRight: 0,
  };
}

export function makeNsfrFbEntry() {
  const baysSummary = BAY_NUMBERS.map(bayEntry);
  return {
    imo: '',
    code: 'NSFR',
    name: 'NEW SUN FLOWER',
    callsign: '',
    source: 'user',
    _userOwned: true,
    editorName: '김성일',
    updatedAt: Date.parse('2026-08-06T01:00:00Z'),
    bayDef: {
      source: 'user',
      _userOwned: true,
      recordCount: baysSummary.length,
      sourceFile: 'matrix_builder',
      parsedAt: '2026-08-06T01:00:00.000Z',
      sourceVersion: 'M6.94.5',
      verified: true,
      baysSummary,
    },
  };
}
