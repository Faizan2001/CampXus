// js/menu.js - Enhanced dark/light mode toggle with glassmorphism design

// Import DataManager for all user data operations
import { currentUser } from "../../store/userStore.js";
import { navigateTo } from "../../app.js";
import { authManager } from "../../services/auth/AuthService.js";
import { avatarManager } from "../../utils/avatar/avatarManager.js";
import { dataManager } from "../../services/data/DataService.js";

// Lightweight local debug gate for chatty logs
const __LOG_PROFILE__ = (
  typeof localStorage !== "undefined"
    ? localStorage.getItem("meetchuthere:logProfile") || ""
    : ""
).toLowerCase();
const __DBG__ =
  __LOG_PROFILE__ === "debug" ||
  __LOG_PROFILE__ === "all" ||
  __LOG_PROFILE__ === "info";
const dbg = (...args) => {
  if (__DBG__) {
    try {
      console.log(...args);
    } catch (_) {}
  }
};

// Cache for avatar rendering to prevent redundant updates
// Hoisted before any initialization to avoid temporal dead zone when referenced early
let cachedAvatarConfig = null;
let cachedAvatarHtml = null;

// Predeclare module-scoped vars used by notifications indicator before any init runs
let notificationsUnsub = null;
let friendReqUnsub = null;
let activeNotifUid = null; // Prevent re-initializing listeners on unrelated user state updates
// Unified indicator state (avoid reading DOM which caused stale badges)
let _notifDocsHasAlert = false; // any unseen notifications of target types
let _pendingFriendHasAlert = false; // any pending friend requests
// Notify indicator vars predeclared to avoid TDZ
let notifyRespUnsub = null;
let _notifyHasAlert = false;

// 🎯 CRITICAL FIX: Initialize immediately when module loads (for SPA compatibility)
// Don't wait for DOMContentLoaded in SPA mode - initialize when script loads
initializeMenuSystem();

function initializeMenuSystem() {
  // Apply saved theme immediately
  applyTheme();

  // Wait for DOM to be ready, then initialize interactive elements
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeInteractiveElements
    );
  } else {
    // DOM is already ready
    initializeInteractiveElements();
  }
}

function initializeInteractiveElements() {
  dbg("🎛️ Initializing menu system...");

  // Initialize dark mode toggle
  initializeDarkModeToggle();

  // Initialize navigation
  initializeNavigation();

  // Initialize user menu system
  initializeUserMenu();

  // Initialize theme system
  initializeThemeSystem();

  // Initialize mobile optimizations
  initializeMobileOptimizations();

  // Initialize notifications nav indicator (real-time)
  initializeNotificationsIndicator();

  // Initialize notify-friends button and indicator
  initializeNotifyFriendsEntry();

  // Set initial auth body class to avoid flash for authenticated users on load
  try {
    const hasFirebaseUser = !!authManager?.auth?.currentUser;
    document.body.classList.toggle("is-auth", hasFirebaseUser);
  } catch (_) {}

  dbg("✅ Menu system initialized successfully");
}

function applyTheme() {
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const hasSavedTheme = savedTheme === "dark" || savedTheme === "light";
  const themePreference = hasSavedTheme ? savedTheme : "dark";

  if (!hasSavedTheme) {
    localStorage.setItem("theme", themePreference);
  }

  dbg("🎨 Applying theme...", {
    savedTheme,
    prefersDark,
    appliedTheme: themePreference,
  });

  // Default to dark unless the user explicitly picked light mode
  const shouldUseDark = themePreference === "dark";

  if (shouldUseDark) {
    document.body.classList.add("dark-mode");
    dbg("🌙 Applied dark mode theme");
  } else {
    document.body.classList.remove("dark-mode");
    dbg("☀️ Applied light mode theme");
  }

  updateToggleIcon();
}

function initializeDarkModeToggle() {
  const darkModeToggle = document.getElementById("darkModeToggle");

  dbg("🌙 Initializing dark mode toggle...", { found: !!darkModeToggle });

  if (darkModeToggle) {
    // Update button text/icon based on current theme
    updateToggleIcon();

    darkModeToggle.addEventListener("click", () => {
      console.log("🌙 Dark mode toggle clicked");
      toggleDarkMode();
      // Animation removed for cleaner interaction
    });

    // Add tooltip
    darkModeToggle.setAttribute("title", "Toggle dark/light mode");

    dbg("✅ Dark mode toggle initialized successfully");
  } else {
    console.warn("⚠️ Dark mode toggle button not found in DOM");
  }
}

function toggleDarkMode() {
  const body = document.body;
  const isDarkMode = body.classList.toggle("dark-mode");

  // Save preference to localStorage
  localStorage.setItem("theme", isDarkMode ? "dark" : "light");

  // Update toggle icon
  updateToggleIcon();

  // Trigger custom event for other components to react
  window.dispatchEvent(
    new CustomEvent("themeChanged", {
      detail: { isDarkMode, theme: isDarkMode ? "dark" : "light" },
    })
  );

  // Add smooth transition class
  body.classList.add("theme-transition");
  setTimeout(() => {
    body.classList.remove("theme-transition");
  }, 300);
}

function updateToggleIcon() {
  const darkModeToggle = document.getElementById("darkModeToggle");
  const icon = darkModeToggle?.querySelector("i");
  const text = document.getElementById("darkModeText");

  if (icon && text) {
    if (document.body.classList.contains("dark-mode")) {
      icon.className = "fas fa-sun";
      text.textContent = "Light Mode";
      darkModeToggle.setAttribute("title", "Switch to light mode");
    } else {
      icon.className = "fas fa-moon";
      text.textContent = "Dark Mode";
      darkModeToggle.setAttribute("title", "Switch to dark mode");
    }
  }
}

