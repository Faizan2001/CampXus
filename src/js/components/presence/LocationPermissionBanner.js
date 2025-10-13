/**
 * LocationPermissionBanner
 *
 * Handles the shared "Enable GPS accuracy" banner that prompts users
 * to grant browser geolocation permission so campus presence can run
 * both Tier 1 (network) and Tier 2 (browser GPS) polling.
 */

import { campusLocationService } from "../../services/location/CampusLocationService.js";
import { locationPrivacyService } from "../../services/location/LocationPrivacyService.js";
import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";

const bannerState = {
  banner: null,
  enableBtn: null,
  dismissBtn: null,
  isRequesting: false,
  permissionStatus: null,
  sharingEnabled: false,
  geolocationSupported: true,
  dismissed: false,
  userUnsubscribe: null,
  permissionHandler: null,
  hideTimeout: null,
};

function getDismissStorageKey() {
  const uid = currentUser?.uid || "anon";
  return `campxus:locationBanner:dismissed:${uid}`;
}

function readDismissedFlag() {
  try {
    const key = getDismissStorageKey();
    return sessionStorage.getItem(key) === "1";
  } catch (error) {
    return false;
  }
}

function writeDismissedFlag(value) {
  try {
    const key = getDismissStorageKey();
    if (value) {
      sessionStorage.setItem(key, "1");
    } else {
      sessionStorage.removeItem(key);
    }
  } catch (_) {
    /* sessionStorage may be unavailable (Safari private) */
  }
}

function updateSharingState(snapshot) {
  bannerState.sharingEnabled =
    snapshot?.profile?.systemInfo?.locationSharingEnabled === true;
}

function setBusy(isBusy) {
  if (!bannerState.enableBtn) return;
  if (isBusy) {
    bannerState.enableBtn.setAttribute("aria-busy", "true");
    bannerState.enableBtn.disabled = true;
  } else {
    bannerState.enableBtn.removeAttribute("aria-busy");
    bannerState.enableBtn.disabled = false;
  }
}

function applyVisibility(visible) {
  if (!bannerState.banner) return;
  if (visible) {
    if (bannerState.hideTimeout) {
      clearTimeout(bannerState.hideTimeout);
      bannerState.hideTimeout = null;
    }
    bannerState.banner.style.display = "flex";
    // Force reflow so transition triggers when toggling from display none
    void bannerState.banner.offsetWidth;
    bannerState.banner.dataset.visible = "true";
    bannerState.banner.setAttribute("aria-hidden", "false");
  } else {
    bannerState.banner.dataset.visible = "false";
    bannerState.banner.setAttribute("aria-hidden", "true");
    if (bannerState.hideTimeout) {
      clearTimeout(bannerState.hideTimeout);
    }
    bannerState.hideTimeout = setTimeout(() => {
      if (!bannerState.banner) return;
      if (bannerState.banner.dataset.visible !== "true") {
        bannerState.banner.style.display = "none";
      }
      bannerState.hideTimeout = null;
    }, 320);
  }
}

function shouldDisplayBanner() {
  if (!bannerState.banner) return false;
  if (!bannerState.geolocationSupported) return false;
  if (!currentUser?.uid) return false;
  if (bannerState.dismissed) return false;
  const permissionMissing = bannerState.permissionStatus !== "granted";
  const sharingDisabled = bannerState.sharingEnabled !== true;
  return permissionMissing || sharingDisabled;
}

function renderBanner() {
  if (!bannerState.banner) return;

  bannerState.banner.dataset.permissionState =
    bannerState.permissionStatus || "unknown";
  bannerState.banner.dataset.sharingState = bannerState.sharingEnabled
    ? "enabled"
    : "disabled";

  const shouldShow = shouldDisplayBanner();

  applyVisibility(shouldShow);
}

async function ensureGlobalSharingEnabled() {
  if (bannerState.sharingEnabled) return;
  const uid = currentUser?.uid;
  if (!uid) return;

  try {
    const success =
      await locationPrivacyService.setGlobalLocationPreferences(uid, {
        enabled: true,
        shareWithFriends: true,
        updateTimestamp: new Date(),
      });
    if (success) {
      bannerState.sharingEnabled = true;
      notificationManager.show(
        "Campus presence sharing enabled.",
        "success"
      );
    }
  } catch (error) {
    console.warn("⚠️ Failed to enable global location sharing:", error);
    notificationManager.show(
      "Unable to enable campus presence sharing.",
      "error"
    );
    throw error;
  }
}

