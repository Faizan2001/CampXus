/**
 * =============================================================================
 *                        SCHEDULE STORAGE SERVICE
 *                    Phase-1 Schedule Storage Foundation
 * =============================================================================
 *
 * This service handles the dual storage strategy for user schedules:
 * - Firestore as primary storage with real-time sync
 * - localStorage as cache for instant UI updates
 * - Cross-device synchronization with conflict resolution
 *
 * Features:
 * - Dual storage (Firestore + localStorage)
 * - Real-time sync across devices
 * - Last-modified-wins conflict resolution
 * - Background sync with notifications
 * - Offline detection and queuing
 *
 * Architecture follows project patterns:
 * - Service-oriented design (like DataService.js, AuthService.js)
 * - Proper separation of concerns from HomePage.js
 * - Integration with existing notification system
 *
 * =============================================================================
 */

import { dataManager } from "../data/DataService.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../realtime/RealtimeService.js";
import { currentUser } from "../../store/userStore.js";
import { DEFAULT_TIMESLOTS } from "../../utils/constants.js";
import { normalizeCourseForSave } from "../../utils/schedule/courseNormalization.js";

/**
 * Phase-1 Schedule Storage Service
 * Handles dual storage strategy with real-time sync
 */
export class ScheduleStorageService {
  constructor() {
    this.dataManager = dataManager;
    this.isOnline = navigator.onLine;
    this.pendingSync = new Set(); // Track offline operations
    this.realtimeListener = null;
    this.isLoading = false;
    this.lastError = null;

    // Setup online/offline detection
    this.setupOfflineDetection();
  }

