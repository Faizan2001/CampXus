// js/menu.js - Enhanced dark/light mode toggle with glassmorphism design

document.addEventListener("DOMContentLoaded", () => {
  // Apply saved theme on page load
  applyTheme();

  // Initialize dark mode toggle
  initializeDarkModeToggle();

  // Initialize navigation
  initializeNavigation();

  // Initialize theme system
  initializeThemeSystem();
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
      // Add animation class
      darkModeToggle.classList.add("theme-toggle-animation");
      setTimeout(() => {
        darkModeToggle.classList.remove("theme-toggle-animation");
      }, 300);
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

  if (icon) {
    if (document.body.classList.contains("dark-mode")) {
      icon.className = "fas fa-sun";
      darkModeToggle.setAttribute("title", "Switch to light mode");
    } else {
      icon.className = "fas fa-moon";
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
      createRipple(link, e);
    });
  });

  // Add ripple effects to navigation buttons
  const navButtons = document.querySelectorAll(".nav-button");
  navButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      createRipple(button, e);
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

// Legacy functions for backward compatibility (if needed by other scripts)
function toggleMenu() {
  // No-op for backward compatibility
  console.warn("toggleMenu() is deprecated in the new glassmorphism design");
}

// Utility function to create ripple effects
function createRipple(element, event) {
  const ripple = document.createElement("span");
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = size + "px";
  ripple.style.left = x + "px";
  ripple.style.top = y + "px";
  ripple.classList.add("ripple");

  element.appendChild(ripple);

  setTimeout(() => {
    ripple.remove();
  }, 600);
}

// Expose theme functions for external access
window.themeUtils = {
  toggleDarkMode,
  applyTheme,
  getCurrentTheme: () => localStorage.getItem("theme") || "system",
};
