/**
 * CampXus SPA Router - Simple Single Page Application Router
 *
 * 🎯 Learning Concept: A router decides which content to show based on the URL
 * Think of it as a traffic controller for your web app!
 *
 * This router will:
 * - Listen for navigation clicks
 * - Load the right content for each page
 * - Update the browser URL without page reloads
 * - Handle browser back/forward buttons
 */

class SPARouter {
  constructor() {
    // 📚 Learning: These are the "routes" - like a map of your app's pages
    this.routes = {
      home: {
        title: "Schedule - CampXus",
        template: "templates/home.html",
        cssFiles: [
          "css/styles.css", // ✅ Master stylesheet imports all components
        ], // Simplified: styles.css imports everything we need
        jsFiles: ["js/core/script.js"], // Schedule functionality
        description: "Manage your weekly schedule and compare with friends",
      },
      profile: {
        title: "Profile Setup - CampXus",
        template: "templates/profile.html",
        cssFiles: [
          "css/styles.css", // ✅ Base styles with all components
          "css/profile-setup.css", // ✅ Profile-specific extensions
        ],
        jsFiles: [
          "js/firebase/auth/auth-manager.js", // ✅ Authentication system
          "js/core/avatars.js", // ✅ Avatar management system
          "js/core/profile-setup.js", // ✅ Profile functionality
        ],
        description: "Set up your student profile and preferences",
      },
      friends: {
        title: "Friends - CampXus",
        template: "templates/friends.html",
        cssFiles: [],
        jsFiles: [],
        description: "Connect with your classmates and study buddies",
      },
      about: {
        title: "About - CampXus",
        template: "templates/about.html",
        cssFiles: [],
        jsFiles: [],
        description: "Learn about the developer and the app",
      },
    };

    this.currentPage = "home"; // Default page
    this.mainContentContainer = null; // Will hold our content area
    this.loadingIndicator = null;

    // 🎯 Learning: Initialize the router when created
    this.init();
  }

  /**
   * Initialize the SPA Router
   * 🎯 Learning: This sets up all the event listeners and prepares the router
   */
  init() {
    console.log("🚀 Initializing SPA Router...");

    // Find the main content container
    this.mainContentContainer = document.querySelector(".main-content");
    if (!this.mainContentContainer) {
      console.error(
        "❌ Main content container not found! SPA Router cannot work."
      );
      return;
    }

    // Create loading indicator
    this.createLoadingIndicator();

    // Set up navigation event listeners
    this.setupNavigationListeners();

    // Handle browser back/forward buttons
    this.setupBrowserNavigation();

    // Load the initial page based on URL
    this.loadInitialPage();

    console.log("✅ SPA Router initialized successfully!");
  }

