/**
 * 🎨 MeetchuThere Friends UI Controller
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
import { escapeHTML } from "../utils/security/sanitize.js";
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
import { performanceDebugger } from "../utils/dev/performanceDebugger.js";
import { LocationSharingToggle } from "../components/presence/LocationSharingToggle.js";
import { db } from "../lib/firebase/firebase-config.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js";

class FriendsUI {
  constructor() {
    this.elements = {};
    this.isInitialized = false;

    // 📋 Real-time friend request tracking for search results
    this.pendingRequestsMap = new Map(); // userId -> requestId
    this.outgoingRequestsMap = new Map(); // userId -> requestData (includes status)
    this.realTimeSubscriptions = [];

    // 🔧 Performance monitoring
    this.realTimeUnsubscriber = null; // Single unsubscriber for Quick Access
    this.isActive = false; // Track if page is currently active

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

    // 🔒 Privacy update flag to prevent unnecessary re-renders
    this.isUpdatingPrivacy = false;

    // 📍 Campus Presence - Location sharing toggle instance
    this.globalLocationToggle = null;

    // Removed global exposure (window.friendsPage) for security/privacy

    // Debounce timers for targeted privacy UI updates
    this.privacyUpdateTimers = new Map(); // friendId -> timeoutId

    // Track last known mutual status per friend to show success once
    this.mutualStatus = new Map(); // friendId -> boolean

    // Track first-time handshake for location sharing (mutualSharingEnabled)
    this.mutualLocationHandshake = new Map(); // friendId -> boolean

    // Track latest per-friend location visibility (my vs friend) from snapshots
    this.locationVisibilityState = new Map(); // friendId -> { my: boolean, friend: boolean }
  }

  /**
   * 🚀 Initialize the friends UI when the page loads
   */
  async init() {
    try {
      // Clean up any existing listeners first to prevent duplicates
      this.cleanup();

      this.isActive = true;

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

      // 📍 Initialize Campus Presence features
      await this.initializeCampusPresence();

      console.log(
        "🎨 Friends UI initialized successfully with real-time updates, privacy controls, and campus presence"
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

          // Skip re-rendering during privacy updates to prevent flickering
          if (this.isUpdatingPrivacy) {
            console.log(
              "🔒 Skipping friends list refresh during privacy update"
            );
            return;
          }

          // Avoid full refresh during an in-progress privacy toggle to keep UI snappy
          if (this.isUpdatingPrivacy) {
            console.log(
              "⏭️ Skipping full friends list refresh (privacy toggle in progress)"
            );
          } else {
            await this.displayFriendsList(friends);
          }

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

          // Log connection status instead of showing notification
          const statusText = status.isConnected
            ? "Connected - Real-time updates active"
            : "Disconnected - Connection lost, trying to reconnect";
          console.log(`📡 ${statusText}`);
        },

        onNewFriendRequest: (request) => {
          console.log("🔔 New friend request received in UI:", request.handle);

          // Show prominent notification for new friend requests
          notificationManager.showFriendRequestNotification(request);
        },

        // ⭐ Phase-2: Quick Access real-time updates (primary handler)
        onQuickAccessUpdated: (quickAccessData) => {
          console.log(
            "⭐ Real-time Quick Access update in UI:",
            quickAccessData
          );
          this.handleRealTimeQuickAccessUpdate(quickAccessData);
        },
      });
    }

    // ⭐ Phase 4.1: Listen for schedule privacy changes
    if (realTimeManager && realTimeManager.on) {
      const privacyChangeUnsubscriber = realTimeManager.on(
        REALTIME_EVENTS.SCHEDULE_PRIVACY_CHANGE,
        (privacyEvent) => {
          console.log(
            "🔒 Privacy change event received in FriendsPage:",
            privacyEvent
          );
          this.handlePrivacyChange(privacyEvent);
        }
      );

      // Store unsubscriber for cleanup
      if (!this.realTimeSubscriptions) {
        this.realTimeSubscriptions = [];
      }
      this.realTimeSubscriptions.push(privacyChangeUnsubscriber);
    }

    // Start real-time listening in the friends manager
    if (friendsManager.startRealTimeListening) {
      friendsManager.startRealTimeListening();
    }

    // ⭐ Quick Access updates are handled via onQuickAccessUpdated callback above
    // No need for separate setupQuickAccessRealTimeListener to prevent duplicates

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
        handle: request.handle,
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
    // Log real-time updates instead of showing notifications
    console.log(`📡 Real-time Update: ${message}`);
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
   * 📍 Initialize Campus Presence features
   */
  async initializeCampusPresence() {
    try {
      console.log("📍 Initializing Campus Presence features...");

      // Add compact location sharing toggle in header
      await this.addHeaderLocationToggle();

      console.log("✅ Campus Presence features initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing Campus Presence features:", error);
    }
  }

  /**
   * 📍 Add compact global location sharing toggle in header
   */
  async addHeaderLocationToggle() {
    const toggleContainer = document.querySelector(
      ".campus-presence-header .header-location-toggle-container"
    );
    if (!toggleContainer) {
      console.warn("⚠️ Header location toggle container not found");
      return;
    }

    try {
      // Initialize LocationSharingToggle with global mode
      this.globalLocationToggle = new LocationSharingToggle({
        mode: "global",
      });

      // Clear previous render if any
      toggleContainer.innerHTML = "";
      await this.globalLocationToggle.render(toggleContainer);

      console.log("✅ Header location sharing toggle added successfully");
    } catch (error) {
      console.error("❌ Error initializing header location toggle:", error);
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
    // Strict input gate: only trigger when input is
    // - a valid handle (with or without @), or
    // - a numeric student ID with 6+ digits.
    // This keeps results exact and prevents fuzzy suggestions.
    this.searchTimeout = setTimeout(() => {
      const isHandleCandidate = (() => {
        const t = searchTerm.startsWith("@")
          ? searchTerm.slice(1).toLowerCase()
          : searchTerm.toLowerCase();
        return /^[a-z][a-z0-9_]{2,19}$/.test(t) && !t.endsWith("_");
      })();
      const isIdCandidate = /^\d{6,}$/.test(searchTerm);

      if (isHandleCandidate || isIdCandidate) {
        console.log(`🔍 Performing search for: "${searchTerm}"`);
        this.performSearch(searchTerm);
      } else if (searchTerm.length === 0) {
        // Only clear when completely empty
        console.log("🧹 Search term empty, clearing results");
        this.clearSearchResults();
      } else {
        console.log("🔍 Input not a handle or 6+ digit ID yet");
      }
    }, 300); // Wait 300ms after user stops typing
  }

  /**
   * 🔍 Handle search button click
   */
  async handleSearch() {
    const searchTerm = this.elements.searchInput?.value.trim();

    const isHandleCandidate = (() => {
      if (!searchTerm) return false;
      const t = searchTerm.startsWith("@")
        ? searchTerm.slice(1).toLowerCase()
        : searchTerm.toLowerCase();
      return /^[a-z][a-z0-9_]{2,19}$/.test(t) && !t.endsWith("_");
    })();
    const isIdCandidate = !!searchTerm && /^\d{6,}$/.test(searchTerm);

    if (!isHandleCandidate && !isIdCandidate) {
      this.showMessage(
        "Enter a handle (e.g., @alice) or a 6+ digit student ID",
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
          <h4 class="student-name">${escapeHTML(
            student.profile?.handle ||
              student.profile?.handle_lower ||
              "Unknown"
          )}</h4>
          <p class="student-major">${escapeHTML(
            student.profile?.major ||
              student.profile?.major_lower ||
              "Unknown Major"
          )}</p>
          <p class="student-university">${escapeHTML(
            student.universityInfo?.universityName ||
              student.universityInfo?.university ||
              "Unknown University"
          )}</p>
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
          <h4 class="friend-name">${escapeHTML(friend.handle || "unknown")}</h4>
          <p class="friend-major">${escapeHTML(friend.major)}</p>
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
          <button class="mutual-location-btn" 
                  data-friend-id="${friend.id}"
                  aria-label="Mutual location status"
                  title="Mutual location status">
            <i class="fas fa-map-marker-alt"></i>
          </button>
          <button class="mutual-schedule-btn" 
                  data-friend-id="${friend.id}"
                  aria-label="Mutual schedule status"
                  title="Mutual schedule status">
            <i class="fas fa-calendar"></i>
          </button>
          <button class="quick-access-star" 
                  data-friend-id="${friend.id}"
                  aria-label="Add to Quick Access"
                  title="Add to Quick Access">
            <i class="fas fa-star" aria-hidden="true"></i>
          </button>
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

    // ⭐ Update Quick Access star states for all friend cards
    await this.updateAllQuickAccessStars(friends);

    // 🔐 Update all friend cards with their actual bilateral privacy status
    // Add small delay to allow Firestore writes to propagate
    setTimeout(async () => {
      await this.updateAllFriendCardsBilateralPrivacy(friends);
      // Set up direct friendship document listeners to ensure immediate icon updates
      await this.setupFriendCardPrivacyListeners(friends);
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
      <h4 class="request-name">@${escapeHTML(request.handle || "unknown")}</h4>
      <p class="request-major">${escapeHTML(request.major)}</p>
      <p class="request-university">${escapeHTML(request.university)}</p>
          <p class="request-time">
            <i class="fas fa-clock"></i>
            ${this.formatTimeAgo(request.createdAt)}
          </p>
        </div>
        <div class="request-actions">
          <button class="btn-accept-request" data-request-id="${
            request.id
      }" data-request-name="${escapeHTML(request.handle)}">
            <i class="fas fa-check"></i>
            Accept
          </button>
          <button class="btn-reject-request" data-request-id="${
            request.id
      }" data-request-name="${escapeHTML(request.handle)}">
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
   * 🔒 Render enhanced schedule access status for friend cards (Phase 2.3)
   *
   * ENHANCED EXPLANATION:
   * This method creates dual privacy indicators showing both sides of the privacy relationship:
   * 1. "Your Schedule" - Current user's schedule visibility to this friend
   * 2. "Their Schedule" - Friend's schedule visibility to current user
   * 3. "Location Sharing" - Bilateral location sharing status between both users
   *
   * PRIVACY STATES SHOWN:
   * - Green eye = Schedule is visible/accessible
   * - Red lock = Schedule is hidden/restricted
   * - Green location icon = Bilateral location sharing enabled
   * - Red location icon = Location sharing disabled/restricted
   * - Clear messaging explains why avatars are disabled in quick access
   *
   * INTEGRATION WITH PHASE 1.2:
   * - Connects to quick access disabled avatar logic
   * - Shows why certain friends can't be viewed in schedule comparison
   * - Consistent messaging across all privacy components
   *
   * @param {Object} friend - Friend data object
   * @returns {string} HTML for enhanced dual privacy indicators with location sharing
   */
  renderScheduleAccessStatus(friend) {
    // Removed old inline indicators. All icons live in friend-actions.
    return ``;
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
      const buttonSel = `[data-student-id="${studentId}"].btn-send-request`;
      const buttonEl = document.querySelector(buttonSel);
      const targetHandle =
        studentData?.profile?.handle ||
        buttonEl?.dataset.studentName ||
        "unknown";

      console.log(`📩 Sending friend request to: @${targetHandle}`);

      // Show loading state on button
      const button = buttonEl;
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
          `Friend request sent to @${targetHandle}`,
          "success",
          { duration: 3000 }
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
        // 📊 Analytics: friend request sent
        try {
          AnalyticsService.trackFriendRequest("sent", {
            target_handle: targetHandle,
          });
        } catch {}
      } else {
        this.showMessage(result.message, "error");

        // Log error instead of showing notification
        console.error(result.message);

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

      // Log error instead of showing notification
      console.error(errorMessage);

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
        requestData.handle ||
        requestData.fromUserInfo?.handle ||
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

        // 📊 Analytics: friend request accepted
        try {
          const senderHandle =
            requestData?.handle ||
            requestData?.fromUserInfo?.handle ||
            "unknown";
          AnalyticsService.trackFriendRequest("accepted", {
            source_handle: senderHandle,
          });
        } catch {}
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

      // Log error instead of showing notification
      console.error(errorMessage);
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
        requestData.handle ||
        requestData.fromUserInfo?.handle ||
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

        // 📊 Analytics: friend request rejected
        try {
          const senderHandle =
            requestData?.handle ||
            requestData?.fromUserInfo?.handle ||
            "unknown";
          AnalyticsService.trackFriendRequest("rejected", {
            source_handle: senderHandle,
          });
        } catch {}
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

      // Log error instead of showing notification
      console.error(errorMessage);
    }
  }

  /**
   * 📅 Handle viewing friend's schedule with privacy-aware checks (Phase 3.2)
   * @param {string} friendId - Friend's user ID
   * @param {string} friendName - Friend's display name
   */
  async handleViewFriendSchedule(friendId, friendName) {
    try {
      console.log(
        `📅 Attempting to view schedule for: ${friendName} (ID: ${friendId})`
      );

      const currentUserData = currentUser;
      if (!currentUserData?.uid) {
        console.error("❌ No current user found for privacy checks");
        notificationManager.showSystemNotification(
          "Authentication error - please sign in again",
          "error",
          { duration: 5000 }
        );
        return;
      }

      // Check privacy status using Phase 1 FriendshipPrivacyService
      console.log(`🔒 Checking schedule privacy for friend: ${friendId}`);
      const isRestricted =
        await friendshipPrivacyService.isQuickAccessRestricted(
          friendId,
          currentUserData.uid
        );

      if (isRestricted) {
        // Show restriction notification (standardized with HorizontalFriendsBar)
        console.log(`🔒 Schedule access restricted for ${friendName}`);
        notificationManager.showPrivacyNotification(
          friendName,
          "schedule",
          "access",
          { duration: 3000, type: "warning" }
        );
      } else {
        // Allow schedule access (placeholder for now)
        console.log(`✅ Schedule access allowed for ${friendName}`);
        this.showMessage(
          `Schedule comparison with ${friendName} coming soon!`,
          "info"
        );
      }
    } catch (error) {
      console.error(
        `❌ Error checking schedule privacy for ${friendName}:`,
        error
      );

      // Graceful fallback for privacy check failures
      notificationManager.showSystemNotification(
        "Unable to verify schedule access - please try again",
        "warning",
        { duration: 4000 }
      );
    }
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
      content: `Are you sure you want to unfriend <strong>@${escapeHTML(friend.handle)}</strong>?<br><br>This action cannot be undone.`,
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
      console.log(
        "💔 Performing unfriend operation for handle:",
        friend.handle
      );

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

        // 📊 Analytics: unfriend action
        try {
          AnalyticsService.trackFriendRequest("unfriended", {
            target_handle: friend?.handle || "unknown",
          });
        } catch {}

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
    const studentName = student.profile?.handle;

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
   * 🔗 Render FriendOptionsMenu components with bilateral privacy and location controls
   *
   * ENHANCED MENU EXPLANATION:
   * This creates the three-dots menu for each friend card with options like:
   * - Hide/Show My Schedule (bilateral privacy - user controls their own visibility)
   * - Share location/Hide location (campus presence - user controls location sharing per friend)
   * - Unfriend
   *
   * Uses the new FriendshipPrivacyService for proper bilateral privacy management
   * and LocationPrivacyService for individual friend location sharing.
   *
   * @param {Array} friends - Array of friend objects
   */
  async renderFriendOptionsMenus(friends) {
    // Clean up existing menus first
    this.cleanupFriendOptionsMenus();

    // Render menus with bilateral privacy and location support
    const menuPromises = friends.map(async (friend) => {
      const friendId = friend.id || friend.uid;
      const container = this.elements.friendsList.querySelector(
        `.friend-options-container[data-friend-id="${friendId}"]`
      );

      if (container) {
        try {
          // Create new menu instance with bilateral privacy and location controls
          const menu = new FriendOptionsMenu(friend, {
            enableLocationSharing: true, // Enable location sharing option
            enableSchedulePrivacy: true, // Keep existing schedule privacy
            enableUnfriend: true, // Keep existing unfriend option
          });

          // Store reference for cleanup
          this.friendOptionMenus.set(friendId, menu);

          // Render into container (async for bilateral privacy and location setup)
          await menu.render(container);

          console.log(
            `🔗 Rendered enhanced menu with location controls for @${friend.handle}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to render enhanced menu for @${friend.handle}:`,
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
   * ENHANCED EXPLANATION:
   * The FriendOptionsMenu components emit custom events when users interact with them.
   * We listen for these events and handle them appropriately.
   * Now includes location sharing change events in addition to privacy and unfriend events.
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
      this.elements.friendsList.removeEventListener(
        "location-sharing-changed",
        this.friendsListEventHandler
      );
    }

    // Create bound handler for cleanup - handles unfriend and location sharing events
    // Privacy changes are handled directly in FriendOptionsMenu to prevent flickering
    this.friendsListEventHandler = (e) => {
      if (e.type === "unfriend-requested") {
        this.handleUnfriendRequested(e.detail);
      } else if (e.type === "location-sharing-changed") {
        this.handleLocationSharingChanged(e.detail);
      }
    };

    // Add event listeners - includes new location sharing events
    this.elements.friendsList.addEventListener(
      "unfriend-requested",
      this.friendsListEventHandler
    );
    this.elements.friendsList.addEventListener(
      "location-sharing-changed",
      this.friendsListEventHandler
    );

    // ⭐ Quick Access star button event listener using event delegation
    this.elements.friendsList.addEventListener("click", async (e) => {
      if (e.target.closest(".quick-access-star")) {
        const starButton = e.target.closest(".quick-access-star");
        const friendId = starButton.dataset.friendId;

        // Prevent multiple clicks while processing
        if (starButton.disabled) return;

        await this.handleQuickAccessToggle(friendId, starButton);
      }

      // Mutual schedule status toggle handler (replaces menu Hide/Show My Schedule)
      if (e.target.closest(".mutual-schedule-btn")) {
        const btn = e.target.closest(".mutual-schedule-btn");
        const friendCard = btn.closest(".friend-card");
        const friendId = friendCard?.dataset.friendId;
        const friend = this.currentFriendsData.find((f) => f.id === friendId);
        if (!friendId || !friend) return;

        // Prevent rapid clicks
        if (btn.classList.contains("loading")) return;
        btn.classList.add("loading");

        try {
          const userUid = currentUser.state?.user?.uid;
          if (!userUid) throw new Error("Not signed in");

          // Suppress heavy full-list re-renders during this toggle
          this.isUpdatingPrivacy = true;

          // Optimistic UI: flip to red immediately if currently green.
          // If already red, keep red until backend confirms mutual allowed.
          const iconEl = btn.querySelector("i");
          if (iconEl && iconEl.classList.contains("fa-calendar-check")) {
            iconEl.className = "fas fa-calendar-times";
            btn.classList.add("restricted");
          }

          // Toggle current user's schedule visibility for this friend (background)
          const newVisible =
            await friendshipPrivacyService.toggleScheduleVisibility(
              userUid,
              friendId
            );

          // Optimistic glow for my own visibility state
          const btnContainer = friendCard.querySelector(".mutual-schedule-btn");
          if (btnContainer) {
            btnContainer.classList.toggle("mine-visible", !!newVisible);
            btnContainer.classList.toggle("mine-hidden", !newVisible);
          }

          // If I turned ON and icon is still red after a short moment, show mutual-required modal
          if (newVisible) {
            setTimeout(() => {
              const mutual = this.mutualStatus.get(friendId);
              const stillRed = btn.classList.contains("restricted");
              if (mutual === false || stillRed === true) {
                showModal({
                  title: "Mutual Sharing Required",
                  content: `You made your schedule visible, but @${friend.handle} is still hidden. Both must share to enable mutual access.`,
                  showConfirmationButtons: true,
                  confirmText: "OK",
                  cancelText: "",
                });
              }
            }, 350);
          }

          // Notify user about their action
          if (newVisible) {
            notificationManager.showSystemNotification(
              `Your schedule is now visible to @${friend.handle}`,
              "success",
              { duration: 2500 }
            );
          } else {
            notificationManager.showSystemNotification(
              `You hid your schedule from @${friend.handle}`,
              "info",
              { duration: 2500 }
            );
          }
        } catch (err) {
          console.error("❌ Failed to toggle schedule visibility:", err);
          notificationManager.showSystemNotification(
            "Failed to update schedule privacy",
            "error",
            { duration: 3500 }
          );
        } finally {
          btn.classList.remove("loading");
          // Release suppression shortly after events propagate
          setTimeout(() => {
            this.isUpdatingPrivacy = false;
          }, 800);
        }

        e.stopPropagation();
        return;
      }

      // Mutual location status toggle handler with first-time request flow
      if (e.target.closest(".mutual-location-btn")) {
        const btn = e.target.closest(".mutual-location-btn");
        const friendCard = btn.closest(".friend-card");
        const friendId = friendCard?.dataset.friendId;
        const friend = this.currentFriendsData.find((f) => f.id === friendId);
        if (!friendId || !friend) return;

        if (btn.classList.contains("loading")) return;
        btn.classList.add("loading");

        try {
          const userUid = currentUser.state?.user?.uid;
          if (!userUid) throw new Error("Not signed in");

          // Build friendshipId
          let friendshipId = friend.friendshipId;
          if (!friendshipId) {
            friendshipId =
              userUid < friendId
                ? `${userUid}_${friendId}`
                : `${friendId}_${userUid}`;
          }

          // Prefer realtime cached handshake flag; fallback to a direct read
          let mutualMeta = this.mutualLocationHandshake.get(friendId);
          if (typeof mutualMeta !== "boolean") {
            const friendshipDoc = await dataManager.getFriendshipDocument(
              friendshipId
            );
            mutualMeta =
              friendshipDoc?.locationSharingMetadata?.mutualSharingEnabled ===
              true;
          }

          if (!mutualMeta) {
            // First-time confirmation and request
            showModal({
              title: "Send Location Share Request",
              content: `Send location sharing request to @${friend.handle}? They will be notified. You only need to do this once.`,
              showConfirmationButtons: true,
              confirmText: "Send Request",
              cancelText: "Cancel",
              onConfirm: async () => {
                try {
                  const result = await friendsManager.requestLocationSharing(
                    friendId,
                    friendshipId
                  );
                  if (result?.success) {
                    // Optimistic border for my setting
                    btn.classList.add("mine-visible");
                    btn.classList.remove("mine-hidden");
                    notificationManager.showSystemNotification(
                      `Request sent to @${friend.handle}`,
                      "success",
                      { duration: 2500 }
                    );
                  } else {
                    notificationManager.showSystemNotification(
                      result?.message || "Failed to send request",
                      "error",
                      { duration: 3500 }
                    );
                  }
                } catch (reqErr) {
                  console.error(
                    "❌ Failed to send location share request:",
                    reqErr
                  );
                  notificationManager.showSystemNotification(
                    "Failed to send request",
                    "error",
                    { duration: 3500 }
                  );
                }
                return true;
              },
            });
          } else {
            // Post-handshake: decide based on precise per-user visibility
            let state = this.locationVisibilityState.get(friendId);
            if (!state) {
              const friendshipDoc = await dataManager.getFriendshipDocument(
                friendshipId
              );
              const vis = friendshipDoc?.locationVisibility || {};
              state = {
                my: vis[userUid] === true,
                friend: vis[friendId] === true,
              };
            }

            // If my visibility is true and friend is false => block and show mutual required
            if (state.my === true && state.friend === false) {
              showModal({
                title: "Mutual Location Sharing Required",
                content: `@${friend.handle} has hidden their location. Both must share to see each other.`,
                showConfirmationButtons: true,
                confirmText: "OK",
                cancelText: "",
              });
              e.stopPropagation();
              return;
            }

            // Otherwise: toggle my location sharing
            const newEnabled =
              await friendshipPrivacyService.toggleLocationVisibility(
                userUid,
                friendId
              );
            btn.classList.toggle("mine-visible", !!newEnabled);
            btn.classList.toggle("mine-hidden", !newEnabled);
            if (newEnabled) {
              setTimeout(() => {
                // Check latest mutual state from snapshot cache; avoid false modal if snapshot just landed
                const vis = this.locationVisibilityState.get(friendId);
                const isMutualNow =
                  vis && vis.my === true && vis.friend === true;
                if (!isMutualNow) {
                  showModal({
                    title: "Mutual Location Sharing Required",
                    content: `You enabled location sharing, but @${friend.handle} is still hidden. Both must share to see each other.`,
                    showConfirmationButtons: true,
                    confirmText: "OK",
                    cancelText: "",
                  });
                }
              }, 400);
            }
          }
        } catch (err) {
          console.error("❌ Failed to toggle/request location sharing:", err);
          notificationManager.showSystemNotification(
            "Failed to update location sharing",
            "error",
            { duration: 3500 }
          );
        } finally {
          btn.classList.remove("loading");
        }

        e.stopPropagation();
        return;
      }

      // 👥 Friend avatar click handling for schedule viewing (Phase 3.2)
      if (e.target.closest(".friend-avatar")) {
        const avatarElement = e.target.closest(".friend-avatar");
        const friendCard = avatarElement.closest(".friend-card");

        if (friendCard) {
          const friendId = friendCard.dataset.friendId;
          const friend = this.currentFriendsData.find((f) => f.id === friendId);

          if (friend && friendId) {
            console.log(`👥 Friend avatar clicked: @${friend.handle}`);
            await this.handleViewFriendSchedule(friendId, friend.handle);
          } else {
            console.warn("⚠️ Friend data not found for avatar click");
          }
        }
      }
    });

    console.log(
      "🎯 Friend menu event listeners set up with location sharing support (privacy-changed removed to prevent flickering)"
    );
  }

  /**
   * 🔒 Handle bilateral privacy change events from friend menus
   * @param {Object} detail - Event detail with friendId, myScheduleVisible, privacyStatus, friend
   */
  handlePrivacyChanged(detail) {
    const { friendId, myScheduleVisible, privacyStatus, friend } = detail;

    console.log(
      `🔒 Bilateral privacy changed for @${friend.handle}:`,
      privacyStatus
    );

    // Update the friend card to reflect new bilateral privacy state
    this.updateFriendCardBilateralPrivacyIndicator(friendId, privacyStatus);

    // Privacy changes are now silent - no notifications needed
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
   * 📍 Handle location sharing changes from friend menus
   * @param {Object} detail - Event detail with type, enabled, friendId, etc.
   */
  handleLocationSharingChanged(detail) {
    const { type, enabled, friendId, component } = detail;

    console.log(`📍 Location sharing changed:`, detail);

    if (type === "friend" && friendId) {
      const friend = this.currentFriendsData.find((f) => f.id === friendId);
      const friendName = friend?.handle || "friend";

      // Log the change
      console.log(
        `📍 Location sharing with ${friendName} is now ${
          enabled ? "enabled" : "disabled"
        }`
      );

      // The LocationSharingToggle component already handles the actual service calls
      // and shows success/error notifications, so we just need to log here

      // Optional: Update any UI indicators if needed in the future
      // this.updateFriendLocationSharingIndicator(friendId, enabled);
    } else if (type === "global") {
      console.log(
        `📍 Global location sharing is now ${enabled ? "enabled" : "disabled"}`
      );

      // Optional: Update global indicators if needed in the future
      // this.updateGlobalLocationSharingIndicator(enabled);
    }
  }

  /**
   * 📡 Listen to friendship documents for visible cards and update the mutual icon immediately
   */
  async setupFriendCardPrivacyListeners(friends) {
    try {
      const currentUserUid = currentUser?.state?.user?.uid;
      if (!currentUserUid) return;

      const { doc, onSnapshot } = await import("firebase/firestore");

      // Clean up previous observers/listeners
      if (!this.friendshipPrivacyUnsubscribers)
        this.friendshipPrivacyUnsubscribers = new Map();
      if (this.friendshipPrivacyObserver) {
        try {
          this.friendshipPrivacyObserver.disconnect();
        } catch (_) {}
      }
      // Detach all existing listeners
      this.friendshipPrivacyUnsubscribers.forEach((unsub) => {
        try {
          if (typeof unsub === "function") unsub();
        } catch (_) {}
      });
      this.friendshipPrivacyUnsubscribers.clear();

      const attach = (friendId) => {
        if (this.friendshipPrivacyUnsubscribers.has(friendId)) return;
        const friendshipId =
          currentUserUid < friendId
            ? `${currentUserUid}_${friendId}`
            : `${friendId}_${currentUserUid}`;
        const ref = doc(db, "friendships", friendshipId);
        const unsub = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const vis = data.scheduleVisibility || {};
            const mutualAllowed =
              vis[currentUserUid] === true && vis[friendId] === true;
            const myVisible = vis[currentUserUid] === true;
            const card = this.elements.friendsList?.querySelector(
              `.friend-card[data-friend-id="${friendId}"]`
            );
            if (!card) return;
            const btn = card.querySelector(".mutual-schedule-btn");
            const icon = btn?.querySelector("i");
            if (btn && icon) {
              icon.className = mutualAllowed
                ? "fas fa-calendar-check"
                : "fas fa-calendar-times";
              btn.classList.toggle("restricted", !mutualAllowed);
              btn.classList.toggle("mine-visible", !!myVisible);
              btn.classList.toggle("mine-hidden", !myVisible);
              this.mutualStatus.set(friendId, mutualAllowed);
            }

            // Update mutual-location button from locationVisibility and metadata
            const loc = data.locationVisibility || {};
            const mutualLoc =
              loc[currentUserUid] === true && loc[friendId] === true;
            const myLoc = loc[currentUserUid] === true;
            const friendLoc = loc[friendId] === true;
            const locBtn = card.querySelector(".mutual-location-btn");
            const locIcon = locBtn?.querySelector("i");
            if (locBtn && locIcon) {
              locIcon.className = "fas fa-map-marker-alt";
              locBtn.classList.toggle("restricted", !mutualLoc);
              locBtn.classList.toggle("mine-visible", !!myLoc);
              locBtn.classList.toggle("mine-hidden", !myLoc);
            }
            const handshake =
              data.locationSharingMetadata?.mutualSharingEnabled === true;
            this.mutualLocationHandshake.set(friendId, handshake);
            this.locationVisibilityState.set(friendId, {
              my: !!myLoc,
              friend: !!friendLoc,
            });
          },
          (err) => {
            console.warn("⚠️ Friendship listener error", friendshipId, err);
          }
        );
        this.friendshipPrivacyUnsubscribers.set(friendId, unsub);
      };

      const detach = (friendId) => {
        const unsub = this.friendshipPrivacyUnsubscribers.get(friendId);
        if (unsub) {
          try {
            unsub();
          } catch (_) {}
          this.friendshipPrivacyUnsubscribers.delete(friendId);
        }
      };

      // IntersectionObserver to attach listeners only for visible cards
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const card = entry.target;
              const friendId = card?.dataset?.friendId;
              if (!friendId || friendId === currentUserUid) return;
              if (entry.isIntersecting) {
                attach(friendId);
              } else {
                detach(friendId);
              }
            });
          },
          { root: null, threshold: 0 }
        );

        this.friendshipPrivacyObserver = observer;
        // Observe all current friend cards
        friends.forEach((f) => {
          const fid = f.id || f.uid || f.friendId;
          if (!fid || fid === currentUserUid) return;
          const card = this.elements.friendsList?.querySelector(
            `.friend-card[data-friend-id="${fid}"]`
          );
          if (card) observer.observe(card);
        });
      } else {
        // Fallback: attach listeners for all cards
        friends.forEach((f) => {
          const fid = f.id || f.uid || f.friendId;
          if (!fid || fid === currentUserUid) return;
          attach(fid);
        });
      }
    } catch (e) {
      console.warn("⚠️ Failed to set up friend card privacy listeners:", e);
    }
  }

  /**
   * ⭐ Handle Quick Access star toggle (star/unstar friends)
   * @param {string} friendId - Friend's user ID
   * @param {HTMLElement} starButton - The star button element
   */
  async handleQuickAccessToggle(friendId, starButton) {
    try {
      // Find the friend's information from the current friends list
      const friend = this.currentFriendsData.find((f) => f.id === friendId);
      if (!friend) {
        console.error("❌ Friend not found in current data");
        console.error("Friend not found");
        return;
      }

      // Disable button while processing
      starButton.disabled = true;
      starButton.style.opacity = "0.6";

      console.log(`⭐ Toggling Quick Access for: @${friend.handle}`);

      // Check current status and toggle
      const isCurrentlyStarred = await friendsManager.isInQuickAccess(friendId);
      const friendInfo = {
        handle: friend.handle,
        major: friend.major,
        avatarConfig: friend.avatarConfig,
        friendshipId: friend.friendshipId, // 🌍 Campus Presence: Required for bilateral location sharing checks
      };

      let result;
      if (isCurrentlyStarred) {
        // Remove from Quick Access
        result = await friendsManager.removeFromQuickAccess(friendId);
        console.log(`❌ Removing @${friend.handle} from Quick Access`);
      } else {
        // Add to Quick Access
        result = await friendsManager.addToQuickAccess(friendId, friendInfo);
        console.log(`⭐ Adding @${friend.handle} to Quick Access`);
      }

      if (result.success) {
        // Update star button visual state
        this.updateStarButtonState(starButton, !isCurrentlyStarred);

        // Log success instead of showing notification
        const action = isCurrentlyStarred ? "removed from" : "added to";
        console.log(`@${friend.handle} ${action} Quick Access!`);

        console.log(`✅ Quick Access toggle successful for @${friend.handle}`);
      } else {
        // Log error instead of showing notification
        console.error(result.message || "Failed to update Quick Access");
        console.error(
          `❌ Quick Access toggle failed for @${friend.handle}:`,
          result.message
        );
      }
    } catch (error) {
      console.error("❌ Error in Quick Access toggle:", error);
      console.error("Something went wrong. Please try again.");
    } finally {
      // Re-enable button
      starButton.disabled = false;
      starButton.style.opacity = "1";
    }
  }

  /**
   * 🎨 Update star button visual state
   * @param {HTMLElement} starButton - The star button element
   * @param {boolean} isStarred - Whether the friend is starred
   */
  updateStarButtonState(starButton, isStarred) {
    const icon = starButton.querySelector("i");
    if (!icon) {
      console.warn("⚠️ Star button icon not found");
      return;
    }

    const friendId = starButton.dataset.friendId;
    console.log(
      `⭐ Updating star button for friend ${friendId}: isStarred=${isStarred}`
    );

    if (isStarred) {
      // Friend is starred - golden star
      icon.className = "fas fa-star";
      starButton.classList.add("starred");
      starButton.setAttribute("aria-label", "Remove from Quick Access");
      starButton.title = "Remove from Quick Access";
      console.log(`⭐ Set star to STARRED (golden) for friend ${friendId}`);
    } else {
      // Friend is not starred - outline star
      icon.className = "far fa-star";
      starButton.classList.remove("starred");
      starButton.setAttribute("aria-label", "Add to Quick Access");
      starButton.title = "Add to Quick Access";
      console.log(
        `⭐ Set star to NOT STARRED (outline) for friend ${friendId}`
      );
    }
  }

  /**
   * ⭐ Update Quick Access star states for all friend cards
   * @param {Array} friends - Array of friend objects
   */
  async updateAllQuickAccessStars(friends) {
    console.log(
      `⭐ Updating Quick Access star states for ${friends.length} friends`
    );

    // Use Promise.all for parallel execution to improve performance
    const starPromises = friends.map(async (friend) => {
      const friendId = friend.id;

      try {
        // Check if friend is in Quick Access
        const isStarred = await friendsManager.isInQuickAccess(friendId);

        // Find the star button for this friend
        const starButton = this.elements.friendsList.querySelector(
          `.quick-access-star[data-friend-id="${friendId}"]`
        );

        if (starButton) {
          // Update the star button state
          this.updateStarButtonState(starButton, isStarred);
          console.log(
            `⭐ Updated star state for @${friend.handle}: ${
              isStarred ? "starred" : "not starred"
            }`
          );
        } else {
          console.warn(`⚠️ Star button not found for friend ${friendId}`);
        }
      } catch (error) {
        console.error(
          `❌ Error updating star state for @${friend.handle}:`,
          error
        );
      }
    });

    // Wait for all star updates to complete
    await Promise.all(starPromises);
    console.log(`✅ Quick Access star states updated for all friends`);
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
        // Check if this is a bilateral privacy element - if so, don't override with can-see/cannot-see
        if (statusElement.classList.contains("bilateral-privacy")) {
          // Skip regular privacy update for bilateral privacy elements
          // They are managed by the bilateral privacy system
          return;
        }

        // Update classes for regular (non-bilateral) privacy elements
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
   * 🎨 Update enhanced bilateral privacy indicators in friend card (Phase 2.3)
   * @param {string} friendId - Friend's user ID
   * @param {Object} privacyStatus - Bilateral privacy status from FriendshipPrivacyService
   */
  updateFriendCardBilateralPrivacyIndicator(friendId, privacyStatus) {
    const friendCard = this.elements.friendsList.querySelector(
      `.friend-card[data-friend-id="${friendId}"]`
    );

    if (friendCard && privacyStatus) {
      // Compute mutual schedule visibility (both sides must allow)
      const mutualAllowed = Boolean(
        (privacyStatus.mySchedule?.visible ?? true) &&
          (privacyStatus.friendSchedule?.visible ?? true)
      );

      // Update icon inside actions row and inline indicator (if present)
      const indicator = friendCard.querySelector(".mutual-schedule-indicator");
      const actionBtn = friendCard.querySelector(".mutual-schedule-btn i");
      if (indicator) {
        indicator.classList.remove(
          "mutual-allowed",
          "mutual-restricted",
          "mutual-unknown"
        );
        indicator.classList.add(
          mutualAllowed ? "mutual-allowed" : "mutual-restricted",
          "privacy-changed"
        );

        const icon = indicator.querySelector("i");
        if (icon)
          icon.className = mutualAllowed
            ? "fas fa-calendar-check"
            : "fas fa-calendar-times";

        const friend = this.currentFriendsData.find((f) => f.id === friendId);
        const friendName = friend?.handle || "Friend";
        const titleText = mutualAllowed
          ? `Mutual: You and ${friendName} can view each other's schedules`
          : `Restricted: Schedule sharing is not mutual`;
        indicator.title = titleText;
      }

      if (actionBtn) {
        actionBtn.className = mutualAllowed
          ? "fas fa-calendar-check"
          : "fas fa-calendar-times";
      }

      // Apply glow based on current user's own schedule visibility
      const actionBtnContainer = friendCard.querySelector(
        ".mutual-schedule-btn"
      );
      if (actionBtnContainer) {
        const myVisible = privacyStatus.mySchedule?.visible === true;
        actionBtnContainer.classList.toggle("mine-visible", !!myVisible);
        actionBtnContainer.classList.toggle("mine-hidden", !myVisible);
      }

      // Toggle restricted class on the action button container
      if (actionBtnContainer) {
        actionBtnContainer.classList.toggle("restricted", !mutualAllowed);
      }

      console.log(
        `🎨 Updated mutual schedule status for ${friendId}: ${
          mutualAllowed ? "ALLOWED" : "RESTRICTED"
        }`
      );
    }
  }

  /**
   * 🎨 Update a single privacy indicator element
   * @param {HTMLElement} element - The privacy indicator element
   * @param {Object} privacyState - Privacy state object {visible, description}
   * @param {string} type - "user" or "friend" to determine messaging
   * @param {string} friendId - Friend ID for logging
   * @private
   */
  // Legacy one-way indicators removed; using single mutual icon now

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
          `🔐 Updating enhanced bilateral privacy for friend: ${friendId} (@${friend.handle})`
        );

        // Get bilateral privacy status for this friendship
        const privacyStatus = await friendshipPrivacyService.getPrivacyStatus(
          currentUserUid,
          friendId
        );

        if (privacyStatus) {
          // Update mutual schedule icon in actions + inline indicator
          this.updateFriendCardBilateralPrivacyIndicator(
            friendId,
            privacyStatus
          );

          // Also update action button background color class (green/red)
          const friendCard = this.elements.friendsList.querySelector(
            `.friend-card[data-friend-id="${friendId}"]`
          );
          if (friendCard) {
            const btn = friendCard.querySelector(".mutual-schedule-btn");
            if (btn) {
              const mutualAllowed = Boolean(
                (privacyStatus.mySchedule?.visible ?? true) &&
                  (privacyStatus.friendSchedule?.visible ?? true)
              );
              btn.classList.toggle("restricted", !mutualAllowed);
            }
          }
          console.log(
            `✅ Updated enhanced bilateral privacy for @${friend.handle}`
          );
        } else {
          console.warn(
            `⚠️ No privacy status found for friendship: ${currentUserUid} ↔ ${friendId}`
          );

          // Set default privacy states if no status found
          const defaultPrivacyStatus = {
            mySchedule: { visible: true, description: "visible to them" },
            friendSchedule: { visible: true, description: "accessible to you" },
          };

          this.updateFriendCardBilateralPrivacyIndicator(
            friendId,
            defaultPrivacyStatus
          );
          console.log(
            `🔧 Applied default privacy status for @${friend.handle}`
          );
        }

        // 📍 Update location sharing indicators
        await this.updateFriendCardLocationSharingIndicator(friendId, friend);
      } catch (error) {
        console.warn(
          `⚠️ Failed to update enhanced bilateral privacy for @${friend.handle}:`,
          error
        );

        // Apply fallback privacy status on error
        const fallbackPrivacyStatus = {
          mySchedule: { visible: true, description: "status unknown" },
          friendSchedule: {
            visible: false,
            description: "access restricted (error)",
          },
        };

        this.updateFriendCardBilateralPrivacyIndicator(
          friendId,
          fallbackPrivacyStatus
        );
      }
    });

    // Wait for all privacy updates to complete
    await Promise.all(privacyPromises);

    console.log(`✅ Bilateral privacy updated for all friend cards`);
  }

  /**
   * 📍 Update friend card location sharing indicator based on bilateral location sharing status
   * @param {string} friendId - Friend's user ID
   * @param {Object} friend - Friend data object
   */
  async updateFriendCardLocationSharingIndicator(friendId, friend) {
    try {
      const currentUserUid = currentUser.state?.user?.uid;
      if (!currentUserUid) {
        console.warn("⚠️ No current user found for location sharing update");
        return;
      }

      console.log(
        `📍 Updating location sharing indicator for: @${friend.handle}`
      );

      // Get the friendship document to check bilateral location sharing
      const friendshipId = friend.friendshipId;
      if (!friendshipId) {
        console.warn(`⚠️ No friendship ID found for @${friend.handle}`);
        this.updateLocationSharingVisualIndicator(
          friendId,
          false,
          "Friendship not found"
        );
        return;
      }

      // Get friendship document from DataService
      const friendship = await dataManager.getFriendshipDocument(friendshipId);
      if (!friendship) {
        console.warn(`⚠️ Friendship document not found: ${friendshipId}`);
        this.updateLocationSharingVisualIndicator(
          friendId,
          false,
          "Friendship data not available"
        );
        return;
      }

      // Check bilateral location sharing status
      const locationVisibility = friendship.locationVisibility || {};
      const currentUserSharing = locationVisibility[currentUserUid] === true;
      const friendSharing = locationVisibility[friendId] === true;
      const mutualLocationSharing = currentUserSharing && friendSharing;

      console.log(`📍 Location sharing status for @${friend.handle}:`, {
        currentUserSharing,
        friendSharing,
        mutualLocationSharing,
        locationVisibility,
      });

      // Update the action button (mutual-location-btn)
      const friendCard = this.elements.friendsList.querySelector(
        `.friend-card[data-friend-id="${friendId}"]`
      );
      const btn = friendCard?.querySelector(".mutual-location-btn");
      const icon = btn?.querySelector("i");
      if (btn && icon) {
        icon.className = mutualLocationSharing
          ? "fas fa-map-marker-alt"
          : "fas fa-map-marker-alt";
        btn.classList.toggle("restricted", !mutualLocationSharing);
        btn.classList.toggle("mine-visible", !!currentUserSharing);
        btn.classList.toggle("mine-hidden", !currentUserSharing);
        btn.title = mutualLocationSharing
          ? "Mutual: You and this friend share location"
          : currentUserSharing && !friendSharing
          ? "You share location, they don't"
          : !currentUserSharing && friendSharing
          ? "They share location, you don't"
          : "Location sharing disabled";
      }

      console.log(
        `✅ Updated location sharing indicator for @${friend.handle}`
      );
    } catch (error) {
      console.error(
        `❌ Error updating location sharing indicator for @${friend.handle}:`,
        error
      );
      this.updateLocationSharingVisualIndicator(
        friendId,
        false,
        "Error checking location status"
      );
    }
  }

  /**
   * 🎨 Update the visual location sharing indicator in the friend card
   * @param {string} friendId - Friend's user ID
   * @param {boolean} isMutualSharingEnabled - Whether bilateral location sharing is enabled
   * @param {string} statusMessage - Status message for tooltip
   */
  updateLocationSharingVisualIndicator() {}

  /**
   * 🧹 Clean up friend options menus and campus presence components
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
      this.elements.friendsList.removeEventListener(
        "location-sharing-changed",
        this.friendsListEventHandler
      );
      this.friendsListEventHandler = null;
    }

    console.log("🧹 Friend options menus cleaned up");
  }

  /**
   * ⭐ DEPRECATED: This method caused duplicate listeners
   * Quick Access updates are now handled via onQuickAccessUpdated callback in setupRealTimeCallbacks
   * Keeping this method for reference but it's no longer called
   */
  setupQuickAccessRealTimeListener_DEPRECATED() {
    console.warn(
      "⚠️ setupQuickAccessRealTimeListener is deprecated - use onQuickAccessUpdated callback instead"
    );
  }

  /**
   * ⭐ Handle real-time Quick Access updates from other tabs/sessions
   * Updates the star states without refetching data
   * @param {Object} quickAccessData - Quick Access update data
   */
  async handleRealTimeQuickAccessUpdate(quickAccessData) {
    try {
      console.log(
        "⭐ Processing real-time Quick Access update:",
        quickAccessData
      );

      const { quickAccessFriends = [] } = quickAccessData;

      // Convert quickAccessFriends array to Set for efficient lookup
      const starredFriendIds = new Set(
        quickAccessFriends.map((qaf) => qaf.friendId)
      );

      // Update all star buttons based on the new Quick Access data
      const allStarButtons =
        this.elements.friendsList?.querySelectorAll(".quick-access-star") || [];

      allStarButtons.forEach((starButton) => {
        const friendId = starButton.dataset.friendId;
        if (friendId) {
          const isStarred = starredFriendIds.has(friendId);
          this.updateStarButtonState(starButton, isStarred);
        }
      });

      console.log(
        `⭐ Updated ${allStarButtons.length} star button states from real-time sync`
      );

      // Skip notifications for real-time updates
      // The main star/unstar actions already show success notifications
    } catch (error) {
      console.error("❌ Error handling real-time Quick Access update:", error);
    }
  }

  /**
   * 🔒 Handle schedule privacy change events (Phase 4.1)
   * Updates bilateral privacy indicators when friends change their privacy settings
   * @param {Object} privacyEvent - Privacy change event data
   */
  async handlePrivacyChange(privacyEvent) {
    try {
      console.log(
        "🔒 Processing privacy change event in FriendsPage:",
        privacyEvent
      );

      // Extract data using the correct field names from the event
      const { fromUserId, affectedUserId, scheduleVisibility, friendName } =
        privacyEvent;

      const currentUserUid = currentUser?.user?.uid;

      if (!currentUserUid) {
        console.log("🔒 No current user - skipping privacy update");
        return;
      }

      // Check if this privacy change affects the current user
      // In bilateral privacy: fromUserId changed their schedule visibility to affectedUserId
      const isCurrentUserAffected =
        fromUserId === currentUserUid || // Current user changed their own privacy
        affectedUserId === currentUserUid; // Privacy change affects current user

      if (!isCurrentUserAffected) {
        console.log(
          "🔒 Privacy change doesn't affect current user - skipping update"
        );
        return;
      }

      console.log(
        `🔒 Current user IS affected by privacy change: ${
          friendName || "Friend"
        } ${scheduleVisibility ? "showed" : "hid"} their schedule`
      );

      // Update only the affected friend card to avoid heavy re-render
      const friendId =
        fromUserId === currentUserUid ? affectedUserId : fromUserId;
      if (!friendId) return;

      // Let the onSnapshot listener update the UI; just handle success toast here
      const existingTimer = this.privacyUpdateTimers.get(friendId);
      if (existingTimer) clearTimeout(existingTimer);
      const timerId = setTimeout(() => {
        const now = this.mutualStatus.get(friendId);
        const prev = this._prevMutualStatus || new Map();
        const was = prev.get(friendId);
        if (was === false && now === true) {
          const friendObj = this.currentFriendsData.find(
            (f) => f.id === friendId
          );
          const friendName = friendObj?.handle || "friend";
          notificationManager.showSystemNotification(
            `Mutual schedule sharing enabled with ${friendName}`,
            "success",
            { duration: 2000 }
          );
        }
        if (!this._prevMutualStatus) this._prevMutualStatus = new Map();
        this._prevMutualStatus.set(friendId, now);
        this.privacyUpdateTimers.delete(friendId);
      }, 150);
      this.privacyUpdateTimers.set(friendId, timerId);

      console.log("✅ Privacy change processed successfully in FriendsPage");
    } catch (error) {
      console.error("❌ Error handling privacy change in FriendsPage:", error);
    }
  }

  /**
   * 🧹 Cleanup when leaving the page (improved memory leak prevention)
   */
  cleanup() {
    try {
      this.isActive = false;

      // Clean up friend options menus first
      this.cleanupFriendOptionsMenus();

      // Clean up campus presence components
      this.cleanupCampusPresence();

      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }

      // Clean up real-time subscriptions with error handling
      if (this.realTimeSubscriptions && this.realTimeSubscriptions.length > 0) {
        console.log(
          `🧹 Cleaning up ${this.realTimeSubscriptions.length} real-time subscriptions`
        );
        this.realTimeSubscriptions.forEach((unsubscribe, index) => {
          try {
            if (typeof unsubscribe === "function") {
              unsubscribe();
            }
          } catch (error) {
            console.warn(
              `⚠️ Error unsubscribing from real-time listener ${index}:`,
              error
            );
          }
        });
        this.realTimeSubscriptions = [];
      }

      // Clean up Quick Access unsubscriber
      if (this.realTimeUnsubscriber) {
        try {
          this.realTimeUnsubscriber();
          this.realTimeUnsubscriber = null;
        } catch (error) {
          console.warn(
            "⚠️ Error cleaning up Quick Access unsubscriber:",
            error
          );
        }
      }

      // Stop real-time listening in friends manager
      if (friendsManager.stopRealTimeListening) {
        try {
          friendsManager.stopRealTimeListening();
        } catch (error) {
          console.warn(
            "⚠️ Error stopping friends manager real-time listening:",
            error
          );
        }
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

  /**
   * 🧹 Clean up campus presence components
   */
  cleanupCampusPresence() {
    try {
      // Clean up global location toggle
      if (this.globalLocationToggle) {
        this.globalLocationToggle.destroy();
        this.globalLocationToggle = null;
      }

      // Remove header location toggle DOM (new structure)
      const headerContainer = document.querySelector(
        ".campus-presence-header .header-location-toggle-container"
      );
      if (headerContainer) headerContainer.innerHTML = "";

      console.log("🧹 Campus presence components cleaned up");
    } catch (error) {
      console.warn("⚠️ Error cleaning up campus presence components:", error);
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
