/**
 * 🔧 Debug Helpers for CampXus Friends System
 *
 * This module provides console tools and debugging utilities for the friends system.
 * Access these tools via the browser console for testing and debugging.
 */

class DebugHelpers {
  constructor() {
    this.isDebugMode = false;
    console.log(
      "🔧 Debug helpers loaded. Type 'debug.help()' for available commands."
    );
  }

  /**
   * 📚 Show available debug commands
   */
  help() {
    console.group("🔧 CampXus Debug Helper Commands");
    console.log("📱 System Status:");
    console.log("  - debug.status() - Show system status");
    console.log("  - debug.toggleDebug() - Toggle debug mode");
    console.log("");
    console.log("🔔 Notifications:");
    console.log("  - debug.testNotification() - Test notification system");
    console.log("  - debug.clearNotifications() - Clear all notifications");
    console.log("  - debug.notificationStats() - Show notification statistics");
    console.log("");
    console.log("👥 Friends System:");
    console.log("  - debug.friendsStatus() - Show friends system status");
    console.log(
      "  - debug.simulateFriendRequest() - Simulate a friend request"
    );
    console.log("  - debug.simulateAcceptance() - Simulate friend acceptance");
    console.log("");
    console.log("📡 Real-time System:");
    console.log("  - debug.realtimeStatus() - Show real-time system status");
    console.log("  - debug.testConnection() - Test connection notifications");
    console.log("");
    console.log("🌍 Campus Presence:");
    console.log("  - debug.campusPresenceStatus() - Show location tracking status");
    console.log("  - debug.testLocationPermission() - Test location permission");
    console.log("  - debug.testCampusDetection() - Test campus boundary detection");
    console.log("  - debug.startLocationTracking() - Start location tracking manually");
    console.log("  - debug.stopLocationTracking() - Stop location tracking");
    console.log("  - debug.testFriendshipIdFix() - Test friendshipId availability for bilateral sharing");
    console.log("  - debug.testBilateralLocationData() - Debug bilateral location sharing data structure");
    console.log("");
    console.log("🧹 Utilities:");
    console.log("  - debug.clearStorage() - Clear all local storage");
    console.log("  - debug.exportLogs() - Export console logs");
    console.groupEnd();
  }

  /**
   * 📊 Show system status
   */
  status() {
    console.group("📊 CampXus System Status");

    // Check if main systems are available
    const systems = {
      "Friends Manager": typeof window.friendsManager !== "undefined",
      "Notification Manager": typeof window.notificationManager !== "undefined",
      "Real-time Manager": typeof window.realTimeManager !== "undefined",
      "SPA Router": typeof window.navigateTo !== "undefined",
      "Current User": typeof window.currentUser !== "undefined",
      "Campus Location Service": typeof window.campusLocationService !== "undefined",
      "Data Manager": typeof window.dataManager !== "undefined",
    };

    console.log("🏗️ System Components:");
    Object.entries(systems).forEach(([name, available]) => {
      console.log(`  ${available ? "✅" : "❌"} ${name}`);
    });

    // Show notification manager status if available
    if (window.notificationManager) {
      console.log("\n🔔 Notification System:");
      const notifStatus = window.notificationManager.getStatus();
      console.log(`  Active Notifications: ${notifStatus.totalNotifications}`);
      console.log(`  Types: ${notifStatus.types.join(", ") || "None"}`);
    }

    // Show real-time manager status if available
    if (window.realTimeManager) {
      console.log("\n📡 Real-time System:");
      const rtStatus = window.realTimeManager.getStatus();
      console.log(`  Initialized: ${rtStatus.isInitialized}`);
      console.log(`  User ID: ${rtStatus.currentUserId || "None"}`);
      console.log(
        `  Active Listeners: ${rtStatus.activeListeners.join(", ") || "None"}`
      );
    }

    console.log(`\n🔧 Debug Mode: ${this.isDebugMode ? "ON" : "OFF"}`);
    console.groupEnd();
  }

