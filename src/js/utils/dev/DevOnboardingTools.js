// Dev-only Onboarding Test Utilities
// - Exposes window.campxusOnboardingTest.startFresh()
// - Adds an (O-Test) button to the top nav to reset + start onboarding

import { onboardingService } from "../../services/onboarding/OnboardingService.js";
import { hideAllCoachMarks } from "../../services/onboarding/CoachMarkManager.js";
import { currentUser } from "../../store/userStore.js";

function isDevEnv() {
  try {
    // Vite dev flag preferred; fallback to window.ENV
    if (typeof import.meta !== "undefined" && import.meta.env) {
      return !!import.meta.env.DEV || import.meta.env.MODE !== "production";
    }
    if (typeof window !== "undefined" && window.ENV) {
      return (window.ENV.ENVIRONMENT || "development") !== "production";
    }
  } catch (_) {}
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
    try { hideAllCoachMarks("reset"); } catch (_) {}

    // Reuse the existing per-user reset listener in pages to clear timers/queues
    try {
      const uid = currentUser?.uid || null;
      document.dispatchEvent(
        new CustomEvent("onboarding:user-switched", {
          detail: { previousUid: uid, nextUid: uid, reason: "dev-reset" },
        })
      );
    } catch (_) {}

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
    } catch (_) {}
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
  } catch (_) {}

  /*
   * Dev O-Test button injection (commented out)
   *
   * Intentionally disabled per request so the button remains in the codebase
   * for future use, but is not active or shown in the UI.
   *
   * To re-enable, remove this block comment.
   */
  // try {
  //   const navRight = document.querySelector(".top-nav .nav-right");
  //   if (!navRight) return;
  //
  //   // Avoid duplicates
  //   if (navRight.querySelector("#devOnboardingTestBtn")) return;
  //
  //   const btn = document.createElement("button");
  //   btn.id = "devOnboardingTestBtn";
  //   btn.type = "button";
  //   btn.textContent = "(O-Test)";
  //   btn.title = "Reset and start onboarding (dev)";
  //   btn.setAttribute("aria-label", "Reset and start onboarding (dev)");
  //   // Reuse nav styling; keep it compact
  //   btn.className = "nav-link nav-cta";
  //   btn.style.marginRight = "8px";
  //
  //   btn.addEventListener("click", () => {
  //     // Persist true by default so remote flags also reset for this account
  //     startFreshOnboarding({ persist: true, target: "auto" });
  //   });
  //
  //   // Insert before About link for visibility but low intrusion
  //   const about = navRight.querySelector("#aboutBtn");
  //   if (about && about.parentElement === navRight) {
  //     navRight.insertBefore(btn, about);
  //   } else {
  //     navRight.prepend(btn);
  //   }
  // } catch (_) {}
}
