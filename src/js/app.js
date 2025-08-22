/**
 * CampXus SPA Initialization
 *
 * 🎯 Learning: This file initializes our Single Page Application
 * It's like the "conductor" that makes sure everything starts up correctly!
 *
 * This script:
 * - Creates the router instance
 * - Handles authentication state
 * - Manages navigation redirects
 * - Integrates with existing app functionality
 */

import SPARouter from "./router/Router.js";
import "./components/navigation/Menu.js"; // 🎯 CRITICAL FIX: Import menu system for authentication state management
import { currentUser } from "./store/userStore.js"; // 🎯 FIX: Import currentUser for profile updates
import { authManager } from "./services/auth/AuthService.js"; // 🎯 NEW: Import authManager instead of using window
import { initModal } from "./components/modals/Modal.js"; // 🎯 FIX: Import modal system for app-wide availability
import {
  DOM_ELEMENTS,
  initializeDomElements,
} from "./utils/dom/domElements.js"; // 🎯 FIX: Import DOM elements for modal

// 🎯 CSS IMPORTS: Import all CSS here so Vite bundles it for both dev & prod
import "/src/css/styles.css";

// 🎯 JS IMPORTS: Import page-specific JS modules so Vite bundles them for preview mode
// Import in dependency order: manager first, then UI that depends on it
import "./pages/HomePage.js"; // 🎯 CRITICAL: Schedule page functionality
import "./services/friends/FriendsService.js";
import "./pages/FriendsPage.js";
import "./services/realtime/RealtimeService.js"; // 🎯 NEW: Real-time event coordination system
import "./utils/dev/debugHelpers.js"; // 🎯 NEW: Debug tools and console helpers
import "./components/forms/ProfileSetup.js";
import "./utils/avatar/avatarManager.js";
import "./pages/NotificationsPage.js"; // 🔔 Campus Presence: Notifications system

// 🌍 Campus Presence Services
import { campusLocationService } from "./services/location/CampusLocationService.js";
import { locationPrivacyService } from "./services/location/LocationPrivacyService.js";

// 🔧 Development tools
import { logManager } from "./utils/debug/LogManager.js";

// 🎯 DEBUG: Log that modules are imported
logManager.dev.debug("SPA Init: All page-specific modules imported and ready");

// 🔧 Development: Configure logging level based on environment
if (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
) {
  logManager.setLevel("debug"); // Show all logs in development
  logManager.dev.info("Debug mode enabled - showing all logs");
} else {
  logManager.setLevel("warn"); // Only show warnings and errors in production
  logManager.system.init("Production mode - showing warnings and errors only");
}

// 🎯 NEW: Create module-level variables instead of window globals
let spaRouter = null;

/**
 * Initialize the SPA when DOM is ready
 * 🎯 Learning: We wait for the DOM to load before setting up our app
 */
async function initializeSPA() {
  logManager.system.init("CampXus SPA Initialization");

  // Double-check that essential DOM elements exist
  const mainContent = document.querySelector(".main-content");
  const topNav = document.querySelector(".top-nav");

  if (!mainContent) {
    logManager.system.error("CRITICAL: .main-content not found. Cannot initialize SPA.");
    return;
  }

  // 🎯 LEARNING: This is the critical fix for our race condition.
  // We're telling our app to PAUSE and wait until the AuthManager
  // confirms the user's login status from Firebase.
  // The `authReady` is a Promise we created in AuthManager that resolves
  // only after the initial `onAuthStateChanged` event has fired.
  if (authManager?.authReady) {
    logManager.auth.login("Waiting for authentication to be ready...");

    try {
      // Add a timeout to prevent waiting forever
      const authTimeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Auth timeout after 3 seconds")),
          3000
        )
      );

      await Promise.race([authManager.authReady, authTimeout]);
      logManager.auth.login("Authentication ready!");
    } catch (error) {
      logManager.auth.warn(
        `Authentication timeout or error, proceeding anyway: ${error.message}`
      );
      // Continue initialization even if auth times out
    }
  } else {
    logManager.auth.warn(
      "AuthManager or authReady promise not found. Proceeding without auth check."
    );
  }

  // Now that we're sure about the auth status, we can initialize the router.
  logManager.system.init("Creating SPA Router instance...");

  // Check if main-content container exists
  const mainContentContainer = document.querySelector(".main-content");
  if (!mainContentContainer) {
    logManager.system.error(
      "CRITICAL: .main-content container not found! SPA Router cannot work."
    );
    return;
  }

  // 🎯 FIX: Initialize DOM elements and modal system for app-wide availability
  logManager.system.init("Initializing DOM elements and modal system...");
  initializeDomElements();
  initModal(DOM_ELEMENTS);
  logManager.system.init("Modal system initialized successfully!");

  // 🌍 Initialize Campus Presence services in background (NON-BLOCKING)
  logManager.system.init("Starting Campus Presence services in background...");

  // Start background initialization without blocking app startup
  initializeCampusPresenceInBackground();

  spaRouter = new SPARouter();

  // 🎯 FIXED: Manually trigger the initial page load now that auth is ready.
  spaRouter.loadInitialPage();

  // ── BUG FIX ──
  // Register the profile setup completion listeners so that
  // `profile:setup:complete` and `profile:setup:skip` events
  // actually drive menu refresh and navigation.
  setupProfileCompletionFlow();

  // Listen for SPA navigation events
  setupSPAEventListeners();

  // 💰 COST OPTIMIZATION: Detect manual reloads for strategic Google API usage
  window.addEventListener("beforeunload", () => {
    // Mark that a manual reload is happening
    if (
      typeof campusLocationService?.constructor?.markManualReload === "function"
    ) {
      campusLocationService.constructor.markManualReload();
    }
  });

  logManager.system.init("SPA Initialization completed");
}