function initializeThemeSystem() {
  // Listen for system theme changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  mediaQuery.addEventListener("change", (e) => {
    // Only auto-update if user hasn't manually set a preference
    if (!localStorage.getItem("theme")) {
      if (e.matches) {
        document.body.classList.add("dark-mode");
      } else {
        document.body.classList.remove("dark-mode");
      }
      updateToggleIcon();
    }
  });
}

function initializeNavigation() {
  // Add active state to current page
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href && href.includes(currentPage)) {
      link.classList.add("active");
    }

    // Add hover effects and click handling
    link.addEventListener("click", (e) => {
      // Ripple effect removed for cleaner interaction
    });
  });

  // Add click handling to navigation buttons (excluding theme toggle)
  const navButtons = document.querySelectorAll(
    ".nav-button:not(.theme-toggle)"
  );
  navButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      // Ripple effect removed for cleaner interaction
    });
  });

  // Profile button functionality (placeholder)
  const profileBtn = document.querySelector(".profile-btn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      // Placeholder for profile functionality
      console.log("Profile button clicked");
      // You can add profile menu or user settings here
    });
  }
}

/**
 * Initialize the user menu dropdown system
 * Handles user authentication state, dropdown interactions, and sign out functionality
 */
function initializeUserMenu() {
  dbg("🔧 Initializing user menu...");

  const userMenuTrigger = document.getElementById("userMenuTrigger");
  const userDropdown = document.getElementById("userDropdown");
  const userMenu = document.getElementById("userMenu");
  const signOutBtn = document.getElementById("signOutBtn");

  dbg("🔍 Menu elements found:", {
    userMenuTrigger: !!userMenuTrigger,
    userDropdown: !!userDropdown,
    userMenu: !!userMenu,
    signOutBtn: !!signOutBtn,
  });

  if (!userMenuTrigger || !userDropdown) {
    console.warn("⚠️ User menu elements not found");
    return;
  }

  // Toggle dropdown on click
  userMenuTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleUserDropdown();
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!userMenu?.contains(e.target)) {
      closeUserDropdown();
    }
  });

  // Handle keyboard navigation
  userMenuTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleUserDropdown();
    }
    if (e.key === "Escape") {
      closeUserDropdown();
    }
  });

  // Sign out button functionality
  if (signOutBtn) {
    signOutBtn.addEventListener("click", handleSignOut);
  }

  // Add event listeners to all dropdown items to close dropdown when clicked
  setupDropdownItemsCloseHandler();

  // Subscribe to the central currentUser store for all auth-related UI updates.
  // This is the new, single source of truth for the menu's auth state.
  if (currentUser && typeof currentUser.subscribe === "function") {
    dbg("📡 Subscribing to currentUser store for auth state changes...");
    currentUser.subscribe(handleAuthStateChange);
  } else {
    console.error("❌ currentUser store not available or invalid!");
  }

  // Set up profile completion listeners for immediate data refresh
  setupProfileCompletionListeners();

  // Set up avatar change listeners for immediate avatar refresh
  setupAvatarChangeListeners();

  dbg("✅ User menu initialization complete");
}

/**
 * Toggle the user dropdown menu
 */
function toggleUserDropdown() {
  const userDropdown = document.getElementById("userDropdown");
  const userMenuTrigger = document.getElementById("userMenuTrigger");

  if (!userDropdown || !userMenuTrigger) return;

  const isOpen = userDropdown.classList.contains("active");

  if (isOpen) {
    closeUserDropdown();
  } else {
    openUserDropdown();
  }
}

/**
 * Open the user dropdown menu with smart mobile positioning
 */
function openUserDropdown() {
  const userDropdown = document.getElementById("userDropdown");
  const userMenuTrigger = document.getElementById("userMenuTrigger");

  if (!userDropdown || !userMenuTrigger) return;

  // Smart positioning for mobile devices to prevent viewport overflow
  if (window.innerWidth <= 768) {
    const triggerRect = userMenuTrigger.getBoundingClientRect();
    const dropdownHeight = 280; // Approximate dropdown height
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    // Remove existing position classes
    userDropdown.classList.remove("position-above", "position-below");

    // Position above if not enough space below and more space above
    if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
      userDropdown.classList.add("position-above");
      userDropdown.style.bottom = `${viewportHeight - triggerRect.top + 8}px`;
      userDropdown.style.top = "auto";
    } else {
      // Default positioning below
      userDropdown.classList.add("position-below");
      userDropdown.style.top = `${triggerRect.bottom + 8}px`;
      userDropdown.style.bottom = "auto";
    }

    // Ensure horizontal positioning stays within viewport
    const spaceFromRight = window.innerWidth - triggerRect.right;
    if (spaceFromRight < 280) {
      userDropdown.style.right = "1rem";
      userDropdown.style.left = "auto";
    }
  }

  userDropdown.classList.add("active");
  userMenuTrigger.setAttribute("aria-expanded", "true");

  // Focus first menu item for accessibility
  const firstMenuItem = userDropdown.querySelector(".dropdown-item");
  if (firstMenuItem) {
    setTimeout(() => firstMenuItem.focus(), 100);
  }
}

/**
 * Close the user dropdown menu
 */
function closeUserDropdown() {
  const userDropdown = document.getElementById("userDropdown");
  const userMenuTrigger = document.getElementById("userMenuTrigger");

  if (!userDropdown || !userMenuTrigger) return;

  userDropdown.classList.remove("active");
  userMenuTrigger.setAttribute("aria-expanded", "false");
}

