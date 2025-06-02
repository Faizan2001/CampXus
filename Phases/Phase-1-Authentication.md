# Phase 1: Firebase Authentication Setup 🎓✨

## Welcome to Authentication! 🚀

Welcome to Phase 1, where we add Firebase Authentication to CampXus! Think of this phase as creating the "front door" to your app - a welcoming, secure place where university students can sign up and sign in to manage their schedules.

## What We're Building 🌟

After completing Phase 0's Firebase setup, we'll now build a complete authentication system that:

- **University Email Validation**: Only students with university emails can join
- **Beautiful Sign-up/Sign-in Forms**: Clean, mobile-friendly authentication
- **Email Verification**: Students verify their email before full access
- **Firebase Integration**: Seamless connection with Firebase Authentication

## 🏗️ Simple Architecture

This phase uses Firebase Authentication basics:

- **Client-Side**: JavaScript form handling and Firebase Auth methods
- **Firebase Auth**: Email/password authentication
- **University Validation**: Simple domain checking for university emails
- **User-Friendly UI**: Clean forms with helpful feedback

## 📋 Prerequisites

Make sure you've completed Phase 0:

- [ ] Firebase project is created and configured
- [ ] Firebase Authentication is enabled in console
- [ ] Firebase CLI is installed and logged in
- [ ] Basic HTML/CSS/JavaScript understanding

## 🎯 Learning Goals

By the end of this phase, you'll know how to:

- **Use Firebase Authentication**: Create and sign in users with email/password
- **Validate Email Domains**: Check if emails belong to universities
- **Handle Auth State**: Track when users are logged in or out
- **Create Forms**: Build responsive sign-up and sign-in forms
- **Manage User Sessions**: Keep users logged in across browser sessions

## 🛠️ Mission: Your Authentication Adventure

### Adventure 1: University Email Validator 🏫

Let's start by creating a simple system to validate university email addresses. This ensures only real university students can join CampXus!

#### 1.1 Create the University Validator

Create `js/university-validator.js`:

```javascript
// Simple university email validation for CampXus
const SUPPORTED_UNIVERSITIES = {
  iub: {
    name: "Independent University, Bangladesh",
    domains: ["iub.edu.bd"],
    displayName: "IUB",
  },
  // Easy to add more universities later!
  // nsu: {
  //   name: "North South University",
  //   domains: ["northsouth.edu"],
  //   displayName: "NSU"
  // }
};

/**
 * Check if an email belongs to a supported university
 * @param {string} email - The email to validate
 * @returns {object|null} University info if valid, null if not
 */
function validateUniversityEmail(email) {
  // Basic email format check
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return null;
  }

  // Extract domain from email (everything after @)
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) {
    return null;
  }

  // Check if this domain belongs to any of our supported universities
  for (const [universityId, university] of Object.entries(
    SUPPORTED_UNIVERSITIES
  )) {
    if (university.domains.includes(domain)) {
      return {
        universityId,
        name: university.name,
        displayName: university.displayName,
        domain,
        isValid: true,
      };
    }
  }

  // Not a supported university domain
  return null;
}

/**
 * Get a friendly error message for invalid emails
 * @param {string} email - The email that failed validation
 * @returns {string} A helpful error message
 */
function getFriendlyEmailError(email) {
  if (!email) {
    return "Please enter your university email address 📧";
  }

  if (!email.includes("@")) {
    return "That doesn't look like an email address. Did you forget the @ symbol? 🤔";
  }

  const domain = email.split("@")[1];
  if (!domain) {
    return "Your email looks incomplete. Please finish typing it! ✍️";
  }

  // Check for common typos
  if (domain.includes("iub.edu") && !domain.includes("iub.edu.bd")) {
    return "Almost there! Did you mean @iub.edu.bd? 🎯";
  }

  return `We don't support ${domain} yet. Currently supporting IUB students! 🏫`;
}

/**
 * Get list of all supported universities
 * @returns {array} List of supported universities
 */
