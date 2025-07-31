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

import { friendsManager } from "../services/friends/FriendsService.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { showModal } from "../components/modals/Modal.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../services/realtime/RealtimeService.js";
import { dataManager } from "../services/data/DataService.js";
import { currentUser } from "../store/userStore.js";
import {
  renderUserAvatar,
  getAvatarFallback,
} from "../utils/avatar/avatarUtils.js";
import { friendshipPrivacyService } from "../services/friends/FriendshipPrivacyService.js";
import { FriendOptionsMenu } from "../components/friends/FriendOptionsMenu.js";

class FriendsUI {
  constructor() {
    this.elements = {};
    this.isInitialized = false;

    // 📋 Real-time friend request tracking for search results
    this.pendingRequestsMap = new Map(); // userId -> requestId
    this.outgoingRequestsMap = new Map(); // userId -> requestData (includes status)
    this.realTimeSubscriptions = [];

    // 👥 Current friends data for unfriend functionality
    this.currentFriendsData = [];

    // 📬 Current friend requests data for accept/reject functionality
    this.currentFriendRequestsData = [];

    // 🔔 Notification debouncing
    this.lastFriendsNotificationTime = 0;

    // 🎯 Event listener management to prevent memory leaks
    this.listenersSetup = false;
    this.boundHandlers = null;

    // 🔗 Friend option menus for individual privacy controls
    this.friendOptionMenus = new Map(); // friendId -> FriendOptionsMenu instance
  }

