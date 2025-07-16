/**
 * 🔧 Debug Helpers for CampXus Friends System
 * 
 * This module provides console tools and debugging utilities for the friends system.
 * Access these tools via the browser console for testing and debugging.
 */

class DebugHelpers {
  constructor() {
    this.isDebugMode = false;
    console.log("🔧 Debug helpers loaded. Type 'debug.help()' for available commands.");
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
    console.log("  - debug.simulateFriendRequest() - Simulate a friend request");
    console.log("  - debug.simulateAcceptance() - Simulate friend acceptance");
    console.log("");
    console.log("📡 Real-time System:");
    console.log("  - debug.realtimeStatus() - Show real-time system status");
    console.log("  - debug.testConnection() - Test connection notifications");
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
      "Friends Manager": typeof window.friendsManager !== 'undefined',
      "Notification Manager": typeof window.notificationManager !== 'undefined',
      "Real-time Manager": typeof window.realTimeManager !== 'undefined',
      "SPA Router": typeof window.navigateTo !== 'undefined',
      "Current User": typeof window.currentUser !== 'undefined'
    };

    console.log("🏗️ System Components:");
    Object.entries(systems).forEach(([name, available]) => {
      console.log(`  ${available ? '✅' : '❌'} ${name}`);
    });

    // Show notification manager status if available
    if (window.notificationManager) {
      console.log("\n🔔 Notification System:");
      const notifStatus = window.notificationManager.getStatus();
      console.log(`  Active Notifications: ${notifStatus.totalNotifications}`);
      console.log(`  Types: ${notifStatus.types.join(', ') || 'None'}`);
    }

    // Show real-time manager status if available
    if (window.realTimeManager) {
      console.log("\n📡 Real-time System:");
      const rtStatus = window.realTimeManager.getStatus();
      console.log(`  Initialized: ${rtStatus.isInitialized}`);
      console.log(`  User ID: ${rtStatus.currentUserId || 'None'}`);
      console.log(`  Active Listeners: ${rtStatus.activeListeners.join(', ') || 'None'}`);
    }

    console.log(`\n🔧 Debug Mode: ${this.isDebugMode ? 'ON' : 'OFF'}`);
    console.groupEnd();
  }

  /**
   * 🔄 Toggle debug mode
   */
  toggleDebug() {
    this.isDebugMode = !this.isDebugMode;
    console.log(`🔧 Debug mode ${this.isDebugMode ? 'ENABLED' : 'DISABLED'}`);
    
    if (this.isDebugMode) {
      console.log("📊 Verbose logging enabled");
      // Enable more detailed logging
      localStorage.setItem('campxus_debug', 'true');
    } else {
      console.log("📊 Verbose logging disabled");
      localStorage.removeItem('campxus_debug');
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
    
    // Test different notification types
    const tests = [
      () => window.notificationManager.showSystemNotification("This is a test info notification", "info"),
      () => window.notificationManager.showSystemNotification("This is a test success notification", "success"),
      () => window.notificationManager.showSystemNotification("This is a test warning notification", "warning"),
      () => window.notificationManager.showSystemNotification("This is a test error notification", "error"),
    ];

    tests.forEach((test, index) => {
      setTimeout(test, index * 1000);
    });

    // Test friend request notification
    setTimeout(() => {
      window.notificationManager.showFriendRequestNotification({
        displayName: "Debug Test User",
        major: "Computer Science",
        university: "Test University"
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
    console.log(`Types: ${status.types.join(', ') || 'None'}`);
    console.log(`Priorities: ${status.priorities.join(', ') || 'None'}`);
    
    if (notifications.length > 0) {
      console.log("\nActive Notifications:");
      notifications.forEach(n => {
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
    console.log("📊 Use browser dev tools to inspect window.friendsManager for detailed state");
    
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
    console.log(`Current User: ${status.currentUserId || 'None'}`);
    console.log(`Active Listeners: ${status.activeListeners.join(', ') || 'None'}`);
    console.log(`Event Subscriptions: ${status.eventSubscriptions.join(', ') || 'None'}`);
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

    // Test disconnection
    window.notificationManager.showConnectionStatusNotification({
      isConnected: false,
      message: "Connection lost - trying to reconnect"
    });

    // Test reconnection after 3 seconds
    setTimeout(() => {
      window.notificationManager.showConnectionStatusNotification({
        isConnected: true,
        message: "Real-time updates active"
      });
    }, 3000);

    console.log("📡 Connection notifications will show over the next 3 seconds");
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
      id: `debug_request_${Date.now()}`
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
      id: `debug_friend_${Date.now()}`
    };

    console.log("🧪 Simulating friend acceptance for:", mockFriend.displayName);
    window.notificationManager.showFriendAcceptedNotification(mockFriend);
  }

  /**
   * 🧹 Clear all local storage
   */
  clearStorage() {
    const confirmed = confirm("🧹 Clear all local storage? This will reset all app data.");
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
      localStorage: {...localStorage},
      sessionStorage: {...sessionStorage}
    };

    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `campxus-debug-${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log("📤 Debug logs exported");
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
if (localStorage.getItem('campxus_debug') === 'true') {
  debugHelpers.toggleDebug();
}

export { debugHelpers };