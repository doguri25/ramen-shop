// 한 번 열어 두면 다음부터는 학교 인터넷이 느리거나 끊겨도 가게가 바로 열려요.
// 새로 배포하면 v 값이 바뀌어 예전 저장본은 지워져요.
const V = new URL(self.location).searchParams.get('v') || '0';
const CACHE = 'ramen-' + V;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('ramen-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return; // 바깥 사이트(모델 CDN 등)는 그대로
  if (r.mode === 'navigate') {
    // 화면(index.html)은 새것 먼저, 안 되면 저장본
    e.respondWith(
      fetch(r)
        .then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); return res; })
        .catch(() => caches.match(r).then((m) => m || caches.match('./index.html'))),
    );
    return;
  }
  // 코드·글꼴·그림·3D 모델은 저장본 먼저 (없으면 받아서 저장)
  e.respondWith(
    caches.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    })),
  );
});