  /**
   * 🚀 Initialize the friends UI when the page loads
   */
  async init() {
    try {
      // Always re-cache elements since DOM might have changed
      this.cacheElements();

      // Always set up event listeners since DOM elements are recreated
      this.setupEventListeners();

      // 🎛️ Set up real-time integration
      this.setupRealTimeCallbacks();

      // 📋 Set up real-time friend request status tracking
      this.setupFriendRequestStatusTracking();

      // Privacy controls are now individual per friend via bilateral privacy system

      this.isInitialized = true;

      // Always load initial data on page visit
      this.loadInitialData();

      console.log(
        "🎨 Friends UI initialized successfully with real-time updates and privacy controls"
      );
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
   * 🎯 Set up event listeners for user interactions (optimized to prevent memory leaks)
   */
  setupEventListeners() {
    // Always re-cache DOM elements to ensure we have fresh references
    console.log("🔄 Re-caching DOM elements for event listeners...");
    this.cacheElements();

    // For SPA applications, always reset listeners on page load to ensure they work
    if (this.listenersSetup) {
      console.log("🔄 SPA navigation detected, resetting event listeners...");
      this.listenersSetup = false; // Reset flag to allow re-setup
    }

    // Store bound functions for consistent reference
    if (!this.boundHandlers) {
      this.boundHandlers = {
        searchInput: (e) => this.handleSearchInput(e),
        searchKeypress: (e) => {
          if (e.key === "Enter") {
            this.handleSearch();
          }
        },
        searchClick: () => this.handleSearch(),
      };
    }

    // Search functionality with safety checks
    if (this.elements.searchInput) {
      console.log("✅ Search input element found, setting up listeners...");
      try {
        this.elements.searchInput.addEventListener(
          "input",
          this.boundHandlers.searchInput
        );
        this.elements.searchInput.addEventListener(
          "keypress",
          this.boundHandlers.searchKeypress
        );
        console.log("✅ Search input listeners attached successfully");
      } catch (error) {
        console.warn("⚠️ Could not set up search input listeners:", error);
        return;
      }
    } else {
      console.warn(
        "⚠️ Search input element not found (ID: friendSearch) - search functionality disabled"
      );
      console.log(
        "🔍 Available elements with 'search' in ID:",
        Array.from(document.querySelectorAll('[id*="search"]')).map(
          (el) => el.id
        )
      );
    }

    if (this.elements.searchBtn) {
      try {
        this.elements.searchBtn.addEventListener(
          "click",
          this.boundHandlers.searchClick
        );
      } catch (error) {
        console.warn("⚠️ Could not set up search button listener:", error);
        return;
      }
    } else {
      console.warn("⚠️ Search button element not found");
    }

    // Mark listeners as set up to prevent duplicates
    this.listenersSetup = true;
    console.log("🎯 Event listeners set up successfully (optimized)");
  }

  /**
   * 🧹 Remove event listeners to prevent duplicates
   */
  removeEventListeners() {
    if (this.boundHandlers) {
      try {
        if (this.elements.searchInput) {
          this.elements.searchInput.removeEventListener(
            "input",
            this.boundHandlers.searchInput
          );
          this.elements.searchInput.removeEventListener(
            "keypress",
            this.boundHandlers.searchKeypress
          );
        }

        if (this.elements.searchBtn) {
          this.elements.searchBtn.removeEventListener(
            "click",
            this.boundHandlers.searchClick
          );
        }
      } catch (error) {
        console.warn("⚠️ Error removing event listeners:", error);
      }
    }
  }

  /**
   * 🎛️ Set up real-time callbacks for instant UI updates
   */
  setupRealTimeCallbacks() {
    console.log("🎛️ Setting up real-time UI callbacks...");

    // Register callbacks with the friends manager using the registerUICallbacks method
    if (friendsManager.registerUICallbacks) {
      friendsManager.registerUICallbacks({
        onFriendRequestsChange: (requests) => {
          console.log(
            "📬 Real-time friend requests update in UI:",
            requests.length
          );
          this.displayFriendRequests(requests);

          // Update pending requests map for search button states
          const currentUserData = currentUser;
          if (currentUserData?.uid) {
            this.updatePendingRequestsMap(requests, currentUserData.uid);
            this.updateSearchResultsButtons();
          }

          // Show a more subtle notification for request updates
          if (requests.length > 0) {
            this.showRealTimeNotification(
              `${requests.length} friend request${
                requests.length !== 1 ? "s" : ""
              }`
            );
          }
        },

        onOutgoingFriendRequestsChange: (requests) => {
          console.log(
            "📤 Real-time outgoing friend requests update in UI:",
            requests.length
          );

          // Update outgoing requests map for button states
          this.updateOutgoingRequestsMap(requests);

          // Update search results buttons based on outgoing request status
          this.updateSearchResultsButtons();

          // Re-filter search results to hide accepted friend requests
          this.filterSearchResultsForAcceptedRequests();
        },

        onFriendsListChange: async (friends) => {
          console.log(
            "🤝 Real-time friends list update in UI:",
            friends.length
          );
          await this.displayFriendsList(friends);

          // Update search button states (hide buttons for existing friends)
          this.updateSearchResultsButtons();

          // Filter out friends from search results
          this.filterSearchResultsForAcceptedRequests();

          // Show a more subtle notification for friends list updates (debounced)
          if (
            friends.length > 0 &&
            (!this.lastFriendsNotificationTime ||
              Date.now() - this.lastFriendsNotificationTime > 2000)
          ) {
            this.showRealTimeNotification(
              `${friends.length} friend${
                friends.length !== 1 ? "s" : ""
              } connected`
            );
            this.lastFriendsNotificationTime = Date.now();
          }
        },

        onConnectionStatusChange: (status) => {
          console.log("📡 Real-time connection status in UI:", status);
          this.displayConnectionStatus(status);

          // Show connection status notifications
          notificationManager.showConnectionStatusNotification(status);
        },

        onNewFriendRequest: (request) => {
          console.log(
            "🔔 New friend request received in UI:",
            request.displayName
          );

          // Show prominent notification for new friend requests
          notificationManager.showFriendRequestNotification(request);
        },
      });
    }

    // Start real-time listening in the friends manager
    if (friendsManager.startRealTimeListening) {
      friendsManager.startRealTimeListening();
    }

    console.log("✅ Real-time UI callbacks set up successfully");
  }

  /**
   * 📋 Set up real-time friend request status tracking for search results
   * This efficiently tracks pending requests to show correct button states
   */
  setupFriendRequestStatusTracking() {
    const currentUserData = currentUser;
    if (!currentUserData?.uid) {
      console.warn("⚠️ No current user for friend request status tracking");
      return;
    }

    console.log("📋 Setting up real-time friend request status tracking...");

    // NOTE: Real-time subscriptions are handled by setupRealTimeCallbacks()
    // to avoid duplicate subscribers. This method only loads initial data.

    // Initial load of pending requests
    this.loadInitialPendingRequests(currentUserData.uid);

    console.log("✅ Friend request status tracking set up successfully");
  }

  /**
   * 📋 Load initial pending requests to populate the map
   * @param {string} currentUserId - Current user's ID
   */
  async loadInitialPendingRequests(currentUserId) {
    try {
      console.log(
        `📋 Loading initial outgoing requests for user: ${currentUserId}`
      );

      // Get ALL outgoing requests (not just pending ones)
      const outgoingRequests = await dataManager.getAllOutgoingFriendRequests(
        currentUserId
      );

      // Update the outgoing requests map
      this.updateOutgoingRequestsMap(outgoingRequests);

      console.log(
        `📋 Loaded ${outgoingRequests.length} initial outgoing requests`
      );
    } catch (error) {
      console.error("❌ Error loading initial outgoing requests:", error);
    }
  }

  /**
   * 📋 Update the pending requests map when real-time changes occur
   * @param {Array} requests - All friend requests from real-time listener
   * @param {string} currentUserId - Current user's ID
   */
  updatePendingRequestsMap(requests, currentUserId) {
    // Clear and rebuild the map
    this.pendingRequestsMap.clear();

    // Only track incoming pending requests (requests TO current user)
    const incomingPendingRequests = requests.filter(
      (request) =>
        request.toUserId === currentUserId && request.status === "pending"
    );

    incomingPendingRequests.forEach((request) => {
      this.pendingRequestsMap.set(request.fromUserId, request.id);
    });

    console.log(
      `📋 Updated pending requests map: ${this.pendingRequestsMap.size} incoming pending`
    );
  }

  /**
   * 📋 Update the outgoing requests map when real-time changes occur
   * @param {Array} requests - All outgoing friend requests from real-time listener
   */
  updateOutgoingRequestsMap(requests) {
    // Clear and rebuild the map
    this.outgoingRequestsMap.clear();

    // Store all outgoing requests with their current status
    requests.forEach((request) => {
      this.outgoingRequestsMap.set(request.toUserId, {
        id: request.id,
        status: request.status,
        displayName: request.displayName,
        createdAt: request.createdAt,
        respondedAt: request.respondedAt,
      });
    });

    console.log(
      `📋 Updated outgoing requests map: ${this.outgoingRequestsMap.size} total requests`
    );
  }

  /**
   * 📋 Update search result buttons based on current friend request status
   * This runs whenever friend requests or friendships change
   */
  async updateSearchResultsButtons() {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) {
      console.log(
        "📋 No search results container found, skipping button update"
      );
      return;
    }

    const studentCards = searchResults.querySelectorAll(".student-card");
    console.log(`📋 Updating ${studentCards.length} search result buttons`);

    // If outgoing requests map is empty (e.g., after browser reload), reload it
    if (this.outgoingRequestsMap.size === 0) {
      const currentUserData = currentUser;
      if (currentUserData?.uid) {
        console.log(
          "📋 Outgoing requests map empty, reloading from database..."
        );
        await this.loadInitialPendingRequests(currentUserData.uid);
      }
    }

    studentCards.forEach((card) => {
      const studentId = card.dataset.studentId;
      const button = card.querySelector(
        ".btn-send-request, .btn-request-sent, .btn-pending-request"
      );

      if (!button || !studentId) {
        console.log(`📋 No button or studentId found for card`);
        return;
      }

      // Check if there's a pending outgoing request to this user
      const outgoingRequest = this.outgoingRequestsMap.get(studentId);
      const hasPendingRequest =
        outgoingRequest && outgoingRequest.status === "pending";

      console.log(
        `📋 Student ${studentId}: outgoingRequest =`,
        outgoingRequest,
        `hasPendingRequest = ${hasPendingRequest}`
      );

      if (hasPendingRequest) {
        // Show pending state
        console.log(`📋 Setting button to pending state for ${studentId}`);
        button.className = "btn-pending-request";
        button.innerHTML = '<i class="fas fa-clock"></i>';
        button.disabled = true;
        button.setAttribute("title", "Friend request pending");
      } else {
        // Show send request state
        console.log(`📋 Setting button to send request state for ${studentId}`);
        button.className = "btn-send-request";
        button.innerHTML =
          '<i class="fas fa-user-plus"></i> Send Friend Request';
        button.disabled = false;
      }
    });
  }

  /**
   * 🔔 Show a subtle real-time update notification
   * @param {string} message - Message to show
   */
  showRealTimeNotification(message) {
    // Use the notification manager for consistent notifications
    notificationManager.showSystemNotification(
      message,
      "info",
      "Real-time Update"
    );
  }

  /**
   * 📡 Display connection status
   * @param {Object} status - Connection status object
   */
  displayConnectionStatus(status) {
    // For now, just log it. In a full implementation, you might show an indicator
    if (status.isConnected) {
      console.log("📡 Connected to real-time updates");
    } else {
      console.log("📡 Disconnected from real-time updates");
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
    console.log(
      `🔍 Search input changed: "${searchTerm}" (length: ${searchTerm.length})`
    );

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search to avoid too many requests
    this.searchTimeout = setTimeout(() => {
      if (searchTerm.length >= 2) {
        console.log(`🔍 Performing search for: "${searchTerm}"`);
        this.performSearch(searchTerm);
      } else if (searchTerm.length === 0) {
        // Only clear when completely empty, not for 1-character searches
        console.log("🧹 Search term empty, clearing results");
        this.clearSearchResults();
      } else {
        console.log(
          "🔍 Search term too short (1 character), keeping existing results"
        );
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
      const results = await friendsManager.searchStudentsWithCache(searchTerm);

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
    console.log("📋 Displaying search results:", results);

    // Find or create search results container
    const searchSection = document.querySelector(".friends-search");
    let resultsContainer = document.getElementById("searchResults");

    if (!resultsContainer) {
      resultsContainer = document.createElement("div");
      resultsContainer.id = "searchResults";
      resultsContainer.className = "search-results";
      searchSection.appendChild(resultsContainer);
    }

    // Filter out users who are already friends (accepted requests)
    const filteredResults = results.filter((student) => {
      const outgoingRequest = this.outgoingRequestsMap.get(student.id);
      // Hide users who have accepted friend requests - they should be in friends list
      return !(outgoingRequest && outgoingRequest.status === "accepted");
    });

    if (filteredResults.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-results-header">
          <h4>Search Results (0)</h4>
          <button class="btn-clear-search" title="Clear search results">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="search-results-container">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>No students found matching your search</p>
          </div>
        </div>
      `;
      resultsContainer.classList.add("show");
      return;
    }

    // Display search results with Send Friend Request buttons
    const resultsHTML = filteredResults
      .map(
        (student) => `
      <div class="student-card" data-student-id="${student.id}">
        <div class="student-avatar">
          ${this.renderAvatar(student)}
        </div>
        <div class="student-info">
          <h4 class="student-name">${
            student.profile?.displayName || "Unknown"
          }</h4>
          <p class="student-major">${
            student.profile?.major || "Unknown Major"
          }</p>
          <p class="student-university">${
            student.universityInfo?.universityName || "Unknown University"
          }</p>
        </div>
        <div class="student-actions">
          ${this.renderFriendRequestButton(student)}
        </div>
      </div>
    `
      )
      .join("");

    resultsContainer.innerHTML = `
      <div class="search-results-header">
        <h4>Search Results (${filteredResults.length})</h4>
        <button class="btn-clear-search" title="Clear search results">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="search-results-container">
        <div class="students-grid">
          ${resultsHTML}
        </div>
      </div>
    `;

    // Add smooth dropdown animation
    resultsContainer.classList.add("show");

    // Use event delegation - single listener on container, no memory leaks
    resultsContainer.addEventListener("click", (e) => {
      if (e.target.closest(".btn-send-request")) {
        const button = e.target.closest(".btn-send-request");
        const studentId = button.dataset.studentId;

        // Prevent multiple clicks while processing
        if (button.disabled) return;

        this.handleSendFriendRequest(
          studentId,
          results.find((s) => s.id === studentId)
        );
      }

      if (e.target.closest(".btn-clear-search")) {
        this.clearSearchResults();
      }
    });

    // Update button states and filter friends from search results
    // Use setTimeout to ensure DOM is fully rendered before updating
    setTimeout(() => {
      this.updateSearchResultsButtons();
      this.filterSearchResultsForAcceptedRequests();
    }, 0);
  }

  /**
   * 🧹 Clear search results with smooth animation
   */
  clearSearchResults() {
    console.log("🧹 Clearing search results");

    const resultsContainer = document.getElementById("searchResults");
    if (resultsContainer) {
      // Remove show class for smooth animation
      resultsContainer.classList.remove("show");

      // Remove element after animation completes
      setTimeout(() => {
        if (resultsContainer.parentNode) {
          resultsContainer.remove();
        }
      }, 300); // Match CSS transition duration
    }

    // DON'T clear search input - let user keep their search term
    // if (this.elements.searchInput) {
    //   this.elements.searchInput.value = "";
    // }
  }

  /**
   * 🧹 Filter search results to hide cards for accepted friend requests and current friends
   * This is called when outgoing requests or friends list are updated in real-time
   */
  filterSearchResultsForAcceptedRequests() {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) {
      return; // No search results to filter
    }

    const studentCards = searchResults.querySelectorAll(".student-card");
    let removedCount = 0;

    // Create a set of current friend IDs for fast lookup
    const currentFriendIds = new Set(
      this.currentFriendsData.map((friend) => friend.id)
    );

    studentCards.forEach((card) => {
      const studentId = card.dataset.studentId;
      const outgoingRequest = this.outgoingRequestsMap.get(studentId);

      // Hide users who are now friends (either accepted requests or existing friends)
      const shouldRemove =
        (outgoingRequest && outgoingRequest.status === "accepted") || // Old logic for non-clean lifecycle
        currentFriendIds.has(studentId); // New logic: hide current friends

      if (shouldRemove) {
        console.log(
          `📋 Removing search card for friend/accepted request: ${studentId}`
        );
        card.style.opacity = "0.5";
        card.style.transform = "scale(0.9)";

        // Remove card after animation
        setTimeout(() => {
          if (card.parentNode) {
            card.remove();
            removedCount++;

            // Check if we need to show empty state
            const remainingCards =
              searchResults.querySelectorAll(".student-card");
            if (remainingCards.length === 0) {
              this.showSearchResultsEmptyState(searchResults);
            }
          }
        }, 300);
      }
    });

    if (removedCount > 0) {
      console.log(
        `📋 Filtered out ${removedCount} friends/accepted requests from search results`
      );
    }
  }

  /**
   * 🏳️ Show empty state for search results
   * @param {HTMLElement} resultsContainer - Search results container
   */
  showSearchResultsEmptyState(resultsContainer) {
    const resultsContentContainer = resultsContainer.querySelector(
      ".search-results-container"
    );
    if (resultsContentContainer) {
      resultsContentContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🤝</div>
          <p>All found users are now your friends!</p>
        </div>
      `;
    }
  }

  /**
   * 👥 Refresh the friends list display
   */
  async refreshFriendsList() {
    try {
      const friends = await friendsManager.getFriendsList();
      await this.displayFriendsList(friends);
    } catch (error) {
      console.error("❌ Error refreshing friends list:", error);
    }
  }

  /**
   * 👥 Display the friends list with bilateral privacy support
   */
  async displayFriendsList(friends) {
    if (!this.elements.friendsList) return;

    // Store friends data for unfriend functionality
    this.currentFriendsData = friends;

    if (friends.length === 0) {
      // Show empty state (it's already in the HTML)
      this.elements.friendsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h4>No friends yet!</h4>
          <p>Start connecting with your classmates to see shared study times and plan group sessions.</p>
        </div>
      `;
      console.log("👥 No friends to display");
      return;
    }

    console.log("👥 Displaying friends:", friends);

    const friendsHTML = friends
      .map(
        (friend) => `
      <div class="friend-card" data-friend-id="${friend.id}">
        <div class="friend-avatar">
          ${this.renderAvatar(friend)}
          ${friend.isOnline ? '<div class="online-indicator"></div>' : ""}
        </div>
        <div class="friend-info">
          <h4 class="friend-name">${friend.displayName}</h4>
          <p class="friend-major">${friend.major}</p>
          ${
            friend.mutualFriends > 0
              ? `
            <p class="mutual-friends">
              <i class="fas fa-users"></i>
              ${friend.mutualFriends} mutual friends
            </p>
          `
              : ""
          }
          ${this.renderScheduleAccessStatus(friend)}
        </div>
        <div class="friend-actions">
          <div class="friend-options-container" data-friend-id="${friend.id}">
            <!-- FriendOptionsMenu will be rendered here -->
          </div>
        </div>
      </div>
    `
      )
      .join("");

    this.elements.friendsList.innerHTML = friendsHTML;

    // 🔗 Render friend options menus for each friend card with bilateral privacy
    await this.renderFriendOptionsMenus(friends);

    // 🔐 Update all friend cards with their actual bilateral privacy status
    // Add small delay to allow Firestore writes to propagate
    setTimeout(async () => {
      await this.updateAllFriendCardsBilateralPrivacy(friends);
    }, 500);
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

    // Store friend requests data for accept/reject functionality
    this.currentFriendRequestsData = requests;

    if (requests.length === 0) {
      // Show empty state (it's already in the HTML)
      this.elements.friendRequests.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📬</div>
          <p>No pending friend requests</p>
        </div>
      `;
      console.log("📬 No friend requests to display");
      return;
    }

    console.log("📬 Displaying friend requests:", requests);

    const requestsHTML = requests
      .map(
        (request) => `
      <div class="friend-request-card" data-request-id="${request.id}">
                <div class="request-avatar">
          ${this.renderAvatar(request)}
        </div>
        <div class="request-info">
          <h4 class="request-name">${request.displayName}</h4>
          <p class="request-major">${request.major}</p>
          <p class="request-university">${request.university}</p>
          <p class="request-time">
            <i class="fas fa-clock"></i>
            ${this.formatTimeAgo(request.createdAt)}
          </p>
        </div>
        <div class="request-actions">
          <button class="btn-accept-request" data-request-id="${
            request.id
          }" data-request-name="${request.displayName}">
            <i class="fas fa-check"></i>
            Accept
          </button>
          <button class="btn-reject-request" data-request-id="${
            request.id
          }" data-request-name="${request.displayName}">
            <i class="fas fa-times"></i>
            Decline
          </button>
        </div>
      </div>
    `
      )
      .join("");

    this.elements.friendRequests.innerHTML = requestsHTML;

    // Use event delegation - single listener, no memory leaks
    this.elements.friendRequests.addEventListener("click", async (e) => {
      if (e.target.closest(".btn-accept-request")) {
        const button = e.target.closest(".btn-accept-request");

        // Check if button is already disabled (processing)
        if (button.disabled) return;

        const requestId = button.dataset.requestId;
        await this.handleAcceptFriendRequest(
          requestId,
          this.currentFriendRequestsData.find((r) => r.id === requestId)
        );
      }

      if (e.target.closest(".btn-reject-request")) {
        const button = e.target.closest(".btn-reject-request");

        // Check if button is already disabled (processing)
        if (button.disabled) return;

        const requestId = button.dataset.requestId;
        await this.handleRejectFriendRequest(
          requestId,
          this.currentFriendRequestsData.find((r) => r.id === requestId)
        );
      }
    });
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
   * 🎨 Render avatar using centralized utility (eliminates duplication)
   * @param {Object} userData - User data object from any source
   * @returns {string} HTML for avatar
   */
  renderAvatar(userData) {
    // Use the centralized avatar utility with cache-busting for fresh avatars
    // This ensures consistent avatar rendering across the entire app
    return renderUserAvatar(userData, true);
  }

  /**
   * 🔒 Render schedule access status for friend cards
   *
   * BEGINNER EXPLANATION:
   * This method creates the HTML that shows whether each friend
   * can see the current user's schedule. It's like a "permission indicator"
   * that shows:
   * - Green checkmark = "This friend can see your schedule"
   * - Red lock = "This friend cannot see your schedule"
   *
   * WHY THIS IS USEFUL:
   * Users can quickly see which friends have access to their schedule
   * and which ones don't, helping them understand their privacy settings.
   *
   * @param {Object} friend - Friend data object
   * @returns {string} HTML for schedule access indicator
   */
  renderScheduleAccessStatus(friend) {
    // Default to visible for initial render - will be updated by bilateral privacy after render
    // The FriendOptionsMenu and bilateral privacy indicators will handle the actual state
    const myScheduleVisible = true; // Optimistic default, updated by bilateral privacy service

    if (myScheduleVisible) {
      // Default to visible state - will be updated by bilateral privacy after render
      return `
        <p class="schedule-access bilateral-privacy my-schedule-visible" 
           title="Privacy status will be updated by bilateral privacy system">
          <i class="fas fa-eye"></i>
          <span>Your schedule is visible</span>
        </p>
      `;
    } else {
      // Fallback hidden state - rarely used since we default to visible
      return `
        <p class="schedule-access bilateral-privacy my-schedule-hidden"
           title="Privacy status will be updated by bilateral privacy system">
          <i class="fas fa-eye-slash"></i>
          <span>You hid your schedule</span>
        </p>
      `;
    }
  }

  /**
   * ⏰ Format time ago for friend requests
   * @param {Date|Object} timestamp - Timestamp from Firestore
   * @returns {string} Formatted time string
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return "Recently";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  }

  /**
   * 📅 Format friends since date
   * @param {Date|Object} timestamp - Friendship start date
   * @returns {string} Formatted date string
   */
  formatFriendsSince(timestamp) {
    if (!timestamp) return "Recently";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  }

  /**
   * 📩 Handle sending friend request
   * @param {string} studentId - Target student ID
   * @param {Object} studentData - Student data object
   */
  async handleSendFriendRequest(studentId, studentData) {
    try {
      console.log(
        `📩 Sending friend request to: ${studentData.profile?.displayName}`
      );

      // Show loading state on button
      const button = document.querySelector(
        `[data-student-id="${studentId}"].btn-send-request`
      );
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      }

      const result = await friendsManager.sendFriendRequest(
        studentId,
        studentData
      );

      if (result.success) {
        this.showMessage(result.message, "success");

        // Show success notification
        notificationManager.showSystemNotification(
          `Friend request sent to ${studentData.profile?.displayName}`,
          "success"
        );

        // 📋 Let the real-time system handle the button state updates
        // The real-time outgoing friend request listener will automatically update the
        // outgoingRequestsMap when the request is created in the database, which will
        // trigger the button to show the pending state through updateSearchResultsButtons()

        // Show immediate feedback by updating the button manually while we wait for real-time
        if (button) {
          console.log(
            `📋 Immediately updating button for ${studentId} to pending state`
          );
          button.className = "btn-pending-request";
          button.innerHTML = '<i class="fas fa-clock"></i>';
          button.disabled = true;
          button.setAttribute("title", "Friend request pending");
        }
      } else {
        this.showMessage(result.message, "error");

        // Show error notification
        notificationManager.showSystemNotification(result.message, "error");

        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML =
            '<i class="fas fa-user-plus"></i> Send Friend Request';
        }
      }
    } catch (error) {
      console.error("❌ Error sending friend request:", error);
      const errorMessage = "Failed to send friend request. Please try again.";
      this.showMessage(errorMessage, "error");

      // Show error notification
      notificationManager.showSystemNotification(errorMessage, "error");

      // Reset button on error
      const button = document.querySelector(
        `[data-student-id="${studentId}"].btn-send-request, [data-student-id="${studentId}"].btn-pending-request`
      );
      if (button) {
        button.className = "btn-send-request";
        button.innerHTML =
          '<i class="fas fa-user-plus"></i> Send Friend Request';
        button.disabled = false;
      }
    }
  }

  /**
   * ✅ Handle accepting friend request
   * @param {string} requestId - Request ID
   * @param {Object} requestData - Request data object
   */
  async handleAcceptFriendRequest(requestId, requestData) {
    try {
      // Safety check for requestData
      if (!requestData) {
        console.error("❌ No request data provided for accept operation");
        this.showMessage("Invalid request data", "error");
        return;
      }

      const senderName =
        requestData.displayName ||
        requestData.fromUserInfo?.displayName ||
        "Unknown User";

      console.log(`✅ Accepting friend request from: ${senderName}`);

      // Show loading state on button
      const button = document.querySelector(
        `[data-request-id="${requestId}"].btn-accept-request`
      );
      if (button) {
        button.disabled = true;
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }

      const result = await friendsManager.acceptFriendRequest(
        requestId,
        requestData
      );

      if (result.success) {
        this.showMessage(result.message, "success");

        // Show friend accepted notification
        notificationManager.showFriendAcceptedNotification(requestData);

        // Remove the request card
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
          card.style.opacity = "0.5";
          setTimeout(() => card.remove(), 500);
        }

        // Refresh the friend requests and friends list
        await this.refreshFriendRequests();
        await this.refreshFriendsList();
      } else {
        this.showMessage(result.message, "error");

        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-check"></i> Accept';
        }
      }
    } catch (error) {
      console.error("❌ Error accepting friend request:", error);
      const errorMessage = "Failed to accept friend request. Please try again.";
      this.showMessage(errorMessage, "error");

      // Show error notification
      notificationManager.showSystemNotification(errorMessage, "error");
    }
  }

  /**
   * ❌ Handle rejecting friend request
   * @param {string} requestId - Request ID
   * @param {Object} requestData - Request data object
   */
  async handleRejectFriendRequest(requestId, requestData) {
    try {
      // Safety check for requestData
      if (!requestData) {
        console.error("❌ No request data provided for reject operation");
        this.showMessage("Invalid request data", "error");
        return;
      }

      const senderName =
        requestData.displayName ||
        requestData.fromUserInfo?.displayName ||
        "Unknown User";

      console.log(`❌ Rejecting friend request from: ${senderName}`);

      // Show loading state on button
      const button = document.querySelector(
        `[data-request-id="${requestId}"].btn-reject-request`
      );
      if (button) {
        button.disabled = true;
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Declining...';
      }

      const result = await friendsManager.rejectFriendRequest(
        requestId,
        requestData
      );

      if (result.success) {
        this.showMessage(result.message, "info");

        // Remove the request card
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
          card.style.opacity = "0.5";
          setTimeout(() => card.remove(), 500);
        }

        // Refresh the friend requests
        await this.refreshFriendRequests();
      } else {
        this.showMessage(result.message, "error");

        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-times"></i> Decline';
        }
      }
    } catch (error) {
      console.error("❌ Error rejecting friend request:", error);
      const errorMessage = "Failed to reject friend request. Please try again.";
      this.showMessage(errorMessage, "error");

      // Show error notification
      notificationManager.showSystemNotification(errorMessage, "error");
    }
  }

