// 관리자 이름 보호 — V9.05 (김성일 선택은 신뢰 기기 3대만 무비번, 그 외 기기는 비밀번호)
//
// 저장 구조 (Firebase admin_guard 노드):
//   { pwHash, salt, devices: { [devId]: { label, addedAt } } }   — 비밀번호는 SHA-256 해시만 저장
// 기기 식별: localStorage 'gm_admin_device_id_v1' (기기·브라우저별 1회 생성 UUID)
// 세션 허용: 비신뢰 기기에서 비밀번호 통과 시 sessionStorage 'gm_admin_session_ok' (탭 닫으면 소멸)

import { isChief } from './staffList.js';
import { tenant } from './tenant.js';        // TallyUni 0.2: 소유자 이름은 테넌트 설정에서

/** TallyUni 0.2: 앱 소유자 이름 (기본 테넌트=김성일, 마법사 테넌트=최초 관리자). */
export function ownerName() { return tenant().owner; }
// V9.10: 소유자(개발·운영자) — 권한 회수 불가, 퇴사해도 유지.
//   TallyUni 0.2: 리터럴 → 테넌트 값. 모듈 로드 시점에 확정된다(마법사는 저장 후 location.reload 하므로 항상 최신).
export const OWNER_NAME = ownerName();
export const ADMIN_NAME = OWNER_NAME;        // 하위호환 별칭 (기존 호출부 유지)
export const MAX_TRUSTED_DEVICES = 3;
const DEVICE_KEY = 'gm_admin_device_id_v1';
const SESSION_KEY = 'gm_admin_session_ok';

/** 이 기기의 고유 ID (없으면 생성) */
export function getAdminDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev-unknown';
  }
}

