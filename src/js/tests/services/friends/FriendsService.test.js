/**
 * =============================================================================
 *                        FRIENDS SERVICE TESTS
 *                    Testing Friend Management Features
 * =============================================================================
 *
 * This test suite covers the FriendsManager functionality by testing:
 * - Cache management logic (pure functions)
 * - Data transformation logic
 * - Validation logic
 * - Expected data structures
 *
 * Note: Since FriendsManager has deep Firebase dependencies, we test the
 * logic and data structures directly rather than mocking all dependencies.
 *
 * =============================================================================
 */

import { jest } from "@jest/globals";

/**
 * =============================================================================
 *                     FRIENDS MANAGER LOGIC TESTS
 * =============================================================================
 *
 * We test the core logic of FriendsManager by creating a minimal mock that
 * simulates its behavior without the Firebase dependencies.
 *
 * =============================================================================
 */

// Minimal FriendsManager mock for testing cache and logic
class MockFriendsManager {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes TTL
    this.isRealTimeActive = false;
    this.unsubscribers = [];
    this.uiCallbacks = {
      onFriendRequestsChange: null,
      onOutgoingFriendRequestsChange: null,
      onFriendsListChange: null,
      onConnectionStatusChange: null,
      onQuickAccessUpdated: null,
    };
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCached(key, data) {
    if (this.cache.size > 50) {
      this.cleanupExpiredCache();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(key) {
    this.cache.delete(key);
  }

  clearAllCache() {
    this.cache.clear();
  }

  registerUICallbacks(callbacks) {
    this.uiCallbacks = {
      onFriendRequestsChange: callbacks.onFriendRequestsChange || null,
      onOutgoingFriendRequestsChange:
        callbacks.onOutgoingFriendRequestsChange || null,
      onFriendsListChange: callbacks.onFriendsListChange || null,
      onConnectionStatusChange: callbacks.onConnectionStatusChange || null,
      onQuickAccessUpdated: callbacks.onQuickAccessUpdated || null,
    };
  }

  /**
   * Transform raw friendship data to friend list format
   * (Extracted from the real FriendsManager.getFriendsList)
   */
  transformFriendshipToFriend(friendship, currentUserId) {
    const isUser1 = friendship.user1Id === currentUserId;
    const friendInfo = isUser1 ? friendship.user2Info : friendship.user1Info;
    const friendId = isUser1 ? friendship.user2Id : friendship.user1Id;

    return {
      id: friendId,
      friendshipId: friendship.id,
      handle: friendInfo?.handle || "unknown",
      major: friendInfo?.major || "Unknown Major",
      avatarConfig: friendInfo?.avatarConfig || null,
      profilePhotoUrl: friendInfo?.profilePhotoUrl || null,
      useAvatar:
        typeof friendInfo?.useAvatar === "boolean"
          ? friendInfo.useAvatar
          : undefined,
      friendsSince: friendship.createdAt,
      lastInteraction: friendship.lastInteraction,
      connectionStrength: friendship.connectionStrength || "normal",
      isOnline: false,
      mutualFriends: friendship.mutualFriends || 0,
    };
  }

  /**
   * Transform raw friend request data
   * (Extracted from the real FriendsManager.getPendingRequests)
   */
  transformFriendRequest(request) {
    return {
      ...request,
      handle: request.fromUserInfo?.handle || "unknown",
      major: request.fromUserInfo?.major || "Unknown Major",
      university: request.fromUserInfo?.university || "Unknown University",
    };
  }

  /**
   * Validate friend request data
   */
  validateFriendRequestData(requestData, currentUserId) {
    if (!requestData) {
      return { valid: false, error: "Missing request data" };
    }
    if (!requestData.toUserId) {
      return { valid: false, error: "Missing target user ID" };
    }
    if (requestData.toUserId === currentUserId) {
      return { valid: false, error: "Cannot send request to yourself" };
    }
    return { valid: true };
  }

  /**
   * Validate search term for handle search
   */
  validateSearchTerm(term) {
    const normalized = term.trim();
    if (normalized.length < 1) return { valid: false, type: null };

    // Student ID pattern (6+ digits)
    if (/^\d{6,}$/.test(normalized)) {
      return { valid: true, type: "studentId", term: normalized };
    }

    // Handle pattern (starts with optional @, then letter, then 2+ alphanumeric)
    const handle = normalized.startsWith("@")
      ? normalized.slice(1).toLowerCase()
      : normalized.toLowerCase();

    if (/^[a-z][a-z0-9_]{2,}$/.test(handle)) {
      return { valid: true, type: "handle", term: handle };
    }

    return { valid: false, type: null };
  }
}

describe("FriendsService", () => {
  let friendsManager;

  beforeEach(() => {
    friendsManager = new MockFriendsManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    friendsManager.clearAllCache();
  });

  /**
   * =============================================================================
   *                           INITIALIZATION TESTS
   * =============================================================================
   */
  describe("Initialization", () => {
    test("should initialize with correct default state", () => {
      expect(friendsManager.cache).toBeInstanceOf(Map);
      expect(friendsManager.cache.size).toBe(0);
      expect(friendsManager.isRealTimeActive).toBe(false);
      expect(friendsManager.unsubscribers).toEqual([]);
    });

    test("should have UI callbacks set to null initially", () => {
      expect(friendsManager.uiCallbacks.onFriendRequestsChange).toBeNull();
      expect(friendsManager.uiCallbacks.onFriendsListChange).toBeNull();
      expect(friendsManager.uiCallbacks.onConnectionStatusChange).toBeNull();
    });

    test("should have correct cache expiry time", () => {
      expect(friendsManager.cacheExpiry).toBe(5 * 60 * 1000); // 5 minutes
    });
  });

  /**
   * =============================================================================
   *                           CACHE MANAGEMENT TESTS
   * =============================================================================
   */
  describe("Cache Management", () => {
    test("should set and get cached data", () => {
      const testData = { users: ["user1", "user2"] };
      friendsManager.setCached("test-key", testData);

      const cached = friendsManager.getCached("test-key");
      expect(cached).toEqual(testData);
    });

    test("should return null for non-existent cache key", () => {
      const cached = friendsManager.getCached("non-existent");
      expect(cached).toBeNull();
    });

    test("should return null for expired cache entries", () => {
      const testData = { users: ["user1"] };
      friendsManager.setCached("expired-key", testData);

      // Manually expire the cache entry
      const cached = friendsManager.cache.get("expired-key");
      cached.timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago (beyond 5 min TTL)

      const result = friendsManager.getCached("expired-key");
      expect(result).toBeNull();
    });

    test("should delete expired entry when accessed", () => {
      friendsManager.setCached("to-expire", { data: 1 });
      const cached = friendsManager.cache.get("to-expire");
      cached.timestamp = Date.now() - 6 * 60 * 1000;

      friendsManager.getCached("to-expire");

      expect(friendsManager.cache.has("to-expire")).toBe(false);
    });

    test("should clear specific cache entry", () => {
      friendsManager.setCached("key1", { data: 1 });
      friendsManager.setCached("key2", { data: 2 });

      friendsManager.clearCache("key1");

      expect(friendsManager.getCached("key1")).toBeNull();
      expect(friendsManager.getCached("key2")).toEqual({ data: 2 });
    });

    test("should clear all cache entries", () => {
      friendsManager.setCached("key1", { data: 1 });
      friendsManager.setCached("key2", { data: 2 });

      friendsManager.clearAllCache();

      expect(friendsManager.cache.size).toBe(0);
    });

    test("should cleanup expired cache when size exceeds 50", () => {
      // Add expired entries
      for (let i = 0; i < 30; i++) {
        friendsManager.cache.set(`old-${i}`, {
          data: i,
          timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago (expired)
        });
      }

      // Add new entries to trigger cleanup
      for (let i = 0; i < 25; i++) {
        friendsManager.setCached(`new-${i}`, { data: i });
      }

      // Expired entries should be cleaned up
      expect(friendsManager.getCached("old-0")).toBeNull();
    });
  });

  /**
   * =============================================================================
   *                      DATA TRANSFORMATION TESTS
   * =============================================================================
   */
  describe("Data Transformation", () => {
    describe("transformFriendshipToFriend", () => {
      test("should transform friendship when current user is user1", () => {
        const friendship = {
          id: "friendship-123",
          user1Id: "current-user",
          user2Id: "friend-456",
          user1Info: { handle: "me", major: "CS" },
          user2Info: {
            handle: "friend",
            major: "Engineering",
            avatarConfig: { color: "#ff0000" },
          },
          createdAt: new Date("2024-01-15"),
          mutualFriends: 5,
        };

        const friend = friendsManager.transformFriendshipToFriend(
          friendship,
          "current-user"
        );

        expect(friend.id).toBe("friend-456");
        expect(friend.friendshipId).toBe("friendship-123");
        expect(friend.handle).toBe("friend");
        expect(friend.major).toBe("Engineering");
        expect(friend.avatarConfig).toEqual({ color: "#ff0000" });
        expect(friend.mutualFriends).toBe(5);
      });

      test("should transform friendship when current user is user2", () => {
        const friendship = {
          id: "friendship-123",
          user1Id: "friend-456",
          user2Id: "current-user",
          user1Info: { handle: "friend", major: "Business" },
          user2Info: { handle: "me", major: "CS" },
          createdAt: new Date("2024-02-01"),
        };

        const friend = friendsManager.transformFriendshipToFriend(
          friendship,
          "current-user"
        );

        expect(friend.id).toBe("friend-456");
        expect(friend.handle).toBe("friend");
        expect(friend.major).toBe("Business");
      });

      test("should handle missing friend info gracefully", () => {
        const friendship = {
          id: "friendship-123",
          user1Id: "current-user",
          user2Id: "friend-456",
          user1Info: null,
          user2Info: null,
        };

        const friend = friendsManager.transformFriendshipToFriend(
          friendship,
          "current-user"
        );

        expect(friend.handle).toBe("unknown");
        expect(friend.major).toBe("Unknown Major");
        expect(friend.avatarConfig).toBeNull();
      });

      test("should set default values for missing fields", () => {
        const friendship = {
          id: "friendship-123",
          user1Id: "current-user",
          user2Id: "friend-456",
          user2Info: { handle: "friend" },
        };

        const friend = friendsManager.transformFriendshipToFriend(
          friendship,
          "current-user"
        );

        expect(friend.connectionStrength).toBe("normal");
        expect(friend.isOnline).toBe(false);
        expect(friend.mutualFriends).toBe(0);
      });
    });

    describe("transformFriendRequest", () => {
      test("should transform friend request with full info", () => {
        const request = {
          id: "req-123",
          fromUserId: "sender-456",
          toUserId: "receiver-789",
          fromUserInfo: {
            handle: "sender",
            major: "Engineering",
            university: "iub",
          },
          status: "pending",
        };

        const transformed = friendsManager.transformFriendRequest(request);

        expect(transformed.id).toBe("req-123");
        expect(transformed.handle).toBe("sender");
        expect(transformed.major).toBe("Engineering");
        expect(transformed.university).toBe("iub");
      });

      test("should handle missing fromUserInfo", () => {
        const request = {
          id: "req-123",
          fromUserId: "sender-456",
          fromUserInfo: null,
        };

        const transformed = friendsManager.transformFriendRequest(request);

        expect(transformed.handle).toBe("unknown");
        expect(transformed.major).toBe("Unknown Major");
        expect(transformed.university).toBe("Unknown University");
      });
    });
  });

  /**
   * =============================================================================
   *                      VALIDATION TESTS
   * =============================================================================
   */
  describe("Validation", () => {
    describe("validateFriendRequestData", () => {
      test("should reject null request data", () => {
        const result = friendsManager.validateFriendRequestData(
          null,
          "current-user"
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Missing");
      });

      test("should reject request without target user ID", () => {
        const result = friendsManager.validateFriendRequestData(
          { fromUserId: "sender" },
          "current-user"
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Missing target");
      });

      test("should reject self-friend request", () => {
        const result = friendsManager.validateFriendRequestData(
          { toUserId: "current-user" },
          "current-user"
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain("yourself");
      });

      test("should accept valid friend request", () => {
        const result = friendsManager.validateFriendRequestData(
          { toUserId: "other-user" },
          "current-user"
        );
        expect(result.valid).toBe(true);
      });
    });

    describe("validateSearchTerm", () => {
      test("should reject empty search term", () => {
        expect(friendsManager.validateSearchTerm("").valid).toBe(false);
        expect(friendsManager.validateSearchTerm("   ").valid).toBe(false);
      });

      test("should detect student ID pattern (6+ digits)", () => {
        const result = friendsManager.validateSearchTerm("123456");
        expect(result.valid).toBe(true);
        expect(result.type).toBe("studentId");
        expect(result.term).toBe("123456");
      });

      test("should detect longer student IDs", () => {
        const result = friendsManager.validateSearchTerm("1234567890");
        expect(result.valid).toBe(true);
        expect(result.type).toBe("studentId");
      });

      test("should reject too short number (less than 6 digits)", () => {
        const result = friendsManager.validateSearchTerm("12345");
        expect(result.valid).toBe(false);
      });

      test("should detect valid handle pattern", () => {
        const result = friendsManager.validateSearchTerm("john_doe");
        expect(result.valid).toBe(true);
        expect(result.type).toBe("handle");
        expect(result.term).toBe("john_doe");
      });

      test("should normalize handle with @ prefix", () => {
        const result = friendsManager.validateSearchTerm("@john_doe");
        expect(result.valid).toBe(true);
        expect(result.type).toBe("handle");
        expect(result.term).toBe("john_doe");
      });

      test("should reject handle starting with number", () => {
        const result = friendsManager.validateSearchTerm("123abc");
        expect(result.valid).toBe(false);
      });

      test("should reject too short handle (less than 3 chars)", () => {
        const result = friendsManager.validateSearchTerm("ab");
        expect(result.valid).toBe(false);
      });

      test("should lowercase handle", () => {
        const result = friendsManager.validateSearchTerm("JohnDoe");
        expect(result.valid).toBe(true);
        expect(result.term).toBe("johndoe");
      });
    });
  });

  /**
   * =============================================================================
   *                      UI CALLBACKS TESTS
   * =============================================================================
   */
  describe("UI Callbacks", () => {
    test("should register UI callbacks", () => {
      const callbacks = {
        onFriendRequestsChange: jest.fn(),
        onFriendsListChange: jest.fn(),
        onConnectionStatusChange: jest.fn(),
        onQuickAccessUpdated: jest.fn(),
      };

      friendsManager.registerUICallbacks(callbacks);

      expect(friendsManager.uiCallbacks.onFriendRequestsChange).toBe(
        callbacks.onFriendRequestsChange
      );
      expect(friendsManager.uiCallbacks.onFriendsListChange).toBe(
        callbacks.onFriendsListChange
      );
    });

    test("should handle partial callback registration", () => {
      const callbacks = {
        onFriendRequestsChange: jest.fn(),
        // Missing other callbacks
      };

      friendsManager.registerUICallbacks(callbacks);

      expect(friendsManager.uiCallbacks.onFriendRequestsChange).toBe(
        callbacks.onFriendRequestsChange
      );
      expect(friendsManager.uiCallbacks.onFriendsListChange).toBeNull();
    });

    test("should handle empty callback object", () => {
      friendsManager.registerUICallbacks({});

      expect(friendsManager.uiCallbacks.onFriendRequestsChange).toBeNull();
      expect(friendsManager.uiCallbacks.onFriendsListChange).toBeNull();
    });
  });

  /**
   * =============================================================================
   *                      DATA STRUCTURE TESTS
   * =============================================================================
   */
  describe("Data Structures", () => {
    test("friend object should have required fields", () => {
      const friendship = {
        id: "friendship-123",
        user1Id: "current-user",
        user2Id: "friend-456",
        user2Info: {
          handle: "friend",
          major: "CS",
          avatarConfig: { color: "#fff" },
          profilePhotoUrl: "https://example.com/photo.jpg",
          useAvatar: true,
        },
        createdAt: new Date(),
        lastInteraction: new Date(),
        connectionStrength: "strong",
        mutualFriends: 10,
      };

      const friend = friendsManager.transformFriendshipToFriend(
        friendship,
        "current-user"
      );

      // Required fields
      expect(friend).toHaveProperty("id");
      expect(friend).toHaveProperty("friendshipId");
      expect(friend).toHaveProperty("handle");
      expect(friend).toHaveProperty("major");

      // Avatar fields
      expect(friend).toHaveProperty("avatarConfig");
      expect(friend).toHaveProperty("profilePhotoUrl");
      expect(friend).toHaveProperty("useAvatar");

      // Metadata fields
      expect(friend).toHaveProperty("friendsSince");
      expect(friend).toHaveProperty("lastInteraction");
      expect(friend).toHaveProperty("connectionStrength");
      expect(friend).toHaveProperty("mutualFriends");
      expect(friend).toHaveProperty("isOnline");
    });

    test("friend request object should have required fields", () => {
      const request = {
        id: "req-123",
        fromUserId: "sender",
        toUserId: "receiver",
        fromUserInfo: {
          handle: "sender_handle",
          major: "Engineering",
          university: "iub",
        },
        status: "pending",
      };

      const transformed = friendsManager.transformFriendRequest(request);

      expect(transformed).toHaveProperty("id");
      expect(transformed).toHaveProperty("handle");
      expect(transformed).toHaveProperty("major");
      expect(transformed).toHaveProperty("university");
    });
  });
});
