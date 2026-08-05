// TallyUni 0.6 시뮬 전용 — firebase/database 대역. settings 노드는 __SIM.settings가 정한다.
export function getDatabase(app) { return { app }; }
export function ref(db, path) { return { db, path }; }
export function get(r) {
  const S = (globalThis.__SIM = globalThis.__SIM || {});
  (S.log = S.log || []).push(['get', r && r.path]);
  if (S.probeFail) return Promise.reject(new Error('시뮬: permission_denied'));
  const v = r && r.path === 'settings' ? S.settings : undefined;
  return Promise.resolve({ exists: () => v != null, val: () => v });
}
export function set() { return Promise.resolve(); }
export function update() { return Promise.resolve(); }
