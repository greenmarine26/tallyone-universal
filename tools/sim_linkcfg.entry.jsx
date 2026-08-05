// TallyUni 0.6 시뮬 진입점 — main.jsx의 부팅 분기를 그대로 흉내 내고, 그 뒤 마법사를 실제로 그린다.
//   (App은 그리지 않는다 — 이 판이 건드린 경로는 게이트 + 마법사 첫 화면이다.)
import React from 'react';
import { createRoot } from 'react-dom/client';
import { readCfgParam, runLinkCfgGate, getLinkBoot, encodeCfgParam, decodeCfgParam } from '../src/linkCfg.js';
import SetupWizard from '../src/pages/SetupWizard.jsx';

const S = (window.__SIM = window.__SIM || {});
S.reloads = 0;
S.encodeCfgParam = encodeCfgParam;
S.decodeCfgParam = decodeCfgParam;
S.getLinkBoot = getLinkBoot;

S.run = async () => {
  // ── main.jsx와 같은 분기 ──
  if (!readCfgParam()) {
    S.result = { action: 'proceed', reason: 'no-param-fast' };   // 게이트를 부르지도 않는다
  } else {
    S.status = '';
    const r = await runLinkCfgGate((m) => { S.status = m; });
    S.result = r;
    if (r && r.action === 'reload') { S.reloads++; S.done = true; return r; }
  }
  createRoot(document.getElementById('root')).render(<SetupWizard />);
  await new Promise((res) => setTimeout(res, 250));
  S.done = true;
  return S.result;
};
