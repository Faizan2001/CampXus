# Phase 4: Basic Cloud Storage & Sync ☁️📅

## Welcome to Cloud Storage! 🚀

Welcome to Phase 4, where we learn to save your schedule data in the cloud! Think of this as giving your schedule a safe home in the cloud so you can access it from any device and never lose your data again.

## What We're Building 🎯

Simple cloud storage features that help students:

### Cloud Storage Features ✨

- **📱 Save to Cloud**: Store your schedule safely in Firebase
- **🔄 Simple Sync**: Load your schedule from any device
- **💾 Auto-Save**: Automatically save changes to the cloud
- **📋 Backup Protection**: Never lose your schedule data
- **👥 Share Schedules**: Let friends see your class times (optional)

## 🏗️ Simple Architecture

This phase uses basic Firebase features:

- **Firestore Database**: Store schedule data in the cloud
- **Auto-Save**: Save changes after a few seconds
- **Simple Loading**: Get your data when you sign in
- **Error Handling**: Show helpful messages when something goes wrong

## 📋 What You Need Before Starting

Make sure you've completed:

- [ ] Phase 1: Authentication working
- [ ] Phase 2: Profile setup completed
- [ ] Phase 3: Friends system working
- [ ] Basic understanding of JavaScript objects
- [ ] Firestore database enabled in Firebase

## 🎯 Learning Goals

By the end of Phase 4, you'll know how to:

- **Save Data to Cloud**: Store your app data in Firestore
- **Load Data from Cloud**: Retrieve saved data when needed
- **Handle Auto-Save**: Automatically save user changes
- **Manage Data Updates**: Update existing cloud data
- **Basic Error Recovery**: Handle network issues gracefully

## 🛠️ Mission: Your Cloud Adventures

### Adventure 1: Create Simple Cloud Storage 💾

Let's start by creating a simple system to save and load schedule data.

#### 1.1 Create Cloud Storage Manager

Create `js/cloud-storage.js`:

