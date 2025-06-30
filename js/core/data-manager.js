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
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config/firebase-config.js";

class DataManager {
  constructor() {
    // Network status tracking
    this.isOnline = navigator.onLine;
    this.pendingOperations = [];
    this.retryTimeout = null;
    this.maxRetries = 3;

    // Cache settings
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes

    // Initialize
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
      this.showNetworkStatus("Connected");
      this.showOfflineBanner(false); // Hide persistent banner
      this.processPendingOperations();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.showNetworkStatus("Working Offline");
      this.showOfflineBanner(true); // Show persistent banner
    });
  }

  /**
   * Show network status to user
   * @private
   */
  showNetworkStatus(message) {
    const statusDiv = document.createElement("div");
    statusDiv.className = "network-status";
    statusDiv.textContent = message;

    // Add status-specific styling
    if (this.isOnline) {
      statusDiv.classList.add("online");
    } else {
      statusDiv.classList.add("offline");
    }

    document.body.appendChild(statusDiv);
    setTimeout(() => statusDiv.remove(), 3000);
  }

  /**
   * Show or hide a persistent offline status banner at the top of the page.
   * This is a global, accessible banner for all app pages.
   * @param {boolean} isOffline - True to show, false to hide
   */
  showOfflineBanner(isOffline) {
    let banner = document.getElementById("offline-status-banner");
    if (isOffline) {
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "offline-status-banner";
        banner.setAttribute("role", "status");
        banner.setAttribute("aria-live", "polite");
        banner.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          z-index: 20000;
          background: #f87171;
          color: #fff;
          text-align: center;
          font-size: 1rem;
          font-weight: 600;
          padding: 0.75rem 0.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          letter-spacing: 0.02em;
        `;
        banner.innerHTML =
          '<span style="display:inline-block;margin-right:0.5em;vertical-align:middle;">⚠️</span>' +
          '<span style="vertical-align:middle;">You are offline. Changes will be saved locally and synced when you are back online.</span>';
        document.body.appendChild(banner);
      } else {
        banner.style.display = "block";
      }
    } else if (banner) {
      banner.style.display = "none";
    }
  }

  /**
   * Process operations that were queued while offline
   * @private
   */
  async processPendingOperations() {
    if (!this.isOnline || this.pendingOperations.length === 0) return;

    while (this.pendingOperations.length > 0) {
      const operation = this.pendingOperations.shift();
      try {
        await operation();
      } catch (error) {
        console.error("Failed to process pending operation:", error);
      }
    }
  }

  /**
   * Cache data with expiration
   * @private
   */
  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached data if not expired
   * @private
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  // =========================
  // USER PROFILE FUNCTIONS
  // =========================

  /**
   * Get a user's full profile from Firestore (with caching).
   * @param {string} userId - The user's UID
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

      // Add timestamps
      const dataToSave = {
        ...profileData,
        "systemInfo.lastUpdated": serverTimestamp(),
      };

      if (!this.isOnline) {
        // Queue for later if offline
        this.pendingOperations.push(() =>
          this.saveUserProfile(userId, profileData)
        );

        // Cache immediately for offline access
        this.setCachedData(`user_${userId}`, profileData);

        this.showNetworkStatus("Changes will sync when online");
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
   * @returns {Promise<{firstName: string|null, email: string|null, avatarConfig: object|null}|null>}
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
      // Dynamically import Firestore functions for tree-shaking and performance
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("../firebase/config/firebase-config.js");

      // Reference the user document
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        console.warn(`[dataManager] No user doc found for UID: ${userId}`);
        return null;
      }
      const data = userDoc.data();
      // Defensive extraction: Only pull minimal fields
      const firstName = data?.profile?.firstName ?? null;
      const email = data?.profile?.email ?? null;
      const avatarConfig = data?.avatarConfig ?? null;
      return { firstName, email, avatarConfig };
    } catch (error) {
      console.error("[dataManager] Error in getUserProfileMinimal:", error);
      return null;
    }
  }

  /**
   * Save only the avatar config for a user (does not overwrite other data).
   * @param {string} userId - The user's UID
   * @param {Object} avatarConfig - The avatar config object
   * @returns {Promise<{success: boolean, error?: string}>}
   * @example
   *   await dataManager.saveAvatarConfig("abc123", avatarConfigObj);
   */
  async saveAvatarConfig(userId, avatarConfig) {
    try {
      if (!userId || typeof userId !== "string" || !avatarConfig) {
        throw new Error("Invalid arguments for saveAvatarConfig");
      }
      const userDocRef = doc(db, "users", userId);
      await setDoc(
        userDocRef,
        {
          avatarConfig,
          "systemInfo.lastUpdated": serverTimestamp(),
        },
        { merge: true }
      );
      return { success: true };
    } catch (error) {
      console.error("[dataManager] Error saving avatar config:", error);
      return { success: false, error: error.message };
    }
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
      const { updateDoc, doc, serverTimestamp } = await import(
        "firebase/firestore"
      );
      const { db } = await import("../firebase/config/firebase-config.js");
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
        this.showNetworkStatus("Schedule will sync when online");
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
   * Show error message to user
   * @private
   */
  showError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
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
}

// Create and export a singleton instance
export const dataManager = new DataManager();

// --- END OF FILE ---
