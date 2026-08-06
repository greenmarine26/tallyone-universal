// TallyUni 0.6/0.9 시뮬 전용 — firebase/database 대역. 실 Firebase에 붙지 않는다.
//   0.6: settings 노드 조회(get)만 필요했다 → __SIM.settings.
//   0.9: 사전 시딩·권한자 명단 구독까지 봐야 한다 → 아주 작은 메모리 트리(__SIM.tree)를 얹었다.
//        기존 0.6 시뮬의 동작(get('settings') · probeFail · log)은 그대로 둔다.
function S() { return (globalThis.__SIM = globalThis.__SIM || {}); }
function tree() { const s = S(); return (s.tree = s.tree || {}); }
function readPath(p) {
  const parts = String(p || '').split('/').filter(Boolean);
  let cur = tree();
  for (const k of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}
function writePath(p, v) {
  const parts = String(p || '').split('/').filter(Boolean);
  let cur = tree();
  for (const k of parts.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = v;
}
const listeners = [];   // [{path, cb}]
function notify(path) {
  for (const l of listeners) {
    if (l.path === path || String(path).startsWith(l.path + '/')) {
      const v = readPath(l.path);
      l.cb({ exists: () => v != null, val: () => v });
    }
  }
}

export function getDatabase(app) { return { app }; }
export function ref(db, path) { return { db, path }; }
export function get(r) {
  const s = S();
  (s.log = s.log || []).push(['get', r && r.path]);
  if (s.probeFail) return Promise.reject(new Error('시뮬: permission_denied'));
  // 0.6 계약: settings 는 __SIM.settings 가 정한다(트리보다 우선).
  const v = r && r.path === 'settings' ? s.settings : readPath(r && r.path);
  return Promise.resolve({ exists: () => v != null, val: () => v });
}
export function set(r, v) {
  const s = S();
  (s.writes = s.writes || []).push(['set', r && r.path, v]);
  if (s.writeFail) return Promise.reject(new Error('시뮬: 쓰기 거부'));
  writePath(r.path, v);
  notify(r.path);
  return Promise.resolve();
}
export function update(r, obj) {
  const s = S();
  (s.writes = s.writes || []).push(['update', r && r.path, obj]);
  if (s.writeFail) return Promise.reject(new Error('시뮬: 쓰기 거부'));
  if (s.seedWriteFail && String(r.path) === 'ship_bay_dict_v3') return Promise.reject(new Error('시뮬: 사전 쓰기 거부'));
  for (const [k, v] of Object.entries(obj || {})) writePath(`${r.path}/${k}`, v);
  notify(r.path);
  return Promise.resolve();
}
export function onValue(r, cb) {
  const l = { path: r.path, cb };
  listeners.push(l);
  const v = readPath(r.path);
  cb({ exists: () => v != null, val: () => v });
  return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
}
export function off(r, _ev, handler) {
  if (typeof handler === 'function') { try { handler(); } catch { /* noop */ } return; }
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === r.path) listeners.splice(i, 1);
}
export function remove(r) { writePath(r.path, null); notify(r.path); return Promise.resolve(); }
export function child(r, p) { return { db: r.db, path: `${r.path}/${p}` }; }
export function push(r) { const id = 'sim' + Math.random().toString(36).slice(2, 8); return { db: r.db, path: `${r.path}/${id}`, key: id }; }
export function goOffline() {}
export function goOnline() {}
