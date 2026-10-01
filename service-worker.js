const CACHE_NAME = 'brybdpf-shell-v2';
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/branding/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Keep navigations fresh, but provide the cached shell when temporarily offline.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Only the public homepage belongs in the offline shell cache. Never
          // let /admin or another document replace the cached homepage.
          if (url.pathname === '/' || url.pathname === '/index.html') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html')
          ? new Response('অফলাইনে অ্যাডমিন প্যানেল খোলা যাবে না।', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          : caches.match('/'))
    );
    return;
  }

  // Static shell assets use stale-while-revalidate for fast repeat visits.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const refresh = fetch(request).then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => cached);
        return cached || refresh;
      })
    );
  }
});