/**
 * Set up event listeners for all dropdown items to close dropdown when clicked
 * 📚 LEARNING: This improves UX by automatically closing the dropdown after user interaction
 */
function setupDropdownItemsCloseHandler() {
  const userDropdown = document.getElementById("userDropdown");

  if (!userDropdown) {
    console.warn("User dropdown not found for setting up close handlers");
    return;
  }

  // Find all clickable items in the dropdown
  const dropdownItems = userDropdown.querySelectorAll(".dropdown-item");

  dbg(
    `🎯 Setting up close handlers for ${dropdownItems.length} dropdown items`
  );

  dropdownItems.forEach((item, index) => {
    // Get the item type for logging
    const itemText = item.textContent?.trim() || `Item ${index + 1}`;
    const isButton = item.tagName.toLowerCase() === "button";
    const isLink = item.tagName.toLowerCase() === "a";

    dbg(
      `📋 Setting up handler for: "${itemText}" (${item.tagName.toLowerCase()})`
    );

    // Add click event listener to close dropdown
    item.addEventListener("click", (event) => {
      console.log(`🖱️ Dropdown item clicked: "${itemText}"`);

      // For navigation links, let them handle their own navigation first
      if (isLink && item.hasAttribute("data-spa-route")) {
        // Small delay to allow SPA navigation to start before closing dropdown
        setTimeout(() => {
          closeUserDropdown();
        }, 50);
      } else {
        // For buttons and regular links, close immediately
        closeUserDropdown();
      }

      // Add visual feedback for better UX
      item.style.transform = "scale(0.95)";
      setTimeout(() => {
        item.style.transform = "";
      }, 150);
    });

    // Also handle keyboard interactions (Enter and Space)
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        console.log(`⌨️ Dropdown item activated via keyboard: "${itemText}"`);

        // Prevent default space scrolling
        if (event.key === " ") {
          event.preventDefault();
        }

        // Close dropdown after keyboard activation
        setTimeout(() => {
          closeUserDropdown();
        }, 100);
      }
    });
  });

  dbg("✅ Dropdown close handlers setup completed");
}

/**
 * Handle user sign out
 */
async function handleSignOut() {
  try {
    console.log("🧹 Clearing cached user data...");
    // await dataManager.clearLocalCache(); // Optional: clear cache on sign-out

    // Call the central sign-out method
    if (authManager) {
      await authManager.handleSignOut();
      console.log("Successfully signed out");
      // Force clear user display info to guarantee UI reset
      if (
        window.userMenuUtils &&
        typeof window.userMenuUtils.clearUserDisplayInfo === "function"
      ) {
        window.userMenuUtils.clearUserDisplayInfo();
      }
      // Also force visibility update for user menu
      const userMenu = document.getElementById("userMenu");
      if (userMenu) userMenu.style.display = "none";

      // Redirect to home/schedule page after sign out using SPA router
      // Set a one-time flag to skip lastActive update during this navigation
      try {
        sessionStorage.setItem("skipLastActiveOnce", "true");
      } catch (_) {}
      navigateTo("home");
    } else {
      console.error("AuthManager not available.");
    }
  } catch (error) {
    console.error("Error during sign out:", error);
    // Optionally show a user-facing error message here
  }
}

/**
 * Handles changes from the currentUser store subscription.
 * This is the new central point for updating the menu's UI based on auth state.
 *
 * @param {object} state - The current user state from the store.
 * @param {boolean} state.isLoggedIn - Whether the user is logged in.
 * @param {object|null} state.profile - The user's profile data.
 */
function handleAuthStateChange({ isLoggedIn, profile }) {
  // Track previous state to prevent redundant updates (using static variable pattern)
  if (!handleAuthStateChange.previousState) {
    handleAuthStateChange.previousState = {
      isLoggedIn: null,
      hasProfile: null,
    };
  }

  const currentState = { isLoggedIn, hasProfile: !!profile };
  const previousState = handleAuthStateChange.previousState;

  // Skip update if state hasn't changed (performance optimization)
  if (
    previousState.isLoggedIn === currentState.isLoggedIn &&
    previousState.hasProfile === currentState.hasProfile
  ) {
    return;
  }

  dbg("🔄 Menu auth state change:", currentState);
  handleAuthStateChange.previousState = currentState;

  const userMenu = document.getElementById("userMenu");

  if (!userMenu) {
    console.warn("⚠️ Menu elements not found:", {
      userMenu: !!userMenu,
    });
    return;
  }

  if (isLoggedIn && profile) {
    // User is logged in and has a profile, show the user menu
    dbg("👤 Showing user menu");
    userMenu.style.display = "flex";
    updateUserDisplayInfo(profile);
  } else {
    // User is logged out or profile is not yet available
    dbg("🔒 Hiding user menu");
    userMenu.style.display = "none";
    clearUserDisplayInfo();
  }

  // Toggle a robust body class for auth-dependent styling (e.g., About button visibility)
  try {
    document.body.classList.toggle("is-auth", !!(isLoggedIn && profile));
  } catch (_) {}
}

/**
 * Update user display information in the dropdown header only
 * Fetches only firstName, email, and avatarConfig using dataManager
 * for performance and clarity.
 *
 * @param {string} userId - The user's UID
 */
