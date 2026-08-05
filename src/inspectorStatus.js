// 검수원 로그인/작업중 상태 판정 유틸 (V7.94-14) — InspectorModal·StaffManagerModal·HomePage 공용
// 상태 3종: 'working'(로그인+최근 활동) / 'online'(로그인했지만 활동 끊김) / null(로그아웃 또는 이력 없음)
// 하위호환: loggedIn 필드가 없는 과거 데이터는 활동 시각만으로 판정 (기존 동작 유지)

export const WORKING_WINDOW_MS = 90000; // 최근 90초 내 활동 = 작업중

export function inspectorStatus(i, now = Date.now()) {
  if (!i) return null;
  if (i.loggedIn === false) return null;                       // 명시 로그아웃 — 배지 없음
  const recentlyActive = i.lastActive && (now - i.lastActive) < WORKING_WINDOW_MS;
  if (recentlyActive) return 'working';
  // TallyOne 1.3-01(사용자 신고 2026-08-03): 앱을 로그아웃 없이 닫으면 기기 쪽 자동 로그아웃(V9.13)이
  //   돌 수 없어 loggedIn=true가 영구 잔존 — 실측 3시간·12시간 전 활동자가 '로그인'으로 표시(허상).
  //   표시 판정에 신선도 추가: 마지막 활동이 30분(IDLE_LOGOUT_MS)을 넘으면 로그아웃 취급.
  if (i.loggedIn === true) {
    const stale = !i.lastActive || (now - i.lastActive) >= IDLE_LOGOUT_MS;
    return stale ? null : 'online';
  }
  return null;                                                 // 과거 데이터(필드 없음) + 활동 오래됨
}

// ── V9.13(2026-07-27): 무조작 자동 로그아웃 ──────────────────────────────
//   사용자 확정 — "30분 이상 로그인 후 신호 없으면 강제 로그아웃", 기준은 **화면 조작**.
//   앱을 켜 둔 채 30분 동안 터치·클릭·키·스크롤이 없으면 그 기기에서 스스로 로그아웃한다.
//   (앱을 그냥 닫은 경우는 대상 아님 — 사용자 선택. 30초 하트비트는 조작 신호가 아니다.)
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;   // 30분

/** 마지막 조작 시각 기준으로 자동 로그아웃할 때가 됐는가 */
export function isIdleLogout(lastInputAt, now = Date.now()) {
  if (!lastInputAt) return false;               // 기준 시각이 없으면 판정 안 함(로그아웃 안 시킴)
  return (now - lastInputAt) >= IDLE_LOGOUT_MS;
}
