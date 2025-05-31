# Phase 3: Friends & Social Connections 👥🎉

## Welcome to Social Features! 🌟

Welcome to Phase 3, where we add the fun social features that help students connect with their classmates! Think of this as building a simple social network just for your university - helping students find study partners, share schedules, and stay connected.

## What We're Building 🎯

A simple friends system that allows students to:

### Social Features ✨

- **🔍 Find Classmates**: Search for other students by name or major
- **📩 Friend Requests**: Send and receive friend requests
- **👥 Friends List**: View your campus connections
- **📱 Simple Notifications**: See when someone wants to be friends
- **🏫 University-Only**: Only connect with students from your school

## 🏗️ Simple Architecture

This phase uses basic Firebase features:

- **Client-Side**: Simple JavaScript for social interactions
- **Firestore**: Store friend requests and friendships
- **Real-time**: Listen for new friend requests
- **Security Rules**: Basic rules to protect user data

## 📋 What You Need Before Starting

Make sure you've completed:

- [ ] Phase 1: Authentication working
- [ ] Phase 2: Profile setup completed
- [ ] Phase 2.5: Basic testing knowledge
- [ ] Firestore database set up
- [ ] Understanding of JavaScript promises

## 🎯 Learning Goals

By the end of Phase 3, you'll know how to:

- **Build Social Features**: Create friend request systems
- **Real-time Updates**: Listen for live data changes
- **Search Functionality**: Find users in your database
- **Manage Relationships**: Handle friend connections
- **User Interface**: Create social interaction elements

## 🛠️ Mission: Your Social Adventures

### Adventure 1: Set Up Friends Data Structure 📊

First, let's plan how we'll store friendships in Firestore.

#### 1.1 Design Your Friends Database

Here's how we'll organize our social data:

```
users/
  {userId}/
    firstName: "John"
    lastName: "Doe"
    university: "State University"
    major: "Computer Science"
    profileComplete: true

friendRequests/
  {requestId}/
    fromUserId: "user123"
    toUserId: "user456"
    status: "pending" // pending, accepted, rejected
    createdAt: timestamp
    fromUserName: "John Doe"
    fromUserMajor: "Computer Science"

friendships/
  {friendshipId}/
    user1Id: "user123"
    user2Id: "user456"
    createdAt: timestamp
    user1Name: "John Doe"
    user2Name: "Jane Smith"
```

#### 1.2 Create Friends Manager

Create `js/friends-manager.js`:

