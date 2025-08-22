/**
 * ViewModeManager - Centralized view mode state and event management
 * 
 * This service provides a single source of truth for view mode functionality,
 * preventing race conditions and ensuring consistent state management.
 */

import { DOM_ELEMENTS, reinitializeViewModeElements } from "../../utils/dom/domElements.js";

class ViewModeManager {
  constructor() {
    this.currentViewMode = "day"; // Default to day view
    this.isInitialized = false;
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.debugMode = false;
    
    // Event delegation handler references for cleanup
    this.bodyClickHandler = null;
    this.spaPageLoadHandler = null;
    
    // Bind methods to preserve context
    this.handleViewModeChange = this.handleViewModeChange.bind(this);
    this.handleBodyClick = this.handleBodyClick.bind(this);
    this.handleSPAPageLoad = this.handleSPAPageLoad.bind(this);
    this.setupEventListeners = this.setupEventListeners.bind(this);
    this.validateElements = this.validateElements.bind(this);
  }

  /**
   * Initialize the ViewModeManager
   * @param {string} initialViewMode - Initial view mode ('day' or 'grid')
   * @param {boolean} debug - Enable debug logging
   */
  async initialize(initialViewMode = "day", debug = false) {
    this.debugMode = debug;
    this.currentViewMode = initialViewMode;
    
    this.log("🔧 Initializing ViewModeManager", {
      initialViewMode,
      debug,
      timestamp: new Date().toISOString()
    });

    return this.setupWithRetry();
  }

  /**
   * Setup view mode with retry logic
   */
  async setupWithRetry() {
    this.retryAttempts = 0;
    
    return new Promise((resolve, reject) => {
      const attemptSetup = () => {
        this.retryAttempts++;
        this.log(`🔄 ViewModeManager setup attempt ${this.retryAttempts}/${this.maxRetries}`);

        // Re-initialize DOM elements
        reinitializeViewModeElements();
        
        if (this.validateElements()) {
          this.setupEventListeners();
          this.updateUI();
          this.isInitialized = true;
          
          this.log("✅ ViewModeManager successfully initialized");
          resolve(true);
        } else {
          if (this.retryAttempts < this.maxRetries) {
            this.log(`⚠️ Setup failed, retrying in 100ms (attempt ${this.retryAttempts}/${this.maxRetries})`);
            setTimeout(attemptSetup, 100);
          } else {
            const error = `❌ ViewModeManager failed to initialize after ${this.maxRetries} attempts`;
            this.log(error, {
              availableElements: this.getAvailableElements(),
              domState: this.getDOMState()
            });
            reject(new Error(error));
          }
        }
      };
      
      attemptSetup();
    });
  }

  /**
   * Validate that required DOM elements exist
   */
  validateElements() {
    const requiredElements = ['dayViewBtn', 'gridViewBtn', 'scheduleDayView', 'scheduleGridView'];
    const missingElements = requiredElements.filter(key => !DOM_ELEMENTS[key]);
    
    if (missingElements.length > 0) {
      this.log("❌ Missing required elements:", missingElements);
      return false;
    }
    
    this.log("✅ All required view mode elements found");
    return true;
  }

  /**
   * Setup event listeners using event delegation pattern
   * This fixes the issue where direct element listeners are lost after DOM replacement
   */
  setupEventListeners() {
    this.log("📡 Setting up view mode event listeners with event delegation");

    // Clean up existing listeners first
    this.cleanup();

    // Use event delegation on document.body to handle clicks on view mode buttons
    // This works even when DOM elements are replaced during SPA navigation
    this.bodyClickHandler = (event) => {
      const target = event.target.closest('#dayViewBtn, #gridViewBtn');
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();

      // Determine which view mode was clicked
      if (target.id === 'dayViewBtn') {
        this.log("🖱️ Day view button clicked (via delegation)");
        this.handleViewModeChange("day");
      } else if (target.id === 'gridViewBtn') {
        this.log("🖱️ Grid view button clicked (via delegation)");
        this.handleViewModeChange("grid");
      }
    };

    document.body.addEventListener("click", this.bodyClickHandler);
    this.log("✅ Event delegation setup complete on document.body");

    // Listen for SPA page load events to reinitialize after template reload
    this.spaPageLoadHandler = (event) => {
      const route = event.detail?.route;
      if (route === 'home') {
        this.log(`🔄 SPA page load detected for home route - reinitializing ViewModeManager`);
        // Small delay to ensure DOM is fully updated
        setTimeout(() => {
          this.reinitializeAfterPageLoad();
        }, 50);
      }
    };

    document.addEventListener("spa:page:load", this.spaPageLoadHandler);
    this.log("✅ SPA page load listener setup complete");
  }