async function updateUserDisplayInfo(userData) {
  const nameElement = document.getElementById("userDropdownName");
  const emailElement = document.getElementById("userDropdownEmail");

  if (!nameElement || !emailElement) {
    console.warn("User dropdown elements not found for updateUserDisplayInfo");
    return;
  }

  // Handle both profile object directly and userData.profile structure
  const profileData = userData?.profile || userData;

  if (profileData) {
    if (nameElement)
      nameElement.textContent =
        profileData.handle || profileData.firstName || "User";
    if (emailElement)
      emailElement.textContent = profileData.email || "No email";
    updateUserAvatarDisplays(userData);
  } else {
    clearUserDisplayInfo({ preventFlag: "updateUserDisplayInfo" });
  }
}

/**
 * Update user avatar displays in navigation and dropdown
 * Fetches and displays custom avatar from user's Firestore profile
 * @param {Object} userData - User data containing avatarConfig
 */
function updateUserAvatarDisplays(userData) {
  const avatarTrigger = document.getElementById("userAvatarTrigger");
  const avatarLarge = document.getElementById("userAvatarLarge");

  // Handle both direct profile data and nested userData structure
  const avatarConfig =
    userData?.avatarConfig || userData?.profile?.avatarConfig;
  const hasAvatarConfig = !!avatarConfig;

  // Skip rendering if avatar config hasn't changed (performance optimization)
  if (
    cachedAvatarConfig &&
    avatarConfig &&
    JSON.stringify(cachedAvatarConfig) === JSON.stringify(avatarConfig) &&
    cachedAvatarHtml
  ) {
    return;
  }

  // 🎯 FIX: Check for avatarManager and the correct function `generateAvatarUrl`
  if (
    hasAvatarConfig &&
    avatarManager &&
    typeof avatarManager.generateAvatarUrl === "function"
  ) {
    try {
      const avatarUrl = avatarManager.generateAvatarUrl(avatarConfig);
      const avatarHtml = `<img src="${avatarUrl}" alt="User Avatar" class="user-avatar-img">`;

      if (avatarTrigger) avatarTrigger.innerHTML = avatarHtml;
      if (avatarLarge) avatarLarge.innerHTML = avatarHtml;

      // Cache the rendered avatar for performance
      cachedAvatarConfig = avatarConfig;
      cachedAvatarHtml = avatarHtml;

      console.log("🎨 Custom avatar rendered successfully.");
    } catch (error) {
      console.error(
        "❌ Error generating avatar URL, falling back to default.",
        error
      );
      displayDefaultAvatarIcons(avatarTrigger, avatarLarge);
      cachedAvatarConfig = null;
      cachedAvatarHtml = null;
    }
  } else {
    // Fallback for no config or no avatar manager
    displayDefaultAvatarIcons(avatarTrigger, avatarLarge);
    cachedAvatarConfig = null;
    cachedAvatarHtml = null;
  }
}

/**
 * Displays the default FontAwesome user icon in avatar elements.
 * @param {HTMLElement} triggerElement - The small avatar element in the nav.
 * @param {HTMLElement} largeElement - The large avatar element in the dropdown.
 */
function displayDefaultAvatarIcons(triggerElement, largeElement) {
  const defaultIcon = '<i class="fas fa-user-circle"></i>';
  if (triggerElement) triggerElement.innerHTML = defaultIcon;
  if (largeElement) largeElement.innerHTML = defaultIcon;
}

/**
 * Clear user display information from the UI
 * 🐛 BUG FIX: Ensures no stale data remains when users sign out
 */
function clearUserDisplayInfo(options = {}) {
  // Handle the preventFlag parameter
  const { preventFlag } = options;

  // 🛡️ CRITICAL SAFEGUARD: Don't clear if we just completed profile setup
  if (window.preventUserDataClearing) {
    dbg("🛡️ Prevented clearing user data - profile completion in progress");
    return;
  }

  dbg("🧹 clearUserDisplayInfo called", {
    stack: new Error().stack?.split("\n").slice(1, 4).join("\n"),
    timestamp: new Date().toISOString(),
    preventFlag: preventFlag || window.preventUserDataClearing,
  });

  // Clear dropdown header user details
  const userDropdownName = document.getElementById("userDropdownName");
  const userDropdownEmail = document.getElementById("userDropdownEmail");

  if (userDropdownName) {
    dbg("🧹 Clearing user name:", userDropdownName.textContent);
    userDropdownName.textContent = "";
  }

  if (userDropdownEmail) {
    dbg("🧹 Clearing user email:", userDropdownEmail.textContent);
    userDropdownEmail.textContent = "";
  }

  // Clear avatar displays and reset to default icons
  const userAvatarTrigger = document.getElementById("userAvatarTrigger");
  const userAvatarLarge = document.getElementById("userAvatarLarge");

  displayDefaultAvatarIcons(userAvatarTrigger, userAvatarLarge);

  // Clear user menu trigger tooltip
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  if (userMenuTrigger) {
    userMenuTrigger.setAttribute("title", "User menu");
  }

  dbg("🧹 Cleared all user display information");
}

/**
 * Set up profile completion listeners
 * 🎯 LEARNING: Listen for when the user completes profile setup to refresh data immediately
 */
