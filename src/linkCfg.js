// TallyUni 0.6: QR 원터치 접속 — 링크에 실린 Firebase 접속 설정을 부팅 때 소비한다.
//
//   왜: 0.5까지는 새 기기마다 마법사 1단계에서 firebaseConfig 스니펫을 붙여넣어야 했다.
//   검수사 확정 — "사용자는 본인 이름만 넣게". 회사 내부 QR/링크 배포 전제이고,
//   앱 접근 자체는 직원 명단·비밀번호가 거른다(보안 승인됨).
//
//   링크 형식: https://…/tallyone-universal/?cfg=<base64url(firebaseConfig JSON)>#/login
//
//   부팅 게이트 흐름 (main.jsx가 React 렌더보다 먼저 호출):
//     ┌ cfg 파라미터 없음 → 아무것도 하지 않는다. 0.5와 완전히 같은 경로.
//     ├ 로컬에 fb 설정이 이미 있음 → cfg 무시(덮어쓰기 금지 = 남의 QR 한 장으로 기기가 넘어가는 것 방지).
//     │                              URL만 정리하고 콘솔에 한 줄 남긴다.
//     ├ 디코드 실패·필수 키 누락 → 마법사 1단계 + 한국어 오류 문구(조용한 실패 금지).
//     ├ DB settings 있음(다른 기기가 마친 회사) → fbCfg·tenantCfg 저장 → URL 정리 → reload → 로그인 화면.
//     └ DB settings 비었음(새 프로젝트) → 붙여넣기만 건너뛰고 마법사 2단계(회사 정보)로.
//
//   ⚠ 이 파일은 SetupWizard.jsx를 import하지 않는다(순환 방지). 반대로 SetupWizard가 여기서
//     FB_KEYS·FB_REQUIRED·parseFirebaseConfig·withWizardApp를 가져다 쓴다 — 0.5까지 SetupWizard에
//     있던 정의를 이리로 옮겼을 뿐, 내용·동작은 그대로다(단일 소스 유지).
//   ⚠ localStorage 키는 tenant.js의 TENANT_SK가 단일 소스다(utils.js의 SK가 참조하는 그 값).

import { TENANT_SK, getFirebaseConfig } from './tenant.js';

// ── 관용 파서 (0.2~0.5에서 SetupWizard에 있던 것 그대로) ─────────────────────
// Firebase 콘솔이 주는 스니펫을 관용적으로 읽는다.
//   `const firebaseConfig = { apiKey: "...", ... };` (JS 객체 리터럴, 키 따옴표 없음)
//   `{ "apiKey": "...", ... }` (JSON, 키 따옴표 있음)
//   둘 다 같은 정규식으로 값만 뽑는다 — JSON.parse에 기대면 JS 리터럴에서 실패한다.
export const FB_KEYS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
export const FB_REQUIRED = ['apiKey', 'databaseURL', 'projectId'];

export function parseFirebaseConfig(text) {
  const src = String(text || '');
  const out = {};
  for (const k of FB_KEYS) {
    const m = src.match(new RegExp('["\']?' + k + '["\']?\\s*[:=]\\s*["\']([^"\']*)["\']'));
    if (m && m[1]) out[k] = m[1].trim();
  }
  return out;
}

