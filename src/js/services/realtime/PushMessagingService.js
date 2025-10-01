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

          // Keep it simple: show a system-level toast
          notificationManager.showSystemNotification(
            `${title}${body ? ": " + body : ""}`,
            "info",
            { duration: 4000 }
          );

          // Optional: could store or update a badge using Menu helpers
          if (
            typeof window !== "undefined" &&
            window.updateMobileNotificationBadge
          ) {
            try {
              window.updateMobileNotificationBadge(1);
            } catch (_) {}
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
      logManager.system.info(
        "iOS detected without PWA install — not prompting for push"
      );
      try {
        const { pwaInstallService } = await import(
          "../pwa/PWAInstallService.js"
        );
        pwaInstallService.showIOSInstructions();
      } catch (_) {}
      return;
    }

    const uid = currentUser?.uid;
    if (!uid) return;

    const onceKey = `push:promptShown:${uid}`;
    const alreadyPrompted =
      typeof localStorage !== "undefined" &&
      localStorage.getItem(onceKey) === "true";
    if (alreadyPrompted) {
      // Still ensure we have a token
      await this._getAndSaveTokenIfNeeded();
      return;
    }

    // Only prompt after login
    await this._requestPermissionAndRegister();
    try {
      localStorage.setItem(onceKey, "true");
    } catch (_) {}
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
      const registration =
        (await navigator.serviceWorker?.getRegistration("/sw.js")) ||
        (await navigator.serviceWorker?.ready);
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
      } catch (_) {}

      // Save the new token
      await dataManager.saveFcmToken(uid, token, {
        platform,
        isPWA,
        deviceKey,
        userAgent: navigator.userAgent.substring(0, 120), // Slightly longer for fingerprinting
      });

      // DEDUPLICATION: If this is a PWA, remove any browser tokens for this device
      if (isPWA) {
        await this._cleanupBrowserTokens(uid, token, deviceKey);
      }

      logManager.system.info(
        `FCM token saved for user (${isPWA ? "PWA" : "Browser"})`
      );
    } catch (e) {
      console.warn("Failed to get/save FCM token", e);
    }
  }

  async _cleanupBrowserTokens(uid, currentToken, deviceKey) {
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
        if (
          tokenId !== currentToken &&
          tokenData.isPWA !== true &&
          sameDevice
        ) {
          logManager.system.info(
            `Removing duplicate browser token (same device): ${tokenId.substring(
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
          `Cleaned up ${deletePromises.length} duplicate browser token(s)`
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
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.pushMessagingService = pushMessagingService;
}