  /**
   * Create a loading indicator for smooth transitions
   * 🎯 Learning: Good UX means showing users when something is loading
   */
  createLoadingIndicator() {
    this.loadingIndicator = document.createElement("div");
    this.loadingIndicator.className = "spa-loading";
    this.loadingIndicator.innerHTML = `
      <div class="loading-container">
        <div class="loading-animation">
          <div class="loading-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
          <div class="loading-pulse"></div>
        </div>
        <div class="loading-text">
          <span class="loading-message">Loading</span>
          <span class="loading-ellipsis">...</span>
        </div>
      </div>
    `;

    // 🎨 Modern glassmorphism loading design with smooth animations
    this.loadingIndicator.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: none;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;

    // 🎯 Learning: CSS-in-JS for dynamic, modern loading animations
    const loadingStyles = document.createElement("style");
    loadingStyles.textContent = `
      .spa-loading.show {
        opacity: 1 !important;
      }

      .spa-loading .loading-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        background: rgba(255, 255, 255, 0.95);
        padding: 2.5rem 3rem;
        border-radius: 20px;
        box-shadow: 
          0 20px 40px rgba(0, 0, 0, 0.1),
          0 8px 20px rgba(0, 0, 0, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        min-width: 200px;
        animation: slideUpIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @media (prefers-color-scheme: dark) {
        .spa-loading .loading-container {
          background: rgba(40, 44, 52, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.3),
            0 8px 20px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
      }

      .spa-loading .loading-animation {
        position: relative;
        margin-bottom: 1.5rem;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .spa-loading .loading-dots {
        display: flex;
        gap: 8px;
        position: relative;
        z-index: 2;
      }

      .spa-loading .loading-dots .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        animation: dotBounce 1.4s infinite ease-in-out both;
      }

      .spa-loading .loading-dots .dot:nth-child(1) {
        animation-delay: -0.32s;
      }

      .spa-loading .loading-dots .dot:nth-child(2) {
        animation-delay: -0.16s;
      }

      .spa-loading .loading-dots .dot:nth-child(3) {
        animation-delay: 0s;
      }

      .spa-loading .loading-pulse {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(102, 126, 234, 0.3) 0%, transparent 70%);
        transform: translate(-50%, -50%);
        animation: pulse 2s infinite ease-in-out;
      }

      .spa-loading .loading-text {
        color: #4a5568;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 500;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }

      @media (prefers-color-scheme: dark) {
        .spa-loading .loading-text {
          color: #e2e8f0;
        }
      }

      .spa-loading .loading-ellipsis {
        animation: ellipsis 1.5s infinite ease-in-out;
        display: inline-block;
        width: 20px;
        text-align: left;
      }

      /* 🎨 Keyframe Animations */
      @keyframes dotBounce {
        0%, 80%, 100% {
          transform: scale(0.8) translateY(0);
          opacity: 0.7;
        }
        40% {
          transform: scale(1.2) translateY(-10px);
          opacity: 1;
        }
      }

      @keyframes pulse {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.6;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.5);
          opacity: 0.2;
        }
      }

      @keyframes ellipsis {
        0% { content: ''; }
        33% { content: '.'; }
        66% { content: '..'; }
        100% { content: '...'; }
      }

      @keyframes slideUpIn {
        0% {
          transform: translate(-50%, -40%);
          opacity: 0;
          filter: blur(10px);
        }
        100% {
          transform: translate(-50%, -50%);
          opacity: 1;
          filter: blur(0);
        }
      }

      /* 🚀 Performance optimizations */
      .spa-loading .loading-container,
      .spa-loading .loading-dots .dot,
      .spa-loading .loading-pulse {
        will-change: transform, opacity;
      }

      /* 📱 Mobile optimizations */
      @media (max-width: 480px) {
        .spa-loading .loading-container {
          padding: 2rem;
          margin: 0 1rem;
          min-width: auto;
          max-width: 280px;
        }
        
        .spa-loading .loading-dots .dot {
          width: 10px;
          height: 10px;
        }
        
        .spa-loading .loading-text {
          font-size: 14px;
        }
      }

      /* 🎯 Reduced motion support for accessibility */
      @media (prefers-reduced-motion: reduce) {
        .spa-loading .loading-container {
          animation: none;
        }
        
        .spa-loading .loading-dots .dot {
          animation: dotBounceReduced 2s infinite ease-in-out both;
        }
        
        .spa-loading .loading-pulse {
          animation: none;
          opacity: 0.3;
        }
        
        @keyframes dotBounceReduced {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      }
    `;

    document.head.appendChild(loadingStyles);
    document.body.appendChild(this.loadingIndicator);
  }

  /**
   * Set up event listeners for navigation
   * 🎯 Learning: We intercept clicks on navigation links to handle them with JavaScript
   */
  setupNavigationListeners() {
    // Listen for clicks on elements with data-spa-route attribute
    document.addEventListener("click", (event) => {
      const routeElement = event.target.closest("[data-spa-route]");
      if (routeElement) {
        event.preventDefault(); // Stop the normal link behavior
        const route = routeElement.getAttribute("data-spa-route");
        console.log(`🖱️ Navigation clicked: ${route}`);
        this.navigateTo(route);
      }
    });
  }

  /**
   * Handle browser back/forward buttons
   * 🎯 Learning: Users expect back/forward buttons to work in SPAs too!
   */
  setupBrowserNavigation() {
    window.addEventListener("popstate", (event) => {
      console.log("🔄 Browser navigation detected", event.state);

      // Try to get route from event state first, then from URL hash
      let route = event.state?.route;
      if (!route) {
        const hash = window.location.hash.slice(1);
        route = hash && this.routes[hash] ? hash : "home";
      }

      console.log(`🧭 Navigating via browser to: ${route}`);
      this.loadPage(route, false); // Don't update history again
    });

    // Also listen for hash changes (in case someone manually types a URL)
    window.addEventListener("hashchange", (event) => {
      console.log("🔗 Hash change detected", event);
      const hash = window.location.hash.slice(1);
      const route = hash && this.routes[hash] ? hash : "home";

      // Only navigate if it's different from current page
      if (route !== this.currentPage) {
        console.log(`🎯 Hash navigation to: ${route}`);
        this.loadPage(route, false);
      }
    });
  }

