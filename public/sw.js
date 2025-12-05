/*
  Enhanced Service Worker for MeetchuThere PWA
  
  ════════════════════════════════════════════════════════════════════
  STRATEGY: App Shell + Stale-While-Revalidate + Offline-First
  ════════════════════════════════════════════════════════════════════
  
  Goals:
  1. INSTANT startup - Cache app shell (HTML, CSS, JS bundles)
  2. OFFLINE-FIRST - Show cached content immediately, refresh in background
  3. SMART CACHING - Different strategies for different resource types
  
  Resource Strategies:
  ┌────────────────────┬─────────────────────────────────────────────┐
  │ Resource Type      │ Strategy                                    │
  ├────────────────────┼─────────────────────────────────────────────┤
  │ Navigation (HTML)  │ Network-first, fallback to cached shell    │
  │ JS/CSS bundles     │ Stale-while-revalidate (instant + refresh) │
  │ Google Fonts       │ Cache-first (fonts rarely change)          │
  │ API/Firestore      │ Network-only (dynamic data)                │
  │ Icons              │ Network-first (allow updates)              │
  └────────────────────┴─────────────────────────────────────────────┘
*/

// ═══════════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

// Bump version to force clients to re-cache everything (increment on deploy)
const CACHE_VERSION = "v10";
const STATIC_CACHE = `meetchuthere-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `meetchuthere-dynamic-${CACHE_VERSION}`;
const FONT_CACHE = `meetchuthere-fonts-${CACHE_VERSION}`;

// Core app shell - these MUST be cached for offline startup
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  // CSS is bundled by Vite, will be cached dynamically on first load
];

// ═══════════════════════════════════════════════════════════════════
// INSTALL EVENT - Pre-cache app shell
// ═══════════════════════════════════════════════════════════════════

self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Pre-caching app shell");
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVATE EVENT - Clean old caches
// ═══════════════════════════════════════════════════════════════════

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, FONT_CACHE];

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old version caches
            if (!currentCaches.includes(cacheName)) {
              console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim()) // Take control of all pages immediately
  );
});

// ═══════════════════════════════════════════════════════════════════
// FETCH EVENT - Smart caching strategies
// ═══════════════════════════════════════════════════════════════════

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // ─────────────────────────────────────────────────────────────────
  // Strategy 1: NAVIGATION REQUESTS (HTML pages)
  // Network-first with offline fallback to cached shell
  // ─────────────────────────────────────────────────────────────────
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline: return cached index.html (SPA will handle routing)
          return caches.match("/index.html");
        })
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy 2: GOOGLE FONTS - Cache-first (fonts rarely change)
  // NOTE: The HTML <link> tags MUST have crossorigin="anonymous" for this to work!
  // Without crossorigin, font requests are non-CORS and cannot be cached properly.
  // ─────────────────────────────────────────────────────────────────
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Don't override request mode - browser already sets correct CORS mode
        // when crossorigin="anonymous" is on the <link> element
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful CORS responses (not opaque)
            if (networkResponse.status === 200 && networkResponse.type !== "opaque") {
              const responseClone = networkResponse.clone();
              caches.open(FONT_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch((err) => {
            console.warn("[SW] Failed to fetch font:", url.href, err);
            return new Response("", { status: 503 });
          });
      })
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy 3: EXTERNAL CDN ASSETS (Font Awesome, etc.)
  // Cache-first for performance
  // Font Awesome CSS from cdnjs, fonts from ka-f.fontawesome.com
  // NOTE: The HTML <link> tags MUST have crossorigin="anonymous" for this to work!
  // ─────────────────────────────────────────────────────────────────
  if (
    url.hostname === "cdnjs.cloudflare.com" ||
    url.hostname === "ka-f.fontawesome.com" ||
    url.hostname === "kit.fontawesome.com" ||
    url.hostname.includes("fontawesome")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Don't override request mode - browser already sets correct CORS mode
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful CORS responses (not opaque)
            if (networkResponse.status === 200 && networkResponse.type !== "opaque") {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch((err) => {
            console.warn("[SW] Failed to fetch CDN asset:", url.href, err);
            // Return empty response for failed font requests
            return new Response("", { status: 503 });
          });
      })
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy 4: FIREBASE/API REQUESTS - Network-only
  // Don't cache dynamic API responses
  // NOTE: Be specific to avoid blocking Google Fonts (fonts.googleapis.com)
  // ─────────────────────────────────────────────────────────────────
  const isFirebaseRequest =
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("cloudfunctions.net") ||
    (url.hostname.includes("gstatic.com") &&
      !url.hostname.includes("fonts.gstatic.com"));

  if (isFirebaseRequest) {
    // Let these pass through to network (or fail gracefully)
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy 5: SAME-ORIGIN STATIC ASSETS
  // Stale-while-revalidate for instant loading + freshness
  // ─────────────────────────────────────────────────────────────────
  const isSameOrigin = url.origin === self.location.origin;

  // Skip icon paths (allow favicon updates)
  const isIconPath =
    url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico";

  // Skip HTML templates (dynamic content)
  const isTemplatePath = url.pathname.includes("/templates/");

  // Cacheable static assets: JS, CSS, fonts, images (except icons)
  const isStaticAsset =
    /\.(js|mjs|css|woff2?|ttf|eot|png|jpg|jpeg|webp|svg)$/i.test(
      url.pathname
    ) || url.pathname === "/manifest.json";

  if (isSameOrigin && isStaticAsset && !isIconPath && !isTemplatePath) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Start network fetch in background (revalidate)
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed, return cached if available
            return cachedResponse;
          });

        // Return cached immediately, update in background
        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Default: Let request pass through to network
  // ─────────────────────────────────────────────────────────────────
});

// =============================
// Firebase Cloud Messaging (Background)
// =============================
// Use compat SDK in the service worker for simplicity
try {
  // These scripts are allowed by CSP (gstatic)
  // IMPORTANT: Keep this version in sync with package.json firebase version (11.8.1)
  importScripts(
    "https://www.gstatic.com/firebasejs/11.8.1/firebase-app-compat.js"
  );
  importScripts(
    "https://www.gstatic.com/firebasejs/11.8.1/firebase-messaging-compat.js"
  );

  // Minimal init for messaging (public values)
  // Note: messagingSenderId is not secret; safe to expose in SW
  firebase.initializeApp({
    apiKey: "AIzaSyC_kanIBFqxyq8LLE4CKuzH24yEfCMjFiQ",
    appId: "1:749689064628:web:e757a95468a0a9a285dbe1",
    projectId: "meetchuthere-00",
    messagingSenderId: "749689064628",
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
      console.log("Notification already shown by Firebase, skipping duplicate");
      return;
    }

    // Handle data-only messages
    try {
      const notificationTitle = payload?.data?.title || "Notification";
      const deepLink = payload?.data?.link || "/#notifications";
      const tag = payload?.data?.notificationTag || "meetchuthere-notification";
      const notificationOptions = {
        body: payload?.data?.body || "",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/notification-badge-96x96.png", // White silhouette for Android status bar
        tag,
        renotify: true,
        requireInteraction: false, // Ignored on Android; false better for desktop
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        silent: false,
        actions: [
          { action: "open", title: "View", icon: "/icons/icon-72x72.png" },
        ],
        data: {
          link: deepLink,
          notificationTag: tag,
        },
      };
      self.registration.showNotification(
        notificationTitle,
        notificationOptions
      );
    } catch (e) {
      // swallow
    }
  });
} catch (e) {
  // Messaging may not be available in all browsers – fail silently
}

// Focus/open client on notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Default to notifications page if no deep link provided
  const defaultLink = "/#notifications";
  const link =
    (event.notification &&
      event.notification.data &&
      event.notification.data.link) ||
    defaultLink;
  const actionLink =
    event.action && typeof event.action === "string" ? link : link; // reserved for future actions

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });
      const url = new URL(actionLink, self.location.origin).href;

      // Try to focus an open tab of our app and navigate it
      for (const client of allClients) {
        try {
          if ("focus" in client) {
            await client.focus();
          }
          if ("navigate" in client) {
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
    })()
  );
});
