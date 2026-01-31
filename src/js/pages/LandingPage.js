/**
 * Landing Page Controller
 *
 * Handles the landing page functionality for MeetchuThere - the welcome page
 * that users see when they're not logged in. Features animated text and
 * call-to-action interactions.
 *
 * @fileoverview Landing page with animated tagline and authentication integration
 */

// Import necessary services and utilities
import { logManager } from "../utils/debug/LogManager.js";
import { notificationManager } from "../services/realtime/NotificationService.js";

/**
 * Landing Page Class
 * Manages landing page interactions and animations
 */
class LandingPage {
  constructor() {
    this.joinButton = null;
    this.animationInterval = null;
    this.presenceInterval = null;
    this.presenceTimeoutId = null;
    this.presenceElements = null;
    this.imageIndex = 0;
    this.stateIndex = 0;
    this.friendImages = [];
    this.presenceRunId = 0;
    this.originalButtonMarkup = "";
    this.boundHandleJoinClick = this.handleJoinClick.bind(this);

    logManager.ui.init("LandingPage: Initializing landing page controller");

    // Initialize the landing page when DOM is ready
    this.init();
  }

  /**
   * Initialize landing page functionality
   */
  init() {
    // Set up join button click handler
    this.setupJoinButton();

    // Start text animation
    this.startTextAnimation();

    // Add any additional landing page interactions
    this.setupInteractions();

    this.initPresenceDemo();

    logManager.ui.init("LandingPage: Initialization complete");
  }

  /**
   * Set up the join button functionality
   */
  setupJoinButton() {
    this.joinButton = document.querySelector('[data-evt="signup_started"]');

    if (this.joinButton) {
      this.originalButtonMarkup = this.joinButton.innerHTML;
      this.joinButton.addEventListener("click", this.boundHandleJoinClick);
      logManager.ui.init("LandingPage: Join button event listener attached");
    } else {
      logManager.ui.error("LandingPage: Join button not found in DOM");
    }
  }

  /**
   * Handle join button click - trigger authentication
   */
  async handleJoinClick(event) {
    event.preventDefault();

    if (!this.joinButton) {
      logManager.ui?.warn?.("LandingPage: Join button missing during click");
      return;
    }

    try {
      // Add loading state to button
      const originalText = this.joinButton.innerHTML;
      if (!this.originalButtonMarkup) {
        this.originalButtonMarkup = originalText;
      }
      this.joinButton.classList.add("is-busy");
      this.joinButton.innerHTML = `<span class="cta-text">Opening...</span>`;
      this.joinButton.disabled = true;

      logManager.ui.click(
        "LandingPage: Join button clicked - opening authentication"
      );

      try {
        const { AnalyticsService } = await import(
          "../services/analytics/AnalyticsService.js"
        );
        AnalyticsService?.trackFeatureUsage?.("landing_signup", {
          source: "landing",
        });
      } catch (trackError) {
        logManager.ui?.warn?.(
          "LandingPage: Analytics tracking failed",
          trackError
        );
      }

      // Trigger authentication modal with Sign Up tab active
      try {
        const { authManager } = await import(
          "../services/auth/AuthService.js"
        );
        if (authManager && authManager.showAuthModal) {
          authManager.showAuthModal("signup");
          logManager.auth.login(
            "LandingPage: Authentication modal opened successfully"
          );
        } else {
          throw new Error("authManager or showAuthModal not available");
        }
      } catch (authError) {
        logManager.auth.error(
          "LandingPage: Authentication system not available",
          authError
        );
        notificationManager.show(
          "Authentication system temporarily unavailable. Please refresh and try again.",
          "error"
        );
        return;
      }
    } catch (error) {
      logManager.ui.error(
        "❌ LandingPage: Error handling join button click:",
        error
      );

      // Show user-friendly error
      notificationManager.show(
        "Unable to open sign-in. Please refresh the page and try again.",
        "error"
      );
    } finally {
      // Restore button state after a short delay
      setTimeout(() => {
        if (this.joinButton) {
          this.joinButton.innerHTML = this.originalButtonMarkup;
          this.joinButton.classList.remove("is-busy");
          this.joinButton.disabled = false;
        }
      }, 1000);
    }
  }

