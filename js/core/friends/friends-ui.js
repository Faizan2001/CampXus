/**
 * 🎨 CampXus Friends UI Controller
 *
 * This module handles all the user interface interactions for the friends page:
 * - Renders search results
 * - Displays friend requests
 * - Shows friends list
 * - Handles button clicks and form submissions
 *
 * 🎓 Learning: This is the "View + Controller" in our simple MVC pattern
 * It manages the UI and connects user actions to the friends manager
 */

import { friendsManager } from "./friends-manager.js";

class FriendsUI {
  constructor() {
    this.elements = {};
    this.isInitialized = false;
  }

  /**
   * 🚀 Initialize the friends UI when the page loads
   */
  init() {
    try {
      // Always re-cache elements since DOM might have changed
      this.cacheElements();

      // Always set up event listeners since DOM elements are recreated
      this.setupEventListeners();
      this.isInitialized = true;

      // Always load initial data on page visit
      this.loadInitialData();

      console.log("🎨 Friends UI initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing Friends UI:", error);
    }
  }

  /**
   * 📝 Cache DOM element references for better performance
   */
  cacheElements() {
    this.elements = {
      // Search elements
      searchInput: document.getElementById("friendSearch"),
      searchBtn: document.querySelector(".friends-search .search-btn"),

      // Container elements
      friendsList: document.getElementById("friendsList"),
      friendRequests: document.getElementById("friendRequests"),

      // Future: Add more elements as we build them
    };

    // Log which elements we found/missed
    Object.entries(this.elements).forEach(([key, element]) => {
      if (!element) {
        console.warn(`⚠️  Element not found: ${key}`);
      }
    });
  }

  /**
   * 🎯 Set up event listeners for user interactions
   */
  setupEventListeners() {
    // Store bound functions for consistent reference
    if (!this.boundHandlers) {
      this.boundHandlers = {
        searchInput: (e) => this.handleSearchInput(e),
        searchKeypress: (e) => {
          if (e.key === "Enter") {
            this.handleSearch();
          }
        },
        searchClick: () => this.handleSearch()
      };
    }

    // Search functionality
    if (this.elements.searchInput) {
      // Remove any existing listeners first (in case DOM was recreated)
      this.elements.searchInput.removeEventListener("input", this.boundHandlers.searchInput);
      this.elements.searchInput.removeEventListener("keypress", this.boundHandlers.searchKeypress);
      
      // Add fresh listeners
      this.elements.searchInput.addEventListener("input", this.boundHandlers.searchInput);
      this.elements.searchInput.addEventListener("keypress", this.boundHandlers.searchKeypress);
    }

    if (this.elements.searchBtn) {
      // Remove any existing listeners first
      this.elements.searchBtn.removeEventListener("click", this.boundHandlers.searchClick);
      
      // Add fresh listener
      this.elements.searchBtn.addEventListener("click", this.boundHandlers.searchClick);
    }

    console.log("🎯 Event listeners set up");
  }

  /**
   * 🧹 Remove event listeners to prevent duplicates
   */
  removeEventListeners() {
    if (this.boundHandlers) {
      if (this.elements.searchInput) {
        this.elements.searchInput.removeEventListener("input", this.boundHandlers.searchInput);
        this.elements.searchInput.removeEventListener("keypress", this.boundHandlers.searchKeypress);
      }

      if (this.elements.searchBtn) {
        this.elements.searchBtn.removeEventListener("click", this.boundHandlers.searchClick);
      }
    }
  }

  /**
   * 📊 Load initial data when page opens
   */
  async loadInitialData() {
    try {
      // Show loading state
      this.showLoadingState();

      // Load friends list
      await this.refreshFriendsList();

      // Load pending requests
      await this.refreshFriendRequests();
    } catch (error) {
      console.error("❌ Error loading initial data:", error);
    } finally {
      this.hideLoadingState();
    }
  }

  /**
   * 🔍 Handle search input changes (with debouncing)
   */
  handleSearchInput(event) {
    const searchTerm = event.target.value.trim();

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search to avoid too many requests
    this.searchTimeout = setTimeout(() => {
      if (searchTerm.length >= 2) {
        this.performSearch(searchTerm);
      } else {
        this.clearSearchResults();
      }
    }, 300); // Wait 300ms after user stops typing
  }

