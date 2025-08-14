/**
 * =============================================================================
 *                        CAMPXUS DATA MANAGER
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

// Common field paths for queries
export const FIELD_PATHS = {
  // Profile fields
  FIRST_NAME: "profile.firstName",
  LAST_NAME: "profile.lastName",
  BIO: "profile.bio",
  MAJOR: "profile.major",
  STARTING_YEAR: "profile.startingYear",
  EMAIL: "profile.email",
  DISPLAY_NAME: "profile.displayName",

  // University fields
  UNIVERSITY: "universityInfo.university",
  UNIVERSITY_NAME: "universityInfo.universityName",
  STUDENT_ID: "universityInfo.studentId",

  // System fields
  PROFILE_COMPLETE: "systemInfo.profileSetupComplete",
  STATUS: "systemInfo.status",
  LAST_ACTIVE: "systemInfo.lastActive",
  CREATED_AT: "systemInfo.createdAt",
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

    console.log("🧹 Cache cleanup interval started (every 10 minutes)");
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
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
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
    console.log("🧹 Cache cleared.");
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
        console.warn("⚠️ Friend cache sync failed:", error)
      );
      this.syncDebounceMap.delete(userId);
    }, 1000); // 1 second debounce

    this.syncDebounceMap.set(userId, timeoutId);
    console.log(`⏱️ Debounced cache sync for user: ${userId}`);
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
   * Show a notification toast
   * @param {string} message The message to display
   * @param {string} type "success" | "error" | "warning" | "info"
   * @param {object} options Toastify options
   * @private
   */
  showNotification(message, type = "info", _options = {}) {
    // Simple console logging for development - clean and clear
    console.log(`[${type.toUpperCase()}] ${message}`);

    // TODO: Add proper visual notifications later (Toastify or custom modal)
    // For now, prevents console errors while maintaining functionality
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
      let usersMap = new Map();

      if (searchTerm && searchTerm.trim().length >= 2) {
        const term = searchTerm.toLowerCase();

        // Fields we want to search across
        const fieldsToSearch = [
          "profile.displayName_lower",
          "profile.firstName_lower",
          "profile.lastName_lower",
          "profile.major_lower",
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

      // --- BEGIN: Auto-generate search fields and ensure socialInfo ---
      if (profileData.profile) {
        // 🎯 Auto-generate displayName from firstName if not set
        if (!profileData.profile.displayName && profileData.profile.firstName) {
          profileData.profile.displayName = profileData.profile.firstName;
          console.log(
            "🎯 Auto-generated displayName from firstName:",
            profileData.profile.displayName
          );
        }

        if (profileData.profile.displayName) {
          profileData.profile.displayName_lower =
            profileData.profile.displayName.toLowerCase();
        }
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
        };
      }
      // --- END: Auto-generate search fields and ensure socialInfo ---

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
   * @returns {Promise<{displayName: string|null, email: string|null, avatarConfig: object|null}|null>}
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
      const displayName = data?.profile?.displayName ?? null;
      const email = data?.profile?.email ?? null;
      const avatarConfig = data?.avatarConfig ?? null;
      console.log(
        "Returned minimal profile: " + displayName,
        email,
        avatarConfig
      );
      return { displayName, email, avatarConfig };
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
  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `data-manager-notification ${type}`;
    notification.setAttribute("role", "alert");
    notification.setAttribute("aria-live", "polite");

    // Apply consistent styling
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(450px);
      transition: transform 0.3s ease-in-out;
      ${this.getNotificationStyles(type)}
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.style.transform = "translateX(0)";
    });

    // Auto-remove after delay
    setTimeout(
      () => {
        notification.style.transform = "translateX(450px)";
        setTimeout(() => notification.remove(), 300);
      },
      type === "error" ? 5000 : 3000
    );
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
      displayName: userData.profile?.displayName || "",

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
        userData.profile?.displayName ||
        "",
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
      if (profileData.displayName !== undefined)
        updates["profile.displayName"] = profileData.displayName;

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

      // Delete the friendship document
      await deleteDoc(friendshipRef);

      // Remove both users from each other's QuickAccess (starred friends)
      // This ensures they no longer appear in the horizontal friends bar
      console.log("⭐ Cleaning up QuickAccess for both users...");

      try {
        // Remove user2 from user1's QuickAccess
        const removeFromUser1Result = await this.removeFromQuickAccess(
          user1Id,
          user2Id
        );
        if (removeFromUser1Result.success) {
          console.log(`✅ Removed ${user2Id} from ${user1Id}'s QuickAccess`);
        } else {
          console.warn(
            `⚠️ Failed to remove ${user2Id} from ${user1Id}'s QuickAccess: ${removeFromUser1Result.error}`
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ Error removing ${user2Id} from ${user1Id}'s QuickAccess:`,
          error
        );
      }

      try {
        // Remove user1 from user2's QuickAccess
        const removeFromUser2Result = await this.removeFromQuickAccess(
          user2Id,
          user1Id
        );
        if (removeFromUser2Result.success) {
          console.log(`✅ Removed ${user1Id} from ${user2Id}'s QuickAccess`);
        } else {
          console.warn(
            `⚠️ Failed to remove ${user1Id} from ${user2Id}'s QuickAccess: ${removeFromUser2Result.error}`
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ Error removing ${user1Id} from ${user2Id}'s QuickAccess:`,
          error
        );
      }

      console.log(
        "✅ Friendship deleted successfully and QuickAccess cleaned up"
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
            displayName: request.fromUserInfo?.displayName || "Unknown User",
            major: request.fromUserInfo?.major || "Unknown Major",
            university:
              request.fromUserInfo?.university || "Unknown University",
          }));

          // Call the callback with the fresh data
          callback(transformedRequests);
        },
        (error) => {
          console.error("❌ Error in friend requests listener:", error);
          // Don't call callback on permission errors to avoid false notifications
          if (error.code === "permission-denied") {
            console.warn(
              "⚠️ Friend requests listener: Permission denied (likely due to auth state change)"
            );
            return; // Skip callback to prevent false deletion detection
          }
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
            displayName: request.toUserInfo?.displayName || "Unknown User",
            major: request.toUserInfo?.major || "Unknown Major",
            university: request.toUserInfo?.university || "Unknown University",
          }));

          // Call the callback with the fresh data
          callback(transformedRequests);
        },
        (error) => {
          console.error(
            "❌ Error in outgoing friend requests listener:",
            error
          );
          // Don't call callback on permission errors to avoid false notifications
          if (error.code === "permission-denied") {
            console.warn(
              "⚠️ Outgoing friend requests listener: Permission denied (likely due to auth state change)"
            );
            return; // Skip callback to prevent false deletion detection
          }
          callback([]); // Only fallback to empty array for non-permission errors
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
              friendId: friendId,
              friendInfo: friendInfo || {
                displayName: "Unknown User",
                major: "Unknown Major",
              },
            };
          });

          // Call the callback with the fresh data
          callback(transformedFriendships);
        },
        (error) => {
          console.error("❌ Error in friendships listener:", error);
          // Don't call callback on permission errors to avoid false notifications
          if (error.code === "permission-denied") {
            console.warn(
              "⚠️ Friendships listener: Permission denied (likely due to auth state change)"
            );
            return; // Skip callback to prevent false deletion detection
          }
          callback([]); // Only fallback to empty array for non-permission errors
        }
      );

      console.log("✅ Friendships listener established successfully");
      return unsubscribe;
    } catch (error) {
      console.error("❌ Error setting up friendships listener:", error);
      return () => {}; // Return empty unsubscribe function
    }
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
   *     (profile) => console.log("Profile updated:", profile.profile?.displayName)
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
              console.log(
                `⏱️ Throttling profile change for ${userId} (too frequent)`
              );
              // Update cache but skip processing
              this.setCachedData(`user_${userId}`, profileData);
              callback(profileData);
              return;
            }

            this.profileChangeThrottle.set(userId, now);
            console.log(`👤 Real-time update: Profile changed for ${userId}`);

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
                cachedData.profile?.displayName !==
                  profileData.profile?.displayName ||
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
              console.log(
                `🔒 Profile change detected for ${userId}, but skipping cache sync (not current user)`
              );
            } else if (isQuickAccessUpdate) {
              console.log(
                "⭐ Skipping cache sync for Quick Access update to prevent cascading"
              );
            }

            // Call the callback with the fresh profile data
            callback(profileData);
          } else {
            console.warn(`👤 User profile not found: ${userId}`);
            callback(null);
          }
        },
        (error) => {
          console.error("❌ Error in user profile listener:", error);
          // Don't call callback on permission errors to avoid false notifications
          if (error.code === "permission-denied") {
            console.warn(
              "⚠️ User profile listener: Permission denied (likely due to auth state change)"
            );
            return; // Skip callback to prevent false deletion detection
          }
          callback(null); // Only fallback to null for non-permission errors
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
        "⭐ [DataManager] Adding to Quick Access:",
        quickAccessEntry.displayName
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
      if (!userId) {
        throw new Error("Invalid userId");
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
        displayName:
          friendData.profile?.displayName || existingFriend.displayName,
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
        `✅ [DataManager] Successfully refreshed friend data for ${friendData.profile?.displayName}`
      );

      return {
        success: true,
        updatedFriend: updatedFriend,
        friendData: {
          displayName: friendData.profile?.displayName,
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
            displayName:
              freshData.profile?.displayName || existingFriend.displayName,
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
}

// Export a single instance of the DataManager (Singleton Pattern)
export const dataManager = new DataManager();

// Only expose globally for development/debugging
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.dataManager = dataManager;
  console.log(
    "🛠️ DataManager available globally as window.dataManager for debugging"
  );
}

// =========================
// DEVELOPMENT TESTING HELPERS (Console Tools)
// =========================

/**
 * Add console testing helpers for real-time listeners (development only)
 * These functions are available in the browser console for testing real-time functionality
 */
if (typeof window !== "undefined") {
  // Global testing helpers for real-time listeners
  window.testRealTimeListeners = {
    /**
     * Test friend requests listener
     * Usage: testRealTimeListeners.friendRequests("your-user-id")
     */
    friendRequests: (userId) => {
      console.log("🧪 Testing friend requests listener for:", userId);

      const unsubscribe = dataManager.listenToPendingFriendRequests(
        userId,
        (requests) => {
          console.log("📬 REAL-TIME UPDATE - Friend Requests:", {
            count: requests.length,
            requests: requests.map((r) => ({
              id: r.id,
              from: r.displayName || r.fromUserInfo?.displayName,
              major: r.major || r.fromUserInfo?.major,
              university: r.university || r.fromUserInfo?.university,
              createdAt: r.createdAt,
            })),
          });
        }
      );

      console.log(
        "✅ Friend requests listener started. To stop: testRealTimeListeners.stopAll()"
      );
      window.testRealTimeListeners._unsubscribers =
        window.testRealTimeListeners._unsubscribers || [];
      window.testRealTimeListeners._unsubscribers.push(unsubscribe);

      return unsubscribe;
    },

    /**
     * Test friendships listener
     * Usage: testRealTimeListeners.friendships("your-user-id")
     */
    friendships: (userId) => {
      console.log("🧪 Testing friendships listener for:", userId);

      const unsubscribe = dataManager.listenToUserFriendships(
        userId,
        (friendships) => {
          console.log("🤝 REAL-TIME UPDATE - Friendships:", {
            count: friendships.length,
            friends: friendships.map((f) => ({
              id: f.id,
              friendId: f.friendId,
              friendName: f.friendInfo?.displayName || "Unknown",
              friendMajor: f.friendInfo?.major || "Unknown",
              createdAt: f.createdAt,
            })),
          });
        }
      );

      console.log(
        "✅ Friendships listener started. To stop: testRealTimeListeners.stopAll()"
      );
      window.testRealTimeListeners._unsubscribers =
        window.testRealTimeListeners._unsubscribers || [];
      window.testRealTimeListeners._unsubscribers.push(unsubscribe);

      return unsubscribe;
    },

    /**
     * Test user profile listener
     * Usage: testRealTimeListeners.profile("user-id-to-watch")
     */
    profile: (userId) => {
      console.log("🧪 Testing user profile listener for:", userId);

      const unsubscribe = dataManager.listenToUserProfile(userId, (profile) => {
        if (profile) {
          console.log("👤 REAL-TIME UPDATE - Profile:", {
            userId: profile.id,
            displayName: profile.profile?.displayName,
            firstName: profile.profile?.firstName,
            lastName: profile.profile?.lastName,
            major: profile.profile?.major,
            status: profile.systemInfo?.status,
            lastActive: profile.systemInfo?.lastActive,
            avatarConfig: profile.avatarConfig ? "Has Avatar" : "No Avatar",
          });
        } else {
          console.log(
            "👤 REAL-TIME UPDATE - Profile: User not found or deleted"
          );
        }
      });

      console.log(
        "✅ Profile listener started. To stop: testRealTimeListeners.stopAll()"
      );
      window.testRealTimeListeners._unsubscribers =
        window.testRealTimeListeners._unsubscribers || [];
      window.testRealTimeListeners._unsubscribers.push(unsubscribe);

      return unsubscribe;
    },

    /**
     * Test all listeners at once
     * Usage: testRealTimeListeners.all("your-user-id")
     */
    all: (userId) => {
      console.log("🧪 Testing ALL real-time listeners for:", userId);

      this.friendRequests(userId);
      this.friendships(userId);
      this.profile(userId);

      console.log(
        "✅ All listeners started! Check console for real-time updates."
      );
      console.log("💡 Try these actions in another tab/browser:");
      console.log("   1. Send a friend request to this user");
      console.log("   2. Accept a friend request from this user");
      console.log("   3. Update this user's profile");
    },

    /**
     *
     * Stop all active test listeners
     * Usage: testRealTimeListeners.stopAll()
     */
    stopAll: () => {
      const unsubscribers = window.testRealTimeListeners._unsubscribers || [];
      console.log(`🛑 Stopping ${unsubscribers.length} active listeners...`);

      unsubscribers.forEach((unsubscribe, index) => {
        try {
          unsubscribe();
          console.log(`✅ Stopped listener ${index + 1}`);
        } catch (error) {
          console.error(`❌ Error stopping listener ${index + 1}:`, error);
        }
      });

      window.testRealTimeListeners._unsubscribers = [];
      console.log("🔕 All test listeners stopped");
    },

    /**
     * Get status of active listeners
     * Usage: testRealTimeListeners.status()
     */
    status: () => {
      const count = (window.testRealTimeListeners._unsubscribers || []).length;
      console.log(`📊 Real-time listener status: ${count} active listeners`);

      if (count > 0) {
        console.log(
          "💡 Use testRealTimeListeners.stopAll() to stop all listeners"
        );
      } else {
        console.log(
          "💡 Use testRealTimeListeners.all('your-user-id') to start testing"
        );
      }

      return count;
    },
  };

  console.log("🧪 Real-time testing helpers loaded!");
  console.log("💡 Usage:");
  console.log(
    "   testRealTimeListeners.all('your-user-id')     - Test all listeners"
  );
  console.log(
    "   testRealTimeListeners.friendRequests('id')   - Test friend requests only"
  );
  console.log(
    "   testRealTimeListeners.friendships('id')      - Test friendships only"
  );
  console.log(
    "   testRealTimeListeners.profile('id')          - Test profile changes only"
  );
  console.log(
    "   testRealTimeListeners.stopAll()              - Stop all listeners"
  );
  console.log(
    "   testRealTimeListeners.status()               - Check listener status"
  );
}

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
        displayName:
          userData.profile?.displayName ||
          userData.profile?.firstName ||
          "Unknown",
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
        "fromUserInfo.displayName": userInfoForCache.displayName,
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
        "toUserInfo.displayName": userInfoForCache.displayName,
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
          "user1Info.displayName": userInfoForCache.displayName,
          "user1Info.major": userInfoForCache.major,
          "user1Info.university": userInfoForCache.university,
          "user1Info.avatarConfig": userInfoForCache.avatarConfig,
        });
        updateCount++;
      } else if (data.user2Id === userId) {
        // Completely replace user2Info (don't merge nested objects)
        batch.update(doc.ref, {
          "user2Info.displayName": userInfoForCache.displayName,
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
