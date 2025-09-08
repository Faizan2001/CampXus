// Import Firebase Auth functions
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";
import { auth } from "../../lib/firebase/firebase-config.js";
import {
  validateUniversityEmail,
  getFriendlyEmailError,
} from "./UniversityValidator.js";
import { dataManager } from "../data/DataService.js";
import { notificationManager } from "../realtime/NotificationService.js";
import { currentUser } from "../../store/userStore.js";
import { logManager } from "../../utils/debug/LogManager.js";

/**
 * Custom error class for authentication vs other types of errors
 */
class AuthError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/**
 * Custom error class for form validation errors
 * This helps us handle validation errors differently
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

class AuthManager {
  constructor() {
    this.authModal = null;
    this.authStateListeners = [];
    this.isSigningUp = false;
    this.isSigningIn = false;
    // A promise that resolves when the initial auth state is known
    this.authReady = new Promise((resolve) => {
      this.resolveAuthReady = resolve;
    });

    // Simple auth event callbacks - much simpler than full event system
    this.onSigninSuccess = null;
    this.onSigninError = null;
    this.onSignupSuccess = null;
    this.onSignupError = null;

    // 🛡️ Prevent multiple rapid submissions
    this.signupInProgress = false;
    this.signinInProgress = false;

    // Track last auth action ("signIn" or "signUp")
    this.lastAuthAction = null;
  }

  /**
   * Set callback for successful sign in
   * @param {function} callback - Function to call on successful sign in
   */
  setSigninSuccessCallback(callback) {
    this.onSigninSuccess = callback;
  }

  /**
   * Set callback for sign in errors
   * @param {function} callback - Function to call on sign in error
   */
  setSigninErrorCallback(callback) {
    this.onSigninError = callback;
  }

  /**
   * Trigger signin success callback if set
   */
  triggerSigninSuccess(data) {
    if (this.onSigninSuccess) {
      try {
        this.onSigninSuccess(data);
      } catch (error) {
        console.error("Error in signin success callback:", error);
      }
    }
  }

  /**
   * Trigger signin error callback if set
   */
  triggerSigninError(data) {
    if (this.onSigninError) {
      try {
        this.onSigninError(data);
      } catch (error) {
        console.error("Error in signin error callback:", error);
      }
    }
  }

  /**
   * Initialize the authentication system
   */
  async initialize() {
    if (logManager?.dev) logManager.dev.debug("Initializing authentication...");

    // Set up authentication state listener
    this.setupAuthStateListener();

    // Create the authentication modal
    this.createAuthModal();

    if (logManager?.dev) logManager.dev.debug("Authentication system ready");
  }

  /**
   * Create the authentication modal HTML
   */
  createAuthModal() {
    const modalHTML = `
      <div id="auth-modal" class="auth-modal" style="display: none;">
        <div class="auth-container">
          <button class="auth-close" id="auth-close-btn">&times;</button>
          
          <div class="auth-header">
            <div class="auth-logo">🎓 MeetchuThere</div>
            <div class="auth-subtitle">Join your university community</div>
          </div>

          <div class="auth-tabs">
            <button class="auth-tab active" data-tab="signin">Sign In</button>
            <button class="auth-tab" data-tab="signup">Sign Up</button>
          </div>

          <div class="auth-body">
            <!-- Sign In Form -->
            <form id="signin-form" class="auth-form active">
              <div class="form-group">
                <label class="form-label" for="signin-email">University Email</label>
                <input 
                  type="email" 
                  id="signin-email" 
                  class="form-input"
                  placeholder="yourID@university.edu.bd"
                  autocomplete="username"
                  required
                />
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signin-password">Password</label>
                <input 
                  type="password" 
                  id="signin-password" 
                  class="form-input"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  required
                />
                <div class="form-error"></div>
              </div>

              <button type="submit" id="signin-button" class="auth-button">
                <div class="loading-dots">
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                </div>
                <span class="button-text">Sign In to MeetchuThere</span>
              </button>
              
              <div class="forgot-password-section">
                <a href="#" id="forgot-password-link" class="forgot-password-link">Forgot Password?</a>
              </div>
            </form>

            <!-- Sign Up Form -->
            <form id="signup-form" class="auth-form">
              <div class="university-info" id="university-info">
                <div class="university-name" id="university-name"></div>
                <div class="university-domain" id="university-domain"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-email">University Email</label>
                <input 
                  type="email" 
                  id="signup-email" 
                  class="form-input"
                  placeholder="yourID@university.edu.bd"
                  autocomplete="username"
                  required
                />
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-password">Password</label>
                <input 
                  type="password" 
                  id="signup-password" 
                  class="form-input"
                  placeholder="Choose a strong password"
                  autocomplete="new-password"
                  minlength="6"
                  required
                />
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-confirm-password">Confirm Password</label>
                <input 
                  type="password" 
                  id="signup-confirm-password" 
                  class="form-input"
                  placeholder="Re-enter your password"
                  autocomplete="new-password"
                  required
                />
                <div class="form-error"></div>
              </div>

              <button type="submit" id="signup-button" class="auth-button">
                <div class="loading-dots">
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                </div>
                <span class="button-text">Create MeetchuThere Account</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.authModal = document.getElementById("auth-modal");

    // 🎯 CSS styles are now loaded via auth.css import in styles.css

    // Set up event listeners
    this.setupModalEventListeners();
  }

  /**
   * Set up all event listeners for the modal
   */
  setupModalEventListeners() {
    // 🎯 PHANTOM ERROR FIX: Add safety checks for DOM elements
    try {
      // Tab switching
      const authTabs = document.querySelectorAll(".auth-tab");
      if (authTabs.length > 0) {
        authTabs.forEach((tab) => {
          tab.addEventListener("click", (e) => {
            const tabName = e.target.dataset.tab;
            this.switchTab(tabName);
          });
        });
      } else {
        console.warn(
          "⚠️ AuthService: .auth-tab elements not found during setup"
        );
      }

      // Form submissions - with existence checks
      const signinForm = document.getElementById("signin-form");
      if (signinForm) {
        signinForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleSignIn();
        });
      } else {
        console.warn("⚠️ AuthService: #signin-form not found during setup");
      }

      const signupForm = document.getElementById("signup-form");
      if (signupForm) {
        signupForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleSignUp();
        });
      } else {
        console.warn("⚠️ AuthService: #signup-form not found during setup");
      }

      // Forgot password link
      const forgotPasswordLink = document.getElementById(
        "forgot-password-link"
      );
      if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", (e) => {
          e.preventDefault();
          this.handleForgotPassword();
        });
      } else {
        console.warn(
          "⚠️ AuthService: #forgot-password-link not found during setup"
        );
      }

      // Real-time email validation for signup
      const signupEmail = document.getElementById("signup-email");
      if (signupEmail) {
        signupEmail.addEventListener("input", (e) => {
          this.validateEmailInRealTime(e.target.value);
        });
      } else {
        console.warn("⚠️ AuthService: #signup-email not found during setup");
      }

      // Clear errors when user starts typing
      const formInputs = document.querySelectorAll(".form-input");
      if (formInputs.length > 0) {
        formInputs.forEach((input) => {
          input.addEventListener("input", () => {
            clearFieldError(input); // Use external function
          });
        });
      } else {
        console.warn(
          "⚠️ AuthService: .form-input elements not found during setup"
        );
      }
    } catch (error) {
      console.error(
        "❌ AuthService: Error setting up modal event listeners:",
        error
      );
    }

    // Close modal when clicking outside
    this.authModal.addEventListener("click", (e) => {
      if (e.target === this.authModal) {
        this.hideAuthModal();
      }
    });

    // Close button handler
    const closeBtn = document.getElementById("auth-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.hideAuthModal();
      });
    }
  }

  /**
   * Check if email is a development email for testing purposes
   * @param {string} email - Email to check
   * @returns {boolean} - True if development email
   */
  isDevelopmentEmail(email) {
    if (!email) return false;
    const e = String(email).trim();
    // Must be <anything>.dev@iub.edu.bd (case-insensitive)
    // Examples: john.dev@iub.edu.bd, a.b.dev@iub.edu.bd
    const re = /^[^@]+\.dev@iub\.edu\.bd$/i;
    return re.test(e);
  }

  /**
   * Handle sign in form submission
   */
  async handleSignIn() {
    this.lastAuthAction = "signIn";
    // 🛡️ Prevent multiple rapid submissions
    if (this.signinInProgress) {
      console.log("🔄 Sign in already in progress, ignoring duplicate request");
      return;
    }

    // 🎯 PHANTOM ERROR FIX: Check if elements exist before accessing
    const emailEl = document.getElementById("signin-email");
    const passwordEl = document.getElementById("signin-password");
    const button = document.getElementById("signin-button");

    if (!emailEl || !passwordEl || !button) {
      console.error("❌ AuthService: Required sign-in form elements not found");
      return;
    }

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    // Validate form
    if (!this.validateSignInForm(email, password)) {
      return;
    }

    // 🛡️ Set submission flag and show loading state
    this.signinInProgress = true;
    setLoadingState(button, true); // Use external function

    this.isSigningIn = true;

    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 1. Determine if user is allowed to proceed.
      const isDev = this.isDevelopmentEmail(email);
      const isVerified = user.emailVerified;

      // This is your security gate. Only allow verified users OR dev users.
      if (!isDev && !isVerified) {
        console.log(`🚫 Sign-in blocked for unverified user: ${email}`);
        await this.handleUnverifiedUser();
        return; // Stop execution.
      }

      // 2. If we reach here, the user is allowed. Now, ensure their profile exists BEFORE updating store
      console.log(
        `✅ User ${email} authenticated. Checking for Firestore profile...`
      );
      let profile = await dataManager.getUserProfile(user.uid);

      if (!profile) {
        console.log(
          `First valid login for ${email}. Creating Firestore profile...`
        );
        try {
          profile = await this.createUserProfile(user, email);
          console.log(
            "✅ Firestore profile created successfully during sign-in."
          );
        } catch (profileError) {
          console.error(
            "❌ Failed to create Firestore profile during sign in:",
            profileError
          );
          if (isDev && !isVerified) {
            await this.handleDevCreationDisabled();
          } else {
            showFormError(
              "signin-form",
              "Couldn't create your profile. Please try again."
            );
            await signOut(auth);
          }
          return; // Do not set user state
        }
      }

      // Only after profile is available do we update the central store
      currentUser.setUser(user);
      // *** Immediately set the profile so UI subscribers in menu.js fire ***
      currentUser.setProfile(profile);

      // 🚀 IMMEDIATE PRESENCE UPDATE: Update lastActive immediately on successful login
      try {
        await dataManager.updateUserLastActive(user.uid);
        console.log("⚡ Immediate lastActive update on login successful");
      } catch (lastActiveError) {
        console.warn(
          "⚠️ Failed to update lastActive on login (non-critical):",
          lastActiveError
        );
      }

      // 3. Success! Hide modal and trigger success event.
      console.log(`🎉 Successfully signed in user: ${email}`);
      this.hideAuthModal();
      this.triggerSigninSuccess({ user, isDevelopment: isDev });
    } catch (error) {
      console.error("Sign in error:", error);
      showFormError("signin-form", this.getReadableError(error)); // Use external function
      // Call error callback if set
      this.triggerSigninError({ error, email });
    } finally {
      this.isSigningIn = false;
      // 🛡️ Reset submission flag and loading state
      this.signinInProgress = false;
      setLoadingState(button, false); // Use external function
    }
  }

  /**
   * Handle sign up form submission
   */
  async handleSignUp() {
    this.lastAuthAction = "signUp";
    // 🛡️ Prevent multiple rapid submissions
    if (this.signupInProgress) {
      console.log("🔄 Sign up already in progress, ignoring duplicate request");
      return;
    }

    // 🎯 PHANTOM ERROR FIX: Check if elements exist before accessing
    const emailEl = document.getElementById("signup-email");
    const passwordEl = document.getElementById("signup-password");
    const confirmPasswordEl = document.getElementById(
      "signup-confirm-password"
    );
    const button = document.getElementById("signup-button");

    if (!emailEl || !passwordEl || !confirmPasswordEl || !button) {
      console.error("❌ AuthService: Required sign-up form elements not found");
      return;
    }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    // Validate form
    if (!this.validateSignUpForm(email, password, confirmPassword)) {
      return;
    }

    // 🛡️ Set submission flag and show loading state
    this.signupInProgress = true;
    this.isSigningUp = true;
    setLoadingState(button, true); // Use external function

    try {
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Check if this is a development email
      if (this.isDevelopmentEmail(email)) {
        console.log("🔧 Development mode: Auto-verifying email for:", email);
        // For development emails, we'll skip sending verification email
        // Firebase Auth will still show emailVerified as false, but our sign-in logic bypasses it
      } else {
        // For production emails, send verification email
        await sendEmailVerification(user);
      }

      // Immediately sign out after successful signup so user is not auto-signed in
      await signOut(auth);

      // Show appropriate success message
      if (this.isDevelopmentEmail(email)) {
        showFormSuccess(
          // Use external function
          "signup-form",
          "🔧 Development account created! You can sign in immediately."
        );
      } else {
        showFormSuccess(
          // Use external function
          "signup-form",
          "🎉 Account created! Check your email to verify your account, then sign in."
        );
      }

      setTimeout(() => {
        this.switchTab("signin");
      }, 2000);
    } catch (error) {
      console.error("Sign up error:", error);
      showFormError("signup-form", this.getReadableError(error)); // Use external function
    } finally {
      // 🛡️ Reset submission flag and loading state
      this.signupInProgress = false;
      this.isSigningUp = false;
      setLoadingState(button, false); // Use external function
    }
  }

  /**
   * Handle forgot password functionality
   */
  async handleForgotPassword() {
    const emailEl = document.getElementById("signin-email");

    if (!emailEl) {
      console.error(
        "❌ AuthService: Email input not found for forgot password"
      );
      return;
    }

    const email = emailEl.value.trim();

    // Validate email exists and is university email
    if (!email) {
      showFieldError(
        emailEl,
        "Please enter your university email address first 📧"
      );
      return;
    }

    const emailValidation = validateUniversityEmail(email);
    if (!emailValidation) {
      showFieldError(emailEl, getFriendlyEmailError(email));
      return;
    }

    try {
      // Clear any existing errors
      clearFieldError(emailEl);

      // Send password reset email
      await sendPasswordResetEmail(auth, email);

      // Show success message
      showFormSuccess(
        "signin-form",
        `🔑 Password reset email sent to ${email}. Check your inbox!`
      );

      console.log(`📧 Password reset email sent to: ${email}`);
    } catch (error) {
      console.error("Forgot password error:", error);

      // Handle specific Firebase error cases
      let errorMessage;
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email address 🔍";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage =
          "Too many password reset attempts. Please try again later ⏰";
      } else {
        errorMessage =
          "Failed to send password reset email. Please try again 🛠️";
      }

      showFormError("signin-form", errorMessage);
    }
  }

  /**
   * Create user profile document in Firestore
   * 🗂️ ORGANIZED STRUCTURE: Use the same 4-field structure as profile completion
   */
  async createUserProfile(user, email) {
    const validation = validateUniversityEmail(email);

    console.log("🔍 Creating user profile with validation data:", validation);

    // 🗂️ ORGANIZED STRUCTURE: Match EXACTLY what profile completion creates
    const userProfile = {
      // Core Identity (root level - only uid)
      uid: user.uid,

      // University Information (grouped)
      universityInfo: {
        university: validation.universityId,
        universityName: validation.name,
        studentId: email.split("@")[0], // Extract from email
      },

      // Personal Profile (grouped - displayName deprecated, using handle)
      profile: {
        firstName: "",
        lastName: "",
        bio: "",
        major: "",
        startingYear: "",
        email: email,
        handle: null, // Will be claimed post-signup
      },

      // Avatar Configuration (grouped - will be populated during profile setup)
      avatarConfig: null,

      // System Status (grouped - includes all system-related fields)
      systemInfo: {
        profileSetupComplete: false,
        status: "offline",
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        lastActive: serverTimestamp(),
      },
    };

    console.log(
      "📊 User profile structure to be saved:",
      JSON.stringify(userProfile, null, 2)
    );

    try {
      // Use dataManager to save user profile instead of direct setDoc
      console.log("💾 Attempting to save user profile to Firestore...");
      console.log("🔑 User UID:", user.uid);
      console.log("📧 User email:", user.email);
      console.log("✅ User emailVerified:", user.emailVerified);

      const result = await dataManager.saveUserProfile(user.uid, userProfile);
      if (!result.success) {
        throw new Error(result.error || "Unknown error saving profile");
      }
      console.log(
        "👤 User profile created in Firestore with organized structure matching profile-setup.js"
      );

      // *** Return the profile so handleSignIn can call currentUser.setProfile(...) immediately
      return userProfile;
    } catch (error) {
      console.error("❌ Failed to create user profile in Firestore:", error);
      console.error("❌ Error code:", error.code);
      console.error("❌ Error message:", error.message);
      console.error("❌ Error details:", error);
      console.error("📊 Profile data that failed to save:", userProfile);
      throw new Error(`Profile creation failed: ${error.message}`);
    }
  }

  /**
   * Sets up the listener that responds to Firebase's auth state changes.
   * This is the central point for handling logins, logouts, and session persistence.
   */
  setupAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
      // 🛡️ Guard clauses to prevent race conditions
      if (this.isSigningUp || this.isSigningIn) return;

      if (user) {
        // --- User is signed in ---
        console.log("🔒 Auth state changed: User is logged in.", user.uid);

        // 0. Security check BEFORE mutating app state
        if (!this.isUserAllowed(user)) {
          console.warn(
            "🚫 User not allowed (unverified or restricted). Signing out and blocking state updates."
          );
          await this.handleUnverifiedUser();
          // Ensure no logged-in state leaks to subscribers
          currentUser.reset();
          this.notifyAuthStateChange(null);
          this.resolveAuthReady();
          return;
        }

        // 1. If this is an unverified dev email and profile doesn't exist (toggle OFF blocks create), sign out
        try {
          const isDevUnverified =
            this.isDevelopmentEmail(user.email) && !user.emailVerified;
          if (isDevUnverified) {
            const existingProfile = await dataManager.getUserProfile(user.uid);
            if (!existingProfile) {
              await this.handleDevCreationDisabled();
              this.resolveAuthReady();
              return;
            }
          }
        } catch (_) {
          /* non-fatal */
        }

        // 2. Set the user in our central state manager only after passing checks
        currentUser.setUser(user);

        // 3. Fetch the user's profile from Firestore
        try {
          console.log("👤 Fetching user profile...");
          const userProfile = await dataManager.getUserProfile(user.uid);

          if (userProfile) {
            console.log("✅ Profile loaded successfully.");
            // 4. Set the profile in our central state manager
            currentUser.setProfile(userProfile);
            // For backward compatibility, you might still notify listeners with the user object
            this.notifyAuthStateChange(user);

            // 🌍 Auto-start location tracking if conditions are met
            this.initializeLocationTracking();
          } else {
            // 🎯 FINAL FIX: This is the critical change.
            // During a race condition on first sign-in, the profile might not be available
            // in Firestore *immediately* when this listener runs.
            // Previously, we would set the profile to `null`, wiping out the data that
            // `handleSignIn` was in the process of setting.
            // Now, we simply log it and do nothing. We trust that another process
            // (like `handleSignIn`) is responsible for setting the profile.
            console.warn(
              "🤔 Auth listener: User is authenticated, but Firestore profile not (yet) found. This is expected during first sign-in."
            );
          }
        } catch (error) {
          console.error(
            "❌ Error fetching user profile inside auth state listener:",
            error
          );
          // 🎯 FINAL FIX: Do NOT set the profile to null here.
          // An error fetching the profile (e.g., a permission error during a race
          // condition) should not wipe out the state that might have just been
          // set by another process like `handleSignIn`. We just log the error.
          this.notifyAuthStateChange(null);
        }
      } else {
        // --- User is signed out ---
        console.log("🔒 Auth state changed: User is logged out.");
        try {
          const prevUid = currentUser?.uid;
          this.clearLocalCachesOnLogout(prevUid);
          // Best-effort: stop schedule realtime/pending operations
          try {
            const { scheduleStorageService } = await import(
              "../schedule/ScheduleStorageService.js"
            );
            if (scheduleStorageService?.cleanup) {
              scheduleStorageService.cleanup();
            }
          } catch (_) {}
        } catch (_) {}
        currentUser.reset();
        this.notifyAuthStateChange(null);
      }

      // Signal that the initial auth check is complete.
      this.resolveAuthReady();
    });
  }

  /**
   * Remove localStorage entries that should not persist across logout
   * @param {string|null} prevUid
   */
  clearLocalCachesOnLogout(prevUid) {
    try {
      if (prevUid) {
        try {
          localStorage.removeItem(`schedule_${prevUid}`);
        } catch (_) {}
      }
      const keysToRemove = [
        "campusLocationService_visited",
        "campusLocation_lastActive",
        "campusLocation_authTime",
        "campusPresence_lastFreshData",
        "meetchuthere_last_location",
        "meetchuthere_compare_tooltip_seen",
      ];
      keysToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      });
    } catch (e) {
      console.warn("⚠️ Failed clearing local caches on logout:", e);
    }
  }

  /**
   * Check if user should be allowed access
   * @param {Object} user - Firebase user object
   * @returns {boolean} - True if user is allowed
   */
  isUserAllowed(user) {
    // Allow development emails without verification
    if (this.isDevelopmentEmail(user.email)) {
      return true;
    }

    // Only allow verified emails for all other users
    return !!user.emailVerified;
  }

  /**
   * Handle unverified users by signing them out
   */
  async handleUnverifiedUser() {
    await signOut(auth);
    // Only show notification if last action was signIn
    if (this.lastAuthAction === "signIn") {
      try {
        notificationManager.showWarningNotification(
          "Verify your email to sign in. Check your inbox for the link.",
          { duration: 6000 }
        );
      } catch (e) {
        // Fallback to DataService if NotificationService fails for any reason
        if (
          typeof dataManager !== "undefined" &&
          dataManager.showNotification
        ) {
          dataManager.showNotification(
            "Verify your email to sign in. Check your inbox for the link.",
            "warning"
          );
        }
      }
    }
    this.showAuthModal();
  }

  /**
   * Handle case where a dev email signs in while dev creation is disabled
   * We sign out and show a compact warning.
   */
  async handleDevCreationDisabled() {
    try {
      await signOut(auth);
    } catch (_) {}
    try {
      notificationManager.showWarningNotification(
        "Dev account creation is disabled. Try again later.",
        { duration: 6000 }
      );
    } catch (_) {
      if (typeof dataManager !== "undefined" && dataManager.showNotification) {
        dataManager.showNotification(
          "Dev account creation is disabled. Try again later.",
          "warning"
        );
      }
    }
    this.showAuthModal();
  }

  /**
   * Initialize location tracking if user has location sharing enabled
   * Called after user profile is successfully loaded
   */
  async initializeLocationTracking() {
    try {
      console.log("🌍 [AuthService] Initializing location tracking...");

      // Dynamically import campus location service to avoid circular dependencies
      const { campusLocationService } = await import(
        "../location/CampusLocationService.js"
      );

      // Use a small delay to ensure all auth processes are complete
      setTimeout(() => {
        campusLocationService.autoStartLocationTracking();
      }, 1000);
    } catch (error) {
      console.error(
        "🌍 [AuthService] Error initializing location tracking:",
        error
      );
    }
  }

  /**
   * Notify all listeners about auth state change
   * @param {Object|null} user - User object or null
   */
  notifyAuthStateChange(user) {
    this.authStateListeners.forEach((listener) => listener(user));
  }

  /**
   * Registers a callback to be executed when auth state changes.
   * @param {function} callback - The function to call with the user object (or null).
   */
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
    // If auth state is already known, call it immediately
    this.authReady.then(() => callback(currentUser.user));
  }

  /**
   * Gets the current authenticated user object.
   * DEPRECATED: Use `import { currentUser } from '../../store/userStore.js'` instead.
   * @returns {object|null} The current Firebase user object or null.
   */
  getCurrentUser() {
    return currentUser.user;
  }

  /**
   * Sign out current user
   */
  async handleSignOut() {
    try {
      // Stop friends listeners before signing out to prevent false notifications
      if (window.friendsManager) {
        console.log("🛑 Stopping friends listeners before sign out...");
        window.friendsManager.stopRealTimeListening();
      }

      // Stop location tracking before signing out
      if (window.campusLocationService) {
        console.log("🌍 Stopping location tracking before sign out...");
        window.campusLocationService.stopLocationTracking();
      }

      await signOut(auth);
      console.log("👋 Successfully signed out");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  }

  /**
   * Update user's last active timestamp
   * 🏆 BEST PRACTICE: Use updateDoc with specific field to avoid race conditions
   */
  async updateUserLastActive() {
    if (!this.currentUser) return;
    try {
      // Use dataManager for last active update
      const result = await dataManager.updateUserLastActive(
        this.currentUser.uid
      );
      if (!result.success) {
        throw new Error(result.error || "Unknown error updating lastActive");
      }
      console.log("👤 Updated lastActive timestamp in systemInfo");
    } catch (error) {
      // 🛡️ SILENT FAIL: Don't let lastActive updates break the app
      console.log("⚠️ LastActive update failed (non-critical):", error.message);
    }
  }

  /**
   * Check if a user is currently authenticated and their profile is loaded.
   * This is the authoritative check for accessing protected routes.
   * @returns {boolean} True if the user is authenticated.
   */
  isAuthenticated() {
    // The most reliable check is to see if our currentUser module has a UID.
    return currentUser.isLoggedIn();
  }

  /**
   * Get current user's profile data (if available).
   * @returns {object|null} The current user object or null if not signed in.
   */
  getCurrentUserData() {
    return this.currentUser;
  }

  // ===== UI HELPER METHODS =====
  // All methods that deal with showing/hiding UI elements

  /**
   * Show authentication modal
   */
  showAuthModal() {
    // 🎯 SAFEGUARD: Don't show auth modal if user is already logged in
    if (this.getCurrentUser()) {
      console.log("🚫 User already logged in, not showing auth modal");
      return;
    }

    if (!this.authModal) this.createAuthModal();
    if (this.authModal) {
      this.authModal.style.display = "flex";
      this.authModal.classList.add("active");
    }
    document.body.style.overflow = "hidden";
  }

  /**
   * Hide authentication modal
   */
  hideAuthModal() {
    if (this.authModal) {
      this.authModal.style.display = "none";
      this.authModal.classList.remove("active");
      document.body.style.overflow = "";
      clearAllErrors(); // Use external function
    }
  }

  /**
   * Switch between sign in and sign up tabs
   */
  switchTab(tabName) {
    // 🎯 PHANTOM ERROR FIX: Add safety checks for DOM elements
    try {
      // Update tab buttons
      const authTabs = document.querySelectorAll(".auth-tab");
      if (authTabs.length > 0) {
        authTabs.forEach((tab) => {
          tab.classList.remove("active");
        });
      }

      const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
      if (targetTab) {
        targetTab.classList.add("active");
      } else {
        console.warn(
          `⚠️ AuthService: Tab button [data-tab="${tabName}"] not found`
        );
      }

      // Update forms
      const authForms = document.querySelectorAll(".auth-form");
      if (authForms.length > 0) {
        authForms.forEach((form) => {
          form.classList.remove("active");
        });
      }

      const targetForm = document.getElementById(`${tabName}-form`);
      if (targetForm) {
        targetForm.classList.add("active");
      } else {
        console.warn(`⚠️ AuthService: Form #${tabName}-form not found`);
      }

      // Clear any errors
      clearAllErrors(); // Use external function
    } catch (error) {
      console.error(
        `❌ AuthService: Error switching to tab "${tabName}":`,
        error
      );
    }
  }

  /**
   * Validate email in real-time as user types
   */
  validateEmailInRealTime(email) {
    // 🎯 PHANTOM ERROR FIX: Check if elements exist before accessing
    const universityInfo = document.getElementById("university-info");
    const universityName = document.getElementById("university-name");
    const universityDomain = document.getElementById("university-domain");

    if (!universityInfo || !universityName || !universityDomain) {
      console.warn(
        "⚠️ AuthService: University info elements not found for email validation"
      );
      return;
    }

    if (!email) {
      universityInfo.classList.remove("visible");
      return;
    }

    const validation = validateUniversityEmail(email);

    if (validation) {
      // Show university info
      universityName.textContent = validation.name;
      universityDomain.textContent = `✅ ${validation.domain}`;
      universityInfo.classList.add("visible");
    } else {
      universityInfo.classList.remove("visible");
    }
  }

  // ===== VALIDATION METHODS =====
  // All methods that validate user input

  /**
   * Validate sign in form
   */
  validateSignInForm(email, password) {
    let isValid = true;

    // Validate email
    const emailValidation = validateUniversityEmail(email);
    if (!emailValidation) {
      showFieldError(
        // Use external function
        document.getElementById("signin-email"),
        getFriendlyEmailError(email)
      );
      isValid = false;
    }

    // Validate password
    if (!password) {
      showFieldError(
        // Use external function
        document.getElementById("signin-password"),
        "Please enter your password 🔒"
      );
      isValid = false;
    }

    return isValid;
  }

  /**
   * Validate sign up form
   */
  validateSignUpForm(email, password, confirmPassword) {
    let isValid = true;

    // Validate email
    const emailValidation = validateUniversityEmail(email);
    if (!emailValidation) {
      showFieldError(
        // Use external function
        document.getElementById("signup-email"),
        getFriendlyEmailError(email)
      );
      isValid = false;
    }

    // Validate password
    if (!password) {
      showFieldError(
        // Use external function
        document.getElementById("signup-password"),
        "Please choose a password 🔒"
      );
      isValid = false;
    } else if (password.length < 6) {
      showFieldError(
        // Use external function
        document.getElementById("signup-password"),
        "Password must be at least 6 characters long 📏"
      );
      isValid = false;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      showFieldError(
        // Use external function
        document.getElementById("signup-confirm-password"),
        "Passwords don't match 🔄"
      );
      isValid = false;
    }

    return isValid;
  }

  // ===== UTILITY METHODS =====
  // Helper methods for various tasks

  /**
   * Convert Firebase error codes to friendly messages
   */
  getReadableError(error) {
    // Changed parameter from errorMessage to error
    const errorMap = {
      "auth/user-not-found": "No account found with this email address 🔍",
      "auth/wrong-password": "Incorrect password. Please try again 🔑",
      "auth/invalid-credential":
        "Incorrect email or password. Please try again.", // Added this line
      "auth/email-already-in-use": "An account with this email already exists",
      "auth/weak-password":
        "Password is too weak. Please choose a stronger one",
      "auth/invalid-email": "Invalid email address format",
      "auth/too-many-requests":
        "Too many failed attempts. Please try again later",
      // Add other common Firebase Auth error codes here if needed
    };

    // Check if the error object and its code property exist, and if the code is in our map
    if (error && error.code && errorMap[error.code]) {
      return errorMap[error.code];
    }

    // If no specific mapping by code, fallback to the error's message property
    // This handles custom new Error("message") and unmapped Firebase errors
    if (error && error.message) {
      return error.message;
    }

    // If all else fails, return a generic error message
    return "An unexpected error occurred. Please try again. 🛠️";
  }
}