  /**
   * 📅 Handle viewing friend's schedule
   * @param {string} friendId - Friend's user ID
   * @param {string} friendName - Friend's display name
   */
  handleViewFriendSchedule(friendId, friendName) {
    console.log(`📅 Viewing schedule for: ${friendName} (ID: ${friendId})`);
    this.showMessage(
      `Schedule comparison with ${friendName} coming soon!`,
      "info"
    );

    // TODO: Implement schedule comparison view
    // This could navigate to a schedule comparison page or open a modal
  }

  /**
   * ⚙️ Handle friend menu options
   * @param {string} friendId - Friend's user ID
   */
  handleFriendMenu(friendId) {
    console.log(`⚙️ Friend menu for: ${friendId}`);

    // Find the friend's information from the current friends list
    const friend = this.currentFriendsData.find((f) => f.id === friendId);
    if (!friend) {
      console.error("❌ Friend not found in current data");
      this.showMessage("Friend not found", "error");
      return;
    }

    // Show unfriend confirmation modal
    showModal({
      title: "Unfriend Confirmation",
      content: `Are you sure you want to unfriend <strong>${friend.displayName}</strong>?<br><br>This action cannot be undone.`,
      isHtmlContent: true,
      showConfirmationButtons: true,
      confirmText: "Unfriend",
      cancelText: "Cancel",
      onConfirm: () => {
        this.performUnfriend(friend);
        return true; // Allow modal to close
      },
      onCancel: () => {
        console.log("💭 Unfriend cancelled by user");
      },
    });
  }

