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
   * Checks if a user is currently logged in.
   * @returns {boolean}
   */
  isLoggedIn() {
    return !!this._uid;
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
      this._profilePromise = new Promise(resolve => {
        this._resolveProfilePromise = resolve;
      });
    } else {
      // If user is null (logged out), reset everything.
      this.reset();
    }
  }

  /**
   * Sets the user's Firestore profile. Called from auth-manager.
   * @param {object|null} profile - The user's profile data.
   */
  setProfile(profile) {
    this._profile = profile;
    // If the promise exists and its resolver function is available, call it.
    if (this._resolveProfilePromise) {
      this._resolveProfilePromise(this._profile);
      this._resolveProfilePromise = null; // Ensure it's only called once
    }
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
    if (this.isLoggedIn()) {
      return this._profilePromise;
    }
    // If no user is logged in, resolve with null.
    return Promise.resolve(null);
  }

  /**
   * Resets the user state upon logout.
   */
  reset() {
    this._uid = null;
    this._user = null;
    this._profile = null;
    // Reset the promise so that next login gets a new one.
    this._profilePromise = new Promise(resolve => {
      this._resolveProfilePromise = resolve;
    });
    // Immediately resolve the promise with null, as there's no user.
    this._resolveProfilePromise(null);
  }
}

export const currentUser = new CurrentUserManager(); 