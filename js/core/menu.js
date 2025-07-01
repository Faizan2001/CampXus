// js/menu.js - Enhanced dark/light mode toggle with glassmorphism design

// Import DataManager for all user data operations
import { dataManager } from "./data-manager.js";

document.addEventListener("DOMContentLoaded", () => {
  // Apply saved theme on page load
  applyTheme();

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
});

function applyTheme() {
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Apply theme: saved preference > system preference > default (dark)
  const shouldUseDark = savedTheme === "dark" || (!savedTheme && prefersDark);

  if (shouldUseDark) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }

  updateToggleIcon();
}

function initializeDarkModeToggle() {
  const darkModeToggle = document.getElementById("darkModeToggle");

  if (darkModeToggle) {
    // Update button text/icon based on current theme
    updateToggleIcon();

    darkModeToggle.addEventListener("click", () => {
      toggleDarkMode();
      // Animation removed for cleaner interaction
    });

    // Add tooltip
    darkModeToggle.setAttribute("title", "Toggle dark/light mode");
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
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  const userDropdown = document.getElementById("userDropdown");
  const userMenu = document.getElementById("userMenu");
  const loginBtn = document.getElementById("login-btn");
  const signOutBtn = document.getElementById("signOutBtn");

  if (!userMenuTrigger || !userDropdown) {
    console.warn("User menu elements not found");
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

  // Initialize authentication state
  checkAuthenticationState();

  // Set up Firebase auth state listener if available
  setupFirebaseAuthListener();

  // Set up profile completion listeners for immediate data refresh
  setupProfileCompletionListeners();
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
  // Add visual feedback
  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) {
    signOutBtn.style.opacity = "0.7";
    signOutBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i><span>Signing out...</span>';
  }

  try {
    // 🐛 BUG FIX: Clear all cached data BEFORE Firebase sign out
    console.log("🧹 Clearing cached user data...");
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");

    // Clear UI immediately
    clearUserDisplayInfo();

    // Use Firebase auth manager to sign out
    if (window.authManager) {
      await window.authManager.signOut();
      console.log("Successfully signed out");
    } else {
      console.log("User signed out successfully");
    }

    // Close dropdown
    closeUserDropdown();

    // Hide user menu and show login button
    updateAuthenticationUI(false);

    // Navigate to home page (main schedule screen) using SPA router
    if (window.spaRouter) {
      console.log("🏠 Redirecting to home after sign out...");
      window.spaRouter.navigateTo("home");
    } else {
      // Fallback: Traditional navigation if SPA router isn't available
      console.log("⚠️ SPA router not available, using traditional navigation");
      window.location.href = "#home";
    }

    // Dispatch custom event for other components to react
    window.dispatchEvent(
      new CustomEvent("userSignedOut", {
        detail: { timestamp: Date.now() },
      })
    );
  } catch (error) {
    console.error("Error during sign out:", error);
    // Even on error, clear cached data and navigate to home for better UX
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");
    clearUserDisplayInfo();
    updateAuthenticationUI(false);

    if (window.spaRouter) {
      window.spaRouter.navigateTo("home");
    }
  } finally {
    // Always reset button state (whether success or error)
    if (signOutBtn) {
      signOutBtn.style.opacity = "1";
      signOutBtn.innerHTML =
        '<i class="fas fa-sign-out-alt"></i><span>Sign Out</span>';
    }
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
  if (window.authManager) {
    window.authManager.showAuthModal();
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
 * Update UI based on authentication state
 */
function updateAuthenticationUI(isAuthenticated, userData = null) {
  const userMenu = document.getElementById("userMenu");
  const loginBtn = document.getElementById("login-btn");

  if (!userMenu || !loginBtn) return;

  if (isAuthenticated && userData) {
    // Show user menu, hide login button
    userMenu.style.display = "flex";
    loginBtn.style.display = "none";

    // Store user data in localStorage for page reload persistence
    localStorage.setItem("user", JSON.stringify(userData));

    // Update user information in the UI
    // Always use UID for minimal fetch
    updateUserDisplayInfo(userData.uid || userData);
  } else {
    // Hide user menu, show login button
    userMenu.style.display = "none";
    loginBtn.style.display = "block";

    // BUG FIX: Clear all cached user data on sign out
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");

    // Clear displayed user info
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
async function updateUserDisplayInfo(userId) {
  try {
    // Fetch only the minimal fields needed for the dropdown header

    const minimalProfile = await dataManager.getUserProfileMinimal(userId);
    console.log(
      "[DEBUG] minimalProfile fetched from dataManager:",
      minimalProfile
    );
    if (!minimalProfile) {
      console.warn("No minimal profile found for user:", userId);
      return;
    }
    const { firstName, email, avatarConfig } = minimalProfile;
    const displayName =
      typeof firstName === "string" && firstName ? firstName : "User";
    // Wait for DOM elements
    const waitForElements = () => {
      const userDropdownName = document.getElementById("userDropdownName");
      const userDropdownEmail = document.getElementById("userDropdownEmail");
      if (!userDropdownName || !userDropdownEmail) {
        setTimeout(waitForElements, 100);
        return;
      }
      userDropdownName.textContent = displayName;
      userDropdownEmail.textContent = email || "";
      // Update tooltip
      const userMenuTrigger = document.getElementById("userMenuTrigger");
      if (userMenuTrigger) {
        userMenuTrigger.setAttribute(
          "title",
          `${displayName} - Click to open menu`
        );
      }
    };
    waitForElements();
    // Update avatar displays
    updateUserAvatarDisplays({
      name: displayName,
      avatarConfig: avatarConfig || {},
    });
  } catch (error) {
    console.error("Error updating user display info:", error);
  }
}

/**
 * Update user avatar displays in navigation and dropdown
 * Fetches and displays custom avatar from user's Firestore profile
 * @param {Object} userData - User data containing avatarConfig
 */
function updateUserAvatarDisplays(userData) {
  const userAvatarTrigger = document.getElementById("userAvatarTrigger");
  const userAvatarLarge = document.getElementById("userAvatarLarge");

  // Check if we have avatar configuration from Firestore
  const hasCustomAvatar =
    userData.avatarConfig &&
    userData.avatarConfig.style &&
    userData.avatarConfig.seed;

  // 🏆 DEBUG: Keep basic avatar debugging for development
  console.log("🎨 Avatar Status:", {
    hasAvatarConfig: !!userData.avatarConfig,
    hasAvatarManager: !!window.avatarManager,
    hasCustomAvatar,
  });

  if (hasCustomAvatar && window.avatarManager) {
    try {
      // Generate avatar URL using avatar manager
      const avatarUrl = window.avatarManager.generateAvatarUrl(
        userData.avatarConfig
      );

      console.log("🎨 Displaying custom avatar:", {
        style: userData.avatarConfig.style,
        seed: userData.avatarConfig.seed,
        url: avatarUrl,
      });

      // Update navigation trigger avatar
      if (userAvatarTrigger) {
        userAvatarTrigger.innerHTML = `
          <div class="avatar-content">
            <img src="${avatarUrl}" alt="${userData.name}'s Avatar" />
          </div>
        `;
      }

      // Update dropdown header avatar
      if (userAvatarLarge) {
        userAvatarLarge.innerHTML = `
          <div class="avatar-content">
            <img src="${avatarUrl}" alt="${userData.name}'s Avatar" />
          </div>
        `;
      }
    } catch (error) {
      console.error("❌ Error generating avatar URL:", error);
      // Fallback to default icon
      displayDefaultAvatarIcons(userAvatarTrigger, userAvatarLarge);
    }
  } else {
    console.log("⚠️ No custom avatar found or avatar manager not available");

    // 🔄 If we have avatar config but no avatar manager, retry when it loads
    if (userData.avatarConfig && !window.avatarManager) {
      console.log(
        "🔄 Avatar config exists but avatar manager not ready, will retry..."
      );

      // Store user data for retry
      window.pendingAvatarUpdate = userData;

      // Set up a listener for when avatar manager loads
      const checkAvatarManager = () => {
        if (window.avatarManager && window.pendingAvatarUpdate) {
          console.log(
            "✅ Avatar manager now available, retrying avatar display..."
          );
          const pendingData = window.pendingAvatarUpdate;
          window.pendingAvatarUpdate = null; // Clear the pending data
          updateUserAvatarDisplays(pendingData); // Retry the avatar display
        } else if (!window.avatarManager) {
          // Retry after a short delay
          setTimeout(checkAvatarManager, 500);
        }
      };

      // Start checking for avatar manager immediately and with retries
      setTimeout(checkAvatarManager, 100);

      // 🎯 CRITICAL FIX: Also check when scripts are loaded via SPA router
      document.addEventListener("DOMContentLoaded", checkAvatarManager);
      document.addEventListener("spa:navigation", checkAvatarManager);

      // 🎯 ADDITIONAL FIX: Check periodically for avatar manager
      const avatarManagerInterval = setInterval(() => {
        if (window.avatarManager && window.pendingAvatarUpdate) {
          clearInterval(avatarManagerInterval);
          console.log("🎨 Avatar manager detected during periodic check...");
          checkAvatarManager();
        }
      }, 1000); // Check every second for up to 10 seconds

      setTimeout(() => {
        clearInterval(avatarManagerInterval);
      }, 10000);
    }

    // Display default avatar icons while waiting
    displayDefaultAvatarIcons(userAvatarTrigger, userAvatarLarge);
  }
}

/**
 * Display default avatar icons when no custom avatar is available
 * @param {HTMLElement} triggerElement - Navigation trigger element
 * @param {HTMLElement} largeElement - Dropdown header element
 */
function displayDefaultAvatarIcons(triggerElement, largeElement) {
  if (triggerElement) {
    triggerElement.innerHTML = '<i class="fas fa-user-circle"></i>';
  }

  if (largeElement) {
    largeElement.innerHTML = '<i class="fas fa-user-circle"></i>';
  }
}

/**
 * Check current authentication state on page load
 * 🐛 BUG FIX: Only use cached data if Firebase auth is not available yet
 */
async function checkAuthenticationState() {
  // Try to get the current user from Firebase auth manager
  let userId = null;
  if (window.authManager && window.authManager.getCurrentUser) {
    const currentUser = window.authManager.getCurrentUser();
    if (currentUser) {
      userId = currentUser.uid;
    }
  }

  // If we have a userId, fetch profile from Firestore via dataManager
  if (userId) {
    try {
      const userProfile = await dataManager.getUserProfile(userId);
      if (userProfile) {
        updateAuthenticationUI(true, userProfile);
        return;
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  }

  // Fallback: Try to get cached user data from dataManager
  try {
    const cachedUser =
      dataManager.getCachedData && dataManager.getCachedData(`user_${userId}`);
    if (cachedUser) {
      updateAuthenticationUI(true, cachedUser);
    } else {
      updateAuthenticationUI(false);
    }
  } catch (error) {
    console.error("Error checking authentication state:", error);
    updateAuthenticationUI(false);
  }
}

/**
 * Force update user data after profile completion
 * 🎯 CRITICAL FIX: This ensures avatar and display name appear immediately after profile setup
 * @param {Object} newUserData - Fresh user data from profile completion
 */
function updateUserDataAfterProfileCompletion(newUserData) {
  console.log(
    "🔄 Forcing user data update after profile completion:",
    newUserData
  );

  // 🛡️ Set a flag to prevent clearing operations for a short time
  window.preventUserDataClearing = true;
  setTimeout(() => {
    window.preventUserDataClearing = false;
  }, 3000); // Protect for 3 seconds

  // Store in localStorage first for persistence across page reloads
  localStorage.setItem("user", JSON.stringify(newUserData));

  // Update authentication UI with the fresh data
  updateAuthenticationUI(true, newUserData);

  // 🎯 CRITICAL: Force immediate update of display info with retry
  const forceUpdate = () => {
    const userDropdownName = document.getElementById("userDropdownName");
    const userDropdownEmail = document.getElementById("userDropdownEmail");

    if (userDropdownName && userDropdownEmail) {
      // Always use UID for minimal fetch
      updateUserDisplayInfo(newUserData.uid || newUserData);
      console.log("✅ User data successfully updated after profile completion");
    } else {
      console.log("⏳ Elements not ready, retrying user data update...");
      setTimeout(forceUpdate, 200);
    }
  };
  forceUpdate();
}

// 🎯 EXPORT FUNCTION: Make this available globally for profile-setup.js to call
window.updateUserDataAfterProfileCompletion =
  updateUserDataAfterProfileCompletion;

/**
 * =============================================================================
 *                  🎯 CRITICAL FIX: AVATAR & DISPLAY NAME UPDATE SYSTEM
 * =============================================================================
 *
 * 🚨 PROBLEM SOLVED:
 * Previously, when users completed profile setup (including setting an avatar),
 * they had to manually reload the page to see their avatar and display name.
 *
 * 🔍 ROOT CAUSE:
 * 1. Profile data was saved to Firebase successfully
 * 2. User was redirected to home page via SPA router
 * 3. Menu system tried to fetch fresh user data from Firestore
 * 4. BUT there was a timing issue - sometimes cached data was displayed
 * 5. Avatar manager wasn't always loaded when avatar display was attempted
 *
 * 💡 SOLUTION IMPLEMENTED:
 * 1. Force immediate refresh of user data after profile completion
 * 2. Enhanced retry mechanism for avatar manager loading
 * 3. Session storage flag to detect profile completion
 * 4. Multiple fallback checks for avatar display
 * 5. Event-driven updates instead of relying solely on auth state changes
 *
 * 🎯 TEACHING MOMENT:
 * This fix demonstrates several important web development concepts:
 * - Data synchronization in single-page applications
 * - Event-driven architecture for real-time updates
 * - Graceful handling of async resource loading
 * - User experience optimization (no manual refresh needed)
 * - Defensive programming with multiple fallback mechanisms
 *
 * =============================================================================
 */

/**
 * Set up Firebase authentication state listener
 * 🏆 BEST PRACTICE: Use debouncing to prevent race conditions
 */
function setupFirebaseAuthListener() {
  // 🛡️ Debouncing variables to prevent rapid auth state changes
  let authProcessingTimer = null;
  let isProcessingAuthChange = false;

  // Wait for Firebase auth manager to be available
  const checkAuthManager = () => {
    if (
      window.authManager &&
      typeof window.authManager.onAuthStateChanged === "function"
    ) {
      console.log("🔥 Setting up Firebase auth state listener for menu");

      window.authManager.onAuthStateChanged(async (user) => {
        // 🏆 DEBOUNCING: Clear any pending auth processing
        clearTimeout(authProcessingTimer);

        // 🛡️ Prevent overlapping auth processing
        if (isProcessingAuthChange) {
          console.log("🔄 Auth change already being processed, debouncing...");
          return;
        }

        // 🏆 DEBOUNCE: Wait 200ms before processing to let Firestore settle
        authProcessingTimer = setTimeout(async () => {
          isProcessingAuthChange = true;

          try {
            if (user) {
              // User is signed in - fetch fresh profile data from Firestore
              console.log(
                "👤 User authenticated, fetching fresh profile data for:",
                user.email
              );

              // 🎯 CRITICAL FIX: Be more careful about clearing display info
              // Only clear if we truly have no user data AND no display elements are populated
              const currentUserData = localStorage.getItem("user");
              const userDropdownName =
                document.getElementById("userDropdownName");
              const userDropdownEmail =
                document.getElementById("userDropdownEmail");

              // Only clear if we have no stored data AND no displayed data
              const hasDisplayedData =
                userDropdownName?.textContent?.trim() ||
                userDropdownEmail?.textContent?.trim();

              if (!currentUserData && !hasDisplayedData) {
                console.log(
                  "🧹 Clearing user display info - no stored or displayed data"
                );
                clearUserDisplayInfo();
              } else {
                console.log("🛡️ Preserving user display info - data exists", {
                  hasStoredData: !!currentUserData,
                  hasDisplayedData: hasDisplayedData,
                });
              }

              // 🏆 ROBUST: Retry system for reliable Firestore access
              const maxRetries = 3;
              let retryCount = 0;
              let userData = null;

              while (retryCount < maxRetries && !userData) {
                try {
                  // Use dataManager for consistent data access
                  const firestoreData = await dataManager.getUserProfile(
                    user.uid
                  );

                  if (firestoreData) {
                    userData = {
                      uid: user.uid,
                      name:
                        // 🗂️ ORGANIZED STRUCTURE: Access from profile group
                        firestoreData.profile?.firstName &&
                        firestoreData.profile?.lastName
                          ? `${firestoreData.profile.firstName} ${firestoreData.profile.lastName}`
                          : firestoreData.displayName ||
                            user.email.split("@")[0],
                      email: user.email,
                      avatarConfig: firestoreData.avatarConfig || null,
                      profileSetupComplete:
                        // 🗂️ ORGANIZED STRUCTURE: Access from systemInfo group
                        firestoreData.systemInfo?.profileSetupComplete || false,
                    };

                    console.log("✅ Profile loaded for:", user.email, {
                      hasAvatar: !!userData.avatarConfig,
                      profileSetupComplete: userData.profileSetupComplete,
                    });

                    break; // Success! Exit the retry loop
                  } else {
                    // Retry if data not found and we have retries left
                    if (retryCount < maxRetries - 1) {
                      console.log("🔄 Retrying profile data fetch...");
                      retryCount++;
                      await new Promise((resolve) => setTimeout(resolve, 500));
                      continue;
                    }
                  }
                } catch (error) {
                  console.error(
                    `❌ Attempt ${retryCount + 1} failed:`,
                    error.message
                  );

                  retryCount++;
                  if (retryCount < maxRetries) {
                    const delay = retryCount * 300;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                  }
                }
              }

              // If we still don't have userData after all retries, create fallback
              if (!userData) {
                console.log("⚠️ Using fallback user data for:", user.email);
                userData = {
                  uid: user.uid,
                  name: user.displayName || user.email.split("@")[0],
                  email: user.email,
                  avatarConfig: null,
                  profileSetupComplete: false,
                };
              }

              updateAuthenticationUI(true, userData);
            } else {
              // User is signed out - clear everything
              console.log(
                "👤 User signed out, clearing all data and updating UI"
              );

              localStorage.removeItem("user");
              localStorage.removeItem("authToken");
              clearUserDisplayInfo();
              updateAuthenticationUI(false);
            }
          } finally {
            // 🛡️ Reset processing flag when done
            isProcessingAuthChange = false;
          }
        }, 200); // 200ms debounce delay
      });
    } else {
      // Retry after a short delay if auth manager isn't ready yet
      setTimeout(checkAuthManager, 100);
    }
  };

  checkAuthManager();
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

      // Force immediate update of user data in menu
      updateUserDataAfterProfileCompletion(menuUserData);
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

      updateUserDataAfterProfileCompletion(menuUserData);
    }
  });
}

// Legacy functions for backward compatibility (if needed by other scripts)
function toggleMenu() {
  // No-op for backward compatibility
  console.warn("toggleMenu() is deprecated in the new glassmorphism design");
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

// Expose theme functions and user menu functions for external access
window.themeUtils = {
  toggleDarkMode,
  applyTheme,
  getCurrentTheme: () => localStorage.getItem("theme") || "system",
};

window.userMenuUtils = {
  toggleUserDropdown,
  openUserDropdown,
  closeUserDropdown,
  updateAuthenticationUI,
  updateUserDisplayInfo,
  clearUserDisplayInfo, // 🐛 BUG FIX: Expose clear function for external use
  handleSignOut,
  handleLogin,
  checkAuthenticationState,
  setupFirebaseAuthListener,
};

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
