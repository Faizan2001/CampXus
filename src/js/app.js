/**
 * MeetchuThere SPA Initialization
 *
 * 🎯 Learning: This file initializes our Single Page Application
 * It's like the "conductor" that makes sure everything starts up correctly!
 *
 * This script:
 * - Creates the router instance
 * - Handles authentication state
 * - Manages navigation redirects
 * - Integrates with existing app functionality
 */

import SPARouter from "./router/Router.js";
import "./components/navigation/Menu.js"; // 🎯 CRITICAL FIX: Import menu system for authentication state management
import { currentUser } from "./store/userStore.js"; // 🎯 FIX: Import currentUser for profile updates
import { authManager } from "./services/auth/AuthService.js"; // 🎯 NEW: Import authManager instead of using window
import { initModal } from "./components/modals/Modal.js"; // 🎯 FIX: Import modal system for app-wide availability
import {
  DOM_ELEMENTS,
  initializeDomElements,
} from "./utils/dom/domElements.js"; // 🎯 FIX: Import DOM elements for modal

// 🎯 CSS IMPORTS: Import all CSS here so Vite bundles it for both dev & prod
import "/src/css/styles.css";
import "/src/css/mutual-friends-modal.css";
import "/src/css/user-profile.css";
import "/src/css/clubs/index.css"; // 🏁 Clubs feature styles (modular folder)
import "/src/css/admin.css"; // 👑 Super Admin dashboard styles
import "/src/css/pwa-skeleton.css"; // 📱 PWA skeleton loading states for instant startup

// 🎯 JS IMPORTS: Import page-specific JS modules so Vite bundles them for preview mode
// Import in dependency order: manager first, then UI that depends on it
// Lazy-load page modules via Router routes. Remove heavy upfront imports to speed first paint.
// Home/Friends/Notifications/Profile controllers are now loaded by Router when needed.

// 🌍 Campus Presence Services
// Campus Presence services will be loaded lazily after auth to avoid slowing initial load

// 🔧 Development tools
import { logManager } from "./utils/debug/LogManager.js";
import { profileCache } from "./cache/profileCache.js"; // 🚀 Hydration cache
import { pwaInstallService } from "./services/pwa/PWAInstallService.js";
import { timerRegistry } from "./utils/timers/TimerRegistry.js";

// 🎯 DEBUG: Log that modules are imported
logManager.dev.debug("SPA Init: All page-specific modules imported and ready");

// M5: Track timers/intervals and clean up on SPA unload
try {
  timerRegistry.patchGlobals();
} catch (_) {
  // Non-fatal; timer tracking is best-effort
}

// 🔧 Logging profile: keep console clean by default, allow opt-in verbosity
(() => {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const params = new URLSearchParams(window.location.search);
  const storedProfile = localStorage.getItem("meetchuthere:logProfile");
  const requestedProfile = params.get("logs") || storedProfile;

  const applyProfile = (profile) => {
    switch ((profile || "").toLowerCase()) {
      case "all":
      case "debug":
        logManager.setLevel("debug");
        logManager.enableCategories(["all"]);
        logManager.dev.info("Debug profile: all logs enabled");
        // Lazy-load debug helpers when verbose profiles are enabled
        import("./utils/dev/debugHelpers.js").catch((error) => { logManager.dev.debug("Module import failed", { error: error?.message }); });
        break;
      case "info":
        logManager.setLevel("info");
        logManager.enableCategories(["system", "presence", "location", "auth"]);
        logManager.system.config("Info profile: key categories only");
        break;
      case "location":
        logManager.setLevel("debug");
        logManager.enableCategories(["location"]);
        logManager.system.config("Location profile: location-only logs");
        break;
      case "presence":
        logManager.setLevel("debug");
        logManager.enableCategories(["presence"]);
        logManager.system.config("Presence profile: presence-only logs");
        break;
      case "critical":
        logManager.setLevel("warn");
        logManager.enableCategories(["error", "auth", "system", "presence"]);
        logManager.system.config(
          "Critical profile: warnings/errors + key categories"
        );
        break;
      case "quiet":
      default:
        logManager.setLevel("warn");
        logManager.enableCategories(["all"]);
        if (profile === "quiet") {
          logManager.system.config("Quiet profile: warnings and errors only");
        }
        break;
    }
  };

  if (requestedProfile) {
    applyProfile(requestedProfile);
  } else if (isLocal) {
    // Default to critical logs locally to keep startup fast; override via ?logs=... or localStorage
    applyProfile("critical");
  } else {
    applyProfile("critical");
  }
})();