function getSupportedUniversities() {
  return Object.entries(SUPPORTED_UNIVERSITIES).map(([id, uni]) => ({
    id,
    name: uni.name,
    displayName: uni.displayName,
    domains: uni.domains,
  }));
}

// Export functions for use in other files
export {
  validateUniversityEmail,
  getFriendlyEmailError,
  getSupportedUniversities,
};
```

#### 1.2 Test Your Email Validator

Create `js/university-validator.test.js`:

```javascript
// Simple tests to make sure our email validator works correctly
import {
  validateUniversityEmail,
  getFriendlyEmailError,
  getSupportedUniversities,
} from "./university-validator.js";

describe("University Email Validator", () => {
  test("accepts valid IUB email", () => {
    const result = validateUniversityEmail("student@iub.edu.bd");
    expect(result.isValid).toBe(true);
    expect(result.universityId).toBe("iub");
    expect(result.name).toBe("Independent University, Bangladesh");
  });

  test("rejects non-university email", () => {
    const result = validateUniversityEmail("user@gmail.com");
    expect(result).toBe(null);
  });

  test("handles invalid email formats", () => {
    expect(validateUniversityEmail("not-an-email")).toBe(null);
    expect(validateUniversityEmail("@iub.edu.bd")).toBe(null);
    expect(validateUniversityEmail("student@")).toBe(null);
  });

  test("provides helpful error messages", () => {
    expect(getFriendlyEmailError("")).toContain("Please enter");
    expect(getFriendlyEmailError("notemail")).toContain("@ symbol");
    expect(getFriendlyEmailError("student@gmail.com")).toContain(
      "don't support"
    );
  });

  test("lists supported universities", () => {
    const universities = getSupportedUniversities();
    expect(universities.length).toBeGreaterThan(0);
    expect(universities[0]).toHaveProperty("name");
  });
});
```

### Adventure 2: Beautiful Authentication Interface 🎨

Now let's create a beautiful, user-friendly authentication interface that makes signing up and signing in a joy!

#### 2.1 Create Authentication Styles

Create `css/auth.css`:

```css
/* CampXus Authentication Styles - Clean and Student-Friendly! */

/* Authentication Modal Overlay */
.auth-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
}

.auth-modal.active {
  opacity: 1;
  visibility: visible;
}

/* Main Authentication Container */
.auth-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow: hidden;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s ease;
}

.auth-modal.active .auth-container {
  transform: translateY(0) scale(1);
}

/* Header with CampXus Branding */
.auth-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 2rem;
  position: relative;
}

.auth-logo {
  font-size: 2rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}

.auth-subtitle {
  opacity: 0.9;
  font-size: 1rem;
}

/* Tab Navigation */
.auth-tabs {
  display: flex;
  background: #f8fafc;
  margin: 0;
  border: none;
}

.auth-tab {
  flex: 1;
  padding: 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  color: #64748b;
  transition: all 0.2s ease;
}

.auth-tab.active {
  background: white;
  color: #1e293b;
  border-bottom: 3px solid #667eea;
}

/* Form Container */
.auth-body {
  padding: 2rem;
}

.auth-form {
  display: none;
}

.auth-form.active {
  display: block;
  animation: fadeIn 0.3s ease;
}

/* University Info Display */
.university-info {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  display: none;
  animation: slideDown 0.3s ease;
}

.university-info.visible {
  display: block;
}

.university-name {
  font-weight: 600;
  color: #0369a1;
  margin-bottom: 0.25rem;
}

.university-domain {
  color: #0284c7;
  font-size: 0.9rem;
}

/* Form Styling */
.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input.error {
  border-color: #ef4444;
  background: #fef2f2;
}

.form-input.success {
  border-color: #10b981;
  background: #f0fdf4;
}

/* Error and Success Messages */
.form-error {
  color: #ef4444;
  font-size: 0.8rem;
  margin-top: 0.5rem;
  display: none;
}

