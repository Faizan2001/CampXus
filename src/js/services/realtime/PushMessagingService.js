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
    typeof navigator !== "undefined" &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOsTouchMac;
}

function isStandalone() {
  try {
    const standaloneDisplay =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches;
    const iOSStandalone =
      typeof window !== "undefined" &&
      window.navigator &&
      window.navigator.standalone === true;
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

          // 🔔 Only show in-app toast for foreground messages in PWA
          // Service worker handles actual notifications, so we just show a subtle banner
          const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                        window.navigator.standalone === true;

          if (!isPWA) {
            // Browser mode: show system notification since SW might not
            notificationManager.showSystemNotification(
              `${title}${body ? ": " + body : ""}`,
              "info",
              { duration: 4000 }
            );
          } else {
            // PWA mode: SW already showed notification, just show subtle banner
            notificationManager.showSystemNotification(
              `${title}${body ? ": " + body : ""}`,
              "info",
              { duration: 2000 }
            );
          }

          // Note: Badge updates are handled automatically by real-time notification listeners in Menu.js
          // No need to manually update badge here as the Firestore listener will detect new notifications

          // Optionally navigate immediately if payload requests it (not default)
          if (link && payload?.data?.autoNavigate === "1") {
            try {
              const { navigateTo } = await import("../../app.js");
              navigateTo(link.replace(/^.*#/, "").replace(/^#/, ""));
            } catch (err) { logManager.dev.debug("Push messaging failed: navigation after foreground message", err); }
          }
        } catch (e) {
          console.warn("FCM foreground message handling failed", e);
        }
      });

      // Best-effort: ensure the server actually has a token doc for this user.
      // We observed cases where permission was granted but no token doc existed,
      // which makes Cloud Functions unable to deliver pushes.
      try {
        await this._ensureServerHasTokenDoc();
      } catch (err) { logManager.dev.debug("Push messaging failed: ensure server token doc", err); }
    } catch (e) {
      console.warn("PushMessagingService init failed (non-fatal)", e);
    }
  }

  async initAndMaybePrompt() {
    // New behavior: do not auto-prompt. Just ensure token if already granted.
    await this.ensureRegisteredIfGranted();
  }

  // Public: called by UI (on user gesture) to run permission + token flow
  async requestPermissionFlow() {
    if (isIOS() && !isStandalone()) {
      try {
        const { pwaInstallService } = await import("../pwa/PWAInstallService.js");
        pwaInstallService.showIOSInstructions();
      } catch (err) { logManager.dev.debug("Push messaging failed: iOS PWA install service import", err); }
      return { permission: (typeof Notification !== 'undefined' && Notification.permission) || "default", gated: true };
    }
    await this._requestPermissionAndRegister();
    return { permission: (typeof Notification !== 'undefined' && Notification.permission) || "default" };
  }

  // Public: ensure a token exists when already granted
  async ensureRegisteredIfGranted() {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      await this._getAndSaveTokenIfNeeded();
    } catch (err) { logManager.dev.debug("Push messaging failed: ensure token if granted", err); }
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
      const vapidKey =
        (typeof window !== "undefined" &&
          window.ENV &&
          window.ENV.FIREBASE_VAPID_KEY) ||
        null;
      if (!vapidKey) {
        console.warn("FIREBASE_VAPID_KEY missing — cannot obtain FCM token");
        return;
      }

      // Ensure we use our app SW so background notifications work
      // Ensure we have a live registration that controls this page
      let registration = null;
      try {
        registration = await navigator.serviceWorker?.ready;
      } catch (err) { logManager.dev.debug("Push messaging failed: service worker ready check", err); }
      if (!registration) {
        try {
          registration = await navigator.serviceWorker?.getRegistration();
        } catch (err) { logManager.dev.debug("Push messaging failed: service worker getRegistration", err); }
      }
      // As a last resort, wait briefly and retry once
      if (!registration) {
        await new Promise((r) => setTimeout(r, 800));
        try { registration = await navigator.serviceWorker?.ready; } catch (err) { logManager.dev.debug("Push messaging failed: service worker ready retry", err); }
      }
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

      const platform = isIOS()
        ? "ios"
        : /(android)/i.test(navigator.userAgent)
        ? "android"
        : "web";
      const isPWA = isStandalone();

      // Derive a coarse device key (non-PII) to distinguish multiple devices for same user
      // Use a stable subset of the UA to avoid generating new keys for minor version bumps.
      const ua = navigator.userAgent || "";
      const uaFragment = ua.split(" ").slice(0, 4).join(" "); // first few tokens only
      const deviceKeyBase = `${platform}|${uaFragment}`.toLowerCase();
      // Simple hash (dj2 style) to keep key short; fallback to raw if hashing fails
      let deviceKey = deviceKeyBase;
      try {
        let h = 5381,
          i = 0;
        while (i < deviceKeyBase.length)
          h = (h * 33) ^ deviceKeyBase.charCodeAt(i++);
        deviceKey = `d${(h >>> 0).toString(36)}`;
      } catch (err) { logManager.dev.debug("Push messaging failed: device key hash generation", err); }

      // Save the new token
      await dataManager.saveFcmToken(uid, token, {
        platform,
        isPWA,
        deviceKey,
        userAgent: navigator.userAgent.substring(0, 120), // Slightly longer for fingerprinting
      });

      // DEDUPLICATION: If this is a PWA, remove any other tokens for this device (browser or stale PWA)
      if (isPWA) {
        await this._cleanupSameDeviceOtherTokens(uid, token, deviceKey);
      }

      logManager.system.info(
        `FCM token saved for user (${isPWA ? "PWA" : "Browser"})`
      );
    } catch (e) {
      console.warn("Failed to get/save FCM token", e);
    }
  }

  async _ensureServerHasTokenDoc() {
    const uid = currentUser?.uid;
    if (!uid) return;
    try {
      const { getFirestore, collection, getDocs } = await import(
        "firebase/firestore"
      );
      const db = getFirestore();
      const snap = await getDocs(collection(db, "users", uid, "fcmTokens"));
      if (!snap || snap.empty) {
        // Force a registration attempt if none exists
        await this._getAndSaveTokenIfNeeded(true);
      }
    } catch (e) {
      // Non-fatal; do nothing
    }
  }

  async _cleanupSameDeviceOtherTokens(uid, currentToken, deviceKey) {
    try {
      // Get all tokens for this user
      const { getFirestore, collection, getDocs, deleteDoc, doc } =
        await import("firebase/firestore");
      const db = getFirestore();
      const tokensRef = collection(db, "users", uid, "fcmTokens");
      const tokensSnapshot = await getDocs(tokensRef);

      // Delete tokens that are NOT PWA and NOT the current token
      const deletePromises = [];
      tokensSnapshot.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data();
        const tokenId = tokenDoc.id;
        // Only consider deleting tokens that appear to be the same physical device (matching derived deviceKey)
        // and are non-PWA (legacy browser registrations). This avoids deleting legitimate browser tokens on OTHER devices.
        const sameDevice =
          deviceKey && tokenData.deviceKey && tokenData.deviceKey === deviceKey;
        // 🔧 FIX: Compare token VALUES, not document ID vs token string
        if (tokenData.token !== currentToken && sameDevice) {
          logManager.system.info(
            `Removing duplicate token (same device): ${tokenId.substring(
              0,
              20
            )}...`
          );
          deletePromises.push(
            deleteDoc(doc(db, "users", uid, "fcmTokens", tokenId))
          );
        }
      });

      await Promise.all(deletePromises);
      if (deletePromises.length > 0) {
        logManager.system.info(
          `Cleaned up ${deletePromises.length} duplicate same-device token(s)`
        );
      }
    } catch (e) {
      console.warn("Failed to cleanup browser tokens (non-fatal)", e);
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
      const { default: app } = await import(
        "../../lib/firebase/firebase-config.js"
      );
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
const __DEV__ =
  typeof window !== "undefined" &&
  (import.meta?.env?.DEV ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV === "development"));
if (__DEV__) {
  window.pushMessagingService = pushMessagingService;
}
