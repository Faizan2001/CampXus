// PWAInstallService.js
// Handles Android PWA install prompt gating + iOS instructions modal.

import { currentUser } from "../../store/userStore.js";
import { showModal } from "../../components/modals/Modal.js";
import { logManager } from "../../utils/debug/LogManager.js";

const STORAGE_KEYS = {
  androidAutoPromptShown: (uid) => `pwa:android:autoPromptShown:${uid || 'anon'}`,
  iosModalShown: (uid) => `pwa:ios:modalShown:${uid || 'anon'}`,
  appInstalled: "pwa:installed",
};

function isIOS() {
  const ua = window.navigator.userAgent || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  const iPadOsTouchMac =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOsTouchMac;
}

function isAndroid() {
  return /android/i.test(window.navigator.userAgent || "");
}

function isStandalone() {
  // Android installed PWA
  const standaloneDisplay =
    window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  // iOS installed to homescreen - navigator.standalone is iOS-specific
  const iOSStandalone = window.navigator.standalone === true;
  return !!standaloneDisplay || !!iOSStandalone;
}

function markInstalled() {
  try {
    localStorage.setItem(STORAGE_KEYS.appInstalled, "true");
  } catch (err) {
    logManager.dev.debug("Storage access failed: mark installed", err);
  }
}

function isMarkedInstalled() {
  try {
    return localStorage.getItem(STORAGE_KEYS.appInstalled) === "true";
  } catch (err) {
    logManager.dev.debug("Storage access failed: check installed", err);
    return false;
  }
}

function getUidSafe() {
  try {
    return currentUser?.uid || null;
  } catch (err) {
    logManager.dev.debug("User store access failed: get UID", err);
    return null;
  }
}

class PWAInstallService {
  constructor() {
    this.deferredPrompt = null; // BeforeInstallPromptEvent
    this.initialized = false;
    this.buttonEl = null;

    this._globalHooksAttached = false;
    this._onBeforeInstallPrompt = null;
    this._onAppInstalled = null;
    this._onProfileSetupComplete = null;
    this._onResize = null;
    this._onButtonClick = null;
    this._unsubUserStore = null;
  }

  // Attach listeners ASAP (module load) to catch the event and prevent auto-prompt
  attachGlobalEventHooks() {
    if (this._globalHooksAttached) return;
    this._globalHooksAttached = true;

    this._onBeforeInstallPrompt = (e) => {
      // Stop the auto mini-infobar; store for later
      e.preventDefault();
      this.deferredPrompt = e;
      // Refresh UI eligibility when event arrives
      this.updateInstallButtonVisibility();
      // If user already completed profile, auto-prompt once now
      this.maybeAutoPromptAfterProfile();
    };

    this._onAppInstalled = () => {
      markInstalled();
      this.deferredPrompt = null;
      this.updateInstallButtonVisibility();
    };

    window.addEventListener("beforeinstallprompt", this._onBeforeInstallPrompt);
    window.addEventListener("appinstalled", this._onAppInstalled);
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.attachGlobalEventHooks();

    this.buttonEl = document.getElementById("installPwaBtn");
    if (this.buttonEl) {
      this._onButtonClick = () => this.handleInstallClick();
      this.buttonEl.addEventListener("click", this._onButtonClick);
    }

    // React to auth/profile changes to gate prompts and UI
    if (currentUser && typeof currentUser.subscribe === "function") {
      this._unsubUserStore = currentUser.subscribe(() => {
        this.updateInstallButtonVisibility();
        this.maybeAutoPromptAfterProfile();
      });
    }

    // Also listen to explicit profile setup completion events
    this._onProfileSetupComplete = () => {
      // Delay slightly to let userStore update propagate
      setTimeout(() => this.maybeAutoPromptAfterProfile(), 200);
    };
    document.addEventListener(
      "profile:setup:complete",
      this._onProfileSetupComplete
    );

    // Update when viewport changes (mobile-only button)
    this._onResize = () => this.updateInstallButtonVisibility();
    window.addEventListener("resize", this._onResize);

    // Set initial state on load
    this.updateInstallButtonVisibility();
  }

