/**
 * =============================================================================
 *                        MEETCHUTHERE DATA MANAGER
 * =============================================================================
 *
 * Centralized data management system for all user and schedule data.
 *
 * Why use this? It keeps your code clean, consistent, and makes offline support easy!
 *
 * --- HOW TO USE ---
 * 1. Import the singleton instance:
 *    import { dataManager } from "../data/DataService.js";
 * 2. Call the methods you need (see examples below).
 *
 * --- EXAMPLES ---
 *   // Get a user's full profile:
 *   const profile = await dataManager.getUserProfile(userId);
 *
 *   // Save/update a user's profile:
 *   const result = await dataManager.saveUserProfile(userId, profileData);
 *   // if (result.success) {
 *   //   // success!
 *   // }
 *
 *   // Save avatar config only:
 *   await dataManager.saveAvatarConfig(userId, avatarConfig);
 *
 *   // Get just the minimal info for a dropdown:
 *   const mini = await dataManager.getUserProfileMinimal(userId);
 *
 *   // Unfriend a user (automatically removes from QuickAccess):
 *   await dataManager.deleteFriendship(friendshipId);
 *
 *   // Save a user's schedule:
 *   await dataManager.saveUserSchedule(userId, scheduleData);
 *
 *   // Get a user's schedule:
 *   const sched = await dataManager.getUserSchedule(userId);
 *
 *   // Update last active timestamp:
 *   await dataManager.updateUserLastActive(userId);
 *
 *   // Clear all cached data (e.g. on sign out):
 *   dataManager.clearCache();
 *
 * ---
 * All methods return Promises. Always use await or .then().
 *
 * ---
 *
 * See each function below for more details and examples!
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc, // ← Added for deleting documents
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  addDoc, // ← Added for creating documents with auto-generated IDs
  onSnapshot, // ← Added for real-time listeners
  orderBy,
  limit,
  writeBatch, // ← Added for batch operations
} from "firebase/firestore";
import { db } from "../../lib/firebase/firebase-config.js";
import { auth } from "../../lib/firebase/firebase-config.js";
import { avatarManager } from "../../utils/avatar/avatarManager.js";
import { getAvatarUrl } from "../../utils/avatar/avatarUtils.js";
import { logManager } from "../../utils/debug/LogManager.js";
import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../realtime/NotificationService.js";

// Common field paths for queries
export const FIELD_PATHS = {
  // Profile fields
  FIRST_NAME: "profile.firstName",
  LAST_NAME: "profile.lastName",
  BIO: "profile.bio",
  MAJOR: "profile.major",
  STARTING_YEAR: "profile.startingYear",
  EMAIL: "profile.email",
  // DISPLAY_NAME deprecated – handle is canonical

  // University fields
  UNIVERSITY: "universityInfo.university",
  UNIVERSITY_NAME: "universityInfo.universityName",
  STUDENT_ID: "universityInfo.studentId",

  // System fields
  PROFILE_COMPLETE: "systemInfo.profileSetupComplete",
  STATUS: "systemInfo.status",
  LAST_ACTIVE: "systemInfo.lastActive",
  CREATED_AT: "systemInfo.createdAt",

  // Location fields
  LOCATION_SHARING_ENABLED: "systemInfo.locationSharingEnabled",
  LAST_KNOWN_LOCATION: "systemInfo.lastKnownLocation",
  LOCATION_PRIVACY_LEVEL: "socialInfo.locationPrivacyLevel",
};

/**
 * =============================================================================
 *                          DATA MANAGER - Firestore Operations
 * =============================================================================
 *
 * This section contains all direct interactions with the Firestore database.
 * Each function is designed to be a single, reusable unit for data retrieval
 * or modification. This separation of concerns makes the code easier to
 * maintain, test, and debug.
 *
 * Key principles:
 *   - **Atomicity**: Operations should be as small and focused as possible.
 *   - **Reusability**: Functions should be generic enough to be used in
 *     multiple contexts.
 *   - **Error Handling**: Each function includes robust try-catch blocks to
 *     handle Firestore-specific errors gracefully.
 *   - **Caching**: The DataManager leverages a caching layer to reduce
 *     unnecessary database reads and improve performance.
 *
 * 🎓 Learning: This is a practical application of the "Repository Pattern,"
 * where we abstract the data source (Firestore) from the business logic
 * of the application. The rest of the app doesn't need to know HOW the
 * data is stored, only that it can be retrieved or saved through this manager.
 *
 */

class DataManager {
  constructor() {
    // Network status tracking
    this.isOnline = navigator.onLine;
    this.pendingOperations = [];
    this.retryTimeout = null;
    this.maxRetries = 3;

    // Cache settings with size management
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 100; // Maximum number of cached items
    this.lastSyncTime = null;

    // Performance optimizations
    this.syncDebounceMap = new Map(); // userId -> timeout
    this.quickAccessUpdateInProgress = new Set(); // Track ongoing Quick Access updates
    this.profileChangeThrottle = new Map(); // userId -> lastProcessTime

    // Initialize
    this.removeLegacyOfflineBanners(); // Clean up any existing banners first
    this.setupNetworkListeners();
    this.setupCacheCleanup();

    // ⚡ OPTIMIZATION: Track which userIds have confirmed systemInfo object to avoid repeated reads
    this._systemInfoEnsured = new Set();
    // ⚡ FRIENDSHIP DOC CACHE (reduces repeated reads during presence refresh bursts)
    this._friendshipCache = new Map(); // key -> {data, expiry}
    this._friendshipCacheTTL = 60000; // 60s
  }

  // =========================
  // FCM TOKEN MANAGEMENT
  // =========================

