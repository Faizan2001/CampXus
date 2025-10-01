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

  // 🔔 Firebase automatically shows notifications when payload contains notification object
  // onBackgroundMessage is only needed for data-only messages or custom handling
  // Since we're sending notification+data from Cloud Functions, Firebase handles display
  // We just need to ensure click behavior is correct (handled by notificationclick listener below)

  messaging.onBackgroundMessage((payload) => {
    // Only show notification if it's a data-only message (no notification object)
    // This prevents duplicate notifications
    if (payload?.notification) {
      console.log('Notification already shown by Firebase, skipping duplicate');
      return;
    }

    // Handle data-only messages
    try {
      const notificationTitle = payload?.data?.title || 'Notification';
      const deepLink = payload?.data?.link || '/#notifications';
      const notificationOptions = {
        body: payload?.data?.body || '',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/notification-badge-96x96.png', // White silhouette for Android status bar
        tag: 'meetchuthere-notification',
        renotify: true,
        requireInteraction: false, // Ignored on Android; false better for desktop
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        silent: false,
        actions: [
          { action: 'open', title: 'View', icon: '/icons/icon-72x72.png' },
        ],
        data: {
          link: deepLink,
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
  // Default to notifications page if no deep link provided
  const defaultLink = '/#notifications';
  const link = (event.notification && event.notification.data && event.notification.data.link) || defaultLink;
  const actionLink = (event.action && typeof event.action === 'string') ? link : link; // reserved for future actions

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ includeUncontrolled: true, type: 'window' });
    const url = new URL(actionLink, self.location.origin).href;

    // Try to focus an open tab of our app and navigate it
    for (const client of allClients) {
      try {
        if ('focus' in client) {
          await client.focus();
        }
        if ('navigate' in client) {
          await client.navigate(url);
        }
        return;
      } catch (_) {
        // continue to next client
      }
    }
    // Otherwise, open a new window
    if (clients.openWindow) {
      return clients.openWindow(url);
    }
  })());
});
