// TallyUni 0.6 시뮬 전용 — firebase/auth 대역.
export function getAuth(app) { return { app }; }
export function signInAnonymously() {
  const S = (globalThis.__SIM = globalThis.__SIM || {});
  (S.log = S.log || []).push(['signInAnonymously']);
  if (S.authFail) return Promise.reject(new Error('시뮬: 익명 로그인 실패'));
  return Promise.resolve({ user: { uid: 'sim-anon' } });
}
export function signOut() {
  const S = (globalThis.__SIM = globalThis.__SIM || {});
  (S.log = S.log || []).push(['signOut']);
  return Promise.resolve();
}
