// 베이사전 쓰기 권한 중앙 게이트 — V9.05 (관리자 원칙: 매트릭스는 관리자/권한자만 수정)
//
// 배경 (2026-07-21 SWAT 사건 후속):
//   베이사전을 쓰는 경로가 6곳(빌더/PDF일괄/ASC일괄/PDF파싱/VoyagePage/머지)인데
//   권한 검사는 빌더 1곳뿐이었다. 이 모듈이 모든 쓰기의 단일 관문이 된다.
//
// 사용처: userBayDict.js(addToUserBayDict 등) + firebase.js(fbSaveShipBayDict 등)
// 권한자 명단: matrix_editors (App.jsx가 구독해 window.__gmMatrixEditors에 캐시)
// 명단 로딩 전/오프라인 폴백: 시드 관리자(김성일)만 허용.

import { SK, _storage } from './utils.js';

const SEED_ADMIN = '김성일';

/** 현재 선택된 검수원 이름 */
export function getActiveInspector() {
  try { return _storage.get(SK.activeInspector) || ''; } catch { return ''; }
}

/** 베이사전 쓰기 허용 여부 (동기 — 캐시된 권한자 명단 사용) */
export function canWriteBayDict(actorName = null) {
  const name = actorName != null ? actorName : getActiveInspector();
  if (!name) return false;
  const editors = (typeof window !== 'undefined' && Array.isArray(window.__gmMatrixEditors) && window.__gmMatrixEditors.length > 0)
    ? window.__gmMatrixEditors
    : [SEED_ADMIN];
  return editors.includes(name);
}

// 차단 알림 (반복 저장 루프에서 alert 폭탄 방지 — 10초 1회)
let _lastWarnAt = 0;
export function warnBlocked(pathLabel = '') {
  const now = Date.now();
  const msg = `⛔ 베이사전 저장 차단${pathLabel ? ` (${pathLabel})` : ''} — 매트릭스 수정은 권한자(관리자)만 가능합니다.`;
  console.warn('[bayDictGuard]', msg, '현재 검수원:', getActiveInspector() || '(미선택)');
  if (now - _lastWarnAt > 10000) {
    _lastWarnAt = now;
    try { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg); } catch { /* headless */ }
  }
  return false;
}

/** 게이트 통과 검사 — 실패 시 경고 후 false */
export function gateBayDictWrite(pathLabel = '') {
  if (canWriteBayDict()) return true;
  return warnBlocked(pathLabel);
}
