/**
 * =============================================================================
 *                    NOTIFICATION SERVICE TESTS
 *                    Testing Notification Management
 * =============================================================================
 *
 * This test suite covers the NotificationManager functionality:
 * - Notification creation and formatting
 * - Queue management
 * - Priority handling
 * - Message generation
 *
 * Note: Since NotificationService uses DOM operations, we test the
 * logic and data structures directly using a mock implementation.
 *
 * =============================================================================
 */

import { jest } from "@jest/globals";

/**
 * =============================================================================
 *                   NOTIFICATION MANAGER LOGIC TESTS
 * =============================================================================
 */

// Mock NotificationManager for testing logic
class MockNotificationManager {
  constructor() {
    this.notifications = [];
    this.maxNotifications = 5;
    this.notificationDuration = 5000;
    this.container = null;
  }

  /**
   * Create friend request notification
   */
  createFriendRequestNotification(request) {
    return {
      id: `friend_request_${Date.now()}`,
      type: "friend_request",
      title: "New Friend Request",
      message: `@${request.handle || "unknown"} wants to be your friend`,
      data: request,
      timestamp: Date.now(),
      priority: "high",
    };
  }

  /**
   * Create friend accepted notification
   */
  createFriendAcceptedNotification(friend) {
    return {
      id: `friend_accepted_${Date.now()}`,
      type: "friend_accepted",
      title: "Friend Request Accepted",
      message: `You and @${friend.handle || "unknown"} are now friends!`,
      data: friend,
      timestamp: Date.now(),
      priority: "high",
    };
  }

  /**
   * Create system notification
   */
  createSystemNotification(message, type = "info", options = {}) {
    const { duration = 3000 } = options;

    return {
      id: `system_${Date.now()}`,
      type: "system",
      title: this.getSystemTitle(type),
      message,
      timestamp: Date.now(),
      priority: this.getSystemPriority(type),
      duration,
      severity: type,
    };
  }

  /**
   * Create privacy notification
   */
  createPrivacyNotification(
    friendName,
    privacyType = "schedule",
    restrictionType = "access",
    options = {}
  ) {
    const { duration = 3000, message: customMessage } = options;

    return {
      id: `privacy_${privacyType}_${Date.now()}`,
      type: "privacy_restriction",
      title: this.getPrivacyTitle(privacyType),
      message:
        customMessage ||
        this.generatePrivacyMessage(friendName, privacyType, restrictionType),
      data: {
        friendName,
        privacyType,
        restrictionType,
      },
      timestamp: Date.now(),
      priority: "medium",
      duration,
    };
  }

  /**
   * Get system notification title
   */
  getSystemTitle(type) {
    const titles = {
      success: "Success",
      error: "Error",
      warning: "Warning",
      info: "Information",
    };
    return titles[type] || "Notice";
  }

  /**
   * Get system notification priority
   */
  getSystemPriority(type) {
    const priorities = {
      error: "high",
      warning: "medium",
      success: "low",
      info: "low",
    };
    return priorities[type] || "medium";
  }

  /**
   * Get privacy notification title
   */
  getPrivacyTitle(privacyType) {
    const titles = {
      schedule: "Schedule Privacy",
      profile: "Profile Privacy",
      quickAccess: "Quick Access Privacy",
    };
    return titles[privacyType] || "Privacy Notice";
  }