```javascript
// Simple Cloud Storage for CampXus
class CloudStorage {
  constructor() {
    this.currentUser = null;
    this.saveTimeout = null;
    this.lastSaved = null;
    this.isOnline = navigator.onLine;

    // Set up authentication listener
    this.setupAuthentication();
    this.setupNetworkListener();
  }

  // Wait for user authentication
  setupAuthentication() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        console.log("📁 Cloud storage ready for:", user.email);
      } else {
        this.currentUser = null;
      }
    });
  }

  // Monitor network connection
  setupNetworkListener() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.showStatus("📶 Back online! Syncing...", "info");
      this.syncPendingChanges();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.showStatus(
        "📱 Working offline. Changes will sync when online.",
        "warning"
      );
    });
  }

  // Save schedule data to cloud
  async saveScheduleData(scheduleData) {
    if (!this.currentUser) {
      console.log("⚠️ Cannot save: User not logged in");
      return { success: false, error: "User not logged in" };
    }

    if (!this.isOnline) {
      console.log("⚠️ Cannot save: Offline");
      this.saveToLocalStorage(scheduleData);
      this.showStatus("💾 Saved locally. Will sync when online.", "info");
      return { success: true, offline: true };
    }

    try {
      // Prepare data for cloud storage
      const cloudData = {
        scheduleData: scheduleData,
        lastModified: firebase.firestore.FieldValue.serverTimestamp(),
        version: Date.now(), // Simple version tracking
        deviceInfo: {
          platform: navigator.platform,
          lastSaved: new Date().toISOString(),
        },
      };

      // Save to Firestore
      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .update(cloudData);

      this.lastSaved = new Date();
      console.log("☁️ Schedule saved to cloud successfully");
      this.showStatus("✅ Saved to cloud", "success");

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to save to cloud:", error);

      // Save locally as backup
      this.saveToLocalStorage(scheduleData);
      this.showStatus("⚠️ Saved locally. Cloud sync failed.", "warning");

      return { success: false, error: error.message };
    }
  }

  // Load schedule data from cloud
  async loadScheduleData() {
    if (!this.currentUser) {
      console.log("⚠️ Cannot load: User not logged in");
      return null;
    }

    try {
      console.log("📥 Loading schedule from cloud...");

      const userDoc = await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .get();

      if (userDoc.exists()) {
        const userData = userDoc.data();

        if (userData.scheduleData) {
          console.log("✅ Schedule loaded from cloud");
          this.showStatus("📥 Loaded from cloud", "success");
          return userData.scheduleData;
        }
      }

      console.log("📭 No cloud data found");

      // Try to load from local storage
      const localData = this.loadFromLocalStorage();
      if (localData) {
        console.log("💾 Loaded from local storage");
        this.showStatus("💾 Loaded from local backup", "info");
        return localData;
      }

      return null;
    } catch (error) {
      console.error("❌ Failed to load from cloud:", error);

      // Try local storage as fallback
      const localData = this.loadFromLocalStorage();
      if (localData) {
        this.showStatus("💾 Loaded from local backup", "warning");
        return localData;
      }

      this.showStatus("❌ Failed to load schedule", "error");
      return null;
    }
  }

  // Auto-save with delay (save after user stops typing)
  autoSave(scheduleData) {
    // Clear previous save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Save after 2 seconds of no changes
    this.saveTimeout = setTimeout(() => {
      this.saveScheduleData(scheduleData);
    }, 2000);
  }

  // Save to local storage as backup
  saveToLocalStorage(scheduleData) {
    try {
      const dataToSave = {
        scheduleData: scheduleData,
        savedAt: new Date().toISOString(),
        userId: this.currentUser?.uid,
      };

      localStorage.setItem(
        "campxus-schedule-backup",
        JSON.stringify(dataToSave)
      );
      console.log("💾 Saved to local storage");
    } catch (error) {
      console.error("Failed to save to local storage:", error);
    }
  }

  // Load from local storage
  loadFromLocalStorage() {
    try {
      const savedData = localStorage.getItem("campxus-schedule-backup");
      if (savedData) {
        const parsed = JSON.parse(savedData);

        // Check if data belongs to current user
        if (parsed.userId === this.currentUser?.uid) {
          return parsed.scheduleData;
        }
      }
      return null;
    } catch (error) {
      console.error("Failed to load from local storage:", error);
      return null;
    }
  }

  // Sync any pending changes when coming back online
  async syncPendingChanges() {
    const localData = this.loadFromLocalStorage();
    if (localData) {
      console.log("🔄 Syncing pending changes...");
      await this.saveScheduleData(localData);
    }
  }

  // Get last saved time for display
  getLastSavedTime() {
    return this.lastSaved;
  }

  // Show status messages to user
  showStatus(message, type = "info") {
    const statusDiv = document.createElement("div");
    statusDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      max-width: 300px;
      font-size: 0.9rem;
      background: ${this.getStatusColor(type)};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;
    statusDiv.textContent = message;

    document.body.appendChild(statusDiv);

    // Animate in
    setTimeout(() => {
      statusDiv.style.transform = "translateX(0)";
    }, 100);

    // Remove after delay
    setTimeout(() => {
      statusDiv.style.transform = "translateX(100%)";
      setTimeout(() => statusDiv.remove(), 300);
    }, 3000);
  }

  getStatusColor(type) {
    switch (type) {
      case "success":
        return "#10b981";
      case "warning":
        return "#f59e0b";
      case "error":
        return "#ef4444";
      default:
        return "#3b82f6";
    }
  }
}

// Create global cloud storage instance
export const cloudStorage = new CloudStorage();
```

#### 1.2 Update Your Main Schedule App

Now let's integrate cloud storage with your existing schedule app. Update your main script file:

```javascript
// Add cloud storage to your existing schedule application

import { cloudStorage } from "./cloud-storage.js";

class ScheduleApp {
  constructor() {
    this.scheduleData = [];
    this.isLoading = false;

    // Initialize cloud storage integration
    this.initializeCloudStorage();
  }

  // Initialize cloud storage
  async initializeCloudStorage() {
    // Wait a moment for auth to initialize
    setTimeout(async () => {
      await this.loadScheduleFromCloud();
    }, 1000);
  }

  // Load schedule from cloud on startup
  async loadScheduleFromCloud() {
    this.showLoading(true);

    try {
      const cloudData = await cloudStorage.loadScheduleData();

      if (cloudData) {
        this.scheduleData = cloudData;
        this.renderSchedule(); // Your existing render function
        console.log("📅 Schedule loaded from cloud");
      } else {
        console.log("📅 Starting with empty schedule");
      }
    } catch (error) {
      console.error("Error loading schedule:", error);
    } finally {
      this.showLoading(false);
    }
  }

  // Save schedule to cloud (call this when data changes)
  saveScheduleToCloud() {
    cloudStorage.autoSave(this.scheduleData);
  }

  // Add a new schedule item (example)
  addScheduleItem(item) {
    this.scheduleData.push(item);
    this.renderSchedule();
    this.saveScheduleToCloud(); // Auto-save to cloud
  }

  // Update existing schedule item (example)
  updateScheduleItem(index, updatedItem) {
    this.scheduleData[index] = updatedItem;
    this.renderSchedule();
    this.saveScheduleToCloud(); // Auto-save to cloud
  }

  // Delete schedule item (example)
  deleteScheduleItem(index) {
    this.scheduleData.splice(index, 1);
    this.renderSchedule();
    this.saveScheduleToCloud(); // Auto-save to cloud
  }

  // Show loading indicator
  showLoading(show) {
    const loadingEl = document.getElementById("loading-indicator");
    if (loadingEl) {
      loadingEl.style.display = show ? "block" : "none";
    }
  }

  // Your existing schedule rendering function
  renderSchedule() {
    // Your existing code to display the schedule
    console.log("Rendering schedule with", this.scheduleData.length, "items");
  }
}

// Initialize the app
const scheduleApp = new ScheduleApp();
```

