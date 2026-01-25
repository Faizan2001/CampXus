// Dev-only Onboarding Test Utilities
// - Exposes window.campxusOnboardingTest.startFresh()
// - Adds an (O-Test) button to the top nav to reset + start onboarding

import { onboardingService } from "../../services/onboarding/OnboardingService.js";
import { hideAllCoachMarks } from "../../services/onboarding/CoachMarkManager.js";
import { currentUser } from "../../store/userStore.js";
import { logManager } from "../debug/LogManager.js";

function isDevEnv() {
  try {
    // Vite dev flag preferred; fallback to window.ENV
    if (typeof import.meta !== "undefined" && import.meta.env) {
      return !!import.meta.env.DEV || import.meta.env.MODE !== "production";
    }
    if (typeof window !== "undefined" && window.ENV) {
      return (window.ENV.ENVIRONMENT || "development") !== "production";
    }
  } catch (err) {
    logManager.dev.debug("Dev environment detection failed", err);
  }
  return true; // default safe for local dev
}

async function startFreshOnboarding(options = {}) {
  const { persist = true, target = "auto" } = options;
  try {
    // Ensure service is initialized first
    await onboardingService.init().catch(() => {});

    // Reset all flags (session + memory); persist to Firestore by default
    await onboardingService.resetAll({ persist });

    // Close any open coachmarks and clear local in-page hint state
    try { hideAllCoachMarks("reset"); } catch (err) {
      logManager.dev.debug("CoachMarks hide failed during reset", err);
    }

    // Reuse the existing per-user reset listener in pages to clear timers/queues
    try {
      const uid = currentUser?.uid || null;
      document.dispatchEvent(
        new CustomEvent("onboarding:user-switched", {
          detail: { previousUid: uid, nextUid: uid, reason: "dev-reset" },
        })
      );
    } catch (err) {
      logManager.dev.debug("User-switched event dispatch failed", err);
    }

    // Route selection: default to current page if it supports onboarding; else go to home
    const hash = (location.hash || "").replace(/^#/, "");
    let route = "home";
    if (target === "home" || target === "friends") {
      route = target;
    } else if (hash === "home" || hash === "friends") {
      route = hash;
    }

    // Navigate via hash to let the Router handle loading without import cycles
    try {
      if (route) {
        const newHash = `#${route}`;
        if (location.hash !== newHash) {
          location.hash = newHash;
        } else {
          // Force reload of same route by pushing state (triggers popstate)
          history.pushState({ route }, "", newHash);
          window.dispatchEvent(new PopStateEvent("popstate", { state: { route } }));
        }
      }
    } catch (err) {
      logManager.dev.debug("Navigation dispatch failed", err);
    }
  } catch (e) {
    // Non-fatal; surface to console for dev
    // eslint-disable-next-line no-console
    console.warn("[DevOnboardingTools] startFresh failed:", e);
  }
}

export function installOnboardingDevTools() {
  if (!isDevEnv()) return; // Do nothing in production builds

  // Expose concise console helpers
  try {
    window.campxusOnboardingTest = {
      startFresh: (opts) => startFreshOnboarding(opts),
    };
    // Short aliases for quick console testing
    window.oTestOnboarding = (opts) => startFreshOnboarding(opts);
  } catch (err) {
    logManager.dev.debug("Dev tools window registration failed", err);
  }

  /*
   * Dev O-Test button injection (commented out)
   *
   * Intentionally disabled per request so the button remains in the codebase
   * for future use, but is not active or shown in the UI.
   *
   * To re-enable, remove this block comment.
   */
}