// 🎯 NEW: Create module-level variables instead of window globals
let spaRouter = null;
// Ensure this is defined before any lazy starter calls to avoid TDZ
let swUpdateIntervalId = null;
let swReloadedOnce = false;
let __presenceStarted = false;

// C6: Store global listener references for cleanup/idempotency
let __appListenersBound = false;
let __onBeforeUnloadMarkManualReload = null;
let __onThemeChangedSyncMeta = null;
let __onVisibilityChangeSyncMeta = null;
let __onPageShowSyncMeta = null;
let __onProfileSetupComplete = null;
let __onLocationSharingChanged = null;
let __onSpaNavigation = null;
let __onSpaRouteChanged = null;
let __onWindowResizeUpdateChrome = null;
let __onUnhandledRejection = null;
let __onWindowError = null;
let __onResourceErrorCapture = null;

/**
 * Initialize the SPA when DOM is ready
 * 🎯 Learning: We wait for the DOM to load before setting up our app
 */
async function initializeSPA() {
  logManager.system.init("MeetchuThere SPA Initialization");

  // Map pretty paths (/about) to SPA routes (#about) for direct links
  try {
    const path = (window.location.pathname || "/").replace(/\/+$/, "");
    const hasHash = !!window.location.hash;
    const routeFromPath = path.split("/").filter(Boolean).shift() || "";
    const known = new Set([
      "home",
      "friends",
      "notifications",
      "messages",
      "about",
      "profile",
      "landing",
    ]);
    if (!hasHash && known.has(routeFromPath) && routeFromPath !== "landing") {
      const newHash = `#${routeFromPath}`;
      history.replaceState({}, "", `/${newHash}`);
    }
  } catch (error) { logManager.dev.debug("Route normalization failed", { error: error?.message }); }

  // Double-check that essential DOM elements exist
  const mainContent = document.querySelector(".main-content");
  const topNav = document.querySelector(".top-nav");

  if (!mainContent) {
    logManager.system.error(
      "CRITICAL: .main-content not found. Cannot initialize SPA."
    );
    return;
  }

  // Initialize UI and routing immediately (do not block on auth)
  logManager.system.init("Creating SPA Router instance...");

  // Check if main-content container exists
  const mainContentContainer = document.querySelector(".main-content");
  if (!mainContentContainer) {
    logManager.system.error(
      "CRITICAL: .main-content container not found! SPA Router cannot work."
    );
    return;
  }

  // 🎯 FIX: Initialize DOM elements and modal system for app-wide availability
  logManager.system.init("Initializing DOM elements and modal system...");
  initializeDomElements();
  initModal(DOM_ELEMENTS);
  logManager.system.init("Modal system initialized successfully!");

  // Initialize PWA install gating and UI (Android prompt + iOS instructions)
  try {
    pwaInstallService.initialize();
  } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }

  // 🌍 Initialize Campus Presence services in background (NON-BLOCKING)
  // Defer Campus Presence services until auth is ready and user is logged in
  // This avoids network calls and logs when user is logged out.
  logManager.system.init(
    "Deferring Campus Presence services until after login"
  );

  spaRouter = new SPARouter();

  // Keep layout safe-area variables in sync with nav visibility
  const syncChrome = () => {
    try {
      spaRouter?.updateLayoutChromeState?.();
    } catch (error) { logManager.dev.debug("Layout sync failed", { error: error?.message }); }
  };
  syncChrome();
  window.addEventListener("resize", syncChrome);
  window.addEventListener("orientationchange", syncChrome);
  window.addEventListener("layoutChromeChange", syncChrome);

  // 🚀 PROFILE HYDRATION (stale-while-revalidate) BEFORE first page paint
  try {
    // First attempt: optimistic (before auth resolved) for instant UI fill
    const earlyHydrated = profileCache.tryHydrate(
      currentUser,
      authManager?.auth,
      { optimistic: true }
    );
    if (earlyHydrated) {
      logManager.system.init("Early optimistic profile hydration applied");
    }
    const hydrated = profileCache.tryHydrate(currentUser, authManager?.auth);
    if (hydrated) {
      logManager.system.init("Profile hydrated from cache (SWR mode)");
    }
  } catch (e) {
    logManager.system.warn("Profile hydration failed (non-fatal)", e);
  }

  // 🎯 Use a fast, cache-aware initial load:
  // If we have a strong session hint (cached profile or hydrated user),
  // optimistically render the target route (usually home) immediately and
  // skip the full-screen loading overlay. Auth will continue to resolve in
  // the background and Router's auth handling will correct the route if
  // needed. Otherwise, fall back to the smart auth-aware loader.
  try {
    const hasSessionHint =
      !!authManager?.auth?.currentUser ||
      !!profileCache.peek() ||
      (currentUser && currentUser.isLoggedIn && currentUser.isLoggedIn());

    if (spaRouter) {
      // If we already know (or strongly suspect) the user is logged in,
      // avoid sending them through the landing route on reload.
      if (hasSessionHint) {
        try {
          if (window.location.hash === "#landing") {
            history.replaceState({}, "", "#home");
          }
        } catch (error) { logManager.dev.debug("Route normalization failed", { error: error?.message }); }
        // Extra safety: skip first overlay in case any early navigation
        // path still attempts to show the SPA loader.
        spaRouter._skipNextLoadingOverlay = true;
      }

      await spaRouter.loadInitialPageSmart(authManager?.authReady, 1500);
    }
  } catch (e) {
    // Fallback to legacy initial load if anything goes wrong
    spaRouter.loadInitialPage();
  }

  // 🔐 Continue waiting for auth in the background (non-blocking for UI)
  if (authManager?.authReady) {
    logManager.auth.login("Auth check running in background...");
    const authTimeoutMs = 5000; // reasonable timeout for Firebase auth
    const authTimeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Auth timeout after ${authTimeoutMs} ms`)),
        authTimeoutMs
      )
    );
    (async () => {
      try {
        await Promise.race([authManager.authReady, authTimeout]);

        logManager.auth.login("Authentication ready (background)!");
        // Re-run hydration now that true auth user is known (will noop if already set)
        try {
          profileCache.tryHydrate(currentUser, authManager?.auth);
        } catch (error) { logManager.dev.debug("Cache operation failed", { error: error?.message }); }
        // If user is logged in, start Campus Presence services lazily now
        tryStartCampusPresenceAfterLogin();

        // Initialize push messaging after login
        try {
          const { pushMessagingService } = await import(
            "./services/realtime/PushMessagingService.js"
          );
          await pushMessagingService.initAfterLogin();
          await pushMessagingService.initAndMaybePrompt();

          // Subtle reminder banner only for logged-in users and not on landing
          try {
            const { notificationPermissionService } = await import(
              "./services/realtime/NotificationPermissionService.js"
            );
            const { notificationManager } = await import(
              "./services/realtime/NotificationService.js"
            );
            const isLoggedInNow =
              currentUser.isLoggedIn() && !!authManager?.auth?.currentUser;
            const isOnLanding =
              typeof spaRouter !== "undefined" &&
              spaRouter &&
              spaRouter.currentPage === "landing";

            if (!isLoggedInNow) {
              // Only show to logged-in users
              return;
            }

            const showPermissionNotice = () => {
              const freshState = notificationPermissionService.getState();
              if (freshState.actionable === "promptable") {
                notificationManager.showInfoNotification(
                  "Enable notifications to get instant alerts when friends share their campus location. Visit the Notifications page to enable.",
                  { duration: 5000 }
                );
              } else if (freshState.actionable === "denied") {
                notificationManager.showWarningNotification(
                  "Notifications are blocked. Enable them in your browser/app settings to get alerts.",
                  { duration: 6000 }
                );
              }
            };

            if (isOnLanding) {
              // Defer showing until we leave landing page
              const once = (event) => {
                try {
                  const route =
                    event?.detail?.route ||
                    (spaRouter && spaRouter.currentPage);
                  if (route && route !== "landing") {
                    document.removeEventListener("spa:route:changed", once);
                    showPermissionNotice();
                  }
                } catch (error) {
                  logManager.dev.debug("Route normalization failed", { error: error?.message });
                  document.removeEventListener("spa:route:changed", once);
                }
              };
              document.addEventListener("spa:route:changed", once);
              return;
            }

            // Not on landing; show immediately if actionable
            showPermissionNotice();
          } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }
        } catch (e) {
          logManager.system.warn("Push messaging init failed (non-fatal)", e);
        }
      } catch (error) {
        logManager.auth.warn(
          `Authentication timeout or error (background), continuing: ${error.message}`
        );
      }
    })();
  } else {
    logManager.auth.warn(
      "AuthManager or authReady promise not found. Proceeding without auth check."
    );
  }

  // ── BUG FIX ──
  // Register the profile setup completion listeners so that
  // `profile:setup:complete` and `profile:setup:skip` events
  // actually drive menu refresh and navigation.
  setupProfileCompletionFlow();

  // Also subscribe to currentUser to start presence services on first login event
  tryStartCampusPresenceAfterLogin(true);

  // Listen for SPA navigation events
  setupSPAEventListeners();

  // Global error capture for promise chains and async flows
  if (!__onUnhandledRejection) {
    __onUnhandledRejection = (event) => {
      try {
        const reason = event?.reason;
        logManager.system.error("Unhandled promise rejection", {
          message: reason?.message || String(reason),
          stack: reason?.stack,
        });
      } catch (error) {
        // If logging itself fails, avoid throwing from the handler
      }
    };
    window.addEventListener("unhandledrejection", __onUnhandledRejection);
  }

  if (!__onWindowError) {
    __onWindowError = (event) => {
      try {
        logManager.system.error("Uncaught error", {
          message: event?.message,
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
          stack: event?.error?.stack,
        });
      } catch (_) {
        // Avoid throwing from the handler
      }
    };
    window.addEventListener("error", __onWindowError);
  }

  // Capture resource load failures (e.g., failed <script type="module"> loads)
  // so DevTools-only errors like "unsupported MIME type (text/html)" include the URL.
  if (!__onResourceErrorCapture) {
    __onResourceErrorCapture = (event) => {
      try {
        // Ignore regular JS runtime errors (handled by __onWindowError)
        if (typeof ErrorEvent !== "undefined" && event instanceof ErrorEvent)
          return;

        const target = event?.target;
        if (!target || target === window) return;

        const tagName = target.tagName ? String(target.tagName).toUpperCase() : "";
        if (!tagName) return;

        const url =
          target.src ||
          target.href ||
          target.currentSrc ||
          target.getAttribute?.("src") ||
          target.getAttribute?.("href");
        if (!url) return;

        // Only log common resource types to avoid noise
        if (!["SCRIPT", "LINK", "IMG"].includes(tagName)) return;

        logManager.system.warn("Resource failed to load", {
          tag: tagName,
          url,
          rel: target.rel,
          type: target.type,
          as: target.as,
        });
      } catch (_) {
        // Avoid throwing from the handler
      }
    };
    window.addEventListener("error", __onResourceErrorCapture, true);
  }

  // Detect manual reloads (used by initialization logic)
  if (!__onBeforeUnloadMarkManualReload) {
    __onBeforeUnloadMarkManualReload = () => {
      // Mark that a manual reload is happening
      try {
        sessionStorage.setItem("campusLocationService_reload", "true");
      } catch (error) {
        logManager.dev.debug("Cache operation failed", { error: error?.message });
      }
    };
    window.addEventListener("beforeunload", __onBeforeUnloadMarkManualReload);
  }

  logManager.system.init("SPA Initialization completed");

  // Show environment indicator on non-production domains
  if (window.location.hostname !== "meetchuthere.com") {
    const envBanner = document.createElement("div");
    const envName = window.location.hostname.includes("stage")
      ? "STAGING"
      : "DEV";
    // Place banner near the bottom-left so it never obscures the top navigation
    // and make it click-through (pointer-events: none).
    const bottomOffset = `calc(var(--mobile-bottom-nav-height, 60px) + env(safe-area-inset-bottom, 0px) + 8px)`;
    envBanner.style.cssText =
      [
        "position:fixed",
        `left:8px`,
        `bottom:${bottomOffset}`,
        "background:rgba(255,152,0,0.9)",
        "color:white",
        "padding:4px 8px",
        "z-index:1500",
        "border-radius:4px",
        "font-size:10px",
        "font-weight:600",
        "letter-spacing:0.5px",
        "box-shadow:0 2px 4px rgba(0,0,0,0.2)",
        "pointer-events:none",
      ].join(";") + ";";
    envBanner.textContent = envName;
    document.body.appendChild(envBanner);
  }

  // Sync browser UI theme color with nav background for seamless header
  try {
    syncMetaThemeColorToNav();
    // Keep it in sync when theme toggles
    if (!__onThemeChangedSyncMeta) {
      __onThemeChangedSyncMeta = () => syncMetaThemeColorToNav();
      window.addEventListener("themeChanged", __onThemeChangedSyncMeta);
    }
    // Re-sync when PWA is resumed from background (fixes status bar color mismatch)
    if (!__onVisibilityChangeSyncMeta) {
      __onVisibilityChangeSyncMeta = () => {
        if (!document.hidden) {
          syncMetaThemeColorToNav();
        }
      };
      document.addEventListener("visibilitychange", __onVisibilityChangeSyncMeta);
    }
    // Also sync on page show (handles back/forward cache)
    if (!__onPageShowSyncMeta) {
      __onPageShowSyncMeta = () => syncMetaThemeColorToNav();
      window.addEventListener("pageshow", __onPageShowSyncMeta);
    }
  } catch (error) { logManager.dev.debug("Layout sync failed", { error: error?.message }); }

  // Register service worker (PWA install + offline shell)
  tryRegisterServiceWorker();

  // Dev-only: install onboarding test tools (console command + header button)
  try {
    if (import.meta?.env?.DEV) {
      const { installOnboardingDevTools } = await import(
        "./utils/dev/DevOnboardingTools.js"
      );
      installOnboardingDevTools();
    }
  } catch (error) {
    logManager.dev.debug("Module import failed", { error: error?.message });
  }

  // No debug gesture in production
}

// ===== TEMP DEBUG (ultra-wide collapse) =====
// Logs container widths and route when viewport >= 1854px
// Ultra-wide debug removed per request

// Initialize when DOM is ready, or immediately if already ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSPA);
} else {
  // DOM is already ready, execute immediately
  logManager.system.init("DOM already ready, initializing SPA immediately...");
  initializeSPA();
}

/**
 * Handle profile setup completion flow
 * 🎯 Learning: In SPAs, we redirect using JavaScript instead of page reloads
 */
function setupProfileCompletionFlow() {
  // Listen for profile setup completion
  if (!__onProfileSetupComplete) {
    __onProfileSetupComplete = async (event) => {
    logManager.auth.user(
      "Profile setup completed, refreshing user data and redirecting..."
    );

    // 🎯 CRITICAL FIX: Update currentUser store with fresh profile data
    const userData = event.detail.userData;
    if (userData && currentUser) {
      logManager.auth.user(
        "Updating currentUser store with fresh profile data..."
      );

      // Update the currentUser store with the fresh profile data
      currentUser.setProfile(userData);

      // Also ensure the user object is set if it wasn't already
      if (!currentUser.user && authManager?.getCurrentUser()) {
        currentUser.setUser(authManager.getCurrentUser());
      }

      logManager.auth.user("currentUser store updated with fresh profile data");
    }

    // Show success message briefly, then redirect
    setTimeout(() => {
      if (spaRouter) {
        logManager.ui.click("Navigating to home after profile completion...");
        // Set completion flag for the SPA router to handle
        sessionStorage.setItem("profileJustCompleted", "true");
        spaRouter.navigateTo("home");
      } else {
        logManager.system.error(
          "SPA Router not available for profile completion navigation!"
        );
      }
    }, 500); // Reduced to 0.5 second delay
    };
    document.addEventListener("profile:setup:complete", __onProfileSetupComplete);
  }
}

function tryStartCampusPresenceAfterLogin(subscribe = false) {
  const startIfNeeded = async () => {
    if (__presenceStarted) return;
    const isLoggedIn = !!(currentUser?.uid || authManager?.auth?.currentUser);
    const sharingEnabled =
      currentUser?.profile?.systemInfo?.locationSharingEnabled === true;
    if (!isLoggedIn) return; // auth not ready
    if (!sharingEnabled) {
      if (logManager?.dev) {
        logManager.dev.debug(
          "Campus Presence start deferred: global location sharing disabled"
        );
      }
      return;
    }
    __presenceStarted = true;
    logManager.location.info(
      "Starting Campus Presence services after login..."
    );
    try {
      await initializeCampusPresenceInBackground();
      // Start scheduler lazily
      try {
        const { locationScheduler } = await import(
          "./services/location/LocationScheduler.js"
        );
        locationScheduler.start?.();
      } catch (e) {
        logManager.location.warn(
          "LocationScheduler start failed (non-critical):",
          e?.message || e
        );
      }
    } catch (e) {
      logManager.location.warn(
        "Campus Presence lazy init failed:",
        e?.message || e
      );
    }
  };

  // Immediate attempt
  startIfNeeded();

  // Optional subscription to auth changes
  if (subscribe && typeof currentUser?.subscribe === "function") {
    let armed = true;
    currentUser.subscribe(() => {
      if (!armed) return;
      if (currentUser?.uid) {
        armed = false; // run once
        startIfNeeded();
      }
    });
  }
}

// 🔐 NEW: Listen for global location sharing being enabled to start presence lazily
if (!__onLocationSharingChanged) {
  __onLocationSharingChanged = (e) => {
    try {
      const detail = e.detail;
      if (!detail) return;
      if (detail.type === "global" && detail.enabled === true) {
        if (logManager?.dev) {
          logManager.dev.debug(
            "Global location sharing enabled via toggle – starting Campus Presence services"
          );
        }
        // Re-attempt start (will no-op if already started)
        tryStartCampusPresenceAfterLogin(false);
        // Proactively request an immediate location update once services load
        (async () => {
          try {
            const { campusLocationService } = await import(
              "./services/location/CampusLocationService.js"
            );
            if (
              campusLocationService?.requestSingleLocationUpdate &&
              typeof campusLocationService.requestSingleLocationUpdate ===
                "function"
            ) {
              campusLocationService.requestSingleLocationUpdate();
            }
          } catch (error) {
            logManager.dev.debug("Module import failed", { error: error?.message });
          }
        })();
      } else if (detail.type === "global" && detail.enabled === false) {
        // Optional: could log that presence will halt (actual stopping handled by toggle component)
        if (logManager?.dev) {
          logManager.dev.debug(
            "Global location sharing disabled – presence tracking should stop (handled by toggle)"
          );
        }
      }
    } catch (error) {
      logManager.dev.debug("Route normalization failed", { error: error?.message });
    }
  };
  document.addEventListener("location-sharing-changed", __onLocationSharingChanged, {
    passive: true,
  });
}

/**
 * Set up SPA-specific event listeners
 * 🎯 Learning: SPAs use events to communicate between different parts
 */
function setupSPAEventListeners() {
  if (__appListenersBound) return;
  __appListenersBound = true;

  // Listen for navigation events to update UI
  __onSpaNavigation = (event) => {
    const { route } = event.detail;

    // Update document title for better UX
    updatePageTitle(route);

    // Close any open menus/dropdowns when navigating
    closeAllDropdowns();

    // Scroll to top of page (like a normal page navigation would)
    window.scrollTo(0, 0);

    // Update any global UI elements based on current page
    updateGlobalUIForPage(route);
  };
  document.addEventListener("spa:navigation", __onSpaNavigation);

  // Sync chrome state after navigation and on resize (affects bottom nav visibility)
  __onSpaRouteChanged = () => {
    try {
      spaRouter?.updateLayoutChromeState?.();
    } catch (error) { logManager.dev.debug("Layout sync failed", { error: error?.message }); }
  };
  document.addEventListener("spa:route:changed", __onSpaRouteChanged);

  __onWindowResizeUpdateChrome = () => {
    try {
      spaRouter?.updateLayoutChromeState?.();
    } catch (error) { logManager.dev.debug("Layout sync failed", { error: error?.message }); }
  };
  window.addEventListener("resize", __onWindowResizeUpdateChrome);
}

/**
 * Update page title based on current route
 * 🎯 Learning: Good SPAs update the browser title for each "page"
 *
 * NOTE: The SPA Router now owns route-specific titles via its route
 * configuration (Router.routes[route].title). To avoid conflicts and
 * duplication, this helper intentionally no longer overrides
 * document.title; it is kept as a no-op for backwards compatibility
 * with existing event listeners that call updatePageTitle(route).
 */
function updatePageTitle(route) {
  // Router already set document.title based on the active route.
  // No additional work is required here.
  void route; // explicit no-op to satisfy linters and keep signature stable
}

/**
 * Close any open dropdowns when navigating
 * 🎯 Learning: Clean up UI state when moving between pages
 */
function closeAllDropdowns() {
  // Close user menu dropdown if open
  const userDropdown = document.getElementById("userDropdown");
  if (userDropdown) {
    userDropdown.classList.remove("show");
  }

  // Reset user menu trigger
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  if (userMenuTrigger) {
    userMenuTrigger.setAttribute("aria-expanded", "false");
  }
}

/**
 * Update global UI elements based on current page
 * 🎯 Learning: Some UI elements might change based on the current page
 */
function updateGlobalUIForPage(route) {
  // Example: You might want to highlight different nav items
  // or show/hide certain global elements based on the current page

  // Add page-specific class to body for CSS targeting
  document.body.className = document.body.className.replace(/\bpage-\w+/g, "");
  document.body.classList.add(`page-${route}`);

  // You could also update the navigation active states here
  // (though the router already handles this)
}

/**
 * Export navigateTo function for external use instead of window global
 * 🎯 Learning: Provide a simple way for other scripts to navigate
 */
export function navigateTo(route) {
  if (spaRouter) {
    spaRouter.navigateTo(route);
  } else {
    logManager.system.error("SPA Router not initialized yet");
  }
}

/**
 * Export for use in other modules
 * 🎯 Learning: Modern JavaScript modules can export functions
 */
export { setupProfileCompletionFlow, updatePageTitle };

/**
 * Initialize Campus Presence services in background without blocking UI
 * 🚀 Performance: Keeps app interactive during location API calls
 * 🎯 Fresh Data: Ensures presence dots get latest coordinates on first visit
 */
async function initializeCampusPresenceInBackground() {
  try {
    logManager.system.init(
      "Background: Non-blocking Campus Presence initialization started..."
    );

    // Enhanced fresh data detection with cache validation
    const isFirstVisit = !localStorage.getItem("campusLocationService_visited");
    const lastCacheTime = localStorage.getItem("campusPresence_lastFreshData");
    const cacheAge = lastCacheTime
      ? Date.now() - parseInt(lastCacheTime)
      : Infinity;
    const isCacheStale = cacheAge > 12 * 60 * 60 * 1000; // 12 hours cache expiry
    const forceRefresh =
      sessionStorage.getItem("campusLocationService_requiresFreshData") ===
      "true";

    const isFreshDataRequired = isFirstVisit || isCacheStale || forceRefresh;

    // Set priority mode for presence dots
    if (isFreshDataRequired) {
      logManager.location.info(
        "Fresh data required - setting priority mode for presence dots"
      );
      sessionStorage.setItem("campusPresence_forceFreshData", "true");
      sessionStorage.setItem("campusPresence_priorityMode", "fresh_data");

      // Emit immediate loading event for presence dots
      document.dispatchEvent(
        new CustomEvent("campus-presence:loading", {
          detail: {
            forceFreshData: true,
            priority: "presence_dots",
            reason: isFirstVisit
              ? "first_visit"
              : isCacheStale
              ? "cache_stale"
              : "force_refresh",
          },
        })
      );
    } else {
      logManager.location.info(
        "Using cached data for immediate presence display"
      );
      sessionStorage.setItem("campusPresence_priorityMode", "cached");
    }

    // Initialize location services with enhanced background processing
    const initializationPromise = (async () => {
      const { campusLocationService } = await import(
        "./services/location/CampusLocationService.js"
      );
      const { locationPrivacyService } = await import(
        "./services/location/LocationPrivacyService.js"
      );

      if (typeof campusLocationService.handleInitialization === "function") {
        await campusLocationService.handleInitialization();
      } else if (typeof campusLocationService.initialize === "function") {
        await campusLocationService.initialize();
      }

      if (typeof locationPrivacyService.initialize === "function") {
        await locationPrivacyService.initialize();
      }
    })();

    // For fresh data scenarios, start immediate location fetch in parallel
    if (isFreshDataRequired) {
      logManager.location.info(
        "Starting priority location fetch for fresh presence data..."
      );

      // Start fresh location fetch without blocking the main initialization
      fetchFreshLocationForPresence().catch((error) => {
        logManager.location.warn(`Priority location fetch failed: ${error}`);
        // Continue with standard initialization
      });
    }

    // Wait for main initialization to complete
    await initializationPromise;

    logManager.system.init(
      "Background: Campus Presence services initialized successfully!"
    );

    // Update cache timestamp if fresh data was loaded
    if (isFreshDataRequired) {
      localStorage.setItem(
        "campusPresence_lastFreshData",
        Date.now().toString()
      );
    }

    // Clean up temporary flags and notify completion
    sessionStorage.removeItem("campusPresence_forceFreshData");
    sessionStorage.removeItem("campusPresence_priorityMode");

    document.dispatchEvent(
      new CustomEvent("campus-presence:ready", {
        detail: {
          freshDataLoaded: isFreshDataRequired,
          cacheUsed: !isFreshDataRequired,
          initializationTime: Date.now(),
        },
      })
    );
  } catch (error) {
    logManager.system.error(
      `Background: Failed to initialize Campus Presence services: ${error}`
    );

    // Clean up flags on error
    sessionStorage.removeItem("campusPresence_forceFreshData");
    sessionStorage.removeItem("campusPresence_priorityMode");

    // Emit warning-style event for component handling
    document.dispatchEvent(
      new CustomEvent("campus-presence:error", {
        detail: {
          error: error.message,
          severity: "warning",
          timestamp: Date.now(),
        },
      })
    );

    // Continue - don't fail the app for location services
  }
}

/**
 * Fetch fresh location data specifically for presence dots with high priority
 * 🎯 Priority Mode: Ensures presence dots get latest coordinates quickly
 */
async function fetchFreshLocationForPresence() {
  logManager.location.info(
    "🎯 Priority: Fetching fresh location data for presence dots..."
  );

  try {
    const { campusLocationService } = await import(
      "./services/location/CampusLocationService.js"
    );
    // Use immediate location fetch for presence priority
    if (
      typeof campusLocationService.requestSingleLocationUpdate === "function"
    ) {
      // This method bypasses debouncing and gets fresh GPS immediately
      campusLocationService.requestSingleLocationUpdate();
      logManager.location.info(
        "✅ Priority: Fresh location request initiated for presence dots"
      );
    } else if (typeof campusLocationService.handleTriggerEvent === "function") {
      // Alternative method for immediate location update
      await campusLocationService.handleTriggerEvent("presence_priority");
      logManager.location.info(
        "✅ Priority: Trigger event sent for fresh presence data"
      );
    } else {
      logManager.location.warn(
        "⚠️ Priority: No immediate location method available"
      );
    }

    // Emit event that fresh data is being fetched
    document.dispatchEvent(
      new CustomEvent("campus-presence:fetching-fresh", {
        detail: {
          priority: true,
          method: "immediate_gps",
          timestamp: Date.now(),
        },
      })
    );
  } catch (error) {
    logManager.location.error(
      "❌ Priority: Failed to fetch fresh location for presence:",
      error
    );
    throw error;
  }
}

/**
 * Export Campus Presence services for debugging and testing
 * 🌍 Learning: Expose services for console debugging and external access
 */
export { initializeCampusPresenceInBackground, fetchFreshLocationForPresence };

/**
 * Update the <meta name="theme-color"> to match the top nav background
 * so browser UI blends seamlessly with the header on mobile/desktop.
 */
function syncMetaThemeColorToNav() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  // Prefer CSS variable directly to avoid compositing/race issues on iOS 18
  const rootStyles = getComputedStyle(document.documentElement);
  let color = (rootStyles.getPropertyValue("--nav-solid-bg") || "").trim();

  // If variable not resolved to a hex, fallback to computed background color
  if (!color || color === "initial" || color === "inherit") {
    const nav = document.querySelector(".top-nav");
    const bg = nav ? getComputedStyle(nav).backgroundColor : "rgb(21,24,32)";
    const rgba = bg.match(/rgba?\(([^)]+)\)/i);
    if (rgba) {
      const parts = rgba[1].split(",").map((s) => s.trim());
      const r = parseInt(parts[0], 10) || 21;
      const g = parseInt(parts[1], 10) || 24;
      const b = parseInt(parts[2], 10) || 32;
      color = `#${[r, g, b]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")}`;
    }
  }

  if (color) meta.setAttribute("content", color);
}

