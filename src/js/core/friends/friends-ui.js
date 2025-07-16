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
import { notificationManager } from "../notification-manager.js";

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
      
      // 🎛️ Set up real-time integration
      this.setupRealTimeCallbacks();
      
      this.isInitialized = true;

      // Always load initial data on page visit
      this.loadInitialData();

      console.log("🎨 Friends UI initialized successfully with real-time updates");
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

    // Search functionality with safety checks
    if (this.elements.searchInput) {
      try {
        // Remove any existing listeners first (in case DOM was recreated)
        this.elements.searchInput.removeEventListener("input", this.boundHandlers.searchInput);
        this.elements.searchInput.removeEventListener("keypress", this.boundHandlers.searchKeypress);
        
        // Add fresh listeners
        this.elements.searchInput.addEventListener("input", this.boundHandlers.searchInput);
        this.elements.searchInput.addEventListener("keypress", this.boundHandlers.searchKeypress);
      } catch (error) {
        console.warn("⚠️ Could not set up search input listeners:", error);
      }
    } else {
      console.warn("⚠️ Search input element not found - search functionality disabled");
    }

    if (this.elements.searchBtn) {
      try {
        // Remove any existing listeners first
        this.elements.searchBtn.removeEventListener("click", this.boundHandlers.searchClick);
        
        // Add fresh listener
        this.elements.searchBtn.addEventListener("click", this.boundHandlers.searchClick);
      } catch (error) {
        console.warn("⚠️ Could not set up search button listener:", error);
      }
    } else {
      console.warn("⚠️ Search button element not found");
    }

    console.log("🎯 Event listeners set up");
  }

  /**
   * 🧹 Remove event listeners to prevent duplicates
   */
  removeEventListeners() {
    if (this.boundHandlers) {
      try {
        if (this.elements.searchInput) {
          this.elements.searchInput.removeEventListener("input", this.boundHandlers.searchInput);
          this.elements.searchInput.removeEventListener("keypress", this.boundHandlers.searchKeypress);
        }

        if (this.elements.searchBtn) {
          this.elements.searchBtn.removeEventListener("click", this.boundHandlers.searchClick);
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
          console.log("📬 Real-time friend requests update in UI:", requests.length);
          this.displayFriendRequests(requests);
          
          // Show a more subtle notification for request updates
          if (requests.length > 0) {
            this.showRealTimeNotification(`${requests.length} friend request${requests.length !== 1 ? 's' : ''}`);
          }
        },
        
        onFriendsListChange: (friends) => {
          console.log("🤝 Real-time friends list update in UI:", friends.length);
          this.displayFriendsList(friends);
          
          // Show a more subtle notification for friends list updates
          if (friends.length > 0) {
            this.showRealTimeNotification(`${friends.length} friend${friends.length !== 1 ? 's' : ''} connected`);
          }
        },
        
        onConnectionStatusChange: (status) => {
          console.log("📡 Real-time connection status in UI:", status);
          this.displayConnectionStatus(status);
          
          // Show connection status notifications
          notificationManager.showConnectionStatusNotification(status);
        },
        
        onNewFriendRequest: (request) => {
          console.log("🔔 New friend request received in UI:", request.displayName);
          
          // Show prominent notification for new friend requests
          notificationManager.showFriendRequestNotification(request);
        }
      });
    }

    // Start real-time listening in the friends manager
    if (friendsManager.startRealTimeListening) {
      friendsManager.startRealTimeListening();
    }

    console.log("✅ Real-time UI callbacks set up successfully");
  }

  /**
   * 🔔 Show a subtle real-time update notification
   * @param {string} message - Message to show
   */
  showRealTimeNotification(message) {
    // Use the notification manager for consistent notifications
    notificationManager.showSystemNotification(message, "info", "Real-time Update");
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
    const searchSection = document.querySelector('.friends-search');
    let resultsContainer = document.getElementById('searchResults');
    
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.id = 'searchResults';
      resultsContainer.className = 'search-results';
      searchSection.appendChild(resultsContainer);
    }

    if (results.length === 0) {
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
      resultsContainer.classList.add('show');
      return;
    }

    // Display search results with Send Friend Request buttons
    const resultsHTML = results.map(student => `
      <div class="student-card" data-student-id="${student.id}">
        <div class="student-avatar">
          ${this.renderAvatar(student.avatarConfig)}
        </div>
        <div class="student-info">
          <h4 class="student-name">${student.profile?.displayName || 'Unknown'}</h4>
          <p class="student-major">${student.profile?.major || 'Unknown Major'}</p>
          <p class="student-university">${student.universityInfo?.universityName || 'Unknown University'}</p>
        </div>
        <div class="student-actions">
          <button class="btn-send-request" data-student-id="${student.id}" data-student-name="${student.profile?.displayName}">
            <i class="fas fa-user-plus"></i>
            Send Friend Request
          </button>
        </div>
      </div>
    `).join('');

    resultsContainer.innerHTML = `
      <div class="search-results-header">
        <h4>Search Results (${results.length})</h4>
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
    resultsContainer.classList.add('show');

    // Remove existing event listeners to prevent duplicates
    const existingListener = resultsContainer.__friendsEventListener;
    if (existingListener) {
      resultsContainer.removeEventListener('click', existingListener);
    }

    // Add event listeners for Send Friend Request buttons
    const clickHandler = async (e) => {
      if (e.target.closest('.btn-send-request')) {
        const button = e.target.closest('.btn-send-request');
        const studentId = button.dataset.studentId;
        const studentName = button.dataset.studentName;
        
        // Prevent multiple clicks while processing
        if (button.disabled) return;
        
        await this.handleSendFriendRequest(studentId, results.find(s => s.id === studentId));
      }
      
      if (e.target.closest('.btn-clear-search')) {
        this.clearSearchResults();
      }
    };
    
    resultsContainer.addEventListener('click', clickHandler);
    // Store reference to remove it later
    resultsContainer.__friendsEventListener = clickHandler;
  }

  /**
   * 🧹 Clear search results with smooth animation
   */
  clearSearchResults() {
    console.log("🧹 Clearing search results");
    
    const resultsContainer = document.getElementById('searchResults');
    if (resultsContainer) {
      // Remove show class for smooth animation
      resultsContainer.classList.remove('show');
      
      // Remove element after animation completes
      setTimeout(() => {
        if (resultsContainer.parentNode) {
          resultsContainer.remove();
        }
      }, 300); // Match CSS transition duration
    }
    
    // Clear search input
    if (this.elements.searchInput) {
      this.elements.searchInput.value = '';
    }
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
    
    const friendsHTML = friends.map(friend => `
      <div class="friend-card" data-friend-id="${friend.id}">
        <div class="friend-avatar">
          ${this.renderAvatar(friend.avatar)}
          ${friend.isOnline ? '<div class="online-indicator"></div>' : ''}
        </div>
        <div class="friend-info">
          <h4 class="friend-name">${friend.displayName}</h4>
          <p class="friend-major">${friend.major}</p>
          ${friend.mutualFriends > 0 ? `
            <p class="mutual-friends">
              <i class="fas fa-users"></i>
              ${friend.mutualFriends} mutual friends
            </p>
          ` : ''}
        </div>
        <div class="friend-actions">
          <button class="btn-friend-menu" data-friend-id="${friend.id}">
            <i class="fas fa-ellipsis-v"></i>
          </button>
        </div>
      </div>
    `).join('');

    this.elements.friendsList.innerHTML = friendsHTML;

    // Add event listeners for friend actions
    this.elements.friendsList.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-friend-menu')) {
        const button = e.target.closest('.btn-friend-menu');
        const friendId = button.dataset.friendId;
        
        this.handleFriendMenu(friendId, e);
      }
    });
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
    
    const requestsHTML = requests.map(request => `
      <div class="friend-request-card" data-request-id="${request.id}">
        <div class="request-avatar">
          ${this.renderAvatar(request.fromUserInfo?.avatar)}
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
          <button class="btn-accept-request" data-request-id="${request.id}" data-request-name="${request.displayName}">
            <i class="fas fa-check"></i>
            Accept
          </button>
          <button class="btn-reject-request" data-request-id="${request.id}" data-request-name="${request.displayName}">
            <i class="fas fa-times"></i>
            Decline
          </button>
        </div>
      </div>
    `).join('');

    this.elements.friendRequests.innerHTML = requestsHTML;

    // Add event listeners for Accept/Reject buttons
    this.elements.friendRequests.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-accept-request')) {
        const button = e.target.closest('.btn-accept-request');
        const requestId = button.dataset.requestId;
        const requestName = button.dataset.requestName;
        
        await this.handleAcceptFriendRequest(requestId, requests.find(r => r.id === requestId));
      }
      
      if (e.target.closest('.btn-reject-request')) {
        const button = e.target.closest('.btn-reject-request');
        const requestId = button.dataset.requestId;
        const requestName = button.dataset.requestName;
        
        await this.handleRejectFriendRequest(requestId, requests.find(r => r.id === requestId));
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
   * 🎨 Render avatar from avatar config
   * @param {Object} avatarConfig - Avatar configuration
   * @returns {string} HTML for avatar
   */
  renderAvatar(avatarConfig) {
    if (!avatarConfig) {
      return '<div class="avatar-placeholder">👤</div>';
    }

    // Simple avatar rendering - you can enhance this later
    const { skin, hair, eyes, clothes } = avatarConfig;
    return `
      <div class="user-avatar" style="
        background-color: ${skin || '#F4C2A1'};
        border-radius: 50%;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      ">
        👤
      </div>
    `;
  }

  /**
   * ⏰ Format time ago for friend requests
   * @param {Date|Object} timestamp - Timestamp from Firestore
   * @returns {string} Formatted time string
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
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
    if (!timestamp) return 'Recently';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short' 
    });
  }

  /**
   * 📩 Handle sending friend request
   * @param {string} studentId - Target student ID
   * @param {Object} studentData - Student data object
   */
  async handleSendFriendRequest(studentId, studentData) {
    try {
      console.log(`📩 Sending friend request to: ${studentData.profile?.displayName}`);
      
      // Show loading state on button
      const button = document.querySelector(`[data-student-id="${studentId}"].btn-send-request`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      }

      const result = await friendsManager.sendFriendRequest(studentId, studentData);
      
      if (result.success) {
        this.showMessage(result.message, 'success');
        
        // Show success notification
        notificationManager.showSystemNotification(
          `Friend request sent to ${studentData.profile?.displayName}`,
          "success"
        );
        
        // Update button to show sent state
        if (button) {
          button.innerHTML = '<i class="fas fa-check"></i> Request Sent';
          button.className = 'btn-request-sent';
          button.disabled = true;
        }
      } else {
        this.showMessage(result.message, 'error');
        
        // Show error notification
        notificationManager.showSystemNotification(
          result.message,
          "error"
        );
        
        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-user-plus"></i> Send Friend Request';
        }
      }
    } catch (error) {
      console.error('❌ Error sending friend request:', error);
      const errorMessage = 'Failed to send friend request. Please try again.';
      this.showMessage(errorMessage, 'error');
      
      // Show error notification
      notificationManager.showSystemNotification(errorMessage, "error");
    }
  }

  /**
   * ✅ Handle accepting friend request
   * @param {string} requestId - Request ID
   * @param {Object} requestData - Request data object
   */
  async handleAcceptFriendRequest(requestId, requestData) {
    try {
      console.log(`✅ Accepting friend request from: ${requestData.displayName}`);
      
      // Show loading state on button
      const button = document.querySelector(`[data-request-id="${requestId}"].btn-accept-request`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }

      const result = await friendsManager.acceptFriendRequest(requestId, requestData);
      
      if (result.success) {
        this.showMessage(result.message, 'success');
        
        // Show friend accepted notification
        notificationManager.showFriendAcceptedNotification(requestData);
        
        // Remove the request card
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
          card.style.opacity = '0.5';
          setTimeout(() => card.remove(), 500);
        }
        
        // Refresh the friend requests and friends list
        await this.refreshFriendRequests();
        await this.refreshFriendsList();
      } else {
        this.showMessage(result.message, 'error');
        
        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-check"></i> Accept';
        }
      }
    } catch (error) {
      console.error('❌ Error accepting friend request:', error);
      const errorMessage = 'Failed to accept friend request. Please try again.';
      this.showMessage(errorMessage, 'error');
      
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
      console.log(`❌ Rejecting friend request from: ${requestData.displayName}`);
      
      // Show loading state on button
      const button = document.querySelector(`[data-request-id="${requestId}"].btn-reject-request`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Declining...';
      }

      const result = await friendsManager.rejectFriendRequest(requestId, requestData);
      
      if (result.success) {
        this.showMessage(result.message, 'info');
        
        // Remove the request card
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
          card.style.opacity = '0.5';
          setTimeout(() => card.remove(), 500);
        }
        
        // Refresh the friend requests
        await this.refreshFriendRequests();
      } else {
        this.showMessage(result.message, 'error');
        
        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-times"></i> Decline';
        }
      }
    } catch (error) {
      console.error('❌ Error rejecting friend request:', error);
      const errorMessage = 'Failed to reject friend request. Please try again.';
      this.showMessage(errorMessage, 'error');
      
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
    console.log(`📅 Viewing schedule for: ${friendName}`);
    this.showMessage(`Schedule comparison with ${friendName} coming soon!`, 'info');
    
    // TODO: Implement schedule comparison view
    // This could navigate to a schedule comparison page or open a modal
  }

  /**
   * ⚙️ Handle friend menu options
   * @param {string} friendId - Friend's user ID
   * @param {Event} event - Click event for positioning
   */
  handleFriendMenu(friendId, event) {
    console.log(`⚙️ Friend menu for: ${friendId}`);
    this.showMessage('Friend options menu coming soon!', 'info');
    
    // TODO: Implement friend options menu
    // This could show options like: View Profile, Remove Friend, Block User, etc.
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
console.log("🎧 Friends UI: Registering spa:page:load event listener...");
document.addEventListener("spa:page:load", (event) => {
  console.log(`🎧 Friends UI: Received spa:page:load event for route: ${event.detail.route}`);
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
