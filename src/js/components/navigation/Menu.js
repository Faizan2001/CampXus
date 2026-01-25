// js/menu.js - Enhanced dark/light mode toggle with glassmorphism design

import { currentUser } from "../../store/userStore.js";
import { navigateTo } from "../../app.js";
import { authManager } from "../../services/auth/AuthService.js";
import { getAvatarUrl } from "../../utils/avatar/avatarUtils.js";

// Lazy DataService loader so Firestore bundle is only pulled in when needed
let menuDataManagerPromise = null;
function getMenuDataManager() {
  if (!menuDataManagerPromise) {
    menuDataManagerPromise = (async () => {
      try {
        const mod = await import("../../services/data/DataService.js");
        return mod.dataManager;
      } catch (error) {
        console.warn("Menu: Failed to load DataService:", error);
        return null;
      }
    })();
  }
  return menuDataManagerPromise;
}

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
    } catch (error) { dbg("debug logging failed", error?.message); }
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

// Messages (class spaces) unread indicator
let messagesSpacesUnsub = null;
let _messagesHasUnread = false;
let _messagesSpacesCache = []; // Cache for recalculation on view
let _messagesUserId = null; // Track which user's spaces are cached
let _activeRoute = null; // Used to suppress nav dots on active pages

// Clubs notification indicator
let clubsNotifUnsub = null;
let activeClubsNotifUid = null;
let _clubsHasAlert = false; // any unread club notifications

// C6: store handler references / prevent duplicate global listeners
let _menuDocClickCloseDropdown = null;
let _menuProfileSetupCompleteHandler = null;
let _menuProfileSetupSkipHandler = null;
let _menuAvatarChangedHandler = null;
let _menuAuthStateUnsub = null;
let _menuAvatarWatchUnsub = null;
let _menuMobileResizeHandler = null;
let _menuMobileTouchEndHandler = null;
let _menuMobileEscapeKeyHandler = null;
let _menuIOSViewportResizeHandler = null;
let _menuIOSViewportOrientationHandler = null;
let _menuMobileNavRouteChangedHandler = null;
let _menuMobileNavHashChangeHandler = null;
let _menuMobileSheetEscapeHandler = null;
let _menuMessagesRouteChangedHandler = null;
let __mobileOptimizationsInitialized = false;

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

  // Initialize clubs nav indicator (real-time club notifications)
  initializeClubsIndicator();

  // Initialize Messages button and indicator (class spaces entry)
  initializeMessagesEntry();

  // Set initial auth body class to avoid flash for authenticated users on load
  try {
    const hasFirebaseUser = !!authManager?.auth?.currentUser;
    document.body.classList.toggle("is-auth", hasFirebaseUser);
  } catch (error) { dbg("setting initial auth body class failed", error?.message); }

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

  // Mark theme readiness so CSS can safely map variables for light mode
  document.body.classList.add("theme-ready");

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

  // Immediately sync the status bar/theme-color to avoid inverted header on iOS 18 PWAs
  try {
    // Update the first theme-color meta without media (fallback) if present,
    // otherwise update all theme-color tags so Android/iOS reflect app toggle.
    const metas = Array.from(
      document.querySelectorAll('meta[name="theme-color"]')
    );
    const darkColor = "#0d021a";
    const lightColor = "#ffffff";
    const color = isDarkMode ? darkColor : lightColor;
    metas.forEach((m) => m.setAttribute("content", color));
  } catch (error) { dbg("updating theme-color meta tags failed", error?.message); }

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
  if (userMenuTrigger.getAttribute("data-user-menu-bound") !== "true") {
    const handleUserMenuTriggerClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleUserDropdown();
    };
    userMenuTrigger.addEventListener("click", handleUserMenuTriggerClick);
    userMenuTrigger.setAttribute("data-user-menu-bound", "true");
  }

  // Close dropdown when clicking outside
  if (!_menuDocClickCloseDropdown) {
    _menuDocClickCloseDropdown = (e) => {
      const menu = document.getElementById("userMenu");
      if (menu && !menu.contains(e.target)) {
        closeUserDropdown();
      }
    };
    document.addEventListener("click", _menuDocClickCloseDropdown);
  }

  // Handle keyboard navigation
  if (userMenuTrigger.getAttribute("data-user-menu-keybound") !== "true") {
    const handleUserMenuTriggerKeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleUserDropdown();
      }
      if (e.key === "Escape") {
        closeUserDropdown();
      }
    };
    userMenuTrigger.addEventListener("keydown", handleUserMenuTriggerKeydown);
    userMenuTrigger.setAttribute("data-user-menu-keybound", "true");
  }

  // Sign out button functionality
  if (signOutBtn) {
    if (signOutBtn.getAttribute("data-signout-bound") !== "true") {
      signOutBtn.addEventListener("click", handleSignOut);
      signOutBtn.setAttribute("data-signout-bound", "true");
    }
  }

  // Add event listeners to all dropdown items to close dropdown when clicked
  setupDropdownItemsCloseHandler();

  // Subscribe to the central currentUser store for all auth-related UI updates.
  // This is the new, single source of truth for the menu's auth state.
  if (currentUser && typeof currentUser.subscribe === "function") {
    dbg("📡 Subscribing to currentUser store for auth state changes...");
    if (!_menuAuthStateUnsub) {
      _menuAuthStateUnsub = currentUser.subscribe(handleAuthStateChange);
    }
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
      } catch (error) { dbg("setting sessionStorage flag failed", error?.message); }
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
  } catch (error) { dbg("toggling auth body class failed", error?.message); }
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

  // Skip rendering if avatar "signature" hasn't changed (performance optimization)
  const avatarUrl = getAvatarUrl(userData);
  if (
    cachedAvatarConfig === avatarUrl &&
    cachedAvatarHtml &&
    typeof avatarUrl === "string"
  ) {
    return;
  }

  if (avatarUrl) {
    const avatarHtml = `<img src="${avatarUrl}" alt="User Avatar" class="user-avatar-img">`;
    if (avatarTrigger) avatarTrigger.innerHTML = avatarHtml;
    if (avatarLarge) avatarLarge.innerHTML = avatarHtml;
    cachedAvatarConfig = avatarUrl;
    cachedAvatarHtml = avatarHtml;
    console.log("🎨 User avatar rendered successfully.");
  } else {
    // Fallback for no config or photo
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
  if (!_menuProfileSetupCompleteHandler) {
    _menuProfileSetupCompleteHandler = (event) => {
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
    };
    document.addEventListener(
      "profile:setup:complete",
      _menuProfileSetupCompleteHandler
    );
  }

  // Listen for profile setup skip (also update data)
  if (!_menuProfileSetupSkipHandler) {
    _menuProfileSetupSkipHandler = (event) => {
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
    };
    document.addEventListener("profile:setup:skip", _menuProfileSetupSkipHandler);
  }
}