// Initialize when DOM is ready, or immediately if already ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSPA);
} else {
  // DOM is already ready, execute immediately
  logManager.system.init("DOM already ready, initializing SPA immediately...");
  initializeSPA();
}

/**
 * Handle profile setup completion flow
 * 🎯 Learning: In SPAs, we redirect using JavaScript instead of page reloads
 */
function setupProfileCompletionFlow() {
  // Listen for profile setup completion
  document.addEventListener("profile:setup:complete", async (event) => {
    logManager.auth.user(
      "Profile setup completed, refreshing user data and redirecting..."
    );

    // 🎯 CRITICAL FIX: Update currentUser store with fresh profile data
    const userData = event.detail.userData;
    if (userData && currentUser) {
      logManager.auth.user("Updating currentUser store with fresh profile data...");

      // Update the currentUser store with the fresh profile data
      currentUser.setProfile(userData);

      // Also ensure the user object is set if it wasn't already
      if (!currentUser.user && authManager?.getCurrentUser()) {
        currentUser.setUser(authManager.getCurrentUser());
      }

      logManager.auth.user("currentUser store updated with fresh profile data");
    }

    // Show success message briefly, then redirect
    setTimeout(() => {
      if (spaRouter) {
        logManager.ui.click("Navigating to home after profile completion...");
        // Set completion flag for the SPA router to handle
        sessionStorage.setItem("profileJustCompleted", "true");
        spaRouter.navigateTo("home");
      } else {
        logManager.system.error(
          "SPA Router not available for profile completion navigation!"
        );
      }
    }, 500); // Reduced to 0.5 second delay
  });
}

/**
 * Set up SPA-specific event listeners
 * 🎯 Learning: SPAs use events to communicate between different parts
 */
function setupSPAEventListeners() {
  // Listen for navigation events to update UI
  document.addEventListener("spa:navigation", (event) => {
    const { route } = event.detail;

    // Update document title for better UX
    updatePageTitle(route);

    // Close any open menus/dropdowns when navigating
    closeAllDropdowns();

    // Scroll to top of page (like a normal page navigation would)
    window.scrollTo(0, 0);

    // Update any global UI elements based on current page
    updateGlobalUIForPage(route);
  });
}

/**
 * Update page title based on current route
 * 🎯 Learning: Good SPAs update the browser title for each "page"
 */
function updatePageTitle(route) {
  const titles = {
    home: "Schedule - CampXus",
    profile: "Profile Setup - CampXus",
    friends: "Friends - CampXus",
    notifications: "Notifications - CampXus",
    about: "About - CampXus",
  };

  const title = titles[route] || "CampXus";
  document.title = title;
}

/**
 * Close any open dropdowns when navigating
 * 🎯 Learning: Clean up UI state when moving between pages
 */
function closeAllDropdowns() {
  // Close user menu dropdown if open
  const userDropdown = document.getElementById("userDropdown");
  if (userDropdown) {
    userDropdown.classList.remove("show");
  }

  // Reset user menu trigger
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  if (userMenuTrigger) {
    userMenuTrigger.setAttribute("aria-expanded", "false");
  }
}

/**
 * Update global UI elements based on current page
 * 🎯 Learning: Some UI elements might change based on the current page
 */
function updateGlobalUIForPage(route) {
  // Example: You might want to highlight different nav items
  // or show/hide certain global elements based on the current page

  // Add page-specific class to body for CSS targeting
  document.body.className = document.body.className.replace(/\bpage-\w+/g, "");
  document.body.classList.add(`page-${route}`);

  // You could also update the navigation active states here
  // (though the router already handles this)
}

/**
 * Export navigateTo function for external use instead of window global
 * 🎯 Learning: Provide a simple way for other scripts to navigate
 */
export function navigateTo(route) {
  if (spaRouter) {
    spaRouter.navigateTo(route);
  } else {
    console.error("SPA Router not initialized yet");
  }
}

/**
 * Export for use in other modules
 * 🎯 Learning: Modern JavaScript modules can export functions
 */
export { setupProfileCompletionFlow, updatePageTitle };

/**
 * Initialize Campus Presence services in background without blocking UI
 * 🚀 Performance: Keeps app interactive during location API calls
 * 🎯 Fresh Data: Ensures presence dots get latest coordinates on first visit
 */
