/**
 * MeetchuThere SPA Router - Simple Single Page Application Router
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

import { authManager } from "../services/auth/AuthService.js"; // 🎯 NEW: Import authManager for authentication checks
import { currentUser } from "../store/userStore.js"; // 🎯 NEW: Import currentUser for better auth state checking
import { dataManager } from "../services/data/DataService.js"; // 🎯 NEW: Import dataManager for notifications
import { logManager } from "../utils/debug/LogManager.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js"; // 📊 Track page views

/**
 * Helper function to detect if fetched content is a full HTML document
 * instead of a template fragment. This prevents accidentally injecting
 * the entire index.html into the main content area.
 * @param {string} html - The HTML content to check
 * @returns {boolean} True if this looks like a full HTML document
 */
function looksLikeFullDocument(html) {
  return /^\s*<!DOCTYPE html>/i.test(html) || /\<html[\s\S]*\>/i.test(html);
}

class SPARouter {
  constructor() {
    // 📚 Learning: These are the "routes" - like a map of your app's pages
    this.routes = {
      home: {
        title: "Schedule - MeetchuThere",
        template: "/templates/home.html", // ✅ Fixed: Absolute path to prevent fallback to index.html
        cssFiles: [
          "/src/css/styles.css", // ✅ Fixed: Absolute path from root for Vite
        ],
        jsImporters: [() => import("/src/js/pages/HomePage.js")], // Lazy-load Home page controller (dev and prod)
        description: "Manage your weekly schedule and compare with friends",
      },
      profile: {
        title: "Profile Setup - MeetchuThere",
        template: "/templates/profile.html", // ✅ Fixed: Absolute path to prevent fallback to index.html
        cssFiles: [
          "/src/css/styles.css", // ✅ Fixed: Absolute path from root for Vite
          "/src/css/profile-setup.css", // ✅ Fixed: Absolute path from root for Vite
        ],
        jsImporters: [() => import("/src/js/components/forms/ProfileSetup.js")],
        description: "Set up your student profile and preferences",
      },
      friends: {
        title: "Friends - MeetchuThere",
        template: "/templates/friends.html", // ✅ Fixed: Absolute path to prevent fallback to index.html
        cssFiles: [
          "/src/css/styles.css", // ✅ Fixed: Absolute path from root for Vite
          "/src/css/friends-page.css", // ✅ Fixed: Absolute path from root for Vite
        ],
        jsImporters: [() => import("/src/js/pages/FriendsPage.js")],
        description: "Connect with your classmates and study buddies",
        requiresAuth: true, // 🛡️ This page requires a user to be logged in
      },
      notifications: {
        title: "Notifications - MeetchuThere",
        template: "/templates/notifications.html",
        cssFiles: ["/src/css/styles.css", "/src/css/notifications.css"],
        jsImporters: [() => import("/src/js/pages/NotificationsPage.js")],
        description:
          "View your campus social notifications and location sharing requests",
        requiresAuth: true, // 🛡️ This page requires a user to be logged in
      },
      about: {
        title: "About - MeetchuThere",
        template: "/templates/about.html", // ✅ Fixed: Absolute path to prevent fallback to index.html
        cssFiles: [],
        jsFiles: [],
        description: "Learn about the developer and the app",
      },
    };

    this.currentPage = "home"; // Default page
    this.mainContentContainer = null; // Will hold our content area
    this.loadingIndicator = null;
    // Navigation concurrency & cancellation
    this._navId = 0;
    this._abortController = null;

    // 🎯 Learning: Initialize the router when created
    this.init();
  }