  /**
   * 🔄 Toggle debug mode
   */
  toggleDebug() {
    this.isDebugMode = !this.isDebugMode;
    console.log(`🔧 Debug mode ${this.isDebugMode ? "ENABLED" : "DISABLED"}`);

    if (this.isDebugMode) {
      console.log("📊 Verbose logging enabled");
      // Enable more detailed logging
      localStorage.setItem("campxus_debug", "true");
    } else {
      console.log("📊 Verbose logging disabled");
      localStorage.removeItem("campxus_debug");
    }
  }

  /**
   * 🔔 Test notification system
   */
  testNotification() {
    if (!window.notificationManager) {
      console.error("❌ Notification manager not available");
      return;
    }

    console.log("🧪 Testing notification system...");

    // Only test friend-related notifications (system notifications removed)
    console.log(
      "ℹ️ System notifications have been removed. Only friend request and acceptance notifications are available."
    );

    // Test friend request notification
    setTimeout(() => {
      window.notificationManager.showFriendRequestNotification({
        displayName: "Debug Test User",
        major: "Computer Science",
        university: "Test University",
      });
    }, 4000);

    console.log("🔔 Notifications will appear over the next 5 seconds");
  }

  /**
   * 🧹 Clear all notifications
   */
  clearNotifications() {
    if (!window.notificationManager) {
      console.error("❌ Notification manager not available");
      return;
    }

    window.notificationManager.clearAll();
    console.log("🧹 All notifications cleared");
  }

  /**
   * 📊 Show notification statistics
   */
  notificationStats() {
    if (!window.notificationManager) {
      console.error("❌ Notification manager not available");
      return;
    }

    const status = window.notificationManager.getStatus();
    const notifications = window.notificationManager.getAllNotifications();

    console.group("📊 Notification Statistics");
    console.log(`Total Notifications: ${status.totalNotifications}`);
    console.log(`Max Notifications: ${status.maxNotifications}`);
    console.log(`Default Duration: ${status.defaultDuration}ms`);
    console.log(`Types: ${status.types.join(", ") || "None"}`);
    console.log(`Priorities: ${status.priorities.join(", ") || "None"}`);

    if (notifications.length > 0) {
      console.log("\nActive Notifications:");
      notifications.forEach((n) => {
        console.log(`  - ${n.type} (${n.priority}): ${n.message}`);
      });
    }
    console.groupEnd();
  }

  /**
   * 👥 Show friends system status
   */
  friendsStatus() {
    if (!window.friendsManager) {
      console.error("❌ Friends manager not available");
      return;
    }

    console.group("👥 Friends System Status");

    // Try to get current data (this may not work if methods aren't exposed)
    console.log("🔧 Friends manager is available");
    console.log(
      "📊 Use browser dev tools to inspect window.friendsManager for detailed state"
    );

    console.groupEnd();
  }

  /**
   * 📡 Show real-time system status
   */
  realtimeStatus() {
    if (!window.realTimeManager) {
      console.error("❌ Real-time manager not available");
      return;
    }

    const status = window.realTimeManager.getStatus();

    console.group("📡 Real-time System Status");
    console.log(`Initialized: ${status.isInitialized}`);
    console.log(`Current User: ${status.currentUserId || "None"}`);
    console.log(
      `Active Listeners: ${status.activeListeners.join(", ") || "None"}`
    );
    console.log(
      `Event Subscriptions: ${status.eventSubscriptions.join(", ") || "None"}`
    );
    console.groupEnd();
  }

