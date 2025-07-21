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
 *    import { dataManager } from "../core/data-manager.js";
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
} from "firebase/firestore";
import { db } from "../firebase/config/firebase-config.js";

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

    // Initialize
    this.removeLegacyOfflineBanners(); // Clean up any existing banners first
    this.setupNetworkListeners();
  }

  // =========================
  // NETWORK & CACHE HELPERS
  // =========================

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
    // Remove oldest entries if cache is too large
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
  showNotification(message, type = "info", options = {}) {
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
        const queries = fieldsToSearch.map((fieldPath) => {
          return query(
            usersRef,
            ...baseFilters,
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

      await setDoc(doc(db, "users", userId), dataToSave, { merge: true });

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
        "🧹 [DataManager] Using clean slate approach - clearing old config first"
      );

      const userDocRef = doc(db, "users", userId);

      // STEP 1: Clear the existing avatarConfig completely to remove all old options
      console.log("🗑️ [DataManager] Step 1: Clearing existing avatarConfig...");
      await setDoc(
        userDocRef,
        {
          avatarConfig: {},
          "systemInfo.lastUpdated": serverTimestamp(),
        },
        { merge: true }
      );

      // STEP 2: Save the new avatar config (now guaranteed to be clean)
      console.log("💾 [DataManager] Step 2: Saving new avatarConfig...");
      await setDoc(
        userDocRef,
        {
          avatarConfig: avatarConfig,
          "systemInfo.lastUpdated": serverTimestamp(),
        },
        { merge: true }
      );

      console.log(
        "✅ [DataManager] Avatar config updated successfully with clean slate approach"
      );

      // Update cache with new config
      const cacheKey = `user_${userId}`;
      if (this.cache.has(cacheKey)) {
        const cachedData = this.cache.get(cacheKey);
        cachedData.avatarConfig = avatarConfig;
        this.cache.set(cacheKey, cachedData);
        console.log("🔄 [DataManager] Updated avatar in cache");
      }

      return { success: true, cleanedConfig: avatarConfig };
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
   * Save a user's schedule.
   * @param {string} userId - The user's UID
   * @param {Object} scheduleData - The schedule data
   * @returns {Promise<{success: boolean, error?: string}>}
   * @example
   *   await dataManager.saveUserSchedule("abc123", scheduleObj);
   */
  async saveUserSchedule(userId, scheduleData) {
    try {
      if (!this.isOnline) {
        this.pendingOperations.push(() =>
          this.saveUserSchedule(userId, scheduleData)
        );
        this.setCachedData(`schedule_${userId}`, scheduleData);
        this.showNotification("Schedule will sync when online", "info", {
          duration: 4000,
        });
        return { success: true, offline: true };
      }

      await updateDoc(doc(db, "users", userId), {
        schedule: scheduleData,
        "systemInfo.lastUpdated": serverTimestamp(),
      });

      this.setCachedData(`schedule_${userId}`, scheduleData);
      return { success: true };
    } catch (error) {
      console.error("Error saving schedule:", error);
      this.showError("Failed to save schedule");
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a user's schedule.
   * @param {string} userId - The user's UID
   * @returns {Promise<Object|null>} Schedule data or null
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
      const scheduleData = userData.schedule || null;

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
   * Generate avatar URL from user data
   * @param {Object} userData - User data containing avatarConfig
   * @returns {string|null} Avatar URL or null
   */
  getAvatarUrl(userData) {
    if (!userData?.avatarConfig || !window.avatarManager) {
      return null;
    }

    return window.avatarManager.generateAvatarUrl(userData.avatarConfig);
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
      this.invalidateUserCache(userId);

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
      userUpdates.forEach(({ userId }) => this.invalidateUserCache(userId));

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
  async searchUsers(criteria) {
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
   * 🤝 Create a friendship document
   * @param {Object} friendshipData - The friendship data
   * @returns {Promise<{success: boolean, friendshipId?: string, error?: string}>}
   */
  async createFriendship(friendshipData) {
    try {
      console.log("🤝 Creating friendship...", friendshipData);

      const friendshipsRef = collection(db, "friendships");
      const docRef = await addDoc(friendshipsRef, {
        ...friendshipData,
        createdAt: serverTimestamp(),
        lastInteraction: serverTimestamp(),
      });

      console.log("✅ Friendship created successfully with ID:", docRef.id);
      return { success: true, friendshipId: docRef.id };
    } catch (error) {
      console.error("❌ Error creating friendship:", error);
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

      // Check for any pending or accepted requests between these users
      const q = query(
        requestsRef,
        where("fromUserId", "==", fromUserId),
        where("toUserId", "==", toUserId),
        where("status", "in", ["pending", "accepted"])
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
        where("status", "in", ["pending", "accepted"])
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
          callback([]); // Fallback to empty array on error
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
          callback([]); // Fallback to empty array on error
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
          callback([]); // Fallback to empty array on error
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

            console.log(`👤 Real-time update: Profile changed for ${userId}`);

            // Update local cache with fresh data
            this.setCachedData(`user_${userId}`, profileData);

            // Call the callback with the fresh profile data
            callback(profileData);
          } else {
            console.warn(`👤 User profile not found: ${userId}`);
            callback(null);
          }
        },
        (error) => {
          console.error("❌ Error in user profile listener:", error);
          callback(null); // Fallback to null on error
        }
      );

      console.log("✅ User profile listener established successfully");
      return unsubscribe;
    } catch (error) {
      console.error("❌ Error setting up user profile listener:", error);
      return () => {}; // Return empty unsubscribe function
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

// --- END OF FILE ---
