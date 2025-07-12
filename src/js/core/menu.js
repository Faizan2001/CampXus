// js/menu.js - Enhanced dark/light mode toggle with glassmorphism design

// Import DataManager for all user data operations
import { currentUser } from "./currentUser.js";
import { navigateTo } from "./spa-init.js";
import { authManager } from "../firebase/auth/auth-manager.js";
import { avatarManager } from "./avatars.js";

// 🎯 CRITICAL FIX: Initialize immediately when module loads (for SPA compatibility)
// Don't wait for DOMContentLoaded in SPA mode - initialize when script loads
initializeMenuSystem();

function initializeMenuSystem() {
  // Apply saved theme immediately
  applyTheme();

  // Wait for DOM to be ready, then initialize interactive elements
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeInteractiveElements);
  } else {
    // DOM is already ready
    initializeInteractiveElements();
  }
}

function initializeInteractiveElements() {
  console.log("🎛️ Initializing menu system...");
  
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
  
  console.log("✅ Menu system initialized successfully");
}

function applyTheme() {
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  console.log("🎨 Applying theme...", { savedTheme, prefersDark });

  // Apply theme: saved preference > system preference > default (dark)
  const shouldUseDark = savedTheme === "dark" || (!savedTheme && prefersDark);

  if (shouldUseDark) {
    document.body.classList.add("dark-mode");
    console.log("🌙 Applied dark mode theme");
  } else {
    document.body.classList.remove("dark-mode");
    console.log("☀️ Applied light mode theme");
  }

  updateToggleIcon();
}

