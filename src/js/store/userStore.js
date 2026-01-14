/**
 * =============================================================================
 *                        CURRENT USER MANAGER
 * =============================================================================
 * A centralized module to manage the currently authenticated user's state,
 * including their auth data and Firestore profile.
 *
 * --- HOW IT WORKS ---
 * 1. `auth-manager` sets the user object upon login.
 * 2. It then fetches the profile and sets it.
 * 3. Other modules can import `currentUser` to access user data reliably.
 * 4. The `waitForProfile()` function provides a way to ensure the profile
 *    is loaded before executing profile-dependent code.
 *
 * --- USAGE ---
 * import { currentUser } from './userStore.js';
 *
 * // Accessing data directly:
 * const uid = currentUser.uid;
 * const profile = currentUser.profile;
 *
 * // Waiting for profile to be loaded:
 * await currentUser.waitForProfile();
 * // Safely run code that needs the profile
 *
 */

import { profileCache } from "../cache/profileCache.js"; // hydration cache

class CurrentUserManager {
  constructor() {
    this._uid = null;
    this._user = null; // Firebase Auth user object
    this._profile = null; // Firestore user profile
    this._profilePromise = null;
    this._resolveProfilePromise = null;
    this._uidPromise = null;
    this._resolveUidPromise = null;
    this._subscribers = new Set();

    // Phase-1: Schedule state management
    this._scheduleData = null; // User's schedule data
    this._isLoadingSchedule = false; // Loading state for schedule operations
    this._scheduleError = null; // Last schedule operation error
    this._scheduleLastSynced = null; // When schedule was last synced to Firestore
    this._isScheduleRealTimeActive = false; // Real-time listener status

    // Attempt early profile hydration (without asserting auth yet)
    try {
      const cached = profileCache.peek?.();
      if (cached?.profile) {
        this._profile = cached.profile; // do not set uid yet; auth sets it later
        console.debug("[Hydration] userStore preloaded profile from cache");
      }
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * The current user's UID.
   * @returns {string|null}
   */
  get uid() {
    return this._uid;
  }

  /**
   * The Firebase Auth user object.
   * @returns {object|null}
   */
  get user() {
    return this._user;
  }

  /** The user's Firestore profile data. */
  get profile() {
    return this._profile;
  }

  /**
   * The user's schedule data.
   * @returns {object|null}
   */
  get scheduleData() {
    return this._scheduleData;
  }

  /**
   * Schedule loading state.
   * @returns {boolean}
   */
  get isLoadingSchedule() {
    return this._isLoadingSchedule;
  }

  /**
   * Last schedule operation error.
   * @returns {string|null}
        try {
          // Opportunistic save (only if profile has canonical handle & uid set)
          if (this._uid && profile?.profile?.handle) {
            profileCache.save(this._uid, profile);
          }
        } catch (e) {
          // Non-fatal
          if (window?.logManager) {
            window.logManager.dev.warn("Profile cache save failed", e);
          }
        }
   */
  get scheduleError() {
    return this._scheduleError;
  }

  /**
   * When schedule was last synced to Firestore.
   * @returns {Date|null}
   */
  get scheduleLastSynced() {
    return this._scheduleLastSynced;
  }

  /**
   * Real-time schedule listener status.
   * @returns {boolean}
   */
  get isScheduleRealTimeActive() {
    return this._isScheduleRealTimeActive;
  }

  /**
   * Gets the complete current user state.
   * @returns {{user: object|null, profile: object|null, isLoggedIn: boolean, schedule: object}}
   */
  get state() {
    return {
      user: this._user,
      profile: this._profile,
      isLoggedIn: this.isLoggedIn(),
      schedule: {
        data: this._scheduleData,
        isLoading: this._isLoadingSchedule,
        error: this._scheduleError,
        lastSynced: this._scheduleLastSynced,
        isRealTimeActive: this._isScheduleRealTimeActive,
      },
    };
  }

  /**
   * Checks if a user is currently logged in.
   * @returns {boolean}
   */
  isLoggedIn() {
    return !!this._uid;
  }

  /**
   * Checks if the user has completed their profile setup.
   * @returns {boolean}
   */
  isProfileComplete() {
    return !!(
      this._profile?.systemInfo?.profileSetupComplete &&
      this._profile?.profile?.firstName &&
      this._profile?.profile?.lastName &&
      this._profile?.profile?.email
    );
  }

  /**
   * Gets safe display information for the current user.
   * @returns {object} Display information with fallbacks
   */
  getDisplayInfo() {
    if (!this.isLoggedIn()) {
      return {
        handle: "guest",
        email: "",
        firstName: "",
        lastName: "",
        avatarConfig: null,
        profilePhotoUrl: null,
        useAvatar: false,
        isComplete: false,
      };
    }

    const profile = this._profile?.profile || {};
    const firstName = profile.firstName || "";
    const lastName = profile.lastName || "";

    return {
      handle: profile.handle || this._user?.email?.split("@")[0] || "user",
      email: profile.email || this._user?.email || "",
      firstName,
      lastName,
      avatarConfig: this._profile?.avatarConfig || null,
      // profilePhotoUrl is stored inside the nested profile object
      profilePhotoUrl: profile.profilePhotoUrl || this._profile?.profilePhotoUrl || null,
      useAvatar:
        typeof profile.useAvatar === "boolean"
          ? profile.useAvatar
          : typeof this._profile?.useAvatar === "boolean"
          ? this._profile.useAvatar
          : false,
      isComplete: this.isProfileComplete(),
    };
  }

  /**
   * Sets the authenticated user. Called from auth-manager.
   * @param {object|null} user - The Firebase Auth user object.
   */
  setUser(user) {
    if (user) {
      this._user = user;
      this._uid = user.uid;
      // Create a new promise for the profile loading
      this._profilePromise = new Promise((resolve) => {
        this._resolveProfilePromise = resolve;
      });
      // Resolve any prior pending UID promise and create a fresh one
      if (this._resolveUidPromise) {
        this._resolveUidPromise(user.uid);
      }
      this._uidPromise = Promise.resolve(user.uid);
    } else {
      // If user is null (logged out), reset everything.
      this.reset();
    }
    this._notifySubscribers();
  }

  /**
   * Sets the user's Firestore profile. Called from auth-manager.
   * @param {object|null} profile - The user's profile data.
   */
  setProfile(profile) {
    this._profile = profile;
    // Always attempt to persist snapshot (even if handle missing yet) for fast hydration
    try {
      if (this._uid && profile) {
        // profileCache imported at top
        profileCache.save(this._uid, profile);
      }
    } catch (e) {
      // non-fatal
    }
    // When the profile is set (even to null on logout), resolve the promise.
    if (this._resolveProfilePromise) {
      this._resolveProfilePromise(this._profile);
      // Nullify the resolver so the promise can't be resolved again.
      // A new promise will be created on the next login.
      this._resolveProfilePromise = null;
    }
    this._notifySubscribers();
  }

  setOnboardingState(partialState = {}) {
    if (!partialState || typeof partialState !== "object") {
      return;
    }

    const currentProfile = this._profile || {};
    const systemInfo = currentProfile.systemInfo || {};
    const onboarding = systemInfo.onboarding || {};

    const updatedProfile = {
      ...currentProfile,
      systemInfo: {
        ...systemInfo,
        onboarding: {
          ...onboarding,
          ...partialState,
        },
      },
    };

    this._profile = updatedProfile;

    try {
      if (this._uid && updatedProfile) {
        profileCache.save(this._uid, updatedProfile);
      }
    } catch (_) {
      /* ignore */
    }

    this._notifySubscribers();
  }

  /**
   * Returns a promise that resolves when the user profile is loaded.
   * This is the key function to solve the race condition.
   * @returns {Promise<object|null>}
   */
  waitForProfile() {
    // If the profile is already loaded, resolve immediately.
    if (this._profile) {
      return Promise.resolve(this._profile);
    }
    // If a user is logged in but the profile isn't loaded yet, return the promise.
    if (this.isLoggedIn() && this._profilePromise) {
      return this._profilePromise;
    }
    // If no user is logged in, resolve with null.
    return Promise.resolve(null);
  }

  /**
   * Wait for UID to become available (auth established). Resolves with UID or null after timeout.
   * @param {number} timeoutMs
   * @returns {Promise<string|null>}
   */
  waitForUid(timeoutMs = 5000) {
    if (this._uid) return Promise.resolve(this._uid);
    if (!this._uidPromise) {
      this._uidPromise = new Promise((resolve) => {
        this._resolveUidPromise = resolve;
      });
    }
    let timedOut = false;
    return Promise.race([
      this._uidPromise,
      new Promise((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeoutMs)
      ),
    ]).then((val) => (timedOut ? null : val));
  }

  /**
   * Returns a promise that resolves when the user profile is loaded, with timeout protection.
   * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
   * @returns {Promise<object|null>}
   */
  waitForProfileWithTimeout(timeoutMs = 10000) {
    const profilePromise = this.waitForProfile();

    // Create a timeout promise that rejects after the specified time
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Profile loading timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Race between profile loading and timeout
    return Promise.race([profilePromise, timeoutPromise]);
  }

  /**
   * Subscribes a callback function to state changes.
   * @param {function} callback - The function to call when state changes.
   * @returns {function} - A function to unsubscribe.
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    // Immediately call the callback with the current state upon subscription
    callback(this.state);
    // Return an unsubscribe function
    return () => this._subscribers.delete(callback);
  }

  /**
   * Notifies all subscribers of a state change.
   * @private
   */
  _notifySubscribers() {
    for (const callback of this._subscribers) {
      callback(this.state);
    }
  }

  /**
   * Sets the user's schedule data. Called from ScheduleStorageService.
   * @param {object|null} scheduleData - The user's schedule data.
   */
  setScheduleData(scheduleData) {
    this._scheduleData = scheduleData;
    this._notifySubscribers();
  }

  /**
   * Sets the schedule loading state.
   * @param {boolean} isLoading - Loading state.
   */
  setScheduleLoading(isLoading) {
    this._isLoadingSchedule = isLoading;
    this._notifySubscribers();
  }

  /**
   * Sets the schedule error state.
   * @param {string|null} error - Error message or null to clear.
   */
  setScheduleError(error) {
    this._scheduleError = error;
    this._notifySubscribers();
  }

  /**
   * Sets the schedule last synced timestamp.
   * @param {Date|null} timestamp - When schedule was synced.
   */
  setScheduleLastSynced(timestamp) {
    this._scheduleLastSynced = timestamp;
    this._notifySubscribers();
  }

  /**
   * Sets the real-time schedule listener status.
   * @param {boolean} isActive - Whether real-time listener is active.
   */
  setScheduleRealTimeActive(isActive) {
    this._isScheduleRealTimeActive = isActive;
    this._notifySubscribers();
  }

  /**
   * Clears schedule error state.
   */
  clearScheduleError() {
    this._scheduleError = null;
    this._notifySubscribers();
  }

  /**
   * Gets student ID from email (for display purposes).
   * @returns {string} Student ID or 'Unknown'
   */
  getStudentId() {
    const email = this._profile?.profile?.email || this._user?.email;
    return email ? email.split("@")[0] : "Unknown";
  }

  /**
   * Gets display name for current user in schedule (Phase-1 format).
   * @returns {string} Display name in format "Me"
   */
  getScheduleDisplayName() {
    // Keep display name consistent with UI components (HorizontalFriendsBar, day view)
    return "You";
  }

  /**
   * Resets the user state upon logout.
   */
  reset(clearCache = true) {
    // Stop friends listeners before resetting user state
    if (window.friendsManager) {
      if (window.logManager)
        window.logManager.dev.info(
          "Stopping friends listeners from user store reset..."
        );
      window.friendsManager.stopRealTimeListening();
    }

    // Reset user state
    this._uid = null;
    this._user = null;
    this._profile = null;
    this._profilePromise = null;
    this._resolveProfilePromise = null;

    // Reset Phase-1 schedule state
    this._scheduleData = null;
    this._isLoadingSchedule = false;
    this._scheduleError = null;
    this._scheduleLastSynced = null;
    this._isScheduleRealTimeActive = false;

    if (clearCache) {
      try {
        profileCache.clear();
      } catch (_) {}
    }

    // Notify subscribers of the reset state
    this._notifySubscribers();
  }
}

export const currentUser = new CurrentUserManager();

// Only expose globally for development/debugging
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  // Removed global window.currentUser exposure (import where needed)
}