// ===== UI HELPER FUNCTIONS =====
// These functions handle UI manipulation and are separate from authentication logic

/**
 * Show error for a specific field
 * @param {HTMLElement} input - The input element
 * @param {string} message - Error message to show
 */
function showFieldError(input, message) {
  input.classList.add("error");
  const errorEl = input.parentNode.querySelector(".form-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }
}

/**
 * Clear error for a specific field
 * @param {HTMLElement} input - The input element
 */
function clearFieldError(input) {
  input.classList.remove("error");
  input.classList.remove("success");
  const errorEl = input.parentNode.querySelector(".form-error");
  if (errorEl) {
    errorEl.classList.remove("show");
  }
}

/**
 * Show form-level error message
 * @param {string} formId - ID of the form
 * @param {string} message - Error message to show
 */
function showFormError(formId, message) {
  let errorDiv = document.querySelector(`#${formId} .error-message`);
  if (!errorDiv) {
    errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    document
      .getElementById(formId)
      .insertBefore(errorDiv, document.getElementById(formId).firstChild);
  }
  errorDiv.textContent = message;
}

/**
 * Show form-level success message
 * @param {string} formId - ID of the form
 * @param {string} message - Success message to show
 */
function showFormSuccess(formId, message) {
  let successDiv = document.querySelector(`#${formId} .success-message`);
  if (!successDiv) {
    successDiv = document.createElement("div");
    successDiv.className = "success-message";
    document
      .getElementById(formId)
      .insertBefore(successDiv, document.getElementById(formId).firstChild);
  }
  successDiv.textContent = message;

  // Auto-dismiss success message after 5 seconds
  setTimeout(() => {
    if (successDiv && successDiv.parentNode) {
      successDiv.style.opacity = "0";
      successDiv.style.transform = "translateY(-10px)";
      setTimeout(() => {
        if (successDiv && successDiv.parentNode) {
          successDiv.remove();
        }
      }, 300); // Wait for fade animation
    }
  }, 5000);
}

/**
 * Clear all errors and messages from forms
 */
function clearAllErrors() {
  document
    .querySelectorAll(".form-error")
    .forEach((el) => (el.textContent = ""));
  document
    .querySelectorAll(".form-success")
    .forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".form-input").forEach((el) => {
    el.classList.remove("error");
    el.classList.remove("success");
  });
}