  /**
   * Reinitialize after SPA template reload
   * This addresses the core issue where DOM elements are replaced
   */
  async reinitializeAfterPageLoad() {
    this.log("🔄 Reinitializing ViewModeManager after SPA template reload");
    
    // Re-fetch DOM elements
    reinitializeViewModeElements();
    
    if (this.validateElements()) {
      // Update UI to reflect current state
      this.updateUI();
      this.log("✅ ViewModeManager successfully reinitialized after template reload");
      
      // Dispatch reinit event for other components
      const event = new CustomEvent("viewModeManagerReinitialized", {
        detail: {
          currentViewMode: this.currentViewMode,
          timestamp: Date.now()
        }
      });
      document.dispatchEvent(event);
    } else {
      this.log("⚠️ Failed to validate elements after template reload - will retry on next interaction");
    }
  }

  /**
   * Handle body click events (event delegation)
   */
  handleBodyClick(event) {
    // This is handled in setupEventListeners
    // Keeping this method for consistency with the bound handler
  }

  /**
   * Handle SPA page load events
   */
  handleSPAPageLoad(event) {
    // This is handled in setupEventListeners
    // Keeping this method for consistency with the bound handler
  }

  /**
   * Handle view mode changes
   * @param {string} newViewMode - New view mode ('day' or 'grid')
   */
  async handleViewModeChange(newViewMode) {
    this.log(`🔄 View mode change requested: ${this.currentViewMode} → ${newViewMode}`);

    if (!this.isInitialized) {
      this.log("⚠️ ViewModeManager not initialized - attempting to initialize");
      await this.initialize(newViewMode, this.debugMode);
      return;
    }

    if (this.currentViewMode === newViewMode) {
      this.log(`⚠️ Already in ${newViewMode} mode - no change needed`);
      return;
    }

    // Validate elements before proceeding - they might have been replaced
    if (!this.validateElements()) {
      this.log("❌ DOM elements invalid - re-initializing");
      await this.reinitializeAfterPageLoad();
      if (!this.validateElements()) {
        this.log("❌ Failed to reinitialize - cannot change view mode");
        return;
      }
    }

    const previousMode = this.currentViewMode;
    this.currentViewMode = newViewMode;

    this.log(`✅ View mode changed: ${previousMode} → ${newViewMode}`);

    // Update UI
    this.updateUI();

    // Dispatch custom event for other components
    this.dispatchViewModeEvent(previousMode, newViewMode);
  }

  /**
   * Update UI elements to reflect current view mode
   */
  updateUI() {
    this.log(`🎛️ Updating UI for view mode: ${this.currentViewMode}`);

    // Update buttons
    this.updateButtons();
    
    // Update containers
    this.updateContainers();

    this.log("✅ UI update complete");
  }

  /**
   * Update button states
   */
  updateButtons() {
    const dayViewBtn = DOM_ELEMENTS.dayViewBtn;
    const gridViewBtn = DOM_ELEMENTS.gridViewBtn;

    if (dayViewBtn) {
      const shouldBeActive = this.currentViewMode === "day";
      dayViewBtn.classList.toggle("active", shouldBeActive);
      this.log(`📍 Day button updated - active: ${shouldBeActive}`);
    } else {
      this.log("⚠️ Day view button not found during update");
    }

    if (gridViewBtn) {
      const shouldBeActive = this.currentViewMode === "grid";
      gridViewBtn.classList.toggle("active", shouldBeActive);
      this.log(`📍 Grid button updated - active: ${shouldBeActive}`);
    } else {
      this.log("⚠️ Grid view button not found during update");
    }
  }

  /**
   * Update container visibility
   */
  updateContainers() {
    const dayView = DOM_ELEMENTS.scheduleDayView;
    const gridView = DOM_ELEMENTS.scheduleGridView;
    const daySelector = DOM_ELEMENTS.daySelectorContainer;

    if (dayView) {
      dayView.classList.toggle("active", this.currentViewMode === "day");
      this.log(`📍 Day view container updated - active: ${this.currentViewMode === "day"}`);
    }

    if (gridView) {
      gridView.classList.toggle("active", this.currentViewMode === "grid");
      this.log(`📍 Grid view container updated - active: ${this.currentViewMode === "grid"}`);
    }

    if (daySelector) {
      daySelector.classList.toggle("show", this.currentViewMode === "day");
      this.log(`📍 Day selector container updated - show: ${this.currentViewMode === "day"}`);
    }
  }