function setupProfileCompletionListeners() {
  dbg("🎧 Setting up profile completion listeners...");

  // Listen for profile setup completion
  document.addEventListener("profile:setup:complete", (event) => {
    dbg("🎉 Profile setup completed, refreshing user data immediately...");

    const userData = event.detail.userData;
    if (userData) {
      // 🎯 CRITICAL: Create flat structure for menu system
      const menuUserData = {
        uid: userData.uid,
        name: `${userData.profile.firstName} ${userData.profile.lastName}`,
        email: userData.profile.email,
        avatarConfig: userData.avatarConfig,
        profileSetupComplete: userData.systemInfo.profileSetupComplete,
      };

      // Force immediate update of user data in menu via currentUser store
      // The currentUser subscription will automatically update the menu
    }
  });

  // Listen for profile setup skip (also update data)
  document.addEventListener("profile:setup:skip", (event) => {
    console.log("⏭️ Profile setup skipped, refreshing user data...");

    const userData = event.detail.userData;
    if (userData) {
      // 🎯 CRITICAL: Create flat structure for menu system
      const menuUserData = {
        uid: userData.uid,
        name:
          userData.profile?.firstName && userData.profile?.lastName
            ? `${userData.profile.firstName} ${userData.profile.lastName}`
            : userData.profile?.email?.split("@")[0] || "User",
        email: userData.profile.email,
        avatarConfig: userData.avatarConfig,
        profileSetupComplete: userData.systemInfo.profileSetupComplete,
      };

      // The currentUser subscription will automatically update the menu
    }
  });
}

/**
 * Set up avatar change listeners to force immediate avatar refresh
 * 🎯 FIXES: Stale avatar data in menu when user changes avatar in ProfileSetup
 */
function setupAvatarChangeListeners() {
  dbg("🎧 Setting up avatar change listeners...");

  // Listen for avatar changes from ProfileSetup
  document.addEventListener("avatar:changed", (event) => {
    console.log(
      "🎨 Avatar changed event received, clearing cache and refreshing..."
    );

    // Clear avatar cache to force refresh
    cachedAvatarConfig = null;
    cachedAvatarHtml = null;

    // Get updated user data from the event or currentUser
    const updatedUserData = event.detail?.userData || currentUser?.profile;

    if (updatedUserData) {
      // Force immediate avatar update
      updateUserAvatarDisplays(updatedUserData);
      console.log("✅ Avatar displays refreshed after change");
    } else {
      console.warn("⚠️ No updated user data available for avatar refresh");
    }
  });

  // Also listen for currentUser store changes and force avatar refresh
  // This ensures we catch any avatar updates regardless of how they occur
  let lastAvatarConfigString = null;

  if (currentUser && typeof currentUser.subscribe === "function") {
    currentUser.subscribe(({ profile }) => {
      if (profile?.avatarConfig) {
        const currentAvatarConfigString = JSON.stringify(profile.avatarConfig);

        // If avatar config actually changed, clear cache and refresh
        if (
          lastAvatarConfigString &&
          lastAvatarConfigString !== currentAvatarConfigString
        ) {
          console.log(
            "🎨 Avatar config change detected in currentUser store, refreshing..."
          );
          cachedAvatarConfig = null;
          cachedAvatarHtml = null;
          updateUserAvatarDisplays(profile);
        }

        lastAvatarConfigString = currentAvatarConfigString;
      }
    });
  }

  dbg("✅ Avatar change listeners set up successfully");
}

/**
 * Force refresh the avatar cache and update displays
 * 🎯 PUBLIC API: Can be called from other modules to force avatar refresh
 * @param {Object} userData - Optional updated user data
 */
export function forceAvatarRefresh(userData = null) {
  console.log("🔄 Force refreshing avatar cache and displays...");

  // Clear the cache
  cachedAvatarConfig = null;
  cachedAvatarHtml = null;

  // Get user data from parameter or currentUser store
  const userDataToUse = userData || currentUser?.profile;

  if (userDataToUse) {
    updateUserAvatarDisplays(userDataToUse);
    console.log("✅ Avatar force refresh completed");
  } else {
    console.warn("⚠️ No user data available for avatar force refresh");
  }
}

/**
 * Initialize mobile-specific optimizations
 * Handles orientation changes, viewport resizing, and touch interactions
 */
