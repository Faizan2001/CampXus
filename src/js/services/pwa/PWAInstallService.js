// PWAInstallService.js
// Handles Android PWA install prompt gating + iOS instructions modal.

import { currentUser } from "../../store/userStore.js";
import { showModal } from "../../components/modals/Modal.js";

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
  // iOS installed to homescreen
  const iOSStandalone = typeof window.navigator.standalone === "boolean" && window.navigator.standalone;
  return !!standaloneDisplay || !!iOSStandalone;
}

function markInstalled() {
  try {
    localStorage.setItem(STORAGE_KEYS.appInstalled, "true");
  } catch (_) {}
}

function isMarkedInstalled() {
  try {
    return localStorage.getItem(STORAGE_KEYS.appInstalled) === "true";
  } catch (_) {
    return false;
  }
}

function getUidSafe() {
  try {
    return currentUser?.uid || null;
  } catch (_) {
    return null;
  }
}

class PWAInstallService {
  constructor() {
    this.deferredPrompt = null; // BeforeInstallPromptEvent
    this.initialized = false;
    this.buttonEl = null;
  }

  // Attach listeners ASAP (module load) to catch the event and prevent auto-prompt
  attachGlobalEventHooks() {
    if (this._globalHooksAttached) return;
    this._globalHooksAttached = true;

    window.addEventListener("beforeinstallprompt", (e) => {
      // Stop the auto mini-infobar; store for later
      e.preventDefault();
      this.deferredPrompt = e;
      // Refresh UI eligibility when event arrives
      this.updateInstallButtonVisibility();
      // If user already completed profile, auto-prompt once now
      this.maybeAutoPromptAfterProfile();
    });

    window.addEventListener("appinstalled", () => {
      markInstalled();
      this.deferredPrompt = null;
      this.updateInstallButtonVisibility();
    });
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.attachGlobalEventHooks();

    this.buttonEl = document.getElementById("installPwaBtn");
    if (this.buttonEl) {
      this.buttonEl.addEventListener("click", () => this.handleInstallClick());
    }

    // React to auth/profile changes to gate prompts and UI
    if (currentUser && typeof currentUser.subscribe === "function") {
      currentUser.subscribe(() => {
        this.updateInstallButtonVisibility();
        this.maybeAutoPromptAfterProfile();
      });
    }

    // Also listen to explicit profile setup completion events
    document.addEventListener("profile:setup:complete", () => {
      // Delay slightly to let userStore update propagate
      setTimeout(() => this.maybeAutoPromptAfterProfile(), 200);
    });

    // Update when viewport changes (mobile-only button)
    window.addEventListener("resize", () => this.updateInstallButtonVisibility());

    // Set initial state on load
    this.updateInstallButtonVisibility();
  }

  isEligibleToShowButton() {
    const isMobileNarrow = window.innerWidth <= 480;
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
      } catch (_) {
        // ignore
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
        try { localStorage.setItem(key, "true"); } catch (_) {}
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
    } catch (_) {
      // graceful no-op
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
  if (typeof window !== "undefined") {
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
        } catch (_) {}
      },
      // Mark installed flags for testing, and clear
      markInstalled: () => markInstalled(),
      clearInstalled: () => {
        try { localStorage.removeItem(STORAGE_KEYS.appInstalled); } catch (_) {}
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
} catch (_) {}
