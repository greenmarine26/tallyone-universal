// TallyUni 0.6 시뮬 — QR 원터치 접속(?cfg=) 부팅 게이트 4케이스.
//   실 Firebase에 붙지 않는다(firebase/* 는 esbuild alias로 tools/_stub_fb_*.js 대역).
//   사용: node tools/sim_linkcfg.cjs <번들경로>
const { JSDOM } = require('jsdom');
const fs = require('fs');

const BUNDLE = fs.readFileSync(process.argv[2], 'utf8');
const BASE = 'https://greenmarine26.github.io/tallyone-universal/';

// 실 tallyuni-gm 설정 모양(값은 대역) — 링크에 실릴 firebaseConfig
const CFG = {
  apiKey: 'AIzaSy_SIM_KEY_0000000000000000000000',
  authDomain: 'simco.firebaseapp.com',
  databaseURL: 'https://simco-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'simco',
  storageBucket: 'simco.firebasestorage.app',
  messagingSenderId: '39134326250',
  appId: '1:39134326250:web:e8e2d8546e3cb869cc9693',
};
const SETTINGS = {
  company: '심회사',
  companyEn: 'SIM CO., LTD.',
  addressEn: 'PYEONGTAEK, KOREA',
  appTitle: 'TallyOne',
  homePort: 'KRPTK',
  homePortAliases: ['KRPTK', 'PTK'],
  homePortName: '평택',
  terminals: [{ code: 'PCTC', name: 'PCTC' }, { code: 'PNCT', name: 'PNCT' }],
  owner: '김성일',
};

// base64url 인코딩(브라우저 밖) — 앱의 encodeCfgParam과 같은 규칙
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const fails = [];
function chk(tag, cond, msg) {
  if (cond) console.log(`   ✓ ${msg}`);
  else { console.log(`   ✗ ${msg}`); fails.push(`${tag}: ${msg}`); }
}

async function runCase({ tag, title, url, pre = {}, settings = null, probeFail = false }) {
  console.log(`\n[${tag}] ${title}`);
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, url,
  });
  const w = dom.window;
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;      // jsdom 미제공 시 보완(브라우저는 기본 제공)
  if (!w.TextDecoder) w.TextDecoder = TextDecoder;
  w.localStorage.clear();
  for (const [k, v] of Object.entries(pre)) w.localStorage.setItem(k, JSON.stringify(v));

  const errs = [];
  const infos = [];
  w.addEventListener('error', (e) => errs.push(String(e.message)));
  const origWarn = console.warn, origInfo = console.info, origErr = console.error;
  console.info = (...a) => infos.push(a.map(String).join(' '));
  console.warn = (...a) => infos.push(a.map(String).join(' '));
  console.error = (...a) => { const s = a.map(String).join(' '); infos.push(s); errs.push(s.split('\n')[0].slice(0, 200)); };

  w.__SIM = { settings, probeFail, log: [] };
  let result;
  try {
    w.eval(BUNDLE);
    result = await w.__SIM.run();
  } catch (e) {
    errs.push('THROW: ' + (e && e.message));
  } finally {
    console.warn = origWarn; console.info = origInfo; console.error = origErr;
  }
  const text = w.document.body.textContent || '';
  return {
    w, result, text, errs, infos,
    ls: (k) => { const s = w.localStorage.getItem(k); try { return s ? JSON.parse(s) : null; } catch { return s; } },
    href: w.location.href, search: w.location.search, hash: w.location.hash,
    reloads: w.__SIM.reloads, status: w.__SIM.status, boot: w.__SIM.getLinkBoot(),
  };
}