  /**
   * Load the initial page based on current URL
   * 🎯 Learning: When someone visits a direct link, show the right page
   */
  loadInitialPage() {
    // Parse the current URL to determine which page to load
    const hash = window.location.hash.slice(1); // Remove the # symbol
    const route = hash && this.routes[hash] ? hash : "home";

    console.log(`🎯 Initial page load: hash="${hash}", route="${route}"`);

    // Load the determined route without updating history (since we're loading from URL)
    this.navigateTo(route, false);
  }

  /**
   * Navigate to a specific route
   * 🎯 Learning: This is the main method that changes pages
   *
   * @param {string} route - The route to navigate to
   * @param {boolean} updateHistory - Whether to update browser history
   */
  async navigateTo(route, updateHistory = true) {
    if (!this.routes[route]) {
      console.error(`❌ Route '${route}' not found!`);
      return;
    }

    console.log(`🧭 Navigating to: ${route}`);

    // Update browser history if requested
    if (updateHistory) {
      const routeData = this.routes[route];
      history.pushState(
        { route },
        routeData.title,
        `#${route}` // Use hash for simplicity
      );
    }

    // Load the page content
    await this.loadPage(route);
  }

  /**
   * Load page content and resources
   * 🎯 Learning: This does the heavy lifting of swapping content
   *
   * @param {string} route - The route to load
   * @param {boolean} updateHistory - Whether this should update history
   */
  async loadPage(route, updateHistory = true) {
    const routeData = this.routes[route];
    if (!routeData) {
      console.error(`❌ Route data not found for: ${route}`);
      return;
    }

    try {
      console.log(`🔄 Loading page: ${route}, current: ${this.currentPage}`);

      // Show loading indicator
      this.showLoading();

      // Update page title
      document.title = routeData.title;

      // Update meta description
      this.updateMetaDescription(routeData.description);

      // Add body class for page-specific styling
      this.updateBodyClass(route);

      // Load CSS files if needed
      await this.loadCSS(routeData.cssFiles);

      // Load the HTML template
      const htmlContent = await this.loadTemplate(routeData.template);

      // Update the main content
      this.mainContentContainer.innerHTML = htmlContent;

      // Load and execute JavaScript files
      await this.loadJS(routeData.jsFiles);

      // Special initialization for home page after content and scripts are loaded
      if (route === "home") {
        await this.initializeHomePage();

        // 🎯 CRITICAL FIX: Check if we just came from profile setup completion
        // This ensures user data is refreshed when redirected from profile
        const justCompletedProfile = sessionStorage.getItem(
          "profileJustCompleted"
        );
        if (justCompletedProfile === "true") {
          console.log(
            "🔄 Just completed profile, forcing user data refresh..."
          );
          sessionStorage.removeItem("profileJustCompleted"); // Clear the flag

          // Force refresh user data from Firebase
          if (window.setupFirebaseAuthListener) {
            setTimeout(() => {
              console.log("🔄 Forcing Firebase auth state refresh...");
              // The auth listener will automatically fetch fresh data
              window.location.hash = window.location.hash; // Trigger refresh
            }, 500);
          }
        }
      }

      // Update current page BEFORE navigation states to ensure consistency
      this.currentPage = route;

      // Update navigation active states
      this.updateNavigationStates(route);

      // Update URL hash to match current route (for direct linking and refresh)
      if (window.location.hash !== `#${route}`) {
        history.replaceState({ route }, routeData.title, `#${route}`);
      }

      // Hide loading indicator
      this.hideLoading();

      // Dispatch custom event for other parts of the app
      this.dispatchNavigationEvent(route);

      console.log(`✅ Successfully loaded page: ${route}`);
    } catch (error) {
      console.error(`❌ Error loading page ${route}:`, error);
      this.hideLoading();
      this.showErrorPage(error);
    }
  }

