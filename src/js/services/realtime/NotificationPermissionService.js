// NotificationPermissionService.js
// Cross‑platform detection + UX helpers for web push permissions

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

function isAndroid() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return /android/i.test(ua);
}

function isStandalone() {
  try {
    const dm =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone =
      typeof window !== "undefined" &&
      window.navigator &&
      window.navigator.standalone === true;
    return !!dm || !!iosStandalone;
  } catch (_) {
    return false;
  }
}

function hasBasicSupport() {
  try {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator
    );
  } catch (_) {
    return false;
  }
}

function hasPushSupport() {
  try {
    return hasBasicSupport() && "PushManager" in window;
  } catch (_) {
    return false;
  }
}

function getPermission() {
  try {
    if (!hasBasicSupport()) return "unsupported";
    return Notification.permission; // 'granted' | 'denied' | 'default'
  } catch (_) {
    return "unsupported";
  }
}

function deriveState() {
  const ios = isIOS();
  const android = isAndroid();
  const standalone = isStandalone();
  const basic = hasBasicSupport();
  const push = hasPushSupport();
  const permission = getPermission();

  // iOS requires PWA install for web push
  if (ios && !standalone) {
    return {
      supported: basic, // Notification API may exist but push won’t work in Safari tab
      pushSupported: push,
      permission,
      isIOS: ios,
      isAndroid: android,
      isStandalone: standalone,
      actionable: "needs_install",
      reason: "ios_not_installed",
    };
  }

  if (!basic || !push) {
    return {
      supported: false,
      pushSupported: false,
      permission: "unsupported",
      isIOS: ios,
      isAndroid: android,
      isStandalone: standalone,
      actionable: "unsupported",
      reason: "no_push_support",
    };
  }

  if (permission === "granted") {
    return {
      supported: true,
      pushSupported: true,
      permission,
      isIOS: ios,
      isAndroid: android,
      isStandalone: standalone,
      actionable: "granted",
      reason: "granted",
    };
  }

  if (permission === "denied") {
    return {
      supported: true,
      pushSupported: true,
      permission,
      isIOS: ios,
      isAndroid: android,
      isStandalone: standalone,
      actionable: "denied",
      reason: "denied_by_user",
    };
  }

  // default (promptable)
  return {
    supported: true,
    pushSupported: true,
    permission: "default",
    isIOS: ios,
    isAndroid: android,
    isStandalone: standalone,
    actionable: "promptable",
    reason: "default_promptable",
  };
}

export class NotificationPermissionService {
  getState() {
    return deriveState();
  }

  async requestPermissionWithGesture() {
    // Delegate the full flow (permission + token registration) to push service
    try {
      const state = deriveState();
      if (state.isIOS && !state.isStandalone) {
        // iOS not installed: cannot prompt
        return { ...state, permission: state.permission, blockedByInstall: true };
      }

      if (!("Notification" in window)) {
        return { ...state, permission: "unsupported" };
      }

      const { pushMessagingService } = await import(
        "./PushMessagingService.js"
      );
      const result = await pushMessagingService.requestPermissionFlow();
      logManager.system.info(
        `Permission flow result: ${result?.permission || "unknown"}`
      );
      return this.getState();
    } catch (e) {
      logManager.system.error("requestPermissionWithGesture failed", e);
      return this.getState();
    }
  }
}

export const notificationPermissionService = new NotificationPermissionService();