```javascript
// Simple Friends Management System
class FriendsManager {
  constructor() {
    this.currentUser = null;
    this.setupAuthentication();
  }

  // Initialize when user is authenticated
  setupAuthentication() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        this.initializeFriendsSystem();
      }
    });
  }

  // Set up friends system for the current user
  async initializeFriendsSystem() {
    try {
      // Get current user's profile
      const userDoc = await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .get();

      if (userDoc.exists) {
        this.userProfile = userDoc.data();
        console.log(
          "Friends system initialized for:",
          this.userProfile.firstName
        );
      }
    } catch (error) {
      console.error("Error initializing friends system:", error);
    }
  }

  // Search for other students
  async searchStudents(searchTerm) {
    try {
      if (!searchTerm || searchTerm.length < 2) {
        return [];
      }

      // Search by first name (basic search)
      const searchResults = await firebase
        .firestore()
        .collection("users")
        .where("university", "==", this.userProfile.university)
        .where("profileComplete", "==", true)
        .get();

      const students = [];
      searchResults.forEach((doc) => {
        const userData = doc.data();
        const fullName =
          `${userData.firstName} ${userData.lastName}`.toLowerCase();
        const major = userData.major.toLowerCase();

        // Simple text matching
        if (
          doc.id !== this.currentUser.uid &&
          (fullName.includes(searchTerm.toLowerCase()) ||
            major.includes(searchTerm.toLowerCase()))
        ) {
          students.push({
            id: doc.id,
            ...userData,
          });
        }
      });

      return students.slice(0, 10); // Limit to 10 results
    } catch (error) {
      console.error("Error searching students:", error);
      return [];
    }
  }

  // Send a friend request
  async sendFriendRequest(targetUserId, targetUserData) {
    try {
      // Check if request already exists
      const existingRequest = await this.checkExistingRequest(targetUserId);
      if (existingRequest) {
        throw new Error(
          "Friend request already sent or you are already friends"
        );
      }

      // Create friend request
      const requestData = {
        fromUserId: this.currentUser.uid,
        toUserId: targetUserId,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        fromUserName: `${this.userProfile.firstName} ${this.userProfile.lastName}`,
        fromUserMajor: this.userProfile.major,
        toUserName: `${targetUserData.firstName} ${targetUserData.lastName}`,
      };

      await firebase.firestore().collection("friendRequests").add(requestData);

      console.log("Friend request sent successfully");
      return { success: true, message: "Friend request sent!" };
    } catch (error) {
      console.error("Error sending friend request:", error);
      return { success: false, message: error.message };
    }
  }

  // Check if friend request already exists
  async checkExistingRequest(targetUserId) {
    try {
      // Check for pending requests in both directions
      const outgoingRequest = await firebase
        .firestore()
        .collection("friendRequests")
        .where("fromUserId", "==", this.currentUser.uid)
        .where("toUserId", "==", targetUserId)
        .where("status", "==", "pending")
        .get();

      const incomingRequest = await firebase
        .firestore()
        .collection("friendRequests")
        .where("fromUserId", "==", targetUserId)
        .where("toUserId", "==", this.currentUser.uid)
        .where("status", "==", "pending")
        .get();

      // Check if already friends
      const existingFriendship = await firebase
        .firestore()
        .collection("friendships")
        .where("user1Id", "in", [this.currentUser.uid, targetUserId])
        .where("user2Id", "in", [this.currentUser.uid, targetUserId])
        .get();

      return (
        !outgoingRequest.empty ||
        !incomingRequest.empty ||
        !existingFriendship.empty
      );
    } catch (error) {
      console.error("Error checking existing request:", error);
      return false;
    }
  }

  // Get pending friend requests for current user
  async getPendingRequests() {
    try {
      const requests = await firebase
        .firestore()
        .collection("friendRequests")
        .where("toUserId", "==", this.currentUser.uid)
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .get();

      const pendingRequests = [];
      requests.forEach((doc) => {
        pendingRequests.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return pendingRequests;
    } catch (error) {
      console.error("Error getting pending requests:", error);
      return [];
    }
  }

  // Accept a friend request
  async acceptFriendRequest(requestId, requestData) {
    try {
      // Create friendship document
      const friendshipData = {
        user1Id: requestData.fromUserId,
        user2Id: this.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        user1Name: requestData.fromUserName,
        user2Name: `${this.userProfile.firstName} ${this.userProfile.lastName}`,
      };

      // Use batch to update both documents atomically
      const batch = firebase.firestore().batch();

      // Add friendship
      const friendshipRef = firebase
        .firestore()
        .collection("friendships")
        .doc();
      batch.set(friendshipRef, friendshipData);

      // Update request status
      const requestRef = firebase
        .firestore()
        .collection("friendRequests")
        .doc(requestId);
      batch.update(requestRef, {
        status: "accepted",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      console.log("Friend request accepted");
      return { success: true, message: "Friend request accepted!" };
    } catch (error) {
      console.error("Error accepting friend request:", error);
      return { success: false, message: "Failed to accept request" };
    }
  }

  // Reject a friend request
  async rejectFriendRequest(requestId) {
    try {
      await firebase
        .firestore()
        .collection("friendRequests")
        .doc(requestId)
        .update({
          status: "rejected",
          rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

      return { success: true, message: "Friend request rejected" };
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      return { success: false, message: "Failed to reject request" };
    }
  }

  // Get user's friends list
  async getFriendsList() {
    try {
      const friendships = await firebase
        .firestore()
        .collection("friendships")
        .where("user1Id", "==", this.currentUser.uid)
        .get();

      const friendships2 = await firebase
        .firestore()
        .collection("friendships")
        .where("user2Id", "==", this.currentUser.uid)
        .get();

      const friends = [];

      // Process friendships where current user is user1
      friendships.forEach((doc) => {
        const data = doc.data();
        friends.push({
          id: data.user2Id,
          name: data.user2Name,
          friendshipId: doc.id,
          createdAt: data.createdAt,
        });
      });

      // Process friendships where current user is user2
      friendships2.forEach((doc) => {
        const data = doc.data();
        friends.push({
          id: data.user1Id,
          name: data.user1Name,
          friendshipId: doc.id,
          createdAt: data.createdAt,
        });
      });

      return friends;
    } catch (error) {
      console.error("Error getting friends list:", error);
      return [];
    }
  }

  // Listen for real-time friend request updates
  listenForFriendRequests(callback) {
    return firebase
      .firestore()
      .collection("friendRequests")
      .where("toUserId", "==", this.currentUser.uid)
      .where("status", "==", "pending")
      .onSnapshot((snapshot) => {
        const requests = [];
        snapshot.forEach((doc) => {
          requests.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        callback(requests);
      });
  }
}

// Create global friends manager
export const friendsManager = new FriendsManager();
```