  destroy() {
    if (this.buttonEl && this._onButtonClick) {
      try {
        this.buttonEl.removeEventListener("click", this._onButtonClick);
      } catch (error) { console.debug("Suppressed error", error); }
    }
    this._onButtonClick = null;
    this.buttonEl = null;

    if (this._unsubUserStore) {
      try {
        this._unsubUserStore();
      } catch (error) { console.debug("Suppressed error", error); }
    }
    this._unsubUserStore = null;

    if (this._onProfileSetupComplete) {
      try {
        document.removeEventListener(
          "profile:setup:complete",
          this._onProfileSetupComplete
        );
      } catch (error) { console.debug("Suppressed error", error); }
    }
    this._onProfileSetupComplete = null;

    if (this._onResize) {
      try {
        window.removeEventListener("resize", this._onResize);
      } catch (error) { console.debug("Suppressed error", error); }
    }
    this._onResize = null;

    if (this._globalHooksAttached) {
      try {
        if (this._onBeforeInstallPrompt) {
          window.removeEventListener(
            "beforeinstallprompt",
            this._onBeforeInstallPrompt
          );
        }
      } catch (error) { console.debug("Suppressed error", error); }
      try {
        if (this._onAppInstalled) {
          window.removeEventListener("appinstalled", this._onAppInstalled);
        }
      } catch (error) { console.debug("Suppressed error", error); }
    }

    this._onBeforeInstallPrompt = null;
    this._onAppInstalled = null;
    this._globalHooksAttached = false;
    this.initialized = false;
  }

  isEligibleToShowButton() {
    const isMobileNarrow = window.innerWidth <= 480;
    // Consider installed only when actually running in standalone mode.
    // Do not rely on localStorage flag, which can persist after uninstall.
    const installed = isStandalone() || isMarkedInstalled();
    const loggedIn = !!currentUser?.isLoggedIn?.();
    const profileComplete = !!currentUser?.isProfileComplete?.();
    return isMobileNarrow && !installed && loggedIn && profileComplete;
  }

  updateInstallButtonVisibility() {
    if (!this.buttonEl) return;
    const installed = isStandalone() || isMarkedInstalled();
    const shouldShow = this.isEligibleToShowButton();
    this.buttonEl.style.display = shouldShow ? "inline-flex" : "none";
    this.buttonEl.disabled = !!installed || !shouldShow;
    this.buttonEl.setAttribute("aria-disabled", this.buttonEl.disabled ? "true" : "false");
  }

  async handleInstallClick() {
    if (isIOS()) {
      this.showIOSInstructions();
      return;
    }
    // Android/other
    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        await this.deferredPrompt.userChoice; // { outcome: 'accepted' | 'dismissed', platform: ... }
      } catch (err) {
        logManager.dev.debug("PWA operation failed: install prompt", err);
      } finally {
        // Event can only be used once
        this.deferredPrompt = null;
      }
    } else {
      // Fallback info if prompt not available
      this.showAndroidFallbackInfo();
    }
  }

  maybeAutoPromptAfterProfile() {
    const uid = getUidSafe();
    const installed = isStandalone() || isMarkedInstalled();
    const profileComplete = !!currentUser?.isProfileComplete?.();
    if (!profileComplete || installed) return;

    if (isAndroid()) {
      const key = STORAGE_KEYS.androidAutoPromptShown(uid);
      const alreadyShown = localStorage.getItem(key) === "true";
      if (!alreadyShown) {
        // Record immediately so we don't spam even if user cancels
        try { localStorage.setItem(key, "true"); } catch (err) {
          logManager.dev.debug("Storage access failed: set auto-prompt flag", err);
        }
        if (this.deferredPrompt) {
          // Show an in-app modal with an Install button (user gesture) to trigger prompt
          this.offerAndroidInstallOnce();
        } else {
          // If we don't have the event yet, show a lightweight info modal once
          this.showAndroidFallbackInfo();
        }
      }
    } else if (isIOS()) {
      // Do not auto-show on iOS; show only when the user taps Install
      // Keep a once-flag for future use if needed
    }
  }

  offerAndroidInstallOnce() {
    const html = `Install MeetchuThere for faster access and a native‑like experience.`;
    showModal({
      title: "Install App",
      content: html,
      isHtmlContent: true,
      showConfirmationButtons: true,
      confirmText: "Install",
      cancelText: "Later",
      onConfirm: async () => {
        await this.tryAndroidPromptWithGesture();
      },
    });
  }

  async tryAndroidPromptWithGesture() {
    if (!this.deferredPrompt) {
      this.showAndroidFallbackInfo();
      return;
    }
    try {
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
    } catch (e) {
      // NotAllowedError if not initiated with gesture; we already gate via modal
    } finally {
      // Event can only be used once
      this.deferredPrompt = null;
      this.updateInstallButtonVisibility();
    }
  }

  showIOSInstructions(onCloseCb = null) {
    try {
      // Temporarily style modal container for half-screen look
      const modalContent = document.querySelector("#appModal .modal-content");
      const overlay = document.getElementById("appModal");
      modalContent?.classList?.add("pwa-install-card");
      overlay?.classList?.add("glass-overlay");

      const html = `
        <div class="pwa-ios-instructions">
          <div class="steps">
            <div class="step">
              <div class="step-text">1. Open <strong>Safari</strong>, then tap the Share button</div>
              <img class="step-img" src="/assets/shareButtonIOS.png" alt="iOS Share" />
            </div>
            <div class="step">
              <div class="step-text">2. Tap <strong>Add to Home Screen</strong></div>
              <img class="step-img" src="/assets/addToHomeScreenIOS.png" alt="Add to Home Screen" />
            </div>
          </div>
          <small class="note">Tip: Installing makes MeetchuThere feel like a native app.</small>
        </div>`;

      showModal({
        title: "Install on iOS",
        content: html,
        isHtmlContent: true,
        showConfirmationButtons: false,
        onConfirm: () => {
          modalContent?.classList?.remove("pwa-install-card");
          overlay?.classList?.remove("glass-overlay");
          if (onCloseCb) onCloseCb();
        },
        onCancel: () => {
          modalContent?.classList?.remove("pwa-install-card");
          overlay?.classList?.remove("glass-overlay");
          if (onCloseCb) onCloseCb();
        },
      });
    } catch (err) {
      logManager.dev.debug("PWA operation failed: iOS instructions modal", err);
    }
  }

  showAndroidFallbackInfo() {
    // Only used if the native event isn't available
    const html = `If the install prompt doesn't appear, open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.`;
    showModal({
      title: "Install App",
      content: html,
      isHtmlContent: true,
      showConfirmationButtons: false,
    });
  }
}

