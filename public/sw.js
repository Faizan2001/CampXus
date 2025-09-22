/*
  Minimal service worker for MeetchuThere
  - Caches the app shell for basic offline and installability
  - Uses stale-while-revalidate for static assets
*/

const CACHE_NAME = 'meetchuthere-shell-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/css/styles.css',
  '/manifest.json',
  // Avoid pre-caching icons to prevent stale favicons/logos in SERP
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

  // Do NOT cache HTML template fragments (e.g., /templates/*.html)
  const isHtml = url.pathname.endsWith('.html');
  const isIndexHtml = url.pathname === '/' || url.pathname === '/index.html';

  // Bypass caching for any icon files so favicon updates propagate immediately
  const isIconPath = url.pathname.startsWith('/icons/') || url.pathname === '/favicon.ico';

  // Static assets to cache: CSS/JS/fonts/images (excluding icons) + index.html + manifest
  const isStaticAsset = (/\.(?:css|js|mjs|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|eot)$/.test(url.pathname)
    || isIndexHtml
    || url.pathname === '/manifest.json') && !isIconPath;

  if (!(sameOrigin && isStaticAsset)) {
    return; // don't intercept dynamic/API requests or template HTML fragments
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
  return;
  
  // If it's an icon path, fall through and let the network fetch without caching
});