function initializeMobileOptimizations() {
  // Handle orientation changes and window resizing
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Close any open dropdowns on orientation change
      const userDropdown = document.getElementById("userDropdown");
      if (userDropdown && userDropdown.classList.contains("active")) {
        closeUserDropdown();
      }
      // Avoid forcing body height to 100vh (causes iOS zoom/glitches)
    }, 250);
  });

  // Prevent zoom on double-tap for better UX
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = new Date().getTime();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    false
  );

  // Improve touch feedback for all interactive elements
  const touchElements = document.querySelectorAll(
    ".nav-button, .theme-toggle, .user-menu-trigger, .dropdown-item"
  );

  touchElements.forEach((element) => {
    // Add touch start class for immediate feedback
    element.addEventListener(
      "touchstart",
      () => {
        element.classList.add("touch-active");
      },
      { passive: true }
    );

    // Remove touch class after delay
    element.addEventListener(
      "touchend",
      () => {
        setTimeout(() => {
          element.classList.remove("touch-active");
        }, 150);
      },
      { passive: true }
    );
  });

  // Enhanced keyboard navigation for accessibility
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Close any open dropdowns
      closeUserDropdown();
    }
  });

  // iOS Safari viewport fix: expose --vh variable without intrusive layout changes
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    const updateViewport = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`
      );
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", () => {
      setTimeout(updateViewport, 120);
    });
  }

  // Initialize mobile bottom navigation
  initializeMobileBottomNav();
}

/**
 * Initialize mobile bottom navigation functionality
 */
function initializeMobileBottomNav() {
  if (window.__mobileNavInitialized) {
    return; // Prevent duplicate initialization
  }
  const mobileProfileTrigger = document.getElementById("mobileProfileTrigger");
  const mobileUserAvatar = document.getElementById("mobileUserAvatar");
  const sheet = document.getElementById("mobileProfileSheet");
  const scrim = document.getElementById("mobileProfileScrim");
  const sheetDarkToggle = document.getElementById("mobileSheetDarkModeToggle");
  const sheetSignOut = document.getElementById("mobileSheetSignOutBtn");
  const sheetAvatar = document.getElementById("mobileSheetAvatar");
  const sheetNameEl = document.getElementById("mobileSheetName");
  const sheetEmailEl = document.getElementById("mobileSheetEmail");

  if (!mobileProfileTrigger) {
    dbg("📱 Mobile profile trigger not found, skipping mobile nav setup");
    return;
  }

  dbg("📱 Setting up mobile bottom navigation...");

  // Bottom sheet helpers (mobile)
  function openMobileSheet() {
    if (!sheet || !scrim) return;
    sheet.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(() => {
      sheet.setAttribute("data-open", "");
      scrim.setAttribute("data-open", "");
      mobileProfileTrigger.setAttribute("aria-expanded", "true");
      trapSheetFocus(sheet);
    });
  }
  function closeMobileSheet() {
    if (!sheet || !scrim) return;
    sheet.removeAttribute("data-open");
    scrim.removeAttribute("data-open");
    mobileProfileTrigger.setAttribute("aria-expanded", "false");
    const done = () => {
      sheet.hidden = true;
      scrim.hidden = true;
      sheet.removeEventListener("transitionend", done);
    };
    sheet.addEventListener("transitionend", done);
  }
  function toggleMobileSheet() {
    sheet && (sheet.hidden ? openMobileSheet() : closeMobileSheet());
  }
  function trapSheetFocus(root) {
    const focusables = root.querySelectorAll(
      'a,button,[tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    root.onkeydown = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
  }
  // Swipe to dismiss
  let startY = null;
  if (sheet) {
    sheet.addEventListener("pointerdown", (e) => {
      startY = e.clientY;
    });
    sheet.addEventListener("pointerup", (e) => {
      if (startY !== null && e.clientY - startY > 60) closeMobileSheet();
      startY = null;
    });
  }
  if (scrim) scrim.addEventListener("click", closeMobileSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet && !sheet.hidden) closeMobileSheet();
  });
  // Trigger click
  mobileProfileTrigger.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      e.preventDefault();
      e.stopPropagation();
      toggleMobileSheet();
    } else {
      // desktop fallback to existing dropdown
      const userDropdown = document.getElementById("userDropdown");
      if (userDropdown && !userDropdown.classList.contains("active"))
        openUserDropdown();
      else closeUserDropdown();
    }
  });
  // Dark mode toggle inside sheet
  if (sheetDarkToggle) {
    sheetDarkToggle.addEventListener("click", () => {
      toggleDarkMode();
      updateMobileSheetThemeState();
    });
  }
  if (sheetSignOut) {
    sheetSignOut.addEventListener("click", () => {
      handleSignOut();
      closeMobileSheet();
    });
  }
  // Populate sheet user info (same as dropdown: handle as name, email as subline)
  if (currentUser && typeof currentUser.subscribe === "function") {
    currentUser.subscribe(({ isLoggedIn, profile }) => {
      if (isLoggedIn && profile) {
        // Use centralized display info from user store (hydrated/cached)
        const info =
          typeof currentUser.getDisplayInfo === "function"
            ? currentUser.getDisplayInfo()
            : {
                handle: profile?.profile?.handle || profile?.handle || "user",
                email:
                  profile?.profile?.email ||
                  profile?.email ||
                  (currentUser?._user ? currentUser._user.email : ""),
                avatarConfig:
                  profile?.avatarConfig ||
                  profile?.profile?.avatarConfig ||
                  null,
              };

        if (sheetNameEl) {
          sheetNameEl.textContent = info.handle || "user";
        }
        if (sheetEmailEl) {
          sheetEmailEl.textContent = info.email || "";
        }
        if (sheetAvatar && avatarManager) {
          try {
            const avatarCfg = info.avatarConfig;
            if (
              avatarCfg &&
              typeof avatarManager.generateAvatarUrl === "function"
            ) {
              const url = avatarManager.generateAvatarUrl(avatarCfg);
              sheetAvatar.innerHTML = `<img src="${url}" alt="User Avatar">`;
            } else {
              sheetAvatar.innerHTML = '<i class="fas fa-user-circle"></i>';
            }
          } catch {
            sheetAvatar.innerHTML = '<i class="fas fa-user-circle"></i>';
          }
        }
      }
    });
  }

  // Sync mobile user avatar with main navigation
  if (currentUser && typeof currentUser.subscribe === "function") {
    currentUser.subscribe(({ isLoggedIn, profile }) => {
      if (isLoggedIn && profile && mobileUserAvatar) {
        updateMobileUserAvatar(profile);
      }
    });
  }

  // Active state + notification badge
  setupMobileNavActiveStates();

  dbg("✅ Mobile bottom navigation initialized");
}

function updateMobileSheetThemeState() {
  const sheetDarkToggle = document.getElementById("mobileSheetDarkModeToggle");
  const labelEl = document.getElementById("mobileSheetDarkModeText");
  if (!sheetDarkToggle || !labelEl) return;
  const isDark = document.body.classList.contains("dark-mode");
  sheetDarkToggle.setAttribute("aria-pressed", String(isDark));
  labelEl.textContent = isDark ? "Light Mode" : "Dark Mode";
  const icon = sheetDarkToggle.querySelector("i");
  if (icon) icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
}

// Listen to global theme changes to keep sheet button in sync
window.addEventListener("themeChanged", updateMobileSheetThemeState);
document.addEventListener("DOMContentLoaded", updateMobileSheetThemeState);

/**
 * Update mobile user avatar to match main navigation
 */
function updateMobileUserAvatar(userData) {
  const mobileUserAvatar = document.getElementById("mobileUserAvatar");
  if (!mobileUserAvatar) return;

  const avatarConfig =
    userData?.avatarConfig || userData?.profile?.avatarConfig;

  if (
    avatarConfig &&
    avatarManager &&
    typeof avatarManager.generateAvatarUrl === "function"
  ) {
    try {
      const avatarUrl = avatarManager.generateAvatarUrl(avatarConfig);
      mobileUserAvatar.innerHTML = `<img src="${avatarUrl}" alt="User Avatar" class="user-avatar-img" style="width: 24px; height: 24px; border-radius: 50%;">`;
    } catch (error) {
      mobileUserAvatar.innerHTML = '<i class="fas fa-user-circle"></i>';
    }
  } else {
    mobileUserAvatar.innerHTML = '<i class="fas fa-user-circle"></i>';
  }
}

/**
 * Set up mobile navigation active state tracking
 * Updates active states when pages change
 */
function setupMobileNavActiveStates() {
  // Update mobile nav active states on page change
  function updateMobileNavActiveStates(currentRoute) {
    const mobileNavItems = document.querySelectorAll(
      ".mobile-nav-item[data-spa-route]"
    );

    mobileNavItems.forEach((item) => {
      const route = item.getAttribute("data-spa-route");
      if (route === currentRoute) {
        item.classList.add("active");
        item.setAttribute("data-current", "true");
      } else {
        item.classList.remove("active");
        item.removeAttribute("data-current");
      }
    });
  }

  // Listen for SPA navigation events
  document.addEventListener("spa:route:changed", (event) => {
    const currentRoute = event.detail?.route || "home";
    updateMobileNavActiveStates(currentRoute);
    // Update aria-current attributes
    updateAriaCurrent(currentRoute);
    // Close dropdown on navigation
    const trigger = document.getElementById("mobileProfileTrigger");
    if (trigger) {
      trigger.classList.remove("active");
      trigger.setAttribute("aria-expanded", "false");
    }
    const userDropdown = document.getElementById("userDropdown");
    if (userDropdown && userDropdown.classList.contains("active")) {
      closeUserDropdown();
    }
    const sheet = document.getElementById("mobileProfileSheet");
    if (sheet && !sheet.hidden) {
      // instantly hide without animation to avoid flicker during navigation
      sheet.removeAttribute("data-open");
      sheet.hidden = true;
      const scrim = document.getElementById("mobileProfileScrim");
      if (scrim) {
        scrim.removeAttribute("data-open");
        scrim.hidden = true;
      }
    }
  });

  // Also listen for hash changes as fallback
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.slice(1);
    const route = hash || "home";
    updateMobileNavActiveStates(route);
  });

  // Set initial active state based on current page
  const initialRoute = window.location.hash.slice(1) || "home";
  updateMobileNavActiveStates(initialRoute);
  updateAriaCurrent(initialRoute);

  dbg("📱 Mobile nav active states tracking initialized");
}

// Helper to update aria-current
function updateAriaCurrent(route) {
  const items = document.querySelectorAll(
    ".mobile-bottom-nav .mobile-nav-item[data-spa-route]"
  );
  items.forEach((item) => {
    const r = item.getAttribute("data-spa-route");
    item.setAttribute("aria-current", r === route ? "page" : "false");
  });
}

// Add CSS class for touch feedback
const style = document.createElement("style");
style.textContent = `
  .touch-active {
    transform: scale(0.95) !important;
    transition: transform 0.1s ease !important;
  }
  
  @media (max-width: 768px) {
    .touch-active {
      background: var(--surface-hover) !important;
    }
  }
