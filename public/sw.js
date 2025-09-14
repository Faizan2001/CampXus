/*
  Minimal service worker for MeetchuThere
  - Caches the app shell for basic offline and installability
  - Uses stale-while-revalidate for static assets
*/

const CACHE_NAME = 'meetchuthere-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/css/styles.css',
  '/public/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigation requests → try network, fallback to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Only handle same-origin static assets; let APIs (e.g., Firebase) hit the network
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isStatic = /\.(?:css|js|mjs|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|eot|html)$/.test(url.pathname)
    || url.pathname === '/manifest.json';

  if (!(sameOrigin && isStatic)) {
    return; // don't intercept dynamic/API requests
  }

  // Static assets → stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached || Promise.reject('no-match'));
      return cached || networkFetch;
    })
  );
});