async function handleEnableClick(event) {
  event.preventDefault();
  if (bannerState.isRequesting || !bannerState.enableBtn) return;
  bannerState.isRequesting = true;
  setBusy(true);

  try {
    await ensureGlobalSharingEnabled();

    try {
      // Tier 1 can run even without permission; ensure polling kicks off
      await campusLocationService.autoStartLocationTracking();
    } catch (_) {
      /* auto-start best effort */
    }

    const result = await campusLocationService.requestLocationPermission();
    bannerState.permissionStatus =
      campusLocationService.getPermissionStatus?.() ||
      (result?.success ? "granted" : bannerState.permissionStatus);

    if (result?.success) {
      try {
        await campusLocationService.startLocationTracking();
      } catch (_) {
        /* Non-fatal; polling auto start handles follow-up */
      }
      bannerState.dismissed = false;
      writeDismissedFlag(false);
      notificationManager.show(
        "Location permission enabled. GPS accuracy active.",
        "success"
      );
    } else if (result?.error === "denied") {
      notificationManager.showWarningNotification(
        "Location permission denied. Enable it in your browser settings.",
        { duration: 6000 }
      );
    }
  } catch (error) {
    console.warn("⚠️ Failed requesting GPS permission from banner:", error);
    notificationManager.show(
      "Unable to request location permission.",
      "error"
    );
  } finally {
    bannerState.isRequesting = false;
    setBusy(false);
    // Refresh sharing + permission state
    bannerState.permissionStatus =
      campusLocationService.getPermissionStatus?.() ||
      bannerState.permissionStatus;
    renderBanner();
  }
}

function handleDismissClick(event) {
  event.preventDefault();
  bannerState.dismissed = true;
  writeDismissedFlag(true);
  renderBanner();
}

function attachEventListeners() {
  if (bannerState.enableBtn) {
    bannerState.enableBtn.addEventListener("click", handleEnableClick);
  }
  if (bannerState.dismissBtn) {
    bannerState.dismissBtn.addEventListener("click", handleDismissClick);
  }

  if (currentUser && typeof currentUser.subscribe === "function") {
    bannerState.userUnsubscribe = currentUser.subscribe((snapshot) => {
      updateSharingState(snapshot);
      if (!bannerState.dismissed) {
        try {
          writeDismissedFlag(false);
        } catch (_) {}
      }
      renderBanner();
    });
  }

  bannerState.permissionHandler = (event) => {
    bannerState.permissionStatus =
      event?.detail?.status ?? event?.detail ?? bannerState.permissionStatus;

    if (bannerState.permissionStatus === "granted") {
      bannerState.dismissed = false;
      writeDismissedFlag(false);
    }
    renderBanner();
  };

  document.addEventListener(
    "location-permission:changed",
    bannerState.permissionHandler
  );
}

function detachEventListeners() {
  if (bannerState.enableBtn) {
    bannerState.enableBtn.removeEventListener("click", handleEnableClick);
  }
  if (bannerState.dismissBtn) {
    bannerState.dismissBtn.removeEventListener("click", handleDismissClick);
  }
  if (typeof bannerState.userUnsubscribe === "function") {
    try {
      bannerState.userUnsubscribe();
    } catch (_) {
      /* ignore */
    }
  }
  bannerState.userUnsubscribe = null;

  if (bannerState.permissionHandler) {
    document.removeEventListener(
      "location-permission:changed",
      bannerState.permissionHandler
    );
  }
  bannerState.permissionHandler = null;
  if (bannerState.hideTimeout) {
    clearTimeout(bannerState.hideTimeout);
    bannerState.hideTimeout = null;
  }
}

function resetState() {
  bannerState.banner = null;
  bannerState.enableBtn = null;
  bannerState.dismissBtn = null;
  bannerState.isRequesting = false;
  bannerState.permissionStatus =
    campusLocationService.getPermissionStatus?.() || null;
  bannerState.geolocationSupported =
    campusLocationService.isGeolocationSupported?.() !== false;
  bannerState.sharingEnabled =
    currentUser?.profile?.systemInfo?.locationSharingEnabled === true;
  bannerState.dismissed = readDismissedFlag();
  bannerState.hideTimeout = null;
}

export function initLocationPermissionBanner() {
  detachEventListeners();
  resetState();

  const banner = document.querySelector(
    '[data-component="location-permission-banner"]'
  );
  if (!banner) {
    return;
  }

  bannerState.banner = banner;
  bannerState.enableBtn = banner.querySelector('[data-action="enable-gps"]');
  bannerState.dismissBtn = banner.querySelector(
    '[data-action="dismiss-gps"]'
  );

  if (!bannerState.enableBtn) {
    console.warn(
      "⚠️ Location permission banner missing enable button; skipping init."
    );
    bannerState.banner = null;
    return;
  }

  // Initial visibility state
  bannerState.banner.style.display = "none";
  applyVisibility(false);
  attachEventListeners();
  renderBanner();
}

export function destroyLocationPermissionBanner() {
  detachEventListeners();
  if (bannerState.banner) {
    bannerState.banner.dataset.visible = "false";
    bannerState.banner.setAttribute("aria-hidden", "true");
    bannerState.banner.style.display = "none";
  }
  bannerState.banner = null;
  bannerState.enableBtn = null;
  bannerState.dismissBtn = null;
  bannerState.isRequesting = false;
}