async function initializeCampusPresenceInBackground() {
  try {
    logManager.system.init(
      "Background: Non-blocking Campus Presence initialization started..."
    );

    // Enhanced fresh data detection with cache validation
    const isFirstVisit = !localStorage.getItem("campusLocationService_visited");
    const lastCacheTime = localStorage.getItem("campusPresence_lastFreshData");
    const cacheAge = lastCacheTime
      ? Date.now() - parseInt(lastCacheTime)
      : Infinity;
    const isCacheStale = cacheAge > 12 * 60 * 60 * 1000; // 12 hours cache expiry
    const forceRefresh =
      sessionStorage.getItem("campusLocationService_requiresFreshData") ===
      "true";

    const isFreshDataRequired = isFirstVisit || isCacheStale || forceRefresh;

    // Set priority mode for presence dots
    if (isFreshDataRequired) {
      logManager.location.info(
        "Fresh data required - setting priority mode for presence dots"
      );
      sessionStorage.setItem("campusPresence_forceFreshData", "true");
      sessionStorage.setItem("campusPresence_priorityMode", "fresh_data");

      // Emit immediate loading event for presence dots
      document.dispatchEvent(
        new CustomEvent("campus-presence:loading", {
          detail: {
            forceFreshData: true,
            priority: "presence_dots",
            reason: isFirstVisit
              ? "first_visit"
              : isCacheStale
              ? "cache_stale"
              : "force_refresh",
          },
        })
      );
    } else {
      logManager.location.info("Using cached data for immediate presence display");
      sessionStorage.setItem("campusPresence_priorityMode", "cached");
    }

    // Initialize location services with enhanced background processing
    const initializationPromise = (async () => {
      if (typeof campusLocationService.handleInitialization === "function") {
        await campusLocationService.handleInitialization();
      } else if (typeof campusLocationService.initialize === "function") {
        await campusLocationService.initialize();
      }

      if (typeof locationPrivacyService.initialize === "function") {
        await locationPrivacyService.initialize();
      }
    })();

    // For fresh data scenarios, start immediate location fetch in parallel
    if (isFreshDataRequired) {
      logManager.location.info(
        "Starting priority location fetch for fresh presence data..."
      );

      // Start fresh location fetch without blocking the main initialization
      fetchFreshLocationForPresence().catch((error) => {
        logManager.location.warn(`Priority location fetch failed: ${error}`);
        // Continue with standard initialization
      });
    }

    // Wait for main initialization to complete
    await initializationPromise;

    logManager.system.init(
      "Background: Campus Presence services initialized successfully!"
    );

    // Update cache timestamp if fresh data was loaded
    if (isFreshDataRequired) {
      localStorage.setItem(
        "campusPresence_lastFreshData",
        Date.now().toString()
      );
    }

    // Clean up temporary flags and notify completion
    sessionStorage.removeItem("campusPresence_forceFreshData");
    sessionStorage.removeItem("campusPresence_priorityMode");

    document.dispatchEvent(
      new CustomEvent("campus-presence:ready", {
        detail: {
          freshDataLoaded: isFreshDataRequired,
          cacheUsed: !isFreshDataRequired,
          initializationTime: Date.now(),
        },
      })
    );
  } catch (error) {
    logManager.system.error(
      `Background: Failed to initialize Campus Presence services: ${error}`
    );

    // Clean up flags on error
    sessionStorage.removeItem("campusPresence_forceFreshData");
    sessionStorage.removeItem("campusPresence_priorityMode");

    // Emit error event for component handling
    document.dispatchEvent(
      new CustomEvent("campus-presence:error", {
        detail: { error: error.message, timestamp: Date.now() },
      })
    );

    // Continue - don't fail the app for location services
  }
}

/**
 * Fetch fresh location data specifically for presence dots with high priority
 * 🎯 Priority Mode: Ensures presence dots get latest coordinates quickly
 */
async function fetchFreshLocationForPresence() {
  console.log("🎯 Priority: Fetching fresh location data for presence dots...");

  try {
    // Use immediate location fetch for presence priority
    if (
      typeof campusLocationService.requestSingleLocationUpdate === "function"
    ) {
      // This method bypasses debouncing and gets fresh GPS immediately
      campusLocationService.requestSingleLocationUpdate();
      console.log(
        "✅ Priority: Fresh location request initiated for presence dots"
      );
    } else if (typeof campusLocationService.handleTriggerEvent === "function") {
      // Alternative method for immediate location update
      await campusLocationService.handleTriggerEvent("presence_priority");
      console.log("✅ Priority: Trigger event sent for fresh presence data");
    } else {
      console.warn("⚠️ Priority: No immediate location method available");
    }

    // Emit event that fresh data is being fetched
    document.dispatchEvent(
      new CustomEvent("campus-presence:fetching-fresh", {
        detail: {
          priority: true,
          method: "immediate_gps",
          timestamp: Date.now(),
        },
      })
    );
  } catch (error) {
    console.error(
      "❌ Priority: Failed to fetch fresh location for presence:",
      error
    );
    throw error;
  }
}

/**
 * Export Campus Presence services for debugging and testing
 * 🌍 Learning: Expose services for console debugging and external access
 */
export {
  campusLocationService,
  locationPrivacyService,
  initializeCampusPresenceInBackground,
  fetchFreshLocationForPresence,
};