### Adventure 2: Add Schedule Sharing Features 👥

Let's add the ability to share your schedule with friends.

#### 2.1 Create Schedule Sharing Manager

Create `js/schedule-sharing.js`:

```javascript
// Simple Schedule Sharing for Friends
class ScheduleSharing {
  constructor() {
    this.currentUser = null;
    this.sharedSchedules = new Map();

    // Wait for authentication
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        this.loadSharedSchedules();
      }
    });
  }

  // Share your schedule with a friend
  async shareScheduleWithFriend(friendId, scheduleData) {
    if (!this.currentUser) {
      return { success: false, error: "Not logged in" };
    }

    try {
      // Get friend's info to verify they're actually a friend
      const friendshipExists = await this.verifyFriendship(friendId);
      if (!friendshipExists) {
        return { success: false, error: "Can only share with friends" };
      }

      // Create shared schedule document
      const shareData = {
        ownerId: this.currentUser.uid,
        sharedWithId: friendId,
        scheduleData: scheduleData,
        sharedAt: firebase.firestore.FieldValue.serverTimestamp(),
        ownerName: await this.getUserName(this.currentUser.uid),
        isActive: true,
      };

      // Save to shared schedules collection
      await firebase.firestore().collection("sharedSchedules").add(shareData);

      console.log("📤 Schedule shared successfully");
      return { success: true, message: "Schedule shared with friend!" };
    } catch (error) {
      console.error("Error sharing schedule:", error);
      return { success: false, error: "Failed to share schedule" };
    }
  }

  // Get schedules shared with you
  async getSharedSchedules() {
    if (!this.currentUser) return [];

    try {
      const sharedWithMe = await firebase
        .firestore()
        .collection("sharedSchedules")
        .where("sharedWithId", "==", this.currentUser.uid)
        .where("isActive", "==", true)
        .orderBy("sharedAt", "desc")
        .get();

      const schedules = [];
      sharedWithMe.forEach((doc) => {
        schedules.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return schedules;
    } catch (error) {
      console.error("Error getting shared schedules:", error);
      return [];
    }
  }

  // Stop sharing your schedule with someone
  async stopSharing(shareId) {
    try {
      await firebase
        .firestore()
        .collection("sharedSchedules")
        .doc(shareId)
        .update({ isActive: false });

      return { success: true, message: "Stopped sharing schedule" };
    } catch (error) {
      console.error("Error stopping share:", error);
      return { success: false, error: "Failed to stop sharing" };
    }
  }

  // Check if two users are friends
  async verifyFriendship(friendId) {
    try {
      // Check friendships collection
      const friendship1 = await firebase
        .firestore()
        .collection("friendships")
        .where("user1Id", "==", this.currentUser.uid)
        .where("user2Id", "==", friendId)
        .get();

      const friendship2 = await firebase
        .firestore()
        .collection("friendships")
        .where("user1Id", "==", friendId)
        .where("user2Id", "==", this.currentUser.uid)
        .get();

      return !friendship1.empty || !friendship2.empty;
    } catch (error) {
      console.error("Error verifying friendship:", error);
      return false;
    }
  }

  // Get user's display name
  async getUserName(userId) {
    try {
      const userDoc = await firebase
        .firestore()
        .collection("users")
        .doc(userId)
        .get();

      if (userDoc.exists()) {
        const userData = userDoc.data();
        return `${userData.firstName} ${userData.lastName}`;
      }
      return "Unknown User";
    } catch (error) {
      console.error("Error getting user name:", error);
      return "Unknown User";
    }
  }

  // Load and cache shared schedules
  async loadSharedSchedules() {
    try {
      const schedules = await this.getSharedSchedules();
      schedules.forEach((schedule) => {
        this.sharedSchedules.set(schedule.id, schedule);
      });
      console.log("📋 Loaded", schedules.length, "shared schedules");
    } catch (error) {
      console.error("Error loading shared schedules:", error);
    }
  }
}

// Create global schedule sharing instance
export const scheduleSharing = new ScheduleSharing();
```

