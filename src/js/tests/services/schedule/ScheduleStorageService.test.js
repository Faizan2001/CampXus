/**
 * ScheduleStorageService Test Suite
 *
 * Tests the dual storage strategy for schedules:
 * - Cache management (localStorage simulation)
 * - Data format conversion
 * - Offline queue management
 * - Service status tracking
 */

describe("ScheduleStorageService", () => {
  // ============================================
  // Test helpers that mirror service logic
  // ============================================

  /**
   * Cache manager for schedule data
   */
  class ScheduleCacheManager {
    constructor() {
      this.cache = new Map();
    }

    cacheScheduleData(userId, scheduleData) {
      const cacheKey = `schedule_${userId}`;
      const cacheData = {
        data: scheduleData,
        cachedAt: Date.now(),
        userId: userId,
      };
      this.cache.set(cacheKey, cacheData);
      return true;
    }

    getCachedScheduleData(userId) {
      const cacheKey = `schedule_${userId}`;
      const cached = this.cache.get(cacheKey);
      return cached ? cached.data : null;
    }

    clearCache(userId) {
      if (userId) {
        this.cache.delete(`schedule_${userId}`);
      } else {
        this.cache.clear();
      }
    }

    getCacheAge(userId) {
      const cacheKey = `schedule_${userId}`;
      const cached = this.cache.get(cacheKey);
      if (!cached) return null;
      return Date.now() - cached.cachedAt;
    }

    isCacheValid(userId, maxAgeMs = 5 * 60 * 1000) {
      const age = this.getCacheAge(userId);
      return age !== null && age < maxAgeMs;
    }
  }

  /**
   * Format converter for schedule data
   */
  const formatConverter = {
    /**
     * Convert map-based schedule to array format
     */
    convertMapToScheduleArray(scheduleMap, desiredSlotsLen = null) {
      if (!scheduleMap || typeof scheduleMap !== "object") {
        const len = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;
        return Array.from({ length: 7 }, () =>
          Array.from({ length: len }, () => false)
        );
      }

      // Determine number of slots
      let numSlots = 0;
      for (let day = 0; day < 7; day++) {
        const dayMap = scheduleMap[day];
        if (dayMap && typeof dayMap === "object") {
          const indices = Object.keys(dayMap)
            .map((k) => parseInt(k, 10))
            .filter((n) => !isNaN(n));
          if (indices.length > 0) {
            numSlots = Math.max(numSlots, Math.max(...indices) + 1);
          }
        }
      }
      if (numSlots <= 0) {
        numSlots = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;
      }

      return Array.from({ length: 7 }, (_, i) =>
        Array.from({ length: numSlots }, (_, j) =>
          Boolean(scheduleMap?.[i]?.[j] || false)
        )
      );
    },

    /**
     * Convert map-based slotInfo to array format
     */
    convertMapToSlotInfoArray(slotInfoMap, desiredSlotsLen = null) {
      if (!slotInfoMap || typeof slotInfoMap !== "object") {
        const len = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;
        return Array.from({ length: 7 }, () =>
          Array.from({ length: len }, () => ({
            courseCode: "",
            classroomNumber: "",
          }))
        );
      }

      // Determine number of slots
      let numSlots = 0;
      for (let day = 0; day < 7; day++) {
        const dayMap = slotInfoMap[day];
        if (dayMap && typeof dayMap === "object") {
          const indices = Object.keys(dayMap)
            .map((k) => parseInt(k, 10))
            .filter((n) => !isNaN(n));
          if (indices.length > 0) {
            numSlots = Math.max(numSlots, Math.max(...indices) + 1);
          }
        }
      }
      if (numSlots <= 0) {
        numSlots = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;
      }

      return Array.from({ length: 7 }, (_, i) =>
        Array.from({ length: numSlots }, (_, j) => {
          const entry = slotInfoMap?.[i]?.[j];
          return entry && typeof entry === "object"
            ? {
                courseCode: entry.courseCode || "",
                classroomNumber: entry.classroomNumber || "",
              }
            : { courseCode: "", classroomNumber: "" };
        })
      );
    },

    /**
     * Convert to HomePage format
     */
    convertToHomePageFormat(firestoreData, userId, userInfo = {}) {
      const studentId = userInfo.email?.split("@")[0] || "Unknown";
      const isSelf = userInfo.isSelf || false;

      const providedLen = firestoreData.timeSlots?.length || 0;

      return {
        users: {
          [userId]: {
            id: isSelf ? studentId : userId,
            name: isSelf ? "You" : "Friend",
            schedule: this.convertMapToScheduleArray(
              firestoreData.schedule,
              providedLen
            ),
            slotInfo: this.convertMapToSlotInfoArray(
              firestoreData.slotInfo,
              providedLen
            ),
            timeSlots: firestoreData.timeSlots || [],
            pinnedSlots: this.convertMapToScheduleArray(
              firestoreData.pinnedSlots
            ),
            timeBasedPins: firestoreData.timeBasedPins || {},
          },
        },
        savedAt: new Date().toISOString(),
      };
    },

    /**
     * Convert from HomePage format to Firestore format
     */
    convertToFirestoreFormat(homePageData, currentUserId) {
      const userData = homePageData.users?.[currentUserId];

      if (!userData) {
        return null;
      }

      return {
        schedule: userData.schedule || [],
        slotInfo: userData.slotInfo || [],
        timeSlots: userData.timeSlots || [],
        pinnedSlots: userData.pinnedSlots || [],
        timeBasedPins: userData.timeBasedPins || {},
      };
    },
  };

  /**
   * Offline queue manager
   */
  class OfflineQueueManager {
    constructor() {
      this.pendingSync = new Set();
      this.isOnline = true;
    }

    setOnlineStatus(status) {
      this.isOnline = status;
    }

    queueOperation(operation) {
      this.pendingSync.add({
        ...operation,
        timestamp: Date.now(),
      });
    }

    getPendingCount() {
      return this.pendingSync.size;
    }

    clearQueue() {
      this.pendingSync.clear();
    }

    getPendingOperations() {
      return Array.from(this.pendingSync);
    }

    removeOperation(operation) {
      // Find and remove by userId match
      for (const op of this.pendingSync) {
        if (
          op.userId === operation.userId &&
          op.timestamp === operation.timestamp
        ) {
          this.pendingSync.delete(op);
          return true;
        }
      }
      return false;
    }
  }

  /**
   * Service status tracker
   */
  class ServiceStatusTracker {
    constructor() {
      this.isOnline = true;
      this.isLoading = false;
      this.lastError = null;
      this.pendingOperations = 0;
      this.hasRealtimeListener = false;
    }

    setLoading(status) {
      this.isLoading = status;
    }

    setError(error) {
      this.lastError = error;
    }

    clearError() {
      this.lastError = null;
    }

    setOnline(status) {
      this.isOnline = status;
    }

    setPendingCount(count) {
      this.pendingOperations = count;
    }

    setRealtimeListener(hasListener) {
      this.hasRealtimeListener = hasListener;
    }

    getStatus() {
      return {
        isOnline: this.isOnline,
        isLoading: this.isLoading,
        lastError: this.lastError,
        pendingOperations: this.pendingOperations,
        hasRealtimeListener: this.hasRealtimeListener,
      };
    }
  }

  // ============================================
  // Cache Manager Tests
  // ============================================

  describe("Cache Management", () => {
    let cacheManager;

    beforeEach(() => {
      cacheManager = new ScheduleCacheManager();
    });

    test("should cache schedule data", () => {
      const userId = "user123";
      const scheduleData = {
        schedule: [
          [true, false],
          [false, true],
        ],
        timeSlots: ["8:00 AM", "9:00 AM"],
      };

      cacheManager.cacheScheduleData(userId, scheduleData);

      const cached = cacheManager.getCachedScheduleData(userId);
      expect(cached).toEqual(scheduleData);
    });

    test("should return null for non-existent cache", () => {
      const cached = cacheManager.getCachedScheduleData("nonexistent");
      expect(cached).toBeNull();
    });

    test("should overwrite existing cache", () => {
      const userId = "user123";
      const oldData = { schedule: [[true]] };
      const newData = { schedule: [[false]] };

      cacheManager.cacheScheduleData(userId, oldData);
      cacheManager.cacheScheduleData(userId, newData);

      const cached = cacheManager.getCachedScheduleData(userId);
      expect(cached).toEqual(newData);
    });

    test("should clear specific user cache", () => {
      cacheManager.cacheScheduleData("user1", { data: 1 });
      cacheManager.cacheScheduleData("user2", { data: 2 });

      cacheManager.clearCache("user1");

      expect(cacheManager.getCachedScheduleData("user1")).toBeNull();
      expect(cacheManager.getCachedScheduleData("user2")).toEqual({ data: 2 });
    });

    test("should clear all cache", () => {
      cacheManager.cacheScheduleData("user1", { data: 1 });
      cacheManager.cacheScheduleData("user2", { data: 2 });

      cacheManager.clearCache();

      expect(cacheManager.getCachedScheduleData("user1")).toBeNull();
      expect(cacheManager.getCachedScheduleData("user2")).toBeNull();
    });

    test("should track cache age", async () => {
      const userId = "user123";
      cacheManager.cacheScheduleData(userId, { data: "test" });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      const age = cacheManager.getCacheAge(userId);
      expect(age).toBeGreaterThanOrEqual(50);
    });

    test("should validate cache freshness", () => {
      const userId = "user123";
      cacheManager.cacheScheduleData(userId, { data: "test" });

      // Should be valid with default max age
      expect(cacheManager.isCacheValid(userId)).toBe(true);

      // Should be invalid with very short max age
      expect(cacheManager.isCacheValid(userId, 0)).toBe(false);
    });

    test("should return null age for non-existent cache", () => {
      expect(cacheManager.getCacheAge("nonexistent")).toBeNull();
    });

    test("should handle complex schedule data", () => {
      const userId = "user123";
      const complexData = {
        schedule: Array.from({ length: 7 }, () =>
          Array.from({ length: 10 }, () => Math.random() > 0.5)
        ),
        slotInfo: Array.from({ length: 7 }, () =>
          Array.from({ length: 10 }, () => ({
            courseCode: "CSE101",
            classroomNumber: "A101",
          }))
        ),
        timeSlots: ["8:00 AM", "9:00 AM", "10:00 AM"],
        timeBasedPins: { 0: [1, 2], 1: [3, 4] },
      };

      cacheManager.cacheScheduleData(userId, complexData);
      const cached = cacheManager.getCachedScheduleData(userId);

      expect(cached.schedule.length).toBe(7);
      expect(cached.slotInfo.length).toBe(7);
      expect(cached.timeBasedPins).toEqual({ 0: [1, 2], 1: [3, 4] });
    });
  });

  // ============================================
  // Format Conversion Tests
  // ============================================

  describe("Format Conversion", () => {
    describe("convertMapToScheduleArray", () => {
      test("should convert map to array", () => {
        const scheduleMap = {
          0: { 0: true, 1: false },
          1: { 0: false, 1: true },
        };

        const result = formatConverter.convertMapToScheduleArray(
          scheduleMap,
          2
        );

        expect(result[0]).toEqual([true, false]);
        expect(result[1]).toEqual([false, true]);
        expect(result.length).toBe(7);
      });

      test("should handle null/undefined input", () => {
        const result = formatConverter.convertMapToScheduleArray(null, 3);

        expect(result.length).toBe(7);
        expect(result[0].length).toBe(3);
        expect(result[0]).toEqual([false, false, false]);
      });

      test("should detect slot count from map", () => {
        const scheduleMap = {
          0: { 0: true, 4: true }, // Max index is 4, so 5 slots
        };

        const result = formatConverter.convertMapToScheduleArray(scheduleMap);

        expect(result[0].length).toBe(5);
        expect(result[0][0]).toBe(true);
        expect(result[0][4]).toBe(true);
      });

      test("should convert truthy values to boolean", () => {
        const scheduleMap = {
          0: { 0: 1, 1: "yes", 2: {} },
        };

        const result = formatConverter.convertMapToScheduleArray(
          scheduleMap,
          3
        );

        expect(result[0]).toEqual([true, true, true]);
      });
    });

    describe("convertMapToSlotInfoArray", () => {
      test("should convert slot info map to array", () => {
        const slotInfoMap = {
          0: {
            0: { courseCode: "CSE101", classroomNumber: "A101" },
            1: { courseCode: "MAT201", classroomNumber: "B202" },
          },
        };

        const result = formatConverter.convertMapToSlotInfoArray(
          slotInfoMap,
          2
        );

        expect(result[0][0]).toEqual({
          courseCode: "CSE101",
          classroomNumber: "A101",
        });
        expect(result[0][1]).toEqual({
          courseCode: "MAT201",
          classroomNumber: "B202",
        });
      });

      test("should handle null/undefined input", () => {
        const result = formatConverter.convertMapToSlotInfoArray(null, 2);

        expect(result.length).toBe(7);
        expect(result[0]).toEqual([
          { courseCode: "", classroomNumber: "" },
          { courseCode: "", classroomNumber: "" },
        ]);
      });

      test("should fill missing entries with defaults", () => {
        const slotInfoMap = {
          0: { 0: { courseCode: "CSE101" }, 1: null }, // Missing classroomNumber, index 1 is null
        };

        const result = formatConverter.convertMapToSlotInfoArray(
          slotInfoMap,
          2
        );

        expect(result[0][0]).toEqual({
          courseCode: "CSE101",
          classroomNumber: "",
        });
        expect(result[0][1]).toEqual({ courseCode: "", classroomNumber: "" });
      });

      test("should handle partial slot info objects", () => {
        const slotInfoMap = {
          0: {
            0: { classroomNumber: "A101" }, // Missing courseCode
          },
        };

        const result = formatConverter.convertMapToSlotInfoArray(
          slotInfoMap,
          1
        );

        expect(result[0][0]).toEqual({
          courseCode: "",
          classroomNumber: "A101",
        });
      });
    });

    describe("convertToHomePageFormat", () => {
      test("should convert Firestore data to HomePage format", () => {
        const firestoreData = {
          schedule: { 0: { 0: true } },
          slotInfo: {
            0: { 0: { courseCode: "CSE101", classroomNumber: "A101" } },
          },
          timeSlots: ["8:00 AM"],
          pinnedSlots: {},
          timeBasedPins: { 0: [1] },
        };

        const result = formatConverter.convertToHomePageFormat(
          firestoreData,
          "user123",
          { email: "john@example.com", isSelf: true }
        );

        expect(result.users["user123"]).toBeDefined();
        expect(result.users["user123"].id).toBe("john");
        expect(result.users["user123"].name).toBe("You");
        expect(result.users["user123"].timeSlots).toEqual(["8:00 AM"]);
        expect(result.savedAt).toBeDefined();
      });

      test("should format friend data differently", () => {
        const firestoreData = {
          schedule: {},
          slotInfo: {},
          timeSlots: [],
          pinnedSlots: {},
          timeBasedPins: {},
        };

        const result = formatConverter.convertToHomePageFormat(
          firestoreData,
          "friend123",
          { isSelf: false }
        );

        expect(result.users["friend123"].id).toBe("friend123");
        expect(result.users["friend123"].name).toBe("Friend");
      });
    });

    describe("convertToFirestoreFormat", () => {
      test("should convert HomePage data to Firestore format", () => {
        const homePageData = {
          users: {
            user123: {
              schedule: [[true, false]],
              slotInfo: [[{ courseCode: "CSE101", classroomNumber: "A101" }]],
              timeSlots: ["8:00 AM"],
              pinnedSlots: [[false]],
              timeBasedPins: { 0: [1] },
            },
          },
        };

        const result = formatConverter.convertToFirestoreFormat(
          homePageData,
          "user123"
        );

        expect(result.schedule).toEqual([[true, false]]);
        expect(result.slotInfo).toEqual([
          [{ courseCode: "CSE101", classroomNumber: "A101" }],
        ]);
        expect(result.timeSlots).toEqual(["8:00 AM"]);
      });

      test("should return null for missing user data", () => {
        const homePageData = {
          users: {},
        };

        const result = formatConverter.convertToFirestoreFormat(
          homePageData,
          "user123"
        );

        expect(result).toBeNull();
      });

      test("should handle missing properties gracefully", () => {
        const homePageData = {
          users: {
            user123: {
              schedule: [[true]],
              // Missing other properties
            },
          },
        };

        const result = formatConverter.convertToFirestoreFormat(
          homePageData,
          "user123"
        );

        expect(result.schedule).toEqual([[true]]);
        expect(result.slotInfo).toEqual([]);
        expect(result.timeSlots).toEqual([]);
        expect(result.pinnedSlots).toEqual([]);
        expect(result.timeBasedPins).toEqual({});
      });
    });
  });

  // ============================================
  // Offline Queue Tests
  // ============================================

  describe("Offline Queue Management", () => {
    let queueManager;

    beforeEach(() => {
      queueManager = new OfflineQueueManager();
    });

    test("should queue operations", () => {
      queueManager.queueOperation({
        userId: "user123",
        scheduleData: { schedule: [[true]] },
      });

      expect(queueManager.getPendingCount()).toBe(1);
    });

    test("should track multiple operations", () => {
      queueManager.queueOperation({ userId: "user1", scheduleData: {} });
      queueManager.queueOperation({ userId: "user2", scheduleData: {} });
      queueManager.queueOperation({ userId: "user3", scheduleData: {} });

      expect(queueManager.getPendingCount()).toBe(3);
    });

    test("should clear queue", () => {
      queueManager.queueOperation({ userId: "user1", scheduleData: {} });
      queueManager.queueOperation({ userId: "user2", scheduleData: {} });

      queueManager.clearQueue();

      expect(queueManager.getPendingCount()).toBe(0);
    });

    test("should get pending operations", () => {
      const op1 = { userId: "user1", scheduleData: { data: 1 } };
      const op2 = { userId: "user2", scheduleData: { data: 2 } };

      queueManager.queueOperation(op1);
      queueManager.queueOperation(op2);

      const operations = queueManager.getPendingOperations();

      expect(operations.length).toBe(2);
      expect(operations[0].userId).toBe("user1");
      expect(operations[1].userId).toBe("user2");
    });

    test("should add timestamp to operations", () => {
      const beforeTime = Date.now();
      queueManager.queueOperation({ userId: "user1", scheduleData: {} });
      const afterTime = Date.now();

      const operations = queueManager.getPendingOperations();

      expect(operations[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(operations[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    test("should track online status", () => {
      expect(queueManager.isOnline).toBe(true);

      queueManager.setOnlineStatus(false);
      expect(queueManager.isOnline).toBe(false);

      queueManager.setOnlineStatus(true);
      expect(queueManager.isOnline).toBe(true);
    });
  });

  // ============================================
  // Service Status Tests
  // ============================================

  describe("Service Status", () => {
    let statusTracker;

    beforeEach(() => {
      statusTracker = new ServiceStatusTracker();
    });

    test("should return initial status", () => {
      const status = statusTracker.getStatus();

      expect(status.isOnline).toBe(true);
      expect(status.isLoading).toBe(false);
      expect(status.lastError).toBeNull();
      expect(status.pendingOperations).toBe(0);
      expect(status.hasRealtimeListener).toBe(false);
    });

    test("should track loading state", () => {
      statusTracker.setLoading(true);
      expect(statusTracker.getStatus().isLoading).toBe(true);

      statusTracker.setLoading(false);
      expect(statusTracker.getStatus().isLoading).toBe(false);
    });

    test("should track errors", () => {
      statusTracker.setError("Connection failed");
      expect(statusTracker.getStatus().lastError).toBe("Connection failed");

      statusTracker.clearError();
      expect(statusTracker.getStatus().lastError).toBeNull();
    });

    test("should track online status", () => {
      statusTracker.setOnline(false);
      expect(statusTracker.getStatus().isOnline).toBe(false);

      statusTracker.setOnline(true);
      expect(statusTracker.getStatus().isOnline).toBe(true);
    });

    test("should track pending operations count", () => {
      statusTracker.setPendingCount(5);
      expect(statusTracker.getStatus().pendingOperations).toBe(5);

      statusTracker.setPendingCount(0);
      expect(statusTracker.getStatus().pendingOperations).toBe(0);
    });

    test("should track realtime listener status", () => {
      statusTracker.setRealtimeListener(true);
      expect(statusTracker.getStatus().hasRealtimeListener).toBe(true);

      statusTracker.setRealtimeListener(false);
      expect(statusTracker.getStatus().hasRealtimeListener).toBe(false);
    });

    test("should return complete status object", () => {
      statusTracker.setOnline(false);
      statusTracker.setLoading(true);
      statusTracker.setError("Test error");
      statusTracker.setPendingCount(3);
      statusTracker.setRealtimeListener(true);

      const status = statusTracker.getStatus();

      expect(status).toEqual({
        isOnline: false,
        isLoading: true,
        lastError: "Test error",
        pendingOperations: 3,
        hasRealtimeListener: true,
      });
    });
  });

  // ============================================
  // Data Integrity Tests
  // ============================================

  describe("Data Integrity", () => {
    test("should preserve schedule data through cache cycle", () => {
      const cacheManager = new ScheduleCacheManager();
      const originalData = {
        schedule: [
          [true, false, true, false, true],
          [false, true, false, true, false],
          [true, true, true, true, true],
          [false, false, false, false, false],
          [true, false, true, false, true],
          [false, true, false, true, false],
          [true, true, false, false, true],
        ],
        slotInfo: Array.from({ length: 7 }, () =>
          Array.from({ length: 5 }, (_, i) => ({
            courseCode: `CSE${100 + i}`,
            classroomNumber: `Room ${i + 1}`,
          }))
        ),
        timeSlots: ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM"],
        timeBasedPins: { 0: [0, 2], 1: [1], 2: [3, 4] },
      };

      cacheManager.cacheScheduleData("user123", originalData);
      const retrievedData = cacheManager.getCachedScheduleData("user123");

      expect(retrievedData).toEqual(originalData);
    });

    test("should preserve data through format conversion round-trip", () => {
      const firestoreData = {
        schedule: {
          0: { 0: true, 2: true },
          1: { 1: true, 3: true },
        },
        slotInfo: {
          0: {
            0: { courseCode: "CSE101", classroomNumber: "A101" },
            2: { courseCode: "MAT201", classroomNumber: "B201" },
          },
        },
        timeSlots: ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM"],
        pinnedSlots: {},
        timeBasedPins: { 0: [1, 2] },
      };

      const homePageFormat = formatConverter.convertToHomePageFormat(
        firestoreData,
        "user123",
        { email: "test@example.com", isSelf: true }
      );

      const backToFirestore = formatConverter.convertToFirestoreFormat(
        homePageFormat,
        "user123"
      );

      // Schedule arrays should have same true values
      expect(backToFirestore.schedule[0][0]).toBe(true);
      expect(backToFirestore.schedule[0][2]).toBe(true);
      expect(backToFirestore.schedule[1][1]).toBe(true);
      expect(backToFirestore.schedule[1][3]).toBe(true);

      // Time slots should be preserved
      expect(backToFirestore.timeSlots).toEqual(firestoreData.timeSlots);

      // Time based pins should be preserved
      expect(backToFirestore.timeBasedPins).toEqual(
        firestoreData.timeBasedPins
      );
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("Edge Cases", () => {
    test("should handle empty schedule data", () => {
      const emptyData = {
        schedule: {},
        slotInfo: {},
        timeSlots: [],
        pinnedSlots: {},
        timeBasedPins: {},
      };

      const result = formatConverter.convertToHomePageFormat(
        emptyData,
        "user123",
        {}
      );

      expect(result.users["user123"].schedule.length).toBe(7);
      expect(result.users["user123"].timeSlots).toEqual([]);
    });

    test("should handle sparse schedule maps", () => {
      const sparseMap = {
        3: { 5: true },
        6: { 9: true },
      };

      const result = formatConverter.convertMapToScheduleArray(sparseMap);

      // Should detect max index and create appropriate size
      expect(result[3][5]).toBe(true);
      expect(result[6][9]).toBe(true);
      expect(result[0][0]).toBe(false);
    });

    test("should handle very large slot counts", () => {
      const largeSchedule = {
        0: {},
      };
      for (let i = 0; i < 20; i++) {
        largeSchedule[0][i] = i % 2 === 0;
      }

      const result = formatConverter.convertMapToScheduleArray(largeSchedule);

      expect(result[0].length).toBe(20);
      expect(result[0][0]).toBe(true);
      expect(result[0][1]).toBe(false);
      expect(result[0][18]).toBe(true);
      expect(result[0][19]).toBe(false);
    });

    test("should handle special characters in course codes", () => {
      const slotInfoMap = {
        0: {
          0: { courseCode: "CSE-101/A", classroomNumber: "Room #1 (New)" },
        },
      };

      const result = formatConverter.convertMapToSlotInfoArray(slotInfoMap, 1);

      expect(result[0][0].courseCode).toBe("CSE-101/A");
      expect(result[0][0].classroomNumber).toBe("Room #1 (New)");
    });

    test("should handle unicode in data", () => {
      const cacheManager = new ScheduleCacheManager();
      const dataWithUnicode = {
        schedule: [[true]],
        notes: "📚 Study time! こんにちは",
      };

      cacheManager.cacheScheduleData("user123", dataWithUnicode);
      const cached = cacheManager.getCachedScheduleData("user123");

      expect(cached.notes).toBe("📚 Study time! こんにちは");
    });
  });
});
