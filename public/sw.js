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

// =============================
// Firebase Cloud Messaging (Background)
// =============================
// Use compat SDK in the service worker for simplicity
try {
  // These scripts are allowed by CSP (gstatic)
  // IMPORTANT: Keep this version in sync with package.json firebase version (11.8.1)
  importScripts('https://www.gstatic.com/firebasejs/11.8.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/11.8.1/firebase-messaging-compat.js');

  // Minimal init for messaging (public values)
  // Note: messagingSenderId is not secret; safe to expose in SW
  firebase.initializeApp({
    apiKey: 'AIzaSyC_kanIBFqxyq8LLE4CKuzH24yEfCMjFiQ',
    appId: '1:749689064628:web:e757a95468a0a9a285dbe1',
    projectId: 'meetchuthere-00',
    messagingSenderId: '749689064628',
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    try {
      const notificationTitle = payload?.notification?.title || 'Notification';
      const notificationOptions = {
        body: payload?.notification?.body || '',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: {
          link: payload?.data?.link || '/',
        },
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
    } catch (e) {
      // swallow
    }
  });
} catch (e) {
  // Messaging may not be available in all browsers – fail silently
}

// Focus/open client on notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification && event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ includeUncontrolled: true, type: 'window' });
    const url = new URL(link, self.location.origin).href;
    // Try to focus an open tab of our app
    for (const client of allClients) {
      // If the app is already open, just focus it and navigate if needed
      if ('focus' in client) {
        await client.focus();
        try { client.navigate(url); } catch (_) {}
        return;
      }
    }
    // Otherwise, open a new window
    if (clients.openWindow) {
      return clients.openWindow(url);
    }
  })());
});
