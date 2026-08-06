// TallyUni 0.9 시뮬 진입점 — 설치 마법사 시딩 · 관리자 가져오기 · 매트릭스 잠금.
//   복제본을 만들지 않는다. 화면들을 실물 그대로 jsdom 에 올려 눌러 본다.
//   firebase/* 는 esbuild alias 로 tools/_stub_fb_*.js 대역(실 DB 무접촉).
import React from 'react';
import { createRoot } from 'react-dom/client';
import SetupWizard from '../src/pages/SetupWizard.jsx';
import BayDictLibraryWidget from '../src/components/BayDictLibraryWidget.jsx';
import ShipMatrixBuilderModal from '../src/components/ShipMatrixBuilderModal.jsx';
import { useCanWriteBayDict } from '../src/useMatrixPerm.js';
import { canWriteBayDict } from '../src/bayDictGuard.js';

const S = (window.__SIM = window.__SIM || {});
S.canWriteBayDict = canWriteBayDict;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (sel) => document.querySelector(sel);
const all = (sel) => [...document.querySelectorAll(sel)];
const click = (e) => e && e.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const byText = (sel, re) => all(sel).find((n) => re.test(n.textContent || ''));

// React 가 관리하는 input 에 값을 넣는 유일하게 통하는 방법(네이티브 setter + input 이벤트)
function typeInto(input, value) {
  const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

// TallyUni 0.9-01: 파일 입력에 파일을 얹는 유일한 방법(jsdom 에는 DataTransfer 가 없다).
//   React 는 e.target.files 를 읽을 뿐이라 인스턴스 속성으로 덮어써도 실물과 같은 경로를 탄다.
const jsonFileInputs = () => all('input[type=file]').filter((i) => /json/i.test(i.getAttribute('accept') || ''));
function setFiles(input, content, name) {
  const f = new window.File([content], name, { type: 'application/json' });
  const list = [f];
  list.item = (i) => list[i];
  Object.defineProperty(input, 'files', { value: list, configurable: true, writable: true });
}

S.mountWizard = async () => {
  createRoot(document.getElementById('root')).render(<SetupWizard />);
  await sleep(150);
};

/** 마법사 2·3단계를 사람이 하듯 채우고 [설정 마치고 시작]을 누른다.
 *  seed 를 주면 3단계에서 [사전 파일 선택]에 그 파일을 얹는다. null 이면 안 고른 것. */
S.runWizardFinish = async ({ company = '남해검수', port = 'KRINC', portName = '인천', owner = '박정우', seed = null } = {}) => {
  const labeled = (re) => {
    const lb = all('label').find((n) => re.test(n.textContent || ''));
    return lb && lb.parentElement ? lb.parentElement.querySelector('input, textarea') : null;
  };
  typeInto(labeled(/회사명/), company);
  typeInto(labeled(/모항 코드/), port);
  typeInto(labeled(/모항 이름/), portName);
  await sleep(60);
  click(byText('button', /다음|3단계|관리자/));
  await sleep(120);
  const nameIn = labeled(/^이름/);
  if (!nameIn) return { error: '3단계로 못 넘어감', text: document.body.textContent };
  typeInto(nameIn, owner);
  await sleep(60);
  const step3 = document.body.textContent;
  let picked = null;
  if (seed !== null) {
    const inp = jsonFileInputs()[0];
    if (!inp) return { error: '3단계에 사전 파일 입력이 없다', text: document.body.textContent };
    setFiles(inp, seed.content, seed.name || 'ship_bay_dict_seed.json');
    inp.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(500);
    picked = document.body.textContent;
  }
  const fin = byText('button', /설정 마치고 시작/);
  click(fin);
  await sleep(1200);
  return { text: document.body.textContent, step3, picked, hasSeedInput: jsonFileInputs().length > 0 };
};
S.wizardHasSeedInput = () => jsonFileInputs().length > 0;

S.mountLibrary = async () => {
  createRoot(document.getElementById('root')).render(<BayDictLibraryWidget />);
  await sleep(250);
  // 위젯을 펼친다 (버튼은 접힌 상태에서 안 그려진다)
  click(byText('button', /베이사전 라이브러리/));
  await sleep(200);
};
// TallyUni 0.9-01: 버튼은 파일 선택창만 연다 — 숨은 input 에 click 이 실제로 가는지 본다.
S.clickSeedButton = async () => {
  const b = byText('button', /기본 사전 가져오기/);
  if (!b) return { found: false, opened: false };
  let opened = false;
  const inp = jsonFileInputs()[0];
  if (inp) inp.addEventListener('click', () => { opened = true; });
  click(b);
  await sleep(200);
  return { found: true, opened, hasInput: !!inp };
};
/** 고른 파일을 얹어 change 를 흘린다 — 여기서부터가 실제 심기 경로다. */
S.seedImportFile = async (content, name = 'ship_bay_dict_seed.json') => {
  const inp = jsonFileInputs()[0];
  if (!inp) return { found: false, text: document.body.textContent };
  setFiles(inp, content, name);
  inp.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(1500);
  return { found: true, text: document.body.textContent };
};
S.hasSeedButton = () => !!byText('button', /기본 사전 가져오기/);
S.hasSeedInput = () => jsonFileInputs().length > 0;

const VOYAGE = {
  info: { shipName: 'SIMSHIP', code: 'SIMS', callsign: 'SIMC1', imo: '9111111', voy_l: '2601N' },
  loading: { records: [] },
};
const CONTAINERS = [];
for (const bay of ['001', '003', '005']) {
  for (const row of ['01', '02', '03']) {
    for (const tier of ['82', '84']) {
      CONTAINERS.push({ cn: `SIMU${bay}${row}${tier}0`, bay, row, tier, iso: '22GP', pol: 'KRPTK', pod: 'CNTAO', fe: 'F' });
    }
  }
}
S.mountBuilder = async () => {
  createRoot(document.getElementById('root')).render(
    <ShipMatrixBuilderModal voyage={VOYAGE} containers={CONTAINERS} onClose={() => {}} onSaved={() => {}} />
  );
  await sleep(400);
};
S.bayCount = () => all('button[title="이 베이 삭제"]').length;
S.deleteFirstBay = async () => {
  const b = all('button[title="이 베이 삭제"]')[0];
  if (!b) return { clicked: false };
  click(b);
  await sleep(250);
  return { clicked: true };
};
S.builderText = () => document.body.textContent;

// 권한 훅 자체를 실물로 한 번 돌려 본다 (VoyagePage 진입 버튼이 이 값을 그대로 쓴다)
function PermProbe() {
  const { canEdit, loading } = useCanWriteBayDict();
  return <div id="perm" data-can={String(canEdit)} data-loading={String(loading)}>perm</div>;
}
S.mountPerm = async () => {
  createRoot(document.getElementById('root')).render(<PermProbe />);
  await sleep(250);
  const n = el('#perm');
  return { canEdit: n && n.getAttribute('data-can'), loading: n && n.getAttribute('data-loading') };
};