`;
document.head.appendChild(style);

// =========================
// Notifications Nav Indicator
// =========================
// (vars predeclared at top to avoid TDZ errors)

function initializeNotificationsIndicator() {
  // Start once DOM is ready and user state is available
  try {
    if (currentUser && typeof currentUser.subscribe === "function") {
      currentUser.subscribe(() => {
        const uid = currentUser.uid;
        // Only (re)setup listeners when UID changes (login/logout),
        // not on every schedule/profile state update to avoid duplicates.
        if (uid === activeNotifUid) {
          return;
        }

        // Update active UID and (re)initialize listeners
        activeNotifUid = uid || null;
        if (!uid) {
          teardownNotificationsIndicator();
          toggleNotificationsDot(false);
          return;
        }
        setupNotificationsIndicatorListener(uid);
      });
    }
  } catch (e) {
    console.warn("⚠️ Failed to initialize notifications indicator:", e);
  }
}

function setupNotificationsIndicatorListener(userId) {
  try {
    // Cleanup previous
    teardownNotificationsIndicator();
    // Attach new realtime listener
    notificationsUnsub = dataManager.setupNotificationsListener(
      userId,
      (notifications) => {
        // Show dot if there are any unseen friend/location/availability pings
        _notifDocsHasAlert = notifications.some((n) => {
          // Check for both timestamp fields AND status field (backwards compatibility)
          const isUnseen =
            !n.readAt &&
            !n.dismissedAt &&
            n.status !== "read" &&
            n.status !== "dismissed";
          const isTargetType =
            n.type === "friend_request" ||
            n.type === "location_share_request" ||
            n.type === "availability_ping";
          return isUnseen && isTargetType;
        });
        recomputeNotificationsDot();
      }
    );

    // Also listen to pending friend requests directly
    friendReqUnsub = dataManager.listenToPendingFriendRequests(
      userId,
      (requests) => {
        _pendingFriendHasAlert = Array.isArray(requests) && requests.length > 0;
        recomputeNotificationsDot();
      }
    );
  } catch (e) {
    console.warn("⚠️ Could not set notifications listener:", e);
  }
}

function teardownNotificationsIndicator() {
  if (notificationsUnsub && typeof notificationsUnsub === "function") {
    try {
      notificationsUnsub();
    } catch (_) {}
  }
  notificationsUnsub = null;
  if (friendReqUnsub && typeof friendReqUnsub === "function") {
    try {
      friendReqUnsub();
    } catch (_) {}
  }
  friendReqUnsub = null;
}

function toggleNotificationsDot(show) {
  const link = document.querySelector(
    '.nav-link[data-spa-route="notifications"]'
  );
  if (link) {
    link.classList.toggle("has-alert", !!show);
  }
  // Update mobile badge (same behavior and style on both form-factors)
  const mobileBadge = document.querySelector(
    '.mobile-bottom-nav .mobile-nav-item[data-spa-route="notifications"] .mobile-nav-badge'
  );
  if (mobileBadge) {
    mobileBadge.style.display = show ? "block" : "none";
    // For dot style, we don't show numbers; clear any text if present
    if (!show) mobileBadge.textContent = "";
  }
}

function recomputeNotificationsDot() {
  toggleNotificationsDot(_notifDocsHasAlert || _pendingFriendHasAlert);
}

// =========================
// Notify Friends Entry + Indicator
// =========================

function initializeNotifyFriendsEntry() {
  try {
    const btn = document.getElementById("notifyFriendsBtn");
    if (btn) {
      // Make an immediate best-effort decision so the button isn't invisible until the
      // auth subscription fires (affects iOS PWA on cold start).
      try {
        if (typeof currentUser?.isLoggedIn === "function") {
          btn.style.display = currentUser.isLoggedIn()
            ? "inline-flex"
            : "none";
        }
      } catch (_) {}

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if overlay is already open
        const existingOverlay = document.querySelector(".notify-overlay");
        if (existingOverlay) {
          // Close the overlay if it's already open
          try {
            const mod = await import("../../pages/NotifyFriendsPage.js");
            if (
              mod.notifyFriendsPage &&
              typeof mod.notifyFriendsPage.closeOverlay === "function"
            ) {
              mod.notifyFriendsPage.closeOverlay();
            }
          } catch (err) {
            console.warn("⚠️ Failed to close Notify overlay:", err);
          }
          return;
        }

        // Open the overlay if it's not open
        try {
          const mod = await import("../../pages/NotifyFriendsPage.js");
          if (typeof mod.openNotifyOverlay === "function") {
            await mod.openNotifyOverlay();
            try {
              sessionStorage.setItem("notify:lastClearTs", String(Date.now()));
            } catch (_) {}
            setNotifyDot(false);
          }
        } catch (err) {
          console.warn("⚠️ Failed to open Notify overlay:", err);
        }
      });
    }

    // Show/hide by auth state
    if (currentUser && typeof currentUser.subscribe === "function") {
      currentUser.subscribe(({ isLoggedIn }) => {
        const b = document.getElementById("notifyFriendsBtn");
        if (!b) return;
        b.style.display = isLoggedIn ? "inline-flex" : "none";
        if (!isLoggedIn) setNotifyDot(false);
      });
    }

    // Setup indicator
    setupNotifyFriendsIndicator();

    // Clear dot when overlay opens via custom event
    document.addEventListener("notify:overlay:open", () => {
      try {
        sessionStorage.setItem("notify:lastClearTs", String(Date.now()));
      } catch (_) {}
      setNotifyDot(false);
    });
  } catch (e) {
    console.warn("⚠️ Failed to initialize Notify Friends entry:", e);
  }
}

function setupNotifyFriendsIndicator() {
  try {
    // Cleanup previous
    if (notifyRespUnsub) {
      try {
        notifyRespUnsub();
      } catch (_) {}
      notifyRespUnsub = null;
    }

    // Listen for responded availability pings sent BY me in the last 30 minutes
    if (currentUser && typeof currentUser.subscribe === "function") {
      currentUser.subscribe(({ isLoggedIn }) => {
        if (!isLoggedIn || !currentUser.uid) {
          if (notifyRespUnsub) {
            try {
              notifyRespUnsub();
            } catch (_) {}
            notifyRespUnsub = null;
          }
          setNotifyDot(false);
          return;
        }
        const uid = currentUser.uid;
        
        // 🎯 FIX: Initialize lastClearTs on first login to prevent showing old notifications as "new"
        try {
          if (!sessionStorage.getItem("notify:lastClearTs")) {
            sessionStorage.setItem("notify:lastClearTs", String(Date.now()));
          }
        } catch (_) {}
        
        // Use DataService to set up a lightweight listener
        try {
          if (notifyRespUnsub) {
            try {
              notifyRespUnsub();
            } catch (_) {}
          }
          notifyRespUnsub = dataManager.setupAvailabilityResponsesListener(
            uid,
            (hasUnseen) => {
              _notifyHasAlert = !!hasUnseen;
              setNotifyDot(_notifyHasAlert);
            }
          );
        } catch (err) {
          console.warn("⚠️ Could not start Notify indicator listener", err);
        }
      });
    }
  } catch (e) {
    console.warn("⚠️ Failed to set notify indicator:", e);
  }
}

function setNotifyDot(show) {
  const btn = document.getElementById("notifyFriendsBtn");
  if (!btn) return;
  const dot = btn.querySelector(".nav-dot");
  if (!dot) return;
  dot.style.display = show ? "inline-block" : "none";
}