  /**
   * Start the animated text rotation
   */
  startTextAnimation() {
    const animatedText1 = document.getElementById("animatedText1");
    const animatedText2 = document.getElementById("animatedText2");

    logManager.ui.init("🔍 LandingPage: startTextAnimation called");
    logManager.ui.init(
      `🔍 LandingPage: animatedText1 found: ${!!animatedText1}`
    );
    logManager.ui.init(
      `🔍 LandingPage: animatedText2 found: ${!!animatedText2}`
    );

    if (!animatedText1 || !animatedText2) {
      logManager.ui.warn("⚠️ LandingPage: Animated text elements not found");
      return;
    }

    // Respect reduced motion preferences: show first text only, no animation
    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      animatedText1.style.opacity = "1";
      animatedText1.style.transform = "translateY(0)";
      animatedText2.style.opacity = "0";
      animatedText2.style.transform = "translateY(100%)";
      logManager.ui.init(
        "🎬 LandingPage: Reduced-motion active; static text displayed"
      );
      return;
    }

    // CSS transition is now handled in template, just control the animation
    logManager.ui.init("🎬 LandingPage: Setting up animation states");

    // Animation helpers for smooth slide-up transitions
    const slideInFromBottom = (el) => {
      // Start hidden below, then slide up to visible position
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    };
    const slideOutToTop = (el) => {
      // Slide up and fade out
      el.style.opacity = "0";
      el.style.transform = "translateY(-100%)";
    };
    const hideBelow = (el) => {
      // Position below viewport, ready to slide up
      el.style.opacity = "0";
      el.style.transform = "translateY(100%)";
    };

    // Initial state: first text slides in from bottom, second waits below
    slideInFromBottom(animatedText1);
    hideBelow(animatedText2);

    logManager.ui.init("🎬 LandingPage: Initial slide-up animation set");

    // Create smooth slide-up replacement animation every 2.5s
    let showingFirst = true;
    if (this.animationInterval) clearInterval(this.animationInterval);

    this.animationInterval = setInterval(() => {
      if (showingFirst) {
        // Current text slides up and out, new text slides up from bottom
        slideOutToTop(animatedText1);
        setTimeout(() => {
          hideBelow(animatedText1); // Reset position for next cycle
          slideInFromBottom(animatedText2);
        }, 200); // Wait for slide-out to start
      } else {
        // Same pattern: current out, new in from bottom
        slideOutToTop(animatedText2);
        setTimeout(() => {
          hideBelow(animatedText2); // Reset position for next cycle
          slideInFromBottom(animatedText1);
        }, 200);
      }
      showingFirst = !showingFirst;
    }, 2500);