  /**
   * 🧪 Test connection notifications
   */
  testConnection() {
    if (!window.notificationManager) {
      console.error("❌ Notification manager not available");
      return;
    }

    console.log("🧪 Testing connection notifications...");

    // Connection status notifications have been removed
    console.log("📡 Connection status notifications have been removed.");
    console.log("📡 Connection lost - trying to reconnect (logged only)");

    // Test reconnection after 3 seconds
    setTimeout(() => {
      console.log("📡 Real-time updates active (logged only)");
    }, 3000);

    console.log("📡 Connection status will be logged over the next 3 seconds");
  }

  /**
   * 🧪 Simulate a friend request
   */
  simulateFriendRequest() {
    if (!window.notificationManager) {
      console.error("❌ Notification manager not available");
      return;
    }

    const mockRequest = {
      displayName: "Alice Johnson",
      major: "Computer Science",
      university: "Tech University",
      id: `debug_request_${Date.now()}`,
    };

    console.log("🧪 Simulating friend request from:", mockRequest.displayName);
    window.notificationManager.showFriendRequestNotification(mockRequest);
  }

  /**
   * 🧪 Simulate friend acceptance
   */
  simulateAcceptance() {
    if (!window.notificationManager) {
      console.error("❌ Notification manager not available");
      return;
    }

    const mockFriend = {
      displayName: "Bob Smith",
      major: "Engineering",
      id: `debug_friend_${Date.now()}`,
    };

    console.log("🧪 Simulating friend acceptance for:", mockFriend.displayName);
    window.notificationManager.showFriendAcceptedNotification(mockFriend);
  }

  /**
   * 🧹 Clear all local storage
   */
  clearStorage() {
    const confirmed = confirm(
      "🧹 Clear all local storage? This will reset all app data."
    );
    if (confirmed) {
      localStorage.clear();
      sessionStorage.clear();
      console.log("🧹 All local storage cleared");
      console.log("🔄 Refresh the page to see changes");
    }
  }