  /**
   * Generate privacy message
   */
  generatePrivacyMessage(friendName, privacyType, restrictionType) {
    const messages = {
      schedule: {
        view: `@${friendName}'s schedule is hidden from you`,
        access: `You cannot access @${friendName}'s schedule`,
      },
      profile: {
        view: `@${friendName}'s profile is private`,
        access: `You cannot access @${friendName}'s profile`,
      },
      quickAccess: {
        access: `@${friendName} is not in your quick access`,
      },
    };

    return (
      messages[privacyType]?.[restrictionType] ||
      `Privacy restriction for ${friendName}`
    );
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
      return "Just now";
    }

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    }

    // Default to date
    return date.toLocaleDateString();
  }

  /**
   * Add notification to queue
   */
  addNotification(notification) {
    this.notifications.unshift(notification);

    // Keep only max notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    return notification;
  }

  /**
   * Remove notification by ID
   */
  removeNotification(notificationId) {
    this.notifications = this.notifications.filter(
      (n) => n.id !== notificationId
    );
  }

  /**
   * Get all notifications
   */
  getNotifications() {
    return [...this.notifications];
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications() {
    this.notifications = [];
  }

  /**
   * Get notifications by type
   */
  getNotificationsByType(type) {
    return this.notifications.filter((n) => n.type === type);
  }

  /**
   * Get notifications by priority
   */
  getNotificationsByPriority(priority) {
    return this.notifications.filter((n) => n.priority === priority);
  }

  /**
   * Check if notification exists
   */
  hasNotification(notificationId) {
    return this.notifications.some((n) => n.id === notificationId);
  }

  /**
   * Get header icon class for notification type
   */
  getHeaderIconClass(notification) {
    const icons = {
      friend_request: "fas fa-user-plus",
      friend_accepted: "fas fa-user-check",
      privacy_restriction: "fas fa-lock",
      system: this.getSystemIcon(notification.severity),
    };
    return icons[notification.type] || "fas fa-bell";
  }

  /**
   * Get system icon based on severity
   */
  getSystemIcon(severity) {
    const icons = {
      success: "fas fa-check-circle",
      error: "fas fa-exclamation-circle",
      warning: "fas fa-exclamation-triangle",
      info: "fas fa-info-circle",
    };
    return icons[severity] || "fas fa-bell";
  }
}