/**
 * Set up avatar change listeners to force immediate avatar refresh
 * 🎯 FIXES: Stale avatar data in menu when user changes avatar in ProfileSetup
 */
function setupAvatarChangeListeners() {
  dbg("🎧 Setting up avatar change listeners...");

  // Listen for avatar changes from ProfileSetup
  if (!_menuAvatarChangedHandler) {
    _menuAvatarChangedHandler = (event) => {
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
    };
    document.addEventListener("avatar:changed", _menuAvatarChangedHandler);
  }

  // Also listen for currentUser store changes and force avatar refresh
  // This ensures we catch any avatar updates regardless of how they occur
  let lastAvatarConfigString = null;

  if (currentUser && typeof currentUser.subscribe === "function") {
    if (!_menuAvatarWatchUnsub) {
      _menuAvatarWatchUnsub = currentUser.subscribe(({ profile }) => {
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
  if (__mobileOptimizationsInitialized) return;
  __mobileOptimizationsInitialized = true;

  // Handle orientation changes and window resizing
  let resizeTimeout;
  _menuMobileResizeHandler = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Close any open dropdowns on orientation change
      const userDropdown = document.getElementById("userDropdown");
      if (userDropdown && userDropdown.classList.contains("active")) {
        closeUserDropdown();
      }
      // Avoid forcing body height to 100vh (causes iOS zoom/glitches)
    }, 250);
  };
  window.addEventListener("resize", _menuMobileResizeHandler);

  // Prevent zoom on double-tap for better UX
  let lastTouchEnd = 0;
  _menuMobileTouchEndHandler = (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  };
  document.addEventListener("touchend", _menuMobileTouchEndHandler, false);

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
  _menuMobileEscapeKeyHandler = (e) => {
    if (e.key === "Escape") {
      // Close any open dropdowns
      closeUserDropdown();
    }
  };
  document.addEventListener("keydown", _menuMobileEscapeKeyHandler);

  // iOS Safari viewport fix: expose --vh variable without intrusive layout changes
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    const updateViewport = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`
      );
    };
    updateViewport();
    _menuIOSViewportResizeHandler = updateViewport;
    _menuIOSViewportOrientationHandler = () => {
      setTimeout(updateViewport, 120);
    };
    window.addEventListener("resize", _menuIOSViewportResizeHandler);
    window.addEventListener("orientationchange", _menuIOSViewportOrientationHandler);
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
    const handleFocusTrapKeydown = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    try {
      if (root.__focusTrapKeydownHandler) {
        root.removeEventListener("keydown", root.__focusTrapKeydownHandler);
      }
      root.__focusTrapKeydownHandler = handleFocusTrapKeydown;
      root.addEventListener("keydown", handleFocusTrapKeydown);
    } catch (error) { console.debug("Suppressed error", error); }
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
  _menuMobileSheetEscapeHandler = (e) => {
    if (e.key === "Escape" && sheet && !sheet.hidden) closeMobileSheet();
  };
  document.addEventListener("keydown", _menuMobileSheetEscapeHandler);
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
                profilePhotoUrl:
                  profile?.profilePhotoUrl ||
                  profile?.profile?.profilePhotoUrl ||
                  null,
                useAvatar:
                  profile?.useAvatar ?? profile?.profile?.useAvatar ?? false,
              };

        if (sheetNameEl) {
          sheetNameEl.textContent = info.handle || "user";
        }
        if (sheetEmailEl) {
          sheetEmailEl.textContent = info.email || "";
        }
        if (sheetAvatar) {
          try {
            const url = getAvatarUrl(info);
            if (url) {
              // Render avatar image via DOM APIs to avoid innerHTML injection
              sheetAvatar.innerHTML = "";
              const img = document.createElement("img");
              img.src = url;
              img.alt = "User Avatar";
              img.loading = "lazy";
              sheetAvatar.appendChild(img);
            } else {
              sheetAvatar.innerHTML = "";
              const icon = document.createElement("i");
              icon.className = "fas fa-user-circle";
              sheetAvatar.appendChild(icon);
            }
          } catch {
            sheetAvatar.innerHTML = "";
            const icon = document.createElement("i");
            icon.className = "fas fa-user-circle";
            sheetAvatar.appendChild(icon);
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

  try {
    const avatarUrl = getAvatarUrl(userData);
    if (avatarUrl) {
      mobileUserAvatar.innerHTML = "";
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = "User Avatar";
      img.className = "user-avatar-img";
      img.style.width = "24px";
      img.style.height = "24px";
      img.style.borderRadius = "50%";
      mobileUserAvatar.appendChild(img);
    } else {
      mobileUserAvatar.innerHTML = "";
      const icon = document.createElement("i");
      icon.className = "fas fa-user-circle";
      mobileUserAvatar.appendChild(icon);
    }
  } catch (error) {
    mobileUserAvatar.innerHTML = "";
    const icon = document.createElement("i");
    icon.className = "fas fa-user-circle";
    mobileUserAvatar.appendChild(icon);
  }
}

/**
 * Set up mobile navigation active state tracking
 * Updates active states when pages change
 */
function setupMobileNavActiveStates() {
  if (_menuMobileNavRouteChangedHandler || _menuMobileNavHashChangeHandler) {
    return;
  }
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
  _menuMobileNavRouteChangedHandler = (event) => {
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
  };
  document.addEventListener("spa:route:changed", _menuMobileNavRouteChangedHandler);

  // Also listen for hash changes as fallback
  _menuMobileNavHashChangeHandler = () => {
    const hash = window.location.hash.slice(1);
    const route = hash || "home";
    updateMobileNavActiveStates(route);
  };
  window.addEventListener("hashchange", _menuMobileNavHashChangeHandler);

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

async function setupNotificationsIndicatorListener(userId) {
  try {
    // Cleanup previous
    teardownNotificationsIndicator();
    const dm = await getMenuDataManager();
    if (!dm) {
      console.warn(
        "Menu: DataService unavailable; notifications indicator disabled"
      );
      return;
    }
    // Attach new realtime listener
    notificationsUnsub = dm.setupNotificationsListener(
      userId,
      (notifications) => {
        // Show dot if there are any unseen friend/location notifications
        _notifDocsHasAlert = notifications.some((n) => {
          // Check for both timestamp fields AND status field (backwards compatibility)
          const isUnseen =
            !n.readAt &&
            !n.dismissedAt &&
            n.status !== "read" &&
            n.status !== "dismissed";
          const isTargetType =
            n.type === "friend_request" || n.type === "location_share_request";
          return isUnseen && isTargetType;
        });
        recomputeNotificationsDot();
      }
    );

    // Also listen to pending friend requests directly
    friendReqUnsub = dm.listenToPendingFriendRequests(userId, (requests) => {
      _pendingFriendHasAlert = Array.isArray(requests) && requests.length > 0;
      recomputeNotificationsDot();
    });
  } catch (e) {
    console.warn("⚠️ Could not set notifications listener:", e);
  }
}

function teardownNotificationsIndicator() {
  if (notificationsUnsub && typeof notificationsUnsub === "function") {
    try {
      notificationsUnsub();
    } catch (error) { dbg("unsubscribing notifications listener failed", error?.message); }
  }
  notificationsUnsub = null;
  if (friendReqUnsub && typeof friendReqUnsub === "function") {
    try {
      friendReqUnsub();
    } catch (error) { dbg("unsubscribing friend requests listener failed", error?.message); }
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
  // Note: Mobile bottom nav no longer has a notifications item - it's top-right only
}

function recomputeNotificationsDot() {
  toggleNotificationsDot(_notifDocsHasAlert || _pendingFriendHasAlert);
}

// =========================
// Clubs Nav Indicator
// =========================
// Shows red dot on Clubs nav when there are unread club notifications

function initializeClubsIndicator() {
  try {
    if (currentUser && typeof currentUser.subscribe === "function") {
      currentUser.subscribe(() => {
        const uid = currentUser.uid;
        // Only (re)setup listeners when UID changes
        if (uid === activeClubsNotifUid) {
          return;
        }

        activeClubsNotifUid = uid || null;
        if (!uid) {
          teardownClubsIndicator();
          toggleClubsDot(false);
          return;
        }
        setupClubsIndicatorListener(uid);
      });
    }
  } catch (e) {
    console.warn("⚠️ Failed to initialize clubs indicator:", e);
  }
}

async function setupClubsIndicatorListener(userId) {
  try {
    teardownClubsIndicator();
    const dm = await getMenuDataManager();
    if (!dm) {
      console.warn("Menu: DataService unavailable; clubs indicator disabled");
      return;
    }

    // Listen to user's notifications for unread club notifications
    clubsNotifUnsub = dm.setupNotificationsListener(userId, (notifications) => {
      // Check for any unread club notifications (type starts with "club_")
      _clubsHasAlert = notifications.some((n) => {
        const isUnseen =
          !n.readAt &&
          !n.dismissedAt &&
          n.status !== "read" &&
          n.status !== "dismissed";
        const isClubType =
          typeof n.type === "string" && n.type.startsWith("club_");
        return isUnseen && isClubType;
      });
      toggleClubsDot(_clubsHasAlert);
    });
  } catch (e) {
    console.warn("⚠️ Could not set clubs indicator listener:", e);
  }
}

function teardownClubsIndicator() {
  if (clubsNotifUnsub && typeof clubsNotifUnsub === "function") {
    try {
      clubsNotifUnsub();
    } catch (error) { dbg("unsubscribing clubs listener failed", error?.message); }
  }
  clubsNotifUnsub = null;
}

function toggleClubsDot(show) {
  // Desktop nav - Clubs tab
  const desktopLink = document.querySelector(
    '.nav-link[data-spa-route="clubs"]'
  );
  if (desktopLink) {
    desktopLink.classList.toggle("has-alert", !!show);
  }

  // Mobile bottom nav
  const mobileLink = document.querySelector(
    '.mobile-nav-item[data-spa-route="clubs"]'
  );
  if (mobileLink) {
    mobileLink.classList.toggle("has-alert", !!show);
  }
}

// =========================
// Messages Entry (former Notify Friends)
// =========================

function initializeMessagesEntry() {
  try {
    const btn = document.getElementById("messagesNavBtn");
    if (btn) {
      // Make an immediate best-effort decision so the button isn't invisible until the
      // auth subscription fires (affects iOS PWA on cold start).
      try {
        if (typeof currentUser?.isLoggedIn === "function") {
          btn.style.display = currentUser.isLoggedIn() ? "inline-flex" : "none";
        }
      } catch (error) { dbg("setting initial messages button visibility failed", error?.message); }

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Navigate to Messages (group chats)
        try {
          navigateTo("messages");
        } catch (err) {
          console.warn("⚠️ Failed to navigate to messages:", err);
          try {
            window.location.hash = "#messages";
          } catch (error) { dbg("hash fallback navigation failed", error?.message); }
        }
      });
    }

    // Show/hide by auth state and setup unread indicator
    if (currentUser && typeof currentUser.subscribe === "function") {
      currentUser.subscribe(({ isLoggedIn }) => {
        const b = document.getElementById("messagesNavBtn");
        if (!b) return;
        b.style.display = isLoggedIn ? "inline-flex" : "none";
        if (!isLoggedIn) {
          setMessagesDot(false);
          teardownMessagesIndicator();
        } else {
          // Setup unread messages listener when logged in
          const uid = currentUser?.uid;
          if (uid) setupMessagesIndicator(uid);
        }
      });
    }

    // Suppress the global dot while the user is already on the Messages page,
    // but restore it when leaving if there are still unread class spaces.
    const setActiveRoute = (route) => {
      _activeRoute = route || null;
      if (_activeRoute === "messages") {
        setMessagesDot(false);
      } else {
        setMessagesDot(_messagesHasUnread);
      }
    };

    // Initial route (best-effort before router emits events)
    try {
      const raw = String(window.location.hash || "").replace(/^#/, "");
      const initial = raw.split("?")[0] || null;
      setActiveRoute(initial);
    } catch (error) { dbg("getting initial route failed", error?.message); }

    if (!_menuMessagesRouteChangedHandler) {
      _menuMessagesRouteChangedHandler = (e) => setActiveRoute(e?.detail?.route);
      document.addEventListener(
        "spa:route:changed",
        _menuMessagesRouteChangedHandler
      );
    }
  } catch (e) {
    console.warn("⚠️ Failed to initialize Messages entry:", e);
  }
}

function setMessagesDot(show) {
  const effectiveShow = !!show && _activeRoute !== "messages";

  // Desktop nav button dot
  const btn = document.getElementById("messagesNavBtn");
  if (btn) {
    const dot = btn.querySelector(".nav-dot");
    if (dot) {
      dot.style.display = effectiveShow ? "inline-block" : "none";
    }
  }
  // Mobile nav item dot (add has-alert class like notifications)
  const mobileLink = document.querySelector(
    '.mobile-bottom-nav .mobile-nav-item[data-spa-route="messages"]'
  );
  if (mobileLink) {
    mobileLink.classList.toggle("has-alert", effectiveShow);
  }
}

/**
 * Setup realtime listener for unread class space messages
 * Uses the same pattern as notifications indicator
 */
async function setupMessagesIndicator(userId) {
  try {
    teardownMessagesIndicator();
    if (!userId) return;

    // Avoid unauthenticated Firestore reads during optimistic hydration:
    // currentUser may be seeded from cache before Firebase Auth resolves.
    const requestedUid = userId;
    try {
      if (
        authManager?.authReady &&
        typeof authManager.authReady.then === "function"
      ) {
        await authManager.authReady.catch(() => {});
      }
    } catch (error) { dbg("awaiting authReady failed", error?.message); }
    if (currentUser?.uid !== requestedUid) return;
    const firebaseUser = authManager?.auth?.currentUser || null;
    const firebaseUid = firebaseUser?.uid || null;
    if (!firebaseUid || firebaseUid !== requestedUid) return;
    if (typeof firebaseUser.getIdToken === "function") {
      const token = await firebaseUser.getIdToken().catch(() => null);
      if (!token) return;
    }

    _messagesUserId = requestedUid;

    // Dynamically import to keep Menu.js bundle light
    const [{ db }, { collection, query, where, onSnapshot }] =
      await Promise.all([
        import("../../lib/firebase/firebase-config.js"),
        import("firebase/firestore"),
      ]);
    const { unreadTracker } = await import(
      "../../services/groups/UnreadTracker.js"
    );

    // Helper to calculate unread state from cached spaces
    const recalculateUnread = () => {
      let hasAnyUnread = false;
      for (const space of _messagesSpacesCache) {
        if (unreadTracker.hasUnread(space.spaceId, space, userId)) {
          hasAnyUnread = true;
          break;
        }
      }
      _messagesHasUnread = hasAnyUnread;
      setMessagesDot(_messagesHasUnread);
    };

    // Listen for space view events to recalculate badge immediately
    const viewHandler = (e) => {
      if (e.detail?.userId === userId) {
        recalculateUnread();
      }
    };
    // IMPORTANT: assign an unsub immediately so teardown works even if later steps throw
    messagesSpacesUnsub = () => {
      try {
        document.removeEventListener("classspace:viewed", viewHandler);
      } catch (error) {
        dbg("removing classspace:viewed listener failed", error?.message);
      }
    };
    messagesSpacesUnsub._viewHandler = viewHandler;

    document.addEventListener("classspace:viewed", viewHandler);

    // SECURITY (C15): /classSpaces list is disabled. Poll via DataService instead of onSnapshot query.
    const { dataManager } = await import("../../services/data/DataService.js");
    const refreshSpaces = async () => {
      try {
        const spaces = await dataManager.getUserClassSpaces();
        _messagesSpacesCache = Array.isArray(spaces) ? spaces : [];
        recalculateUnread();
      } catch (error) {
        console.warn("⚠️ Messages unread polling error:", error);
      }
    };

    // Initial fetch + polling
    await refreshSpaces();
    const intervalId = setInterval(refreshSpaces, 30000);
    // Extend existing unsub to include interval cleanup
    const prevUnsub = messagesSpacesUnsub;
    messagesSpacesUnsub = () => {
      try {
        if (typeof prevUnsub === "function") prevUnsub();
      } catch (error) {
        dbg("unsubscribing messages view handler failed", error?.message);
      }
      try {
        clearInterval(intervalId);
      } catch (error) {
        dbg("clearing messages interval failed", error?.message);
      }
    };
    messagesSpacesUnsub._intervalId = intervalId;
    messagesSpacesUnsub._viewHandler = viewHandler;
  } catch (e) {
    console.warn("⚠️ Failed to setup messages indicator:", e);
    // Ensure we don't leak partially-initialized listeners/intervals
    try {
      teardownMessagesIndicator();
    } catch (_) {}
  }
}

function teardownMessagesIndicator() {
  if (messagesSpacesUnsub) {
    // Remove event listener if attached
    if (messagesSpacesUnsub._viewHandler) {
      try {
        document.removeEventListener(
          "classspace:viewed",
          messagesSpacesUnsub._viewHandler
        );
      } catch (error) { dbg("removing classspace:viewed listener failed", error?.message); }
    }
    // Unsubscribe from Firestore
    if (typeof messagesSpacesUnsub === "function") {
      try {
        messagesSpacesUnsub();
      } catch (error) { dbg("unsubscribing messages listener failed", error?.message); }
    }
  }
  messagesSpacesUnsub = null;
  _messagesHasUnread = false;
  _messagesSpacesCache = [];
  _messagesUserId = null;
}

// =========================
// Clubs Badge Clear (exported for ClubsPage)
// =========================

/**
 * Mark club notifications as read and clear the clubs nav badge.
 * Called when user visits the Clubs page.
 *
 * @param {string[]} [types] - Optional array of specific club notification types to mark as read.
 *                             If not provided, marks all club_* notifications as read.
 */
export async function clearClubsBadge(types = null) {
  try {
    const uid = currentUser?.uid;
    if (!uid) return;

    // Immediately clear the visual badge
    toggleClubsDot(false);
    _clubsHasAlert = false;

    // Mark club notifications as read in Firestore
    const dm = await getMenuDataManager();
    if (dm && typeof dm.markClubNotificationsAsRead === "function") {
      await dm.markClubNotificationsAsRead(uid, types);
    }
  } catch (e) {
    console.warn("⚠️ Failed to clear clubs badge:", e);
  }
}