(async () => {
  const FB = 'gm_fb_cfg_v1', TN = 'gm_tenant_cfg_v1';

  // ── S1: 새 기기 + cfg + DB settings 있음 → 두 키 저장 · URL 정리 · reload 1회 · 마법사 미표시
  {
    const r = await runCase({
      tag: 'S1', title: '새 기기 + QR 링크 + 회사 설정이 이미 서버에 있음',
      url: `${BASE}?cfg=${b64url(CFG)}#/login`, settings: SETTINGS,
    });
    chk('S1', r.result && r.result.action === 'reload', `게이트 결과 = reload (실제 ${r.result && r.result.action})`);
    chk('S1', r.reloads === 1, `새로고침 1회 (실제 ${r.reloads})`);
    chk('S1', JSON.stringify(r.ls(FB)) === JSON.stringify(CFG), 'gm_fb_cfg_v1 = 링크의 firebaseConfig 그대로');
    chk('S1', JSON.stringify(r.ls(TN)) === JSON.stringify(SETTINGS), 'gm_tenant_cfg_v1 = 서버 settings 그대로');
    chk('S1', r.search === '', `주소에서 cfg 제거됨 (search="${r.search}")`);
    chk('S1', r.hash === '#/login', `해시 보존 (${r.hash})`);
    chk('S1', !/첫 실행 설정/.test(r.text), '마법사 화면이 그려지지 않음');
    chk('S1', r.status === '설정을 불러오는 중…', `진행 문구 표시 ("${r.status}")`);
    chk('S1', r.infos.some((s) => s.includes('심회사')), '콘솔에 회사명 확인 로그');
    chk('S1', r.errs.length === 0, `오류 0건 (실제 ${r.errs.length}${r.errs[0] ? ' · ' + r.errs[0] : ''})`);
  }

  // ── S1b: 새 기기 + cfg + DB settings 비었음(새 프로젝트) → 저장 없음 · 마법사 2단계
  {
    const r = await runCase({
      tag: 'S1b', title: '새 기기 + QR 링크 + 서버가 빈 새 프로젝트',
      url: `${BASE}?cfg=${b64url(CFG)}#/login`, settings: null,
    });
    chk('S1b', r.result && r.result.reason === 'new-project', `게이트 사유 = new-project (실제 ${r.result && r.result.reason})`);
    chk('S1b', r.reloads === 0, '새로고침 없음');
    chk('S1b', r.ls(FB) === null && r.ls(TN) === null, 'localStorage 미저장 (반쪽 상태 방지)');
    chk('S1b', r.boot.step === 2 && !!r.boot.cfg, '마법사 시작 단계 = 2 · 설정은 메모리로 전달');
    chk('S1b', /회사명/.test(r.text) && !/firebaseConfig/.test(r.text), '2단계(회사 정보) 화면 · 붙여넣기 화면 아님');
    chk('S1b', r.search === '', '주소에서 cfg 제거됨');
    chk('S1b', r.errs.length === 0, `오류 0건 (실제 ${r.errs.length}${r.errs[0] ? ' · ' + r.errs[0] : ''})`);
  }

  // ── S2: 기존 설정 보유 기기 + cfg → 저장값 불변 · 파라미터 무시
  {
    const OLD = { ...CFG, apiKey: 'AIzaSy_OLD_DEVICE_KEY', projectId: 'oldco' };
    const OLDT = { ...SETTINGS, company: '옛회사' };
    const r = await runCase({
      tag: 'S2', title: '이미 설정된 기기가 남의 QR 링크를 열었을 때',
      url: `${BASE}?cfg=${b64url(CFG)}#/login`, pre: { [FB]: OLD, [TN]: OLDT }, settings: SETTINGS,
    });
    chk('S2', r.result && r.result.reason === 'already-configured', `게이트 사유 = already-configured (실제 ${r.result && r.result.reason})`);
    chk('S2', JSON.stringify(r.ls(FB)) === JSON.stringify(OLD), 'gm_fb_cfg_v1 불변 (덮어쓰기 없음)');
    chk('S2', JSON.stringify(r.ls(TN)) === JSON.stringify(OLDT), 'gm_tenant_cfg_v1 불변');
    chk('S2', r.reloads === 0, '새로고침 없음');
    chk('S2', r.search === '', '주소에서 cfg 제거됨');
    chk('S2', r.infos.some((s) => s.includes('무시')), '콘솔에 무시 사유 한 줄');
    chk('S2', r.boot.step === 0 && r.boot.error === '', '마법사에 아무것도 넘기지 않음');
    chk('S2', r.w.__SIM.log.length === 0, `서버 조회 자체를 안 함 — DB 호출 0건 (실제 ${r.w.__SIM.log.length}건)`);
    chk('S2', r.errs.length === 0, `오류 0건 (실제 ${r.errs.length}${r.errs[0] ? ' · ' + r.errs[0] : ''})`);
  }

  // ── S3: 깨진 cfg → 마법사 1단계 + 한국어 오류 문구
  for (const [sub, bad] of [['깨진 base64', 'not-a-base64-@@@'], ['키 빠진 JSON', b64url({ apiKey: 'x' })]]) {
    const r = await runCase({
      tag: 'S3', title: `깨진 링크 (${sub})`,
      url: `${BASE}?cfg=${bad}#/login`, settings: SETTINGS,
    });
    chk('S3', r.result && r.result.reason === 'bad-param', `게이트 사유 = bad-param (실제 ${r.result && r.result.reason})`);
    chk('S3', /링크의 설정을 읽지 못했습니다 — 아래에 직접 붙여넣어 주세요/.test(r.text), '1단계에 한국어 오류 문구 표시');
    chk('S3', /firebaseConfig/.test(r.text), '붙여넣기(1단계) 화면이 떠 있음');
    chk('S3', r.reloads === 0 && r.ls(FB) === null, '저장·새로고침 없음');
    chk('S3', r.search === '', '주소에서 cfg 제거됨');
    chk('S3', r.w.__SIM.log.length === 0, 'DB 호출 0건 (읽지도 못한 설정으로 접속 시도 안 함)');
  }

  // ── S3b: cfg는 멀쩡한데 DB 조회 실패 → 1단계 + 사유 + 설정 미리 채움(다시 붙여넣지 않게)
  {
    const r = await runCase({
      tag: 'S3b', title: '링크는 정상인데 데이터베이스 조회가 실패',
      url: `${BASE}?cfg=${b64url(CFG)}#/login`, settings: SETTINGS, probeFail: true,
    });
    chk('S3b', r.result && r.result.reason === 'probe-failed', `게이트 사유 = probe-failed (실제 ${r.result && r.result.reason})`);
    chk('S3b', /데이터베이스를 확인하지 못했습니다/.test(r.text), '1단계에 실패 사유 표시(조용한 실패 없음)');
    chk('S3b', /읽었습니다/.test(r.text), '링크로 받은 설정은 그대로 채워져 있음');
    chk('S3b', r.ls(FB) === null && r.reloads === 0, '저장·새로고침 없음');
    chk('S3b', r.w.__SIM.log.some((l) => l[0] === 'deleteApp'), '보조 앱 정리됨(deleteApp)');
  }

  // ── S4: 파라미터 없음 → 0.5와 완전히 동일 (회귀)
  {
    const r = await runCase({ tag: 'S4', title: '파라미터 없음 — 종전 흐름 회귀 검사', url: `${BASE}#/login`, settings: SETTINGS });
    chk('S4', r.result && r.result.reason === 'no-param-fast', '게이트를 아예 부르지 않는 즉시 렌더 경로');
    chk('S4', r.reloads === 0 && r.ls(FB) === null && r.ls(TN) === null, 'localStorage 무변화');
    chk('S4', r.href === `${BASE}#/login`, `주소 무변화 (${r.href})`);
    chk('S4', /첫 실행 설정/.test(r.text) && /firebaseConfig/.test(r.text), '마법사 1단계(붙여넣기)가 종전대로 표시');
    chk('S4', r.boot.step === 0 && r.boot.cfg === null && r.boot.error === '', '링크 상태 비어 있음 = 0.5와 동일 초기값');
    chk('S4', !/링크의 설정을 읽지 못했습니다/.test(r.text), '오류 문구 없음');
    chk('S4', r.w.__SIM.log.length === 0, 'DB 호출 0건');
    chk('S4', r.errs.length === 0, `오류 0건 (실제 ${r.errs.length}${r.errs[0] ? ' · ' + r.errs[0] : ''})`);
  }

  console.log('');
  if (fails.length) {
    console.log(`✗ 시뮬 실패 ${fails.length}건`);
    fails.forEach((f) => console.log('   - ' + f));
    process.exit(1);
  }
  console.log('✓ TallyUni 0.6 QR 링크 시뮬 전 케이스 PASS');
})();
