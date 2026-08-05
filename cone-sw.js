// 콘앱 전용 최소 서비스워커 — PWA 설치(안드로이드 홈화면 추가 배너) 활성화용.
//   캐시는 가볍게: 네트워크 우선, 실패 시 캐시 폴백 (콘앱은 Firebase 실시간 데이터라 항상 최신 우선).
const CACHE = 'cone-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