    logManager.ui.init("🎬 LandingPage: Text animation started (JS-driven)");
  }

  /**
   * Set up additional page interactions
   */
  setupInteractions() {
    // Add smooth scrolling to features section if needed
    this.setupSmoothScrolling();

    // Add parallax or other visual enhancements
    this.setupVisualEnhancements();
  }

  /**
   * Set up smooth scrolling for internal links
   */
  setupSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();

        const targetId = link.getAttribute("href").substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    });
  }

  /**
   * Set up visual enhancements like parallax effects
   */
  setupVisualEnhancements() {
    // Add scroll-based animations if needed
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("animate-in");
            }
          });
        },
        {
          threshold: 0.1,
          rootMargin: "0px 0px -50px 0px",
        }
      );

      // Observe feature cards for animation
      const featureCards = document.querySelectorAll(".feature-card");
      featureCards.forEach((card) => {
        observer.observe(card);
      });
    }
  }

  /**
   * Clean up landing page when navigating away
   */
  cleanup() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }

    this.teardownPresenceDemo();

    // Remove event listeners
    if (this.joinButton) {
      this.joinButton.removeEventListener("click", this.boundHandleJoinClick);
    }

    logManager.ui.init("🧹 LandingPage: Cleanup completed");
  }

  initPresenceDemo() {
    const container = document.querySelector(".landing-avatar-demo");
    const avatarImg = document.getElementById("demo-avatar-img");
    const presenceText = document.getElementById("demo-presence-text");
    const avatarPicture = avatarImg?.closest?.("picture") || null;
    const webpSource =
      avatarPicture?.querySelector?.('source[data-demo-format="webp"]') || null;

    if (!container || !avatarImg || !presenceText) {
      logManager.ui.warn("LandingPage: Presence demo elements missing");
      return;
    }

    if (container.dataset.demoInitialized === "1") {
      return;
    }

    container.dataset.demoInitialized = "1";

    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.presenceElements = {
      container,
      avatarImg,
      presenceText,
    };
    this.imageIndex = 0;
    this.stateIndex = 0;
    this.presenceRunId += 1;
    const runId = this.presenceRunId;
    const isActive = () =>
      this.presenceRunId === runId &&
      this.presenceElements?.container === container &&
      document.body.contains(container);

    const friendImageBases = [
      "dev-picture-1",
      "aurpadp",
      "aurkodp",
      "sameedp",
      "salmandp",
      "hashmitadp",
      "mehaldp",
      "moin_dp",
      "samiya_dp",
      "atifdp",
      "omardp",
      "shams_dp",
    ];

    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || "");
    const saveData = !!connection?.saveData;
    const isSlowConnection =
      saveData || effectiveType === "slow-2g" || effectiveType === "2g";
    const is3g = effectiveType === "3g";

    // Limit cycles on slower connections to avoid pulling lots of assets on first visit.
    this.friendImages = isSlowConnection
      ? friendImageBases.slice(0, 1)
      : is3g
        ? friendImageBases.slice(0, Math.min(3, friendImageBases.length))
        : friendImageBases;

    const getThumbUrl = (base, ext) =>
      `/assets/landing-friends/thumbs/${base}-320.${ext}`;

    const supportsWebpPromise = (() => {
      if (!webpSource) return Promise.resolve(false);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.width === 1);
        img.onerror = () => resolve(false);
        img.src =
          "data:image/webp;base64,UklGRiIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
      });
    })();

    // Presence states matching the app's actual states
    const states = [
      { cls: "green", label: "Free", color: "#75f7b9" },
      { cls: "green", label: "On campus", color: "#75f7b9" },
      { cls: "red", label: "Off campus", color: "#ff87a4" },
      { cls: "blue", label: "In class", color: "#60a5fa" },
      { cls: "grey", label: "Not sharing", color: "#9fa7b8" },
    ];

    let hasCycled = false;
    let isCycling = false;
    const imageCache = new Map();

    const preloadImage = (src) => {
      if (!src) return Promise.resolve();
      if (imageCache.has(src)) return imageCache.get(src);

      const promise = new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      });

      imageCache.set(src, promise);
      return promise;
    };

    const preloadBase = (base) => {
      if (!base) return Promise.resolve();
      return supportsWebpPromise.then((supported) =>
        preloadImage(getThumbUrl(base, supported && webpSource ? "webp" : "jpg"))
      );
    };

    const preloadUpcoming = (count = 2) => {
      if (this.friendImages.length <= 1) return;
      for (let i = 0; i < Math.min(count, this.friendImages.length); i++) {
        const idx = (this.imageIndex + i) % this.friendImages.length;
        preloadBase(this.friendImages[idx]);
      }
    };

    // Sequential cycle - loops through images and states in order
    const cycleDemo = () => {
      if (!isActive() || isCycling) return;

      const state = states[this.stateIndex];
      const nextBase = this.friendImages[this.imageIndex];
      const nextWebp = getThumbUrl(nextBase, "webp");
      const nextJpg = getThumbUrl(nextBase, "jpg");

      isCycling = true;
      const warm = !hasCycled ? Promise.resolve() : preloadBase(nextBase);
      warm.then(() => {
        if (!isActive()) {
          isCycling = false;
          return;
        }

        // Update presence status
        presenceText.textContent = state.label;
        presenceText.setAttribute("data-state", state.cls);
        presenceText.classList.remove("swap");
        void presenceText.offsetWidth;
        presenceText.classList.add("swap");
        container.setAttribute("data-presence", state.cls);
        container.style.setProperty("--presence-color", state.color);

        // Update image (no fade on first paint to avoid flicker)
        avatarImg.decoding = "async";
        avatarImg.onload = () => {
          avatarImg.style.opacity = "1";
        };
        avatarImg.onerror = () => {
          avatarImg.style.opacity = "1";
        };

        if (webpSource) {
          webpSource.srcset = nextWebp;
        }

        if (!hasCycled) {
          avatarImg.style.opacity = "1";
          avatarImg.src = nextJpg;
          hasCycled = true;
          this.imageIndex = (this.imageIndex + 1) % this.friendImages.length;
          this.stateIndex = (this.stateIndex + 1) % states.length;
          preloadUpcoming(is3g ? 1 : 2);
          isCycling = false;
          return;
        }

        // Only fade out once the next image is already cached, so slow networks
        // don't show an empty frame.
        avatarImg.style.transition = "opacity 200ms ease";
        avatarImg.style.opacity = "0";

        if (this.presenceTimeoutId) {
          clearTimeout(this.presenceTimeoutId);
        }
        this.presenceTimeoutId = window.setTimeout(() => {
          if (!isActive()) {
            isCycling = false;
            return;
          }
          avatarImg.src = nextJpg;
          this.imageIndex = (this.imageIndex + 1) % this.friendImages.length;
          this.stateIndex = (this.stateIndex + 1) % states.length;
          preloadUpcoming(is3g ? 1 : 2);
          isCycling = false;
        }, 200);
      });
    };

    // Initial state
    avatarImg.style.opacity = "1";
    preloadUpcoming(is3g ? 1 : 2);
    cycleDemo();

    if (prefersReducedMotion) {
      return;
    }

    if (isSlowConnection || this.friendImages.length <= 1) {
      return;
    }

    // Sync both image and status at 1.25 second intervals (slower on 3G)
    const intervalMs = is3g ? 2000 : 1250;
    this.presenceInterval = window.setInterval(cycleDemo, intervalMs);
  }

  teardownPresenceDemo() {
    // Invalidate any in-flight async work from initPresenceDemo()
    this.presenceRunId += 1;

    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }

    if (this.presenceTimeoutId) {
      clearTimeout(this.presenceTimeoutId);
      this.presenceTimeoutId = null;
    }

    if (!this.presenceElements) {
      return;
    }

    const { container, avatarImg, presenceText } = this.presenceElements;

    if (container) {
      container.removeAttribute("data-presence");
      delete container.dataset.demoInitialized;
      container.style.removeProperty("--presence-color");
    }

    if (presenceText) {
      presenceText.classList.remove("swap");
      presenceText.textContent = "Not sharing";
      presenceText.removeAttribute("data-state");
    }

    if (avatarImg) {
      avatarImg.style.opacity = "1";
    }

    this.presenceElements = null;
    this.imageIndex = 0;
    this.stateIndex = 0;
  }
}

// Initialize landing page when the module loads
let landingPageInstance = null;

// Listen for the spa:page:load event to initialize
document.addEventListener("spa:page:load", (event) => {
  if (event.detail.route === "landing") {
    logManager.ui.init(
      "📍 LandingPage: SPA page load event received for landing page"
    );

    // Clean up previous instance if it exists
    if (landingPageInstance) {
      landingPageInstance.cleanup();
    }

    // Create new instance
    landingPageInstance = new LandingPage();
  }
});

// Listen for page unload to cleanup
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "landing" && landingPageInstance) {
    logManager.ui.init(
      "🧹 LandingPage: SPA page unload event received, cleaning up"
    );
    landingPageInstance.cleanup();
    landingPageInstance = null;
  }
});

// Export for potential external usage
export default LandingPage;