### Adventure 2: Build the Friends Interface 🎨

Now let's create the user interface for the friends system.

#### 2.1 Create Friends Page HTML

Create `friends.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Friends - CampXus</title>
    <link rel="stylesheet" href="css/friends.css" />
  </head>
  <body>
    <div class="container">
      <header class="friends-header">
        <h1>👥 Friends & Connections</h1>
        <p>Connect with your classmates and build your campus network!</p>
      </header>

      <!-- Navigation Tabs -->
      <div class="friends-tabs">
        <button class="tab-button active" data-tab="search">
          🔍 Find Friends
        </button>
        <button class="tab-button" data-tab="requests">
          📩 Requests <span id="request-count" class="count-badge">0</span>
        </button>
        <button class="tab-button" data-tab="friends">👥 My Friends</button>
      </div>

      <!-- Search Tab -->
      <div id="search-tab" class="tab-content active">
        <div class="search-section">
          <div class="search-box">
            <input
              type="text"
              id="student-search"
              placeholder="Search for classmates by name or major..."
              maxlength="50"
            />
            <button id="search-btn" class="search-button">Search</button>
          </div>

          <div id="search-results" class="search-results">
            <div class="search-placeholder">
              <div class="placeholder-icon">🔍</div>
              <h3>Find Your Classmates!</h3>
              <p>
                Search by name or major to discover other students from your
                university.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Friend Requests Tab -->
      <div id="requests-tab" class="tab-content">
        <div class="requests-section">
          <h2>📩 Friend Requests</h2>
          <div id="friend-requests" class="requests-list">
            <div class="no-requests">
              <div class="placeholder-icon">📭</div>
              <h3>No pending requests</h3>
              <p>
                When someone sends you a friend request, it will appear here.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Friends List Tab -->
      <div id="friends-tab" class="tab-content">
        <div class="friends-section">
          <h2>👥 My Friends</h2>
          <div id="friends-list" class="friends-list">
            <div class="no-friends">
              <div class="placeholder-icon">👥</div>
              <h3>No friends yet</h3>
              <p>
                Start by searching for classmates and sending friend requests!
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="navigation">
        <button onclick="goToDashboard()" class="nav-button">
          ← Back to Dashboard
        </button>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div id="loading-overlay" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Loading...</p>
    </div>

    <!-- Firebase Scripts -->
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
    <script src="js/firebase-config.js"></script>
    <script src="js/friends-manager.js" type="module"></script>
    <script src="js/friends-ui.js" type="module"></script>

    <script>
      function goToDashboard() {
        window.location.href = "dashboard.html";
      }
    </script>
  </body>
</html>
```

#### 2.2 Create Friends Styling

Create `css/friends.css`:

```css
/* CampXus Friends - Social Connection Styles */

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.friends-header {
  text-align: center;
  margin-bottom: 2rem;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  color: white;
}

.friends-header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2.5rem;
  font-weight: bold;
}

.friends-header p {
  margin: 0;
  opacity: 0.9;
  font-size: 1.1rem;
}

/* Tab Navigation */
.friends-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 2rem;
  background: #f1f5f9;
  padding: 8px;
  border-radius: 12px;
}

.tab-button {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tab-button:hover {
  background: rgba(255, 255, 255, 0.7);
}

.tab-button.active {
  background: white;
  color: #4f46e5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.count-badge {
  background: #ef4444;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
}

/* Tab Content */
.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

/* Search Section */
.search-section {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.search-box {
  display: flex;
  gap: 12px;
  margin-bottom: 2rem;
}

#student-search {
  flex: 1;
  padding: 14px 20px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  font-size: 1rem;
  background: #fafafa;
  transition: all 0.2s ease;
}

#student-search:focus {
  outline: none;
  border-color: #4f46e5;
  background: white;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.search-button {
  padding: 14px 24px;
  background: linear-gradient(135deg, #4f46e5, #3730a3);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

/* Search Results */
.search-results {
  min-height: 300px;
}

.search-placeholder,
.no-requests,
.no-friends {
  text-align: center;
  padding: 3rem 2rem;
  color: #6b7280;
}

.placeholder-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.placeholder-icon + h3 {
  color: #374151;
  margin-bottom: 0.5rem;
}

/* Student Card */
.student-card {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.2s ease;
}

.student-card:hover {
  border-color: #4f46e5;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.student-info h4 {
  margin: 0 0 0.25rem 0;
  color: #1e293b;
  font-size: 1.1rem;
}

.student-info p {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}

.friend-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.friend-button.send {
  background: #4f46e5;
  color: white;
}

.friend-button.send:hover {
  background: #4338ca;
}

.friend-button.pending {
  background: #f59e0b;
  color: white;
  cursor: not-allowed;
}

.friend-button.friends {
  background: #10b981;
  color: white;
  cursor: default;
}

/* Friend Request Card */
.request-card {
  background: #fef3c7;
  border: 2px solid #fbbf24;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.request-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.request-info h4 {
  margin: 0 0 0.25rem 0;
  color: #92400e;
}

.request-info p {
  margin: 0;
  color: #b45309;
  font-size: 0.9rem;
}

.request-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button.accept {
  background: #10b981;
  color: white;
}

.action-button.accept:hover {
  background: #059669;
}

.action-button.reject {
  background: #ef4444;
  color: white;
}

.action-button.reject:hover {
  background: #dc2626;
}

/* Friends List */
.friend-card {
  background: #f0fdf4;
  border: 2px solid #bbf7d0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.friend-info h4 {
  margin: 0 0 0.25rem 0;
  color: #15803d;
}

.friend-info p {
  margin: 0;
  color: #16a34a;
  font-size: 0.9rem;
}

/* Navigation */
.navigation {
  margin-top: 2rem;
  text-align: center;
}

.nav-button {
  padding: 12px 24px;
  background: #6b7280;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.nav-button:hover {
  background: #4b5563;
  transform: translateY(-1px);
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: none;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  z-index: 1000;
}

.loading-overlay.active {
  display: flex;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f4f6;
  border-top: 4px solid #4f46e5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loading-overlay p {
  color: white;
  font-weight: 500;
}

/* Mobile Responsiveness */
@media (max-width: 640px) {
  .container {
    padding: 1rem;
  }

  .friends-header {
    padding: 1.5rem;
  }

  .friends-header h1 {
    font-size: 2rem;
  }

  .search-box {
    flex-direction: column;
  }

  .student-card,
  .request-card,
  .friend-card {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }

  .request-actions {
    justify-content: center;
  }
}
```

### Adventure 3: Connect the Interface to Firebase 🔗

Now let's create the JavaScript that connects our beautiful interface to Firebase.

#### 3.1 Create Friends UI Controller

Create `js/friends-ui.js`:

```javascript
// Friends UI Controller - Connects interface to Firebase
import { friendsManager } from "./friends-manager.js";

class FriendsUI {
  constructor() {
    this.currentTab = "search";
    this.searchTimeout = null;
    this.unsubscribeRequests = null;

    // Wait for authentication
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.initializeUI();
      } else {
        window.location.href = "index.html";
      }
    });
  }

  // Initialize the UI when user is authenticated
  async initializeUI() {
    this.setupEventListeners();
    await this.loadInitialData();
    this.setupRealtimeListeners();
  }

  // Set up all event listeners
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Search functionality
    const searchInput = document.getElementById("student-search");
    const searchBtn = document.getElementById("search-btn");

    searchInput.addEventListener("input", (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.searchStudents(e.target.value);
      }, 500); // Delay search by 500ms
    });

    searchBtn.addEventListener("click", () => {
      this.searchStudents(searchInput.value);
    });

    // Enter key for search
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.searchStudents(e.target.value);
      }
    });
  }

  // Switch between tabs
  switchTab(tabName) {
    // Update active tab button
    document.querySelectorAll(".tab-button").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

    // Update active tab content
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });
    document.getElementById(`${tabName}-tab`).classList.add("active");

    this.currentTab = tabName;

    // Load data for the current tab
    if (tabName === "friends") {
      this.loadFriendsList();
    } else if (tabName === "requests") {
      this.loadFriendRequests();
    }
  }

  // Load initial data
  async loadInitialData() {
    this.showLoading(true);

    try {
      await Promise.all([this.loadFriendRequests(), this.updateRequestCount()]);
    } catch (error) {
      console.error("Error loading initial data:", error);
      this.showError("Failed to load data. Please refresh the page.");
    } finally {
      this.showLoading(false);
    }
  }

  // Search for students
  async searchStudents(searchTerm) {
    const resultsContainer = document.getElementById("search-results");

    if (!searchTerm || searchTerm.length < 2) {
      resultsContainer.innerHTML = `
        <div class="search-placeholder">
          <div class="placeholder-icon">🔍</div>
          <h3>Find Your Classmates!</h3>
          <p>Search by name or major to discover other students from your university.</p>
        </div>
      `;
      return;
    }

    // Show searching state
    resultsContainer.innerHTML = `
      <div class="search-placeholder">
        <div class="placeholder-icon">⏳</div>
        <h3>Searching...</h3>
        <p>Looking for students matching "${searchTerm}"</p>
      </div>
    `;

    try {
      const students = await friendsManager.searchStudents(searchTerm);
      this.displaySearchResults(students);
    } catch (error) {
      console.error("Error searching students:", error);
      this.showError("Failed to search. Please try again.");
    }
  }

  // Display search results
  displaySearchResults(students) {
    const resultsContainer = document.getElementById("search-results");

    if (students.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-placeholder">
          <div class="placeholder-icon">😔</div>
          <h3>No students found</h3>
          <p>Try searching with different keywords or check your spelling.</p>
        </div>
      `;
      return;
    }

    const resultsHTML = students
      .map(
        (student) => `
      <div class="student-card" data-user-id="${student.id}">
        <div class="student-info">
          <h4>${student.firstName} ${student.lastName}</h4>
          <p>${student.major} • Class of ${student.graduationYear}</p>
        </div>
        <button class="friend-button send" onclick="friendsUI.sendFriendRequest('${
          student.id
        }', ${JSON.stringify(student).replace(/"/g, "&quot;")})">
          + Add Friend
        </button>
      </div>
    `
      )
      .join("");

    resultsContainer.innerHTML = resultsHTML;
  }

  // Send friend request
  async sendFriendRequest(targetUserId, targetUserData) {
    const button = document.querySelector(
      `[data-user-id="${targetUserId}"] .friend-button`
    );
    const originalText = button.textContent;

    button.textContent = "Sending...";
    button.disabled = true;

    try {
      const result = await friendsManager.sendFriendRequest(
        targetUserId,
        targetUserData
      );

      if (result.success) {
        button.textContent = "Request Sent";
        button.className = "friend-button pending";
        this.showSuccess(result.message);
      } else {
        button.textContent = originalText;
        button.disabled = false;
        this.showError(result.message);
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
      button.textContent = originalText;
      button.disabled = false;
      this.showError("Failed to send request. Please try again.");
    }
  }

  // Load friend requests
  async loadFriendRequests() {
    try {
      const requests = await friendsManager.getPendingRequests();
      this.displayFriendRequests(requests);
      this.updateRequestCount(requests.length);
    } catch (error) {
      console.error("Error loading friend requests:", error);
    }
  }

  // Display friend requests
  displayFriendRequests(requests) {
    const requestsContainer = document.getElementById("friend-requests");

    if (requests.length === 0) {
      requestsContainer.innerHTML = `
        <div class="no-requests">
          <div class="placeholder-icon">📭</div>
          <h3>No pending requests</h3>
          <p>When someone sends you a friend request, it will appear here.</p>
        </div>
      `;
      return;
    }

    const requestsHTML = requests
      .map(
        (request) => `
      <div class="request-card" data-request-id="${request.id}">
        <div class="request-header">
          <div class="request-info">
            <h4>${request.fromUserName}</h4>
            <p>${request.fromUserMajor}</p>
          </div>
          <div class="request-actions">
            <button class="action-button accept" onclick="friendsUI.acceptRequest('${
              request.id
            }', ${JSON.stringify(request).replace(/"/g, "&quot;")})">
              ✓ Accept
            </button>
            <button class="action-button reject" onclick="friendsUI.rejectRequest('${
              request.id
            }')">
              ✗ Reject
            </button>
          </div>
        </div>
      </div>
    `
      )
      .join("");

    requestsContainer.innerHTML = requestsHTML;
  }

  // Accept friend request
  async acceptRequest(requestId, requestData) {
    const card = document.querySelector(`[data-request-id="${requestId}"]`);
    const buttons = card.querySelectorAll(".action-button");

    buttons.forEach((btn) => {
      btn.disabled = true;
      btn.textContent = btn.classList.contains("accept")
        ? "Accepting..."
        : "Disabled";
    });

    try {
      const result = await friendsManager.acceptFriendRequest(
        requestId,
        requestData
      );

      if (result.success) {
        card.remove();
        this.showSuccess(result.message);
        this.updateRequestCount();

        // Refresh friends list if on friends tab
        if (this.currentTab === "friends") {
          this.loadFriendsList();
        }
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      console.error("Error accepting request:", error);
      this.showError("Failed to accept request. Please try again.");
    }
  }

  // Reject friend request
  async rejectRequest(requestId) {
    const card = document.querySelector(`[data-request-id="${requestId}"]`);
    const buttons = card.querySelectorAll(".action-button");

    buttons.forEach((btn) => {
      btn.disabled = true;
      btn.textContent = btn.classList.contains("reject")
        ? "Rejecting..."
        : "Disabled";
    });

    try {
      const result = await friendsManager.rejectFriendRequest(requestId);

      if (result.success) {
        card.remove();
        this.showSuccess(result.message);
        this.updateRequestCount();
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      console.error("Error rejecting request:", error);
      this.showError("Failed to reject request. Please try again.");
    }
  }

  // Load friends list
  async loadFriendsList() {
    try {
      const friends = await friendsManager.getFriendsList();
      this.displayFriendsList(friends);
    } catch (error) {
      console.error("Error loading friends list:", error);
    }
  }

  // Display friends list
  displayFriendsList(friends) {
    const friendsContainer = document.getElementById("friends-list");

    if (friends.length === 0) {
      friendsContainer.innerHTML = `
        <div class="no-friends">
          <div class="placeholder-icon">👥</div>
          <h3>No friends yet</h3>
          <p>Start by searching for classmates and sending friend requests!</p>
        </div>
      `;
      return;
    }

    const friendsHTML = friends
      .map(
        (friend) => `
      <div class="friend-card">
        <div class="friend-info">
          <h4>${friend.name}</h4>
          <p>Connected ${this.formatDate(friend.createdAt)}</p>
        </div>
      </div>
    `
      )
      .join("");

    friendsContainer.innerHTML = friendsHTML;
  }

  // Set up real-time listeners
  setupRealtimeListeners() {
    // Listen for new friend requests
    this.unsubscribeRequests = friendsManager.listenForFriendRequests(
      (requests) => {
        this.updateRequestCount(requests.length);

        // If currently viewing requests, update display
        if (this.currentTab === "requests") {
          this.displayFriendRequests(requests);
        }
      }
    );
  }

  // Update request count badge
  updateRequestCount(count) {
    if (count === undefined) {
      // Get current count
      friendsManager.getPendingRequests().then((requests) => {
        const badge = document.getElementById("request-count");
        badge.textContent = requests.length;
        badge.style.display = requests.length > 0 ? "flex" : "none";
      });
    } else {
      const badge = document.getElementById("request-count");
      badge.textContent = count;
      badge.style.display = count > 0 ? "flex" : "none";
    }
  }

  // Utility functions
  formatDate(timestamp) {
    if (!timestamp) return "recently";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  }

  showLoading(show) {
    const overlay = document.getElementById("loading-overlay");
    overlay.classList.toggle("active", show);
  }

  showSuccess(message) {
    this.showMessage(message, "success");
  }

  showError(message) {
    this.showMessage(message, "error");
  }

  showMessage(message, type) {
    const messageDiv = document.createElement("div");
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 1001;
      max-width: 300px;
      background: ${type === "success" ? "#10b981" : "#ef4444"};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    messageDiv.textContent = message;

    document.body.appendChild(messageDiv);

    setTimeout(() => messageDiv.remove(), 4000);
  }
}

// Initialize Friends UI
const friendsUI = new FriendsUI();

// Make it globally available for onclick handlers
window.friendsUI = friendsUI;
```

### Adventure 4: Set Up Basic Security Rules 🔒

Let's create basic Firestore security rules to protect user data.

#### 4.1 Update Firestore Security Rules

In your Firebase Console, go to Firestore → Rules and update:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read and write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Allow others to read basic profile info for friend discovery
      allow read: if request.auth != null &&
                     resource.data.profileComplete == true;
    }

    // Friend requests - users can create requests to others
    match /friendRequests/{requestId} {
      allow read, write: if request.auth != null &&
                           (request.auth.uid == resource.data.fromUserId ||
                            request.auth.uid == resource.data.toUserId);
      allow create: if request.auth != null &&
                      request.auth.uid == request.resource.data.fromUserId;
    }

    // Friendships - users can read their own friendships
    match /friendships/{friendshipId} {
      allow read: if request.auth != null &&
                    (request.auth.uid == resource.data.user1Id ||
                     request.auth.uid == resource.data.user2Id);
      allow create: if request.auth != null;
    }
  }
}
```

## ✅ Testing Your Social Features

### Test Adventure 🧪

1. **Search Testing**:

   - Create multiple test accounts with different names/majors
   - Test search functionality
   - Verify only university students appear

2. **Friend Request Flow**:

   - Send friend requests between accounts
   - Check real-time notifications
   - Test accept/reject functionality

3. **Friends List**:

   - Verify accepted friends appear in list
   - Check friend count updates correctly
   - Test navigation between tabs

4. **Error Handling**:

   - Test with network disconnected
   - Try duplicate friend requests
   - Verify error messages are helpful

5. **Mobile Testing**:
   - Test responsive design on mobile
   - Verify touch interactions work
   - Check tab switching on small screens

## 🎯 Victory Conditions

You've mastered Phase 3 when:

- [ ] Students can search for classmates by name or major
- [ ] Friend request system works end-to-end
- [ ] Real-time notifications show new requests
- [ ] Accept/reject functionality works correctly
- [ ] Friends list displays connected users
- [ ] Only university students can connect
- [ ] Mobile interface is responsive and usable
- [ ] Error messages help users understand issues

## 🎉 Celebration Station!

Outstanding work! You've built a complete social system that helps students connect with their classmates. Your CampXus app now has the social features that make it truly valuable for building campus communities.

You've learned:

- ✅ Real-time data updates with Firestore
- ✅ Search and filtering functionality
- ✅ User relationship management
- ✅ Social UI/UX design patterns
- ✅ Basic security with Firestore rules

## ⏭️ Next Adventure: Phase 4

Ready for **Phase 4: Cloud Sync & Data Management**? We'll add advanced data synchronization, offline support, and performance optimizations!

---

**Estimated Time**: 4-5 hours  
**Difficulty**: Intermediate  
**Fun Factor**: 🌟🌟🌟🌟🌟  
**Student-Friendly**: ✅ Great for learning social features!
