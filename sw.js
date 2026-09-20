// 앱 셸을 캐시해서 오프라인에서도 열리게 함.
// 앱 파일을 수정하면 CACHE 버전을 올려야 기존 사용자에게 갱신됨.
const CACHE = 'planner-shell-v31';
const SHELL = ['./', './deadline-planner.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase SDK(정적 파일)는 처음 한 번 받아 두고 이후엔 캐시에서 씀 — 오프라인에서도 앱이 켜지게 함
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  // 그 밖의 다른 출처(Gemini API, 구글 폰트, Firebase 통신 등)는 건드리지 않음
  if (url.origin !== location.origin) return;

  // 네트워크 우선, 실패하면 캐시 (수정 내용이 바로 반영되고 오프라인도 지원)
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./deadline-planner.html')))
  );
});
