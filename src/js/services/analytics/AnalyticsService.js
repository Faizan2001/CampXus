/**
 * 📊 CampXus Analytics Service
 * Tracks user behavior and engagement using Firebase Analytics
 *
 * Features:
 * - User registration tracking by university
 * - Schedule upload and usage metrics
 * - Friend system engagement
 * - Page view tracking
 * - Custom events for CampXus-specific features
 */

let analyticsContextPromise = null;
const ANALYTICS_CONSENT_KEY = "meetchuthere_privacy_consent";

function analyticsConsentAllowsCollection() {
  if (typeof window === "undefined" || !window.localStorage) {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (parsed?.preferences?.analytics === false) {
      return false;
    }
  } catch (_) {
    // Swallow parsing errors and default to enabled to avoid breaking analytics for existing users.
  }
  return true;
}

function ensureAnalyticsContext() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (analyticsContextPromise) {
    return analyticsContextPromise;
  }

  analyticsContextPromise = (async () => {
    try {
      const [{ default: app }, mod] = await Promise.all([
        import("../../lib/firebase/firebase-config.js"),
        import("firebase/analytics"),
      ]);
      try {
        const analytics = mod.getAnalytics(app);
        return {
          analytics,
          logEvent: mod.logEvent,
          setUserId: mod.setUserId,
          setUserProperties: mod.setUserProperties,
        };
      } catch (error) {
        console.warn(
          "📊 Analytics disabled: Firebase analytics not supported in this environment",
          error.message
        );
        return null;
      }
    } catch (error) {
      console.warn("📊 Analytics module failed to load:", error.message);
      return null;
    }
  })();

  return analyticsContextPromise;
}

export class AnalyticsService {
  /**
   * ✅ Basic availability check so callers can short‑circuit
  */
  static isEnabled() {
    if (AnalyticsService._collectionEnabled === false) return false;
    if (typeof window === "undefined") return false;

    const host = window.location?.hostname || "";
    const env = (typeof window !== "undefined" && window.ENV) || {};
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local");
    const disabledByEnv =
      env.DISABLE_ANALYTICS === true ||
      (typeof env.SITE_ENV === "string" &&
        env.SITE_ENV.toLowerCase() === "development");

    if (isLocalHost || disabledByEnv) {
      return false;
    }

    if (!analyticsConsentAllowsCollection()) {
      return false;
    }

    return true;
  }

  // Internal flag for runtime consent (default true unless explicitly disabled)
  static _collectionEnabled = true;

  /**
   * 🔐 Allow user to opt out (required for certain privacy jurisdictions)
   */
  static setCollectionEnabled(enabled) {
    AnalyticsService._collectionEnabled = !!enabled;
    if (!enabled) {
      console.log("📊 Analytics collection disabled by user");
    } else {
      console.log("📊 Analytics collection enabled");
    }
  }
  static _runWithAnalytics(handler) {
    if (!AnalyticsService.isEnabled()) {
      return;
    }

    ensureAnalyticsContext()
      .then((ctx) => {
        if (!ctx) {
          return;
        }
        handler(ctx);
      })
      .catch((error) => {
        console.warn("📊 Analytics action failed:", error);
      });
  }

  /**
   * 📈 Track user registration
   * @param {string} university - University code (e.g., 'iub', 'nsu')
   * @param {string} major - User's major/subject
   */
  static trackUserRegistration(university, major = "unknown") {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "sign_up", {
        method: "email",
        university: university?.toLowerCase() || "unknown",
        major: major?.toLowerCase() || "unknown",
      });