  /**
   * Save or update an FCM token under users/{uid}/fcmTokens/{token}
   * @param {string} userId
   * @param {string} token
   * @param {Object} meta
   */
  async saveFcmToken(userId, token, meta = {}) {
    try {
      if (!userId || !token) return { success: false, error: "Missing uid or token" };
      const tokenRef = doc(db, "users", userId, "fcmTokens", token);
      await setDoc(
        tokenRef,
        {
          token,
          platform: meta.platform || (/(iphone|ipad|ipod|ios)/i.test(navigator.userAgent) ? "ios" : (/android/i.test(navigator.userAgent) ? "android" : "web")),
          userAgent: meta.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "unknown"),
          appVersion: meta.appVersion || null,
          // Persist PWA/device metadata for dedupe + analytics
          isPWA: meta.isPWA === true, // store explicit boolean
          deviceKey: meta.deviceKey || null,
          createdAt: meta.createdAt || serverTimestamp(), // do not overwrite existing createdAt due to merge
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { success: true };
    } catch (error) {
      console.error("❌ Failed to save FCM token:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete an FCM token document users/{uid}/fcmTokens/{token}
   * @param {string} userId
   * @param {string} token
   */
  async deleteFcmToken(userId, token) {
    try {
      if (!userId || !token) return { success: false, error: "Missing uid or token" };
      const tokenRef = doc(db, "users", userId, "fcmTokens", token);
      await deleteDoc(tokenRef);
      return { success: true };
    } catch (error) {
      console.error("❌ Failed to delete FCM token:", error);
      return { success: false, error: error.message };
    }
  }

  // =========================
  // NETWORK & CACHE HELPERS
  // =========================

  /**
   * Set up automatic cache cleanup to prevent memory leaks
   * @private
   */
  setupCacheCleanup() {
    // Clean up expired cache entries every 10 minutes (reduced frequency for performance)
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupExpiredCacheEntries();
    }, 10 * 60 * 1000);

    logManager.system.cleanup(
      "Cache cleanup interval started (every 10 minutes)"
    );
  }

  /**
   * Clean up expired cache entries proactively
   * @private
   */
  cleanupExpiredCacheEntries() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiry) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logManager.system.cleanup(
        `Cleaned up ${cleanedCount} expired cache entries`
      );
    }
  }

  /**
   * Set up network status listeners
   * @private
   */
  setupNetworkListeners() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.showNotification("Back online! Syncing changes...", "success", {
        duration: 3000,
      });
      this.processPendingOperations();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.showNotification(
        "You're offline. Changes will be saved locally and synced when you reconnect.",
        "warning",
        { duration: 5000 }
      );
    });
  }

  /**
   * Process operations that were queued while offline with retry logic
   * @private
   */
  async processPendingOperations() {
    if (!this.isOnline || this.pendingOperations.length === 0) return;

    console.log(
      `🔄 Processing ${this.pendingOperations.length} pending operations...`
    );
    this.lastSyncTime = Date.now();

    const operations = [...this.pendingOperations]; // Copy to avoid mutation during processing
    this.pendingOperations = []; // Clear original array

    for (const operation of operations) {
      try {
        await this.retryOperation(operation);
      } catch (error) {
        console.error(
          "Failed to process pending operation after retries:",
          error
        );
        // Re-queue failed operations
        this.pendingOperations.push(operation);
      }
    }

    if (this.pendingOperations.length === 0) {
      this.showNotification("All changes synced successfully", "success");
    } else {
      this.showNotification(
        `${this.pendingOperations.length} operations still pending`,
        "warning"
      );
    }
  }

  /**
   * Retry an operation with exponential backoff
   * @private
   */
  async retryOperation(operation, attempt = 1) {
    try {
      await operation();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Cap at 10 seconds
      console.log(
        `⏳ Retrying operation in ${delay}ms (attempt ${attempt}/${this.maxRetries})`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryOperation(operation, attempt + 1);
    }
  }

  /**
   * Cache data with expiration and size management
   * @private
   */
  setCachedData(key, data) {
    // Clean up expired entries before adding new ones (more efficient than size-based cleanup)
    if (Math.random() < 0.05) {
      // 5% chance to run cleanup on each cache set
      this.cleanupExpiredCacheEntries();
    }

    // Remove oldest entries if cache is still too large after cleanup
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiry: Date.now() + this.cacheExpiry,
    });
  }

  /**
   * Get data from cache if available and not expired
   * @private
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    this.cache.delete(key); // Remove expired entry
    return null;
  }

  /**
   * Clear the entire cache
   */
  clearCache() {
    this.cache.clear();
    logManager.system.cleanup("Cache cleared.");
  }

  /**
   * ⚡ Debounced cache sync to prevent excessive operations
   * @param {string} userId - User ID to sync cache for
   */
  debounceCacheSync(userId) {
    // Clear existing timeout for this user
    if (this.syncDebounceMap.has(userId)) {
      clearTimeout(this.syncDebounceMap.get(userId));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      syncUserDataCache(userId).catch((error) =>
        logManager.network.error("Friend cache sync failed", error)
      );
      this.syncDebounceMap.delete(userId);
    }, 1000); // 1 second debounce

    this.syncDebounceMap.set(userId, timeoutId);
    logManager.system.perf(`Debounced cache sync for user: ${userId}`);
  }

  /**
   * Clean up resources when DataManager is destroyed
   */
  cleanup() {
    // Clear the cache cleanup interval to prevent memory leaks
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
      console.log("🧹 Cache cleanup interval cleared");
    }

    // Clear the cache
    this.clearCache();

    // Clear pending operations
    this.pendingOperations = [];

    console.log("🧹 DataManager cleanup completed");
  }

  /**
   * Invalidate a specific cache entry
   * @param {string} key The key of the cache entry to invalidate
   */
  invalidateCache(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      console.log(`♻️ Invalidated cache for key: ${key}`);
    }
  }

  // =========================
  // NOTIFICATION UI
  // =========================

  /**
   * Show a notification toast via NotificationService
   * @param {string} message The message to display
   * @param {"success"|"error"|"warning"|"info"} type Notification type
   * @param {object} options Additional options (e.g., { duration })
   * @private
   */
  showNotification(message, type = "info", options = {}) {
    try {
      // Route all toasts through the centralized NotificationService
      notificationManager.showSystemNotification(message, type, options);
    } catch (e) {
      // Fallback to console to avoid breaking flows
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Removes legacy offline banners if they exist.
   * @private
   */
  removeLegacyOfflineBanners() {
    const banner = document.getElementById("offline-banner");
    if (banner) {
      banner.remove();
    }
  }

  // =========================
  // USER DATA OPERATIONS
  // =========================

  /**
   * 🔍 Find users by university with multi-field search optimization
   * @param {string} universityId - The university ID to search within
   * @param {string} searchTerm - Optional search term for name/major
   * @param {number} maxResults - Maximum results to return (default: 20)
   * @returns {Promise<Array>} A list of user profiles
   */
  async findUsersByUniversity(
    universityId,
    searchTerm = null,
    maxResults = 20
  ) {
    if (!universityId) {
      console.error("❌ University ID is required to find users.");
      return [];
    }

    const usersRef = collection(db, "users");

    // Common filters for all queries
    const baseFilters = [
      where("universityInfo.university", "==", universityId),
      where("socialInfo.searchable", "==", true),
      // Note: Removed profileSetupComplete filter as it may not be set for all users
      // Uncomment the line below if you want to enforce profile completion:
      // where("systemInfo.profileSetupComplete", "==", true),
    ];

    try {
      // Fast exact handle path (strip leading @, must match handle regex)
      if (searchTerm) {
        const raw = searchTerm.trim().toLowerCase();
        const candidate = raw.startsWith("@") ? raw.slice(1) : raw;
        // Mirror HANDLE_REGEX: start letter, a-z0-9_, 3-20, no trailing underscore
        if (/^[a-z][a-z0-9_]{1,18}[a-z0-9]$/.test(candidate)) {
          const fastResult = await this.lookupUserByHandle(candidate);
          if (fastResult) return [fastResult];
          // If exact handle not found, continue to fuzzy only if user did not prefix with @
          if (raw.startsWith("@")) return []; // user explicitly searched a handle
        }
      }
      let usersMap = new Map();

      if (searchTerm && searchTerm.trim().length >= 2) {
        const term = searchTerm.toLowerCase();

        // Fields we want to search across
        const fieldsToSearch = [
          // Removed displayName_lower (deprecated) – handle has dedicated exact lookup path.
          "profile.firstName_lower",
          "profile.lastName_lower",
          "profile.major_lower",
          // NOTE: If we later reintroduce a non-unique full name, add the lowercase index here.
        ];

        // Limit per individual query (we'll dedupe and limit final results)
        const perQueryLimit = Math.min(maxResults, 10);

        // Build one query per searchable field
        // IMPORTANT: The orderBy must match the index structure in firestore.indexes.json
        const queries = fieldsToSearch.map((fieldPath) => {
          return query(
            usersRef,
            where("universityInfo.university", "==", universityId),
            where("socialInfo.searchable", "==", true),
            where(fieldPath, ">=", term),
            where(fieldPath, "<=", term + "\uf8ff"),
            orderBy(fieldPath),
            limit(perQueryLimit)
          );
        });

        // Execute all queries in parallel
        const snapshots = await Promise.all(
          queries.map(async (q, index) => {
            try {
              return await getDocs(q);
            } catch (error) {
              console.warn(
                `⚠️ Search query ${index} failed (likely missing index):`,
                error.message
              );
              return null;
            }
          })
        );

        // Merge results and deduplicate
        snapshots.forEach((snapshot) => {
          if (snapshot) {
            snapshot.forEach((docSnap) => {
              if (!usersMap.has(docSnap.id)) {
                usersMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
              }
            });
          }
        });
      } else {
        // General university listing (no search term)
        const snapshot = await getDocs(
          query(
            usersRef,
            ...baseFilters,
            orderBy("profile.firstName"),
            limit(maxResults)
          )
        );

        snapshot.forEach((docSnap) => {
          usersMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
      }

      // Convert to array and limit to maxResults
      const users = Array.from(usersMap.values()).slice(0, maxResults);

      console.log(
        `🔍 Found ${users.length} users for university ${universityId}`
      );
      return users;
    } catch (error) {
      console.error("❌ Error finding users by university:", error);
      this.showNotification("Could not search for students.", "error");
      return [];
    }
  }

  /**
   * Exact lookup by handle mapping collection
   * @param {string} handle normalized (lowercase)
   * @returns {Promise<Object|null>} minimal user profile
   */
  async lookupUserByHandle(handle) {
    if (!handle) return null;
    try {
      const dbRef = doc(db, "handles", handle);
      const snap = await getDoc(dbRef);
      if (!snap.exists()) return null;
      const userId = snap.data().userId;
      const userSnap = await getDoc(doc(db, "users", userId));
      if (!userSnap.exists()) return null;
      const data = userSnap.data();
      return {
        uid: userId,
        handle: data.profile?.handle || handle,
        major: data.profile?.major || null,
        avatarConfig: data.avatarConfig || null,
        university: data.universityInfo?.university || null,
        profile: data.profile || {},
      };
    } catch (e) {
      console.warn("lookupUserByHandle failed", e);
      return null;
    }
  }

  /**
   * 🎓 Find users by major at the same university
   * @param {string} universityId - The university ID to search within
   * @param {string} major - Major to search for (e.g., "Computer Science")
   * @param {number} maxResults - Maximum results to return (default: 15)
   * @returns {Promise<Array>} A list of user profiles in that major
   */
  async findUsersByMajor(universityId, major, maxResults = 15) {
    if (!universityId || !major) {
      console.error("❌ University ID and major are required.");
      return [];
    }

    try {
      const usersRef = collection(db, "users");
      const majorLower = major.toLowerCase();

      // Query for exact major match
      const q = query(
        usersRef,
        where("universityInfo.university", "==", universityId),
        where("profile.major_lower", "==", majorLower),
        where("socialInfo.searchable", "==", true),
        // Uncomment the line below if you want to enforce profile completion:
        // where("systemInfo.profileSetupComplete", "==", true),
        orderBy("profile.firstName"),
        limit(maxResults)
      );

      const querySnapshot = await getDocs(q);
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      console.log(
        `🎓 Found ${users.length} ${major} students at ${universityId}`
      );
      return users;
    } catch (error) {
      console.error("❌ Error finding users by major:", error);
      this.showNotification("Could not search for students by major.", "error");
      return [];
    }
  }

  /**
   * 🆔 Find users by student ID or email at the same university
   * @param {string} universityId - The university ID to search within
   * @param {string} searchTerm - Student ID (e.g., "2230992") or email (e.g., "2230992@iub.edu.bd")
   * @param {number} maxResults - Maximum results to return (default: 10)
   * @returns {Promise<Array>} A list of user profiles matching the ID/email
   */
  async findUsersByIdOrEmail(universityId, searchTerm, maxResults = 10) {
    if (!universityId || !searchTerm) {
      console.error(
        "❌ University ID and search term are required for ID/email search."
      );
      return [];
    }

    try {
      const usersRef = collection(db, "users");
      const cleanTerm = searchTerm.trim().toLowerCase();

      let q;

      if (cleanTerm.includes("@")) {
        // Email search - exact match for full email
        q = query(
          usersRef,
          where("universityInfo.university", "==", universityId),
          where("email", "==", cleanTerm),
          where("socialInfo.searchable", "==", true),
          limit(maxResults)
        );
      } else {
        // ID search - need to construct email pattern and search
        // Since Firestore doesn't support regex, we'll search by email prefix
        const emailPrefix = cleanTerm;
        const emailEnd = cleanTerm + "\uf8ff"; // Unicode character for range queries

        q = query(
          usersRef,
          where("universityInfo.university", "==", universityId),
          where("email", ">=", emailPrefix),
          where("email", "<=", emailEnd),
          where("socialInfo.searchable", "==", true),
          limit(maxResults)
        );
      }

      const querySnapshot = await getDocs(q);
      const users = [];

      querySnapshot.forEach((doc) => {
        const userData = doc.data();

        // Additional filtering for ID search (since Firestore range query is approximate)
        if (!cleanTerm.includes("@")) {
          const userEmail = userData.email || "";
          const userId = userEmail.split("@")[0];

          // Only include if the ID actually starts with our search term
          if (userId.startsWith(cleanTerm)) {
            users.push({
              id: doc.id,
              ...userData,
            });
          }
        } else {
          // Email search - exact match already handled by query
          users.push({
            id: doc.id,
            ...userData,
          });
        }
      });

      console.log(
        `🆔 Found ${users.length} users matching ID/email "${cleanTerm}" at ${universityId}`
      );
      return users;
    } catch (error) {
      console.error("❌ Error finding users by ID/email:", error);
      this.showNotification(
        "Could not search by student ID or email.",
        "error"
      );
      return [];
    }
  }

  /**
   * 🆔 Exact lookup by student ID within a university
   * - Triggers only for inputs with at least 6 digits (caller enforces gate)
   * - Matches exact `universityInfo.studentId`
   * @param {string} universityId
   * @param {string} studentIdString - numeric string (no spaces)
   * @param {number} maxResults
   * @returns {Promise<Array>} at most one user in array
   */
  async findUserByStudentIdExact(
    universityId,
    studentIdString,
    maxResults = 1
  ) {
    if (!universityId || !studentIdString) {
      console.error(
        "❌ University ID and student ID are required for exact ID lookup."
      );
      return [];
    }

    try {
      const usersRef = collection(db, "users");
      const cleanId = String(studentIdString).trim();
      // Guard: only digits; any non-digit makes it invalid
      if (!/^\d{6,}$/.test(cleanId)) {
        return [];
      }

      const q = query(
        usersRef,
        where("universityInfo.university", "==", universityId),
        where("universityInfo.studentId", "==", cleanId),
        where("socialInfo.searchable", "==", true),
        limit(maxResults)
      );

      const snap = await getDocs(q);
      const results = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() });
      });

      return results;
    } catch (error) {
      console.error("❌ Error in exact student ID lookup:", error);
      this.showNotification("Could not search by student ID.", "error");
      return [];
    }
  }

  /**
   * Get a user's full profile data
   * @param {string} userId The user's ID
   * @returns {Promise<Object|null>} User profile or null if not found
   * @example
   *   const profile = await dataManager.getUserProfile("abc123");
   */
  async getUserProfile(userId) {
    try {
      // Check cache first
      const cachedData = this.getCachedData(`user_${userId}`);
      if (cachedData) {
        console.log("📦 Returning cached user data");
        return cachedData;
      }

      // If offline, return null or cached data
      if (!this.isOnline) {
        console.log("📴 Offline - cannot fetch fresh user data");
        return null;
      }

      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        return null;
      }

      const userData = userDoc.data();

      // Cache the result
      this.setCachedData(`user_${userId}`, userData);

      return userData;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      this.showError("Failed to load profile data");
      return null;
    }
  }

  /**
   * Save or update a user's full profile in Firestore.
   * @param {string} userId - The user's UID
   * @param {Object} profileData - The profile data object
   * @returns {Promise<{success: boolean, error?: string}>}
   * @example
   *   const result = await dataManager.saveUserProfile("abc123", profileObj);
   *   // if (result.success) {
   *   //   // success!
   *   // }
   */
  async saveUserProfile(userId, profileData) {
    try {
      // Validate data before saving
      if (!this.validateProfileData(profileData)) {
        throw new Error("Invalid profile data");
      }

      // --- BEGIN: Auto-generate search fields and ensure socialInfo/notificationPreferences ---
      if (profileData.profile) {
        // (Removed displayName auto-generation – handle is canonical now)
        if (profileData.profile.firstName) {
          profileData.profile.firstName_lower =
            profileData.profile.firstName.toLowerCase();
        }
        if (profileData.profile.lastName) {
          profileData.profile.lastName_lower =
            profileData.profile.lastName.toLowerCase();
        }
        if (profileData.profile.major) {
          profileData.profile.major_lower =
            profileData.profile.major.toLowerCase();
        }
      }
      if (!profileData.socialInfo) {
        profileData.socialInfo = {
          friendsCount: 0,
          pendingRequestsCount: 0,
          privacy: "university",
          searchable: true,
          lastFriendActivity: null,
          // Campus Presence location fields (2025 Enhancement)
          locationPrivacyLevel: "friends_only", // "friends_only" | "nobody"
          defaultLocationSharing: false, // Default for new friendships
          campusPresenceVisible: true,
        };
      }
      if (!profileData.notificationPreferences) {
        profileData.notificationPreferences = {
          friendRequests: true,
          locationRequests: true,
          starredPresence: true,
        };
      }
      // --- END: Auto-generate search fields and ensure socialInfo/notificationPreferences ---

      // 🛡️ SAFEGUARD: Clean avatar config if present (using centralized method)
      if (profileData.avatarConfig) {
        console.log(
          "🛡️ [DataManager] Cleaning avatar config in saveUserProfile"
        );
        profileData.avatarConfig = avatarManager.cleanAvatarConfig(
          profileData.avatarConfig
        );
        console.log(
          "🛡️ [DataManager] Avatar config cleaned:",
          profileData.avatarConfig
        );
      }

      // Add timestamps properly within systemInfo structure
      const dataToSave = {
        ...profileData,
        systemInfo: {
          ...profileData.systemInfo,
          lastUpdated: serverTimestamp(),
        },
      };

      if (!this.isOnline) {
        // Queue for later if offline
        this.pendingOperations.push(() =>
          this.saveUserProfile(userId, profileData)
        );

        // Cache immediately for offline access
        this.setCachedData(`user_${userId}`, profileData);

        this.showNotification("Changes will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, offline: true };
      }

      // 🎯 Check if document exists and use appropriate method
      const userDocRef = doc(db, "users", userId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // Use updateDoc for existing documents (safer field-level updates)
        await updateDoc(userDocRef, dataToSave);
      } else {
        // Use setDoc for new documents
        await setDoc(userDocRef, dataToSave);
      }

      // Update cache with new data
      this.setCachedData(`user_${userId}`, profileData);

      return { success: true };
    } catch (error) {
      console.error("Error saving profile:", error);
      this.showError(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get just the minimal profile info (firstName, email, avatarConfig).
   * @param {string|object} userIdOrObj - UID or user object
   * @returns {Promise<{handle: string|null, email: string|null, avatarConfig: object|null}|null>}
   * @example
   *   const mini = await dataManager.getUserProfileMinimal("abc123");
   */
  async getUserProfileMinimal(userIdOrObj) {
    // Defensive: Accepts either a UID string or a user object
    let userId = userIdOrObj;
    if (typeof userIdOrObj === "object" && userIdOrObj !== null) {
      userId = userIdOrObj.uid || userIdOrObj.id || null;
    }
    if (!userId || typeof userId !== "string") {
      console.warn(
        "[dataManager] getUserProfileMinimal: Invalid userId provided",
        userIdOrObj
      );
      return null;
    }
    try {
      // Use consistent static imports
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        console.warn(`[dataManager] No user doc found for UID: ${userId}`);
        return null;
      }
      const data = userDoc.data();
      // Defensive extraction: Only pull minimal fields
      const handle = data?.profile?.handle ?? null;
      const email = data?.profile?.email ?? null;
      const avatarConfig = data?.avatarConfig ?? null;
      console.log("Returned minimal profile: @" + handle, email, avatarConfig);
      return { handle, email, avatarConfig };
    } catch (error) {
      console.error("[dataManager] Error in getUserProfileMinimal:", error);
      return null;
    }
  }

  /**
   * Update avatar config with validation and cleaning
   * This method ensures that only valid options for the avatar style are saved
   * @param {string} userId - The user's UID
   * @param {Object} avatarConfig - The avatar config object (will be cleaned)
   * @returns {Promise<{success: boolean, cleanedConfig?: Object, error?: string}>}
   * @example
   *   const result = await dataManager.updateAvatarConfig("abc123", avatarConfigObj);
   *   if (result.success) {
   *     console.log("Avatar saved with cleaned config:", result.cleanedConfig);
   *   }
   */
  async updateAvatarConfig(userId, avatarConfig) {
    try {
      if (!userId || typeof userId !== "string" || !avatarConfig) {
        throw new Error("Invalid arguments for updateAvatarConfig");
      }

      console.log("🔍 [DataManager] Updating avatar config:", avatarConfig);
      console.log(
        "🧹 [DataManager] Using complete field replacement to prevent old options from lingering"
      );

      // 🛡️ SAFEGUARD: Ensure avatar config is clean (using centralized method)
      const cleanedConfig = avatarManager.cleanAvatarConfig(avatarConfig);
      console.log("🛡️ [DataManager] Verified clean config:", cleanedConfig);

      const userDocRef = doc(db, "users", userId);

      // 🧹 SINGLE STEP: Use updateDoc with field deletion and replacement for complete cleanup
      console.log(
        "🗑️ [DataManager] Completely replacing avatarConfig field..."
      );

      // Use updateDoc to ensure field-level replacement (not merge)
      await updateDoc(userDocRef, {
        // Completely replace the avatarConfig field (this removes ALL old nested fields)
        avatarConfig: cleanedConfig,
        "systemInfo.lastUpdated": serverTimestamp(),
      });

      console.log(
        "✅ [DataManager] Avatar config completely replaced - no old options lingering"
      );

      // Update cache with cleaned config
      const cacheKey = `user_${userId}`;
      if (this.cache.has(cacheKey)) {
        const cachedData = this.cache.get(cacheKey);
        cachedData.avatarConfig = cleanedConfig;
        this.cache.set(cacheKey, cachedData);
        console.log("🔄 [DataManager] Updated avatar in cache");
      }

      // 🔄 CRITICAL: Sync avatar changes to all cached locations (friendships, friend requests)
      console.log(
        "🔄 [DataManager] Syncing avatar changes to all cached locations..."
      );
      try {
        await syncUserDataCache(userId);
        console.log(
          "✅ [DataManager] Avatar sync to cached locations completed"
        );
      } catch (syncError) {
        console.error("⚠️ [DataManager] Avatar sync failed:", syncError);
        // Don't fail the avatar update if sync fails
      }

      return { success: true, cleanedConfig: cleanedConfig };
    } catch (error) {
      console.error("[dataManager] Error updating avatar config:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save only the avatar config for a user (does not overwrite other data).
   * @deprecated Use updateAvatarConfig instead for better validation
   * @param {string} userId - The user's UID
   * @param {Object} avatarConfig - The avatar config object
   * @returns {Promise<{success: boolean, error?: string}>}
   * @example
   *   await dataManager.saveAvatarConfig("abc123", avatarConfigObj);
   */
  async saveAvatarConfig(userId, avatarConfig) {
    console.warn(
      "⚠️ [DataManager] saveAvatarConfig is deprecated. Use updateAvatarConfig for better validation."
    );

    // Redirect to the new method for consistency
    const result = await this.updateAvatarConfig(userId, avatarConfig);
    return { success: result.success, error: result.error };
  }

  /**
   * Update the user's last active timestamp in Firestore.
   * @param {string} userId - The user's UID
   * @returns {Promise<{success: boolean, error?: string}>}
   * @example
   *   await dataManager.updateUserLastActive("abc123");
   */
  async updateUserLastActive(userId) {
    try {
      // Skip silently if no authenticated user (e.g., just logged out)
      if (!auth.currentUser) {
        return { success: false, error: "not_authenticated" };
      }
      if (!userId || typeof userId !== "string")
        throw new Error("Invalid userId");

      await updateDoc(doc(db, "users", userId), {
        "systemInfo.lastActive": serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error("[dataManager] Error updating lastActive:", error);
      return { success: false, error: error.message };
    }
  }

  // =========================
  // SCHEDULE FUNCTIONS
  // =========================

  /**
   * Create enhanced scheduleData structure with Phase-1 improvements.
   * Based on Gemini feedback: schema versioning, simplified privacy, performance metadata.
   * @param {Object} scheduleData - Basic schedule data (7x7 matrices)
   * @param {string} currentUserId - ID of user making the change
   * @returns {Object} Enhanced schedule data structure
   * @private
   */
  _createEnhancedScheduleData(scheduleData, currentUserId) {
    // Calculate freeBusySummary for performance (Phase-2/3 friends features)
    const freeBusySummary = this._calculateFreeBusySummary(
      scheduleData.schedule || []
    );

    const now = new Date();

    return {
      // Core schedule data (7x7 matrices)
      schedule: this._convertScheduleToMap(scheduleData.schedule),
      slotInfo: this._convertSlotInfoToMap(scheduleData.slotInfo),
      timeSlots: scheduleData.timeSlots || [], // Will use DEFAULT_TIMESLOTS
      pinnedSlots: this._convertScheduleToMap(scheduleData.pinnedSlots),
      timeBasedPins: scheduleData.timeBasedPins || {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      },

      // Enhanced metadata (Gemini feedback)
      metadata: {
        schemaVersion: 1, // For future migrations
        lastModified: now,
        lastModifiedBy: currentUserId, // Track who made changes
        createdAt: scheduleData.metadata?.createdAt || now,
        version: (scheduleData.metadata?.version || 0) + 1,
        importSource: scheduleData.metadata?.importSource || "manual",
        freeBusySummary: freeBusySummary, // Performance optimization for friends features
        totalClasses: this._countTotalClasses(scheduleData.schedule || []),
        isEmpty: freeBusySummary.every((count) => count === 0),
        hasConflicts: false, // TODO: Implement conflict detection
      },
    };
  }

  /**
   * Calculate free/busy summary for performance optimization.
   * Returns array where index = day of week, value = number of busy slots.
   * @param {Array} schedule - 7x7 boolean schedule matrix
   * @returns {Array<number>} [2, 5, 3, 5, 4, 0, 1] (Sun: 2 classes, Mon: 5, etc.)
   * @private
   */
  _calculateFreeBusySummary(schedule) {
    if (!Array.isArray(schedule) || schedule.length !== 7) {
      return [0, 0, 0, 0, 0, 0, 0]; // Default: no classes
    }

    return schedule.map((daySchedule) => {
      if (!Array.isArray(daySchedule)) return 0;
      return daySchedule.filter((slot) => slot === true).length;
    });
  }

  /**
   * Count total number of classes in schedule.
   * @param {Array} schedule - 7x7 boolean schedule matrix
   * @returns {number} Total number of busy slots
   * @private
   */
  _countTotalClasses(schedule) {
    if (!Array.isArray(schedule)) return 0;

    return schedule.reduce((total, daySchedule) => {
      if (!Array.isArray(daySchedule)) return total;
      return total + daySchedule.filter((slot) => slot === true).length;
    }, 0);
  }

  _convertScheduleToMap(scheduleArray) {
    if (!Array.isArray(scheduleArray)) return {};
    const scheduleMap = {};
    scheduleArray.forEach((day, dayIndex) => {
      if (Array.isArray(day)) {
        scheduleMap[dayIndex] = {};
        day.forEach((slot, slotIndex) => {
          scheduleMap[dayIndex][slotIndex] = slot;
        });
      }
    });
    return scheduleMap;
  }

  _convertSlotInfoToMap(slotInfoArray) {
    if (!Array.isArray(slotInfoArray)) return {};
    const slotInfoMap = {};
    slotInfoArray.forEach((day, dayIndex) => {
      if (Array.isArray(day)) {
        slotInfoMap[dayIndex] = {};
        day.forEach((slot, slotIndex) => {
          slotInfoMap[dayIndex][slotIndex] = slot;
        });
      }
    });
    return slotInfoMap;
  }

  /**
   * Save a user's schedule with enhanced Phase-1 structure.
   * @param {string} userId - The user's UID
   * @param {Object} scheduleData - The schedule data (7x7 matrices + metadata)
   * @param {string} currentUserId - ID of user making the change (for lastModifiedBy)
   * @returns {Promise<{success: boolean, error?: string}>}
   * @example
   *   await dataManager.saveUserSchedule("abc123", scheduleObj, "currentUser123");
   */
  async saveUserSchedule(userId, scheduleData, currentUserId = null) {
    try {
      // Create enhanced scheduleData structure with Phase-1 improvements
      const enhancedScheduleData = this._createEnhancedScheduleData(
        scheduleData,
        currentUserId
      );

      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.saveUserSchedule(userId, scheduleData, currentUserId)
        );
        this.setCachedData(`schedule_${userId}`, enhancedScheduleData);
        this.showNotification("Schedule will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, offline: true };
      }

      // Save to Firestore with enhanced structure (scheduleData instead of schedule)
      // Save to Firestore with enhanced structure (scheduleData instead of schedule)
      await updateDoc(doc(db, "users", userId), {
        scheduleData: enhancedScheduleData,
        "systemInfo.lastUpdated": serverTimestamp(),
      });

      // Cache the enhanced data
      this.setCachedData(`schedule_${userId}`, enhancedScheduleData);

      return { success: true };
    } catch (error) {
      console.error("Error saving schedule:", error);
      this.showError("Failed to save schedule");
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a user's schedule with Phase-1 enhanced structure.
   * @param {string} userId - The user's UID
   * @returns {Promise<Object|null>} Enhanced schedule data or null
   * @example
   *   const sched = await dataManager.getUserSchedule("abc123");
   */
  async getUserSchedule(userId) {
    try {
      // Check cache first
      const cachedSchedule = this.getCachedData(`schedule_${userId}`);
      if (cachedSchedule) {
        return cachedSchedule;
      }

      if (!this.isOnline) {
        return null;
      }

      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        return null;
      }

      const userData = userDoc.data();
      // Phase-1: Use new enhanced scheduleData structure
      const scheduleData = userData.scheduleData || null;

      if (scheduleData) {
        this.setCachedData(`schedule_${userId}`, scheduleData);
      }

      return scheduleData;
    } catch (error) {
      console.error("Error fetching schedule:", error);
      this.showError("Failed to load schedule");
      return null;
    }
  }

  /**
   * Listen to real-time schedule changes for cross-device sync.
   * @param {string} userId - The user's UID to listen to
   * @param {Function} callback - Callback function to handle schedule updates
   * @returns {Function} Unsubscribe function to stop listening
   * @example
   *   const unsubscribe = dataManager.listenToUserSchedule("abc123", (scheduleData) => {
   *     console.log("Schedule updated:", scheduleData);
   *   });
   *   // Later: unsubscribe();
   */
  listenToUserSchedule(userId, callback) {
    try {
      const userDocRef = doc(db, "users", userId);

      const unsubscribe = onSnapshot(
        userDocRef,
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const userData = docSnapshot.data();
            const scheduleData = userData.scheduleData || null;

            if (scheduleData) {
              // Update cache with real-time data
              this.setCachedData(`schedule_${userId}`, scheduleData);

              // Notify callback with updated schedule
              callback(scheduleData);

              console.log(
                `📡 [DataManager] Real-time schedule update received for user: ${userId}`
              );
            }
          } else {
            callback(null);
          }
        },
        (error) => {
          // Suppress noise on logout/permission changes
          if (error.code === "permission-denied" || !auth.currentUser) {
            console.info(
              "ℹ️ Schedule listener ended due to auth change (ignored)"
            );
            return;
          }
          console.error("Error in schedule listener:", error);
          this.showError("Lost connection to schedule updates");
        }
      );

      console.log(
        `📡 [DataManager] Started listening to schedule changes for user: ${userId}`
      );
      return unsubscribe;
    } catch (error) {
      console.error("Error setting up schedule listener:", error);
      return () => {}; // Return no-op function
    }
  }

  // =========================
  // CACHE & UTILITY FUNCTIONS
  // =========================

  /**
   * Clear all cached data (useful on sign out).
   * @example
   *   dataManager.clearCache();
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Show error message to user with consistent styling
   * @private
   */
  showError(message) {
    this.showNotification(message, "error");
  }

  /**
   * Show user notifications with consistent styling and accessibility
   * @param {string} message - Message to show
   * @param {string} type - 'error' | 'success' | 'info' | 'warning'
   * @private
   */
  showNotification(message, type = "info", options = {}) {
    // Delegate to the centralized NotificationService to avoid duplicate UI systems
    try {
      notificationManager.showSystemNotification(message, type, options);
    } catch (e) {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Get notification styles based on type
   * @private
   */
  getNotificationStyles(type) {
    const styles = {
      error:
        "background: #fecaca; color: #b91c1c; border-left: 4px solid #ef4444;",
      success:
        "background: #bbf7d0; color: #166534; border-left: 4px solid #10b981;",
      warning:
        "background: #fef3c7; color: #d97706; border-left: 4px solid #f59e0b;",
      info: "background: #dbeafe; color: #1d4ed8; border-left: 4px solid #3b82f6;",
    };
    return styles[type] || styles.info;
  }

  /**
   * Validate profile data before saving
   * @private
   */
  validateProfileData(data) {
    // Only require a non-empty email for initial profile creation.
    // firstName and lastName can be empty at sign up, but should be filled later in profile setup.
    if (!data) return false;
    if (data.profile) {
      const email = data.profile.email;
      if (!email || !email.trim()) {
        return false;
      }
    }
    return true;
  }

  /**
   * Remove any legacy offline banners from the DOM
   * @private
   */
  removeLegacyOfflineBanners() {
    // Remove any existing offline banners that might be left over
    const legacyBanners = [
      "offline-status-banner",
      "offline-banner",
      "network-status-banner",
    ];

    legacyBanners.forEach((bannerId) => {
      const banner = document.getElementById(bannerId);
      if (banner) {
        console.log(`🧹 Removing legacy offline banner: ${bannerId}`);
        banner.remove();
      }
    });

    // Also remove any elements with offline-related classes
    const legacyElements = document.querySelectorAll(
      ".offline-banner, .network-status, .offline-status"
    );
    legacyElements.forEach((element) => {
      console.log("🧹 Removing legacy offline element:", element.className);
      element.remove();
    });
  }

  // =========================
  // ENHANCED UTILITIES (migrated from firestore-utils.js)
  // =========================

  /**
   * Get formatted user data for display
   * @param {Object} userData - Raw user data from Firestore
   * @returns {Object} Formatted user data
   */
  formatUserData(userData) {
    if (!userData) return null;

    return {
      // Basic identity
      uid: userData.uid,
      email: userData.profile?.email || "",
      handle: userData.profile?.handle || "",

      // Personal info
      fullName: `${userData.profile?.firstName || ""} ${
        userData.profile?.lastName || ""
      }`.trim(),
      firstName: userData.profile?.firstName || "",
      lastName: userData.profile?.lastName || "",
      bio: userData.profile?.bio || "",
      major: userData.profile?.major || "",
      startingYear: userData.profile?.startingYear || "",

      // University info
      university: userData.universityInfo?.university || "",
      universityName: userData.universityInfo?.universityName || "",
      studentId: userData.universityInfo?.studentId || "",

      // Avatar data
      avatarConfig: userData.avatarConfig || null,

      // System status
      isOnline: userData.systemInfo?.status === "online",
      isProfileComplete: userData.systemInfo?.profileSetupComplete || false,
      lastActive: userData.systemInfo?.lastActive,
      createdAt: userData.systemInfo?.createdAt,
    };
  }

  /**
   * Get user's display name and avatar for UI components
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Display data
   */
  async getUserDisplayData(userId) {
    const userData = await this.getUserProfile(userId);
    if (!userData) return null;

    return {
      name:
        `${userData.profile?.firstName || ""} ${
          userData.profile?.lastName || ""
        }`.trim() ||
        (userData.profile?.handle ? `@${userData.profile?.handle}` : ""),
      avatarConfig: userData.avatarConfig,
      isOnline: userData.systemInfo?.status === "online",
      lastActive: userData.systemInfo?.lastActive,
    };
  }

  /**
   * Get user's university information
   * @param {string} userId - User ID
   * @returns {Promise<Object>} University data
   */
  async getUserUniversityInfo(userId) {
    const userData = await this.getUserProfile(userId);
    if (!userData) return null;

    return {
      university: userData.universityInfo?.university,
      universityName: userData.universityInfo?.universityName,
      studentId: userData.universityInfo?.studentId,
      major: userData.profile?.major,
      startingYear: userData.profile?.startingYear,
    };
  }

  /**
   * Check if user has completed profile setup
   * @param {Object} userData - User data
   * @returns {boolean} True if profile is complete
   */
  isProfileComplete(userData) {
    if (!userData) return false;

    return !!(
      userData.systemInfo?.profileSetupComplete &&
      userData.profile?.firstName &&
      userData.profile?.lastName &&
      userData.profile?.major &&
      userData.profile?.startingYear &&
      userData.universityInfo?.studentId &&
      userData.profile?.email
    );
  }

  /**
   * Check if user is online
   * @param {Object} userData - User data
   * @returns {boolean} True if user is online
   */
  isUserOnline(userData) {
    return userData?.systemInfo?.status === "online";
  }

  /**
   * Update user's profile information with field paths
   * @param {string} userId - User ID
   * @param {Object} profileData - Profile data to update
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateUserProfile(userId, profileData) {
    try {
      const updates = {
        "systemInfo.lastUpdated": serverTimestamp(),
      };

      // Add profile updates with proper paths
      if (profileData.firstName !== undefined)
        updates["profile.firstName"] = profileData.firstName;
      if (profileData.lastName !== undefined)
        updates["profile.lastName"] = profileData.lastName;
      if (profileData.bio !== undefined)
        updates["profile.bio"] = profileData.bio;
      if (profileData.major !== undefined)
        updates["profile.major"] = profileData.major;
      if (profileData.startingYear !== undefined)
        updates["profile.startingYear"] = profileData.startingYear;
      if (profileData.email !== undefined)
        updates["profile.email"] = profileData.email;
      if (profileData.handle !== undefined)
        updates["profile.handle"] = profileData.handle;

      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.updateUserProfile(userId, profileData)
        );
        this.showNotification("Changes will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, offline: true };
      }

      await updateDoc(doc(db, "users", userId), updates);

      // Update cache
      const cacheKey = `user_${userId}`;
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) {
        // Update cached data with new values
        Object.keys(updates).forEach((path) => {
          if (path.includes(".")) {
            const [section, field] = path.split(".");
            if (!cachedData[section]) cachedData[section] = {};
            cachedData[section][field] = updates[path];
          }
        });
        this.setCachedData(cacheKey, cachedData);
      }

      return { success: true };
    } catch (error) {
      console.error("Error updating user profile:", error);
      this.showError(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update user's online status
   * @param {string} userId - User ID
   * @param {string} status - "online" or "offline"
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateUserStatus(userId, status) {
    try {
      const updates = {
        "systemInfo.status": status,
        "systemInfo.lastActive": serverTimestamp(),
        "systemInfo.lastUpdated": serverTimestamp(),
      };

      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.updateUserStatus(userId, status)
        );
        return { success: true, offline: true };
      }

      await updateDoc(doc(db, "users", userId), updates);
      return { success: true };
    } catch (error) {
      console.error("Error updating user status:", error);
      return { success: false, error: error.message };
    }
  }

  async updateOnboardingState(userId, onboardingUpdates = {}) {
    if (!userId) {
      throw new Error("User ID is required to update onboarding state");
    }

    if (
      !onboardingUpdates ||
      typeof onboardingUpdates !== "object" ||
      Object.keys(onboardingUpdates).length === 0
    ) {
      return { success: false, error: "No onboarding updates provided" };
    }

    const updates = {
      "systemInfo.lastUpdated": serverTimestamp(),
    };

    let hasPayload = false;
    // Support special logging fields for onboarding events
    const eventName = onboardingUpdates?.__eventName;
    const withLog = typeof eventName === "string" && eventName.length > 0;

    Object.entries(onboardingUpdates).forEach(([key, value]) => {
      if (value === undefined) return;
      if (key.startsWith("__")) return; // skip internal keys
      updates[`systemInfo.onboarding.${key}`] = value;
      hasPayload = true;
    });

    if (withLog) {
      // Write lightweight audit fields under onboarding
      updates["systemInfo.onboarding.lastEvent"] = eventName;
      updates["systemInfo.onboarding.lastEventAt"] = serverTimestamp();
      updates[`systemInfo.onboarding.events.${eventName}.lastAt`] = serverTimestamp();
      hasPayload = true;
    }

    if (!hasPayload) {
      return { success: false, error: "No valid onboarding fields provided" };
    }

    if (!this.isOnline) {
      this.pendingOperations.push(() =>
        this.updateOnboardingState(userId, onboardingUpdates)
      );
      return { success: true, offline: true };
    }

    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, updates);

    const cacheKey = `user_${userId}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      const systemInfo = cached.systemInfo || {};
      const onboarding = systemInfo.onboarding || {};
      const merged = {
        ...systemInfo,
        onboarding: {
          ...onboarding,
          ...onboardingUpdates,
        },
      };
      if (withLog) {
        merged.onboarding.lastEvent = eventName;
        // Keep lastEventAt best-effort; serverTimestamp not available on client cache
      }
      cached.systemInfo = merged;
      this.setCachedData(cacheKey, cached);
    }

    return { success: true };
  }

  /**
   * Mark user as online
   * @param {string} userId - User ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setUserOnline(userId) {
    return this.updateUserStatus(userId, "online");
  }

  /**
   * Mark user as offline
   * @param {string} userId - User ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setUserOffline(userId) {
    return this.updateUserStatus(userId, "offline");
  }

  /**
   * Update user's bio
   * @param {string} userId - User ID
   * @param {string} bio - New bio text
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateUserBio(userId, bio) {
    try {
      const updates = {
        "profile.bio": bio,
        "systemInfo.lastUpdated": serverTimestamp(),
      };

      if (!this.isOnline) {
        this.pendingOperations.push(() => this.updateUserBio(userId, bio));
        this.showNotification("Changes will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, offline: true };
      }

      await updateDoc(doc(db, "users", userId), updates);
      return { success: true };
    } catch (error) {
      console.error("Error updating user bio:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate avatar URL from user data (using centralized utility)
   * @param {Object} userData - User data containing avatarConfig
   * @returns {string|null} Avatar URL or null
   */
  getAvatarUrl(userData) {
    // Use the centralized avatar utility
    return getAvatarUrl(userData);
  }

  /**
   * Get avatar configuration for editing
   * @param {Object} userData - User data
   * @returns {Object|null} Avatar config or null
   */
  getAvatarConfig(userData) {
    return userData?.avatarConfig || null;
  }

  /**
   * Get field path for Firestore queries
   * @param {string} section - Data section (profile, universityInfo, systemInfo)
   * @param {string} field - Field name
   * @returns {string} Firestore field path
   */
  getFieldPath(section, field) {
    return `${section}.${field}`;
  }

  /**
   * Get current sync status for offline operations
   * Used by profile-setup.js to show sync status to users
   * @returns {Object} Sync status with pending operations count
   * @example
   *   const status = dataManager.getSyncStatus();
   *   // { isOnline: true, pendingWrites: 2, cacheSize: 5 }
   */
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      pendingWrites: this.pendingOperations.length,
      cacheSize: this.cache.size,
      lastSync: this.lastSyncTime || null,
    };
  }

  /**
   * Delete a user's profile (admin function)
   * @param {string} userId - User ID to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteUserProfile(userId) {
    try {
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId");
      }

      if (!this.isOnline) {
        throw new Error("Cannot delete profiles while offline");
      }

      await updateDoc(doc(db, "users", userId), {
        "systemInfo.deleted": true,
        "systemInfo.deletedAt": serverTimestamp(),
        "systemInfo.status": "deleted",
      });

      // Remove from cache
      this.invalidateCache(`user_${userId}`);

      return { success: true };
    } catch (error) {
      console.error("Error deleting user profile:", error);
      this.showError(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch update multiple users (admin function)
   * @param {Array<{userId: string, updates: Object}>} userUpdates - Array of user updates
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async batchUpdateUsers(userUpdates) {
    try {
      if (!this.isOnline) {
        throw new Error("Cannot perform batch updates while offline");
      }

      const promises = userUpdates.map(({ userId, updates }) =>
        updateDoc(doc(db, "users", userId), {
          ...updates,
          "systemInfo.lastUpdated": serverTimestamp(),
        })
      );

      await Promise.all(promises);

      // Invalidate cache for affected users
      userUpdates.forEach(({ userId }) =>
        this.invalidateCache(`user_${userId}`)
      );

      this.showNotification(
        `Updated ${userUpdates.length} users successfully`,
        "success"
      );
      return { success: true };
    } catch (error) {
      console.error("Error in batch update:", error);
      this.showError(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search users by criteria (admin function)
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array|null>} Array of matching users or null
   */
  async searchUsers(_criteria) {
    try {
      if (!this.isOnline) {
        this.showError("Search requires internet connection");
        return null;
      }

      // This would require implementing Firestore queries
      // For now, return a placeholder
      console.warn(
        "searchUsers not fully implemented - requires Firestore query setup"
      );
      return [];
    } catch (error) {
      console.error("Error searching users:", error);
      this.showError("Search failed");
      return null;
    }
  }

  // =========================
  // FRIENDS DATA OPERATIONS
  // =========================

  /**
   * 📩 Create a friend request document in Firestore
   * @param {Object} requestData - The friend request data
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>}
   */
  async createFriendRequest(requestData) {
    try {
      console.log("📩 Creating friend request...", requestData);

      const friendRequestsRef = collection(db, "friendRequests");
      const docRef = await addDoc(friendRequestsRef, {
        ...requestData,
        createdAt: serverTimestamp(),
        respondedAt: null,
      });

      console.log("✅ Friend request created successfully with ID:", docRef.id);
      return { success: true, requestId: docRef.id };
    } catch (error) {
      console.error("❌ Error creating friend request:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📬 Get pending friend requests for a user
   * @param {string} userId - The user ID to get requests for
   * @returns {Promise<Array>} Array of pending requests
   */
  async getPendingFriendRequests(userId) {
    try {
      console.log("📬 Fetching pending requests for:", userId);

      const requestsRef = collection(db, "friendRequests");
      const q = query(
        requestsRef,
        where("toUserId", "==", userId),
        where("status", "==", "pending")
      );

      const querySnapshot = await getDocs(q);
      const requests = [];
      querySnapshot.forEach((doc) => {
        requests.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      console.log("✅ Found", requests.length, "pending requests");
      return requests;
    } catch (error) {
      console.error("❌ Error fetching pending requests:", error);
      return [];
    }
  }

  /**
   * ✅ Update friend request status (accept/reject)
   * @param {string} requestId - The request ID to update
   * @param {string} status - New status ("accepted" or "rejected")
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateFriendRequestStatus(requestId, status) {
    try {
      console.log(`✅ Updating request ${requestId} to ${status}`);

      const requestRef = doc(db, "friendRequests", requestId);
      await updateDoc(requestRef, {
        status: status,
        respondedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("❌ Error updating friend request:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🤝 Create a friendship document with canonical ID
   * @param {Object} friendshipData - The friendship data
   * @returns {Promise<{success: boolean, friendshipId?: string, error?: string}>}
   */
  async createFriendship(friendshipData) {
    try {
      console.log("🤝 Creating friendship...", friendshipData);

      // Import getFriendshipId utility for canonical ID generation
      const { getFriendshipId } = await import(
        "../../utils/friendship-utils.js"
      );

      // Generate canonical friendship ID that matches Firestore security rules
      const friendshipId = getFriendshipId(
        friendshipData.user1Id,
        friendshipData.user2Id
      );

      const friendshipRef = doc(db, "friendships", friendshipId);
      await setDoc(friendshipRef, {
        ...friendshipData,
        createdAt: serverTimestamp(),
        lastInteraction: serverTimestamp(),
      });

      console.log(
        "✅ Friendship created successfully with canonical ID:",
        friendshipId
      );
      return { success: true, friendshipId: friendshipId };
    } catch (error) {
      console.error("❌ Error creating friendship:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 💔 Delete a friendship (unfriend users)
   * @param {string} friendshipId - The friendship document ID to delete
   * @returns {Promise<Object>} Success/failure result
   */
  async deleteFriendship(friendshipId) {
    try {
      console.log(`💔 Deleting friendship: ${friendshipId}`);

      // First, get the friendship document to extract user IDs
      const friendshipRef = doc(db, "friendships", friendshipId);
      const friendshipDoc = await getDoc(friendshipRef);

      if (!friendshipDoc.exists()) {
        console.warn(`⚠️ Friendship document not found: ${friendshipId}`);
        return { success: false, error: "Friendship not found" };
      }

      const friendshipData = friendshipDoc.data();
      const user1Id = friendshipData.user1Id;
      const user2Id = friendshipData.user2Id;

      if (!user1Id || !user2Id) {
        console.error(
          "❌ Invalid friendship document structure - missing user IDs"
        );
        return {
          success: false,
          error: "Invalid friendship document structure",
        };
      }

      console.log(
        `💔 Removing friendship between users: ${user1Id} and ${user2Id}`
      );

      // Delete the friendship document first - this triggers real-time listeners
      await deleteDoc(friendshipRef);

      // ✅ SECURITY FIX: Only modify current user's QuickAccess data
      // The other user's data will self-heal via real-time friendship document listeners
      console.log(
        "⭐ Cleaning up current user's QuickAccess (secure approach)..."
      );

      // Get current user (the one who initiated unfriend)
      // currentUser statically imported
      const currentUserId = currentUser?.uid;

      if (currentUserId) {
        // Determine which user to remove from current user's starred friends
        const friendToRemove = currentUserId === user1Id ? user2Id : user1Id;

        try {
          // ✅ Only remove friend from current user's QuickAccess (no cross-user modifications)
          const removeResult = await this.removeFromQuickAccess(
            currentUserId,
            friendToRemove
          );
          if (removeResult.success) {
            console.log(
              `✅ Removed ${friendToRemove} from ${currentUserId}'s QuickAccess`
            );
          } else {
            console.warn(
              `⚠️ Failed to remove ${friendToRemove} from ${currentUserId}'s QuickAccess: ${removeResult.error}`
            );
          }
        } catch (error) {
          console.warn(
            `⚠️ Error removing ${friendToRemove} from ${currentUserId}'s QuickAccess:`,
            error
          );
        }
      } else {
        console.warn("⚠️ No current user found, skipping QuickAccess cleanup");
      }

      console.log(
        "✅ Friendship deleted successfully and current user's QuickAccess cleaned up"
      );
      console.log(
        "🔄 Other user's QuickAccess will self-heal via real-time listeners"
      );

      // Clear friendship privacy cache to ensure UI updates properly
      try {
        const { friendshipPrivacyService } = await import(
          "../friends/FriendshipPrivacyService.js"
        );
        friendshipPrivacyService.clearFriendshipCache(user1Id, user2Id);
      } catch (error) {
        console.warn("⚠️ Failed to clear friendship privacy cache:", error);
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Error deleting friendship:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🤝 Get friendship document by ID
   * @param {string} friendshipId - The friendship document ID
   * @returns {Promise<Object|null>} Friendship document data or null if not found
   */
  async getFriendshipById(friendshipId) {
    try {
      if (!friendshipId || typeof friendshipId !== "string") {
        console.error("❌ Invalid friendship ID provided:", friendshipId);
        return null;
      }

      console.log(`🔍 Getting friendship document: ${friendshipId}`);

      const friendshipRef = doc(db, "friendships", friendshipId);
      const friendshipDoc = await getDoc(friendshipRef);

      if (!friendshipDoc.exists()) {
        console.warn(`⚠️ Friendship document not found: ${friendshipId}`);
        return null;
      }

      const friendshipData = friendshipDoc.data();
      console.log(`✅ Retrieved friendship document: ${friendshipId}`);

      return friendshipData;
    } catch (error) {
      console.error(
        `❌ Error getting friendship document ${friendshipId}:`,
        error
      );
      return null;
    }
  }

  /**
   * 🤝 Get friendship document between two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {Promise<Object|null>} Friendship document data or null if not found
   */
  async getFriendshipBetweenUsers(userId1, userId2) {
    try {
      if (
        !userId1 ||
        !userId2 ||
        typeof userId1 !== "string" ||
        typeof userId2 !== "string"
      ) {
        console.error("❌ Invalid user IDs provided:", { userId1, userId2 });
        return null;
      }

      console.log(
        `🔍 Getting friendship between users: ${userId1} ↔ ${userId2}`
      );

      // Import getFriendshipId utility for canonical ID generation
      const { getFriendshipId } = await import(
        "../../utils/friendship-utils.js"
      );

      // Generate canonical friendship ID
      const friendshipId = getFriendshipId(userId1, userId2);

      const friendshipRef = doc(db, "friendships", friendshipId);
      const friendshipDoc = await getDoc(friendshipRef);

      if (!friendshipDoc.exists()) {
        console.warn(
          `⚠️ No friendship found between users: ${userId1} ↔ ${userId2}`
        );
        return null;
      }

      const friendshipData = friendshipDoc.data();
      console.log(
        `✅ Retrieved friendship between users: ${userId1} ↔ ${userId2}`
      );

      return friendshipData;
    } catch (error) {
      console.error(
        `❌ Error getting friendship between users ${userId1} ↔ ${userId2}:`,
        error
      );
      return null;
    }
  }

  /**
   * 👥 Get user's friends list
   * @param {string} userId - The user ID to get friends for
   * @returns {Promise<Array>} Array of friendships
   */
  async getUserFriendships(userId) {
    try {
      console.log("👥 Fetching friends for:", userId);

      const friendshipsRef = collection(db, "friendships");
      const q = query(friendshipsRef, where("users", "array-contains", userId));

      const querySnapshot = await getDocs(q);
      const friendships = [];
      querySnapshot.forEach((doc) => {
        friendships.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      console.log("✅ Found", friendships.length, "friendships");
      return friendships;
    } catch (error) {
      console.error("❌ Error fetching friendships:", error);
      return [];
    }
  }

  /**
   * 🔍 Check if friend request already exists between two users
   * @param {string} fromUserId - Sender's user ID
   * @param {string} toUserId - Receiver's user ID
   * @returns {Promise<Object|null>} Existing request or null
   */
  async checkExistingFriendRequest(fromUserId, toUserId) {
    try {
      const requestsRef = collection(db, "friendRequests");

      // Check for any pending, accepted, or rejected requests between these users
      const q = query(
        requestsRef,
        where("fromUserId", "==", fromUserId),
        where("toUserId", "==", toUserId),
        where("status", "in", ["pending", "accepted", "rejected"])
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      // Also check the reverse direction
      const reverseQ = query(
        requestsRef,
        where("fromUserId", "==", toUserId),
        where("toUserId", "==", fromUserId),
        where("status", "in", ["pending", "accepted", "rejected"])
      );

      const reverseSnapshot = await getDocs(reverseQ);
      if (!reverseSnapshot.empty) {
        const doc = reverseSnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      return null;
    } catch (error) {
      console.error("❌ Error checking existing request:", error);
      return null;
    }
  }

  /**
   * 📤 Get outgoing friend requests for a user (requests they sent)
   * @param {string} userId - The user ID to get outgoing requests for
   * @returns {Promise<Array>} Array of outgoing pending requests
   */
  async getOutgoingFriendRequests(userId) {
    try {
      console.log("📤 Fetching outgoing requests for:", userId);

      const requestsRef = collection(db, "friendRequests");
      const q = query(
        requestsRef,
        where("fromUserId", "==", userId),
        where("status", "==", "pending")
      );

      const querySnapshot = await getDocs(q);
      const requests = [];
      querySnapshot.forEach((doc) => {
        requests.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      console.log("✅ Found", requests.length, "outgoing pending requests");
      return requests;
    } catch (error) {
      console.error("❌ Error fetching outgoing requests:", error);
      return [];
    }
  }

  /**
   * 📤 Get ALL outgoing friend requests for a user (all statuses)
   * @param {string} userId - The user ID to get outgoing requests for
   * @returns {Promise<Array>} Array of all outgoing requests
   */
  async getAllOutgoingFriendRequests(userId) {
    try {
      console.log("📤 Fetching ALL outgoing requests for:", userId);

      const requestsRef = collection(db, "friendRequests");
      const q = query(
        requestsRef,
        where("fromUserId", "==", userId),
        orderBy("createdAt", "desc")
      );

      const querySnapshot = await getDocs(q);
      const requests = [];
      querySnapshot.forEach((doc) => {
        requests.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      console.log("✅ Found", requests.length, "total outgoing requests");
      return requests;
    } catch (error) {
      console.error("❌ Error fetching all outgoing requests:", error);
      return [];
    }
  }

  /**
   * 🗑️ Delete a friend request (for cleanup after accept/reject)
   * @param {string} requestId - The request ID to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteFriendRequest(requestId) {
    try {
      console.log(`🗑️ Deleting friend request: ${requestId}`);

      const requestRef = doc(db, "friendRequests", requestId);
      await deleteDoc(requestRef);

      console.log("✅ Friend request deleted successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Error deleting friend request:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🤝 Check if a friendship exists between two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {Promise<boolean>} True if friendship exists, false otherwise
   */
  async checkFriendshipExists(userId1, userId2) {
    try {
      const friendshipsRef = collection(db, "friendships");
      const q = query(
        friendshipsRef,
        where("users", "array-contains", userId1)
      );

      const querySnapshot = await getDocs(q);

      // Check if any friendship document contains both users
      for (const doc of querySnapshot.docs) {
        const friendship = doc.data();
        if (friendship.users.includes(userId2)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking friendship existence:", error);
      return false;
    }
  }

  // ===================================================================
  //                    REAL-TIME LISTENERS
  // ===================================================================

  /**
   * 📡 Listen for pending friend requests in real-time
   *
   * This function sets up a real-time listener for friend requests sent TO the specified user.
   * When someone sends a friend request, the callback will be triggered instantly!
   *
   * @param {string} userId - User ID to listen for incoming requests
   * @param {function} callback - Function called when requests change: callback(requests)
   * @returns {function} Unsubscribe function to stop listening
   *
   * Example usage:
   *   const unsubscribe = dataManager.listenToPendingFriendRequests(
   *     "user123",
   *     (requests) => console.log("Got", requests.length, "requests!")
   *   );
   *   // Later: unsubscribe(); // Stop listening
   */
  listenToPendingFriendRequests(userId, callback) {
    try {
      console.log(
        "📡 Setting up real-time listener for friend requests:",
        userId
      );

      const requestsRef = collection(db, "friendRequests");
      const q = query(
        requestsRef,
        where("toUserId", "==", userId),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const requests = [];
          querySnapshot.forEach((doc) => {
            requests.push({
              id: doc.id,
              ...doc.data(),
            });
          });

          console.log(
            `📬 Real-time update: ${requests.length} pending requests for ${userId}`
          );

          // Transform for UI consumption (same format as existing functions)
          const transformedRequests = requests.map((request) => ({
            ...request,
            handle: request.fromUserInfo?.handle || null,
            major: request.fromUserInfo?.major || "Unknown Major",
            university:
              request.fromUserInfo?.university || "Unknown University",
          }));

          // Call the callback with the fresh data
          callback(transformedRequests);
        },
        (error) => {
          // Suppress noisy errors during logout/auth changes
          if (error.code === "permission-denied" || !auth.currentUser) {
            console.info(
              "ℹ️ Friend requests listener ended due to auth change (ignored)"
            );
            return; // Skip callback to prevent false deletion detection
          }
          console.error("❌ Error in friend requests listener:", error);
          callback([]); // Only fallback to empty array for non-permission errors
        }
      );

      console.log("✅ Friend requests listener established successfully");
      return unsubscribe;
    } catch (error) {
      console.error("❌ Error setting up friend requests listener:", error);
      return () => {}; // Return empty unsubscribe function
    }
  }

  /**
   * 📤 Listen for outgoing friend requests in real-time
   *
   * This function sets up a real-time listener for friend requests sent BY the specified user.
   * When the user's sent requests get accepted/rejected, the callback will be triggered instantly!
   *
   * @param {string} userId - User ID to listen for outgoing requests
   * @param {function} callback - Function called when requests change: callback(requests)
   * @returns {function} Unsubscribe function to stop listening
   *
   * Example usage:
   *   const unsubscribe = dataManager.listenToOutgoingFriendRequests(
   *     "user123",
   *     (requests) => console.log("Sent", requests.length, "requests!")
   *   );
   *   // Later: unsubscribe(); // Stop listening
   */
  listenToOutgoingFriendRequests(userId, callback) {
    try {
      console.log(
        "📤 Setting up real-time listener for outgoing friend requests:",
        userId
      );

      const requestsRef = collection(db, "friendRequests");
      const q = query(
        requestsRef,
        where("fromUserId", "==", userId),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const requests = [];
          querySnapshot.forEach((doc) => {
            requests.push({
              id: doc.id,
              ...doc.data(),
            });
          });

          console.log(
            `📤 Real-time update: ${requests.length} outgoing requests for ${userId}`
          );

          // Transform for UI consumption (same format as existing functions)
          const transformedRequests = requests.map((request) => ({
            ...request,
            handle: request.toUserInfo?.handle || null,
            major: request.toUserInfo?.major || "Unknown Major",
            university: request.toUserInfo?.university || "Unknown University",
          }));

          // Call the callback with the fresh data
          callback(transformedRequests);
        },
        (error) => {
          if (error.code === "permission-denied" || !auth.currentUser) {
            console.info(
              "ℹ️ Outgoing requests listener ended due to auth change (ignored)"
            );
            return;
          }
          console.error(
            "❌ Error in outgoing friend requests listener:",
            error
          );
          callback([]);
        }
      );

      console.log(
        "✅ Outgoing friend requests listener established successfully"
      );
      return unsubscribe;
    } catch (error) {
      console.error(
        "❌ Error setting up outgoing friend requests listener:",
        error
      );
      return () => {}; // Return empty unsubscribe function
    }
  }

  /**
   * 📋 Listen for ALL friend requests involving a user (incoming + outgoing)
   *
   * This is a convenience method that combines both incoming and outgoing requests
   * for comprehensive friend request tracking.
   *
   * @param {string} userId - User ID to listen for all friend request activity
   * @param {function} callback - Function called when requests change: callback({incoming, outgoing})
   * @returns {function} Unsubscribe function to stop listening
   */
  listenToAllFriendRequests(userId, callback) {
    let incomingRequests = [];
    let outgoingRequests = [];

    const updateCallback = () => {
      callback({
        incoming: incomingRequests,
        outgoing: outgoingRequests,
        total: incomingRequests.length + outgoingRequests.length,
      });
    };

    // Set up both listeners
    const unsubscribeIncoming = this.listenToPendingFriendRequests(
      userId,
      (requests) => {
        incomingRequests = requests;
        updateCallback();
      }
    );

    const unsubscribeOutgoing = this.listenToOutgoingFriendRequests(
      userId,
      (requests) => {
        outgoingRequests = requests;
        updateCallback();
      }
    );

    // Return combined unsubscribe function
    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }

  /**
   * 👥 Listen for user's friendships in real-time
   *
   * This function sets up a real-time listener for the user's friends list.
   * When someone accepts your friend request or friendships change, the callback triggers instantly!
   *
   * @param {string} userId - User ID to listen for friendship changes
   * @param {function} callback - Function called when friendships change: callback(friendships)
   * @returns {function} Unsubscribe function to stop listening
   *
   * Example usage:
   *   const unsubscribe = dataManager.listenToUserFriendships(
   *     "user123",
   *     (friendships) => console.log("You have", friendships.length, "friends!")
   *   );
   *   // Later: unsubscribe(); // Stop listening
   */
  listenToUserFriendships(userId, callback) {
    try {
      console.log("👥 Setting up real-time listener for friendships:", userId);

      // 🔧 MOBILE FIX: Import mobile-resilient listener system
      const isMobile = this.detectMobileBrowser();

      if (isMobile) {
        console.log(
          "📱 Using mobile-resilient Firebase listener for friendships"
        );
        return this.setupMobileResilientFriendshipsListener(userId, callback);
      }

      // Desktop implementation (existing logic)
      const friendshipsRef = collection(db, "friendships");
      const q = query(
        friendshipsRef,
        where("users", "array-contains", userId),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const friendships = [];
          querySnapshot.forEach((doc) => {
            friendships.push({
              id: doc.id,
              ...doc.data(),
            });
          });

          console.log(
            `🤝 Real-time update: ${friendships.length} active friendships for ${userId}`
          );

          // Transform for UI consumption - extract friend info for each friendship
          const transformedFriendships = friendships.map((friendship) => {
            // Find the friend's user ID (the one that's not the current user)
            const friendId = friendship.users.find((id) => id !== userId);

            // Get friend info based on which user they are in the friendship
            const isUser1 = friendship.user1Id === userId;
            const friendInfo = isUser1
              ? friendship.user2Info
              : friendship.user1Info;

            return {
              ...friendship,
              friendId,
              friendInfo: friendInfo || {
                handle: null,
                major: "Unknown Major",
              },
            };
          });

          // Call the callback with the fresh data
          callback(transformedFriendships);
        },
        (error) => {
          if (error.code === "permission-denied" || !auth.currentUser) {
            console.info(
              "ℹ️ Friendships listener ended due to auth change (ignored)"
            );
            return;
          }
          console.error("❌ Error in friendships listener:", error);
          callback([]);
        }
      );

      console.log("✅ Friendships listener established successfully");
      return unsubscribe;
    } catch (error) {
      console.error("❌ Error setting up friendships listener:", error);
      return () => {}; // Return empty unsubscribe function
    }
  }

  // 🔧 MOBILE-RESILIENT FRIENDSHIPS LISTENER
  setupMobileResilientFriendshipsListener(userId, callback) {
    console.log(
      "📱 Setting up mobile-resilient friendships listener for:",
      userId
    );

    const friendshipsRef = collection(db, "friendships");
    const q = query(
      friendshipsRef,
      where("users", "array-contains", userId),
      orderBy("createdAt", "desc")
    );

    // Connection state tracking
    let reconnectionAttempts = 0;
    let maxReconnectionAttempts = 5;
    let reconnectionTimeout = null;
    let lastSuccessfulUpdate = Date.now();
    let healthCheckInterval = null;
    let isConnected = false;
    let currentUnsubscribe = null;

    // Mobile-specific configuration
    const reconnectionDelayBase = 1000; // Start with 1 second
    const maxReconnectionDelay = 30000; // Max 30 seconds
    let networkChangeCount = 0;
    let queuedUpdates = [];
    const maxQueueSize = 10;

    const processUpdate = (querySnapshot, metadata = {}) => {
      try {
        const friendships = [];
        querySnapshot.forEach((doc) => {
          friendships.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        const updateInfo = {
          count: friendships.length,
          fromCache:
            metadata.fromCache || querySnapshot.metadata?.fromCache || false,
          hasPendingWrites:
            metadata.hasPendingWrites ||
            querySnapshot.metadata?.hasPendingWrites ||
            false,
          isMobileOptimized: true,
          connectionAttempts: reconnectionAttempts,
          networkChanges: networkChangeCount,
        };

        console.log(
          `📱 Mobile-resilient friendships update: ${updateInfo.count} friendships`,
          updateInfo
        );

        // Transform for UI consumption
        const transformedFriendships = friendships.map((friendship) => {
          const friendId = friendship.users.find((id) => id !== userId);
          const isUser1 = friendship.user1Id === userId;
          const friendInfo = isUser1
            ? friendship.user2Info
            : friendship.user1Info;

          return {
            ...friendship,
            friendId: friendId,
            friendInfo: friendInfo || {
              handle: null,
              major: "Unknown Major",
            },
            _mobileMetadata: updateInfo,
          };
        });

        callback(transformedFriendships);
        lastSuccessfulUpdate = Date.now();
      } catch (processingError) {
        console.error(
          "📱 Error processing mobile friendships update:",
          processingError
        );
      }
    };

    const handleError = (error) => {
      // Downgrade noise on auth transitions: permission-denied is expected when signed out
      const isAuthMissing = !auth?.currentUser;
      const isPermissionDenied = error?.code === "permission-denied";
      const logMethod = isPermissionDenied || isAuthMissing ? console.info : console.error;
      logMethod("📱 Mobile-resilient friendships listener error:", {
        code: error?.code,
        message: error?.message,
        connectionAttempts: reconnectionAttempts,
        isOnline: navigator.onLine,
        timestamp: new Date().toISOString(),
      });

      isConnected = false;

      // If user is signed out, don't attempt to reconnect; let auth flow recreate on next login
      if (isAuthMissing) {
        callback([]);
        return;
      }

      // Handle different error types with mobile-specific strategies
      const shouldReconnect = this.shouldReconnectMobileListener(
        error,
        reconnectionAttempts
      );

      if (shouldReconnect && reconnectionAttempts < maxReconnectionAttempts) {
        scheduleReconnection();
      } else if (!isPermissionDenied) {
        console.warn(
          "📱 Mobile friendships listener: Max reconnection attempts reached or permanent error"
        );
        callback([]); // Fallback to empty array for non-permission errors
      }
    };

    const scheduleReconnection = () => {
      if (reconnectionTimeout) return; // Already scheduled

      reconnectionAttempts++;
      const delay =
        Math.min(
          reconnectionDelayBase * Math.pow(2, reconnectionAttempts - 1),
          maxReconnectionDelay
        ) +
        Math.random() * 1000; // Add jitter

      console.log(
        `📱 Scheduling friendships listener reconnection in ${Math.round(
          delay
        )}ms (attempt ${reconnectionAttempts}/${maxReconnectionAttempts})`
      );

      reconnectionTimeout = setTimeout(() => {
        reconnectionTimeout = null;
        connectListener();
      }, delay);
    };

    const connectListener = () => {
      // Clean up existing connection
      if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
      }

      console.log(
        `📱 Connecting mobile-resilient friendships listener (attempt ${
          reconnectionAttempts + 1
        })`
      );

      try {
        currentUnsubscribe = onSnapshot(
          q,
          (querySnapshot) => {
            isConnected = true;
            reconnectionAttempts = 0; // Reset on successful connection

            // Process queued updates first if any
            if (queuedUpdates.length > 0) {
              console.log(
                `📱 Processing ${queuedUpdates.length} queued friendships updates`
              );
              queuedUpdates.forEach((update) =>
                processUpdate(update.snapshot, update.metadata)
              );
              queuedUpdates = [];
            }

            processUpdate(querySnapshot);
          },
          handleError
        );

        // Start health monitoring
        startHealthMonitoring();
      } catch (connectionError) {
        console.error(
          "📱 Failed to connect mobile-resilient friendships listener:",
          connectionError
        );
        handleError(connectionError);
      }
    };

    const startHealthMonitoring = () => {
      if (healthCheckInterval) clearInterval(healthCheckInterval);

      healthCheckInterval = setInterval(() => {
        const timeSinceLastUpdate = Date.now() - lastSuccessfulUpdate;
        const healthThreshold = 90000; // 90 seconds threshold for mobile

        if (
          timeSinceLastUpdate > healthThreshold &&
          navigator.onLine &&
          isConnected
        ) {
          console.warn(
            `📱 Friendships listener health check failed - ${Math.round(
              timeSinceLastUpdate / 1000
            )}s since last update`
          );
          // Force reconnection
          reconnectionAttempts = 0;
          scheduleReconnection();
        }
      }, 30000); // Check every 30 seconds
    };

    // Handle network state changes
    const handleNetworkChange = () => {
      networkChangeCount++;
      console.log(
        `📱 Network change detected for friendships listener (count: ${networkChangeCount})`
      );

      if (navigator.onLine && !isConnected) {
        console.log(
          "📱 Network back online - reconnecting friendships listener"
        );
        reconnectionAttempts = 0; // Reset attempts on network recovery
        scheduleReconnection();
      }
    };

    window.addEventListener("online", handleNetworkChange);
    window.addEventListener("offline", handleNetworkChange);

    // Initial connection
    connectListener();

    // Return cleanup function
    return () => {
      console.log("📱 Cleaning up mobile-resilient friendships listener");

      if (currentUnsubscribe) currentUnsubscribe();
      if (reconnectionTimeout) clearTimeout(reconnectionTimeout);
      if (healthCheckInterval) clearInterval(healthCheckInterval);

      window.removeEventListener("online", handleNetworkChange);
      window.removeEventListener("offline", handleNetworkChange);

      isConnected = false;
      queuedUpdates = [];
    };
  }

  shouldReconnectMobileListener(error, attempts) {
    const networkErrors = ["unavailable", "cancelled", "deadline-exceeded"];
    const permanentErrors = ["permission-denied", "not-found"];

    if (permanentErrors.includes(error.code)) {
      return false;
    }

    if (networkErrors.includes(error.code) && navigator.onLine) {
      return attempts < 5; // More aggressive retry for network errors when online
    }

    return attempts < 3; // Conservative retry for other errors
  }

  detectMobileBrowser() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRegex =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isSmallScreen =
      window.screen.width <= 768 || window.screen.height <= 768;

    return mobileRegex.test(userAgent) || (hasTouch && isSmallScreen);
  }

  /**
   * 👤 Listen for user's profile changes in real-time
   *
   * This function sets up a real-time listener for changes to a user's profile.
   * Useful for detecting when friends update their profiles, avatars, or status!
   *
   * @param {string} userId - User ID to listen for profile changes
   * @param {function} callback - Function called when profile changes: callback(profileData)
   * @returns {function} Unsubscribe function to stop listening
   *
   * Example usage:
   *   const unsubscribe = dataManager.listenToUserProfile(
   *     "user123",
   *     (profile) => console.log("Profile updated:", profile.profile?.handle)
   *   );
   *   // Later: unsubscribe(); // Stop listening
   */
  listenToUserProfile(userId, callback) {
    try {
      console.log("👤 Setting up real-time listener for user profile:", userId);

      const userDocRef = doc(db, "users", userId);

      const unsubscribe = onSnapshot(
        userDocRef,
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const profileData = {
              id: docSnapshot.id,
              ...docSnapshot.data(),
            };

            // ⚡ Throttle profile change processing to prevent spam
            const now = Date.now();
            const lastProcessTime = this.profileChangeThrottle.get(userId) || 0;
            const throttleDelay = 3000; // 3 seconds

            if (now - lastProcessTime < throttleDelay) {
              logManager.profileUpdate(userId, "throttled");
              // Update cache but skip processing
              this.setCachedData(`user_${userId}`, profileData);
              callback(profileData);
              return;
            }

            this.profileChangeThrottle.set(userId, now);
            logManager.profileUpdate(userId, "changed");

            // 🔄 Skip cache sync if this is a Quick Access update to prevent cascading
            const isQuickAccessUpdate =
              this.quickAccessUpdateInProgress.has(userId);

            // 🔄 Compare with previous cached data to avoid unnecessary syncs
            const cachedData = this.getCachedData(`user_${userId}`);
            const hasSignificantChange =
              !isQuickAccessUpdate &&
              (!cachedData ||
                JSON.stringify(cachedData.avatarConfig) !==
                  JSON.stringify(profileData.avatarConfig) ||
                cachedData.profile?.handle !== profileData.profile?.handle ||
                cachedData.profile?.major !== profileData.profile?.major);

            // Update local cache with fresh data
            this.setCachedData(`user_${userId}`, profileData);

            // 🔒 SECURITY: Only sync cache for the current user's own profile changes
            const currentUser = auth.currentUser;
            const isCurrentUserProfile =
              currentUser && userId === currentUser.uid;

            if (hasSignificantChange && isCurrentUserProfile) {
              console.log(
                "🎨 Significant profile change detected for current user, syncing cached data..."
              );

              // Clear any avatar cache in friends manager to force fresh data
              if (
                typeof window !== "undefined" &&
                window.friendsManager?.clearAvatarCache
              ) {
                try {
                  window.friendsManager.clearAvatarCache(userId);
                } catch (error) {
                  console.warn("⚠️ Avatar cache clear failed:", error);
                }
              }

              // Debounce cache sync to prevent excessive operations
              this.debounceCacheSync(userId);
            } else if (hasSignificantChange && !isCurrentUserProfile) {
              // Skipping cache sync (not current user)
            } else if (isQuickAccessUpdate) {
              // Skipping cache sync for Quick Access update to prevent cascading
            }

            // Call the callback with the fresh profile data
            callback(profileData);
          } else {
            console.warn(`👤 User profile not found: ${userId}`);
            callback(null);
          }
        },
        (error) => {
          if (error.code === "permission-denied" || !auth.currentUser) {
            console.info(
              "ℹ️ User profile listener ended due to auth change (ignored)"
            );
            return;
          }
          console.error("❌ Error in user profile listener:", error);
          callback(null);
        }
      );

      console.log("✅ User profile listener established successfully");
      return unsubscribe;
    } catch (error) {
      console.error("❌ Error setting up user profile listener:", error);
      return () => {}; // Return empty unsubscribe function
    }
  }

  // =========================
  // PHASE-2: QUICK ACCESS DATABASE OPERATIONS
  // =========================

  /**
   * ⭐ Add a friend to user's Quick Access (starred friends)
   * @param {string} userId - The user's ID
   * @param {Object} quickAccessEntry - Friend's Quick Access data
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async addToQuickAccess(userId, quickAccessEntry) {
    try {
      if (!userId || !quickAccessEntry) {
        throw new Error("Invalid userId or quickAccessEntry");
      }

      if (!this.isOnline) {
        throw new Error("Cannot update Quick Access while offline");
      }

      console.log(
        "⭐ [DataManager] Adding to Quick Access (handle):",
        quickAccessEntry.handle
      );

      // First, get current user data to check if quickAccessData exists
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        throw new Error("User document not found");
      }

      const userData = userDoc.data();
      const currentQuickAccess = userData.quickAccessData || {};
      const friends = currentQuickAccess.starredFriends || [];

      // Check if friend is already in Quick Access (prevent duplicates)
      const existingIndex = friends.findIndex(
        (friend) => friend.friendId === quickAccessEntry.friendId
      );

      let updatedFriends;
      if (existingIndex >= 0) {
        // Update existing entry (move to recent-first position)
        updatedFriends = [...friends];
        updatedFriends[existingIndex] = {
          ...updatedFriends[existingIndex],
          lastInteraction: quickAccessEntry.lastInteraction,
        };
      } else {
        // Add new entry to the beginning (recent-first)
        updatedFriends = [quickAccessEntry, ...friends];
      }

      // Mark Quick Access update in progress to prevent cascading events
      this.quickAccessUpdateInProgress.add(userId);

      // Update the user document with enhanced Quick Access data
      // Note: Avoid updating systemInfo.lastUpdated to prevent cascade of profile change events
      await updateDoc(userDocRef, {
        "quickAccessData.starredFriends": updatedFriends,
        "quickAccessData.totalStarred": updatedFriends.length,
        "quickAccessData.lastUpdated": serverTimestamp(),
      });

      // Clear cache immediately after database update to ensure fresh data
      const cacheKey = `quick_access_${userId}`;
      this.cache.delete(cacheKey);
      console.log(`🧹 [DataManager] Cleared Quick Access cache for ${userId}`);

      // Clear the flag after a short delay to allow real-time propagation
      setTimeout(() => {
        this.quickAccessUpdateInProgress.delete(userId);
      }, 2000);

      console.log("✅ [DataManager] Successfully added to Quick Access");
      return { success: true };
    } catch (error) {
      console.error("❌ [DataManager] Error adding to Quick Access:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ❌ Remove a friend from user's Quick Access
   * @param {string} userId - The user's ID
   * @param {string} friendId - The friend's user ID to remove
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async removeFromQuickAccess(userId, friendId) {
    try {
      // Skip if user is signed out or during intentional logout
      const intentionalLogout =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("intentionalLogout") === "true";
      if (intentionalLogout || !auth.currentUser) {
        console.info(
          "ℹ️ [DataManager] Skipping removeFromQuickAccess (signed out or intentional logout)"
        );
        return { success: true, skipped: true };
      }

      if (!userId || !friendId) {
        throw new Error("Invalid userId or friendId");
      }

      if (!this.isOnline) {
        throw new Error("Cannot update Quick Access while offline");
      }

      console.log("❌ [DataManager] Removing from Quick Access:", friendId);

      // Get current user data
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        throw new Error("User document not found");
      }

      const userData = userDoc.data();
      const currentQuickAccess = userData.quickAccessData || {};
      const friends = currentQuickAccess.starredFriends || [];

      // Filter out the friend to remove
      const updatedFriends = friends.filter(
        (friend) => friend.friendId !== friendId
      );

      // Mark Quick Access update in progress to prevent cascading events
      this.quickAccessUpdateInProgress.add(userId);

      // Update the user document
      // Note: Avoid updating systemInfo.lastUpdated to prevent cascade of profile change events
      await updateDoc(userDocRef, {
        "quickAccessData.starredFriends": updatedFriends,
        "quickAccessData.totalStarred": updatedFriends.length,
        "quickAccessData.lastUpdated": serverTimestamp(),
      });

      // Clear cache immediately after database update to ensure fresh data
      const cacheKey = `quick_access_${userId}`;
      this.cache.delete(cacheKey);
      console.log(`🧹 [DataManager] Cleared Quick Access cache for ${userId}`);

      // Clear the flag after a short delay to allow real-time propagation
      setTimeout(() => {
        this.quickAccessUpdateInProgress.delete(userId);
      }, 2000);

      console.log("✅ [DataManager] Successfully removed from Quick Access");
      return { success: true };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error removing from Quick Access:",
        error
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * 📋 Get user's Quick Access friends data
   * @param {string} userId - The user's ID
   * @returns {Promise<Object|null>} Quick Access data or null if not found
   */
  async getQuickAccessFriends(userId) {
    try {
      // Skip Firestore read if signed out or during intentional logout
      const intentionalLogout =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("intentionalLogout") === "true";
      // NEW: If auth isn't ready yet on first load, wait briefly instead of returning a skipped result
      if (!intentionalLogout && !auth.currentUser) {
        try {
          // Small wait to let Firebase auth settle on first app open
          await currentUser.waitForUid(1500);
        } catch (_) {
          /* non-fatal */
        }
      }

      if (intentionalLogout || !auth.currentUser) {
        return {
          starredFriends: [],
          totalStarred: 0,
          lastUpdated: null,
          skipped: true,
        };
      }

      if (!userId) {
        console.warn(
          "[DataManager] getQuickAccessFriends called without userId (likely early init) – returning empty result"
        );
        return {
          starredFriends: [],
          totalStarred: 0,
          lastUpdated: null,
        };
      }

      console.log("📋 [DataManager] Getting Quick Access friends for:", userId);

      // Check cache first
      const cacheKey = `quick_access_${userId}`;
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) {
        console.log("📦 [DataManager] Using cached Quick Access data");
        return cachedData;
      }

      // Get from Firestore
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.log("❌ [DataManager] User document not found");
        return null;
      }

      const userData = userDoc.data();
      const quickAccessData = userData.quickAccessData || {
        starredFriends: [],
        totalStarred: 0,
        lastUpdated: null,
      };

      // Cache the result
      this.setCachedData(cacheKey, quickAccessData);

      console.log(
        `✅ [DataManager] Found ${
          quickAccessData.starredFriends?.length || 0
        } Quick Access friends`
      );
      return quickAccessData;
    } catch (error) {
      console.error(
        "❌ [DataManager] Error getting Quick Access friends:",
        error
      );
      return null;
    }
  }

  /**
   * 🔄 Update Quick Access order (recent-first ordering)
   * @param {string} userId - The user's ID
   * @param {string} friendId - The friend's user ID to update
   * @param {Date} newTimestamp - New last interaction timestamp
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateQuickAccessOrder(userId, friendId, newTimestamp) {
    try {
      if (!userId || !friendId || !newTimestamp) {
        throw new Error("Invalid parameters for updateQuickAccessOrder");
      }

      if (!this.isOnline) {
        throw new Error("Cannot update Quick Access while offline");
      }

      console.log(
        "🔄 [DataManager] Updating Quick Access order for:",
        friendId
      );

      // Get current user data
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        throw new Error("User document not found");
      }

      const userData = userDoc.data();
      const currentQuickAccess = userData.quickAccessData || {};
      const starredFriends = currentQuickAccess.starredFriends || [];

      // Find and update the friend's last interaction timestamp
      const updatedStarredFriends = starredFriends.map((friend) => {
        if (friend.userId === friendId) {
          return {
            ...friend,
            lastInteraction: newTimestamp,
          };
        }
        return friend;
      });

      // Sort by recent-first (most recent interaction first)
      updatedStarredFriends.sort((a, b) => {
        const dateA =
          a.lastInteraction?.toDate?.() ||
          new Date(a.lastInteraction || a.starredAt);
        const dateB =
          b.lastInteraction?.toDate?.() ||
          new Date(b.lastInteraction || b.starredAt);
        return dateB - dateA;
      });

      // Update the user document
      await updateDoc(userDocRef, {
        "quickAccessData.starredFriends": updatedStarredFriends,
        "quickAccessData.lastUpdated": serverTimestamp(),
        "systemInfo.lastUpdated": serverTimestamp(),
      });

      // Clear cache to force refresh
      this.clearCachedData(`quick_access_${userId}`);

      console.log("✅ [DataManager] Successfully updated Quick Access order");
      return { success: true };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error updating Quick Access order:",
        error
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Refresh cached data for a specific starred friend in user's QuickAccess
   * This updates displayName, major, and avatarConfig while preserving user-specific data
   * @param {string} userId - The user whose QuickAccess needs updating
   * @param {string} friendId - The friend whose data needs refreshing
   * @returns {Promise<Object>} Success status and updated friend data
   */
  async refreshStarredFriendData(userId, friendId) {
    try {
      if (!userId || !friendId) {
        throw new Error("Invalid userId or friendId");
      }

      console.log(
        `🔄 [DataManager] Refreshing starred friend data for user ${userId}, friend ${friendId}`
      );

      // Get both user documents in parallel
      const [userDoc, friendDoc] = await Promise.all([
        getDoc(doc(db, "users", userId)),
        getDoc(doc(db, "users", friendId)),
      ]);

      if (!userDoc.exists()) {
        throw new Error("User document not found");
      }

      if (!friendDoc.exists()) {
        console.warn(
          `⚠️ Friend document ${friendId} not found - may have been deleted`
        );
        return { success: false, error: "Friend not found" };
      }

      const userData = userDoc.data();
      const friendData = friendDoc.data();
      const currentQuickAccess = userData.quickAccessData || {};
      const starredFriends = currentQuickAccess.starredFriends || [];

      // Find the starred friend to update
      const friendIndex = starredFriends.findIndex(
        (friend) => friend.userId === friendId
      );

      if (friendIndex === -1) {
        console.log(
          `ℹ️ Friend ${friendId} not found in user ${userId}'s starred friends`
        );
        return { success: false, error: "Friend not starred" };
      }

      // Create updated friend data - preserve user-specific fields, update cached profile fields
      const existingFriend = starredFriends[friendIndex];
      const updatedFriend = {
        ...existingFriend, // Preserve starredAt, lastInteraction, etc.
        // Update cached fields with fresh data from friend's profile
        handle: friendData.profile?.handle || existingFriend.handle,
        major: friendData.profile?.major || existingFriend.major,
        avatarConfig: friendData.avatarConfig || existingFriend.avatarConfig,
        // Add update timestamp to track freshness
        lastProfileSync: serverTimestamp(),
      };

      // Update the starred friends array
      const updatedStarredFriends = [...starredFriends];
      updatedStarredFriends[friendIndex] = updatedFriend;

      // Update the user document
      await updateDoc(doc(db, "users", userId), {
        "quickAccessData.starredFriends": updatedStarredFriends,
        "quickAccessData.lastUpdated": serverTimestamp(),
        "systemInfo.lastUpdated": serverTimestamp(),
      });

      // Clear cache to force refresh
      this.clearCachedData(`quick_access_${userId}`);

      console.log(
        `✅ [DataManager] Successfully refreshed friend data for @${friendData.profile?.handle}`
      );

      return {
        success: true,
        updatedFriend: updatedFriend,
        friendData: {
          handle: friendData.profile?.handle,
          major: friendData.profile?.major,
          avatarConfig: friendData.avatarConfig,
        },
      };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error refreshing starred friend data:",
        error
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Simple refresh of starred friends with fresh profile data
   * @param {string} userId - The user's ID
   * @returns {Promise<{success: boolean, updated: number}>}
   */
  async refreshStarredFriendsProfiles(userId) {
    try {
      if (!userId) {
        return { success: false, updated: 0 };
      }

      console.log(
        `🔄 [DataManager] Refreshing starred friends profiles for ${userId}`
      );

      // Get current starred friends
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        return { success: false, updated: 0 };
      }

      const currentStarredFriends =
        userDoc.data().quickAccessData?.starredFriends || [];
      if (currentStarredFriends.length === 0) {
        console.log("ℹ️ No starred friends to refresh");
        return { success: true, updated: 0 };
      }

      // Fetch fresh profile data for all starred friends
      const friendIds = currentStarredFriends.map(
        (f) => f.friendId || f.userId
      );
      const freshProfileDocs = await Promise.all(
        friendIds.map((friendId) => getDoc(doc(db, "users", friendId)))
      );

      // Update starred friends with fresh data
      const updatedStarredFriends = currentStarredFriends.map(
        (existingFriend, index) => {
          const freshDoc = freshProfileDocs[index];
          if (!freshDoc.exists()) {
            return existingFriend; // Keep existing if friend not found
          }

          const freshData = freshDoc.data();
          return {
            ...existingFriend, // Keep starredAt, lastInteraction
            handle: freshData.profile?.handle || existingFriend.handle,
            major: freshData.profile?.major || existingFriend.major,
            avatarConfig: freshData.avatarConfig || existingFriend.avatarConfig,
          };
        }
      );

      // Update database
      await updateDoc(doc(db, "users", userId), {
        "quickAccessData.starredFriends": updatedStarredFriends,
        "quickAccessData.lastUpdated": serverTimestamp(),
      });

      // Clear relevant caches to force fresh data on next access
      const cacheKey = `quick_access_${userId}`;
      this.cache.delete(cacheKey);

      // Clear FriendsService cache if it exists
      if (typeof window !== "undefined" && window.friendsManager) {
        const cacheKey = `quick_access_${userId}`;
        if (typeof window.friendsManager.clearCached === "function") {
          window.friendsManager.clearCached(cacheKey);
        }
      }

      console.log(
        `✅ [DataManager] Refreshed ${updatedStarredFriends.length} starred friends`
      );
      return { success: true, updated: updatedStarredFriends.length };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error refreshing starred friends:",
        error
      );
      return { success: false, updated: 0 };
    }
  }

  // =============================================================================
  //                          CAMPUS PRESENCE METHODS
  // =============================================================================

  /**
   * Updates a user's campus location status
   * @param {string} userId - The user's ID
   * @param {string} campusStatus - "on_campus", "off_campus", or "unknown"
   * @param {Object|null} coordinates - Optional coordinates {latitude, longitude}
   * @returns {Promise<Object>} Result object with success status
   */
  async updateUserLocationStatus(userId, campusStatus, coordinates = null) {
    try {
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId");
      }

      // Validate campusStatus values
      const validStatuses = ["on_campus", "off_campus", "unknown"];
      if (
        !campusStatus ||
        typeof campusStatus !== "string" ||
        !validStatuses.includes(campusStatus)
      ) {
        throw new Error(
          `Invalid campusStatus: "${campusStatus}". Must be one of: ${validStatuses.join(
            ", "
          )}`
        );
      }

      // Safe nested field update: ensure systemInfo object exists first
      const userRef = doc(db, "users", userId);

      // First, ensure systemInfo parent object exists
      await this.ensureSystemInfoExists(userId);

      // 🔧 NEW: Detect if this is network-based detection (TIER 1)
      const isNetworkDetection =
        coordinates && coordinates.networkDetection === true;

      // 🔧 VALIDATION: Handle network detection vs GPS-based detection differently
      // Check if coordinates are valid (not null) and accuracy is acceptable
      const hasValidCoordinates =
        coordinates &&
        coordinates.latitude !== null &&
        coordinates.longitude !== null &&
        coordinates.latitude !== undefined &&
        coordinates.longitude !== undefined;

      // Use same accuracy threshold as 3-tier system (2000m + 5% tolerance = 2100m)
      const accuracyThreshold = 2000;
      const tolerance = accuracyThreshold * 0.05; // 5% tolerance (100m)
      const acceptableAccuracy = accuracyThreshold + tolerance; // 2100m
      const hasAcceptableAccuracy =
        coordinates &&
        coordinates.accuracy !== null &&
        coordinates.accuracy !== undefined &&
        coordinates.accuracy <= acceptableAccuracy;

      // 🔧 TIER 1 NETWORK DETECTION: Allow without GPS coordinates
      if (isNetworkDetection) {
        console.log(
          `🏢 [DataManager] Network-based detection for user ${userId} - proceeding without GPS validation`
        );
        // Respect user preference: do NOT auto-enable global location sharing
        // Only update lastKnownLocation below; the global flag is controlled by explicit user action
      } else {
        // 🔧 GPS-BASED DETECTION: Require valid coordinates and accuracy
        if (!hasValidCoordinates || !hasAcceptableAccuracy) {
          const reason = !hasValidCoordinates
            ? "null/invalid coordinates"
            : `poor accuracy (${coordinates?.accuracy}m > ${Math.round(
                acceptableAccuracy
              )}m)`;
          logManager.db.write(
            `Skipping database write for user ${userId}: ${reason} - letting 3-tier system continue to next tier`
          );

          return {
            success: true,
            skipped: true,
            reason: reason,
            message: "3-tier system will continue to get better location data",
          };
        }
      }

      // 🔧 FIX: Properly structure coordinates for Firestore
      let coordinatesForFirestore = null;
      if (
        coordinates &&
        typeof coordinates === "object" &&
        hasValidCoordinates
      ) {
        coordinatesForFirestore = {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          accuracy: coordinates.accuracy,
          // Convert timestamp to proper format for Firestore
          timestamp: coordinates.timestamp
            ? new Date(coordinates.timestamp).toISOString()
            : new Date().toISOString(),
        };
      }

      // 🔧 NEW: Structure network detection info for Firestore
      let networkInfo = null;
      if (isNetworkDetection && coordinates) {
        networkInfo = {
          networkDetection: true,
          ipOrganization: coordinates.ipOrganization || "Unknown",
          detectionMethod: "ipinfo_lite_as_domain",
          timestamp: coordinates.timestamp
            ? new Date(coordinates.timestamp).toISOString()
            : new Date().toISOString(),
        };
      }

      const updates = {
        "systemInfo.lastActive": serverTimestamp(),
        "systemInfo.status": "online", // 🔧 FIX: Set status to online when location is updated
        "systemInfo.lastKnownLocation": {
          campusStatus,
          detectedAt: serverTimestamp(),
          lastUpdated: serverTimestamp(), // 🔧 FIX: Add lastUpdated field
          coordinates: coordinatesForFirestore,
          ...(networkInfo && { networkInfo }), // Add network info if available
        },
      };

      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.updateUserLocationStatus(userId, campusStatus, coordinates)
        );
        this.showNotification("Location will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, cached: true };
      }

      await updateDoc(userRef, updates);

      // Updated location status in database
      return { success: true };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error updating user location status:",
        error
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Update user's last active timestamp only (separate from location updates)
   * Used by activity heartbeat system for accurate presence tracking
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} Result object with success status
   */
  async updateUserLastActive(userId) {
    try {
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId");
      }

      // Safe nested field update: ensure systemInfo object exists first
      const userRef = doc(db, "users", userId);

      // First, ensure systemInfo parent object exists
      if (!this._systemInfoEnsured.has(userId)) {
        await this.ensureSystemInfoExists(userId);
      }

      const updates = {
        "systemInfo.lastActive": serverTimestamp(),
      };

      if (!this.isOnline) {
        this.pendingOperations.push(() => this.updateUserLastActive(userId));
        // Activity update cached (offline)
        return { success: true, cached: true };
      }

      await updateDoc(userRef, updates);

      // Updated last active timestamp
      return { success: true };
    } catch (error) {
      if (error.code === "permission-denied" || !auth.currentUser) {
        console.info(
          "ℹ️ Skipping lastActive update after auth change (ignored)"
        );
        return { success: false, error: "permission_denied" };
      }
      console.error(`❌ [DataManager] Error updating user last active:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Updates a user's location sharing preference
   * @param {string} userId - The user's ID
   * @param {boolean} enabled - Whether location sharing is enabled
   * @returns {Promise<Object>} Result object with success status
   */
  async updateLocationSharingPreference(userId, enabled) {
    try {
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId");
      }

      if (typeof enabled !== "boolean") {
        throw new Error("Invalid enabled parameter - must be boolean");
      }

      // Safe nested field update: ensure systemInfo object exists first
      const userRef = doc(db, "users", userId);

      // First, ensure systemInfo parent object exists
      await this.ensureSystemInfoExists(userId);

      const updates = {
        "systemInfo.locationSharingEnabled": enabled,
        "systemInfo.lastUpdated": serverTimestamp(),
      };

      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.updateLocationSharingPreference(userId, enabled)
        );
        this.showNotification("Preference will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, cached: true };
      }

      await updateDoc(userRef, updates);

      console.log(
        `✅ [DataManager] Updated location sharing preference for user ${userId}: ${
          enabled ? "enabled" : "disabled"
        }`
      );
      // Update in-memory cache
      const cacheKey = `user_${userId}`;
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) {
        if (!cachedData.systemInfo) cachedData.systemInfo = {};
        cachedData.systemInfo.locationSharingEnabled = enabled;
        cachedData.systemInfo.lastUpdated = new Date().toISOString();
        this.setCachedData(cacheKey, cachedData);
      }

      // Update current user store if applicable
      try {
        // currentUser statically imported
        if (currentUser?.uid === userId && currentUser?.profile) {
          const merged = {
            ...currentUser.profile,
            systemInfo: {
              ...(currentUser.profile.systemInfo || {}),
              locationSharingEnabled: enabled,
            },
          };
          currentUser.setProfile(merged);
        }
      } catch (_) {
        // best-effort; ignore store update errors
      }

      return { success: true };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error updating location sharing preference:",
        error
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure systemInfo object exists in user document before nested field updates
   * Prevents silent failures when updating nested fields on non-existent parent objects
   * @param {string} userId - User ID to check/create systemInfo for
   */
  async ensureSystemInfoExists(userId) {
    try {
      if (this._systemInfoEnsured && this._systemInfoEnsured.has(userId)) {
        return true; // Already verified
      }
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error(`User document not found: ${userId}`);
      }

      const userData = userDoc.data();

      // Check if systemInfo object exists and has basic structure
      if (!userData.systemInfo || typeof userData.systemInfo !== "object") {
        console.log(
          `🔧 [DataManager] Creating missing systemInfo object for user: ${userId}`
        );

        // Create systemInfo with essential fields
        const systemInfoDefaults = {
          uid: userId,
          status: "offline",
          lastActive: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          // Location fields will be added as needed
        };

        await updateDoc(userRef, {
          systemInfo: systemInfoDefaults,
        });

        console.log(
          `✅ [DataManager] Created systemInfo object for user: ${userId}`
        );
      }

      return true;
    } catch (error) {
      console.error(
        `❌ [DataManager] Error ensuring systemInfo exists for ${userId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a friendship document by its ID
   * @param {string} friendshipId - The friendship document ID
   * @returns {Promise<Object|null>} Friendship document data or null if not found
   */
  async getFriendshipDocument(friendshipId) {
    try {
      if (!friendshipId || typeof friendshipId !== "string") {
        console.error("❌ [DataManager] Invalid friendship ID:", friendshipId);
        return null;
      }
      // ⏱️ CACHE CHECK
      const cached = this._friendshipCache.get(friendshipId);
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }

      console.log(
        `📋 [DataManager] Fetching friendship document: ${friendshipId}`
      );

      const friendshipRef = doc(db, "friendships", friendshipId);
      const friendshipDoc = await getDoc(friendshipRef);

      if (!friendshipDoc.exists()) {
        console.warn(
          `⚠️ [DataManager] Friendship document not found: ${friendshipId}`
        );
        return null;
      }

      const friendshipData = { id: friendshipDoc.id, ...friendshipDoc.data() };

      // Store in cache
      this._friendshipCache.set(friendshipId, {
        data: friendshipData,
        expiry: Date.now() + this._friendshipCacheTTL,
      });

      console.log(
        `✅ [DataManager] Successfully fetched friendship document: ${friendshipId}`
      );
      return friendshipData;
    } catch (error) {
      console.error(
        `❌ [DataManager] Error fetching friendship document ${friendshipId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Updates bilateral location sharing settings for a friendship
   * @param {string} friendshipId - The friendship document ID
   * @param {string} userId - The user making the change
   * @param {boolean} enabled - Whether location sharing is enabled for this user
   * @returns {Promise<Object>} Result object with success status
   */
  async updateBilateralLocationSharing(friendshipId, userId, enabled) {
    try {
      if (!friendshipId || typeof friendshipId !== "string") {
        throw new Error("Invalid friendshipId");
      }

      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId");
      }

      if (typeof enabled !== "boolean") {
        throw new Error("Invalid enabled parameter - must be boolean");
      }

      const updates = {
        [`locationVisibility.${userId}`]: enabled,
        "locationSharingMetadata.lastLocationUpdate": serverTimestamp(),
        "locationSharingMetadata.locationUpdatedBy": userId,
      };

      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.updateBilateralLocationSharing(friendshipId, userId, enabled)
        );
        this.showNotification(
          "Location sharing will sync when online",
          "info",
          {
            duration: 4000,
          }
        );
        return { success: true, cached: true };
      }

      await updateDoc(doc(db, "friendships", friendshipId), updates);

      console.log(
        `✅ [DataManager] Updated bilateral location sharing for friendship ${friendshipId}, user ${userId}: ${
          enabled ? "enabled" : "disabled"
        }`
      );
      return { success: true };
    } catch (error) {
      console.error(
        "❌ [DataManager] Error updating bilateral location sharing:",
        error
      );
      return { success: false, error: error.message };
    }
  }

  // =========================
  // NOTIFICATION CRUD METHODS (Campus Presence Integration)
  // =========================

  /**
   * 📬 Create a new notification document
   *
   * Used for campus presence notifications like location sharing requests,
   * friend requests, and system notifications.
   *
   * @param {Object} notificationData - The notification data to create
   * @param {string} notificationData.userId - Recipient user ID
   * @param {string} notificationData.type - Notification type (location_share_request, friend_request, etc.)
   * @param {string} notificationData.fromUserId - Sender user ID
   * @param {Object} notificationData.fromUserInfo - Cached sender info
   * @param {string} notificationData.status - Notification status (pending, read, dismissed)
   * @param {Object} [notificationData.locationRequest] - Location request specific data
   * @param {Array} [notificationData.actionButtons] - Available action buttons
   * @returns {Promise<{success: boolean, notificationId?: string, error?: string}>}
   */
  async createNotification(notificationData) {
    try {
      console.log("📬 Creating notification...", notificationData);

      // Validate required fields
      if (
        !notificationData.userId ||
        !notificationData.type ||
        !notificationData.fromUserId
      ) {
        throw new Error(
          "Missing required notification fields: userId, type, or fromUserId"
        );
      }

      const notificationsRef = collection(db, "notifications");

      // Set expiration (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const docRef = await addDoc(notificationsRef, {
        ...notificationData,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        status: notificationData.status || "pending",
      });

      console.log("✅ Notification created successfully with ID:", docRef.id);
      return { success: true, notificationId: docRef.id };
    } catch (error) {
      console.error("❌ Error creating notification:", error);

      // Handle offline scenario
      if (!navigator.onLine) {
        this.pendingOperations.push({
          type: "createNotification",
          data: notificationData,
          timestamp: Date.now(),
        });
        console.log("📱 Notification queued for when online");
        return { success: false, error: "Offline - queued for retry" };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Create availability ping notifications for multiple recipients (per friend cooldown respected by caller)
   * @param {string} fromUserId
   * @param {Array<string>} recipientIds
   * @param {Object} fromUserInfo - cached sender info (handle, avatarConfig)
   * @param {string} pingId - session id to group this batch
   */
  async createAvailabilityPings(fromUserId, recipientIds = [], fromUserInfo = {}, pingId) {
    try {
      if (!fromUserId || !Array.isArray(recipientIds) || recipientIds.length === 0)
        return { success: false, error: "Missing sender or recipients" };

      if (!navigator.onLine) {
        this.showNotification("You are offline", "warning");
        return { success: false, error: "offline" };
      }

      const now = Date.now();
      // Availability pings expire after 5 minutes; this also drives the per-friend cooldown
      const expiresAtDate = new Date(now + 5 * 60 * 1000);
      const batchPromises = [];
      const skipped = [];
      const notificationsRef = collection(db, "notifications");

      for (const toUserId of recipientIds) {
        // Guard: skip if an active ping already exists (enforces 5m cooldown client-side)
        try {
          const hasActive = await this.hasActiveAvailabilityPing(fromUserId, toUserId);
          if (hasActive) {
            skipped.push(toUserId);
            continue;
          }
        } catch (_) {}
        const data = {
          userId: toUserId,
          fromUserId,
          type: "availability_ping",
          status: "pending",
          expiresAt: expiresAtDate,
          fromUserInfo: fromUserInfo || {},
          availabilityPing: { pingId: pingId || `ping_${now}` },
        };
        batchPromises.push(
          addDoc(notificationsRef, {
            ...data,
            createdAt: serverTimestamp(),
          })
        );
      }

      await Promise.all(batchPromises);
      return { success: true, createdCount: batchPromises.length, skipped };
    } catch (error) {
      console.error("❌ Error creating availability pings:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build a map of friendId -> expiresAt for active availability pings sent by a user
   */
  async getActiveAvailabilityPingMap(fromUserId) {
    try {
      if (!fromUserId) return new Map();
      const q = query(
        collection(db, "notifications"),
        where("fromUserId", "==", fromUserId),
        where("type", "==", "availability_ping")
      );
      const snap = await getDocs(q);
      const map = new Map();
      const now = Date.now();
      snap.forEach((d) => {
        const data = d.data();
        const exp = data?.expiresAt?.toDate?.()?.getTime?.() || new Date(data?.expiresAt || 0).getTime();
        if (exp && exp > now) {
          const toUserId = data?.userId;
          if (toUserId) {
            map.set(toUserId, exp);
          }
        }
      });
      return map;
    } catch (e) {
      console.warn("⚠️ getActiveAvailabilityPingMap failed:", e);
      return new Map();
    }
  }

  /**
   * Check active cooldown for a specific recipient (per-friend 5m)
   */
  async hasActiveAvailabilityPing(fromUserId, toUserId) {
    try {
      if (!fromUserId || !toUserId) return false;
      const q = query(
        collection(db, "notifications"),
        where("fromUserId", "==", fromUserId),
        where("type", "==", "availability_ping"),
        where("userId", "==", toUserId)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      for (const d of snap.docs) {
        const data = d.data();
        const exp = data?.expiresAt?.toDate?.()?.getTime?.() || new Date(data?.expiresAt || 0).getTime();
        if (exp && exp > now) return true;
      }
      return false;
    } catch (e) {
      console.warn("⚠️ hasActiveAvailabilityPing failed:", e);
      return false;
    }
  }

  /**
   * Recipient response: set response to 'available' or 'busy', mark respondedAt
   */
  async respondToAvailabilityPing(notificationId, response) {
    try {
      if (!notificationId || !response) return { success: false, error: "invalid" };
      const allowed = response === "available" || response === "busy";
      if (!allowed) return { success: false, error: "invalid_response" };
      const ref = doc(db, "notifications", notificationId);
      await updateDoc(ref, {
        response,
        status: "responded",
        respondedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (e) {
      console.error("❌ respondToAvailabilityPing failed:", e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Lightweight listener to compute whether there are unseen responses for availability pings
   * Calls callback(true|false)
   */
  setupAvailabilityResponsesListener(userId, callback) {
    try {
      if (!userId) return () => {};
      // Listen for response notifications addressed TO the current user
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", userId),
        where("type", "==", "availability_response")
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          let has = false;
          let lastClear = 0;
          try {
            lastClear = parseInt(sessionStorage.getItem("notify:lastClearTs") || "0", 10) || 0;
          } catch (_) {}
          snap.docs.forEach((d) => {
            if (has) return;
            const data = d.data();
            const createdAt = data?.createdAt?.toDate?.()?.getTime?.() || 0;
            const resp = data?.response;
            if ((resp === "available" || resp === "busy") && createdAt && createdAt > lastClear) {
              has = true;
            }
          });
          try { callback(!!has); } catch (cbErr) { console.warn(cbErr); }
        },
        (err) => console.warn("⚠️ Availability responses listener error", err)
      );
      return unsub;
    } catch (e) {
      console.warn("⚠️ setupAvailabilityResponsesListener failed:", e);
      return () => {};
    }
  }
  /**
   * Check if there is an existing pending outgoing location share request
   * from a sender to a recipient (friend) for a specific friendship.
   * This prevents duplicate spammy notifications.
   * @param {string} fromUserId - Sender UID (current user)
   * @param {string} toUserId - Recipient UID (friend)
   * @param {string} friendshipId - Friendship document ID
   * @returns {Promise<boolean>} true if a pending request exists
   */
  async hasPendingOutgoingLocationShareRequest(fromUserId, toUserId, friendshipId) {
    try {
      if (!fromUserId || !toUserId || !friendshipId) return false;

      const notificationsRef = collection(db, "notifications");
      // Build a query that current user is allowed to read by rules: fromUserId == auth.uid
      const q = query(
        notificationsRef,
        where("fromUserId", "==", fromUserId),
        where("type", "==", "location_share_request"),
        where("status", "==", "pending")
      );

      const snapshot = await getDocs(q);
      const now = Date.now();
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // Ensure it targets the intended friend and friendship
        if (data.userId !== toUserId) continue;
        if (data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate().getTime() < now) {
          continue; // treat expired as non-pending
        }
        const req = data.locationRequest || {};
        if (req.friendshipId === friendshipId) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.warn("⚠️ [DataManager] hasPendingOutgoingLocationShareRequest failed:", error);
      // Fail-open to avoid blocking legitimate requests on transient errors
      return false;
    }
  }

  /**
   * 📖 Get all notifications for a specific user
   *
   * Retrieves notifications ordered by creation date (newest first)
   * and automatically filters out expired notifications.
   *
   * @param {string} userId - User ID to get notifications for
   * @param {boolean} [includeRead=true] - Whether to include read notifications
   * @returns {Promise<Array>} Array of notification objects
   */
  async getUserNotifications(userId) {
    try {
      console.log("📖 Fetching notifications for user:", userId);

      if (!userId) {
        throw new Error("User ID is required");
      }

      const notificationsRef = collection(db, "notifications");
      const q = query(
        notificationsRef,
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(50) // Limit to prevent excessive data loading
      );

      const querySnapshot = await getDocs(q);
      const notifications = [];
      const now = new Date();

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Filter out expired notifications (client does not delete)
        if (data.expiresAt && data.expiresAt.toDate() < now) {
          return;
        }

        notifications.push({
          id: doc.id,
          ...data,
          // Convert Firestore timestamps to JavaScript Date objects
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          expiresAt: data.expiresAt?.toDate?.() || data.expiresAt,
        });
      });

      console.log(
        `✅ Retrieved ${notifications.length} notifications for user ${userId}`
      );
      return notifications;
    } catch (error) {
      console.error("❌ Error fetching user notifications:", error);

      // Return empty array on error to prevent UI crashes
      return [];
    }
  }

  /**
   * 🗑️ Delete a notification (for dismissal)
   *
   * Permanently removes a notification from the database.
   * Used when users dismiss notifications or for auto-cleanup of expired ones.
   *
   * @param {string} notificationId - ID of the notification to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteNotification(notificationId) {
    try {
      console.log(`🗑️ Deleting notification: ${notificationId}`);

      if (!notificationId) {
        throw new Error("Notification ID is required");
      }

      const notificationRef = doc(db, "notifications", notificationId);
      await deleteDoc(notificationRef);

      console.log("✅ Notification deleted successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Error deleting notification:", error);

      // Handle offline scenario
      if (!navigator.onLine) {
        this.pendingOperations.push({
          type: "deleteNotification",
          data: { notificationId },
          timestamp: Date.now(),
        });
        console.log("📱 Notification deletion queued for when online");
        return { success: false, error: "Offline - queued for retry" };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ Mark a notification as read
   *
   * Updates the notification status to "read" and records when it was read.
   * Preserves the notification for user reference while updating its state.
   *
   * @param {string} notificationId - ID of the notification to mark as read
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async markNotificationAsRead(notificationId) {
    try {
      console.log(`✅ Marking notification as read: ${notificationId}`);

      if (!notificationId) {
        throw new Error("Notification ID is required");
      }

      const notificationRef = doc(db, "notifications", notificationId);
      await updateDoc(notificationRef, {
        status: "read",
        readAt: serverTimestamp(),
      });

      console.log("✅ Notification marked as read successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Error marking notification as read:", error);

      // Handle offline scenario
      if (!navigator.onLine) {
        this.pendingOperations.push({
          type: "markNotificationAsRead",
          data: { notificationId },
          timestamp: Date.now(),
        });
        console.log("📱 Mark as read queued for when online");
        return { success: false, error: "Offline - queued for retry" };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ Mark all notifications as read for a user
   *
   * Updates all unread notifications for a user to "read" status.
   * Useful for "Mark All Read" functionality.
   *
   * @param {string} userId - ID of the user whose notifications to mark as read
   * @returns {Promise<{success: boolean, updatedCount?: number, error?: string}>}
   */
  async markAllNotificationsRead(userId) {
    try {
      console.log(`✅ Marking all notifications as read for user: ${userId}`);

      if (!userId) {
        throw new Error("User ID is required");
      }

      const notificationsRef = collection(db, "notifications");
      const q = query(
        notificationsRef,
        where("userId", "==", userId),
        where("status", "==", "pending")
      );

      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      let updatedCount = 0;

      querySnapshot.forEach((doc) => {
        batch.update(doc.ref, {
          status: "read",
          readAt: serverTimestamp(),
        });
        updatedCount++;
      });

      if (updatedCount > 0) {
        await batch.commit();
        console.log(`✅ Marked ${updatedCount} notifications as read`);
      } else {
        console.log("ℹ️ No unread notifications to mark as read");
      }

      return { success: true, updatedCount };
    } catch (error) {
      console.error("❌ Error marking all notifications as read:", error);

      // Handle offline scenario
      if (!navigator.onLine) {
        this.pendingOperations.push({
          type: "markAllNotificationsRead",
          data: { userId },
          timestamp: Date.now(),
        });
        console.log("📱 Mark all as read queued for when online");
        return { success: false, error: "Offline - queued for retry" };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * 🗑️ Dismiss a notification (alias for deleteNotification with status update)
   *
   * Marks a notification as dismissed and optionally deletes it.
   * Provides user-friendly "dismiss" functionality.
   *
   * @param {string} notificationId - ID of the notification to dismiss
   * @param {boolean} permanentDelete - Whether to permanently delete (default: true)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async dismissNotification(notificationId, permanentDelete = true) {
    try {
      console.log(
        `🗑️ Dismissing notification: ${notificationId} (delete: ${permanentDelete})`
      );

      if (!notificationId) {
        throw new Error("Notification ID is required");
      }

      if (permanentDelete) {
        // Use the existing deleteNotification method
        return await this.deleteNotification(notificationId);
      } else {
        // Just mark as dismissed
        const notificationRef = doc(db, "notifications", notificationId);
        await updateDoc(notificationRef, {
          status: "dismissed",
          dismissedAt: serverTimestamp(),
        });

        console.log("✅ Notification dismissed successfully");
        return { success: true };
      }
    } catch (error) {
      console.error("❌ Error dismissing notification:", error);

      // Handle offline scenario
      if (!navigator.onLine) {
        this.pendingOperations.push({
          type: "dismissNotification",
          data: { notificationId, permanentDelete },
          timestamp: Date.now(),
        });
        console.log("📱 Notification dismissal queued for when online");
        return { success: false, error: "Offline - queued for retry" };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * 📡 Set up real-time listener for user notifications
   *
   * Listens for changes to notifications in real-time and calls the provided callback
   * when notifications are added, modified, or removed.
   *
   * @param {string} userId - User ID to listen to notifications for
   * @param {Function} callback - Callback function that receives the notifications array
   * @returns {Function} Unsubscriber function to stop listening
   */
  setupNotificationsListener(userId, callback) {
    try {
      console.log(
        "📡 Setting up real-time notifications listener for:",
        userId
      );

      if (!userId) {
        throw new Error("User ID is required for notifications listener");
      }

      const notificationsRef = collection(db, "notifications");
      const q = query(
        notificationsRef,
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(50) // Limit to 50 most recent notifications
      );

      const unsubscriber = onSnapshot(
        q,
        (snapshot) => {
          console.log(
            `📨 Real-time notifications update: ${snapshot.docs.length} notifications for ${userId}`
          );

          const notifications = [];
          const now = new Date();

          snapshot.docs.forEach((doc) => {
            const data = doc.data();

            // Filter out expired notifications
            if (data.expiresAt && data.expiresAt.toDate() < now) {
              return;
            }

            notifications.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              expiresAt: data.expiresAt?.toDate?.() || null,
              readAt: data.readAt?.toDate?.() || null,
              dismissedAt: data.dismissedAt?.toDate?.() || null,
            });
          });

          // Call the callback with the notifications
          try {
            callback(notifications);
          } catch (callbackError) {
            console.error(
              "❌ Error in notifications listener callback:",
              callbackError
            );
          }
        },
        (error) => {
          console.error("❌ Error in notifications listener:", error);
          // Don't call callback on permission errors to avoid false notifications
          if (error.code === "permission-denied") {
            console.warn(
              "⚠️ Permission denied for notifications listener. User may not be authorized to access notifications."
            );
          } else {
            // For other errors, call callback with empty array to maintain state
            try {
              callback([]);
            } catch (callbackError) {
              console.error(
                "❌ Error in notifications listener error callback:",
                callbackError
              );
            }
          }
        }
      );

      console.log("✅ Real-time notifications listener set up successfully");
      return unsubscriber;
    } catch (error) {
      console.error("❌ Error setting up notifications listener:", error);
      return () => {}; // Return empty unsubscriber function
    }
  }

  /**
   * 🧹 Clean up expired notifications (automatic maintenance)
   *
   * Removes notifications older than 7 days to keep the database clean.
   * This method can be called periodically or on app startup.
   *
   * @param {string} [userId] - Optional: clean up for specific user only
   * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
   */
  async cleanupExpiredNotifications(userId = null) {
    try {
      console.log(
        "🧹 Cleaning up expired notifications...",
        userId ? `for user: ${userId}` : "for all users"
      );

      const notificationsRef = collection(db, "notifications");
      const now = new Date();

      // Build query based on whether userId is provided
      let q;
      if (userId) {
        q = query(
          notificationsRef,
          where("userId", "==", userId),
          where("expiresAt", "<", now)
        );
      } else {
        q = query(notificationsRef, where("expiresAt", "<", now));
      }

      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      let deletedCount = 0;

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      if (deletedCount > 0) {
        await batch.commit();
        console.log(`✅ Cleaned up ${deletedCount} expired notifications`);
      } else {
        console.log("ℹ️ No expired notifications to clean up");
      }

      return { success: true, deletedCount };
    } catch (error) {
      console.error("❌ Error cleaning up expired notifications:", error);
      return { success: false, error: error.message };
    }
  }
}

// Export a single instance of the DataManager (Singleton Pattern)
export const dataManager = new DataManager();

// Only expose globally for development/debugging (suppress noisy console logs)
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.dataManager = dataManager;
}

// (Removed console-based real-time testing helpers and their usage logs)

/**
 * 🔄 Synchronize user data across all cached locations (Single Responsibility)
 *
 * This function follows DRY principles by combining data fetching and cache updating.
 * Call this whenever profile, avatar, name, or major changes.
 *
 * What it does:
 * 1. Gets fresh user data from database
 * 2. Updates cached user info in all friend requests and friendships
 * 3. Uses batch operations for efficiency
 *
 * @param {string} userId - The user ID whose cache needs synchronization
 * @param {object} [customUserInfo] - Optional: provide custom user info instead of fetching from DB
 * @returns {Promise<void>}
 */
export async function syncUserDataCache(userId, customUserInfo = null) {
  try {
    console.log("🔄 Synchronizing user data cache for:", userId);

    // 🔒 SECURITY: Only sync cache for the current authenticated user
    // Other users' profile changes should not trigger cache sync operations
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn("⚠️ No authenticated user, skipping cache sync");
      return;
    }

    if (userId !== currentUser.uid) {
      console.log(
        `🔒 Skipping cache sync for ${userId} - only current user (${currentUser.uid}) can sync their own cache`
      );
      return;
    }

    let userInfoForCache;

    if (customUserInfo) {
      // Use provided data (for efficiency when we already have fresh data)
      userInfoForCache = customUserInfo;
      console.log("📋 Using provided user info:", userInfoForCache);
    } else {
      // Get latest user data from database
      const userData = await dataManager.getUserProfile(userId);
      if (!userData) {
        console.warn("⚠️ No user data found for cache sync:", userId);
        return;
      }

      // Build consistent cache object
      userInfoForCache = {
        handle: userData.profile?.handle || null,
        major: userData.profile?.major || "Unknown",
        university: userData.universityInfo?.university || "unknown",
        avatarConfig: userData.avatarConfig || null,
      };
      console.log("📋 Built cache info from database:", userInfoForCache);
    }

    // Update all cached locations using batch operations
    const batch = writeBatch(db);
    let updateCount = 0;

    // 1. Update friend requests where you're the sender
    const outgoingRequests = await getDocs(
      query(collection(db, "friendRequests"), where("fromUserId", "==", userId))
    );

    console.log(
      `📤 Found ${outgoingRequests.size} outgoing friend requests to update`
    );
    outgoingRequests.forEach((doc) => {
      // Completely replace fromUserInfo (don't merge nested objects)
      batch.update(doc.ref, {
        "fromUserInfo.handle": userInfoForCache.handle,
        "fromUserInfo.major": userInfoForCache.major,
        "fromUserInfo.university": userInfoForCache.university,
        "fromUserInfo.avatarConfig": userInfoForCache.avatarConfig,
      });
      updateCount++;
    });

    // 2. Update friend requests where you're the receiver
    const incomingRequests = await getDocs(
      query(collection(db, "friendRequests"), where("toUserId", "==", userId))
    );

    console.log(
      `📥 Found ${incomingRequests.size} incoming friend requests to update`
    );
    incomingRequests.forEach((doc) => {
      // Completely replace toUserInfo (don't merge nested objects)
      batch.update(doc.ref, {
        "toUserInfo.handle": userInfoForCache.handle,
        "toUserInfo.major": userInfoForCache.major,
        "toUserInfo.university": userInfoForCache.university,
        "toUserInfo.avatarConfig": userInfoForCache.avatarConfig,
      });
      updateCount++;
    });

    // 3. Update friendships where you're involved
    const friendships = await getDocs(
      query(
        collection(db, "friendships"),
        where("users", "array-contains", userId)
      )
    );

    console.log(`👥 Found ${friendships.size} friendships to update`);
    friendships.forEach((doc) => {
      const data = doc.data();
      if (data.user1Id === userId) {
        // Completely replace user1Info (don't merge nested objects)
        batch.update(doc.ref, {
          "user1Info.handle": userInfoForCache.handle,
          "user1Info.major": userInfoForCache.major,
          "user1Info.university": userInfoForCache.university,
          "user1Info.avatarConfig": userInfoForCache.avatarConfig,
        });
        updateCount++;
      } else if (data.user2Id === userId) {
        // Completely replace user2Info (don't merge nested objects)
        batch.update(doc.ref, {
          "user2Info.handle": userInfoForCache.handle,
          "user2Info.major": userInfoForCache.major,
          "user2Info.university": userInfoForCache.university,
          "user2Info.avatarConfig": userInfoForCache.avatarConfig,
        });
        updateCount++;
      }
    });

    // 4. Save all updates at once
    if (updateCount > 0) {
      try {
        await batch.commit();
        console.log(
          `✅ Updated ${updateCount} cached entries with fresh user info`
        );
      } catch (error) {
        console.error(
          `❌ Batch update failed for ${updateCount} entries:`,
          error
        );
        throw error; // Re-throw for upstream handling
      }
    } else {
      console.log("ℹ️ No cached data to update");
    }
  } catch (error) {
    console.error("❌ Cache sync failed:", error);
    // Don't throw - this is a background operation
  }
}

/**
 * @deprecated Use syncUserDataCache() instead - this function is kept for backward compatibility
 * Will be removed in future versions
 */
export async function updateCachedUserData(userId, newUserInfo) {
  console.warn(
    "⚠️ updateCachedUserData is deprecated. Use syncUserDataCache() instead."
  );
  return syncUserDataCache(userId, newUserInfo);
}

// --- END OF FILE ---