  /**
   * 📤 Export console logs (simplified)
   */
  exportLogs() {
    const logs = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
    };

    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `campxus-debug-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
    console.log("📤 Debug logs exported");
  }

  /**
   * 🌍 Show campus presence system status
   */
  campusPresenceStatus() {
    console.group("🌍 Campus Presence System Status");

    if (!window.campusLocationService) {
      console.error("❌ Campus Location Service not available");
      console.groupEnd();
      return;
    }

    const service = window.campusLocationService;
    
    console.log("🏗️ Service Status:");
    console.log(`  Geolocation Supported: ${service.isGeolocationSupported()}`);
    console.log(`  Permission Status: ${service.getPermissionStatus() || "Not requested"}`);
    console.log(`  Tracking Active: ${service.isTrackingActive ? service.isTrackingActive() : "Unknown"}`);
    
    const lastPosition = service.getLastKnownPosition();
    if (lastPosition) {
      console.log("📍 Last Known Position:");
      console.log(`  Latitude: ${lastPosition.coords.latitude}`);
      console.log(`  Longitude: ${lastPosition.coords.longitude}`);
      console.log(`  Accuracy: ${lastPosition.coords.accuracy}m`);
      console.log(`  Timestamp: ${new Date(lastPosition.timestamp).toLocaleString()}`);
    } else {
      console.log("📍 No position data available");
    }

    console.groupEnd();
  }

  /**
   * 🔐 Test location permission
   */
  async testLocationPermission() {
    console.log("🔐 Testing location permission...");
    
    if (!window.campusLocationService) {
      console.error("❌ Campus Location Service not available");
      return;
    }

    try {
      const granted = await window.campusLocationService.requestLocationPermission();
      console.log(`🔐 Permission result: ${granted ? "✅ GRANTED" : "❌ DENIED"}`);
      
      if (granted) {
        const position = await window.campusLocationService.getCurrentLocation();
        if (position) {
          console.log("📍 Current position obtained:");
          console.log(`  Lat: ${position.coords.latitude}, Lng: ${position.coords.longitude}`);
        }
      }
    } catch (error) {
      console.error("❌ Location permission test failed:", error);
    }
  }

  /**
   * 🏫 Test campus boundary detection
   */
  async testCampusDetection() {
    console.log("🏫 Testing campus boundary detection...");
    
    if (!window.campusLocationService) {
      console.error("❌ Campus Location Service not available");
      return;
    }

    try {
      const result = await window.campusLocationService.detectCampusPresence("iub");
      console.log("🏫 Campus detection result:", result);
      
      if (result.onCampus !== undefined) {
        const status = result.onCampus ? "ON CAMPUS 🟢" : "OFF CAMPUS 🔴";
        console.log(`📍 Campus Status: ${status}`);
        console.log(`🎯 Confidence: ${result.confidence}%`);
        
        if (result.location) {
          console.log("📍 Location details:", result.location);
        }
      } else {
        console.log("❓ Unable to determine campus status");
      }
    } catch (error) {
      console.error("❌ Campus detection test failed:", error);
    }
  }

  /**
   * ▶️ Start location tracking manually
   */
  async startLocationTracking() {
    console.log("▶️ Starting location tracking...");
    
    if (!window.campusLocationService) {
      console.error("❌ Campus Location Service not available");
      return;
    }

    try {
      await window.campusLocationService.startLocationTracking();
      console.log("✅ Location tracking started successfully");
      console.log("📊 Use debug.campusPresenceStatus() to monitor status");
    } catch (error) {
      console.error("❌ Failed to start location tracking:", error);
    }
  }

  /**
   * ⏹️ Stop location tracking manually
   */
  stopLocationTracking() {
    console.log("⏹️ Stopping location tracking...");
    
    if (!window.campusLocationService) {
      console.error("❌ Campus Location Service not available");
      return;
    }

    try {
      window.campusLocationService.stopLocationTracking();
      console.log("✅ Location tracking stopped successfully");
    } catch (error) {
      console.error("❌ Failed to stop location tracking:", error);
    }
  }

  /**
   * 🔍 Test friendshipId availability in Quick Access friends
   */
  async testFriendshipIdFix() {
    console.group("🔍 Testing friendshipId Fix for Campus Presence");
    
    if (!window.friendsManager) {
      console.error("❌ FriendsManager not available");
      console.groupEnd();
      return;
    }

    try {
      console.log("📋 Getting Quick Access friends with privacy...");
      const friends = await window.friendsManager.getQuickAccessFriendsWithPrivacy(false);
      
      if (friends.length === 0) {
        console.log("📋 No Quick Access friends found - add some friends to Quick Access first");
        console.groupEnd();
        return;
      }

      console.log(`📋 Found ${friends.length} Quick Access friends`);
      
      friends.forEach((friend, index) => {
        const hasFriendshipId = !!friend.friendshipId;
        const friendId = friend.friendId || friend.id;
        
        console.log(`${index + 1}. ${friend.displayName}:`);
        console.log(`   - friendId: ${friendId}`);
        console.log(`   - hasFriendshipId: ${hasFriendshipId}`);
        console.log(`   - friendshipId: ${friend.friendshipId || 'undefined'}`);
        
        if (hasFriendshipId) {
          console.log(`   ✅ Ready for bilateral location sharing`);
        } else {
          console.log(`   ❌ Missing friendshipId - location sharing won't work`);
        }
      });
      
      const friendsWithId = friends.filter(f => f.friendshipId);
      const friendsWithoutId = friends.filter(f => !f.friendshipId);
      
      console.log(`\n📊 Summary:`);
      console.log(`   ✅ Friends with friendshipId: ${friendsWithId.length}`);
      console.log(`   ❌ Friends without friendshipId: ${friendsWithoutId.length}`);
      
      if (friendsWithoutId.length > 0) {
        console.log(`\n⚠️ Fix needed: ${friendsWithoutId.length} friends missing friendshipId`);
        console.log(`   Solution: Remove and re-add these friends to Quick Access`);
      } else {
        console.log(`\n🎉 All Quick Access friends have friendshipId - bilateral location sharing ready!`);
      }
      
    } catch (error) {
      console.error("❌ Error testing friendshipId fix:", error);
    }
    
    console.groupEnd();
  }

  /**
   * 🔍 Debug bilateral location sharing data structure
   */
  async testBilateralLocationData() {
    console.group("🔍 Testing Bilateral Location Sharing Data Structure");
    
    if (!window.friendsManager || !window.dataManager || !window.currentUser) {
      console.error("❌ Required services not available");
      console.groupEnd();
      return;
    }

    try {
      const currentUserId = window.currentUser.uid;
      console.log(`🏠 Current User ID: ${currentUserId}`);
      
      // Get Quick Access friends
      const friends = await window.friendsManager.getQuickAccessFriendsWithPrivacy(false);
      
      if (friends.length === 0) {
        console.log("📋 No Quick Access friends found");
        console.groupEnd();
        return;
      }

      for (const friend of friends) {
        console.log(`\n👤 Friend: ${friend.displayName}`);
        console.log(`   - friendId: ${friend.friendId || friend.userId}`);
        console.log(`   - friendshipId: ${friend.friendshipId}`);
        
        if (friend.friendshipId) {
          try {
            const friendship = await window.dataManager.getFriendshipDocument(friend.friendshipId);
            
            console.log(`   🤝 Friendship Document:`);
            console.log(`     - user1Id: ${friendship.user1Id}`);
            console.log(`     - user2Id: ${friendship.user2Id}`);
            console.log(`     - locationVisibility:`, friendship.locationVisibility);
            
            // Show who shares location with whom
            if (friendship.locationVisibility) {
              const friendUserId = friend.friendId || friend.userId;
              const friendSharesWithMe = friendship.locationVisibility[friendUserId];
              const iShareWithFriend = friendship.locationVisibility[currentUserId];
              
              console.log(`   📍 Location Sharing Status:`);
              console.log(`     - ${friend.displayName} shares with me: ${friendSharesWithMe}`);
              console.log(`     - I share with ${friend.displayName}: ${iShareWithFriend}`);
              console.log(`     - Mutual sharing: ${friendSharesWithMe && iShareWithFriend}`);
            } else {
              console.log(`   📍 No location sharing configured`);
            }
            
            // Get friend's profile for location status
            const friendProfile = await window.dataManager.getUserProfile(friend.friendId || friend.userId);
            const locationEnabled = friendProfile?.systemInfo?.locationSharingEnabled;
            const lastKnownLocation = friendProfile?.systemInfo?.lastKnownLocation;
            
            console.log(`   🌍 Friend's Location Status:`);
            console.log(`     - locationSharingEnabled: ${locationEnabled}`);
            console.log(`     - hasLocationData: ${!!lastKnownLocation}`);
            if (lastKnownLocation) {
              console.log(`     - campusStatus: ${lastKnownLocation.campusStatus}`);
              console.log(`     - detectedAt: ${lastKnownLocation.detectedAt?.toDate?.() || lastKnownLocation.detectedAt}`);
            }
            
          } catch (error) {
            console.error(`   ❌ Error getting friendship data:`, error);
          }
        } else {
          console.log(`   ❌ No friendshipId available`);
        }
      }
      
    } catch (error) {
      console.error("❌ Error testing bilateral location data:", error);
    }
    
    console.groupEnd();
  }

  /**
   * 🔧 Get debug mode status
   */
  get debugMode() {
    return this.isDebugMode;
  }
}

// Create global debug instance
const debugHelpers = new DebugHelpers();

// Add to global scope for console access
if (typeof window !== "undefined") {
  window.debug = debugHelpers;
}

// Check if debug mode should be enabled from localStorage
if (localStorage.getItem("campxus_debug") === "true") {
  debugHelpers.toggleDebug();
}

export { debugHelpers };