  /**
   * Load user's schedule with dual strategy
   * Flow: Firestore (primary) → localStorage (cache) → return
   * @param {string} userId - User ID to load schedule for
   * @returns {Promise<Object|null>} Schedule data or null
   */
  async loadUserSchedule(userId, { mode = "cache-first" } = {}) {
    this.isLoading = true;
    this.lastError = null;

    try {
      const revalidatePromise = this._loadFromFirestoreAndMaybeInitDefaults(
        userId
      ).then((fresh) => {
        if (fresh) this.cacheScheduleData(userId, fresh);
        return fresh;
      });

      if (mode === "cache-first") {
        const cached = this.getCachedScheduleData(userId);
        if (cached) {
          console.log("📱 Schedule loaded from localStorage cache (instant)");
          // Kick off background refresh; swallow errors
          revalidatePromise.catch(() => {});
          return { data: cached, source: "cache", revalidatePromise };
        }
      }

      // Network-first (or cache miss)
      const scheduleData = await revalidatePromise;
      return { data: scheduleData, source: "network", revalidatePromise };
    } catch (error) {
      console.error("❌ Failed to load schedule:", error);
      this.lastError = error.message;
      return { data: null, source: "error", revalidatePromise: null };
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Internal helper: load from Firestore and apply default slot initialization.
   * @private
   */
  async _loadFromFirestoreAndMaybeInitDefaults(userId) {
    let scheduleData = null;

    // Try Firestore first (if online)
    if (this.isOnline) {
      try {
        scheduleData = await this.dataManager.getUserSchedule(userId);

        if (scheduleData) {
          console.log("✅ Schedule loaded from Firestore and cached");
        }
      } catch (error) {
        console.warn("⚠️ Firestore load failed:", error.message);

        // Categorize error types for better handling
        if (error.code === "permission-denied") {
          this.lastError = "Access denied. Please check your authentication.";
          console.error("Schedule access denied - Authentication Error");
        } else if (error.code === "unavailable") {
          this.lastError =
            "Firestore temporarily unavailable. Using cached data.";
          console.warn("Using offline schedule data - Connection Issue");
        } else {
          this.lastError = `Firestore error: ${error.message}`;
        }
      }
    }

    // Fallback to localStorage cache when offline or Firestore failed
    if (!scheduleData) {
      scheduleData = this.getCachedScheduleData(userId);
      if (scheduleData) {
        console.log("📱 Schedule loaded from localStorage cache (offline/failed)");
      }
    }

    // Initialize default timeSlots for IUB users (first load) when none exist
    try {
      const selfUser = currentUser.user;
      const isCurrent = selfUser && userId === selfUser.uid;
      const email = (selfUser?.email || "").toLowerCase();
      const profileUni = (currentUser?.profile?.universityInfo?.university || "").toLowerCase();
      const isIub = email.endsWith("@iub.edu.bd") || profileUni === "iub";

      if (isCurrent && isIub) {
        const hasNoTimeSlots = !scheduleData || !Array.isArray(scheduleData.timeSlots) || scheduleData.timeSlots.length === 0;
        if (hasNoTimeSlots) {
          console.log("🧭 Initializing IUB default time slots for current user");
          const defaultSlots = DEFAULT_TIMESLOTS;
          const slotsLen = defaultSlots.length;
          // Always create fresh matrices sized to default slots
          const buildMatrix = (fillObj = false) =>
            Array.from({ length: 7 }, () =>
              Array.from({ length: slotsLen }, () =>
                fillObj ? { courseCode: "", classroomNumber: "" } : false
              )
            );

          const updated = {
            schedule: buildMatrix(false),
            slotInfo: buildMatrix(true),
            pinnedSlots: buildMatrix(false),
            timeBasedPins:
              scheduleData?.timeBasedPins || { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
            timeSlots: defaultSlots,
            metadata: scheduleData?.metadata || {},
          };

          // Persist to Firestore and cache
          await this.saveUserSchedule(userId, updated);
          this.cacheScheduleData(userId, updated);
          scheduleData = updated;
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed to initialize default time slots:", e);
    }

    return scheduleData;
  }

  /**
   * Save user's schedule with dual strategy
   * Flow: localStorage (instant) → Firestore (background) → notification
   * @param {string} userId - User ID
   * @param {Object} scheduleData - Schedule data in HomePage format
   * @returns {Promise<boolean>} Success status
   */
  async saveUserSchedule(userId, scheduleData) {
    try {
      // 1. Prepare payload with preserved metadata and cache for immediate UI response
      const previous = currentUser?.scheduleData || this.getCachedScheduleData(userId);
      const existingMetadata = previous?.metadata || null;
      const scheduleForSave = existingMetadata
        ? { ...scheduleData, metadata: existingMetadata }
        : scheduleData;

      this.cacheScheduleData(userId, scheduleForSave);
      console.log("💾 Schedule saved to localStorage cache");

      // 2. Background Firestore sync
      if (this.isOnline) {
        try {

          await this.dataManager.saveUserSchedule(
            userId,
            scheduleForSave,
            currentUser.uid
          );
          console.log("☁️ Schedule synced to Firestore");

          // ✅ Also persist normalized courses[] for grouping (only when provided)
          try {
            const hasCoursesField = Object.prototype.hasOwnProperty.call(
              scheduleForSave || {},
              "courses"
            );
            if (!hasCoursesField) {
              console.log("ℹ️ No courses field on schedule save (skipping users.courses)");
            } else {
              const rawCourses = Array.isArray(scheduleForSave?.courses)
                ? scheduleForSave.courses
                : [];
              const normalized = rawCourses
                .map((c) => normalizeCourseForSave(c))
                .filter(Boolean)
                .filter(
                  (c) =>
                    c &&
                    c.section > 0 &&
                    c.dayPattern &&
                    c.timeSlot &&
                    c.classroom &&
                    c.classroom !== "" &&
                    !/^(ONLINE|TBA|NA|NONE)$/i.test(c.classroom)
                );

              // Always write (even empty) to avoid stale class-space memberships based on old courses.
              await this.dataManager.updateUserCourses(userId, normalized);
              console.log(
                "📘 users.courses updated (normalized)",
                normalized.length
              );
            }
          } catch (e) {
            console.warn("⚠️ Failed to update users.courses (non-blocking)", e);
          }
        } catch (error) {
          console.error("⚠️ Firestore sync failed:", error);
          // Queue for offline sync
          this.pendingSync.add({ userId, scheduleData, timestamp: Date.now() });
          console.warn(
            "Offline: Schedule changes saved locally and will sync when online."
          );
        }
      } else {
        // Queue for when back online
        this.pendingSync.add({ userId, scheduleData, timestamp: Date.now() });
        console.warn(
          "Offline: Schedule changes saved locally and will sync when online."
        );
        console.log("📱 Schedule queued for sync when online");
      }

      return true;
    } catch (error) {
      console.error("❌ Failed to save schedule:", error);
      this.lastError = error.message;
      return false;
    }
  }

  /**
   * Setup real-time sync listener for cross-device updates
   * Uses centralized RealtimeService for proper event coordination
   * @param {string} userId - User ID to listen for
   * @param {Function} callback - Called when schedule updates
   * @returns {Function} Unsubscribe function
   */
  setupRealtimeSync(userId, callback) {
    // Clean up existing listener
    if (this.realtimeListener) {
      this.realtimeListener();
      this.realtimeListener = null;
    }

    // Subscribe to centralized real-time events (senior developer pattern)
    this.realtimeListener = realTimeManager.on(
      REALTIME_EVENTS.USER_SCHEDULE,
      (scheduleData) => {
        // Update cache with real-time data
        this.cacheScheduleData(userId, scheduleData);

        // Notify UI of update
        if (callback) {
          callback(scheduleData);
        }

        // Real-time schedule update received via RealtimeService
      }
    );

    // Ensure RealtimeService is listening for this user
    if (
      !realTimeManager.isListening ||
      realTimeManager.currentUserId !== userId
    ) {
      // Starting RealtimeService for schedule sync
      realTimeManager.startListening(userId);
    }

    return this.realtimeListener;
  }

  /**
   * Convert HomePage schedule format to Firestore format
   * @param {Object} homePageData - Data from HomePage.js
   * @returns {Object} Firestore-compatible format
   */
  convertToFirestoreFormat(homePageData) {
    const currentUserId = currentUser.uid;
    const userData = homePageData.users[currentUserId];

    if (!userData) {
      console.warn("No user data found for current user");
      return null;
    }

    return {
      schedule: userData.schedule || [],
      slotInfo: userData.slotInfo || [],
      timeSlots: userData.timeSlots || [],
      pinnedSlots: userData.pinnedSlots || [],
      timeBasedPins: userData.timeBasedPins || {},
    };
  }

  /**
   * Convert Firestore format to HomePage format
   * @param {Object} firestoreData - Data from Firestore
   * @param {string} userId - User ID
   * @returns {Object} HomePage-compatible format
   */
  convertToHomePageFormat(firestoreData, userId) {
    const user = currentUser.user;
    const studentId = user?.email?.split("@")[0] || "Unknown";

    const email = (user?.email || "").toLowerCase();
    const profileUni = (currentUser?.profile?.universityInfo?.university || "").toLowerCase();
    const isCurrent = user && userId === user.uid;
    const isIub = isCurrent && (email.endsWith("@iub.edu.bd") || profileUni === "iub");

    const providedLen =
      firestoreData.timeSlots && firestoreData.timeSlots.length > 0
        ? firestoreData.timeSlots.length
        : isIub
        ? DEFAULT_TIMESLOTS.length
        : 0;

    return {
      users: {
        [userId]: {
          id: userId === currentUser.uid ? studentId : userId,
          name: userId === currentUser.uid ? "You" : "Friend",
          schedule: this._convertMapToScheduleArray(
            firestoreData.schedule,
            providedLen
          ),
          slotInfo: this._convertMapToSlotInfoArray(
            firestoreData.slotInfo,
            providedLen
          ),
          timeSlots:
            firestoreData.timeSlots && firestoreData.timeSlots.length > 0
              ? firestoreData.timeSlots
              : isIub
              ? DEFAULT_TIMESLOTS
              : [],
          pinnedSlots: this._convertMapToScheduleArray(
            firestoreData.pinnedSlots
          ),
          timeBasedPins: firestoreData.timeBasedPins || {},
        },
      },
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Cache schedule data in localStorage
   * @param {string} userId - User ID
   * @param {Object} scheduleData - Schedule data to cache
   */
  cacheScheduleData(userId, scheduleData) {
    try {
      const cacheKey = `schedule_${userId}`;
      const cacheData = {
        data: scheduleData,
        cachedAt: Date.now(),
        userId: userId,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn("Failed to cache schedule data:", error);
    }
  }

  /**
   * Get cached schedule data from localStorage
   * @param {string} userId - User ID
   * @returns {Object|null} Cached schedule data or null
   */
  getCachedScheduleData(userId) {
    try {
      const cacheKey = `schedule_${userId}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        const cacheData = JSON.parse(cached);
        return cacheData.data;
      }
    } catch (error) {
      console.warn("Failed to get cached schedule data:", error);
    }
    return null;
  }

  _convertMapToScheduleArray(scheduleMap, desiredSlotsLen = null) {
    if (!scheduleMap || typeof scheduleMap !== "object") {
      const len = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;
      return Array.from({ length: 7 }, () => Array.from({ length: len }, () => false));
    }
    // Determine number of slots by scanning provided map (fallback to provided len or 0)
    let numSlots = 0;
    for (let day = 0; day < 7; day++) {
      const dayMap = scheduleMap[day];
      if (dayMap && typeof dayMap === "object") {
        const indices = Object.keys(dayMap).map((k) => parseInt(k, 10)).filter((n) => !isNaN(n));
        if (indices.length > 0) numSlots = Math.max(numSlots, Math.max(...indices) + 1);
      }
    }
    if (numSlots <= 0) numSlots = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;

    const scheduleArray = Array.from({ length: 7 }, (_, i) =>
      Array.from({ length: numSlots }, (_, j) => Boolean(scheduleMap?.[i]?.[j] || false))
    );
    return scheduleArray;
  }

  _convertMapToSlotInfoArray(slotInfoMap, desiredSlotsLen = null) {
    // Build a 7xN matrix with unique objects to avoid shared references
    if (!slotInfoMap || typeof slotInfoMap !== "object") {
      const len = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;
      return Array.from({ length: 7 }, () =>
        Array.from({ length: len }, () => ({ courseCode: "", classroomNumber: "" }))
      );
    }

    // Determine number of slots by scanning provided map (fallback to provided len or 0)
    let numSlots = 0;
    for (let day = 0; day < 7; day++) {
      const dayMap = slotInfoMap[day];
      if (dayMap && typeof dayMap === "object") {
        const indices = Object.keys(dayMap).map((k) => parseInt(k, 10)).filter((n) => !isNaN(n));
        if (indices.length > 0) numSlots = Math.max(numSlots, Math.max(...indices) + 1);
      }
    }
    if (numSlots <= 0) numSlots = typeof desiredSlotsLen === "number" ? desiredSlotsLen : 0;

    const slotInfoArray = Array.from({ length: 7 }, (_, i) =>
      Array.from({ length: numSlots }, (_, j) => {
        const entry = slotInfoMap?.[i]?.[j];
        return entry && typeof entry === "object"
          ? { courseCode: entry.courseCode || "", classroomNumber: entry.classroomNumber || "" }
          : { courseCode: "", classroomNumber: "" };
      })
    );
    return slotInfoArray;
  }

  /**
   * Setup online/offline detection and sync handling
   */
  setupOfflineDetection() {
    // Track online status
    window.addEventListener("online", () => {
      console.log("🌐 Back online - syncing pending changes");
      this.isOnline = true;
      this.syncPendingOperations();
    });

    window.addEventListener("offline", () => {
      console.log("📱 Gone offline - queueing changes");
      this.isOnline = false;
    });
  }

  /**
   * Sync pending operations when back online
   */
  async syncPendingOperations() {
    if (this.pendingSync.size === 0) return;

    console.log(`📤 Syncing ${this.pendingSync.size} pending operations`);

    for (const operation of this.pendingSync) {
      try {
        await this.dataManager.saveUserSchedule(
          operation.userId,
          operation.scheduleData,
          currentUser.uid
        );

        // Remove from pending after successful sync
        this.pendingSync.delete(operation);

        console.log("✅ Synced pending operation for user:", operation.userId);
      } catch (error) {
        console.error("❌ Failed to sync pending operation:", error);
        // Keep in pending set for retry
      }
    }

    if (this.pendingSync.size === 0) {
      console.log("✅ All offline changes synced");
    }
  }

  /**
   * Get current service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      isLoading: this.isLoading,
      lastError: this.lastError,
      pendingOperations: this.pendingSync.size,
      hasRealtimeListener: !!this.realtimeListener,
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.realtimeListener) {
      this.realtimeListener();
      this.realtimeListener = null;
    }

    this.pendingSync.clear();
    console.log("🧹 ScheduleStorageService cleaned up");
  }
}

// Export singleton instance for use across the app
export const scheduleStorageService = new ScheduleStorageService();
export default scheduleStorageService;