  /**
   * 🔍 Handle search button click
   */
  async handleSearch() {
    const searchTerm = this.elements.searchInput?.value.trim();

    if (!searchTerm || searchTerm.length < 2) {
      this.showMessage(
        "Please enter at least 2 characters to search",
        "warning"
      );
      return;
    }

    await this.performSearch(searchTerm);
  }

  /**
   * 🔍 Perform the actual search
   */
  async performSearch(searchTerm) {
    try {
      // Show search loading state
      this.showSearchLoading();

      // Search using friends manager
      const results = await friendsManager.searchStudents(searchTerm);

      // Display results
      this.displaySearchResults(results);
    } catch (error) {
      console.error("❌ Search error:", error);
      this.showMessage(
        "Error searching for students. Please try again.",
        "error"
      );
    } finally {
      this.hideSearchLoading();
    }
  }

  /**
   * 📋 Display search results
   */
  displaySearchResults(results) {
    // TODO: Implement search results display
    console.log("📋 Displaying search results:", results);

    if (results.length === 0) {
      this.showMessage("No students found matching your search", "info");
    }
  }

  /**
   * 🧹 Clear search results
   */
  clearSearchResults() {
    // TODO: Implement clearing search results
    console.log("🧹 Clearing search results");
  }

  /**
   * 👥 Refresh the friends list display
   */
  async refreshFriendsList() {
    try {
      const friends = await friendsManager.getFriendsList();
      this.displayFriendsList(friends);
    } catch (error) {
      console.error("❌ Error refreshing friends list:", error);
    }
  }

  /**
   * 👥 Display the friends list
   */
  displayFriendsList(friends) {
    if (!this.elements.friendsList) return;

    if (friends.length === 0) {
      // Show empty state (it's already in the HTML)
      console.log("👥 No friends to display");
      return;
    }

    // TODO: Implement friends list rendering
    console.log("👥 Displaying friends:", friends);
  }

  /**
   * 📬 Refresh friend requests display
   */
  async refreshFriendRequests() {
    try {
      const requests = await friendsManager.getPendingRequests();
      this.displayFriendRequests(requests);
    } catch (error) {
      console.error("❌ Error refreshing friend requests:", error);
    }
  }

  /**
   * 📬 Display friend requests
   */
  displayFriendRequests(requests) {
    if (!this.elements.friendRequests) return;

    if (requests.length === 0) {
      // Show empty state (it's already in the HTML)
      console.log("📬 No friend requests to display");
      return;
    }

    // TODO: Implement friend requests rendering
    console.log("📬 Displaying friend requests:", requests);
  }

  /**
   * ⏳ Show loading state
   */
  showLoadingState() {
    // TODO: Implement a proper loading skeleton
    // Reduced logging for cleaner console
  }

  /**
   * ✅ Hide loading state
   */
  hideLoadingState() {
    // TODO: Hide loading skeleton
    // Reduced logging for cleaner console
  }

  /**
   * 🔍 Show search loading state
   */
  showSearchLoading() {
    // TODO: Implement search loading state
    // Reduced logging for cleaner console
  }

  /**
   * 🔍 Hide search loading state
   */
  hideSearchLoading() {
    // TODO: Hide search loading state
    // Reduced logging for cleaner console
  }

  /**
   * 💬 Show user feedback messages
   */
  showMessage(message, type = "info") {
    // TODO: Implement a nicer notification system
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  /**
   * 🧹 Cleanup when leaving the page
   */
  cleanup() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    
    // Remove event listeners to prevent memory leaks
    this.removeEventListeners();
    
    console.log("🧹 Friends UI cleaned up");
  }
}

// 🌟 Export a single instance
export const friendsUI = new FriendsUI();

// 🎯 This is the crucial part that connects the UI to the router.
// We listen for the event dispatched by the router when a page is loaded.
document.addEventListener("spa:page:load", (event) => {
  if (event.detail.route === "friends") {
    console.log("🎨 Friends page loaded, initializing UI...");
    // Use the singleton instance instead of creating a new one
    friendsUI.init();

    // For debugging purposes, make the manager globally available
    window.friendsManager = friendsManager;
  }
});

// Clean up when leaving the friends page
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "friends") {
    friendsUI.cleanup();
  }
});