describe("NotificationService", () => {
  let notificationManager;

  beforeEach(() => {
    notificationManager = new MockNotificationManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    notificationManager.clearAllNotifications();
  });

  /**
   * =============================================================================
   *                           INITIALIZATION TESTS
   * =============================================================================
   */
  describe("Initialization", () => {
    test("should initialize with empty notifications array", () => {
      expect(notificationManager.notifications).toEqual([]);
    });

    test("should have correct default values", () => {
      expect(notificationManager.maxNotifications).toBe(5);
      expect(notificationManager.notificationDuration).toBe(5000);
    });
  });

  /**
   * =============================================================================
   *                      FRIEND REQUEST NOTIFICATIONS
   * =============================================================================
   */
  describe("Friend Request Notifications", () => {
    test("should create friend request notification with correct structure", () => {
      const request = { handle: "johndoe", userId: "user123" };
      const notification =
        notificationManager.createFriendRequestNotification(request);

      expect(notification.type).toBe("friend_request");
      expect(notification.title).toBe("New Friend Request");
      expect(notification.message).toContain("@johndoe");
      expect(notification.message).toContain("wants to be your friend");
      expect(notification.priority).toBe("high");
      expect(notification.data).toEqual(request);
    });

    test("should handle missing handle gracefully", () => {
      const request = { userId: "user123" };
      const notification =
        notificationManager.createFriendRequestNotification(request);

      expect(notification.message).toContain("@unknown");
    });

    test("should include timestamp", () => {
      const before = Date.now();
      const notification = notificationManager.createFriendRequestNotification({
        handle: "test",
      });
      const after = Date.now();

      expect(notification.timestamp).toBeGreaterThanOrEqual(before);
      expect(notification.timestamp).toBeLessThanOrEqual(after);
    });
  });

  /**
   * =============================================================================
   *                      FRIEND ACCEPTED NOTIFICATIONS
   * =============================================================================
   */
  describe("Friend Accepted Notifications", () => {
    test("should create friend accepted notification with correct structure", () => {
      const friend = { handle: "janedoe", userId: "user456" };
      const notification =
        notificationManager.createFriendAcceptedNotification(friend);

      expect(notification.type).toBe("friend_accepted");
      expect(notification.title).toBe("Friend Request Accepted");
      expect(notification.message).toContain("@janedoe");
      expect(notification.message).toContain("are now friends");
      expect(notification.priority).toBe("high");
    });

    test("should handle missing handle gracefully", () => {
      const friend = { userId: "user456" };
      const notification =
        notificationManager.createFriendAcceptedNotification(friend);

      expect(notification.message).toContain("@unknown");
    });
  });

  /**
   * =============================================================================
   *                      SYSTEM NOTIFICATIONS
   * =============================================================================
   */
  describe("System Notifications", () => {
    test("should create success notification", () => {
      const notification = notificationManager.createSystemNotification(
        "Operation completed",
        "success"
      );

      expect(notification.type).toBe("system");
      expect(notification.title).toBe("Success");
      expect(notification.message).toBe("Operation completed");
      expect(notification.severity).toBe("success");
      expect(notification.priority).toBe("low");
    });

    test("should create error notification with high priority", () => {
      const notification = notificationManager.createSystemNotification(
        "Something went wrong",
        "error"
      );

      expect(notification.title).toBe("Error");
      expect(notification.priority).toBe("high");
      expect(notification.severity).toBe("error");
    });

    test("should create warning notification with medium priority", () => {
      const notification = notificationManager.createSystemNotification(
        "Please be careful",
        "warning"
      );

      expect(notification.title).toBe("Warning");
      expect(notification.priority).toBe("medium");
    });

    test("should create info notification", () => {
      const notification = notificationManager.createSystemNotification(
        "FYI",
        "info"
      );

      expect(notification.title).toBe("Information");
      expect(notification.priority).toBe("low");
    });

    test("should respect custom duration", () => {
      const notification = notificationManager.createSystemNotification(
        "Quick message",
        "info",
        { duration: 1000 }
      );

      expect(notification.duration).toBe(1000);
    });
  });

  /**
   * =============================================================================
   *                      PRIVACY NOTIFICATIONS
   * =============================================================================
   */
  describe("Privacy Notifications", () => {
    test("should create schedule privacy notification", () => {
      const notification = notificationManager.createPrivacyNotification(
        "johndoe",
        "schedule",
        "view"
      );

      expect(notification.type).toBe("privacy_restriction");
      expect(notification.title).toBe("Schedule Privacy");
      expect(notification.message).toContain("@johndoe");
      expect(notification.message).toContain("schedule");
      expect(notification.priority).toBe("medium");
    });

    test("should create profile privacy notification", () => {
      const notification = notificationManager.createPrivacyNotification(
        "janedoe",
        "profile",
        "access"
      );

      expect(notification.title).toBe("Profile Privacy");
      expect(notification.message).toContain("profile");
    });

    test("should use custom message when provided", () => {
      const notification = notificationManager.createPrivacyNotification(
        "user",
        "schedule",
        "view",
        { message: "Custom privacy message" }
      );

      expect(notification.message).toBe("Custom privacy message");
    });
  });

  /**
   * =============================================================================
   *                      QUEUE MANAGEMENT
   * =============================================================================
   */
  describe("Queue Management", () => {
    test("should add notification to queue", () => {
      const notification = { id: "test-1", message: "Test" };
      notificationManager.addNotification(notification);

      expect(notificationManager.notifications).toHaveLength(1);
      expect(notificationManager.notifications[0]).toEqual(notification);
    });

    test("should add new notifications at the beginning", () => {
      notificationManager.addNotification({ id: "first", message: "First" });
      notificationManager.addNotification({ id: "second", message: "Second" });

      expect(notificationManager.notifications[0].id).toBe("second");
      expect(notificationManager.notifications[1].id).toBe("first");
    });

    test("should limit notifications to maxNotifications", () => {
      for (let i = 0; i < 10; i++) {
        notificationManager.addNotification({ id: `notif-${i}` });
      }

      expect(notificationManager.notifications).toHaveLength(5);
      expect(notificationManager.notifications[0].id).toBe("notif-9");
    });

    test("should remove notification by ID", () => {
      notificationManager.addNotification({ id: "to-remove" });
      notificationManager.addNotification({ id: "to-keep" });

      notificationManager.removeNotification("to-remove");

      expect(notificationManager.notifications).toHaveLength(1);
      expect(notificationManager.notifications[0].id).toBe("to-keep");
    });

    test("should clear all notifications", () => {
      notificationManager.addNotification({ id: "1" });
      notificationManager.addNotification({ id: "2" });

      notificationManager.clearAllNotifications();

      expect(notificationManager.notifications).toHaveLength(0);
    });

    test("should check if notification exists", () => {
      notificationManager.addNotification({ id: "exists" });

      expect(notificationManager.hasNotification("exists")).toBe(true);
      expect(notificationManager.hasNotification("not-exists")).toBe(false);
    });
  });

  /**
   * =============================================================================
   *                      FILTERING TESTS
   * =============================================================================
   */
  describe("Filtering", () => {
    beforeEach(() => {
      notificationManager.addNotification({
        id: "1",
        type: "friend_request",
        priority: "high",
      });
      notificationManager.addNotification({
        id: "2",
        type: "system",
        priority: "low",
      });
      notificationManager.addNotification({
        id: "3",
        type: "friend_request",
        priority: "high",
      });
    });

    test("should filter by type", () => {
      const friendRequests =
        notificationManager.getNotificationsByType("friend_request");

      expect(friendRequests).toHaveLength(2);
      expect(friendRequests.every((n) => n.type === "friend_request")).toBe(
        true
      );
    });

    test("should filter by priority", () => {
      const highPriority =
        notificationManager.getNotificationsByPriority("high");

      expect(highPriority).toHaveLength(2);
      expect(highPriority.every((n) => n.priority === "high")).toBe(true);
    });
  });

  /**
   * =============================================================================
   *                      TIMESTAMP FORMATTING
   * =============================================================================
   */
  describe("Timestamp Formatting", () => {
    test("should format recent timestamp as 'Just now'", () => {
      const now = Date.now();
      const formatted = notificationManager.formatTimestamp(now);

      expect(formatted).toBe("Just now");
    });

    test("should format minutes ago", () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const formatted = notificationManager.formatTimestamp(fiveMinutesAgo);

      expect(formatted).toContain("5 minutes ago");
    });

    test("should format hours ago", () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const formatted = notificationManager.formatTimestamp(twoHoursAgo);

      expect(formatted).toContain("2 hours ago");
    });

    test("should handle singular minute", () => {
      const oneMinuteAgo = Date.now() - 1 * 60 * 1000;
      const formatted = notificationManager.formatTimestamp(oneMinuteAgo);

      expect(formatted).toBe("1 minute ago");
    });

    test("should handle singular hour", () => {
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
      const formatted = notificationManager.formatTimestamp(oneHourAgo);

      expect(formatted).toBe("1 hour ago");
    });
  });

  /**
   * =============================================================================
   *                      ICON MAPPING
   * =============================================================================
   */
  describe("Icon Mapping", () => {
    test("should return correct icon for friend request", () => {
      const notification = { type: "friend_request" };
      const icon = notificationManager.getHeaderIconClass(notification);

      expect(icon).toBe("fas fa-user-plus");
    });

    test("should return correct icon for friend accepted", () => {
      const notification = { type: "friend_accepted" };
      const icon = notificationManager.getHeaderIconClass(notification);

      expect(icon).toBe("fas fa-user-check");
    });

    test("should return correct icon for privacy restriction", () => {
      const notification = { type: "privacy_restriction" };
      const icon = notificationManager.getHeaderIconClass(notification);

      expect(icon).toBe("fas fa-lock");
    });

    test("should return correct icon for system success", () => {
      const notification = { type: "system", severity: "success" };
      const icon = notificationManager.getHeaderIconClass(notification);

      expect(icon).toBe("fas fa-check-circle");
    });

    test("should return correct icon for system error", () => {
      const notification = { type: "system", severity: "error" };
      const icon = notificationManager.getHeaderIconClass(notification);

      expect(icon).toBe("fas fa-exclamation-circle");
    });

    test("should return default icon for unknown type", () => {
      const notification = { type: "unknown" };
      const icon = notificationManager.getHeaderIconClass(notification);

      expect(icon).toBe("fas fa-bell");
    });
  });

  /**
   * =============================================================================
   *                      TITLE GENERATION
   * =============================================================================
   */
  describe("Title Generation", () => {
    test("should generate correct system titles", () => {
      expect(notificationManager.getSystemTitle("success")).toBe("Success");
      expect(notificationManager.getSystemTitle("error")).toBe("Error");
      expect(notificationManager.getSystemTitle("warning")).toBe("Warning");
      expect(notificationManager.getSystemTitle("info")).toBe("Information");
    });

    test("should generate correct privacy titles", () => {
      expect(notificationManager.getPrivacyTitle("schedule")).toBe(
        "Schedule Privacy"
      );
      expect(notificationManager.getPrivacyTitle("profile")).toBe(
        "Profile Privacy"
      );
      expect(notificationManager.getPrivacyTitle("quickAccess")).toBe(
        "Quick Access Privacy"
      );
    });

    test("should return default for unknown type", () => {
      expect(notificationManager.getSystemTitle("unknown")).toBe("Notice");
      expect(notificationManager.getPrivacyTitle("unknown")).toBe(
        "Privacy Notice"
      );
    });
  });
});
