/* 시간표 PWA 서비스 워커
   - 모든 요청: 네트워크 우선(항상 최신), 실패(오프라인) 시 캐시
   - Sheets API: 네트워크 우선, 실패 시 마지막 성공 응답 */
const VERSION = 'v7';
const SHELL_CACHE = 'shell-' + VERSION;
const DATA_CACHE = 'data-' + VERSION;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'data/snapshot.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname === 'sheets.googleapis.com') {
    /* 네트워크 우선 + 성공 응답 캐시 (키는 API key 제외한 URL) */
    const cacheKey = url.origin + url.pathname + '?' + url.searchParams.get('ranges');
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(DATA_CACHE).then(c => c.put(cacheKey, copy));
        }
        return res;
      }).catch(() => caches.match(cacheKey).then(hit => hit || Response.error()))
    );
    return;
  }
  if (e.request.method === 'GET' && url.origin === self.location.origin) {
    /* 네트워크 우선: 코드/가이드 수정이 새로고침 즉시 반영. 오프라인이면 캐시 */
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || Response.error()))
    );
  }
});
