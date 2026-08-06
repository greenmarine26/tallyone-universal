// TallyUni 0.9 시뮬 — 베이사전 시드 + 잠금.
//   S1 마법사 신규 설치 · S2 두 번째 기기 · S3 관리자 가져오기 · S4 잠금 · S5 회귀(0.7-02)
//   실 Firebase 무접촉(firebase/* 는 stub). 실 tallyuni DB 에 아무것도 쓰지 않는다.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(process.argv[2], 'utf8');
const PE_BUNDLE = fs.readFileSync(process.argv[3], 'utf8');
const SEED = fs.readFileSync(path.join(ROOT, 'public/seed/ship_bay_dict_seed.json'), 'utf8');
const SEED_DOC = JSON.parse(SEED);
const BASE = 'https://greenmarine26.github.io/tallyone-universal/';

const CFG = {
  apiKey: 'AIzaSy_SIM_KEY_0000000000000000000000',
  authDomain: 'simco.firebaseapp.com',
  databaseURL: 'https://simco-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'simco', storageBucket: 'simco.firebasestorage.app',
  messagingSenderId: '39134326250', appId: '1:39134326250:web:sim',
};
const FB = 'gm_fb_cfg_v1', TN = 'gm_tenant_cfg_v1';

let fails = [];
function chk(tag, cond, msg) {
  if (cond) console.log(`   ✓ ${msg}`);
  else { console.log(`   ✗ ${msg}`); fails.push(`${tag}: ${msg}`); }
}

function makeDom({ url = BASE, pre = {}, seedStatus = 200, seedBody = SEED, bundle = BUNDLE } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url });
  const w = dom.window;
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;
  if (!w.TextDecoder) w.TextDecoder = TextDecoder;
  for (const [k, v] of Object.entries(pre)) w.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  // 씨앗 파일 서빙 — 앱이 만드는 URL 을 그대로 받아 기록한다(경로가 맞는지도 검사 대상).
  w.__SIM = { fetched: [], alerts: [], confirms: [] };
  w.fetch = (u) => {
    w.__SIM.fetched.push(String(u));
    if (seedStatus !== 200) return Promise.resolve({ ok: false, status: seedStatus, json: () => Promise.reject(new Error('no')) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(seedBody)) });
  };
  w.alert = (m) => w.__SIM.alerts.push(String(m));
  w.confirm = (m) => { w.__SIM.confirms.push(String(m)); return w.__SIM.confirmAnswer !== false; };
  const errs = [];
  w.addEventListener('error', (e) => errs.push(String(e.message)));
  const oErr = console.error, oWarn = console.warn;
  console.error = (...a) => { const s = a.map(String).join(' '); if (/Error|Warning: Each/.test(s)) errs.push(s.split('\n')[0].slice(0, 180)); };
  console.warn = () => {};
  try { w.eval(bundle); } catch (e) { errs.push('THROW: ' + e.message); }
  console.error = oErr; console.warn = oWarn;
  return { dom, w, errs, S: w.__SIM };
}