/**
 * Show or hide the loading state of a button
 * @param {HTMLButtonElement} button - The button element
 * @param {boolean} isLoading - True to show loading, false to hide
 */
function setLoadingState(button, isLoading) {
  const buttonText = button.querySelector(".button-text");
  const loadingDots = button.querySelector(".loading-dots");

  if (isLoading) {
    button.classList.add("loading");
    if (buttonText) buttonText.style.display = "none";
    if (loadingDots) loadingDots.style.display = "flex";
    button.disabled = true;
  } else {
    button.classList.remove("loading");
    if (buttonText) buttonText.style.display = "block";
    if (loadingDots) loadingDots.style.display = "none";
    button.disabled = false;
  }
}

// Export singleton instance for ES6 modules
const authManagerInstance = new AuthManager();
export const authManager = authManagerInstance;

// 🔥 CRITICAL: Initialize the auth manager immediately when module loads
// This ensures the auth state listener is set up as soon as possible
authManagerInstance.initialize().catch((error) => {
  console.error("❌ Failed to initialize AuthManager:", error);
});

// Example: How to use the simple callback system (much easier!)
// authManager.setSigninSuccessCallback((data) => {
//   console.log('User signed in:', data.user);
//   if (data.isDevelopment) {
//     console.log('This was a development email');
//   }
//   // Maybe redirect to dashboard or show welcome message
// });
//
// authManager.setSigninErrorCallback((data) => {
//   console.log('Sign in failed:', data.error.message);
//   // Maybe show user-friendly error or send to analytics
// });
