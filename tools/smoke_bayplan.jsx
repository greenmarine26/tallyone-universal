// V9.28-03: BayPlan 렌더 연막검사 — 'containers is not defined' 스코프 크래시가
//   연막검사(BayGridEditor만)를 통과해 배포된 사고 후 신설. 합성 사전+컨으로 실제로 그린다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import BayPlan from '../src/components/BayPlan.jsx';
const mkBay = (bayNo) => ({ bay: '0' + bayNo, bayNo, deckAlign: 'center', deckCells: [6, 6, 6],
  deckHasZero: false, deckTiers: [86, 84, 82], hasDeck: true, hasHold: false, hasZero: false,
  hatchCount: 1, holdAlign: 'center', holdCells: [], holdTiers: [], rowCount: 6, source: 'edi' });
window.__fbShipBayDict = { SMOKE: { name: 'SMOKE', code: 'SMOKE', callsign: 'SMOKE1', imo: '',
  bayDef: { baysSummary: ['01', '02', '03'].map(mkBay), recordCount: 3, verified: true,
            deckTiers: [86, 84, 82], holdTiers: [] } } };
const containers = [];
let i = 0;
// 02베이(짝수)에 40ft — 82단 일부만 채워 빈 칸(=배치 후보)을 남긴다
for (const row of ['02', '04']) containers.push({ cn: `TEST${String(1000000 + i++).padStart(7, '0')}`, bay: '02', row, tier: '82', iso: '45GE', fe: 'F', pol: 'KRPTK', pod: 'CNTAO', _mode: 'loading' });
for (const row of ['01', '02', '03']) containers.push({ cn: `TEST${String(1000000 + i++).padStart(7, '0')}`, bay: '01', row, tier: '82', iso: '22GP', fe: 'F', pol: 'KRPTK', pod: 'CNTAO', _mode: 'loading' });
createRoot(document.getElementById('root')).render(
  React.createElement(BayPlan, {
    containers, compMap: {}, xrayMap: {}, restowMap: { needsShift: {} }, mode: 'loading',
    onOpenContainer: () => {}, shipImo: '', shipName: 'SMOKE', voyageInfo: { vsl: 'SMOKE' }, voyageKey: 'SMOKE_1',
    pendingMove: { cn: 'TESTX000001', fromBay: '', fromRow: '', fromTier: '', fe: 'E', iso: '45GE' },
    onCancelMove: () => {}, onCommitMove: () => {},
  })
);