  /**
   * Initialize the SPA Router
   * 🎯 Learning: This sets up all the event listeners and prepares the router
   */
  init() {
    // Initialize SPA Router

    // Find the main content container
    this.mainContentContainer = document.querySelector(".main-content");
    if (!this.mainContentContainer) {
      console.error(
        "❌ Main content container not found! SPA Router cannot work."
      );
      console.log(
        "📋 Available elements with class 'main':",
        document.querySelectorAll("[class*='main']")
      );
      console.log(
        "📋 Body contents:",
        document.body.innerHTML.substring(0, 500) + "..."
      );
      return;
    }
    // Found main content container

    // Create loading indicator
    this.createLoadingIndicator();

    // Set up navigation event listeners
    this.setupNavigationListeners();

    // Handle browser back/forward buttons
    this.setupBrowserNavigation();

    // Load the initial page based on URL
    // this.loadInitialPage(); // 🎯 FIXED: We now call this from spa-init.js

    // SPA Router initialized
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

      body.dark-mode .spa-loading .loading-container {
        background: rgba(40, 44, 52, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 
          0 20px 40px rgba(0, 0, 0, 0.3),
          0 8px 20px rgba(0, 0, 0, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
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

      body.dark-mode .spa-loading .loading-text {
        color: #e2e8f0;
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
        // Navigation clicked
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
      // Browser navigation detected

      // Try to get route from event state first, then from URL hash
      let route = event.state?.route;
      if (!route) {
        const hash = window.location.hash.slice(1);
        route = hash && this.routes[hash] ? hash : "home";
      }

      // Navigating via browser
      this.loadPage(route, false); // Don't update history again
    });

    // Also listen for hash changes (in case someone manually types a URL)
    window.addEventListener("hashchange", (event) => {
      // Hash change detected
      const hash = window.location.hash.slice(1);
      const route = hash && this.routes[hash] ? hash : "home";

      // Only navigate if it's different from current page
      if (route !== this.currentPage) {
        // Hash navigation
        this.loadPage(route, false);
      }
    });
  }

  /**
   * Load the initial page based on current URL
   * 🎯 Learning: When someone visits a direct link, show the right page
   */
  loadInitialPage() {
    // loadInitialPage called

    // Parse the current URL to determine which page to load
    const hash = window.location.hash.slice(1); // Remove the # symbol
    const route = hash && this.routes[hash] ? hash : "home";

    // Initial page load

    // Load the determined route without updating history (since we're loading from URL)
    // Navigating for initial load
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
      console.error(`❌ Route not found: ${route}`);
      this.showErrorFeedback(`Page not found: ${route}`);
      return;
    }

    // 🛡️ Authentication Check with proper ES6 imports!
    const routeConfig = this.routes[route];
    if (routeConfig.requiresAuth) {
      // 🎯 FIXED: Use imported authManager and currentUser instead of window globals
      const isAuthenticated = currentUser.isLoggedIn() && currentUser.user;

      if (!isAuthenticated) {
        console.warn(
          `🔒 Access denied to route: ${route}. User not authenticated.`
        );
        console.log("🔍 Debug auth state:", {
          hasUser: !!currentUser.user,
          isLoggedIn: currentUser.isLoggedIn(),
          userUID: currentUser.user?.uid,
        });

        // Show notification using imported dataManager
        dataManager.showNotification(
          "You must be logged in to view this page.",
          "warning"
        );
        return; // Stop navigation!
      }
    }

    // Navigating to route

    // 🚀 IMMEDIATE PRESENCE UPDATE: Update lastActive on SPA navigation to key pages
    // Allow a one-time skip (e.g., immediately after logout) via session flag
    const skipLastActiveOnce =
      sessionStorage.getItem("skipLastActiveOnce") === "true";
    if (skipLastActiveOnce) {
      sessionStorage.removeItem("skipLastActiveOnce");
    }
    if (
      !skipLastActiveOnce &&
      currentUser.isLoggedIn() &&
      (route === "home" || route === "friends")
    ) {
      try {
        await dataManager.updateUserLastActive(currentUser.user.uid);
        console.log(`⚡ Immediate lastActive update on navigation to ${route}`);
      } catch (lastActiveError) {
        console.warn(
          `⚠️ Failed to update lastActive on ${route} navigation (non-critical):`,
          lastActiveError
        );
      }
    }

    try {
      // 🎯 LEARNING: Show the loading indicator at the start of the navigation process.
      this.showLoading();

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
    } catch (error) {
      console.error(`❌ Error loading page ${route}:`, error);
      this.showErrorFeedback(`Failed to load ${route}.`);
    } finally {
      // 🎯 LEARNING: The finally block ensures the loading indicator is always hidden,
      // even if an error occurs during page load.
      this.hideLoading();
    }
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
      // Concurrency control: create a new nav context and cancel previous
      this._navId += 1;
      const navId = this._navId;
      if (this._abortController) {
        try {
          this._abortController.abort();
        } catch {}
      }
      this._abortController = new AbortController();
      const { signal } = this._abortController;

      // Loading page and route config

      // Update page title
      document.title = routeData.title;

      // Update meta description
      this.updateMetaDescription(routeData.description);

      // Add body class for page-specific styling
      this.updateBodyClass(route);

      // Load CSS files if needed
      await this.loadCSS(routeData.cssFiles);

      // Load the HTML template (cancellable)
      const htmlContent = await this.loadTemplate(routeData.template, signal);

      // If a newer navigation started, abandon this one
      if (this._navId !== navId) {
        console.log(
          "⏭️ Navigation superseded, abandoning DOM updates for",
          route
        );
        return;
      }

      // 🛡️ Additional validation before injecting content
      if (!htmlContent || htmlContent.trim().length === 0) {
        throw new Error(`Template ${routeData.template} is empty`);
      }

      // 🧹 Before clearing, dispatch page unload for previous route (if any)
      const leavingRoute = this.currentPage;
      if (leavingRoute && leavingRoute !== route) {
        const unloadEvent = new CustomEvent("spa:page:unload", {
          detail: { route: leavingRoute, router: this, targetRoute: route },
        });
        document.dispatchEvent(unloadEvent);
        console.log(
          `🔔 Dispatched spa:page:unload for route: ${leavingRoute} → ${route}`
        );
      }

      // Clear main content container completely before injecting new content
      // This prevents any residual content from previous pages
      this.mainContentContainer.innerHTML = "";

      // 🛡️ Final validation: Check if content contains navigation elements
      // (which would indicate we accidentally loaded index.html)
      if (
        htmlContent.includes("<nav") ||
        htmlContent.includes('class="top-nav"') ||
        htmlContent.includes('class="nav-')
      ) {
        console.error(
          `🚨 Template content contains navigation elements - this indicates index.html was loaded instead of template`
        );
        console.error(
          "Template content preview:",
          htmlContent.substring(0, 500)
        );
        throw new Error(
          `Template ${routeData.template} contains navigation elements, indicating wrong content was loaded`
        );
      }

      // Update the main content
      console.log(
        `📝 Injecting template content into main-content (${htmlContent.length} chars)`
      );
      this.mainContentContainer.innerHTML = htmlContent;

      // Accessibility: move focus to main content after navigation
      try {
        this.mainContentContainer.setAttribute("tabindex", "-1");
        this.mainContentContainer.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      } catch {}

      // Load and execute page controller code lazily
      await this.loadRouteCode(routeData);

      // Update current page BEFORE navigation states to ensure consistency
      this.currentPage = route;

      // 📊 Track page view in analytics
      AnalyticsService.trackPageView(route, window.location.hash);

      // Update navigation active states
      this.updateNavigationStates(route);

      // Update URL hash to match current route (for direct linking and refresh)
      if (window.location.hash !== `#${route}`) {
        history.replaceState({ route }, routeData.title, `#${route}`);
      }

      // Dispatch custom event for other parts of the app
      this.dispatchNavigationEvent(route);

      // Dispatch route changed event for mobile navigation
      this.dispatchRouteChangedEvent(route);

      // 🎯 NEW: Announce that the page content is loaded and ready for initialization
      this.dispatchPageLoadEvent(route);

      console.log(`✅ Successfully loaded page: ${route}`);
    } catch (error) {
      if (error?.name === "AbortError") {
        console.log("🛑 Navigation aborted (newer route started)");
        return;
      }
      console.error(`❌ Error loading page ${route}:`, error);
      // 🎯 REFACTOR: The navigateTo method's finally block will handle hiding the loader.
      this.showErrorPage(error);
    }
  }