export const pwaInstallService = new PWAInstallService();

// Attach event hooks immediately on module load to catch early events
pwaInstallService.attachGlobalEventHooks();

// Developer console helpers for quick manual testing on desktop
try {
  const __DEV__ =
    typeof window !== "undefined" &&
    (import.meta?.env?.DEV ||
      (typeof process !== "undefined" &&
        process.env &&
        process.env.NODE_ENV === "development") ||
      (window.ENV && window.ENV.ENVIRONMENT !== "production"));
  if (__DEV__) {
    window.pwaTest = {
      // Show iOS-style modal regardless of platform
      ios: () => pwaInstallService.showIOSInstructions(),
      // Show Android fallback info (useful if deferredPrompt not available)
      androidInfo: () => pwaInstallService.showAndroidFallbackInfo(),
      // Show the Android install modal (confirm to trigger native prompt if available)
      androidModal: () => pwaInstallService.offerAndroidInstallOnce(),
      // Attempt to trigger the native prompt (if available)
      prompt: () => pwaInstallService.handleInstallClick(),
      // Check if browser captured a deferred prompt
      hasDeferred: () => !!pwaInstallService.deferredPrompt,
      // Toggle top-right button visibility manually
      showButton: () => {
        const el = document.getElementById("installPwaBtn");
        if (el) el.style.display = "inline-flex";
      },
      hideButton: () => {
        const el = document.getElementById("installPwaBtn");
        if (el) el.style.display = "none";
      },
      // Reset one-time flags for auto-prompt/modal
      resetOnceFlags: () => {
        const uid = getUidSafe();
        try {
          localStorage.removeItem(STORAGE_KEYS.androidAutoPromptShown(uid));
          localStorage.removeItem(STORAGE_KEYS.iosModalShown(uid));
        } catch (err) {
          logManager.dev.debug("Storage access failed: reset once flags", err);
        }
      },
      // Mark installed flags for testing, and clear
      markInstalled: () => markInstalled(),
      clearInstalled: () => {
        try { localStorage.removeItem(STORAGE_KEYS.appInstalled); } catch (err) {
          logManager.dev.debug("Storage access failed: clear installed flag", err);
        }
      },
      // Quick status
      status: () => ({
        installed: isStandalone() || isMarkedInstalled(),
        isIOS: isIOS(),
        isAndroid: isAndroid(),
        hasDeferred: !!pwaInstallService.deferredPrompt,
      }),
    };
  }
} catch (err) {
  logManager.dev.debug("PWA operation failed: dev tools registration", err);
}