      console.log("📊 Analytics: User registration tracked", {
        university,
        major,
      });
    });
  }

  /**
   * 📅 Track schedule upload
   * @param {string} university - University code
   * @param {string} method - Upload method ('ocr', 'manual', 'import')
   */
  static trackScheduleUpload(university, method = "unknown") {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "schedule_upload", {
        university: university?.toLowerCase() || "unknown",
        method: method,
        content_type: "schedule",
      });

      console.log("📊 Analytics: Schedule upload tracked", {
        university,
        method,
      });
    });
  }

  /**
   * 👥 Track friend request activity
   * @param {string} action - 'sent', 'accepted', 'rejected'
   */
  static trackFriendActivity(action) {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "friend_activity", {
        action: action,
        feature: "social",
      });

      console.log("📊 Analytics: Friend activity tracked", { action });
    });
  }

  /**
   * 🧭 Track SPA virtual page views (avoid clashing with automatic GA page_view)
   * @param {string} pageName
   * @param {string} route
   */
  static trackPageView(pageName, route = "") {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "route_view", {
        page_title: pageName,
        page_location: route,
      });
      console.log("📊 Analytics: Route view tracked", { pageName, route });
    });
  }

  /**
   * 🎯 Track feature usage
   * @param {string} feature - Feature name ('schedule_view', 'ocr_scan', 'friend_search')
   * @param {Object} properties - Additional properties
   */
  static trackFeatureUsage(feature, properties = {}) {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "feature_usage", {
        feature_name: feature,
        ...properties,
      });

      console.log("📊 Analytics: Feature usage tracked", {
        feature,
        properties,
      });
    });
  }

  /**
   * 🏫 Track campus presence events
   * @param {string} event - 'location_shared', 'campus_detected', 'privacy_changed'
   * @param {Object} properties - Event properties
   */
  static trackCampusPresence(event, properties = {}) {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "campus_presence", {
        event_type: event,
        ...properties,
      });

      console.log("📊 Analytics: Campus presence tracked", {
        event,
        properties,
      });
    });
  }

  /**
   * 🤝 Track friend request lifecycle
   * @param {string} phase - sent|accepted|rejected|cancelled
   * @param {object} extra
   */
  static trackFriendRequest(phase, extra = {}) {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "friend_request", {
        phase,
        ...extra,
      });
      console.log("📊 Analytics: Friend request event", { phase, extra });
    });
  }

  /**
   * 📍 Track location sharing toggle changes
   * @param {boolean} enabled
   * @param {string} scope - global|friend_specific
   */
  static trackLocationSharingToggle(enabled, scope = "global") {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "location_sharing_toggle", {
        enabled: enabled ? "on" : "off",
        scope,
      });
      console.log("📊 Analytics: Location sharing toggled", { enabled, scope });
    });
  }

  /**
   * ✏️ Track schedule edit actions
   * @param {string} action - add_slot|delete_slot|edit_slot|switch_view
   * @param {object} meta
   */
  static trackScheduleEdit(action, meta = {}) {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "schedule_edit", { action, ...meta });
      console.log("📊 Analytics: Schedule edit", { action, meta });
    });
  }

  /**
   * ⚠️ Track errors for debugging
   * @param {string} errorType - Type of error
   * @param {string} errorMessage - Error message
   * @param {string} location - Where the error occurred
   */
  static trackError(errorType, errorMessage, location) {
    AnalyticsService._runWithAnalytics(({ analytics, logEvent }) => {
      logEvent(analytics, "app_error", {
        error_type: errorType,
        error_message: errorMessage.substring(0, 100),
        error_location: location,
      });

      console.log("📊 Analytics: Error tracked", { errorType, location });
    });
  }

  /**
   * 📊 Set user properties (call once after login)
   * @param {Object} userData - User data from profile
   */
  static setUserProperties(userData) {
    if (!AnalyticsService.isEnabled()) {
      return;
    }

    const university = userData?.universityInfo?.university || "unknown";
    const major = userData?.profile?.major || "unknown";
    const startingYear = userData?.profile?.startingYear || "unknown";
    const handle = userData?.profile?.handle || userData?.handle || "anon";

    ensureAnalyticsContext()
      .then((ctx) => {
        if (!ctx) {
          return;
        }

        const { analytics, logEvent, setUserId, setUserProperties } = ctx;

        if (userData?.uid) {
          try {
            setUserId(analytics, userData.uid);
          } catch {}
        }

        try {
          setUserProperties(analytics, {
            university: university,
            major: major,
            starting_year: startingYear,
            handle: handle.substring(0, 24),
          });
        } catch (error) {
          console.warn("📊 Failed setting user properties", error?.message);
        }

        logEvent(analytics, "login", { method: "password", university, major });
        console.log("📊 Analytics: User properties set", university);
      })
      .catch((error) => {
        console.warn("📊 Analytics user property update failed:", error);
      });
  }
}

// Helper function to check if analytics is available
export function isAnalyticsAvailable() {
  return AnalyticsService.isEnabled();
}

/**
 * 🔧 Enable debug mode for Firebase Analytics (Web)
 * This helps events show up immediately in DebugView
 */
export function enableDebugMode() {
  ensureAnalyticsContext()
    .then((ctx) => {
      if (!ctx) {
        console.warn("📊 Analytics not available for debug mode");
        return;
      }

      const { analytics, logEvent } = ctx;

      try {
        logEvent(analytics, "route_view", {
          debug_mode: 1,
          page_title: "debug_mode_enabled",
          page_location: window.location.href,
        });

        localStorage.setItem("firebase_debug_mode", "true");

        console.log("📊 Debug mode enabled for Firebase Analytics Web");
        console.log(
          "📊 Go to Firebase Console → Analytics → DebugView to see events"
        );
      } catch (error) {
        console.error("📊 Failed to enable debug mode:", error);
      }
    })
    .catch((error) => {
      console.error("📊 Failed to load analytics for debug mode:", error);
    });
}

/**
 * 🎯 Auto-enable debug mode if URL contains debug parameter
 */
if (typeof window !== "undefined") {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.split("?")[1]);

  if (
    urlParams.get("debug_mode") === "true" ||
    hashParams.get("debug_mode") === "true" ||
    localStorage.getItem("firebase_debug_mode") === "true"
  ) {
    // Auto-enable debug mode
    setTimeout(() => enableDebugMode(), 1000);
  }
}

console.log("📊 AnalyticsService loaded successfully");

// Removed global window.enableAnalyticsDebugMode exposure; call enableDebugMode() via import when needed
