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
import { notificationManager } from "../services/realtime/NotificationService.js"; // 🎯 NEW: Import notificationManager
import { logManager } from "../utils/debug/LogManager.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js"; // 📊 Track page views
import { profileCache } from "../cache/profileCache.js"; // 🚀 Session hint for faster initial route

// Lazy DataService loader so Firestore bundle is only pulled in when needed
let routerDataManagerPromise = null;
async function getRouterDataManager() {
  if (!routerDataManagerPromise) {
    routerDataManagerPromise = import("../services/data/DataService.js")
      .then((mod) => mod.dataManager)
      .catch((error) => {
        logManager.system.warn(
          "Router: Failed to load DataService (non-critical):",
          error
        );
        return null;
      });
  }
  return routerDataManagerPromise;
}

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
      landing: {
        title: "MeetchuThere - Connect with Campus Friends",
        template: "/templates/landing.html",
        cssFiles: ["/src/css/styles.css"],
        jsImporters: [() => import("/src/js/pages/LandingPage.js")],
        description:
          "Connect with your university friends and know when they're on campus",
        canonicalPath: "/",
        indexable: true,
        og: { image: "/icons/icon-512x512.png", type: "website" },
      },
      home: {
        title: "Schedule - MeetchuThere",
        template: "/templates/home.html", // ✅ Fixed: Absolute path to prevent fallback to index.html
        cssFiles: [
          "/src/css/styles.css", // ✅ Fixed: Absolute path from root for Vite
        ],
        jsImporters: [() => import("/src/js/pages/HomePage.js")], // Lazy-load Home page controller (dev and prod)
        description: "Manage your weekly schedule and compare with friends",
        requiresAuth: true, // 🛡️ Now requires authentication
        indexable: false,
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
        requiresAuth: true, // 🛡️ Requires authentication
        indexable: false,
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
        indexable: false,
      },
      notifications: {
        title: "Notifications - MeetchuThere",
        template: "/templates/notifications.html",
        cssFiles: ["/src/css/styles.css", "/src/css/notifications.css"],
        jsImporters: [() => import("/src/js/pages/NotificationsPage.js")],
        description:
          "View your campus social notifications and location sharing requests",
        requiresAuth: true, // 🛡️ This page requires a user to be logged in
        indexable: false,
      },
      messages: {
        title: "Messages - MeetchuThere",
        template: "/templates/groups.html",
        cssFiles: ["/src/css/styles.css", "/src/css/groups.css"],
        jsImporters: [() => import("/src/js/pages/GroupsPage.js")],
        description: "Your class spaces and group chats",
        requiresAuth: true,
        indexable: false,
      },
      groups: {
        title: "Clubs - MeetchuThere",
        template: "/templates/clubs.html",
        cssFiles: ["/src/css/styles.css", "/src/css/clubs/index.css"],
        jsImporters: [() => import("/src/js/pages/ClubsPage.js")],
        description: "Campus clubs and events",
        requiresAuth: true,
        indexable: false,
      },
      clubs: {
        title: "Clubs - MeetchuThere",
        template: "/templates/clubs.html",
        cssFiles: ["/src/css/styles.css", "/src/css/clubs/index.css"],
        jsImporters: [() => import("/src/js/pages/ClubsPage.js")],
        description: "Campus clubs and student organizations",
        requiresAuth: true,
        indexable: false,
      },
      club: {
        title: "Club - MeetchuThere",
        template: "/templates/club.html",
        cssFiles: ["/src/css/styles.css", "/src/css/clubs/index.css"],
        jsImporters: [() => import("/src/js/pages/ClubDetailPage.js")],
        description: "Club detail, members and events",
        requiresAuth: true,
        indexable: false,
      },
      group: {
        title: "Group - MeetchuThere",
        template: "/templates/group.html",
        cssFiles: ["/src/css/styles.css"],
        jsImporters: [() => import("/src/js/pages/GroupDetailPage.js")],
        description: "Class space chat and members",
        requiresAuth: true,
        indexable: false,
      },
      user: {
        title: "Profile - MeetchuThere",
        template: "/templates/user-profile.html",
        cssFiles: ["/src/css/styles.css", "/src/css/user-profile.css"],
        jsImporters: [() => import("/src/js/pages/UserProfilePage.js")],
        description: "View a student profile",
        requiresAuth: true,
        indexable: false,
      },
      about: {
        title: "About - MeetchuThere",
        template: "/templates/about.html", // ✅ Fixed: Absolute path to prevent fallback to index.html
        cssFiles: [],
        jsFiles: [],
        description: "Learn about the developer and the app",
        canonicalPath: "/about/",
        indexable: true,
        og: { image: "/icons/icon-512x512.png", type: "website" },
      },
    };

    this.currentPage = "landing"; // Default page now landing
    this.mainContentContainer = null; // Will hold our content area
    this.loadingIndicator = null;
    // Navigation concurrency & cancellation
    this._navId = 0;
    this._abortController = null;
    // Auth/navigation noise control
    this._authRedirectTimer = null;
    this._lastAuthSnapshot = { isLoggedIn: null, route: null, ts: 0 };
    this._pendingRoute = null;
    this._lastNavigation = { route: null, ts: 0 };
    this._navVisibility = { hidden: null };
    // During first page load we may suppress auth-driven redirects
    this._suppressAuthRedirects = false;
    // Prevent re-entrant profile gate redirects
    this._profileGateInProgress = false;
    // Allow SPA init to skip the first full-screen loading overlay
    this._skipNextLoadingOverlay = false;
    // Short auth grace window so returning users with a cached
    // session hint can see their schedule immediately while
    // Firebase Auth finishes hydrating in the background.
    this._initialAuthGraceUntil = Date.now() + 5000;

    // 🎯 Learning: Initialize the router when created
    this.init();
  }

  /**
   * Extract the route name from a location hash, ignoring query params.
   * Example: "#user?id=123" -> "user" if defined in routes.
   */
  _parseRouteName(rawHash) {
    try {
      const raw = String(rawHash || "").replace(/^#/, "");
      const name = raw.split("?")[0];
      if (name && this.routes[name]) return name;
      return this.routes[raw] ? raw : "home";
    } catch (_) {
      return "home";
    }
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
      logManager.system.error(
        "❌ Main content container not found! SPA Router cannot work."
      );
      logManager.system.debug(
        "📋 Available elements with class 'main':",
        document.querySelectorAll("[class*='main']")
      );
      logManager.system.debug(
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

    // Set up auth state change handling
    this.setupAuthStateHandling();

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
        route = this._parseRouteName(window.location.hash);
      }

      // Navigating via browser
      // Harden: if target requires auth and Firebase auth state isn't ready yet, gate with loader
      const requiresAuth = this.routes[route]?.requiresAuth === true;
      const hasFirebaseUser = !!authManager?.auth?.currentUser;
      const hasSessionHint =
        hasFirebaseUser || !!profileCache.peek() || currentUser.isLoggedIn();
      if (requiresAuth && !hasFirebaseUser) {
        // Defer handling to smart loader flow to avoid content flash
        this._suppressAuthRedirects = true;
        this.showLoading();
        Promise.resolve()
          .then(async () => {
            if (
              authManager?.authReady &&
              typeof authManager.authReady.then === "function"
            ) {
              await Promise.race([
                authManager.authReady.catch(() => {}),
                new Promise((r) => setTimeout(r, hasSessionHint ? 3500 : 1500)),
              ]);
            } else {
              await new Promise((r) => setTimeout(r, 250));
            }
            const authed = !!authManager?.auth?.currentUser;
            await this.loadPage(authed ? route : "landing", false);
          })
          .finally(() => {
            this._suppressAuthRedirects = false;
            this.hideLoading();
          });
        return;
      }

      this.loadPage(route, false); // Don't update history again
    });

    // Also listen for hash changes (in case someone manually types a URL)
    window.addEventListener("hashchange", (event) => {
      // Hash change detected
      const route = this._parseRouteName(window.location.hash);

      // Only navigate if it's different from current page
      if (route !== this.currentPage) {
        // Hash navigation with auth hardening
        const requiresAuth = this.routes[route]?.requiresAuth === true;
        const hasFirebaseUser = !!authManager?.auth?.currentUser;
        const hasSessionHint =
          hasFirebaseUser || !!profileCache.peek() || currentUser.isLoggedIn();
        if (requiresAuth && !hasFirebaseUser) {
          this._suppressAuthRedirects = true;
          this.showLoading();
          Promise.resolve()
            .then(async () => {
              if (
                authManager?.authReady &&
                typeof authManager.authReady.then === "function"
              ) {
                await Promise.race([
                  authManager.authReady.catch(() => {}),
                  new Promise((r) =>
                    setTimeout(r, hasSessionHint ? 3500 : 1500)
                  ),
                ]);
              } else {
                await new Promise((r) => setTimeout(r, 250));
              }
              const authed = !!authManager?.auth?.currentUser;
              await this.loadPage(authed ? route : "landing", false);
            })
            .finally(() => {
              this._suppressAuthRedirects = false;
              this.hideLoading();
            });
        } else {
          this.loadPage(route, false);
        }
      }
    });
  }

  /**
   * Set up auth state change handling for automatic redirects
   * 🎯 This ensures users are redirected appropriately when they log in/out
   */
  setupAuthStateHandling() {
    // Subscribe to currentUser state changes
    currentUser.subscribe((state) => {
      const isLoggedIn = state.isLoggedIn;
      const currentRoute = this.currentPage;

      logManager.auth.login(
        `🔐 Router: Auth state changed - isLoggedIn: ${isLoggedIn}, currentRoute: ${currentRoute}`
      );

      // Coalesce rapid successive auth updates (profile/user set) into a single redirect decision
      if (this._authRedirectTimer) clearTimeout(this._authRedirectTimer);
      this._authRedirectTimer = setTimeout(() => {
        // Optionally suppress redirects during initial smart load
        if (this._suppressAuthRedirects) {
          return;
        }
        // Skip if nothing effectively changed very recently
        const now = Date.now();
        if (
          this._lastAuthSnapshot.isLoggedIn === isLoggedIn &&
          this._lastAuthSnapshot.route === currentRoute &&
          now - this._lastAuthSnapshot.ts < 300
        ) {
          return;
        }
        this._lastAuthSnapshot = { isLoggedIn, route: currentRoute, ts: now };
        this.handleAuthRedirect(isLoggedIn, currentRoute);
      }, 100); // Small delay to ensure auth state is fully settled
    });
  }

  /**
   * Handle automatic redirects based on authentication state
   * @param {boolean} isLoggedIn - Whether user is logged in
   * @param {string} currentRoute - Current route name
   */
  handleAuthRedirect(isLoggedIn, currentRoute) {
    try {
      if (isLoggedIn) {
        // User just logged in
        if (currentRoute === "landing") {
          logManager.auth.login(
            "🏠 User logged in from landing page, redirecting to home"
          );
          this.navigateTo("home");
        } else {
          // Update navigation visibility without redirecting
          this.updateNavigationVisibility(currentRoute);
        }
      } else {
        // User just logged out or is not authenticated
        const routeConfig = this.routes[currentRoute];
        if (routeConfig?.requiresAuth) {
          // Check if this was an intentional logout for better UX
          const wasIntentionalLogout =
            sessionStorage.getItem("intentionalLogout") === "true";
          if (wasIntentionalLogout) {
            sessionStorage.removeItem("intentionalLogout");
            logManager.auth.logout(
              `👋 User intentionally logged out from ${currentRoute}, redirecting to landing`
            );
          } else {
            logManager.auth.logout(
              `🔒 User logged out from protected route (${currentRoute}), redirecting to landing`
            );
          }
          this.navigateTo("landing");
        } else {
          // Update navigation visibility even if not redirecting
          this.updateNavigationVisibility(currentRoute);
        }
      }
    } catch (error) {
      logManager.system.error("❌ Error in handleAuthRedirect:", error);
    }
  }

  /**
   * Load the initial page based on current URL
   * 🎯 Learning: When someone visits a direct link, show the right page
   */
  loadInitialPage() {
    // Parse the current URL to determine which page to load
    const hash = window.location.hash;
    const route = this._parseRouteName(hash);
    // Let navigateTo handle all auth gating and redirects.
    this.navigateTo(route, false);
  }

  /**
   * Smart initial load that avoids flashing the landing page on refresh.
   * If the requested route requires auth and auth isn’t resolved yet,
   * show the SPA loader and wait briefly for auth before deciding.
   * @param {Promise<void>} authReadyPromise - Promise that resolves when auth state is known
   * @param {number} timeoutMs - Max time to wait for auth before falling back
   */
  async loadInitialPageSmart(authReadyPromise, timeoutMs = 1500) {
    // Determine desired route from hash (or default to home)
    const desiredRoute = this._parseRouteName(window.location.hash);
    const desiredConfig = this.routes[desiredRoute];
    // 🚀 Session hint: if we have a cached profile or store says logged in, prefer waiting longer vs flashing landing
    const hasSessionHint =
      !!authManager?.auth?.currentUser ||
      !!profileCache.peek() ||
      (currentUser && currentUser.isLoggedIn && currentUser.isLoggedIn());
    const effectiveTimeout = hasSessionHint
      ? Math.max(timeoutMs, 3500)
      : timeoutMs;

    // If the URL explicitly points to landing, avoid flashing it for users who are already (or will soon be) authenticated
    const firebaseUser = authManager?.auth?.currentUser;
    const alreadyAuthed = !!firebaseUser;
    if (desiredRoute === "landing") {
      // If we already know user is authenticated, go straight to home
      if (alreadyAuthed) {
        return this.navigateTo("home", false);
      }

      // Otherwise, wait briefly for auth to resolve before deciding, showing the loader meanwhile
      this._suppressAuthRedirects = true;
      this.showLoading();
      try {
        if (authReadyPromise && typeof authReadyPromise.then === "function") {
          await Promise.race([
            authReadyPromise.catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, effectiveTimeout)),
          ]);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        const isAuthedNow = !!authManager?.auth?.currentUser;
        const target = isAuthedNow ? "home" : "landing";
        await this.navigateTo(target, true);
      } finally {
        this._suppressAuthRedirects = false;
        this.hideLoading();
      }
      return;
    }

    // If route doesn’t require auth or user already known/logged in, proceed immediately
    if (!desiredConfig?.requiresAuth || !!authManager?.auth?.currentUser) {
      return this.navigateTo(desiredRoute, false);
    }

    // Route requires auth but Firebase auth user is not yet known — avoid flashing landing and wait briefly
    this._suppressAuthRedirects = true;
    if (!hasSessionHint) {
      this.showLoading();
    }
    try {
      if (authReadyPromise && typeof authReadyPromise.then === "function") {
        await Promise.race([
          authReadyPromise.catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, effectiveTimeout)),
        ]);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const isAuthedNow = !!authManager?.auth?.currentUser;
      // If we have a session hint, prefer not flashing landing; keep waiting a bit longer
      if (!isAuthedNow && hasSessionHint) {
        try {
          await Promise.race([
            authReadyPromise?.catch?.(() => {}) || Promise.resolve(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
          ]);
        } catch (_) {}
      }
      const authedUser = authManager?.auth?.currentUser;
      // With a strong session hint (cached profile / user store), prefer
      // rendering the intended protected route instead of bouncing through
      // the landing page, even if Firebase auth has not fully hydrated yet.
      const target = authedUser || hasSessionHint ? desiredRoute : "landing";
      await this.navigateTo(target, true);
    } finally {
      this._suppressAuthRedirects = false;
      this.hideLoading();
    }
    return;

    // Route requires auth but user not known yet — avoid flashing landing
    // Show loader and temporarily suppress auth-driven redirects
    this._suppressAuthRedirects = true;
    this.showLoading();

    try {
      // Wait for authReady or timeout
      if (authReadyPromise && typeof authReadyPromise.then === "function") {
        await Promise.race([
          authReadyPromise.catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      } else {
        // No auth promise provided; still wait a tiny moment to allow onAuthStateChanged to fire
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const isAuthedNow = currentUser.isLoggedIn() && currentUser.user;
      const target = isAuthedNow ? desiredRoute : "landing";
      await this.navigateTo(target, true);
    } finally {
      this._suppressAuthRedirects = false;
      this.hideLoading();
    }
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
      logManager.error(`❌ Route not found: ${route}`);
      this.showErrorFeedback(`Page not found: ${route}`);
      return;
    }

    // Prevent duplicate navigations to the same route within a short window or while a nav is already pending
    const now = Date.now();
    if (
      (this._pendingRoute && this._pendingRoute === route) ||
      (this._lastNavigation.route === route &&
        now - this._lastNavigation.ts < 300)
    ) {
      logManager.debug("⏭️ Duplicate navigation to same route ignored");
      return;
    }
    this._pendingRoute = route;
    this._lastNavigation = { route, ts: now };

    // 🛡️ Authentication Check with proper ES6 imports!
    const routeConfig = this.routes[route];
    if (routeConfig.requiresAuth) {
      // Use Firebase auth currentUser as the source of truth (avoid optimistic store hydration)
      let isAuthenticated = !!authManager?.auth?.currentUser;

      // Stabilization: if store says logged in but Firebase isn't ready yet, wait briefly
      if (
        !isAuthenticated &&
        currentUser.isLoggedIn() &&
        authManager?.authReady
      ) {
        try {
          const hasSessionHint =
            !!authManager?.auth?.currentUser ||
            !!profileCache.peek() ||
            currentUser.isLoggedIn();
          await Promise.race([
            authManager.authReady.catch(() => {}),
            new Promise((r) => setTimeout(r, hasSessionHint ? 2500 : 1000)),
          ]);
        } catch (_) {}
        isAuthenticated = !!authManager?.auth?.currentUser;
      }

      // During the very first navigation after app startup, allow a brief
      // optimistic window where a strong session hint (cached profile/user)
      // can unlock protected routes even if Firebase hasn't populated
      // auth.currentUser yet. This lets returning users see their schedule
      // immediately from local cache while auth/network hydrate in the background.
      if (!isAuthenticated) {
        const hasSessionHint =
          !!authManager?.auth?.currentUser ||
          !!profileCache.peek() ||
          currentUser.isLoggedIn();
        const withinInitialGrace =
          typeof this._initialAuthGraceUntil === "number" &&
          Date.now() <= this._initialAuthGraceUntil;

        if (hasSessionHint && withinInitialGrace) {
          logManager.auth.login(
            `🕒 Initial auth grace: allowing optimistic access to protected route: ${route}`
          );
          isAuthenticated = true;
        }
      }

      if (!isAuthenticated) {
        logManager.auth.error(
          `🔒 Access denied to route: ${route}. Redirecting to landing page.`
        );
        logManager.dev.debug("🔍 Debug auth state:", {
          hasFirebaseUser: !!authManager?.auth?.currentUser,
          hasUserStore: !!currentUser.user,
          isLoggedInStore: currentUser.isLoggedIn(),
          userUIDStore: currentUser.user?.uid,
        });

        // Redirect to landing page (suppress extra toasts)
        this.navigateTo("landing", updateHistory);
        if (this._pendingRoute === route) this._pendingRoute = null;
        return;
      }

      // 🧭 Profile Completion Gate: ensure users complete setup before using protected routes
      // If navigating to any protected route other than 'profile', verify setup completion.
      // This covers first-login flow and direct hash navigation.
      if (route !== "profile") {
        const redirected = await this._ensureProfileCompletionGate(
          updateHistory
        );
        if (redirected) {
          if (this._pendingRoute === route) this._pendingRoute = null;
          return; // navigation has been redirected to profile setup
        }
      }
    }

    // 🛡️ If authenticated user tries to access landing page, redirect to home
    if (route === "landing") {
      const hasFirebaseUser = !!authManager?.auth?.currentUser;
      const intentionalLogout =
        sessionStorage.getItem("intentionalLogout") === "true";

      if (hasFirebaseUser) {
        logManager.info(
          "🏠 Authenticated user accessing landing, redirecting to home"
        );
        this.navigateTo("home", updateHistory);
        return;
      }

      // Stabilization: if store says logged in but Firebase user isn't ready yet,
      // wait briefly for authReady before deciding. Do not bounce if it's an intentional logout.
      if (
        !intentionalLogout &&
        currentUser.isLoggedIn() &&
        authManager?.authReady
      ) {
        try {
          const hasSessionHint =
            !!authManager?.auth?.currentUser ||
            !!profileCache.peek() ||
            currentUser.isLoggedIn();
          await Promise.race([
            authManager.authReady.catch(() => {}),
            new Promise((r) => setTimeout(r, hasSessionHint ? 2500 : 1000)),
          ]);
        } catch (_) {}
        if (authManager?.auth?.currentUser) {
          logManager.info(
            "🏠 Authenticated user accessing landing (post-wait), redirecting to home"
          );
          this.navigateTo("home", updateHistory);
          return;
        }
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
        const dm = await getRouterDataManager();
        if (dm && currentUser.user?.uid) {
          await dm.updateUserLastActive(currentUser.user.uid);
          logManager.system.info(
            `⚡ Immediate lastActive update on navigation to ${route}`
          );
        }
      } catch (lastActiveError) {
        logManager.system.warn(
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
        const currentHash = window.location.hash || "";
        const targetHash = currentHash.startsWith(`#${route}?`)
          ? currentHash
          : `#${route}`;
        const historyStateRoute =
          (history.state && history.state.route) || null;
        const isDuplicate =
          historyStateRoute === route && currentHash === targetHash;
        const isInitialLoadSameHash =
          !history.state && currentHash === targetHash; // page reload scenario
        // Avoid pushing duplicate history entries (prevents double-back issue after reload)
        if (!isDuplicate && !isInitialLoadSameHash) {
          history.pushState({ route }, routeData.title, targetHash);
        } else {
          logManager.dev &&
            logManager.dev.debug(
              "[Router] Skipped pushState (duplicate/initial reload) for route",
              route
            );
        }
      }

      // Load the page content
      await this.loadPage(route);
    } catch (error) {
      logManager.error(`❌ Error loading page ${route}:`, error);
      this.showErrorFeedback(`Failed to load ${route}.`);
    } finally {
      // 🎯 LEARNING: The finally block ensures the loading indicator is always hidden,
      // even if an error occurs during page load.
      this.hideLoading();
      this._pendingRoute = null;
    }
  }

  /**
   * Ensure the authenticated user has completed profile setup before proceeding to protected routes.
   * Redirects to 'profile' when `systemInfo.profileSetupComplete` is false or missing.
   * Returns true if a redirect occurred.
   *
   * This gate is tolerant to first-login races by first checking the store,
   * then awaiting hydration briefly, and finally fetching from Firestore.
   */
  async _ensureProfileCompletionGate(updateHistory = true) {
    if (this._profileGateInProgress) return false;
    const firebaseUser = authManager?.auth?.currentUser;
    if (!firebaseUser) return false;

    this._profileGateInProgress = true;
    try {
      // Fast path: check hydrated store
      let isComplete = !!(
        currentUser?.profile?.systemInfo?.profileSetupComplete === true
      );

      // Wait briefly for hydration if not complete yet
      if (!isComplete) {
        try {
          if (typeof currentUser?.waitForProfileWithTimeout === "function") {
            await currentUser.waitForProfileWithTimeout(1500).catch(() => {});
          } else {
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch (_) {}
        isComplete = !!(
          currentUser?.profile?.systemInfo?.profileSetupComplete === true
        );
      }

      // Last resort: fetch from Firestore directly
      if (!isComplete) {
        try {
          const dm = await getRouterDataManager();
          if (dm) {
            const profileDoc = await dm.getUserProfile(firebaseUser.uid);
            if (profileDoc) {
              isComplete = !!(
                profileDoc?.systemInfo?.profileSetupComplete === true
              );
              // Opportunistically hydrate store for consistency
              if (!currentUser?.profile) {
                try {
                  currentUser.setProfile(profileDoc);
                } catch (_) {}
              }
            }
          }
        } catch (_) {}
      }

      if (!isComplete) {
        // Redirect to profile setup
        await this.navigateTo("profile", updateHistory);
        return true;
      }
      return false;
    } finally {
      this._profileGateInProgress = false;
    }
  }

  /**
   * Load page content and resources
   * 🎯 Learning: This does the heavy lifting of swapping content
   *
   * @param {string} route - The route to load
   * @param {boolean} _updateHistory - Whether this should update history (unused, handled by navigateTo)
   */
  async loadPage(route, _updateHistory = true) {
    const routeData = this.routes[route];
    if (!routeData) {
      logManager.error(`❌ Route data not found for: ${route}`);
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

      // Update meta description and social tags
      this.updateMetaDescription(routeData.description);
      this.updateRobotsMeta(routeData.indexable !== false);
      const canonicalUrl = this.updateCanonicalUrl(
        routeData.canonicalPath || null
      );
      this.updateOpenGraphTags({
        title: routeData.title,
        description: routeData.description,
        url: canonicalUrl,
        image: routeData?.og?.image || "/icons/icon-512x512.png",
        type: routeData?.og?.type || "website",
      });

      // Add body class for page-specific styling
      this.updateBodyClass(route);

      // Load CSS files if needed
      await this.loadCSS(routeData.cssFiles);

      // Load the HTML template (cancellable)
      const htmlContent = await this.loadTemplate(routeData.template, signal);

      // If a newer navigation started, abandon this one
      if (this._navId !== navId) {
        logManager.debug(
          "⏭️ Navigation superseded, abandoning DOM updates for",
          route
        );
        // Clear pending flag if this navigation got superseded
        if (this._pendingRoute === route) this._pendingRoute = null;
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
        logManager.debug(
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
        logManager.error(
          `🚨 Template content contains navigation elements - this indicates index.html was loaded instead of template`
        );
        logManager.error(
          "Template content preview:",
          htmlContent.substring(0, 500)
        );
        throw new Error(
          `Template ${routeData.template} contains navigation elements, indicating wrong content was loaded`
        );
      }

      // Update the main content
      logManager.debug(
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

      // Update navigation visibility based on route and auth state
      this.updateNavigationVisibility(route);

      // Update URL hash to match current route (for direct linking and refresh)
      // IMPORTANT: Only update if the route part differs; preserve query params
      const currentHash = window.location.hash || "";
      const currentRoutePart = this._parseRouteName(currentHash);
      if (currentRoutePart !== route) {
        // Only replace if the route actually changed (preserve query params otherwise)
        history.replaceState(
          { route },
          routeData.title,
          currentHash.startsWith(`#${route}?`) ? currentHash : `#${route}`
        );
      }

      // Dispatch custom event for other parts of the app
      this.dispatchNavigationEvent(route);

      // Dispatch route changed event for mobile navigation
      this.dispatchRouteChangedEvent(route);

      // 🎯 NEW: Announce that the page content is loaded and ready for initialization
      // Pass the full hash so page controllers can access query params
      this.dispatchPageLoadEvent(route, currentHash);

      logManager.info(`✅ Successfully loaded page: ${route}`);
    } catch (error) {
      if (error?.name === "AbortError") {
        logManager.debug("🛑 Navigation aborted (newer route started)");
        if (this._pendingRoute === route) this._pendingRoute = null;
        return;
      }
      logManager.error(`❌ Error loading page ${route}:`, error);
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
          logManager.error(`❌ Failed to load CSS: ${cssFile}`, error);
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
      logManager.error(`❌ Template fetch failed: ${url} (${response.status})`);
      throw new Error(
        `Failed to load template: ${url} - ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();

    // 🛡️ CRITICAL FIX: Detect if we accidentally got a full HTML document
    // instead of a template fragment (happens when Vite's history API fallback
    // serves index.html for 404'd template requests)
    if (looksLikeFullDocument(html)) {
      logManager.error(
        `🚨 Template fetch returned full HTML document instead of fragment: ${url}`
      );
      logManager.error(
        "This usually means the template file wasn't found and Vite served index.html as fallback"
      );
      logManager.error("First 200 chars of response:", html.substring(0, 200));
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
          logManager.error("❌ Failed to load route module via importer", e);
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
   * Ensure and update <meta name="robots">
   */
  updateRobotsMeta(indexable = true) {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const isLocalHost =
      host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    const allowIndexForLocalPreview = isLocalHost;
    const content =
      indexable || allowIndexForLocalPreview
        ? "index,follow"
        : "noindex,nofollow";
    robots.setAttribute("content", content);
  }

  /**
   * Create/update canonical link. If canonicalPath is null, defaults to current origin + pathname (no hash).
   * Returns the final canonical URL.
   */
  updateCanonicalUrl(canonicalPath = null) {
    const siteBase =
      (window.ENV && window.ENV.SITE_URL) || window.location.origin;
    const baseUrl = siteBase.replace(/\/$/, "");
    const path =
      canonicalPath !== null ? canonicalPath : window.location.pathname || "/";
    const canonical = baseUrl + (path.startsWith("/") ? path : `/${path}`);
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);
    return canonical;
  }

  /**
   * Update Open Graph and Twitter card tags per route
   */
  updateOpenGraphTags({ title, description, url, image, type }) {
    const siteBase =
      (window.ENV && window.ENV.SITE_URL) || window.location.origin;
    const toAbsolute = (src) => {
      if (!src) return "";
      if (/^https?:\/\//i.test(src)) return src;
      const base = siteBase.replace(/\/$/, "");
      return base + (src.startsWith("/") ? src : `/${src}`);
    };
    const imgUrl = toAbsolute(image || "/icons/icon-512x512.png");
    const ensure = (selector, attrs) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        if (selector.startsWith("meta[property")) {
          el.setAttribute(
            "property",
            selector.match(/property=\"([^\"]+)\"/)[1]
          );
        } else if (selector.startsWith("meta[name")) {
          el.setAttribute("name", selector.match(/name=\"([^\"]+)\"/)[1]);
        }
        document.head.appendChild(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };
    ensure('meta[property="og:type"]', { content: type || "website" });
    ensure('meta[property="og:title"]', { content: title || "" });
    ensure('meta[property="og:description"]', { content: description || "" });
    ensure('meta[property="og:image"]', { content: imgUrl });
    ensure('meta[property="og:url"]', { content: url || window.location.href });
    ensure('meta[name="twitter:card"]', { content: "summary_large_image" });
    ensure('meta[name="twitter:title"]', { content: title || "" });
    ensure('meta[name="twitter:description"]', { content: description || "" });
    ensure('meta[name="twitter:image"]', { content: imgUrl });
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

    const setIconState = (el, route, isActive) => {
      const icon = el?.querySelector?.("i");
      if (!icon) return;
      const iconMap = {
        home: {
          active: {
            add: ["fa-solid", "fa-calendar-minus"],
            remove: ["fa-regular"],
          },
          inactive: {
            add: ["fa-regular", "fa-calendar-minus"],
            remove: ["fa-solid"],
          },
        },
        groups: {
          active: {
            add: ["fa-solid", "fa-handshake"],
            remove: ["fa-regular"],
          },
          inactive: {
            add: ["fa-regular", "fa-handshake"],
            remove: ["fa-solid"],
          },
        },
        friends: {
          active: {
            add: ["fa-solid", "fa-users"],
            remove: ["fa-regular", "fa-user"],
          },
          inactive: {
            add: ["fa-regular", "fa-user"],
            remove: ["fa-solid", "fa-users"],
          },
        },
        messages: {
          active: {
            add: ["fa-solid", "fa-paper-plane"],
            remove: ["fa-regular"],
          },
          inactive: {
            add: ["fa-regular", "fa-paper-plane"],
            remove: ["fa-solid"],
          },
        },
        notifications: {
          active: { add: ["fa-solid", "fa-bell"], remove: ["fa-regular"] },
          inactive: { add: ["fa-regular", "fa-bell"], remove: ["fa-solid"] },
        },
      };
      const state = iconMap[route];
      const target = state ? (isActive ? state.active : state.inactive) : null;
      const remove = target?.remove || [];
      const add = target?.add || [];
      remove.forEach((cls) => icon.classList.remove(cls));
      add.forEach((cls) => icon.classList.add(cls));
      // Fallback: if no mapping, just flip solid/regular where present
      if (!state) {
        if (
          icon.classList.contains("fa-solid") ||
          icon.classList.contains("fa-regular")
        ) {
          icon.classList.toggle("fa-solid", !!isActive);
          icon.classList.toggle("fa-regular", !isActive);
        }
      }
    };

    // Treat certain routes as aliases in the navigation so the correct
    // tab remains highlighted even when legacy hashes are used elsewhere.
    const resolveActiveNavRoutes = (route) => {
      if (route === "clubs") return ["clubs", "groups"];
      if (route === "groups") return ["groups", "clubs"];
      return [route];
    };

    // 1. Clear existing active classes on any SPA route element (top nav + mobile nav)
    document.querySelectorAll("[data-spa-route].active").forEach((el) => {
      el.classList.remove("active");
      setIconState(el, el?.dataset?.spaRoute, false);
    });
    // Also remove from logo if previously applied (legacy behavior)
    const brand = document.querySelector(".logo [data-spa-route].active");
    if (brand) brand.classList.remove("active");

    // 2. Activate all elements that match the current route (top + mobile)
    const navRoutesToMatch = resolveActiveNavRoutes(activeRoute);
    const matchingRouteEls = document.querySelectorAll(
      navRoutesToMatch
        .map((route) => `[data-spa-route="${route}"]`)
        .join(", ")
    );
    if (matchingRouteEls.length > 0) {
      matchingRouteEls.forEach((el) => {
        el.classList.add("active");
        setIconState(el, el?.dataset?.spaRoute, true);
      });
      return;
    }
  }

  /**
   * Update navigation visibility based on route and authentication state
   * 🎯 Hide nav links when on landing page and user is not logged in
   */
  updateNavigationVisibility(route) {
    const navLinks = document.querySelector(".nav-links");
    const mobileBottomNav = document.querySelector(".mobile-bottom-nav");
    const isLoggedIn = currentUser.isLoggedIn() && currentUser.user;
    // Secondary safeguard: ensure body class reflects auth state for CSS-driven visibility
    try {
      document.body.classList.toggle("is-auth", !!isLoggedIn);
    } catch (_) {}

    // Hide navigation elements if user is on landing page OR about page and not logged in
    if ((route === "landing" || route === "about") && !isLoggedIn) {
      if (navLinks) {
        navLinks.style.display = "none";
      }
      if (mobileBottomNav) {
        mobileBottomNav.style.display = "none";
      }
      if (this._navVisibility.hidden !== true) {
        logManager.debug(`🔒 Navigation hidden - ${route} page, not logged in`);
        this._navVisibility.hidden = true;
      }
    } else {
      if (navLinks) {
        navLinks.style.display = "";
      }
      if (mobileBottomNav) {
        mobileBottomNav.style.display = "";
      }
      if (this._navVisibility.hidden !== false) {
        logManager.debug(
          "🔓 Navigation shown - authenticated or protected route"
        );
        this._navVisibility.hidden = false;
      }
    }

    // Sync layout offsets (safe areas + nav chrome) for current route
    this.updateLayoutChromeState(route);

    // Let Menu.js control auth-dependent body class; CSS handles About visibility
  }

  /**
   * Update body flags that drive safe-area offsets and content height.
   * Keeps content sized between top/bottom navs on mobile and collapses correctly when navs hide.
   */
  updateLayoutChromeState(route = this.currentPage) {
    const body = document.body;
    if (!body) return;

    const isLoggedIn = currentUser.isLoggedIn() && currentUser.user;
    const mobileBottomNav = document.querySelector(".mobile-bottom-nav");
    const isMobileWidth = window.innerWidth <= 768;
    const isImmersive =
      body.classList.contains("immersive-chat-mode") ||
      body.classList.contains("immersive-profile-mode");

    const topNavVisible = !isImmersive;
    const shouldHideBottomNav =
      !isLoggedIn || route === "landing" || isImmersive;
    const showBottomNav = isMobileWidth && !shouldHideBottomNav;

    body.classList.toggle("has-bottom-nav", showBottomNav);
    body.classList.toggle("no-top-nav", !topNavVisible);

    if (mobileBottomNav) {
      mobileBottomNav.style.display = showBottomNav ? "" : "none";
    }
  }

  /**
   * Show loading indicator with smooth animation
   * 🎯 Learning: Smooth transitions make the app feel more professional
   */
  showLoading() {
    if (this._skipNextLoadingOverlay) {
      this._skipNextLoadingOverlay = false;
      return;
    }
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
    logManager.debug("🔍 Analyzing error for appropriate response:", error);

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
      logManager.info(
        "📱 Detected offline error - showing appropriate message"
      );

      // Use the notification system for offline errors instead of replacing content
      notificationManager.show(
        "📱 You're offline! Some features may not work until you reconnect.",
        "warning",
        { duration: 8000 }
      );

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
   * @param {string} route - The route name
   * @param {string} fullHash - The complete hash including query params
   */
  dispatchPageLoadEvent(route, fullHash = "") {
    const event = new CustomEvent("spa:page:load", {
      detail: {
        route,
        router: this,
        hash: fullHash || window.location.hash,
      },
    });
    document.dispatchEvent(event);
    logManager.debug(`🔔 Dispatched spa:page:load event for route: ${route}`);
  }

  /**
   * Show error feedback to user
   * 🎯 Learning: Provide user-friendly error messages
   */
  showErrorFeedback(message) {
    logManager.error("🚨 SPA Router Error:", message);

    // Use notification manager for notifications
    try {
      notificationManager.show(message, "error", { duration: 5000 });
    } catch (e) {
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
