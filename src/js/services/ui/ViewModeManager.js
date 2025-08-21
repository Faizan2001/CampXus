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
    this.eventListeners = new Map(); // Track event listeners for cleanup
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.debugMode = false;
    
    // Bind methods to preserve context
    this.handleViewModeChange = this.handleViewModeChange.bind(this);
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
   * Setup event listeners with proper cleanup tracking
   */
  setupEventListeners() {
    this.log("📡 Setting up view mode event listeners");

    // Clean up existing listeners first
    this.cleanup();

    // Day view button
    if (DOM_ELEMENTS.dayViewBtn) {
      const dayClickHandler = () => this.handleViewModeChange("day");
      DOM_ELEMENTS.dayViewBtn.addEventListener("click", dayClickHandler);
      this.eventListeners.set("dayViewBtn", {
        element: DOM_ELEMENTS.dayViewBtn,
        event: "click",
        handler: dayClickHandler
      });
      this.log("✅ Day view button listener added");
    }

    // Grid view button
    if (DOM_ELEMENTS.gridViewBtn) {
      const gridClickHandler = () => this.handleViewModeChange("grid");
      DOM_ELEMENTS.gridViewBtn.addEventListener("click", gridClickHandler);
      this.eventListeners.set("gridViewBtn", {
        element: DOM_ELEMENTS.gridViewBtn,
        event: "click",
        handler: gridClickHandler
      });
      this.log("✅ Grid view button listener added");
    }

    this.log(`📡 Event listeners setup complete - tracking ${this.eventListeners.size} listeners`);
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

    // Validate elements before proceeding
    if (!this.validateElements()) {
      this.log("❌ DOM elements invalid - re-initializing");
      await this.initialize(newViewMode, this.debugMode);
      return;
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
    }

    if (gridViewBtn) {
      const shouldBeActive = this.currentViewMode === "grid";
      gridViewBtn.classList.toggle("active", shouldBeActive);
      this.log(`📍 Grid button updated - active: ${shouldBeActive}`);
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
    }

    if (gridView) {
      gridView.classList.toggle("active", this.currentViewMode === "grid");
    }

    if (daySelector) {
      daySelector.classList.toggle("show", this.currentViewMode === "day");
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
      eventListenersCount: this.eventListeners.size,
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
    this.log(`🧹 Cleaning up ${this.eventListeners.size} event listeners`);

    for (const [key, listener] of this.eventListeners) {
      if (listener.element && listener.handler) {
        listener.element.removeEventListener(listener.event, listener.handler);
        this.log(`🗑️ Removed listener: ${key}`);
      }
    }

    this.eventListeners.clear();
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

export default viewModeManager;