// TallyUni 0.3: 마법사 보조 앱 — 기본 앱(firebase.js)은 설정이 없어 초기화되지 않았으므로(db=null)
//   입력받은 설정으로 잠깐 별도 앱을 띄워 서버를 읽고 쓴다. 보안 규칙 `auth != null` 때문에 익명 로그인 필수.
// TallyUni 0.4: 쓰고 나면 반드시 정리한다(signOut + deleteApp).
//   왜: 정리하지 않으면 이 익명 UID 세션이 살아 있는 채로 location.reload()가 돌고, 리로드 뒤 기본 앱이
//   따로 익명 로그인을 하면서 쓰다 버린 UID가 프로젝트에 계속 쌓인다. 이름도 매번 새로 만든다 —
//   같은 이름으로 다시 initializeApp하면 (설정을 고쳐 다시 시도한 경우) 옵션 불일치로 던진다.
export async function withWizardApp(cfg, fn) {
  const { initializeApp, deleteApp } = await import('firebase/app');
  const { getAuth, signInAnonymously, signOut } = await import('firebase/auth');
  const wApp = initializeApp(cfg, `wizard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const wAuth = getAuth(wApp);
  try {
    await signInAnonymously(wAuth);
    return await fn(wApp);
  } finally {
    // 정리 실패가 본 작업을 되돌리면 안 된다 — 사유만 남기고 넘어간다(조용한 실패 금지).
    try { await signOut(wAuth); } catch (e) { console.warn('[wizard] signOut 실패(무시)', e); }
    try { await deleteApp(wApp); } catch (e) { console.warn('[wizard] deleteApp 실패(무시)', e); }
  }
}

// ── TallyUni 0.6: cfg 파라미터 ──────────────────────────────────────────────
export const CFG_PARAM = 'cfg';

/** base64url ← UTF-8 JSON. 링크(QR) 생성용. 소비 경로와 같은 알파벳(`-_`, 패딩 없음)을 쓴다. */
export function encodeCfgParam(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → UTF-8 문자열. 실패하면 null — 던지지 않는다(호출부가 원문 그대로도 한 번 더 시도한다). */
function _b64urlToText(s) {
  try {
    let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    console.warn('[링크설정] base64url 디코드 실패 — 원문 그대로 다시 읽어 봅니다.', e);
    return null;
  }
}

/** 링크의 cfg 값 → firebaseConfig. { cfg, error } — 실패 사유는 화면에 그대로 띄울 한국어 문구다. */
export function decodeCfgParam(raw) {
  const s = String(raw || '').trim();
  if (!s) return { cfg: null, error: '링크의 설정을 읽지 못했습니다 — 아래에 직접 붙여넣어 주세요. (링크에 설정 값이 비어 있습니다)' };
  // ① base64url 우선 ② 실패하면 원문 그대로 — 콘솔 스니펫을 그냥 실어 보낸 링크도 받아 준다.
  const text = _b64urlToText(s) || s;
  const cfg = parseFirebaseConfig(text);
  const missing = FB_REQUIRED.filter((k) => !cfg[k]);
  if (missing.length > 0) {
    return { cfg: null, error: `링크의 설정을 읽지 못했습니다 — 아래에 직접 붙여넣어 주세요. (없는 항목: ${missing.join(', ')})` };
  }
  return { cfg, error: '' };
}

/** 현재 주소의 cfg 파라미터 원문(없으면 빈 문자열). */
export function readCfgParam(search) {
  const q = typeof search === 'string'
    ? search
    : (typeof location !== 'undefined' && location ? location.search : '');
  try {
    return new URLSearchParams(q).get(CFG_PARAM) || '';
  } catch (e) {
    console.warn('[링크설정] 주소의 쿼리를 읽지 못했습니다.', e);
    return '';
  }
}

/** 주소창에서 cfg만 지운다(다른 파라미터·해시는 보존). 새로고침·공유 때 설정이 따라다니지 않게. */
export function stripCfgParam() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has(CFG_PARAM)) return false;
    url.searchParams.delete(CFG_PARAM);
    const qs = url.searchParams.toString();
    history.replaceState(null, '', url.pathname + (qs ? `?${qs}` : '') + url.hash);
    return true;
  } catch (e) {
    console.warn('[링크설정] 주소 정리 실패(무시) — 설정 처리에는 영향 없습니다.', e);
    return false;
  }
}

// 게이트가 마법사에게 넘기는 결과. SetupWizard가 첫 렌더에서 한 번 읽는다.
//   step 2 = 붙여넣기를 건너뛰고 회사 정보부터, step 1 = 1단계에 오류 문구(또는 설정 미리 채움).
let _linkBoot = { cfg: null, error: '', step: 0 };

/** SetupWizard 전용 — 링크로 받은 설정·오류·시작 단계. */
export function getLinkBoot() { return _linkBoot; }

/** 시뮬/테스트 전용 — 모듈 상태 초기화. */
export function _resetLinkBoot() { _linkBoot = { cfg: null, error: '', step: 0 }; }

/**
 * 부팅 게이트 본체. React 렌더 전에 한 번 돈다.
 * @param {(msg:string)=>void} [onStatus] 진행 상황 문구(빈 화면 금지)
 * @returns {Promise<{action:'proceed'|'wizard'|'reload', reason:string, error?:string, company?:string}>}
 *          'reload' 일 때만 호출부가 location.reload() 한다 — 여기서 직접 리로드하지 않는다(시뮬 검증 가능하게).
 */
export async function runLinkCfgGate(onStatus) {
  const raw = readCfgParam();
  if (!raw) return { action: 'proceed', reason: 'no-param' };

  // ① 이미 설정된 기기는 링크로 덮어쓰지 않는다 — 기존 기기 탈취 방지.
  if (getFirebaseConfig()) {
    console.info('[링크설정] 이 기기에는 접속 설정이 이미 있어 링크의 cfg 파라미터를 무시합니다.');
    stripCfgParam();
    return { action: 'proceed', reason: 'already-configured' };
  }

  const { cfg, error } = decodeCfgParam(raw);
  if (!cfg) {
    console.warn('[링크설정] ' + error);
    _linkBoot = { cfg: null, error, step: 1 };
    stripCfgParam();
    return { action: 'wizard', reason: 'bad-param', error };
  }

  if (onStatus) onStatus('설정을 불러오는 중…');

  // ② 그 프로젝트에 회사 설정(settings)이 이미 있는지 본다 — 0.4 "기존 설정 불러오기"와 같은 조회.
  let existing = null;
  try {
    existing = await withWizardApp(cfg, async (wApp) => {
      const { getDatabase, ref, get } = await import('firebase/database');
      const snap = await get(ref(getDatabase(wApp), 'settings'));
      return snap.exists() ? snap.val() : null;
    });
  } catch (e) {
    const msg = `링크의 설정으로 데이터베이스를 확인하지 못했습니다: ${e && e.message ? e.message : e}\n인터넷 상태를 확인한 뒤 아래 [다음]을 다시 눌러 주세요.`;
    console.warn('[링크설정] 데이터베이스 확인 실패', e);
    // 설정 자체는 읽었으니 1단계에 미리 채워 준다 — 사용자가 다시 붙여넣을 이유가 없다.
    _linkBoot = { cfg, error: msg, step: 1 };
    stripCfgParam();
    return { action: 'wizard', reason: 'probe-failed', error: msg };
  }

  // 회사명이 있어야 사람이 알아볼 수 있는 설정이다. 껍데기만 있으면 처음 여는 프로젝트로 본다(0.4와 같은 기준).
  const company = existing && typeof existing === 'object' ? String(existing.company || '').trim() : '';
  if (!company) {
    // ③ 새 프로젝트 — 회사 정보를 아직 아무도 안 넣었다. 붙여넣기만 건너뛰고 2단계부터.
    //   ⚠ 여기서 fbCfg만 localStorage에 저장하면 안 된다: 새로고침하면 App의 hasFirebase() 게이트가
    //     통과돼 마법사가 사라지고 tenantCfg 없는 기본값(그린마린)으로 앱이 떠 버린다.
    //     그래서 설정은 메모리(_linkBoot)로만 넘기고, 저장은 마법사가 끝까지 마칠 때 한다.
    console.info('[링크설정] 새 프로젝트입니다 — 회사 정보부터 입력받습니다(마법사 2단계).');
    _linkBoot = { cfg, error: '', step: 2 };
    stripCfgParam();
    return { action: 'wizard', reason: 'new-project' };
  }

  // ④ 이미 마친 회사 — 두 키를 저장하고 새로고침하면 곧장 로그인 화면(이름 선택)이다.
  try {
    localStorage.setItem(TENANT_SK.fbCfg, JSON.stringify(cfg));
    localStorage.setItem(TENANT_SK.tenantCfg, JSON.stringify(existing));
  } catch (e) {
    const msg = `브라우저 저장에 실패했습니다(${e && e.message ? e.message : e}). 시크릿 모드라면 일반 창에서 링크를 다시 열어 주세요.`;
    console.warn('[링크설정] localStorage 저장 실패', e);
    _linkBoot = { cfg, error: msg, step: 1 };
    stripCfgParam();
    return { action: 'wizard', reason: 'storage-failed', error: msg };
  }

  // 리로드 전에 주소를 먼저 지운다 — replaceState한 주소로 새로고침되므로 링크가 되풀이되지 않는다.
  stripCfgParam();
  console.info(`[링크설정] ${company} 설정을 링크로 받았습니다 — 새로고침 후 로그인 화면으로 갑니다.`);
  return { action: 'reload', reason: 'ok', company };
}
