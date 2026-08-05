// PDF STOWAGE INSTRUCTION에서 직접 추출한 베이별 정답 데이터.
// 베이마다 row count + has_zero + deck/hold tier가 모두 다름.
// 출처: DJCT 0186W (2025-02-22), SWAT 2524S (2025-11-01) PDF.
//
// rowCount + hasZero → getRowPositions로 row 라벨 생성:
//   7 + true  → [06,04,02,00,01,03,05]
//   9 + true  → [08,06,04,02,00,01,03,05,07]
//   10 + false→ [10,08,06,04,02,01,03,05,07,09]
//   11 + true → [10,08,06,04,02,00,01,03,05,07,09]

import { getDefBayEntry } from './shipBayDict_def.js';

export const PDF_BAY_OVERRIDE = {
  // DJCT (DONGJIN CONTINENTAL) — 0186W 기준
  DJCT: {
    "01": { rowCount: 7,  hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4] },  // V7.36: .def+PDF 재확인 — 82단 누락 정정
    "03": { rowCount: 9,  hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "05": { rowCount: 9,  hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },  // (04)05 페어
    "07": { rowCount: 10, hasZero: false, deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "09": { rowCount: 10, hasZero: false, deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },  // (08)09
    "11": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "13": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },  // (12)13
    "15": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "17": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },  // (16)17
    "19": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "21": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },  // (20)21
    "23": { rowCount: 10, hasZero: false, deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "25": { rowCount: 10, hasZero: false, deckTiers: [92,90,88,86,84,82], holdTiers: [8,6,4,2] },  // (24)25
    "27": { rowCount: 10, hasZero: false, deckTiers: [92,90,88,86,84,82], holdTiers: [] },         // hold 없음
    "29": { rowCount: 10, hasZero: false, deckTiers: [92,90,88,86,84,82], holdTiers: [] },         // (28)29 hold 없음
  },

  // SWAT (SAWASDEE ATLANTIC) — 마스터플랜 Tallyman_Master6_929-1.pdf 기준 (2026-05-24)
  SWAT: {
    // M6.93.0: 마스터플랜 전면 재작성.
    //   - 핵심: rowCount는 베이별로 다름 (9/11/8/7/5). STANDARD_DECK[94~82] + STANDARD_HOLD[10~02] 통일.
    //   - cells: deck=rowCount 가득 (마스터플랜 모든 deck tier 표시), hold=rowCount 또는 좌1+우1 invisible.
    //   - BAY 34 신설 (짝수 단독, row 5 "04 02 00 01 03").
    //   - BAY 01: hasZero=false (라벨 "06 04 02 01 03 05 07" — 00 없음).
    //   - BAY 03: rowCount=8 (라벨 "08 06 04 02 00 01 03 05" — 07/09 없음).
    "01": { rowCount: 7,  hasZero: false, deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [7,7,7,7,7,7,7], holdCells: [7,7,7,7,7] },
    "03": { rowCount: 8,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (02)03 페어
            deckCells: [8,8,8,8,8,8,8], holdCells: [8,8,8,8,8] },
    "05": { rowCount: 5,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [5,5,5,5,5,5,5], holdCells: [5,5,5,5,5] },
    "07": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (06)07 페어
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "09": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "11": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (10)11 페어
            deckCells: [11,11,11,11,11,11,11], holdCells: [9,9,9,9,9] },
    "13": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "15": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (14)15 페어
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "17": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [11,11,11,11,11,11,11], holdCells: [9,9,9,9,9] },
    "19": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (18)19 페어
            deckCells: [11,11,11,11,11,11,11], holdCells: [9,9,9,9,9] },
    "21": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "23": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (22)23 페어
            deckCells: [11,11,11,11,11,11,11], holdCells: [9,9,9,9,9] },
    "25": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "27": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (26)27 페어
            deckCells: [11,11,11,11,11,11,11], holdCells: [9,9,9,9,9] },
    "29": { rowCount: 9,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],
            deckCells: [9,9,9,9,9,9,9], holdCells: [9,9,9,9,9] },
    "31": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [10,8,6,4,2],     // (30)31 페어
            deckCells: [11,11,11,11,11,11,11], holdCells: [9,9,9,9,9] },
    "33": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [],
            deckCells: [11,11,11,11,11,11,11], holdCells: [] },
    "34": { rowCount: 5,  hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [],               // BAY 34 (짝수 단독, 마스터플랜 신규)
            deckCells: [5,5,5,5,5,5,5], holdCells: [] },
    "35": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [],               // (34)35 페어 — PDF stowage 기준 유지
            deckCells: [11,11,11,11,11,11,11], holdCells: [] },
    "38": { rowCount: 11, hasZero: true,  deckTiers: [94,92,90,88,86,84,82], holdTiers: [],
            deckCells: [11,11,11,11,11,11,11], holdCells: [] },
  },

  // TNJP (TEN JUPITER) — 25323W PDF 기준
  TNJP: {
    "01": { rowCount: 7, hasZero: true,  deckTiers: [84,82],             holdTiers: [6,4,2] },
    "03": { rowCount: 7, hasZero: true,  deckTiers: [84,82],             holdTiers: [6,4,2] },
    "05": { rowCount: 7, hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "07": { rowCount: 7, hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "09": { rowCount: 9, hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "11": { rowCount: 9, hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "13": { rowCount: 9, hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "15": { rowCount: 9, hasZero: true,  deckTiers: [88,86,84,82],       holdTiers: [8,6,4,2] },
    "17": { rowCount: 9, hasZero: true,  deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "19": { rowCount: 9, hasZero: true,  deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "21": { rowCount: 9, hasZero: true,  deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "23": { rowCount: 9, hasZero: true,  deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "25": { rowCount: 9, hasZero: true,  deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "27": { rowCount: 9, hasZero: true,  deckTiers: [90,88,86,84,82],    holdTiers: [8,6,4,2] },
    "29": { rowCount: 7, hasZero: true,  deckTiers: [92,90,88,86,84,82], holdTiers: [] },
    "31": { rowCount: 7, hasZero: true,  deckTiers: [92,90,88,86,84,82], holdTiers: [] },
    "33": { rowCount: 7, hasZero: true,  deckTiers: [92,90,88,86,84,82], holdTiers: [] },
  },

  // PCSG (PACIFIC TIANJIN) — 2616W PDF 기준
  PCSG: {
    "01": { rowCount: 4, hasZero: false, deckTiers: [88,86,84,82],       holdTiers: [] },
    "03": { rowCount: 6, hasZero: false, deckTiers: [88,86,84],          holdTiers: [8,6,4] },
    "05": { rowCount: 8, hasZero: false, deckTiers: [88,86,84],          holdTiers: [8,6,4,2] },
    "07": { rowCount: 8, hasZero: false, deckTiers: [90,88,86,84],       holdTiers: [8,6,4,2] },
    "09": { rowCount: 8, hasZero: false, deckTiers: [90,88,86,84],       holdTiers: [8,6,4,2] },
    "11": { rowCount: 8, hasZero: false, deckTiers: [90,88,86,84],       holdTiers: [8,6,4,2] },
    "13": { rowCount: 8, hasZero: false, deckTiers: [90,88,86,84],       holdTiers: [8,6,4,2] },
    "15": { rowCount: 8, hasZero: false, deckTiers: [90,88,86,84],       holdTiers: [8,6,4,2] },
    "17": { rowCount: 3, hasZero: true,  deckTiers: [90,88,86,84],       holdTiers: [] },
    "19": { rowCount: 8, hasZero: false, deckTiers: [90,88,86,84],       holdTiers: [8,6,4,2] },
    "21": { rowCount: 8, hasZero: false, deckTiers: [92,90,88,86,84],    holdTiers: [8,6,4,2] },
    "23": { rowCount: 8, hasZero: false, deckTiers: [92,90,88,86,84],    holdTiers: [8,6,4,2] },
    "25": { rowCount: 8, hasZero: false, deckTiers: [92,90,88,86,84],    holdTiers: [8,6,4,2] },
    "27": { rowCount: 8, hasZero: false, deckTiers: [92,90,88,86,84,82], holdTiers: [] },
    "29": { rowCount: 8, hasZero: false, deckTiers: [92,90,88,86,84,82], holdTiers: [] },
  },
};

export function getBayOverride(shipCode, bayNo) {
  const ship = PDF_BAY_OVERRIDE[String(shipCode || '').toUpperCase()];
  const padded = String(bayNo).padStart(2, '0');
  // V7.37: PDF override(사용자·PDF 검증) 우선, 없으면 .def 내장 사전(자동 디코드, 미검증) 폴백.
  // 우선순위: 사용자 매트릭스(소비처에서 이미 우선) > PDF override > .def 사전 > v5/v2/EDI.
  if (ship && ship[padded]) return ship[padded];
  return getDefBayEntry(shipCode, bayNo);
}