/** SHA-256 해시 (hex) — Web Crypto */
export async function hashPassword(pw, salt) {
  const data = new TextEncoder().encode(`${salt}::${pw}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function makeSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 기기 라벨 자동 생성 (예: "Windows·Chrome", "Android·모바일") */
export function deviceLabel() {
  try {
    const ua = navigator.userAgent;
    const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : '기기';
    const mob = /Mobi/i.test(ua) ? '모바일' : 'PC';
    return `${os}·${mob}`;
  } catch {
    return '기기';
  }
}


// ── V9.09(2026-07-26): 다중 관리자 · 관리자별 개별 비밀번호 (인수인계용) ──────────
//   왜: 관리자 이름이 소스에 하드코딩(ADMIN_NAME)돼 있어, 담당자가 바뀌면 코드를 고쳐
//   재배포해야만 인수인계가 됐다. 앱 안에서 넘길 방법이 없었다(사용자 요청 2026-07-26).
//
// 저장 구조 (admin_guard):
//   {
//     pwHash, salt, devices: {...}          ← 구버전(단일 관리자) 필드. 마이그레이션용으로 남겨둠
//     admins: {
//       "김성일": { pwHash, salt, devices:{[devId]:{label,addedAt}}, grantedBy, grantedAt },
//       "홍길동": { ... }                    ← 비번 미설정이면 첫 선택 때 본인이 정한다
//     }
//   }
// 원칙 — 비밀번호는 관리자마다 따로. 권한을 넘겨도 기존 비밀번호를 알려줄 필요가 없다.

/** 관리자 이름 목록. admins 노드가 없으면 구버전으로 보고 [ADMIN_NAME] 반환(하위호환). */
export function getAdminNames(guard) {
  const m = guard && guard.admins;
  let names = [];
  if (m && typeof m === 'object') {
    names = Object.keys(m).filter(n => m[n] && m[n].revoked !== true);
  }
  // V9.10: 소유자는 DB 상태와 무관하게 항상 관리자 — 목록에서 빠져 있어도 되살린다.
  return [OWNER_NAME, ...names.filter(n => n !== OWNER_NAME)];
}

/** V9.10: 소유자(개발·운영자) 여부 — 이름 고정. 회수·차단 불가 판정의 단일 기준. */
export function isOwnerName(name) {
  return String(name || '').trim() === OWNER_NAME;
}

/** V9.10: 그 관리자의 권한을 회수할 수 있는가 (소유자 불가 · 마지막 1명 불가) */
export function canRevokeAdmin(guard, name) {
  if (isOwnerName(name)) return false;
  return getAdminNames(guard).length > 1;
}

/** 그 이름이 관리자인가 */
export function isAdminName(guard, name) {
  return getAdminNames(guard).includes(String(name || '').trim());
}

/** 관리자 1명의 인증 정보. admins에 없으면 구버전 최상위 필드로 대체(김성일 한정). */
export function adminEntry(guard, name) {
  const m = guard && guard.admins;
  if (m && m[name]) return m[name];
  if (isOwnerName(name) && guard && guard.pwHash) {
    return { pwHash: guard.pwHash, salt: guard.salt, devices: guard.devices || {} };
  }
  return null;
}

// ── V9.45(2026-08-02): 이름 잠금을 수석검수·부수석까지 확대 ──────────────────
//   왜: 지금까지 비밀번호를 요구한 건 관리자 이름뿐이라, 수석검수사 이름은 누구나
//   골라 로그인할 수 있었다. 수석 대시보드를 막아도(V9.44) 수석 이름으로 들어오면
//   그대로 열린다 — 문 옆에 창문이 열려 있는 꼴이었다(사용자 지적 2026-08-02).
//
// 저장 위치가 갈리는 이유(중요):
//   admins/{이름}  = 관리자.  이 노드에 키가 생기면 getAdminNames가 관리자로 읽는다.
//   locks/{이름}   = 관리자가 아닌 잠금 대상(수석검수·부수석).
//   → 수석 비번을 admins에 저장하면 관리자 권한이 딸려 붙는다. 그래서 노드를 나눈다.

/** V9.45: 이 이름이 잠금 대상인가 (관리자 + 수석검수·부수석) */
export function isLockedName(guard, name) {
  const n = String(name || '').trim();
  return isAdminName(guard, n) || isChief(n);
}

/** V9.45: 잠금 대상 1명의 인증 정보 (관리자는 admins, 그 외는 locks) */
export function lockEntry(guard, name) {
  const a = adminEntry(guard, name);
  if (a) return a;
  const n = String(name || '').trim();
  const l = guard && guard.locks;
  return (l && l[n]) || null;
}

/** V9.45: 저장 경로 — 관리자면 admins/{이름}, 아니면 locks/{이름} */
export function lockPath(guard, name) {
  const n = String(name || '').trim();
  return isAdminName(guard, n) ? `admins/${n}` : `locks/${n}`;
}

/** 그 사람 기준으로 이 기기가 신뢰 기기인가 (V9.45: 관리자 → 잠금 대상 전체로 확대) */
export function isTrustedDeviceFor(guard, name) {
  const e = lockEntry(guard, name);
  return !!(e && e.devices && e.devices[getAdminDeviceId()]);
}

/** 그 사람 비밀번호 검증 (V9.45: 잠금 대상 전체) */
export async function verifyPasswordFor(guard, name, pw) {
  const e = lockEntry(guard, name);
  if (!e || !e.pwHash || !e.salt) return false;
  const h = await hashPassword(pw, e.salt);
  return h === e.pwHash;
}

/** 그 사람이 비밀번호를 아직 안 정했는가 (V9.45: 잠금 대상 전체) */
export function needsPasswordSetup(guard, name) {
  if (!isLockedName(guard, name)) return false;
  const e = lockEntry(guard, name);
  return !e || !e.pwHash;
}

/** V9.45: 소유자가 대신 열 수 있는가 — 소유자 비번이 실제로 설정돼 있을 때만 */
export function ownerCanUnlock(guard, name) {
  if (isOwnerName(name)) return false;
  const e = adminEntry(guard, OWNER_NAME);
  return !!(e && e.pwHash && e.salt);
}

/** 세션 통과 키를 관리자별로 — 다른 관리자 세션이 서로 열어주지 않게 */
export function hasSessionPassFor(name) {
  try { return sessionStorage.getItem(`${SESSION_KEY}:${name}`) === '1'; } catch { return false; }
}

export function setSessionPassFor(name) {
  try { sessionStorage.setItem(`${SESSION_KEY}:${name}`, '1'); } catch { /* skip */ }
}
