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
  │ App shell ("/")    │ Cached shell instantly, atomic bg refresh  │
  │ Other navigations  │ Network-first, fallback to cached shell    │
  │ Hashed /assets/*   │ Cache-first (content-hashed = immutable)   │
  │ /templates/*.html  │ Stale-while-revalidate (instant + refresh) │
  │ Other JS/CSS/img   │ Stale-while-revalidate (instant + refresh) │
  │ Google Fonts       │ Cache-first (fonts rarely change)          │
  │ API/Firestore      │ Network-only (dynamic data)                │
  │ Icons              │ Network-first (allow updates)              │
  └────────────────────┴─────────────────────────────────────────────┘
*/

// ═══════════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

// Bump version to force clients to re-cache everything (increment on deploy)
const CACHE_VERSION = "v12";
const STATIC_CACHE = `meetchuthere-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `meetchuthere-dynamic-${CACHE_VERSION}`;
const FONT_CACHE = `meetchuthere-fonts-${CACHE_VERSION}`;
const AVATAR_CACHE = `meetchuthere-avatars-${CACHE_VERSION}`;
const AVATAR_CACHE_MAX_ENTRIES = 300;

// The SPA shell is always stored under this one key, whatever URL launched it
// ("/", "/?logs=debug", "/index.html"). We fetch "/" rather than "/index.html"
// because some hosts (Cloudflare Pages) redirect "/index.html" → "/", and a
// redirected response cannot be used to answer a navigation request.
const SHELL_URL = "/";

// Vite emits content-hashed files into these folders (see vite.config.js).
// A hashed URL never changes content, so it is safe to serve cache-first forever.
// NOTE: unhashed files copied from public/assets/ live directly under /assets/
// and are deliberately NOT matched here.
const HASHED_ASSET_PATH = /^\/assets\/(js|css|images)\//;

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * True when a response is a real asset rather than the SPA fallback.
 * The host rewrites unknown paths to index.html with status 200, so a missing
 * JS/CSS file would otherwise be cached as HTML and break the app.
 */
function isRealAssetResponse(response) {
  if (!response || response.status !== 200) return false;
  const contentType = response.headers.get("content-type") || "";
  return !contentType.includes("text/html");
}

/** Collect the hashed assets (entry JS, preloaded chunks, CSS) a shell references. */
function extractShellAssets(html) {
  const assets = new Set();
  const pattern = /(?:src|href)="(\/assets\/(?:js|css|images)\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    assets.add(match[1]);
  }
  return [...assets];
}

/**
 * Fetch the latest shell and swap it into the cache ATOMICALLY:
 * every asset the new shell references is cached first, and only then is the
 * shell itself replaced. A cached shell therefore never points at assets that
 * are missing from the cache, even right after a deploy or while offline.
 */
async function refreshShell() {
  const response = await fetch(SHELL_URL, {
    cache: "no-cache",
    credentials: "same-origin",
  });
  const contentType = (response && response.headers.get("content-type")) || "";
  if (!response || response.status !== 200 || !contentType.includes("text/html")) {
    throw new Error("Shell refresh: unexpected response");
  }

  const html = await response.text();
  const assetCache = await caches.open(DYNAMIC_CACHE);
  await Promise.all(
    extractShellAssets(html).map(async (assetUrl) => {
      if (await assetCache.match(assetUrl)) return;
      const assetResponse = await fetch(assetUrl);
      if (!isRealAssetResponse(assetResponse)) {
        throw new Error(`Shell refresh: asset unavailable ${assetUrl}`);
      }
      await assetCache.put(assetUrl, assetResponse);
    })
  );

  // Keep the original headers: the Content-Security-Policy and other security
  // headers are delivered as HTTP headers and must survive in the cached copy.
  const headers = new Headers(response.headers);
  headers.delete("content-encoding"); // body below is already decoded
  headers.delete("content-length");
  const shell = new Response(html, { status: 200, headers });
  const shellCache = await caches.open(STATIC_CACHE);
  await shellCache.put(SHELL_URL, shell);
}

// ═══════════════════════════════════════════════════════════════════
// INSTALL EVENT - Pre-cache app shell
// ═══════════════════════════════════════════════════════════════════

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // Best-effort: a failed pre-cache must not block installation. The fetch
      // handler falls back to the network until a shell has been cached.
      refreshShell().catch(() => {}),
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.add("/manifest.json"))
        .catch(() => {}),
    ]).then(() => self.skipWaiting()) // Activate immediately
  );
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVATE EVENT - Clean old caches
// ═══════════════════════════════════════════════════════════════════

self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, FONT_CACHE, AVATAR_CACHE];

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old version caches
            if (!currentCaches.includes(cacheName)) {
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

  const isSameOrigin = url.origin === self.location.origin;

  // ─────────────────────────────────────────────────────────────────
  // Strategy 1a: APP SHELL NAVIGATION ("/" – the PWA start_url)
  // Serve the cached shell immediately so launch never waits on the network,
  // then refresh it in the background for the next launch.
  // ─────────────────────────────────────────────────────────────────
  if (request.mode === "navigate") {
    const isShellNavigation =
      isSameOrigin && (url.pathname === "/" || url.pathname === "/index.html");

    if (isShellNavigation) {
      event.respondWith(
        (async () => {
          const cachedShell = await caches.match(SHELL_URL);
          // Runs after we respond; keeps the worker alive until it finishes.
          event.waitUntil(refreshShell().catch(() => {}));
          if (cachedShell) return cachedShell;
          try {
            return await fetch(request);
          } catch (_e) {
            return (await caches.match(SHELL_URL)) || Response.error();
          }
        })()
      );
      return;
    }

    // ───────────────────────────────────────────────────────────────
    // Strategy 1b: OTHER NAVIGATIONS (e.g. the static /about/ page)
    // Network-first; offline falls back to the cached SPA shell.
    // ───────────────────────────────────────────────────────────────
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match(SHELL_URL)) || Response.error();
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
            if (
              networkResponse.status === 200 &&
              networkResponse.type !== "opaque"
            ) {
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
            if (
              networkResponse.status === 200 &&
              networkResponse.type !== "opaque"
            ) {
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
  // Strategy 3.5: AVATARS / PROFILE PHOTOS (DiceBear, Firebase Storage, Googleusercontent)
  // Cache-first for instant avatar rendering (critical on the Home page).
  // We cache opaque responses too (common for <img> no-cors requests).
  // ─────────────────────────────────────────────────────────────────
  const isAvatarHost =
    url.hostname === "api.dicebear.com" ||
    url.hostname.endsWith(".dicebear.com") ||
    url.hostname === "firebasestorage.googleapis.com" ||
    url.hostname === "storage.googleapis.com" ||
    url.hostname === "googleusercontent.com" ||
    url.hostname.endsWith(".googleusercontent.com");

  if (isAvatarHost) {
    // IMPORTANT:
    // Only cache GET image requests. Firebase Storage uploads (POST/PUT) may hit
    // `firebasestorage.googleapis.com` and must never be intercepted by Cache API.
    if (request.method !== "GET") {
      return;
    }
    const accept = request.headers.get("accept") || "";
    const isImageRequest =
      request.destination === "image" || accept.includes("image/");
    if (!isImageRequest) {
      return;
    }

    event.respondWith(
      caches.open(AVATAR_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(request);
          // Cache successful or opaque responses
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === "opaque")
          ) {
            await cache.put(request, networkResponse.clone());

            // Simple eviction to prevent unbounded growth
            try {
              const keys = await cache.keys();
              if (keys.length > AVATAR_CACHE_MAX_ENTRIES) {
                const excess = keys.length - AVATAR_CACHE_MAX_ENTRIES;
                for (let i = 0; i < excess; i++) {
                  await cache.delete(keys[i]);
                }
              }
            } catch (_e) {
              // Non-fatal: cache eviction best-effort
            }
          }
          return networkResponse;
        } catch (_e) {
          // Offline or fetch failed
          return cached || new Response("", { status: 504 });
        }
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
  // Strategy 5a: CONTENT-HASHED BUILD ASSETS (/assets/js|css|images/)
  // Cache-first, never revalidated: the hash in the filename changes whenever
  // the content does, so re-downloading them on every launch is pure waste.
  // ─────────────────────────────────────────────────────────────────
  if (isSameOrigin && HASHED_ASSET_PATH.test(url.pathname)) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const networkResponse = await fetch(request);
        if (isRealAssetResponse(networkResponse)) {
          cache.put(request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      })
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy 5b: SPA PAGE TEMPLATES (/templates/*.html)
  // Stale-while-revalidate: the router gets the fragment instantly (and
  // offline), while a fresh copy is stored for the next visit.
  // ─────────────────────────────────────────────────────────────────
  if (
    isSameOrigin &&
    url.pathname.startsWith("/templates/") &&
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const revalidate = (async () => {
          const networkResponse = await fetch(request);
          if (networkResponse.status === 200) {
            // Never cache the SPA fallback (a full document) as a template.
            const body = await networkResponse.clone().text();
            if (!/^\s*<!doctype/i.test(body)) {
              await cache.put(request, networkResponse.clone());
            }
          }
          return networkResponse;
        })();

        if (cached) {
          event.waitUntil(revalidate.catch(() => {}));
          return cached;
        }
        return revalidate;
      })
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy 5c: OTHER SAME-ORIGIN STATIC ASSETS
  // Stale-while-revalidate for instant loading + freshness
  // ─────────────────────────────────────────────────────────────────

  // Skip icon paths (allow favicon updates)
  const isIconPath =
    url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico";

  // Cacheable static assets: JS, CSS, fonts, images (except icons)
  const isStaticAsset =
    /\.(js|mjs|css|woff2?|ttf|eot|png|jpg|jpeg|webp|svg)$/i.test(
      url.pathname
    ) || url.pathname === "/manifest.json";

  if (isSameOrigin && isStaticAsset && !isIconPath) {
    // In dev (Vite), module URLs often include cache-buster query params like `?t=...`.
    // Caching those causes Cache Storage to grow on every reload and can interfere with HMR.
    // The service worker script itself must always come from the network.
    if (
      url.searchParams.has("t") ||
      url.pathname.startsWith("/@vite") ||
      url.pathname.startsWith("/src/") ||
      url.pathname === "/sw.js"
    ) {
      return;
    }

    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Start network fetch in background (revalidate)
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (isRealAssetResponse(networkResponse)) {
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed, return cached if available
            return cachedResponse || Response.error();
          });

        if (cachedResponse) {
          event.waitUntil(networkFetch.catch(() => {}));
          return cachedResponse;
        }
        return networkFetch;
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
