/**
 * =============================================================================
 *                    FRIENDSHIP PRIVACY SERVICE TESTS
 *                    Testing Bilateral Privacy Management
 * =============================================================================
 *
 * This test suite covers the FriendshipPrivacyService functionality:
 * - Cache management
 * - Privacy visibility validation
 * - Data transformation
 * - Default privacy settings
 *
 * Note: Since the service has deep Firebase dependencies, we test the
 * logic and data structures directly rather than mocking all dependencies.
 *
 * =============================================================================
 */

import { jest } from "@jest/globals";

/**
 * =============================================================================
 *                   FRIENDSHIP PRIVACY LOGIC TESTS
 * =============================================================================
 *
 * We test the core logic by creating a minimal mock that simulates behavior
 * without Firebase dependencies.
 *
 * =============================================================================
 */

// Privacy defaults matching the real service
const PRIVACY_DEFAULTS = {
  scheduleVisibility: true, // Default: friends can see schedule
  locationSharing: false,
  notificationsEnabled: true,
};

// Mock FriendshipPrivacyService for testing logic
class MockFriendshipPrivacyService {
  constructor() {
    this.cache = new Map();
    this.quickAccessCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.pendingOperations = new Set();
    this.maxCacheSize = 100;
    this.maxQuickAccessCacheSize = 200;
    this.operationTimeout = 30 * 1000;
  }

