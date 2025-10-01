// PushMessagingService.js
// Handles Firebase Cloud Messaging (Web Push) for foreground and background notifications

import { currentUser } from "../../store/userStore.js";
import { dataManager } from "../data/DataService.js";
import { notificationManager } from "./NotificationService.js";
import { logManager } from "../../utils/debug/LogManager.js";

function isIOS() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  const iPadOsTouchMac =
    typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOsTouchMac;
}

function isStandalone() {
  try {
    const standaloneDisplay =
      typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    const iOSStandalone = typeof window !== "undefined" && window.navigator && window.navigator.standalone === true;
    return !!standaloneDisplay || !!iOSStandalone;
  } catch (_e) {
    return false;
  }
}

class PushMessagingService {
  constructor() {
    this._messaging = null;
    this._initialized = false;
    this._activeToken = null;
  }

  async initAfterLogin() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      // Foreground message handler
      const messaging = await this._ensureMessaging();
      if (!messaging) return;

      const { onMessage } = await import("firebase/messaging");
      onMessage(messaging, async (payload) => {
        try {
          const title = payload?.notification?.title || "Notification";
          const body = payload?.notification?.body || "";
          const link = payload?.data?.link || null;

          // Keep it simple: show a system-level toast
          notificationManager.showSystemNotification(`${title}${body ? ": " + body : ""}`, "info", { duration: 4000 });

          // Optional: could store or update a badge using Menu helpers
          if (typeof window !== "undefined" && window.updateMobileNotificationBadge) {
            try { window.updateMobileNotificationBadge(1); } catch (_) {}
          }

          // Optionally navigate immediately if payload requests it (not default)
          if (link && payload?.data?.autoNavigate === "1") {
            try {
              const { navigateTo } = await import("../../app.js");
              navigateTo(link.replace(/^.*#/, "").replace(/^#/, ""));
            } catch (_) {}
          }
        } catch (e) {
          console.warn("FCM foreground message handling failed", e);
        }
      });
    } catch (e) {
      console.warn("PushMessagingService init failed (non-fatal)", e);
    }
  }

  async initAndMaybePrompt() {
    // iOS: only prompt if installed as a PWA
    if (isIOS() && !isStandalone()) {
      logManager.system.info("iOS detected without PWA install — not prompting for push");
      try {
        const { pwaInstallService } = await import("../pwa/PWAInstallService.js");
        pwaInstallService.showIOSInstructions();
      } catch (_) {}
      return;
    }

    const uid = currentUser?.uid;
    if (!uid) return;

    const onceKey = `push:promptShown:${uid}`;
    const alreadyPrompted = (typeof localStorage !== "undefined") && localStorage.getItem(onceKey) === "true";
    if (alreadyPrompted) {
      // Still ensure we have a token
      await this._getAndSaveTokenIfNeeded();
      return;
    }

    // Only prompt after login
    await this._requestPermissionAndRegister();
    try { localStorage.setItem(onceKey, "true"); } catch (_) {}
  }

  async _requestPermissionAndRegister() {
    try {
      if (!("Notification" in window)) return;
      const state = await Notification.requestPermission();
      if (state !== "granted") {
        logManager.system.info(`Push permission not granted: ${state}`);
        return;
      }
      await this._getAndSaveTokenIfNeeded(true);
    } catch (e) {
      console.warn("Push permission/token registration failed", e);
    }
  }

  async _getAndSaveTokenIfNeeded(force = false) {
    const uid = currentUser?.uid;
    if (!uid) return;

    const messaging = await this._ensureMessaging();
    if (!messaging) return;

    try {
      const vapidKey = (typeof window !== "undefined" && window.ENV && window.ENV.FIREBASE_VAPID_KEY) || null;
      if (!vapidKey) {
        console.warn("FIREBASE_VAPID_KEY missing — cannot obtain FCM token");
        return;
      }

      // Ensure we use our app SW so background notifications work
      const registration = await navigator.serviceWorker?.getRegistration("/sw.js") || (await navigator.serviceWorker?.ready);
      const { getToken } = await import("firebase/messaging");
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration || undefined,
      });

      if (!token) {
        console.warn("FCM returned empty token (maybe denied or SW not ready)");
        return;
      }

      if (!force && token === this._activeToken) return;
      this._activeToken = token;

      await dataManager.saveFcmToken(uid, token, {
        platform: isIOS() ? "ios" : (/(android)/i.test(navigator.userAgent) ? "android" : "web"),
      });
      logManager.system.info("FCM token saved for user");
    } catch (e) {
      console.warn("Failed to get/save FCM token", e);
    }
  }

  async _ensureMessaging() {
    if (this._messaging) return this._messaging;
    try {
      // Lazy import to avoid bloating initial bundle
      const { getMessaging, isSupported } = await import("firebase/messaging");
      if (!(await isSupported())) {
        console.warn("Firebase Messaging not supported in this browser");
        return null;
      }
      // Reuse the existing initialized app via firebase-config.js
      const { default: app } = await import("../../lib/firebase/firebase-config.js");
      this._messaging = getMessaging(app);
      return this._messaging;
    } catch (e) {
      console.warn("Failed to initialize Firebase Messaging", e);
      return null;
    }
  }
}

export const pushMessagingService = new PushMessagingService();

// Dev helper
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.pushMessagingService = pushMessagingService;
}
