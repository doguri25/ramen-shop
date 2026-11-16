// 한 번 열어 두면 다음부터는 학교 인터넷이 느리거나 끊겨도 가게가 바로 열려요.
// 빌드할 때 아래 두 값이 채워져요: 버전(파일이 바뀌면 바뀜)과 게임 파일 전체 목록.
const V = '__SW_VERSION__';
const FILES = self.__PRECACHE__ || [];
// 범위(수업용 /ramen-shop/, 행사용 /ramen-shop/event/)마다 저장본 이름을 따로 써요
const TAG = 'ramen-' + new URL(self.registration.scope).pathname + '-';
const CACHE = TAG + V;
const PAGE_WAIT = 3000; // 화면은 3초 기다려 보고, 늦으면 저장본을 먼저 보여 줘요

self.addEventListener('install', (e) => {
  // 게임 파일을 전부 받아 둬요. 하나라도 실패하면 설치하지 않고 예전 저장본을 그대로 써요
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FILES])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => (k.startsWith(TAG) || /^ramen-[0-9a-f]+$/.test(k)) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putIfGood = (req, res) => {
  if (res && res.ok && !res.redirected && res.type === 'basic') {
    const cp = res.clone();
    caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return; // 바깥 사이트(모델 CDN 등)는 그대로
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // 수업용 범위 안의 행사용(/event/) 주소는 행사용 서비스 워커에 맡겨요
  if (!self.registration.scope.endsWith('/event/') && url.pathname.includes('/event/')) return;
  if (r.mode === 'navigate') {
    // 화면(index.html): 새것을 먼저 기다리되, 늦거나 오류면 저장본
    e.respondWith((async () => {
      const cached = (await caches.match(r)) || (await caches.match('./index.html')) || (await caches.match('./'));
      const net = fetch(r).then((res) => (res.ok ? putIfGood(r, res) : cached || res)).catch(() => cached || Response.error());
      if (!cached) return net;
      const timer = new Promise((res) => setTimeout(() => res(cached), PAGE_WAIT));
      return Promise.race([net, timer]);
    })());
    return;
  }
  // 코드·글꼴·그림·3D 모델은 저장본 먼저 (없으면 받아서 저장)
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => putIfGood(r, res))));
});
