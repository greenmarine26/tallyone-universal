// TallyUni 0.6 시뮬 전용 — firebase/app 대역. 실 Firebase에 붙지 않는다.
export function initializeApp(cfg, name) {
  const S = (globalThis.__SIM = globalThis.__SIM || {});
  (S.log = S.log || []).push(['initializeApp', name]);
  return { name, options: cfg };
}
export function deleteApp(app) {
  const S = (globalThis.__SIM = globalThis.__SIM || {});
  (S.log = S.log || []).push(['deleteApp', app && app.name]);
  return Promise.resolve();
}
