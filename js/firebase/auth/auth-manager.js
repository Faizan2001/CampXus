// Import Firebase Auth functions
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"; // Added getDoc
import { auth, db } from "../config/firebase-config.js";
import {
  validateUniversityEmail,
  getFriendlyEmailError,
} from "./university-validator.js";

/**
 * Custom error class for authentication-related errors
 * This helps us identify auth errors vs other types of errors
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
    this.currentUser = null;
    this.authModal = null;
    this.authStateListeners = [];
    // Simple auth event callbacks - much simpler than full event system
    this.onSigninSuccess = null;
    this.onSigninError = null;
    this.onSignupSuccess = null;
    this.onSignupError = null;

    // 🛡️ Prevent multiple rapid submissions
    this.signupInProgress = false;
    this.signinInProgress = false;
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
    console.log("🔥 Initializing CampXus Authentication...");

    // Set up authentication state listener
    this.setupAuthStateListener();

    // Create the authentication modal
    this.createAuthModal();

    console.log("✅ Authentication system ready!");
  }

  /**
   * Create the authentication modal HTML
   */
  createAuthModal() {
    const modalHTML = `
      <div id="auth-modal" class="auth-modal">
        <div class="auth-container">
          <button class="auth-close" id="auth-close-btn">&times;</button>
          
          <div class="auth-header">
            <div class="auth-logo">🎓 CampXus</div>
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
                <span class="button-text">Sign In to CampXus</span>
              </button>
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
                <span class="button-text">Create CampXus Account</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.authModal = document.getElementById("auth-modal");

    // Set up event listeners
    this.setupModalEventListeners();
  }

  /**
   * Set up all event listeners for the modal
   */
  setupModalEventListeners() {
    // Tab switching
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Form submissions
    document.getElementById("signin-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSignIn();
    });

    document.getElementById("signup-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSignUp();
    });

    // Real-time email validation for signup
    document.getElementById("signup-email").addEventListener("input", (e) => {
      this.validateEmailInRealTime(e.target.value);
    });

    // Clear errors when user starts typing
    document.querySelectorAll(".form-input").forEach((input) => {
      input.addEventListener("input", () => {
        clearFieldError(input); // Use external function
      });
    });

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
    const devPatterns = ["dev", "test", "fake", "demo"];
    return devPatterns.some((pattern) => email.toLowerCase().includes(pattern));
  }

  /**
   * Handle sign in form submission
   */
  async handleSignIn() {
    // 🛡️ Prevent multiple rapid submissions
    if (this.signinInProgress) {
      console.log("🔄 Sign in already in progress, ignoring duplicate request");
      return;
    }

    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;
    const button = document.getElementById("signin-button");

    // Validate form
    if (!this.validateSignInForm(email, password)) {
      return;
    }

    // 🛡️ Set submission flag and show loading state
    this.signinInProgress = true;
    setLoadingState(button, true); // Use external function

    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Check if this is a development email
      if (this.isDevelopmentEmail(email)) {
        console.log(
          "🔧 Development mode: Bypassing email verification for:",
          email
        );
        console.log("🎉 Successfully signed in! (Development email bypass)");
        this.hideAuthModal();
        // Call success callback if set
        this.triggerSigninSuccess({ user, isDevelopment: true });
        return;
      }

      // For production emails, check Firebase Auth's built-in emailVerified
      if (!user.emailVerified) {
        // Sign out the user immediately since they're not verified
        // This prevents them from being considered "signed in" even briefly
        await signOut(auth);
        throw new AuthError(
          "Please verify your email before signing in. Check your inbox. 📧",
          "email-not-verified"
        );
      }

      // If Firebase Auth's emailVerified is true, proceed
      console.log(
        "🎉 Successfully signed in! (Firebase Auth emailVerified check passed)"
      );
      this.hideAuthModal();
      // Call success callback if set
      this.triggerSigninSuccess({ user, isDevelopment: false });
    } catch (error) {
      console.error("Sign in error:", error);
      showFormError("signin-form", this.getReadableError(error)); // Use external function
      // Call error callback if set
      this.triggerSigninError({ error, email });
    } finally {
      // 🛡️ Reset submission flag and loading state
      this.signinInProgress = false;
      setLoadingState(button, false); // Use external function
    }
  }

  /**
   * Handle sign up form submission
   */
  async handleSignUp() {
    // 🛡️ Prevent multiple rapid submissions
    if (this.signupInProgress) {
      console.log("🔄 Sign up already in progress, ignoring duplicate request");
      return;
    }

    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById(
      "signup-confirm-password"
    ).value;
    const button = document.getElementById("signup-button");

    // Validate form
    if (!this.validateSignUpForm(email, password, confirmPassword)) {
      return;
    }

    // 🛡️ Set submission flag and show loading state
    this.signupInProgress = true;
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

      // Create user profile in Firestore (removed emailVerified field)
      await this.createUserProfile(user, email);

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
      setLoadingState(button, false); // Use external function
    }
  }

  /**
   * Create user profile document in Firestore
   */
  async createUserProfile(user, email) {
    const validation = validateUniversityEmail(email);

    const userProfile = {
      email: email,
      university: validation.universityId,
      universityName: validation.name,
      displayName: email.split("@")[0], // Default display name
      status: "offline",
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      profileSetupComplete: false, // Removed emailVerified field
    };

    await setDoc(doc(db, "users", user.uid), userProfile);
    console.log("👤 User profile created in Firestore");
  }

  /**
   * Set up Firebase auth state listener
   * This is the security guard that watches for auth changes
   */
  setupAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
      // 🔧 FIX: Add security logging here to consolidate auth listeners
      if (user) {
        console.log("Security: User authenticated", {
          uid: user.uid,
          email: user.email,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log("Security: User signed out", {
          timestamp: new Date().toISOString(),
        });
      }

      // 🛡️ FIX: Prevent rapid successive auth state changes
      if (this.currentUser === user) {
        console.log("🔄 Auth state unchanged, skipping processing");
        return;
      }

      this.currentUser = user;

      if (user) {
        // Check if user should be allowed access
        const isAllowed = this.isUserAllowed(user);

        if (isAllowed) {
          console.log("✅ User allowed access:", user.email);
          this.updateUserLastActive();
          this.notifyAuthStateChange(user);
        } else {
          console.log("❌ User not allowed - signing out:", user.email);
          await this.handleUnverifiedUser();
        }
      } else {
        console.log("👋 User signed out");
        this.notifyAuthStateChange(null);
      }
    });
  }

  /**
   * Check if user should be allowed access
   * @param {Object} user - Firebase user object
   * @returns {boolean} - True if user is allowed
   */
  isUserAllowed(user) {
    return this.isDevelopmentEmail(user.email) || user.emailVerified;
  }

  /**
   * Handle unverified users by signing them out
   */
  async handleUnverifiedUser() {
    await signOut(auth);
    this.showAuthModal();
  }

  /**
   * Notify all listeners about auth state change
   * @param {Object|null} user - User object or null
   */
  notifyAuthStateChange(user) {
    this.authStateListeners.forEach((listener) => listener(user));
  }

  /**
   * Add listener for auth state changes
   */
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
  }

  /**
   * Get current user - used by profile setup and other modules
   * @returns {Object|null} - Current user object or null
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Sign out current user
   */
  async signOut() {
    try {
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
      const { updateDoc } = await import("firebase/firestore");

      // 🎯 SOLUTION: Only update the specific field we need
      // This prevents interfering with other document reads/writes
      await updateDoc(doc(db, "users", this.currentUser.uid), {
        lastActive: serverTimestamp(),
      });

      console.log("👤 Updated lastActive timestamp");
    } catch (error) {
      // 🛡️ SILENT FAIL: Don't let lastActive updates break the app
      console.log("⚠️ LastActive update failed (non-critical):", error.code);
    }
  }

  // ===== UI HELPER METHODS =====
  // All methods that deal with showing/hiding UI elements

  /**
   * Show authentication modal
   */
  showAuthModal() {
    if (!this.authModal) this.createAuthModal();
    this.authModal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  /**
   * Hide authentication modal
   */
  hideAuthModal() {
    if (this.authModal) {
      this.authModal.classList.remove("active");
      document.body.style.overflow = "";
      clearAllErrors(); // Use external function
    }
  }

  /**
   * Switch between sign in and sign up tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.classList.remove("active");
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

    // Update forms
    document.querySelectorAll(".auth-form").forEach((form) => {
      form.classList.remove("active");
    });
    document.getElementById(`${tabName}-form`).classList.add("active");

    // Clear any errors
    clearAllErrors(); // Use external function
  }

  /**
   * Validate email in real-time as user types
   */
  validateEmailInRealTime(email) {
    const universityInfo = document.getElementById("university-info");
    const universityName = document.getElementById("university-name");
    const universityDomain = document.getElementById("university-domain");

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
  input.classList.remove("error", "success");
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
}

/**
 * Clear all errors and messages from forms
 */
function clearAllErrors() {
  // Clear field errors
  document.querySelectorAll(".form-input").forEach((input) => {
    clearFieldError(input);
  });

  // Clear form messages
  document
    .querySelectorAll(".error-message, .success-message")
    .forEach((msg) => {
      msg.remove();
    });
}

/**
 * Set loading state for buttons
 * @param {HTMLElement} button - The button element
 * @param {boolean} isLoading - Whether to show loading state
 */
function setLoadingState(button, isLoading) {
  button.classList.toggle("loading", isLoading);
  button.disabled = isLoading;
}

// Create and export global auth manager instance
export const authManager = new AuthManager();

// Expose auth manager to window for inline handlers
window.authManager = authManager;

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
