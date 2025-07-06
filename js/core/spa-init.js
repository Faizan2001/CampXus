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

import SPARouter from "./spa-router.js";

/**
 * Initialize the SPA when DOM is ready
 * 🎯 Learning: We wait for the DOM to load before setting up our app
 */
async function initializeSPA() {
    console.groupCollapsed("🚀 CampXus SPA Initialization");
    console.log("Document ready state:", document.readyState);

    // Double-check that essential DOM elements exist
    const mainContent = document.querySelector(".main-content");
    const topNav = document.querySelector(".top-nav");
    
    console.log("🔍 Essential DOM elements check:");
    console.log("  - .main-content:", mainContent ? "✅ Found" : "❌ Missing");
    console.log("  - .top-nav:", topNav ? "✅ Found" : "❌ Missing");
    
    if (!mainContent) {
      console.error("CRITICAL: .main-content not found. Cannot initialize SPA.");
      console.groupEnd();
      return;
    }

    // 🎯 LEARNING: This is the critical fix for our race condition.
    // We're telling our app to PAUSE and wait until the AuthManager
    // confirms the user's login status from Firebase.
    // The `authReady` is a Promise we created in AuthManager that resolves
    // only after the initial `onAuthStateChanged` event has fired.
    if (window.authManager?.authReady) {
      console.log("⏳ Waiting for authentication to be ready...");
      
      try {
        // Add a timeout to prevent waiting forever
        const authTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout after 3 seconds')), 3000)
        );
        
        await Promise.race([window.authManager.authReady, authTimeout]);
        console.log("✅ Authentication ready!");
      } catch (error) {
        console.warn("⚠️ Authentication timeout or error, proceeding anyway:", error.message);
        // Continue initialization even if auth times out
      }
    } else {
      console.warn(
        "AuthManager or authReady promise not found. Proceeding without auth check."
      );
    }

    // Now that we're sure about the auth status, we can initialize the router.
    console.log("🔧 Creating SPA Router instance...");
    
    // Check if main-content container exists
    const mainContentContainer = document.querySelector(".main-content");
    if (!mainContentContainer) {
      console.error("CRITICAL: .main-content container not found! SPA Router cannot work.");
      console.groupEnd();
      return;
    }
    console.log("✅ Main content container found:", mainContentContainer);
    
    window.spaRouter = new SPARouter();

    // 🎯 FIXED: Manually trigger the initial page load now that auth is ready.
    window.spaRouter.loadInitialPage();

    // ── BUG FIX ──
    // Register the profile setup completion listeners so that
    // `profile:setup:complete` and `profile:setup:skip` events
    // actually drive menu refresh and navigation.
    setupProfileCompletionFlow();

    // Listen for SPA navigation events
    setupSPAEventListeners();

    console.groupEnd();
  }

  // Initialize when DOM is ready, or immediately if already ready
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initializeSPA);
  } else {
    // DOM is already ready, execute immediately
    console.log("🏃‍♂️ DOM already ready, initializing SPA immediately...");
    initializeSPA();
  }

/**
 * Handle profile setup completion flow
 * 🎯 Learning: In SPAs, we redirect using JavaScript instead of page reloads
 */
function setupProfileCompletionFlow() {
  // Listen for profile setup completion
  document.addEventListener("profile:setup:complete", async (event) => {
    console.log("📝 Profile setup completed, refreshing user data and redirecting...");

    // 🎯 CRITICAL FIX: Update currentUser store with fresh profile data
    const userData = event.detail.userData;
    if (userData && window.currentUser) {
      console.log("🔄 Updating currentUser store with fresh profile data...");
      
      // Update the currentUser store with the fresh profile data
      window.currentUser.setProfile(userData);
      
      // Also ensure the user object is set if it wasn't already
      if (!window.currentUser.user && window.authManager?.getCurrentUser()) {
        window.currentUser.setUser(window.authManager.getCurrentUser());
      }
      
      console.log("✅ currentUser store updated with fresh profile data");
    }

    // Show success message briefly, then redirect
    setTimeout(() => {
      if (window.spaRouter) {
        // Set completion flag for the SPA router to handle
        sessionStorage.setItem("profileJustCompleted", "true");
        window.spaRouter.navigateTo("home");
      }
    }, 2000); // 2 second delay to show success message
  });

  // Listen for profile setup skip
  document.addEventListener("profile:setup:skip", async (event) => {
    console.log("⏭️ Profile setup skipped, updating user data and redirecting...");

    // 🎯 CRITICAL FIX: Update currentUser store for skip case too
    const userData = event.detail.userData;
    if (userData && window.currentUser) {
      console.log("🔄 Updating currentUser store for skipped profile...");
      
      // Update the currentUser store with the minimal profile data
      window.currentUser.setProfile(userData);
      
      // Also ensure the user object is set if it wasn't already
      if (!window.currentUser.user && window.authManager?.getCurrentUser()) {
        window.currentUser.setUser(window.authManager.getCurrentUser());
      }
      
      console.log("✅ currentUser store updated for skipped profile");
    }

    if (window.spaRouter) {
      window.spaRouter.navigateTo("home");
    }
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
 * Global SPA navigation helper function
 * 🎯 Learning: Provide a simple way for other scripts to navigate
 */
window.navigateTo = function (route) {
  if (window.spaRouter) {
    window.spaRouter.navigateTo(route);
  } else {
    console.error("SPA Router not initialized yet");
  }
};

/**
 * Export for use in other modules
 * 🎯 Learning: Modern JavaScript modules can export functions
 */
export { setupProfileCompletionFlow, updatePageTitle };
