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
      'home': {
        title: 'Schedule - CampXus',
        template: 'templates/home.html',
        cssFiles: ['css/schedule.css', 'css/components.css', 'css/animations.css'], // Include all needed styles
        jsFiles: ['js/core/script.js'], // Schedule functionality
        description: 'Manage your weekly schedule and compare with friends'
      },
      'profile': {
        title: 'Profile Setup - CampXus', 
        template: 'templates/profile.html',
        cssFiles: ['css/profile-setup.css'], // Specific styles for profile
        jsFiles: ['js/core/profile-setup.js'], // Profile functionality
        description: 'Set up your student profile and preferences'
      },
      'friends': {
        title: 'Friends - CampXus',
        template: 'templates/friends.html', 
        cssFiles: [],
        jsFiles: [],
        description: 'Connect with your classmates and study buddies'
      },
      'about': {
        title: 'About - CampXus',
        template: 'templates/about.html',
        cssFiles: [],
        jsFiles: [],
        description: 'Learn about the developer and the app'
      }
    };

    this.currentPage = 'home'; // Default page
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
    console.log('🚀 Initializing SPA Router...');
    
    // Find the main content container
    this.mainContentContainer = document.querySelector('.main-content');
    if (!this.mainContentContainer) {
      console.error('❌ Main content container not found! SPA Router cannot work.');
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
    
    console.log('✅ SPA Router initialized successfully!');
  }

  /**
   * Create a loading indicator for smooth transitions
   * 🎯 Learning: Good UX means showing users when something is loading
   */
  createLoadingIndicator() {
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.className = 'spa-loading';
    this.loadingIndicator.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading...</span>
      </div>
    `;
    this.loadingIndicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 255, 255, 0.9);
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      display: none;
      z-index: 1000;
      text-align: center;
      backdrop-filter: blur(5px);
    `;
    document.body.appendChild(this.loadingIndicator);
  }

  /**
   * Set up event listeners for navigation
   * 🎯 Learning: We intercept clicks on navigation links to handle them with JavaScript
   */
  setupNavigationListeners() {
    // Listen for clicks on elements with data-spa-route attribute
    document.addEventListener('click', (event) => {
      const routeElement = event.target.closest('[data-spa-route]');
      if (routeElement) {
        event.preventDefault(); // Stop the normal link behavior
        const route = routeElement.getAttribute('data-spa-route');
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
    window.addEventListener('popstate', (event) => {
      console.log('🔄 Browser navigation detected');
      const route = event.state?.route || 'home';
      this.loadPage(route, false); // Don't update history again
    });
  }

  /**
   * Load the initial page based on current URL
   * 🎯 Learning: When someone visits a direct link, show the right page
   */
  loadInitialPage() {
    // For now, just load home page
    // Later we can parse URL fragments or search params
    this.navigateTo('home', false);
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
    if (!routeData) return;

    try {
      // Show loading indicator
      this.showLoading();
      
      // Update page title
      document.title = routeData.title;
      
      // Update meta description
      this.updateMetaDescription(routeData.description);
      
      // Load CSS files if needed
      await this.loadCSS(routeData.cssFiles);
      
      // Load the HTML template
      const htmlContent = await this.loadTemplate(routeData.template);
      
      // Update the main content
      this.mainContentContainer.innerHTML = htmlContent;
      
      // Load and execute JavaScript files
      await this.loadJS(routeData.jsFiles);
      
      // Special initialization for home page after content and scripts are loaded
      if (route === 'home') {
        await this.initializeHomePage();
      }
      
      // Update current page
      this.currentPage = route;
      
      // Update navigation active states
      this.updateNavigationStates(route);
      
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
    
    const promises = cssFiles.map(cssFile => {
      return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`link[href="${cssFile}"]`)) {
          resolve();
          return;
        }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
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
        const script = document.createElement('script');
        script.type = 'module'; // Use ES6 modules
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
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;
  }

  /**
   * Update navigation active states
   * 🎯 Learning: Visual feedback shows users where they are
   */
  updateNavigationStates(activeRoute) {
    // Remove active class from all nav items
    document.querySelectorAll('[data-spa-route]').forEach(el => {
      el.classList.remove('active');
    });
    
    // Add active class to current route
    const activeNavItem = document.querySelector(`[data-spa-route="${activeRoute}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'block';
    }
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'none';
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
${error.stack || ''}
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
    const event = new CustomEvent('spa:navigation', {
      detail: { route, router: this }
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
    console.log('🏠 Initializing home page...');
    
    try {
      // Wait a short time for script.js to fully load and initialize
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check if the main app functions are available
      if (typeof window.initializeApp === 'function') {
        console.log('✅ Found initializeApp function, calling it...');
        await window.initializeApp();
      } else {
        console.log('⚠️ initializeApp not found, dispatching event...');
        
        // Dispatch an event that the home page script can listen for
        document.dispatchEvent(new CustomEvent('spa:home:loaded'));
        
        // Wait a bit more and try again
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (typeof window.initializeApp === 'function') {
          console.log('✅ Found initializeApp after delay, calling it...');
          await window.initializeApp();
        } else {
          console.error('❌ Still cannot find initializeApp function');
        }
      }
      
      console.log('✅ Home page initialization complete');
      
    } catch (error) {
      console.error('❌ Error initializing home page:', error);
      // Don't throw error to prevent SPA navigation from failing
    }
  }
}

// 🎯 Learning: Export the class so other files can use it
// Also create a global instance for easy access
window.SPARouter = SPARouter;

export default SPARouter;