  /**
   * 💔 Perform the unfriend operation
   * @param {Object} friend - Friend object to unfriend
   * @private
   */
  async performUnfriend(friend) {
    try {
      console.log("💔 Performing unfriend operation for:", friend.displayName);

      // Show loading state
      this.showMessage("Unfriending...", "info");

      // Call the friends manager to unfriend the user
      const result = await friendsManager.unfriendUser(
        friend.id,
        friend.friendshipId,
        friend
      );

      if (result.success) {
        console.log("✅ Unfriend successful");
        this.showMessage(result.message, "success");

        // The real-time listener will automatically update the friends list
        // No need to manually refresh since we have real-time updates
      } else {
        console.error("❌ Unfriend failed:", result.message);
        this.showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("❌ Error during unfriend operation:", error);
      this.showMessage("Failed to unfriend user. Please try again.", "error");
    }
  }

  /**
   * 📋 Render the appropriate friend request button based on current status
   * @param {Object} student - Student data object
   * @returns {string} HTML for the friend request button
   */
  renderFriendRequestButton(student) {
    const studentId = student.id;
    const studentName = student.profile?.displayName;

    // Check if there's an outgoing request to this user
    const outgoingRequest = this.outgoingRequestsMap.get(studentId);

    if (outgoingRequest && outgoingRequest.status === "pending") {
      return `
        <button class="btn-pending-request" data-student-id="${studentId}" data-student-name="${studentName}" disabled title="Friend request pending">
          <i class="fas fa-clock"></i>
        </button>
      `;
    }

    // For any other case (no request, rejected, or accepted) - show send request button
    // Users won't know if they were rejected, they can just send another request
    return `
      <button class="btn-send-request" data-student-id="${studentId}" data-student-name="${studentName}">
        <i class="fas fa-user-plus"></i>
        Send Friend Request
      </button>
    `;
  }

  /**
   * 🔗 Render FriendOptionsMenu components with bilateral privacy controls
   *
   * BILATERAL PRIVACY EXPLANATION:
   * This creates the three-dots menu for each friend card with options like:
   * - Hide/Show My Schedule (bilateral privacy - user controls their own visibility)
   * - Unfriend
   *
   * Uses the new FriendshipPrivacyService for proper bilateral privacy management.
   *
   * @param {Array} friends - Array of friend objects
   */
  async renderFriendOptionsMenus(friends) {
    // Clean up existing menus first
    this.cleanupFriendOptionsMenus();

    // Render menus with bilateral privacy support
    const menuPromises = friends.map(async (friend) => {
      const friendId = friend.id || friend.uid;
      const container = this.elements.friendsList.querySelector(
        `.friend-options-container[data-friend-id="${friendId}"]`
      );

      if (container) {
        try {
          // Create new menu instance with bilateral privacy
          const menu = new FriendOptionsMenu(friend);

          // Store reference for cleanup
          this.friendOptionMenus.set(friendId, menu);

          // Render into container (async for bilateral privacy)
          await menu.render(container);

          console.log(
            `🔗 Rendered bilateral privacy menu for ${friend.displayName}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to render menu for ${friend.displayName}:`,
            error
          );
          // Fallback: render without menu
        }
      } else {
        console.warn(`⚠️ Container not found for friend ${friendId}`);
      }
    });

    // Wait for all menus to render
    await Promise.all(menuPromises);

    // Set up event listeners for menu events
    this.setupFriendMenuEventListeners();
  }

  /**
   * 🎯 Set up event listeners for friend menu events
   *
   * BEGINNER EXPLANATION:
   * The FriendOptionsMenu components emit custom events when users interact with them.
   * We listen for these events and handle them appropriately.
   */
  setupFriendMenuEventListeners() {
    // Remove existing listeners to prevent duplicates
    if (this.friendsListEventHandler) {
      this.elements.friendsList.removeEventListener(
        "privacy-changed",
        this.friendsListEventHandler
      );
      this.elements.friendsList.removeEventListener(
        "unfriend-requested",
        this.friendsListEventHandler
      );
    }

    // Create bound handler for cleanup
    this.friendsListEventHandler = (e) => {
      if (e.type === "privacy-changed") {
        this.handlePrivacyChanged(e.detail);
      } else if (e.type === "unfriend-requested") {
        this.handleUnfriendRequested(e.detail);
      }
    };

    // Add event listeners
    this.elements.friendsList.addEventListener(
      "privacy-changed",
      this.friendsListEventHandler
    );
    this.elements.friendsList.addEventListener(
      "unfriend-requested",
      this.friendsListEventHandler
    );

    console.log("🎯 Friend menu event listeners set up");
  }

  /**
   * 🔒 Handle bilateral privacy change events from friend menus
   * @param {Object} detail - Event detail with friendId, myScheduleVisible, privacyStatus, friend
   */
  handlePrivacyChanged(detail) {
    const { friendId, myScheduleVisible, privacyStatus, friend } = detail;

    console.log(
      `🔒 Bilateral privacy changed for ${friend.displayName}:`,
      privacyStatus
    );

    // Update the friend card to reflect new bilateral privacy state
    this.updateFriendCardBilateralPrivacyIndicator(friendId, privacyStatus);

    // Show user feedback with bilateral privacy messaging
    const message = myScheduleVisible
      ? `Your schedule is now visible to ${friend.displayName}`
      : `You hid your schedule from ${friend.displayName}`;

    notificationManager.showSystemNotification(message, "info");
  }

  /**
   * 👋 Handle unfriend requests from friend menus
   * @param {Object} detail - Event detail with friendId, friendName, friend
   */
  handleUnfriendRequested(detail) {
    const { friendId, friendName, friend } = detail;

    console.log(`👋 Unfriend requested for ${friendName}`);

    // Use existing unfriend logic
    this.handleUnfriend(friendId, friendName, friend);
  }

  /**
   * 👋 Handle unfriend operation (creates confirmation modal and calls performUnfriend)
   * @param {string} friendId - Friend's user ID
   * @param {string} friendName - Friend's display name
   * @param {Object} friend - Complete friend object (optional, will be found if not provided)
   */
  handleUnfriend(friendId, friendName, friend = null) {
    console.log(`👋 Handling unfriend request for ${friendName}`);

    // Find the friend object if not provided
    let friendObj = friend;
    if (!friendObj) {
      friendObj = this.currentFriendsData.find((f) => f.id === friendId);
      if (!friendObj) {
        console.error("❌ Friend not found in current data");
        this.showMessage("Friend not found", "error");
        return;
      }
    }

    // Show unfriend confirmation modal
    showModal({
      title: "Unfriend Confirmation",
      content: `Are you sure you want to unfriend <strong>${friendName}</strong>?<br><br>This action cannot be undone.`,
      isHtmlContent: true,
      showConfirmationButtons: true,
      confirmText: "Unfriend",
      cancelText: "Cancel",
      onConfirm: () => {
        this.performUnfriend(friendObj);
        return true; // Allow modal to close
      },
      onCancel: () => {
        console.log("💭 Unfriend cancelled by user");
      },
    });
  }

  /**
   * 🎨 Update privacy indicator in friend card
   * @param {string} friendId - Friend's user ID
   * @param {boolean} canSeeSchedule - Whether friend can see schedule
   */
  updateFriendCardPrivacyIndicator(friendId, canSeeSchedule) {
    const friendCard = this.elements.friendsList.querySelector(
      `.friend-card[data-friend-id="${friendId}"]`
    );

    if (friendCard) {
      const statusElement = friendCard.querySelector(".schedule-access");

      if (statusElement) {
        // Update classes
        statusElement.className = `schedule-access ${
          canSeeSchedule ? "can-see" : "cannot-see"
        }`;

        // Update icon
        const icon = statusElement.querySelector("i");
        if (icon) {
          icon.className = canSeeSchedule ? "fas fa-eye" : "fas fa-eye-slash";
        }

        // Update text
        const textSpan = statusElement.querySelector("span");
        if (textSpan) {
          textSpan.textContent = canSeeSchedule
            ? "Can see your schedule"
            : "Cannot see your schedule";
        }

        console.log(`🎨 Updated privacy indicator for ${friendId}`);
      }
    }
  }

  /**
   * 🎨 Update bilateral privacy indicator in friend card
   * @param {string} friendId - Friend's user ID
   * @param {Object} privacyStatus - Bilateral privacy status from FriendshipPrivacyService
   */
  updateFriendCardBilateralPrivacyIndicator(friendId, privacyStatus) {
    const friendCard = this.elements.friendsList.querySelector(
      `.friend-card[data-friend-id="${friendId}"]`
    );

    if (friendCard && privacyStatus) {
      const statusElement = friendCard.querySelector(".schedule-access");

      if (statusElement) {
        // Get bilateral privacy states
        const myScheduleVisible = privacyStatus.mySchedule?.visible ?? true;
        const friendScheduleVisible =
          privacyStatus.friendSchedule?.visible ?? true;

        // Update classes based on bilateral privacy
        const statusClass = myScheduleVisible
          ? "my-schedule-visible"
          : "my-schedule-hidden";
        statusElement.className = `schedule-access bilateral-privacy ${statusClass}`;

        // Update icon based on user's own schedule visibility
        const icon = statusElement.querySelector("i");
        if (icon) {
          icon.className = myScheduleVisible
            ? "fas fa-eye"
            : "fas fa-eye-slash";
        }

        // Update text with bilateral privacy description
        const textSpan = statusElement.querySelector("span");
        if (textSpan) {
          textSpan.textContent = myScheduleVisible
            ? "Your schedule is visible"
            : "You hid your schedule";
        }

        // Add tooltip showing both privacy states
        statusElement.title = `Your schedule: ${
          privacyStatus.mySchedule?.description || "visible"
        }\nFriend's schedule: ${
          privacyStatus.friendSchedule?.description || "visible"
        }`;

        console.log(
          `🎨 Updated bilateral privacy indicator for ${friendId}:`,
          privacyStatus
        );
      }
    }
  }

  /**
   * 🔐 Update all friend cards with bilateral privacy status after initial render
   * @param {Array} friends - Array of friend objects
   */
  async updateAllFriendCardsBilateralPrivacy(friends) {
    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.warn("⚠️ No current user found for bilateral privacy updates");
      return;
    }

    if (!friends || !Array.isArray(friends) || friends.length === 0) {
      console.log("📋 No friends to update bilateral privacy for");
      return;
    }

    console.log(
      `🔐 Updating bilateral privacy for ${friends.length} friend cards`
    );

    const privacyPromises = friends.map(async (friend) => {
      const friendId = friend.id || friend.uid || friend.friendId;

      if (!friendId) {
        console.warn("⚠️ Friend object missing ID:", friend);
        return;
      }

      if (friendId === currentUserUid) {
        console.warn(
          "⚠️ Skipping bilateral privacy update for self:",
          friendId
        );
        return;
      }

      try {
        console.log(
          `🔐 Updating bilateral privacy for friend: ${friendId} (${friend.displayName})`
        );

        // Get bilateral privacy status for this friendship
        const privacyStatus = await friendshipPrivacyService.getPrivacyStatus(
          currentUserUid,
          friendId
        );

        if (privacyStatus) {
          // Update the friend card with actual bilateral privacy status
          this.updateFriendCardBilateralPrivacyIndicator(
            friendId,
            privacyStatus
          );
          console.log(`✅ Updated bilateral privacy for ${friend.displayName}`);
        } else {
          console.warn(
            `⚠️ No privacy status found for friendship: ${currentUserUid} ↔ ${friendId}`
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to update bilateral privacy for ${friend.displayName}:`,
          error
        );
      }
    });

    // Wait for all privacy updates to complete
    await Promise.all(privacyPromises);

    console.log(`✅ Bilateral privacy updated for all friend cards`);
  }

  /**
   * 🧹 Clean up friend options menus
   */
  cleanupFriendOptionsMenus() {
    this.friendOptionMenus.forEach((menu, friendId) => {
      try {
        menu.destroy();
      } catch (error) {
        console.warn(`⚠️ Error destroying menu for friend ${friendId}:`, error);
      }
    });

    this.friendOptionMenus.clear();

    // Remove event listeners
    if (this.friendsListEventHandler) {
      this.elements.friendsList.removeEventListener(
        "privacy-changed",
        this.friendsListEventHandler
      );
      this.elements.friendsList.removeEventListener(
        "unfriend-requested",
        this.friendsListEventHandler
      );
      this.friendsListEventHandler = null;
    }

    console.log("🧹 Friend options menus cleaned up");
  }

  /**
   * 🧹 Cleanup when leaving the page (improved memory leak prevention)
   */
  cleanup() {
    try {
      // Clean up friend options menus first
      this.cleanupFriendOptionsMenus();

      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }

      // Clean up real-time subscriptions with error handling
      if (this.realTimeSubscriptions && this.realTimeSubscriptions.length > 0) {
        this.realTimeSubscriptions.forEach((unsubscribe) => {
          try {
            if (typeof unsubscribe === "function") {
              unsubscribe();
            }
          } catch (error) {
            console.warn(
              "⚠️ Error unsubscribing from real-time listener:",
              error
            );
          }
        });
        this.realTimeSubscriptions = [];
      }

      // Clear pending requests map safely
      if (this.pendingRequestsMap) {
        this.pendingRequestsMap.clear();
      }
      if (this.outgoingRequestsMap) {
        this.outgoingRequestsMap.clear();
      }

      // Clear friend data arrays
      this.currentFriendsData = [];
      this.currentFriendRequestsData = [];

      // Remove event listeners to prevent memory leaks
      try {
        this.removeEventListeners();
      } catch (error) {
        console.warn("⚠️ Error removing event listeners:", error);
      }

      // Reset listener setup flag so they can be set up again if needed
      this.listenersSetup = false;

      console.log("🧹 Friends UI cleaned up completely");
    } catch (error) {
      console.error("❌ Error during Friends UI cleanup:", error);
    }
  }
}

// 🌟 Export a single instance
export const friendsUI = new FriendsUI();

// 🎯 This is the crucial part that connects the UI to the router.
// We listen for the event dispatched by the router when a page is loaded.
console.log("🎧 Friends UI: Registering spa:page:load event listener...");
document.addEventListener("spa:page:load", (event) => {
  console.log(
    `🎧 Friends UI: Received spa:page:load event for route: ${event.detail.route}`
  );
  if (event.detail.route === "friends") {
    console.log("🎨 Friends page loaded, initializing UI...");
    // Use the singleton instance instead of creating a new one
    friendsUI.init();

    // (window.friendsManager removed; use ES module import instead)
  }
});

// Clean up when leaving the friends page
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "friends") {
    friendsUI.cleanup();
  }
});