#### 2.2 Create Schedule Sharing UI

Add sharing interface to your schedule page. Create `schedule-sharing-ui.html`:

```html
<!-- Add this section to your main schedule page -->
<div class="schedule-sharing-section">
  <h3>📤 Share Your Schedule</h3>

  <div class="share-controls">
    <select id="friend-select" class="friend-select">
      <option value="">Select a friend to share with...</option>
    </select>
    <button id="share-btn" class="share-button">Share Schedule</button>
  </div>

  <div class="shared-schedules">
    <h4>📋 Schedules Shared With You</h4>
    <div id="shared-schedules-list" class="shared-list">
      <p class="no-shares">No shared schedules yet.</p>
    </div>
  </div>
</div>

<style>
  .schedule-sharing-section {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    margin: 1rem 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .share-controls {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .friend-select {
    flex: 1;
    padding: 10px 15px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 1rem;
  }

  .share-button {
    padding: 10px 20px;
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .share-button:hover {
    background: #4338ca;
  }

  .shared-schedule-card {
    background: #f0fdf4;
    border: 2px solid #bbf7d0;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 0.5rem;
  }

  .shared-schedule-card h5 {
    margin: 0 0 0.5rem 0;
    color: #15803d;
  }

  .shared-schedule-card p {
    margin: 0;
    color: #16a34a;
    font-size: 0.9rem;
  }

  .view-schedule-btn {
    background: #10b981;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }

  @media (max-width: 640px) {
    .share-controls {
      flex-direction: column;
    }
  }
</style>
```

#### 2.3 Connect Sharing UI to Firebase

Create `js/schedule-sharing-ui.js`:

