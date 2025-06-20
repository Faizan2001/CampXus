// js/menu.js - Enhanced dark/light mode toggle with glassmorphism design

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

  // Initialize authentication state
  checkAuthenticationState();

  // Set up Firebase auth state listener if available
  setupFirebaseAuthListener();
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
    updateUserDisplayInfo(userData);
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
 * Update user display information in the dropdown
 * Enhanced to display custom avatar from Firestore profile
 */
function updateUserDisplayInfo(userData) {
  // Update dropdown header with user details
  const userDropdownName = document.getElementById("userDropdownName");
  const userDropdownEmail = document.getElementById("userDropdownEmail");

  if (userDropdownName) {
    userDropdownName.textContent = userData.name;
  }

  if (userDropdownEmail) {
    userDropdownEmail.textContent = userData.email;
  }

  // Update avatar displays with custom avatar from Firestore
  updateUserAvatarDisplays(userData);

  // Update the user menu trigger tooltip for better UX
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  if (userMenuTrigger && userData.name) {
    userMenuTrigger.setAttribute(
      "title",
      `${userData.name} - Click to open menu`
    );
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

  // 🧪 ENHANCED DEBUG: Add detailed avatar debugging
  console.log("🎨 Avatar Debug Info:", {
    hasAvatarConfig: !!userData.avatarConfig,
    avatarConfig: userData.avatarConfig,
    hasAvatarManager: !!window.avatarManager,
    hasStyle: userData.avatarConfig?.style,
    hasSeed: userData.avatarConfig?.seed,
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
    console.log("⚠️ No custom avatar found, using default icon");
    
    // 🔄 If we have avatar config but no avatar manager, retry when it loads
    if (userData.avatarConfig && !window.avatarManager) {
      console.log("🔄 Avatar config exists but avatar manager not ready, will retry...");
      
      // Store user data for retry
      window.pendingAvatarUpdate = userData;
      
      // Set up a listener for when avatar manager loads
      const checkAvatarManager = () => {
        if (window.avatarManager && window.pendingAvatarUpdate) {
          console.log("✅ Avatar manager now available, retrying avatar display...");
          const pendingData = window.pendingAvatarUpdate;
          window.pendingAvatarUpdate = null; // Clear the pending data
          updateUserAvatarDisplays(pendingData); // Retry the avatar display
        } else if (!window.avatarManager) {
          // Retry after a short delay
          setTimeout(checkAvatarManager, 500);
        }
      };
      
      // Start checking for avatar manager
      setTimeout(checkAvatarManager, 100);
    }
    
    // Display default avatar icons
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
function checkAuthenticationState() {
  // First, check if Firebase auth manager is available
  if (window.authManager && window.authManager.getCurrentUser) {
    const currentUser = window.authManager.getCurrentUser();
    if (currentUser) {
      console.log("🔥 Firebase auth available, will fetch fresh data");
      // Firebase auth is available and user is signed in
      // Don't use cached data - let Firebase auth listener handle this
      return;
    }
  }

  // Only fall back to cached data if Firebase auth is not available yet
  try {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      console.log(
        "📱 Using cached user data while Firebase loads:",
        userData.email
      );
      updateAuthenticationUI(true, userData);
    } else {
      updateAuthenticationUI(false);
    }
  } catch (error) {
    console.error("Error checking authentication state:", error);
    // Clear corrupted cached data
    localStorage.removeItem("user");
    updateAuthenticationUI(false);
  }
}

/**
 * Set up Firebase authentication state listener
 */
function setupFirebaseAuthListener() {
  // 🛡️ FIX: Add guard to prevent infinite loops
  let isProcessingAuthChange = false;

  // Wait for Firebase auth manager to be available
  const checkAuthManager = () => {
    if (
      window.authManager &&
      typeof window.authManager.onAuthStateChanged === "function"
    ) {
      console.log("🔥 Setting up Firebase auth state listener for menu");

      window.authManager.onAuthStateChanged(async (user) => {
        // 🛡️ FIX: Prevent processing multiple auth changes simultaneously
        if (isProcessingAuthChange) {
          console.log("🔄 Auth change already being processed, skipping...");
          return;
        }

        isProcessingAuthChange = true;

        try {
          if (user) {
            // User is signed in - always fetch fresh profile data from Firestore
            console.log(
              "👤 User authenticated, fetching fresh profile data for:",
              user.email
            );

            // 🐛 BUG FIX: Clear any stale data before loading new user data
            clearUserDisplayInfo();

            try {
              // Import Firestore functions dynamically
              const { doc, getDoc } = await import("firebase/firestore");
              const { db } = await import(
                "../firebase/config/firebase-config.js"
              );

              // Fetch user profile data from Firestore
              const userDocRef = doc(db, "users", user.uid);
              const userDoc = await getDoc(userDocRef);

              let userData;

              if (userDoc.exists()) {
                const firestoreData = userDoc.data();
                userData = {
                  uid: user.uid, // 🐛 BUG FIX: Include UID to ensure data consistency
                  name:
                    firestoreData.firstName && firestoreData.lastName
                      ? `${firestoreData.firstName} ${firestoreData.lastName}`
                    : firestoreData.displayName || user.email.split("@")[0],
                email: user.email, // Always use Firebase Auth email as source of truth
                avatarConfig: firestoreData.avatarConfig || null,
                profileSetupComplete: firestoreData.profileSetupComplete || false,
              };

              console.log("✅ Fresh profile data loaded for:", user.email, {
                hasAvatar: !!userData.avatarConfig,
                profileSetupComplete: userData.profileSetupComplete,
              });
            } else {
              // Create fresh user data if no Firestore document exists yet
              userData = {
                uid: user.uid,
                name: user.displayName || user.email.split("@")[0],
                email: user.email,
                avatarConfig: null,
                profileSetupComplete: false,
              };

              console.log(
                "⚠️ No Firestore profile found for:",
                user.email,
                "using Firebase Auth data"
              );
            }

            updateAuthenticationUI(true, userData);
          } catch (error) {
            console.error("❌ Error fetching user profile data:", error);

            // Create clean fallback user data (never use cached data on error)
            const userData = {
              uid: user.uid,
              name: user.displayName || user.email.split("@")[0],
              email: user.email,
              avatarConfig: null,
              profileSetupComplete: false,
            };
            updateAuthenticationUI(true, userData);
          }
        } else {
          // User is signed out - clear everything
          console.log("👤 User signed out, clearing all data and updating UI");

          // 🐛 BUG FIX: Ensure all data is cleared on sign out
          localStorage.removeItem("user");
          localStorage.removeItem("authToken");
          clearUserDisplayInfo();
          updateAuthenticationUI(false);
        }
        } finally {
          // 🛡️ FIX: Reset processing flag when done
          isProcessingAuthChange = false;
        }
      });
    } else {
      // Retry after a short delay if auth manager isn't ready yet
      setTimeout(checkAuthManager, 100);
    }
  };

  checkAuthManager();
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
  // Clear dropdown header user details
  const userDropdownName = document.getElementById("userDropdownName");
  const userDropdownEmail = document.getElementById("userDropdownEmail");

  if (userDropdownName) {
    userDropdownName.textContent = "";
  }

  if (userDropdownEmail) {
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