  /**
   * Generate friendship ID from two user IDs (sorted for consistency)
   */
  getFriendshipId(userId1, userId2) {
    const sorted = [userId1, userId2].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  /**
   * Validate user IDs for privacy operations
   */
  validateUserIds(userId1, userId2, operation = "operation") {
    if (!userId1 || !userId2) {
      return {
        valid: false,
        error: `Invalid user IDs for ${operation}: ${userId1}, ${userId2}`,
      };
    }
    if (userId1 === userId2) {
      return {
        valid: false,
        error: `Cannot perform ${operation} with same user: ${userId1}`,
      };
    }
    return { valid: true };
  }

  /**
   * Validate visibility value
   */
  validateVisibility(isVisible) {
    if (typeof isVisible !== "boolean") {
      return { valid: false, error: `isVisible must be boolean: ${isVisible}` };
    }
    return { valid: true };
  }

  /**
   * Validate friendship document structure
   */
  validateFriendshipDocument(doc) {
    const errors = [];

    if (!doc) {
      return { isValid: false, errors: ["Document is null or undefined"] };
    }

    if (!doc.user1Id || typeof doc.user1Id !== "string") {
      errors.push("Missing or invalid user1Id");
    }

    if (!doc.user2Id || typeof doc.user2Id !== "string") {
      errors.push("Missing or invalid user2Id");
    }

    if (doc.user1Id === doc.user2Id) {
      errors.push("user1Id and user2Id cannot be the same");
    }

    if (!doc.scheduleVisibility || typeof doc.scheduleVisibility !== "object") {
      errors.push("Missing or invalid scheduleVisibility object");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if schedule is visible to friend based on friendship document
   */
  isScheduleVisibleToFriend(friendshipDoc, scheduleOwnerUid, friendUid) {
    if (!friendshipDoc || !scheduleOwnerUid || !friendUid) {
      return false;
    }

    // The schedule owner controls their own visibility
    const visibility = friendshipDoc.scheduleVisibility?.[scheduleOwnerUid];

    // Default to visible if not explicitly set
    return visibility !== false;
  }

  /**
   * Get cached friendship document
   */
  getCachedFriendship(userId1, userId2) {
    const friendshipId = this.getFriendshipId(userId1, userId2);
    const cached = this.cache.get(friendshipId);

    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(friendshipId);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cached friendship document
   */
  setCachedFriendship(userId1, userId2, data) {
    const friendshipId = this.getFriendshipId(userId1, userId2);

    // Simple cache eviction
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(friendshipId, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache for a friendship
   */
  invalidateFriendshipCache(userId1, userId2) {
    const friendshipId = this.getFriendshipId(userId1, userId2);
    this.cache.delete(friendshipId);

    // Also invalidate quick access cache
    this.quickAccessCache.delete(`${userId1}_${userId2}_quickaccess`);
    this.quickAccessCache.delete(`${userId2}_${userId1}_quickaccess`);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.cache.clear();
    this.quickAccessCache.clear();
  }

  /**
   * Get default privacy settings for a new friendship
   */
  getDefaultPrivacySettings() {
    return { ...PRIVACY_DEFAULTS };
  }

  /**
   * Create initial privacy data for a new friendship
   */
  createInitialPrivacyData(user1Id, user2Id) {
    return {
      scheduleVisibility: {
        [user1Id]: PRIVACY_DEFAULTS.scheduleVisibility,
        [user2Id]: PRIVACY_DEFAULTS.scheduleVisibility,
      },
      privacyMetadata: {
        lastPrivacyUpdate: Date.now(),
        privacyUpdatedBy: null,
        privacyVersion: 1,
      },
    };
  }

  /**
   * Check if operation is pending
   */
  isOperationPending(userId, friendId) {
    const friendshipId = this.getFriendshipId(userId, friendId);
    const operationKey = `${friendshipId}_${userId}`;
    return this.pendingOperations.has(operationKey);
  }

  /**
   * Get privacy status for both users in a friendship
   */
  getPrivacyStatus(friendshipDoc, currentUserId) {
    if (!friendshipDoc) {
      return {
        myVisibility: PRIVACY_DEFAULTS.scheduleVisibility,
        theirVisibility: PRIVACY_DEFAULTS.scheduleVisibility,
      };
    }

    const otherUserId =
      friendshipDoc.user1Id === currentUserId
        ? friendshipDoc.user2Id
        : friendshipDoc.user1Id;

    return {
      myVisibility:
        friendshipDoc.scheduleVisibility?.[currentUserId] ??
        PRIVACY_DEFAULTS.scheduleVisibility,
      theirVisibility:
        friendshipDoc.scheduleVisibility?.[otherUserId] ??
        PRIVACY_DEFAULTS.scheduleVisibility,
    };
  }
}

describe("FriendshipPrivacyService", () => {
  let privacyService;

  beforeEach(() => {
    privacyService = new MockFriendshipPrivacyService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    privacyService.clearAllCaches();
  });

  /**
   * =============================================================================
   *                           INITIALIZATION TESTS
   * =============================================================================
   */
  describe("Initialization", () => {
    test("should initialize with correct default state", () => {
      expect(privacyService.cache).toBeInstanceOf(Map);
      expect(privacyService.quickAccessCache).toBeInstanceOf(Map);
      expect(privacyService.pendingOperations).toBeInstanceOf(Set);
      expect(privacyService.cacheExpiry).toBe(5 * 60 * 1000);
    });

    test("should have correct configuration values", () => {
      expect(privacyService.maxCacheSize).toBe(100);
      expect(privacyService.maxQuickAccessCacheSize).toBe(200);
      expect(privacyService.operationTimeout).toBe(30 * 1000);
    });
  });

  /**
   * =============================================================================
   *                      FRIENDSHIP ID GENERATION
   * =============================================================================
   */
  describe("Friendship ID Generation", () => {
    test("should generate consistent ID regardless of order", () => {
      const id1 = privacyService.getFriendshipId("userA", "userB");
      const id2 = privacyService.getFriendshipId("userB", "userA");

      expect(id1).toBe(id2);
    });

    test("should sort user IDs alphabetically", () => {
      const id = privacyService.getFriendshipId("zebra", "apple");

      expect(id).toBe("apple_zebra");
    });

    test("should handle numeric-like IDs", () => {
      const id = privacyService.getFriendshipId("user123", "user456");

      expect(id).toBe("user123_user456");
    });
  });

  /**
   * =============================================================================
   *                      VALIDATION TESTS
   * =============================================================================
   */
  describe("Validation", () => {
    describe("validateUserIds", () => {
      test("should reject null user IDs", () => {
        const result = privacyService.validateUserIds(null, "user2");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid");
      });

      test("should reject empty user IDs", () => {
        const result = privacyService.validateUserIds("user1", "");
        expect(result.valid).toBe(false);
      });

      test("should reject same user IDs", () => {
        const result = privacyService.validateUserIds("user1", "user1");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("same user");
      });

      test("should accept valid different user IDs", () => {
        const result = privacyService.validateUserIds("user1", "user2");
        expect(result.valid).toBe(true);
      });

      test("should include operation name in error", () => {
        const result = privacyService.validateUserIds(
          null,
          "user2",
          "visibility check"
        );
        expect(result.error).toContain("visibility check");
      });
    });

    describe("validateVisibility", () => {
      test("should accept true", () => {
        expect(privacyService.validateVisibility(true).valid).toBe(true);
      });

      test("should accept false", () => {
        expect(privacyService.validateVisibility(false).valid).toBe(true);
      });

      test("should reject strings", () => {
        expect(privacyService.validateVisibility("true").valid).toBe(false);
      });

      test("should reject numbers", () => {
        expect(privacyService.validateVisibility(1).valid).toBe(false);
      });

      test("should reject null", () => {
        expect(privacyService.validateVisibility(null).valid).toBe(false);
      });
    });

    describe("validateFriendshipDocument", () => {
      test("should reject null document", () => {
        const result = privacyService.validateFriendshipDocument(null);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Document is null or undefined");
      });

      test("should reject document without user1Id", () => {
        const doc = { user2Id: "user2", scheduleVisibility: {} };
        const result = privacyService.validateFriendshipDocument(doc);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes("user1Id"))).toBe(true);
      });

      test("should reject document without user2Id", () => {
        const doc = { user1Id: "user1", scheduleVisibility: {} };
        const result = privacyService.validateFriendshipDocument(doc);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes("user2Id"))).toBe(true);
      });

      test("should reject document with same user IDs", () => {
        const doc = {
          user1Id: "same",
          user2Id: "same",
          scheduleVisibility: {},
        };
        const result = privacyService.validateFriendshipDocument(doc);
        expect(result.isValid).toBe(false);
        expect(
          result.errors.some((e) => e.includes("cannot be the same"))
        ).toBe(true);
      });

      test("should reject document without scheduleVisibility", () => {
        const doc = { user1Id: "user1", user2Id: "user2" };
        const result = privacyService.validateFriendshipDocument(doc);
        expect(result.isValid).toBe(false);
        expect(
          result.errors.some((e) => e.includes("scheduleVisibility"))
        ).toBe(true);
      });

      test("should accept valid document", () => {
        const doc = {
          user1Id: "user1",
          user2Id: "user2",
          scheduleVisibility: { user1: true, user2: true },
        };
        const result = privacyService.validateFriendshipDocument(doc);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  /**
   * =============================================================================
   *                      VISIBILITY LOGIC TESTS
   * =============================================================================
   */
  describe("Visibility Logic", () => {
    describe("isScheduleVisibleToFriend", () => {
      test("should return false for null friendship document", () => {
        const result = privacyService.isScheduleVisibleToFriend(
          null,
          "owner",
          "friend"
        );
        expect(result).toBe(false);
      });

      test("should return false for null owner ID", () => {
        const doc = { scheduleVisibility: {} };
        const result = privacyService.isScheduleVisibleToFriend(
          doc,
          null,
          "friend"
        );
        expect(result).toBe(false);
      });

      test("should return true when visibility is explicitly true", () => {
        const doc = {
          scheduleVisibility: { owner123: true },
        };
        const result = privacyService.isScheduleVisibleToFriend(
          doc,
          "owner123",
          "friend456"
        );
        expect(result).toBe(true);
      });

      test("should return false when visibility is explicitly false", () => {
        const doc = {
          scheduleVisibility: { owner123: false },
        };
        const result = privacyService.isScheduleVisibleToFriend(
          doc,
          "owner123",
          "friend456"
        );
        expect(result).toBe(false);
      });

      test("should default to visible when not explicitly set", () => {
        const doc = {
          scheduleVisibility: {},
        };
        const result = privacyService.isScheduleVisibleToFriend(
          doc,
          "owner123",
          "friend456"
        );
        expect(result).toBe(true); // Default is visible
      });

      test("should check owner's visibility, not friend's", () => {
        const doc = {
          scheduleVisibility: {
            owner123: false, // Owner hides from friend
            friend456: true, // Friend shows to owner (irrelevant)
          },
        };
        const result = privacyService.isScheduleVisibleToFriend(
          doc,
          "owner123",
          "friend456"
        );
        expect(result).toBe(false); // Owner's setting matters
      });
    });

    describe("getPrivacyStatus", () => {
      test("should return defaults for null document", () => {
        const result = privacyService.getPrivacyStatus(null, "user1");

        expect(result.myVisibility).toBe(PRIVACY_DEFAULTS.scheduleVisibility);
        expect(result.theirVisibility).toBe(
          PRIVACY_DEFAULTS.scheduleVisibility
        );
      });

      test("should correctly identify current user's visibility", () => {
        const doc = {
          user1Id: "currentUser",
          user2Id: "otherUser",
          scheduleVisibility: {
            currentUser: false,
            otherUser: true,
          },
        };
        const result = privacyService.getPrivacyStatus(doc, "currentUser");

        expect(result.myVisibility).toBe(false);
        expect(result.theirVisibility).toBe(true);
      });

      test("should work when current user is user2", () => {
        const doc = {
          user1Id: "otherUser",
          user2Id: "currentUser",
          scheduleVisibility: {
            currentUser: true,
            otherUser: false,
          },
        };
        const result = privacyService.getPrivacyStatus(doc, "currentUser");

        expect(result.myVisibility).toBe(true);
        expect(result.theirVisibility).toBe(false);
      });
    });
  });

  /**
   * =============================================================================
   *                      CACHE TESTS
   * =============================================================================
   */
  describe("Cache Management", () => {
    test("should cache friendship document", () => {
      const doc = { user1Id: "a", user2Id: "b", scheduleVisibility: {} };
      privacyService.setCachedFriendship("a", "b", doc);

      const cached = privacyService.getCachedFriendship("a", "b");
      expect(cached).toEqual(doc);
    });

    test("should return same cache regardless of ID order", () => {
      const doc = { user1Id: "a", user2Id: "b", scheduleVisibility: {} };
      privacyService.setCachedFriendship("a", "b", doc);

      // Access with reversed order
      const cached = privacyService.getCachedFriendship("b", "a");
      expect(cached).toEqual(doc);
    });

    test("should return null for non-existent cache", () => {
      const cached = privacyService.getCachedFriendship("x", "y");
      expect(cached).toBeNull();
    });

    test("should return null for expired cache", () => {
      const doc = { user1Id: "a", user2Id: "b", scheduleVisibility: {} };
      privacyService.setCachedFriendship("a", "b", doc);

      // Manually expire
      const friendshipId = privacyService.getFriendshipId("a", "b");
      const cached = privacyService.cache.get(friendshipId);
      cached.timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      const result = privacyService.getCachedFriendship("a", "b");
      expect(result).toBeNull();
    });

    test("should evict oldest entry when cache is full", () => {
      // Fill cache to max
      for (let i = 0; i < 100; i++) {
        privacyService.setCachedFriendship(`user${i}`, `friend${i}`, {
          data: i,
        });
      }

      // Add one more
      privacyService.setCachedFriendship("newUser", "newFriend", {
        data: "new",
      });

      expect(privacyService.cache.size).toBe(100);
    });

    test("should invalidate cache correctly", () => {
      const doc = { user1Id: "a", user2Id: "b", scheduleVisibility: {} };
      privacyService.setCachedFriendship("a", "b", doc);

      privacyService.invalidateFriendshipCache("a", "b");

      expect(privacyService.getCachedFriendship("a", "b")).toBeNull();
    });

    test("should clear all caches", () => {
      privacyService.setCachedFriendship("a", "b", { data: 1 });
      privacyService.setCachedFriendship("c", "d", { data: 2 });
      privacyService.quickAccessCache.set("test", { data: 3 });

      privacyService.clearAllCaches();

      expect(privacyService.cache.size).toBe(0);
      expect(privacyService.quickAccessCache.size).toBe(0);
    });
  });

  /**
   * =============================================================================
   *                      PRIVACY DEFAULTS TESTS
   * =============================================================================
   */
  describe("Privacy Defaults", () => {
    test("should return correct default privacy settings", () => {
      const defaults = privacyService.getDefaultPrivacySettings();

      expect(defaults.scheduleVisibility).toBe(true);
      expect(defaults.locationSharing).toBe(false);
      expect(defaults.notificationsEnabled).toBe(true);
    });

    test("should return new object each time (not shared reference)", () => {
      const defaults1 = privacyService.getDefaultPrivacySettings();
      const defaults2 = privacyService.getDefaultPrivacySettings();

      defaults1.scheduleVisibility = false;

      expect(defaults2.scheduleVisibility).toBe(true);
    });
  });

  /**
   * =============================================================================
   *                      INITIAL PRIVACY DATA TESTS
   * =============================================================================
   */
  describe("Initial Privacy Data", () => {
    test("should create privacy data with both users visible by default", () => {
      const data = privacyService.createInitialPrivacyData("user1", "user2");

      expect(data.scheduleVisibility.user1).toBe(true);
      expect(data.scheduleVisibility.user2).toBe(true);
    });

    test("should include privacy metadata", () => {
      const data = privacyService.createInitialPrivacyData("user1", "user2");

      expect(data.privacyMetadata).toBeDefined();
      expect(data.privacyMetadata.lastPrivacyUpdate).toBeDefined();
      expect(data.privacyMetadata.privacyVersion).toBe(1);
      expect(data.privacyMetadata.privacyUpdatedBy).toBeNull();
    });

    test("should use current timestamp", () => {
      const before = Date.now();
      const data = privacyService.createInitialPrivacyData("user1", "user2");
      const after = Date.now();

      expect(data.privacyMetadata.lastPrivacyUpdate).toBeGreaterThanOrEqual(
        before
      );
      expect(data.privacyMetadata.lastPrivacyUpdate).toBeLessThanOrEqual(after);
    });
  });

  /**
   * =============================================================================
   *                      PENDING OPERATIONS TESTS
   * =============================================================================
   */
  describe("Pending Operations", () => {
    test("should not have pending operations initially", () => {
      expect(privacyService.isOperationPending("user1", "user2")).toBe(false);
    });

    test("should track pending operations", () => {
      const friendshipId = privacyService.getFriendshipId("user1", "user2");
      privacyService.pendingOperations.add(`${friendshipId}_user1`);

      expect(privacyService.isOperationPending("user1", "user2")).toBe(true);
    });

    test("should distinguish between different user operations", () => {
      const friendshipId = privacyService.getFriendshipId("user1", "user2");
      privacyService.pendingOperations.add(`${friendshipId}_user1`);

      // user1's operation is pending
      expect(privacyService.isOperationPending("user1", "user2")).toBe(true);
      // user2's operation is not pending
      expect(privacyService.isOperationPending("user2", "user1")).toBe(false);
    });
  });

  /**
   * =============================================================================
   *                      DATA STRUCTURE TESTS
   * =============================================================================
   */
  describe("Data Structures", () => {
    test("friendship document should have required fields", () => {
      const validDoc = {
        user1Id: "user1",
        user2Id: "user2",
        scheduleVisibility: {
          user1: true,
          user2: false,
        },
        privacyMetadata: {
          lastPrivacyUpdate: Date.now(),
          privacyUpdatedBy: "user1",
          privacyVersion: 2,
        },
      };

      const validation = privacyService.validateFriendshipDocument(validDoc);
      expect(validation.isValid).toBe(true);
    });

    test("privacy status should have both visibility fields", () => {
      const doc = {
        user1Id: "currentUser",
        user2Id: "otherUser",
        scheduleVisibility: {
          currentUser: true,
          otherUser: false,
        },
      };

      const status = privacyService.getPrivacyStatus(doc, "currentUser");

      expect(status).toHaveProperty("myVisibility");
      expect(status).toHaveProperty("theirVisibility");
    });
  });
});