```javascript
// Schedule Sharing UI Controller
import { scheduleSharing } from "./schedule-sharing.js";
import { friendsManager } from "./friends-manager.js";
import { cloudStorage } from "./cloud-storage.js";

class ScheduleSharingUI {
  constructor() {
    this.setupEventListeners();
    this.loadFriendsForSharing();
    this.loadSharedSchedules();
  }

  setupEventListeners() {
    const shareBtn = document.getElementById("share-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", () => this.shareSchedule());
    }
  }

  // Load friends list for sharing dropdown
  async loadFriendsForSharing() {
    try {
      const friends = await friendsManager.getFriendsList();
      const friendSelect = document.getElementById("friend-select");

      if (friendSelect) {
        friendSelect.innerHTML =
          '<option value="">Select a friend to share with...</option>';

        friends.forEach((friend) => {
          const option = document.createElement("option");
          option.value = friend.id;
          option.textContent = friend.name;
          friendSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error("Error loading friends for sharing:", error);
    }
  }

  // Share current schedule with selected friend
  async shareSchedule() {
    const friendSelect = document.getElementById("friend-select");
    const friendId = friendSelect.value;

    if (!friendId) {
      this.showMessage("Please select a friend to share with", "warning");
      return;
    }

    try {
      // Get current schedule data
      const scheduleData = await cloudStorage.loadScheduleData();

      if (!scheduleData || scheduleData.length === 0) {
        this.showMessage(
          "No schedule to share. Add some classes first!",
          "warning"
        );
        return;
      }

      // Share the schedule
      const result = await scheduleSharing.shareScheduleWithFriend(
        friendId,
        scheduleData
      );

      if (result.success) {
        this.showMessage(result.message, "success");
        friendSelect.value = ""; // Reset selection
      } else {
        this.showMessage(result.error, "error");
      }
    } catch (error) {
      console.error("Error sharing schedule:", error);
      this.showMessage("Failed to share schedule", "error");
    }
  }

  // Load and display shared schedules
  async loadSharedSchedules() {
    try {
      const sharedSchedules = await scheduleSharing.getSharedSchedules();
      this.displaySharedSchedules(sharedSchedules);
    } catch (error) {
      console.error("Error loading shared schedules:", error);
    }
  }

  // Display shared schedules in UI
  displaySharedSchedules(schedules) {
    const listContainer = document.getElementById("shared-schedules-list");

    if (!listContainer) return;

    if (schedules.length === 0) {
      listContainer.innerHTML =
        '<p class="no-shares">No shared schedules yet.</p>';
      return;
    }

    const schedulesHTML = schedules
      .map(
        (schedule) => `
      <div class="shared-schedule-card">
        <h5>${schedule.ownerName}'s Schedule</h5>
        <p>Shared ${this.formatDate(schedule.sharedAt)} • ${
          schedule.scheduleData.length
        } classes</p>
        <button class="view-schedule-btn" onclick="scheduleSharingUI.viewSharedSchedule('${
          schedule.id
        }')">
          View Schedule
        </button>
      </div>
    `
      )
      .join("");

    listContainer.innerHTML = schedulesHTML;
  }

  // View a shared schedule
  async viewSharedSchedule(shareId) {
    try {
      const sharedSchedules = await scheduleSharing.getSharedSchedules();
      const schedule = sharedSchedules.find((s) => s.id === shareId);

      if (schedule) {
        // Create a simple modal to display the schedule
        this.showScheduleModal(schedule);
      }
    } catch (error) {
      console.error("Error viewing shared schedule:", error);
      this.showMessage("Failed to load shared schedule", "error");
    }
  }

  // Show schedule in a modal
  showScheduleModal(schedule) {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const scheduleItems = schedule.scheduleData
      .map(
        (item) => `
      <div style="padding: 8px; border-bottom: 1px solid #eee;">
        <strong>${item.title || item.class}</strong><br>
        <small>${item.time || "Time not specified"}</small>
      </div>
    `
      )
      .join("");

    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 2rem; max-width: 500px; max-height: 80vh; overflow-y: auto;">
        <h3>${schedule.ownerName}'s Schedule</h3>
        <div style="margin: 1rem 0;">
          ${scheduleItems}
        </div>
        <button onclick="this.closest('.modal').remove()" 
                style="background: #6b7280; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
          Close
        </button>
      </div>
    `;

    modal.className = "modal";
    document.body.appendChild(modal);
  }

  // Utility functions
  formatDate(timestamp) {
    if (!timestamp) return "recently";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  }

  showMessage(message, type) {
    const messageDiv = document.createElement("div");
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 1001;
      max-width: 300px;
      background: ${
        type === "success"
          ? "#10b981"
          : type === "warning"
          ? "#f59e0b"
          : "#ef4444"
      };
    `;
    messageDiv.textContent = message;

    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 4000);
  }
}

// Initialize sharing UI
const scheduleSharingUI = new ScheduleSharingUI();

// Make it globally available
window.scheduleSharingUI = scheduleSharingUI;
```

## ✅ Testing Your Cloud Features

### Test Adventure 🧪

1. **Cloud Save/Load Testing**:

   - Add some schedule items
   - Refresh the page and verify data loads
   - Test with network disconnected

2. **Auto-Save Testing**:

   - Make changes and wait 2 seconds
   - Check if save status appears
   - Verify changes persist after refresh

3. **Sharing Testing**:

   - Share schedule with a friend
   - Log in as friend and view shared schedule
   - Test sharing permissions

4. **Offline Testing**:

   - Disconnect internet
   - Make changes (should save locally)
   - Reconnect and verify sync

5. **Error Handling**:
   - Test with invalid data
   - Verify error messages are helpful
   - Check recovery mechanisms work

## 🎯 Victory Conditions

You've conquered Phase 4 when:

- [ ] Schedule data saves automatically to cloud
- [ ] Data loads correctly when app starts
- [ ] Auto-save works after making changes
- [ ] Offline mode saves locally and syncs when online
- [ ] Friends can share schedules with each other
- [ ] Shared schedules display correctly
- [ ] Error messages help users understand issues
- [ ] Status messages show save/load progress

## 🎉 Celebration Station!

Fantastic work! You've successfully added cloud storage and sharing features to CampXus. Your app now safely stores data in the cloud and lets friends share their schedules - essential features for any modern web application.

You've learned:

- ✅ Cloud data storage with Firestore
- ✅ Auto-save functionality
- ✅ Offline support with local storage
- ✅ Data sharing between users
- ✅ Error handling and user feedback
- ✅ Network status monitoring

## ⏭️ Next Adventure: Phase 5

Ready for **Phase 5: Live Status & Notifications**? We'll add real-time status updates and notification features to keep students connected!

---

**Estimated Time**: 3-4 hours  
**Difficulty**: Intermediate  
**Fun Factor**: 🌟🌟🌟🌟⭐  
**Student-Friendly**: ✅ Great for learning cloud storage!