.form-error.show {
  display: block;
}

.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.success-message {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #059669;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

/* Submit Buttons */
.auth-button {
  width: 100%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.auth-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.auth-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Loading Animation */
.auth-button .loading-spinner {
  display: none;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-right: 8px;
}

.auth-button.loading .loading-spinner {
  display: inline-block;
}

/* Close Button */
.auth-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s ease;
}

.auth-close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Mobile Responsiveness */
@media (max-width: 640px) {
  .auth-container {
    width: 95%;
    margin: 1rem;
  }

  .auth-header,
  .auth-body {
    padding: 1.5rem;
  }

  .auth-logo {
    font-size: 1.8rem;
  }
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .auth-container {
    background: #1f2937;
    color: #f9fafb;
  }

  .auth-tabs {
    background: #374151;
  }

  .auth-tab {
    color: #9ca3af;
  }

  .auth-tab.active {
    background: #4b5563;
    color: #f9fafb;
  }

  .form-input {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  .form-input:focus {
    border-color: #667eea;
  }
}
```

#### 2.2 Create the Authentication Manager

Create `js/auth-manager.js`:

```javascript
// Import Firebase Auth functions
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase-config.js";
import {
  validateUniversityEmail,
  getFriendlyEmailError,
} from "./university-validator.js";

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authModal = null;
    this.authStateListeners = [];
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
          <button class="auth-close" onclick="authManager.hideAuthModal()">&times;</button>
          
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
                  placeholder="your.name@iub.edu.bd"
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
                <span class="loading-spinner"></span>
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
                  placeholder="your.name@iub.edu.bd"
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
                <span class="loading-spinner"></span>
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
        this.clearFieldError(input);
      });
    });

    // Close modal when clicking outside
    this.authModal.addEventListener("click", (e) => {
      if (e.target === this.authModal) {
        this.hideAuthModal();
      }
    });
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
    this.clearAllErrors();
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

  /**
   * Handle sign in form submission
   */
  async handleSignIn() {
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;
    const button = document.getElementById("signin-button");

    // Validate form
    if (!this.validateSignInForm(email, password)) {
      return;
    }

    // Show loading state
    this.setLoadingState(button, true);

    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Check if email is verified
      if (!userCredential.user.emailVerified) {
        throw new Error(
          "Please verify your email before signing in. Check your inbox! 📧"
        );
      }

      console.log("🎉 Successfully signed in!");
      this.hideAuthModal();
    } catch (error) {
      console.error("Sign in error:", error);
      this.showFormError("signin-form", this.getReadableError(error.message));
    } finally {
      this.setLoadingState(button, false);
    }
  }

  /**
   * Handle sign up form submission
   */
  async handleSignUp() {
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

    // Show loading state
    this.setLoadingState(button, true);

    try {
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Send email verification
      await sendEmailVerification(user);

      // Create user profile in Firestore
      await this.createUserProfile(user, email);

      // Show success message and switch to sign in
      this.showFormSuccess(
        "signup-form",
        "🎉 Account created! Check your email to verify your account, then sign in."
      );

      setTimeout(() => {
        this.switchTab("signin");
      }, 2000);
    } catch (error) {
      console.error("Sign up error:", error);
      this.showFormError("signup-form", this.getReadableError(error.message));
    } finally {
      this.setLoadingState(button, false);
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
      emailVerified: false,
      profileSetupComplete: false,
    };

    await setDoc(doc(db, "users", user.uid), userProfile);
    console.log("👤 User profile created in Firestore");
  }

  /**
   * Set up Firebase auth state listener
   */
  setupAuthStateListener() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;

      if (user) {
        console.log("👋 User signed in:", user.email);
        this.updateUserLastActive();
      } else {
        console.log("👋 User signed out");
      }

      // Notify all listeners
      this.authStateListeners.forEach((listener) => listener(user));
    });
  }

  /**
   * Add listener for auth state changes
   */
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
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
   */
  async updateUserLastActive() {
    if (!this.currentUser) return;

    try {
      await setDoc(
        doc(db, "users", this.currentUser.uid),
        {
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error updating last active:", error);
    }
  }

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
      this.clearAllErrors();
    }
  }

  // Validation and UI Helper Methods

  /**
   * Validate sign in form
   */
  validateSignInForm(email, password) {
    let isValid = true;

    // Validate email
    const emailValidation = validateUniversityEmail(email);
    if (!emailValidation) {
      this.showFieldError(
        document.getElementById("signin-email"),
        getFriendlyEmailError(email)
      );
      isValid = false;
    }

    // Validate password
    if (!password) {
      this.showFieldError(
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
      this.showFieldError(
        document.getElementById("signup-email"),
        getFriendlyEmailError(email)
      );
      isValid = false;
    }

    // Validate password
    if (!password) {
      this.showFieldError(
        document.getElementById("signup-password"),
        "Please choose a password 🔒"
      );
      isValid = false;
    } else if (password.length < 6) {
      this.showFieldError(
        document.getElementById("signup-password"),
        "Password must be at least 6 characters long 📏"
      );
      isValid = false;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      this.showFieldError(
        document.getElementById("signup-confirm-password"),
        "Passwords don't match 🔄"
      );
      isValid = false;
    }

    return isValid;
  }

  /**
   * Show error for a specific field
   */
  showFieldError(input, message) {
    input.classList.add("error");
    const errorEl = input.parentNode.querySelector(".form-error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
    }
  }

  /**
   * Clear error for a specific field
   */
  clearFieldError(input) {
    input.classList.remove("error", "success");
    const errorEl = input.parentNode.querySelector(".form-error");
    if (errorEl) {
      errorEl.classList.remove("show");
    }
  }

  /**
   * Show form-level error message
   */
  showFormError(formId, message) {
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
   */
  showFormSuccess(formId, message) {
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
   * Clear all errors and messages
   */
  clearAllErrors() {
    // Clear field errors
    document.querySelectorAll(".form-input").forEach((input) => {
      this.clearFieldError(input);
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
   */
  setLoadingState(button, isLoading) {
    button.classList.toggle("loading", isLoading);
    button.disabled = isLoading;
  }

  /**
   * Convert Firebase error codes to friendly messages
   */
  getReadableError(errorMessage) {
    const errorMap = {
      "auth/user-not-found": "No account found with this email address 🔍",
      "auth/wrong-password": "Incorrect password. Please try again 🔑",
      "auth/email-already-in-use":
        "An account with this email already exists 📧",
      "auth/weak-password":
        "Password is too weak. Please choose a stronger one 💪",
      "auth/invalid-email": "Invalid email address format 📧",
      "auth/too-many-requests":
        "Too many failed attempts. Please try again later ⏰",
    };

    for (const [code, message] of Object.entries(errorMap)) {
      if (errorMessage.includes(code)) {
        return message;
      }
    }

    return errorMessage;
  }
}

// Create and export global auth manager instance
export const authManager = new AuthManager();
```

### Adventure 3: Connect Authentication to CampXus 🔗

Now let's integrate your beautiful authentication system with the main CampXus application!

#### 3.1 Update Your Firebase Configuration

First, make sure you have `js/firebase-config.js` (this should be from Phase 0):

```javascript
// Import Firebase SDK
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your Firebase configuration (from Phase 0)
const firebaseConfig = {
  // Your config from Firebase Console
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
```

#### 3.2 Update Your Main Script

Add authentication to your existing `js/script.js`:

```javascript
// Add imports at the top
import { authManager } from "./auth-manager.js";

// Add this to your existing DOMContentLoaded event
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Starting CampXus...");

  // Initialize authentication system
  await authManager.initialize();

  // Set up authentication state monitoring
  authManager.onAuthStateChanged((user) => {
    if (user) {
      console.log("✅ User authenticated, enabling full features");
      showAuthenticatedUI(user);
    } else {
      console.log("📱 No user authenticated, showing login");
      showUnauthenticatedUI();
    }
  });

  // Set up login button click handler
  const loginButton = document.getElementById("login-btn");
  if (loginButton) {
    loginButton.addEventListener("click", () => {
      authManager.showAuthModal();
    });
  }

  console.log("✅ CampXus loaded successfully!");
});

/**
 * Show UI for authenticated users
 */
function showAuthenticatedUI(user) {
  // Hide login button
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = "none";

  // Show user info
  showUserInfo(user);

  // Enable all CampXus features
  enableScheduleFeatures();
}

/**
 * Show UI for unauthenticated users
 */
function showUnauthenticatedUI() {
  // Show login button
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = "block";

  // Hide user info
  hideUserInfo();

  // Disable advanced features
  disableScheduleFeatures();
}

/**
 * Display user information in header
 */
function showUserInfo(user) {
  // Remove existing user info
  const existingUserInfo = document.getElementById("user-info");
  if (existingUserInfo) existingUserInfo.remove();

  // Create new user info
  const userInfo = document.createElement("div");
  userInfo.id = "user-info";
  userInfo.innerHTML = `
    <span class="user-email">👋 ${user.email}</span>
    <button id="logout-btn" class="btn btn-outline">Sign Out</button>
  `;

  // Add to header
  const header = document.querySelector("header");
  if (header) {
    header.appendChild(userInfo);

    // Add logout functionality
    document.getElementById("logout-btn").addEventListener("click", () => {
      authManager.signOut();
    });
  }
}

/**
 * Hide user information
 */
function hideUserInfo() {
  const userInfo = document.getElementById("user-info");
  if (userInfo) userInfo.remove();
}

/**
 * Enable features that require authentication
 */
function enableScheduleFeatures() {
  console.log("🎉 Enabling cloud sync, sharing, and advanced features!");

  // Enable cloud save/load buttons
  const cloudButtons = document.querySelectorAll(".cloud-feature");
  cloudButtons.forEach((btn) => {
    btn.disabled = false;
    btn.title = "Cloud features enabled!";
  });
}

/**
 * Disable features that require authentication
 */
function disableScheduleFeatures() {
  console.log("📱 Running in local mode - advanced features disabled");

  // Disable cloud features but keep basic scheduling
  const cloudButtons = document.querySelectorAll(".cloud-feature");
  cloudButtons.forEach((btn) => {
    btn.disabled = true;
    btn.title = "Sign in to use cloud features";
  });
}
```

#### 3.3 Update Your HTML

Add the authentication CSS and login button to your `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CampXus - University Schedule Manager</title>

    <!-- Existing CSS -->
    <link rel="stylesheet" href="css/style.css" />

    <!-- Add Authentication CSS -->
    <link rel="stylesheet" href="css/auth.css" />
  </head>
  <body>
    <header>
      <h1>🎓 CampXus</h1>
      <p>Your University Schedule Manager</p>

      <!-- Add Login Button -->
      <button id="login-btn" class="btn btn-primary">🎓 Join CampXus</button>

      <!-- User info will be added here dynamically -->
    </header>

    <main>
      <!-- Your existing schedule manager content -->
    </main>

    <!-- Your existing scripts -->
    <script type="module" src="js/script.js"></script>
  </body>
</html>
```

## ✅ Testing Your Authentication System

### The Complete Test Plan 🧪

Let's make sure everything works perfectly!

#### Test 1: Visual Tests 👀

1. **Open your CampXus application**
2. **Click "Join CampXus" button**
   - Modal should appear with smooth animation
   - Should see "Sign In" and "Sign Up" tabs
   - Forms should look clean and professional

#### Test 2: University Email Validation 🏫

1. **Go to Sign Up tab**
2. **Type in signup email field**:
   - `student@iub.edu.bd` - Should show university info
   - `student@gmail.com` - Should not show university info
   - `student@iub.edu` - Should suggest correct domain

#### Test 3: Sign Up Flow 📝

1. **Create account with valid university email**
2. **Check your email for verification link**
3. **Verify email and try signing in**

#### Test 4: Sign In Flow 🔑

1. **After verifying email, try to sign in**
2. **Use correct email and password**
3. **Should successfully sign in**
4. **Login button should disappear**
5. **Should see user email and "Sign Out" button**

#### Test 5: Error Handling 🚨

1. **Try wrong password** - should show friendly error
2. **Try unverified email** - should ask to verify
3. **Try signing up with existing email** - should show appropriate error

## 🎯 Success Criteria

You've mastered Phase 1 when:

### ✅ Firebase Authentication Basics

- [ ] Firebase Authentication is properly connected to your app
- [ ] Students can create accounts with university email addresses
- [ ] Email verification system works correctly
- [ ] Sign in and sign out functionality works smoothly
- [ ] Authentication state persists across browser refreshes

### ✅ University Email Validation

- [ ] Only university email domains are accepted
- [ ] Helpful error messages guide students to correct emails
- [ ] Real-time validation shows university info for valid domains
- [ ] Easy to add new universities to the system

### ✅ User Experience

- [ ] Beautiful, responsive authentication modal
- [ ] Smooth animations and transitions
- [ ] Clear error messages that help students understand issues
- [ ] Tab switching between Sign In and Sign Up works perfectly
- [ ] Mobile-friendly design

### ✅ Technical Implementation

- [ ] Code is organized with ES6 modules
- [ ] Firebase methods are used correctly
- [ ] User profiles are created in Firestore
- [ ] Authentication state is properly managed
- [ ] Event listeners work correctly

## 🎉 What You've Built!

### Your Authentication Features ✨

#### **Simple Firebase Authentication**

- **University Email Only**: Students sign up with university email addresses
- **Email Verification**: Must verify email before full access
- **Session Management**: Stay logged in across browser sessions
- **Secure Password Storage**: Firebase handles all security

#### **Beautiful User Interface**

- **Modern Modal Design**: Clean, professional authentication forms
- **Real-time Validation**: Instant feedback as students type
- **Friendly Error Messages**: Clear guidance when things go wrong
- **Mobile Responsive**: Works great on phones and tablets

#### **Smart Email Validation**

- **University Domain Checking**: Only accepts university email addresses
- **Helpful Suggestions**: Guides students to correct email formats
- **Easy to Extend**: Simple to add new universities

### Learning Outcomes 🎓

By completing Phase 1, you've learned:

- **Firebase Authentication**: How to implement secure user authentication
- **Form Validation**: Creating user-friendly validation with helpful feedback
- **JavaScript Modules**: Organizing code with classes and ES6 modules
- **CSS Animations**: Creating smooth, professional transitions
- **Event Handling**: Managing user interactions and form submissions
- **Error Handling**: Providing helpful feedback when things go wrong
- **State Management**: Tracking authentication status across your app

## 🎉 Congratulations!

Amazing work! You've successfully built a complete authentication system for CampXus!

Your university students can now:

- 🎓 **Sign up securely** with their university email
- 📧 **Verify their identity** through email verification
- 🔐 **Sign in easily** with a beautiful interface
- 📱 **Stay logged in** across different sessions
- 🏫 **Join their university community** on CampXus

You've learned essential skills in Firebase, JavaScript, and user experience design that will serve you well throughout your development journey!

## ⏭️ Next Up: Phase 2

Ready for **Phase 2: User Profile Setup**? We'll help students create their profiles, upload photos, and set up their course schedules to get fully started with CampXus!

---

**Estimated Time**: 3-4 hours  
**Difficulty**: Beginner-Friendly  
**Fun Factor**: 🌟🌟🌟🌟🌟  
**Skills Learned**: Firebase Auth, Form Validation, CSS Animations, JavaScript Modules  
**University Ready**: 🎓📚✨