  /**
   * Load CSS files dynamically
   * 🎯 Learning: Each page can have its own styles that load on demand
   * 🏗️ Production Fix: Skip CSS loading in production since Vite bundles all CSS
   */
  async loadCSS(cssFiles) {
    if (!cssFiles || cssFiles.length === 0) return;

    // 🏗️ PRODUCTION FIX: Use Vite's native production detection + preview mode detection
    // In Vite builds (including `vite preview`), all CSS is already extracted by Vite
    // Check both import.meta.env.PROD and if we're running from built files (preview mode)
    const isBuiltMode =
      (import.meta.env && import.meta.env.PROD) ||
      (window.location.port && parseInt(window.location.port) >= 4173);

    if (isBuiltMode) {
      // Production/preview mode: CSS bundled by Vite
      return;
    }

    // 🔧 Development mode: Load CSS dynamically for hot reloading
    // Development mode - loading CSS files dynamically

    const promises = cssFiles.map((cssFile) => {
      return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`link[href="${cssFile}"]`)) {
          // CSS already loaded
          resolve();
          return;
        }

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssFile;
        link.onload = () => {
          // CSS loaded successfully
          resolve();
        };
        link.onerror = (error) => {
          console.error(`❌ Failed to load CSS: ${cssFile}`, error);
          reject(error);
        };
        document.head.appendChild(link);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Load HTML template with validation to prevent loading full documents
   * 🎯 Learning: Fetch content from separate HTML files
   * 🛡️ Security: Validate that we get template fragments, not full HTML documents
   */
  async loadTemplate(templatePath, signal) {
    // Ensure absolute path to prevent routing context issues
    const url = templatePath.startsWith("/")
      ? templatePath
      : "/" + templatePath;

    if (logManager?.dev) logManager.dev.debug(`Loading template: ${url}`);

    const response = await fetch(url, { signal });
    if (!response.ok) {
      console.error(`❌ Template fetch failed: ${url} (${response.status})`);
      throw new Error(
        `Failed to load template: ${url} - ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();

    // 🛡️ CRITICAL FIX: Detect if we accidentally got a full HTML document
    // instead of a template fragment (happens when Vite's history API fallback
    // serves index.html for 404'd template requests)
    if (looksLikeFullDocument(html)) {
      console.error(
        `🚨 Template fetch returned full HTML document instead of fragment: ${url}`
      );
      console.error(
        "This usually means the template file wasn't found and Vite served index.html as fallback"
      );
      console.error("First 200 chars of response:", html.substring(0, 200));
      throw new Error(
        `Template loading error: ${url} returned a full HTML document instead of a template fragment. Check that the template file exists.`
      );
    }

    // Template loaded successfully
    return html;
  }

  /**
   * Load page controller code lazily using dynamic imports (dev and prod)
   * Prefers `jsImporters` (functions returning import Promises) for bundling.
   * Falls back to `jsFiles` (paths) in dev via script tag injection.
   */
  async loadRouteCode(routeData) {
    const importers = routeData.jsImporters || [];
    if (importers.length > 0) {
      // Use dynamic imports so Vite can code-split in production
      for (const importer of importers) {
        try {
          await importer();
        } catch (e) {
          console.error("❌ Failed to load route module via importer", e);
          throw e;
        }
      }
      return;
    }

    // Fallback to legacy jsFiles via script tag (dev only)
    const jsFiles = routeData.jsFiles || [];
    if (jsFiles.length === 0) return;

    const isBuiltMode =
      (import.meta.env && import.meta.env.PROD) ||
      (window.location.port && parseInt(window.location.port) >= 4173);
    if (isBuiltMode) {
      // In builds we expect modules to be bundled; no script-tag loading.
      return;
    }

    for (const jsFile of jsFiles) {
      if (document.querySelector(`script[src="${jsFile}"]`)) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "module";
        script.src = jsFile;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
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

    if (logManager?.dev)
      logManager.dev.debug(`Updated body class to: page-${route}`);
  }

  /**
   * Update navigation active states
   * 🎯 Learning: Visual feedback shows users where they are
   */
  updateNavigationStates(activeRoute) {
    // New logic: ensure the visual active state is applied to primary nav links (.nav-link),
    // not the logo or dropdown items that also have data-spa-route attributes.

    // 1. Clear existing active classes only from top-level nav links & any stray elements
    document
      .querySelectorAll(".nav-link.active")
      .forEach((el) => el.classList.remove("active"));
    // Also remove from logo if previously applied (legacy behavior)
    const brand = document.querySelector(".logo [data-spa-route].active");
    if (brand) brand.classList.remove("active");

    // 2. Find matching nav links for the active route
    const matchingNavLinks = document.querySelectorAll(
      `.nav-link[data-spa-route="${activeRoute}"]`
    );
    if (matchingNavLinks.length > 0) {
      matchingNavLinks.forEach((el) => el.classList.add("active"));
      return;
    }

    // 3. Fallback: if no .nav-link found (e.g., future minimal route), apply to first element with the route
    const fallback = document.querySelector(
      `[data-spa-route="${activeRoute}"]`
    );
    if (fallback) fallback.classList.add("active");
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
   * Enhanced to handle offline scenarios gracefully
   */
  showErrorPage(error) {
    console.log("🔍 Analyzing error for appropriate response:", error);

    // 🛡️ SAFETY: Ensure error has a message property
    const errorMessage =
      error?.message || error?.toString() || "Unknown error occurred";
    const errorName = error?.name || "Error";

    // Check if this is an offline/network error
    const isOfflineError =
      !navigator.onLine ||
      errorMessage.includes("fetch") ||
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError") ||
      (errorName === "TypeError" && errorMessage.includes("fetch"));

    if (isOfflineError) {
      console.log("📱 Detected offline error - showing appropriate message");

      // Use the notification system for offline errors instead of replacing content
      if (window.dataManager?.showNotification) {
        window.dataManager.showNotification(
          "📱 You're offline! Some features may not work until you reconnect.",
          "warning",
          { duration: 8000 }
        );
      } else {
        console.warn(
          "📱 Offline detected but notification system not available"
        );
      }

      // Don't replace the current page content when offline
      // Instead, just stay where we are with a helpful message
      return;
    }

    // For genuine errors (not offline), show the error page
    const isTemplateError = errorMessage && errorMessage.includes("template");
    const errorIcon = isTemplateError ? "📄" : "Error 404";
    const errorTitle = isTemplateError
      ? "Template Loading Error"
      : "Oops! Something went wrong";
    const displayMessage = isTemplateError
      ? "We had trouble loading the page template. This might be a temporary issue."
      : "We couldn't load this page. Please try again.";

    this.mainContentContainer.innerHTML = `
      <div class="error-page" style="text-align: center; padding: 3rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">${errorIcon}</div>
        <h2>${errorTitle}</h2>
        <p style="color: #666; margin-bottom: 2rem;">
          ${displayMessage}
        </p>
        <div style="margin-bottom: 2rem;">
          <button onclick="window.location.reload()" class="btn btn-secondary" style="margin-right: 1rem;">
            <i class="fas fa-refresh"></i> Refresh Page
          </button>
          <button id="router-error-go-home" class="btn btn-primary">
            <i class="fas fa-home"></i> Go Home
          </button>
        </div>
        <details style="margin-top: 2rem; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">
          <summary style="cursor: pointer; color: #666;">Technical Details</summary>
          <pre style="background: #f5f5f5; padding: 1rem; border-radius: 8px; overflow: auto; margin-top: 1rem;">
Error: ${errorMessage}
Type: ${errorName}
Stack: ${error?.stack || "No stack trace available"}
          </pre>
        </details>
      </div>
    `;

    // Attach safe navigation without relying on window globals
    const goHomeBtn = this.mainContentContainer.querySelector(
      "#router-error-go-home"
    );
    if (goHomeBtn) {
      goHomeBtn.addEventListener("click", () => {
        try {
          this.navigateTo("home");
        } catch {
          // Fallback to hash navigation if router is unavailable
          window.location.hash = "#home";
        }
      });
    }
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
   * Dispatch route changed event for mobile navigation active states
   */
  dispatchRouteChangedEvent(route) {
    const event = new CustomEvent("spa:route:changed", {
      detail: { route, router: this },
    });
    document.dispatchEvent(event);
  }

  /**
   * 🎯 NEW: Dispatch event after page content is loaded into the DOM.
   * This is the signal for page-specific scripts to initialize.
   */
  dispatchPageLoadEvent(route) {
    const event = new CustomEvent("spa:page:load", {
      detail: { route, router: this },
    });
    document.dispatchEvent(event);
    console.log(`🔔 Dispatched spa:page:load event for route: ${route}`);
  }

  /**
   * Show error feedback to user
   * 🎯 Learning: Provide user-friendly error messages
   */
  showErrorFeedback(message) {
    console.error("🚨 SPA Router Error:", message);

    // Use data manager for notifications if available
    if (window.dataManager?.showNotification) {
      window.dataManager.showNotification(message, "error", { duration: 5000 });
    } else {
      // Fallback to alert if notification system not available
      alert(message);
    }
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
}

// 🎯 Learning: Export the class so other files can use it
// Export the SPARouter class for ES6 modules
export default SPARouter;