(async () => {
  // ══ S1 · 마법사 신규 설치 ═════════════════════════════════════════════════
  console.log('\n[S1] 설치 마법사 — 새 회사가 처음 설치했을 때');
  {
    const { w, errs, S } = makeDom();
    w.__SIM.settings = null;               // 처음 여는 프로젝트
    w.__SIM.tree = {};
    w.__gmSimCfg = CFG;
    // 1단계를 건너뛰기 위해 링크 부팅을 흉내 낸다(getLinkBoot 는 sessionStorage 를 읽는다)
    // → 대신 1단계 붙여넣기를 직접 채운다.
    await w.__SIM.mountWizard();
    const ta = w.document.querySelector('textarea');
    const proto = w.HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, JSON.stringify(CFG));
    ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    // [다음] → probe(get settings)=없음 → 2단계
    const btns = [...w.document.querySelectorAll('button')];
    const nx = btns.find((b) => /다음|확인|계속/.test(b.textContent || ''));
    nx && nx.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const res = await w.__SIM.runWizardFinish({ owner: '박정우' });

    const writes = w.__SIM.writes || [];
    const wpath = (p) => writes.filter(([, path]) => path === p);
    chk('S1', wpath('settings').length === 1, `settings 1회 기록 (실제 ${wpath('settings').length})`);
    const me = wpath('matrix_editors')[0];
    chk('S1', !!me && JSON.stringify(me[2]) === JSON.stringify(['박정우']),
        `matrix_editors = ["박정우"] 명시 시딩 (실제 ${me ? JSON.stringify(me[2]) : '없음'})`);
    chk('S1', (w.__SIM.fetched || []).some((u) => /seed\/ship_bay_dict_seed\.json$/.test(u)),
        `씨앗 파일 fetch 경로 (${(w.__SIM.fetched || [])[0] || '없음'})`);
    const dictWrites = wpath('ship_bay_dict_v3');
    const seeded = dictWrites.reduce((n, [, , obj]) => n + Object.keys(obj || {}).length, 0);
    chk('S1', seeded === SEED_DOC._meta.count, `사전 ${SEED_DOC._meta.count}척 시딩 (실제 ${seeded}척 · ${dictWrites.length}묶음)`);
    chk('S1', dictWrites.every(([, , o]) => Object.keys(o).length <= 25), '한 번에 25척 이하로 끊어 씀');
    const treeShips = Object.keys((w.__SIM.tree || {}).ship_bay_dict_v3 || {});
    chk('S1', treeShips.length === SEED_DOC._meta.count, `서버 트리에 ${SEED_DOC._meta.count}척 (실제 ${treeShips.length})`);
    const one = ((w.__SIM.tree || {}).ship_bay_dict_v3 || {})[treeShips[0]];
    chk('S1', !!one && one.seed === true && Array.isArray(one.bayDef && one.bayDef.baysSummary) && one.bayDef.baysSummary.length > 0,
        `심긴 항목이 온전함 (${treeShips[0]} · ${one && one.bayDef ? one.bayDef.baysSummary.length : 0}베이 · seed=${one && one.seed})`);
    chk('S1', !!w.localStorage.getItem(TN) && !!w.localStorage.getItem(FB), '설정 2키 저장됨');
    chk('S1', errs.length === 0, `렌더 오류 0건 (실제 ${errs.length}${errs[0] ? ' · ' + errs[0] : ''})`);
  }

  // ── S1b · 씨앗을 못 받아도 설치는 끝나고 사유가 보인다
  console.log('\n[S1b] 설치 마법사 — 씨앗 파일을 못 받았을 때');
  {
    const { w, errs } = makeDom({ seedStatus: 404 });
    w.__SIM.settings = null; w.__SIM.tree = {};
    await w.__SIM.mountWizard();
    const ta = w.document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(ta, JSON.stringify(CFG));
    ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const nx = [...w.document.querySelectorAll('button')].find((b) => /다음|확인|계속/.test(b.textContent || ''));
    nx && nx.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const res = await w.__SIM.runWizardFinish({ owner: '박정우' });
    const t = res.text || '';
    const writes = w.__SIM.writes || [];
    chk('S1b', writes.some(([, p]) => p === 'settings'), '회사 설정은 그대로 심긴다(설치 자체는 완료)');
    chk('S1b', writes.some(([, p]) => p === 'matrix_editors'), '권한자 명단도 심긴다');
    chk('S1b', !writes.some(([, p]) => p === 'ship_bay_dict_v3'), '사전은 한 척도 안 심긴다');
    chk('S1b', /기본 선박 사전을 심지 못했습니다/.test(t), '실패 사유가 화면에 뜬다');
    chk('S1b', /HTTP 404/.test(t), `사유에 원인이 그대로 (${(t.match(/HTTP \d+/) || [])[0] || '없음'})`);
    chk('S1b', /그래도 시작/.test(t), '[그래도 시작]으로 앱을 열 수 있다');
    chk('S1b', !!w.localStorage.getItem(TN), '설정은 이 기기에 저장돼 있다');
    chk('S1b', errs.length === 0, `렌더 오류 0건 (실제 ${errs.length}${errs[0] ? ' · ' + errs[0] : ''})`);
  }

  // ══ S2 · 두 번째 기기 ═════════════════════════════════════════════════════
  console.log('\n[S2] 두 번째 기기 — 회사 설정이 이미 서버에 있을 때');
  {
    const SETTINGS = { company: '남해검수', companyEn: 'NH', addressEn: 'INCHEON, KOREA', appTitle: 'TallyOne',
      homePort: 'KRINC', homePortAliases: ['KRINC', 'INC'], homePortName: '인천',
      terminals: [{ code: 'ICT', name: 'ICT' }], owner: '박정우' };
    const { w, errs } = makeDom();
    w.__SIM.settings = SETTINGS;
    w.__SIM.tree = { ship_bay_dict_v3: { AAAA: { code: 'AAAA' } }, matrix_editors: ['박정우'] };
    await w.__SIM.mountWizard();
    const ta = w.document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(ta, JSON.stringify(CFG));
    ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const nx = [...w.document.querySelectorAll('button')].find((b) => /다음|확인|계속/.test(b.textContent || ''));
    nx && nx.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const t0 = w.document.body.textContent || '';
    chk('S2', /불러오고 시작/.test(t0), '두 번째 기기 화면(불러오고 시작)으로 간다');
    const use = [...w.document.querySelectorAll('button')].find((b) => /불러오고 시작/.test(b.textContent || ''));
    use && use.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const writes = w.__SIM.writes || [];
    chk('S2', writes.length === 0, `서버 쓰기 0건 (실제 ${writes.length}건${writes[0] ? ' · ' + writes[0][1] : ''})`);
    chk('S2', !(w.__SIM.fetched || []).some((u) => /seed/.test(u)), '씨앗 파일을 받지도 않는다');
    chk('S2', Object.keys(w.__SIM.tree.ship_bay_dict_v3).length === 1, '서버 사전 불변 (1척 그대로)');
    chk('S2', errs.length === 0, `렌더 오류 0건 (실제 ${errs.length}${errs[0] ? ' · ' + errs[0] : ''})`);
  }

  // ══ S3 · 관리자 [기본 사전 가져오기] ══════════════════════════════════════
  console.log('\n[S3] 베이사전 라이브러리 — 기본 사전 가져오기 버튼');
  {
    // ③-a 권한 없는 사람: 버튼 자체가 없다
    const A = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '이검수' } });
    A.w.__SIM.tree = { matrix_editors: ['박정우'], ship_bay_dict_v3: {} };
    await A.w.__SIM.mountLibrary();
    chk('S3', A.w.__SIM.hasSeedButton() === false, '권한 없는 검수원에게는 버튼이 안 보인다');

    // ③-b 관리자: 이미 있는 코드는 건너뛴다
    const codes = Object.keys(SEED_DOC.ships);
    const already = codes.slice(0, 5);
    const B = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '박정우' } });
    B.w.__SIM.tree = {
      matrix_editors: ['박정우'],
      ship_bay_dict_v3: Object.fromEntries(already.map((c) => [c, { code: c, name: c, source: 'user', _userOwned: true, bayDef: { baysSummary: [{ bay: '001' }], source: 'user', _userOwned: true }, updatedAt: Date.now() }])),
    };
    await B.w.__SIM.mountLibrary();
    chk('S3', B.w.__SIM.hasSeedButton() === true, '관리자에게는 버튼이 보인다');
    const r = await B.w.__SIM.clickSeedImport();
    await new Promise((res) => setTimeout(res, 1200));
    const txt = B.w.document.body.textContent || '';
    const cm = txt.match(/추가 (\d+)척 · 건너뜀 (\d+)척/);
    chk('S3', !!cm, `결과 요약이 뜬다 (${(txt.match(/추가[^·]*·[^·]*/) || [])[0] || '없음'})`);
    chk('S3', cm && Number(cm[1]) === codes.length - already.length, `추가 ${codes.length - already.length}척 (실제 ${cm ? cm[1] : '?'})`);
    chk('S3', cm && Number(cm[2]) === already.length, `건너뜀 ${already.length}척 (실제 ${cm ? cm[2] : '?'})`);
    const after = B.w.__SIM.tree.ship_bay_dict_v3;
    chk('S3', Object.keys(after).length === codes.length, `저장소 최종 ${codes.length}척 (실제 ${Object.keys(after).length})`);
    const kept = after[already[0]];
    chk('S3', kept && kept.seed === undefined && kept.bayDef.baysSummary.length === 1,
        `기존 항목(${already[0]})은 손대지 않았다 (베이 ${kept ? kept.bayDef.baysSummary.length : '?'}개 · seed=${kept ? kept.seed : '?'})`);
    const addedCode = codes.find((c) => !already.includes(c));
    chk('S3', after[addedCode] && after[addedCode].bayDef.baysSummary.length === SEED_DOC.ships[addedCode].bayDef.baysSummary.length,
        `새로 심은 항목(${addedCode})의 베이 수가 씨앗과 같다 (${after[addedCode] ? after[addedCode].bayDef.baysSummary.length : '?'})`);
    chk('S3', B.errs.length === 0, `렌더 오류 0건 (실제 ${B.errs.length}${B.errs[0] ? ' · ' + B.errs[0] : ''})`);
  }

  // ══ S4 · 잠금 ════════════════════════════════════════════════════════════
  console.log('\n[S4] 잠금 — 매트릭스 빌더 · 진입 권한 · 플랜편집기 사전 불러오기');
  {
    // 권한 훅 (VoyagePage 진입 버튼이 이 값을 그대로 쓴다)
    const P1 = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '이검수' } });
    P1.w.__SIM.tree = { matrix_editors: ['박정우'] };
    const p1 = await P1.w.__SIM.mountPerm();
    chk('S4', p1.canEdit === 'false', `권한 훅: 명단 밖 검수원 → false (실제 ${p1.canEdit})`);
    const P2 = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '박정우' } });
    P2.w.__SIM.tree = { matrix_editors: ['박정우'] };
    const p2 = await P2.w.__SIM.mountPerm();
    chk('S4', p2.canEdit === 'true', `권한 훅: 관리자 → true (실제 ${p2.canEdit})`);

    // 빌더 — 비관리자
    const R = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '이검수' } });
    R.w.__SIM.tree = { matrix_editors: ['박정우'] };
    await R.w.__SIM.mountBuilder();
    const before = R.w.__SIM.bayCount();
    const rt = R.w.__SIM.builderText();
    chk('S4', before > 0, `빌더가 읽기용으로는 그려진다 (베이 ${before}개)`);
    chk('S4', /읽기 전용/.test(rt) && /관리자만 수정할 수 있습니다/.test(rt), '헤더에 🔒 읽기 전용 문구');
    await R.w.__SIM.deleteFirstBay();
    const after = R.w.__SIM.bayCount();
    chk('S4', after === before, `베이 삭제가 막힌다 (${before} → ${after})`);
    chk('S4', (R.w.__SIM.alerts || []).some((m) => /관리자만 수정할 수 있습니다/.test(m)),
        `차단 사유를 알린다 (${(R.w.__SIM.alerts || [])[0] || '없음'})`);

    // 빌더 — 관리자는 종전 그대로
    const A2 = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '박정우' } });
    A2.w.__SIM.tree = { matrix_editors: ['박정우'] };
    await A2.w.__SIM.mountBuilder();
    const b0 = A2.w.__SIM.bayCount();
    const at = A2.w.__SIM.builderText();
    chk('S4', !/읽기 전용/.test(at), '관리자 화면엔 읽기 전용 딱지가 없다');
    await A2.w.__SIM.deleteFirstBay();
    const b1 = A2.w.__SIM.bayCount();
    chk('S4', b1 === b0 - 1, `관리자는 종전대로 베이를 지운다 (${b0} → ${b1})`);
    chk('S4', A2.errs.length === 0, `렌더 오류 0건 (실제 ${A2.errs.length}${A2.errs[0] ? ' · ' + A2.errs[0] : ''})`);

    // 플랜편집기 importUserDict
    const ENTRY = { code: 'ZZZZ', name: 'ZZZZ', bayDef: { baysSummary: [{ bay: '001', bayNo: '01' }] } };
    const D1 = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '이검수' }, bundle: PE_BUNDLE });
    const r1 = D1.w.__SIM.importUserDict(ENTRY);
    chk('S4', r1 === null, `플랜편집기: 권한 없으면 차단 (반환 ${JSON.stringify(r1)})`);
    chk('S4', !D1.w.localStorage.getItem('master_user_bay_dict_v1'), '차단 시 로컬 사전에 아무것도 안 쓴다');
    const D2 = makeDom({ pre: { [TN]: { owner: '박정우' }, [FB]: CFG, master_active_inspector_v1: '박정우' }, bundle: PE_BUNDLE });
    const r2 = D2.w.__SIM.importUserDict(ENTRY);
    chk('S4', Array.isArray(r2) && r2.length === 1 && r2[0].code === 'ZZZZ', `플랜편집기: 관리자는 종전대로 등록 (${JSON.stringify(r2)})`);
    const stored = JSON.parse(D2.w.localStorage.getItem('master_user_bay_dict_v1') || '{}');
    chk('S4', stored.ZZZZ && stored.ZZZZ.bayDef._userOwned === true, '등록본은 종전과 같은 정본 표식');

    // VoyagePage 진입 버튼 — 소스 결속 확인(버튼이 훅 값에 실제로 묶여 있는가)
    const vp = fs.readFileSync(path.join(ROOT, 'src/pages/VoyagePage.jsx'), 'utf8');
    chk('S4', /const \{ canEdit: canEditMatrix \} = useCanWriteBayDict\(\)/.test(vp), '진입 버튼이 권한 훅에 묶여 있다');
    chk('S4', /disabled=\{!canEditMatrix\}/.test(vp), '권한 없으면 버튼 disabled');
    chk('S4', /onClick=\{\(\) => canEditMatrix && setMatrixBuilderOpen\(true\)\}/.test(vp), 'onClick 도 권한을 본다(이중 잠금)');
    chk('S4', (vp.match(/setMatrixBuilderOpen\(true\)/g) || []).length === 1, '빌더를 여는 곳은 이 한 곳뿐');
  }

  // ══ S5 · 회귀 (0.7-02 정본 판정) ══════════════════════════════════════════
  console.log('\n[S5] 회귀 — 0.7-02 카고플랜 정본 판정 시뮬 재실행');
  {
    const { execFileSync } = require('child_process');
    try {
      const out = execFileSync(process.execPath, [path.join(ROOT, '_sim/dict.mjs')], { encoding: 'utf8' });
      const pass = /✅ 전체 PASS/.test(out);
      const n = (out.match(/^PASS/gm) || []).length;
      chk('S5', pass, `_sim/dict.mjs 전체 PASS (${n}건)`);
    } catch (e) {
      chk('S5', false, `_sim/dict.mjs 실패 — ${(e.stdout || '').split('\n').filter((l) => /FAIL/.test(l))[0] || e.message}`);
    }
  }

  console.log('\n' + (fails.length === 0 ? '✅ 전체 PASS' : `❌ FAIL ${fails.length}건\n - ` + fails.join('\n - ')));
  process.exit(fails.length ? 1 : 0);
})();
