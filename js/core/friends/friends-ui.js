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
    if (this.isInitialized) return;

    try {
      // Get references to DOM elements
      this.cacheElements();

      // Set up event listeners
      this.setupEventListeners();

      // Load initial data
      this.loadInitialData();

      this.isInitialized = true;
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
    // Search functionality
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener("input", (e) => {
        this.handleSearchInput(e);
      });

      this.elements.searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.handleSearch();
        }
      });
    }

    if (this.elements.searchBtn) {
      this.elements.searchBtn.addEventListener("click", () => {
        this.handleSearch();
      });
    }

    console.log("🎯 Event listeners set up");
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

      console.log("📊 Initial data loaded");
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
      console.log("🔍 Searching for:", searchTerm);

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
    console.log("⏳ Showing loading state");
    // TODO: Implement loading spinner
  }

  /**
   * ✅ Hide loading state
   */
  hideLoadingState() {
    console.log("✅ Hiding loading state");
    // TODO: Hide loading spinner
  }

  /**
   * 🔍 Show search loading state
   */
  showSearchLoading() {
    if (this.elements.searchBtn) {
      this.elements.searchBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i>';
      this.elements.searchBtn.disabled = true;
    }
  }

  /**
   * 🔍 Hide search loading state
   */
  hideSearchLoading() {
    if (this.elements.searchBtn) {
      this.elements.searchBtn.innerHTML = '<i class="fas fa-search"></i>';
      this.elements.searchBtn.disabled = false;
    }
  }

  /**
   * 💬 Show user feedback messages
   */
  showMessage(message, type = "info") {
    console.log(`💬 ${type.toUpperCase()}: ${message}`);
    // TODO: Implement actual user notifications
  }

  /**
   * 🧹 Cleanup when leaving the page
   */
  cleanup() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.isInitialized = false;
    console.log("🧹 Friends UI cleaned up");
  }
}

// 🌟 Export a single instance
export const friendsUI = new FriendsUI();

// 🎯 Auto-initialize when this module loads (SPA style)
// This will run when the friends page is loaded via the SPA router
setTimeout(() => {
  if (document.getElementById("friendSearch")) {
    friendsUI.init();
  }
}, 100);
