// 테넌트 설정 단일 소스 — 회사·모항·터미널·소유자 + Firebase 접속 설정.
//   기본값=그린마린(테넌트1). 우선순위: DEFAULTS ⊕ localStorage(tenantCfg) ⊕ window.__TENANT_OVERRIDE(시뮬 최우선).
//   ⚠ 이 파일은 utils.js를 import하지 않는다 — utils.js가 이 파일을 import하므로 순환이 된다.
//     그래서 localStorage를 직접(try/catch로) 읽는다. 키 문자열은 아래 TENANT_SK가 단일 소스이고
//     utils.js의 SK가 이 값을 그대로 참조한다(문자열 이중 관리 금지).

// TallyUni 0.2: 첫 실행 마법사가 쓰는 localStorage 키 — SK.fbCfg / SK.tenantCfg의 실체.
export const TENANT_SK = {
  fbCfg: 'gm_fb_cfg_v1',
  tenantCfg: 'gm_tenant_cfg_v1',
};

export const TENANT_DEFAULTS = {
  company: '그린마린',
  companyEn: 'GREEN MARINE CO., LTD.',
  addressEn: 'PYEONGTAEK, KOREA',
  appTitle: 'TallyOne',
  homePort: 'KRPTK',
  homePortAliases: ['KRPTK', 'PTK'],
  homePortName: '평택',
  owner: '김성일',            // TallyUni 0.2: 앱 소유자(권한 회수 불가) — 마법사가 최초 관리자 이름으로 덮어쓴다
  terminals: [
    { code: 'PCTC', name: 'PCTC', berths: [6, 7, 8, 9] },
    { code: 'PNCT', name: 'PNCT', berths: [13, 14, 15, 16] },
  ],
};

// localStorage 원문 읽기 — 브라우저 밖(node)·차단 환경에서도 안전하게 null.
function _raw(key) {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage.getItem(key);
  } catch { return null; }
}
function _json(key) {
  const s = _raw(key);
  if (!s) return null;
  try { const o = JSON.parse(s); return (o && typeof o === 'object') ? o : null; } catch { return null; }
}

/** TallyUni 0.2: 마법사가 저장한 Firebase 설정. 없으면 null(= 미설정 = 마법사 표시). */
export function getFirebaseConfig() {
  return _json(TENANT_SK.fbCfg);
}

/** TallyUni 0.2: 첫 실행 마법사를 마친 테넌트인가 (= 회사 설정이 저장돼 있는가). */
export function wizardDone() {
  return !!_json(TENANT_SK.tenantCfg);
}

export function tenant() {
  const saved = _json(TENANT_SK.tenantCfg);
  const o = (typeof window !== 'undefined' && window.__TENANT_OVERRIDE) || (typeof globalThis !== 'undefined' && globalThis.__TENANT_OVERRIDE) || null;
  if (!saved && !o) return TENANT_DEFAULTS;
  return { ...TENANT_DEFAULTS, ...(saved || {}), ...(o || {}) };
}