/**
 * Register a minimal service worker to enable installability and basic offline.
 * Only runs on HTTPS or localhost.
 */
function tryRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const isProduction = import.meta.env && import.meta.env.PROD;
  // In dev (Vite/HMR), a SW can easily cause stale assets + Cache Storage growth.
  // Opt-in only: localStorage.setItem("enableDevSW","true")
  if (!isProduction) {
    const enabled =
      typeof localStorage !== "undefined" &&
      localStorage.getItem("enableDevSW") === "true";
    if (!enabled) {
      logManager.system.info(
        "Service worker not registered in dev (set localStorage.enableDevSW=true to enable)"
      );
      return;
    }
  }
  const isSecure =
    location.protocol === "https:" || location.hostname === "localhost";
  if (!isSecure) return;
  (async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      logManager.system.init("Service worker registered");
      // Proactively check for updates to avoid stale PWA code causing data issues
      try {
        reg.update();
      } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }
      // Periodically re-check in the background (store ID for potential cleanup)
      try {
        swUpdateIntervalId = setInterval(() => {
          try {
            reg.update();
          } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }
        }, 15 * 60 * 1000);
      } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }
      // Optional: auto-reload when a new SW takes control (safe for SPA shell updates)
      try {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          // Prevent infinite reload loops
          if (swReloadedOnce) return;
          swReloadedOnce = true;
          try {
            window.location.reload();
          } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }
        });
      } catch (error) { logManager.dev.debug("PWA operation failed", { error: error?.message }); }
    } catch (e) {
      logManager.system.warn("SW registration failed (non-fatal):", e);
    }
  })();
}
