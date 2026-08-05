// Tallyman Master Service Worker
// 매 빌드마다 VERSION 변경 → 새 버전 감지 → UpdatePrompt 알림 + 자동 새로고침
const VERSION = 'TallyUni 0.1';
const CACHE_NAME = `tallyman-${VERSION}`;

self.addEventListener('install', (e) => {
  // V7.60: 콘앱 카고플랜 번들(1.6MB)을 설치 때 미리 캐시 — 약신호(배 안)에서도 즉시 로드.
  //   실패해도 설치를 막지 않음 (런타임 캐시가 보완).
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.add('cone-cargoplan.js').catch(() => {}))
      .catch(() => {})
  );
  // 즉시 활성화 — 새 버전 빠르게 적용
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      // 옛 캐시 모두 삭제
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      // 즉시 클라이언트 제어
      self.clients.claim(),
    ])
  );
});

// SKIP_WAITING 메시지 받으면 즉시 활성화 (UpdatePrompt 버튼)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// fetch — network-first 유지 (새 버전 즉시 반영) + 성공 응답을 캐시에 적재.
// V7.35: 기존엔 cache.put이 없어 caches.match 폴백이 항상 실패(죽은 코드)
//   → 오프라인이면 흰 화면. 같은 출처(same-origin) GET 성공분만 캐시에 넣어
//   신호 끊긴 곳(홀드 안 등)에서 마지막 성공본으로 화면 유지.
//   네트워크가 항상 우선이므로 업데이트 즉시 반영 동작은 그대로.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  let sameOrigin = false;
  try { sameOrigin = new URL(e.request.url).origin === self.location.origin; } catch {}
  if (!sameOrigin) return;  // Firebase 등 외부 요청은 관여하지 않음
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((m) =>
          m || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
