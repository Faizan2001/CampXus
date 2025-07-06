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
 * import { currentUser } from './currentUser.js';
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

class CurrentUserManager {
  constructor() {
    this._uid = null;
    this._user = null; // Firebase Auth user object
    this._profile = null; // Firestore user profile
    this._profilePromise = null;
    this._resolveProfilePromise = null;
    this._subscribers = new Set();
    this.reset();
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

  /**
   * The user's Firestore profile data.
   * @returns {object|null}
   */
  get profile() {
    return this._profile;
  }

  /**
   * Gets the complete current user state.
   * @returns {{user: object|null, profile: object|null, isLoggedIn: boolean}}
   */
  get state() {
    return {
      user: this._user,
      profile: this._profile,
      isLoggedIn: this.isLoggedIn(),
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
        displayName: 'Guest',
        email: '',
        firstName: '',
        lastName: '',
        avatarConfig: null,
        isComplete: false
      };
    }

    const profile = this._profile?.profile || {};
    const firstName = profile.firstName || '';
    const lastName = profile.lastName || '';
    
    return {
      displayName: profile.displayName || 
                   (firstName && lastName ? `${firstName} ${lastName}` : '') ||
                   this._user?.email?.split('@')[0] || 
                   'User',
      email: profile.email || this._user?.email || '',
      firstName,
      lastName,
      avatarConfig: this._profile?.avatarConfig || null,
      isComplete: this.isProfileComplete()
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
    // When the profile is set (even to null on logout), resolve the promise.
    if (this._resolveProfilePromise) {
      this._resolveProfilePromise(this._profile);
      // Nullify the resolver so the promise can't be resolved again.
      // A new promise will be created on the next login.
      this._resolveProfilePromise = null;
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
   * Resets the user state upon logout.
   */
  reset() {
    this._uid = null;
    this._user = null;
    this._profile = null;
    this._profilePromise = null;
    this._resolveProfilePromise = null;
    // Notify subscribers of the reset state
    this._notifySubscribers();
  }
}

export const currentUser = new CurrentUserManager();

// Make currentUser available globally for profile completion flow
window.currentUser = currentUser; 