function initializeDarkModeToggle() {
  const darkModeToggle = document.getElementById("darkModeToggle");

  console.log("🌙 Initializing dark mode toggle...", { found: !!darkModeToggle });

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
    
    console.log("✅ Dark mode toggle initialized successfully");
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
  console.log("🔧 Initializing user menu...");
  
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  const userDropdown = document.getElementById("userDropdown");
  const userMenu = document.getElementById("userMenu");
  const loginBtn = document.getElementById("login-btn");
  const signOutBtn = document.getElementById("signOutBtn");

  console.log("🔍 Menu elements found:", {
    userMenuTrigger: !!userMenuTrigger,
    userDropdown: !!userDropdown,
    userMenu: !!userMenu,
    loginBtn: !!loginBtn,
    signOutBtn: !!signOutBtn
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

  // Login button functionality
  if (loginBtn) {
    loginBtn.addEventListener("click", handleLogin);
  }

  // Add event listeners to all dropdown items to close dropdown when clicked
  setupDropdownItemsCloseHandler();

  // Subscribe to the central currentUser store for all auth-related UI updates.
  // This is the new, single source of truth for the menu's auth state.
  if (currentUser && typeof currentUser.subscribe === 'function') {
    console.log("📡 Subscribing to currentUser store for auth state changes...");
    currentUser.subscribe(handleAuthStateChange);
  } else {
    console.error("❌ currentUser store not available or invalid!");
  }

  // Set up profile completion listeners for immediate data refresh
  setupProfileCompletionListeners();
  
  console.log("✅ User menu initialization complete");
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

  console.log(
    `🎯 Setting up close handlers for ${dropdownItems.length} dropdown items`
  );

  dropdownItems.forEach((item, index) => {
    // Get the item type for logging
    const itemText = item.textContent?.trim() || `Item ${index + 1}`;
    const isButton = item.tagName.toLowerCase() === "button";
    const isLink = item.tagName.toLowerCase() === "a";

    console.log(
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

  console.log("✅ Dropdown close handlers setup completed");
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
      if (window.userMenuUtils && typeof window.userMenuUtils.clearUserDisplayInfo === 'function') {
        window.userMenuUtils.clearUserDisplayInfo();
      }
      // Also force visibility update for login button and user menu
      const loginBtn = document.getElementById("login-btn");
      const userMenu = document.getElementById("userMenu");
      if (loginBtn) loginBtn.style.display = "flex";
      if (userMenu) userMenu.style.display = "none";

      // Redirect to home/schedule page after sign out using SPA router
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
 * Handle login button click
 */
function handleLogin() {
  console.log("Login button clicked");

  // Add visual feedback
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.style.transform = "scale(0.98)";
    setTimeout(() => {
      loginBtn.style.transform = "";
    }, 150);
  }

  // Use Firebase auth manager to show login modal
  if (authManager) {
    authManager.showAuthModal();
  } else {
    // Fallback: Dispatch custom event for authentication system to handle
    window.dispatchEvent(
      new CustomEvent("loginRequested", {
        detail: { timestamp: Date.now() },
      })
    );
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
  console.log("🔄 Menu auth state change:", { isLoggedIn, hasProfile: !!profile });
  
  const userMenu = document.getElementById("userMenu");
  const loginBtn = document.getElementById("login-btn");

  if (!userMenu || !loginBtn) {
    console.warn("⚠️ Menu elements not found:", { userMenu: !!userMenu, loginBtn: !!loginBtn });
    return;
  }

  if (isLoggedIn && profile) {
    // User is logged in and has a profile, show the user menu
    console.log("👤 Showing user menu, hiding login button");
    loginBtn.style.display = "none";
    userMenu.style.display = "flex";
    updateUserDisplayInfo(profile);
  } else {
    // User is logged out or profile is not yet available
    console.log("🔒 Showing login button, hiding user menu");
    loginBtn.style.display = "flex";
    userMenu.style.display = "none";
    clearUserDisplayInfo();
  }
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
      nameElement.textContent = profileData.displayName || profileData.firstName || "User";
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
  const avatarConfig = userData?.avatarConfig || userData?.profile?.avatarConfig;
  const hasAvatarConfig = !!avatarConfig;

  // 🎯 FIX: Check for avatarManager and the correct function `generateAvatarUrl`
  if (hasAvatarConfig && avatarManager && typeof avatarManager.generateAvatarUrl === 'function') {
    try {
      const avatarUrl = avatarManager.generateAvatarUrl(avatarConfig);
      const avatarHtml = `<img src="${avatarUrl}" alt="User Avatar" class="user-avatar-img">`;

      if (avatarTrigger) avatarTrigger.innerHTML = avatarHtml;
      if (avatarLarge) avatarLarge.innerHTML = avatarHtml;
      console.log("🎨 Custom avatar rendered successfully.");

    } catch (error) {
      console.error("❌ Error generating avatar URL, falling back to default.", error);
      displayDefaultAvatarIcons(avatarTrigger, avatarLarge);
    }
  } else {
    // Fallback for no config or no avatar manager
    displayDefaultAvatarIcons(avatarTrigger, avatarLarge);
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
function clearUserDisplayInfo() {
  // 🛡️ CRITICAL SAFEGUARD: Don't clear if we just completed profile setup
  if (window.preventUserDataClearing) {
    console.log(
      "🛡️ Prevented clearing user data - profile completion in progress"
    );
    return;
  }

  console.log("🧹 clearUserDisplayInfo called", {
    stack: new Error().stack?.split("\n").slice(1, 4).join("\n"),
    timestamp: new Date().toISOString(),
    preventFlag: window.preventUserDataClearing,
  });

  // Clear dropdown header user details
  const userDropdownName = document.getElementById("userDropdownName");
  const userDropdownEmail = document.getElementById("userDropdownEmail");

  if (userDropdownName) {
    console.log("🧹 Clearing user name:", userDropdownName.textContent);
    userDropdownName.textContent = "";
  }

  if (userDropdownEmail) {
    console.log("🧹 Clearing user email:", userDropdownEmail.textContent);
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

  console.log("🧹 Cleared all user display information");
}

/**
 * Set up profile completion listeners
 * 🎯 LEARNING: Listen for when the user completes profile setup to refresh data immediately
 */
function setupProfileCompletionListeners() {
  console.log("🎧 Setting up profile completion listeners...");

  // Listen for profile setup completion
  document.addEventListener("profile:setup:complete", (event) => {
    console.log(
      "🎉 Profile setup completed, refreshing user data immediately..."
    );

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

      // Force reflow for better mobile experience
      document.body.style.height = "100vh";
      requestAnimationFrame(() => {
        document.body.style.height = "";
      });
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

  // iOS Safari viewport fix
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
      setTimeout(updateViewport, 100);
    });
  }
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

