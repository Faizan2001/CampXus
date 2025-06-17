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

import SPARouter from './spa-router.js';

/**
 * Initialize the SPA when DOM is ready
 * 🎯 Learning: We wait for the DOM to load before setting up our app
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Starting CampXus SPA...');
  
  // Create global router instance
  window.spaRouter = new SPARouter();
  
  // Set up authentication-aware navigation
  setupAuthenticationIntegration();
  
  // Set up profile completion redirects
  setupProfileCompletionFlow();
  
  // Listen for SPA navigation events
  setupSPAEventListeners();
  
  console.log('✅ CampXus SPA initialized successfully!');
});

/**
 * Integrate SPA with Firebase Authentication
 * 🎯 Learning: SPAs need to work with your existing authentication system
 */
function setupAuthenticationIntegration() {
  // Listen for authentication state changes
  document.addEventListener('spa:navigation', (event) => {
    const { route } = event.detail;
    
    // Some pages might require authentication
    if (route === 'profile') {
      // Check if user is authenticated before showing profile
      // This integrates with your existing Firebase auth
      checkAuthenticationForProfile();
    }
  });
}

/**
 * Handle profile setup completion flow
 * 🎯 Learning: In SPAs, we redirect using JavaScript instead of page reloads
 */
function setupProfileCompletionFlow() {
  // Listen for profile setup completion
  document.addEventListener('profile:setup:complete', () => {
    console.log('📝 Profile setup completed, redirecting to home...');
    
    // Show success message briefly, then redirect
    setTimeout(() => {
      if (window.spaRouter) {
        window.spaRouter.navigateTo('home');
      }
    }, 2000); // 2 second delay to show success message
  });
  
  // Listen for profile setup skip
  document.addEventListener('profile:setup:skip', () => {
    console.log('⏭️ Profile setup skipped, redirecting to home...');
    
    if (window.spaRouter) {
      window.spaRouter.navigateTo('home');
    }
  });
}

/**
 * Set up SPA-specific event listeners
 * 🎯 Learning: SPAs use events to communicate between different parts
 */
function setupSPAEventListeners() {
  // Listen for navigation events to update UI
  document.addEventListener('spa:navigation', (event) => {
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
 * Check authentication for profile page
 * 🎯 Learning: Integrate SPA routing with your existing auth system
 */
function checkAuthenticationForProfile() {
  // This integrates with your existing Firebase authentication
  if (typeof firebase !== 'undefined' && firebase.auth) {
    const user = firebase.auth().currentUser;
    
    if (!user) {
      console.log('🔒 Profile requires authentication, staying on current page');
      // Could show login modal or redirect to a different page
      return false;
    }
  }
  
  return true;
}

/**
 * Update page title based on current route
 * 🎯 Learning: Good SPAs update the browser title for each "page"
 */
function updatePageTitle(route) {
  const titles = {
    'home': 'Schedule - CampXus',
    'profile': 'Profile Setup - CampXus',
    'friends': 'Friends - CampXus',
    'about': 'About - CampXus'
  };
  
  const title = titles[route] || 'CampXus';
  document.title = title;
}

/**
 * Close any open dropdowns when navigating
 * 🎯 Learning: Clean up UI state when moving between pages
 */
function closeAllDropdowns() {
  // Close user menu dropdown if open
  const userDropdown = document.getElementById('userDropdown');
  if (userDropdown) {
    userDropdown.classList.remove('show');
  }
  
  // Reset user menu trigger
  const userMenuTrigger = document.getElementById('userMenuTrigger');
  if (userMenuTrigger) {
    userMenuTrigger.setAttribute('aria-expanded', 'false');
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
  document.body.className = document.body.className.replace(/\bpage-\w+/g, '');
  document.body.classList.add(`page-${route}`);
  
  // You could also update the navigation active states here
  // (though the router already handles this)
}

/**
 * Global SPA navigation helper function
 * 🎯 Learning: Provide a simple way for other scripts to navigate
 */
window.navigateTo = function(route) {
  if (window.spaRouter) {
    window.spaRouter.navigateTo(route);
  } else {
    console.error('SPA Router not initialized yet');
  }
};

/**
 * Export for use in other modules
 * 🎯 Learning: Modern JavaScript modules can export functions
 */
export { 
  setupAuthenticationIntegration,
  setupProfileCompletionFlow,
  updatePageTitle
};