  /**
   * Dispatch view mode change event
   */
  dispatchViewModeEvent(previousMode, newMode) {
    const event = new CustomEvent("viewModeChanged", {
      detail: {
        previousMode,
        newMode,
        timestamp: Date.now(),
        manager: this
      }
    });

    document.dispatchEvent(event);
    this.log(`📡 Dispatched viewModeChanged event: ${previousMode} → ${newMode}`);
  }

  /**
   * Get current view mode
   */
  getCurrentViewMode() {
    return this.currentViewMode;
  }

  /**
   * Check if manager is initialized
   */
  isReady() {
    return this.isInitialized && this.validateElements();
  }

  /**
   * Get debug information
   */
  getDebugInfo() {
    return {
      currentViewMode: this.currentViewMode,
      isInitialized: this.isInitialized,
      retryAttempts: this.retryAttempts,
      hasBodyClickHandler: !!this.bodyClickHandler,
      hasSpaPageLoadHandler: !!this.spaPageLoadHandler,
      elementsValid: this.validateElements(),
      availableElements: this.getAvailableElements(),
      domState: this.getDOMState(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get available DOM elements
   */
  getAvailableElements() {
    return Array.from(document.querySelectorAll('[id*="View"]')).map(el => ({
      id: el.id,
      classList: Array.from(el.classList),
      tagName: el.tagName
    }));
  }

  /**
   * Get DOM state information
   */
  getDOMState() {
    return {
      dayViewBtn: !!DOM_ELEMENTS.dayViewBtn,
      gridViewBtn: !!DOM_ELEMENTS.gridViewBtn,
      scheduleDayView: !!DOM_ELEMENTS.scheduleDayView,
      scheduleGridView: !!DOM_ELEMENTS.scheduleGridView,
      scheduleTable: !!document.getElementById("scheduleTable"),
      homeTemplate: !!document.querySelector('.schedule-section')
    };
  }

  /**
   * Clean up event listeners
   */
  cleanup() {
    this.log(`🧹 Cleaning up event listeners`);

    // Remove event delegation listeners
    if (this.bodyClickHandler) {
      document.body.removeEventListener("click", this.bodyClickHandler);
      this.bodyClickHandler = null;
      this.log("🗑️ Removed body click handler");
    }

    if (this.spaPageLoadHandler) {
      document.removeEventListener("spa:page:load", this.spaPageLoadHandler);
      this.spaPageLoadHandler = null;
      this.log("🗑️ Removed SPA page load handler");
    }

    this.log("✅ Cleanup complete");
  }

  /**
   * Reset the manager
   */
  reset() {
    this.log("🔄 Resetting ViewModeManager");
    this.cleanup();
    this.isInitialized = false;
    this.retryAttempts = 0;
    this.currentViewMode = "day";
  }

  /**
   * Log with optional debug mode
   */
  log(message, data = null) {
    if (this.debugMode || console.log.toString().includes("native")) {
      if (data) {
        console.log(`[ViewModeManager] ${message}`, data);
      } else {
        console.log(`[ViewModeManager] ${message}`);
      }
    }
  }
}

// Create singleton instance
const viewModeManager = new ViewModeManager();

// Make available to window for SPA integration
if (typeof window !== 'undefined') {
  window.viewModeManager = viewModeManager;
  
  // Add debug helpers for testing
  window.testViewModeManager = {
    info: () => viewModeManager.getDebugInfo(),
    test: () => {
      console.log('🧪 Testing ViewModeManager event delegation...');
      
      // Test clicking buttons programmatically
      const dayBtn = document.getElementById('dayViewBtn');
      const gridBtn = document.getElementById('gridViewBtn');
      
      if (dayBtn) {
        console.log('📍 Found day view button:', dayBtn);
        dayBtn.click();
        console.log('✅ Day button clicked - should see delegation working');
      }
      
      if (gridBtn) {
        console.log('📍 Found grid view button:', gridBtn);
        gridBtn.click();
        console.log('✅ Grid button clicked - should see delegation working');
      }
      
      return viewModeManager.getDebugInfo();
    }
  };
}

export default viewModeManager;