  /**
   * Load CSS files dynamically
   * 🎯 Learning: Each page can have its own styles that load on demand
   */
  async loadCSS(cssFiles) {
    if (!cssFiles || cssFiles.length === 0) return;

    const promises = cssFiles.map((cssFile) => {
      return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`link[href="${cssFile}"]`)) {
          resolve();
          return;
        }

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssFile;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Load HTML template
   * 🎯 Learning: Fetch content from separate HTML files
   */
  async loadTemplate(templatePath) {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templatePath}`);
    }
    return await response.text();
  }

  /**
   * Load JavaScript files dynamically
   * 🎯 Learning: Each page can have its own functionality
   */
  async loadJS(jsFiles) {
    if (!jsFiles || jsFiles.length === 0) return;

    for (const jsFile of jsFiles) {
      // Check if already loaded
      if (document.querySelector(`script[src="${jsFile}"]`)) {
        continue;
      }

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "module"; // Use ES6 modules
        script.src = jsFile;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
  }

  /**
   * Update meta description for SEO
   * 🎯 Learning: Good practice for search engines and social sharing
   */
  updateMetaDescription(description) {
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;
  }

  /**
   * Update body class for page-specific styling
   * 🎯 Learning: Each page can have unique styles based on body class
   */
  updateBodyClass(route) {
    // Remove all existing page classes
    document.body.className = document.body.className
      .replace(/page-\w+/g, "")
      .trim();

    // Add current page class
    document.body.classList.add(`page-${route}`);

    console.log(`🎨 Updated body class to: page-${route}`);
  }

  /**
   * Update navigation active states
   * 🎯 Learning: Visual feedback shows users where they are
   */
  updateNavigationStates(activeRoute) {
    // Remove active class from all nav items
    document.querySelectorAll("[data-spa-route]").forEach((el) => {
      el.classList.remove("active");
    });

    // Add active class to current route
    const activeNavItem = document.querySelector(
      `[data-spa-route="${activeRoute}"]`
    );
    if (activeNavItem) {
      activeNavItem.classList.add("active");
    }
  }

  /**
   * Show loading indicator with smooth animation
   * 🎯 Learning: Smooth transitions make the app feel more professional
   */
  showLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = "block";
      // Small delay to ensure display is set before adding animation class
      requestAnimationFrame(() => {
        this.loadingIndicator.classList.add("show");
      });
    }
  }

  /**
   * Hide loading indicator with smooth animation
   * 🎯 Learning: Exit animations are just as important as entrance animations
   */
  hideLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.classList.remove("show");
      // Wait for fade out animation before hiding
      setTimeout(() => {
        if (this.loadingIndicator) {
          this.loadingIndicator.style.display = "none";
        }
      }, 300); // Match the CSS transition duration
    }
  }

  /**
   * Show error page when something goes wrong
   * 🎯 Learning: Always have a fallback for when things break
   */
  showErrorPage(error) {
    this.mainContentContainer.innerHTML = `
      <div class="error-page" style="text-align: center; padding: 3rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">😔</div>
        <h2>Oops! Something went wrong</h2>
        <p style="color: #666; margin-bottom: 2rem;">
          We couldn't load this page. Please try again.
        </p>
        <button onclick="window.spaRouter.navigateTo('home')" class="btn btn-primary">
          <i class="fas fa-home"></i> Go Home
        </button>
        <details style="margin-top: 2rem; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">
          <summary style="cursor: pointer; color: #666;">Technical Details</summary>
          <pre style="background: #f5f5f5; padding: 1rem; border-radius: 8px; overflow: auto; margin-top: 1rem;">
${error.message}
${error.stack || ""}
          </pre>
        </details>
      </div>
    `;
  }

  /**
   * Dispatch navigation event for other parts of the app
   * 🎯 Learning: Events let different parts of your app communicate
   */
  dispatchNavigationEvent(route) {
    const event = new CustomEvent("spa:navigation", {
      detail: { route, router: this },
    });
    document.dispatchEvent(event);
  }

  /**
   * Get current page
   * 🎯 Learning: Other parts of your app might need to know the current page
   */
  getCurrentPage() {
    return this.currentPage;
  }

  /**
   * Check if a route exists
   */
  hasRoute(route) {
    return !!this.routes[route];
  }

  /**
   * Initialize the home page after content and scripts are loaded
   * 🎯 Learning: This ensures the schedule app starts properly in SPA mode
   */
  async initializeHomePage() {
    console.log("🏠 Initializing home page...");

    try {
      // Wait a short time for script.js to fully load and initialize
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check if the main app functions are available
      if (typeof window.initializeApp === "function") {
        console.log("✅ Found initializeApp function, calling it...");
        await window.initializeApp();
      } else {
        console.log("⚠️ initializeApp not found, dispatching event...");

        // Dispatch an event that the home page script can listen for
        document.dispatchEvent(new CustomEvent("spa:home:loaded"));

        // Wait a bit more and try again
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (typeof window.initializeApp === "function") {
          console.log("✅ Found initializeApp after delay, calling it...");
          await window.initializeApp();
        } else {
          console.error("❌ Still cannot find initializeApp function");
        }
      }

      console.log("✅ Home page initialization complete");
    } catch (error) {
      console.error("❌ Error initializing home page:", error);
      // Don't throw error to prevent SPA navigation from failing
    }
  }
}

// 🎯 Learning: Export the class so other files can use it
// Also create a global instance for easy access
window.SPARouter = SPARouter;

export default SPARouter;
