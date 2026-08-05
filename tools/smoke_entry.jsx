// V9.23-06: 렌더 연막검사 진입점.
//   사고: hidden useMemo 가 아래 선언된 issues 를 참조 → 배포본이 앱 전체 크래시
//   ("Cannot access 'ge' before initialization"). 빌드도 번들 grep도 못 잡았다.
//   실제로 한 번 그려 보는 것만이 이 부류를 잡는다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import BayGridEditor from '../src/components/BayGridEditor.jsx';

// 합성 베이사전 — 사전이 없으면 격자가 아예 안 그려져 검사가 무의미해진다(V9.23-07 실측).
const mkBay = (bayNo) => ({ bay: '0' + bayNo, bayNo, deckAlign: 'center', deckCells: [6, 6, 6],
  deckHasZero: false, deckTiers: [86, 84, 82], hasDeck: true, hasHold: false, hasZero: false,
  hatchCount: 1, holdAlign: 'center', holdCells: [], holdTiers: [], rowCount: 6, source: 'edi' });
window.__fbShipBayDict = { SMOKE: { name: 'SMOKE', code: 'SMOKE', callsign: 'SMOKE1', imo: '',
  bayDef: { baysSummary: ['01', '03', '04', '05'].map(mkBay), recordCount: 4, verified: true,
            deckTiers: [86, 84, 82], holdTiers: [] } } };

const mkCn = (i) => `TEST${String(1000000 + i).padStart(7, '0')}`;
const containers = [];
let i = 0;
for (const bay of ['01', '03', '04', '05']) {
  for (const row of ['01', '02', '03', '04']) {   // 05·06열은 비워 둔다 = 검사할 빈 자리
    for (const tier of ['82', '84', '86']) {
      containers.push({ cn: mkCn(i++), bay, row, tier, iso: bay === '04' ? '42GP' : '22GP',
        pol: 'KRPTK', pod: 'CNTAO', fe: 'F', _mode: 'loading' });
    }
  }
}
// 좌표 없는 컨(미배정) — 임시창고로 가야 한다
//   ChiefBayEdit 는 pad2()로 넘기므로 빈 좌표가 '00'이 되어 온다 — 그 경로까지 검사한다(V9.23-08 사고).
for (let k = 0; k < 3; k++) containers.push({ cn: mkCn(i++), bay: k === 0 ? '' : '00', row: '00', tier: '00', iso: '22GP', pol: 'KRPTK', pod: 'CNTAO', fe: 'E' });

createRoot(document.getElementById('root')).render(
  React.createElement(BayGridEditor, {
    containers, mode: 'loading', shipName: 'SMOKE', shipImo: '',
    lockedCns: new Set(), storageCns: [], shiftCns: [],
    title: '연막검사', onSave: () => {}, onClose: () => {},
  })
);
