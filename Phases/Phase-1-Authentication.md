# Phase 1: University Authentication System 🎓

## What We're Building 🌟

Welcome to Phase 1! Here we'll add a simple but effective authentication system to CampXus. Students will be able to sign up with their university email and create accounts to use our schedule manager.

## Learning Goals 🎯

By the end of this phase, you'll have:

- **University Email Validation**: Only students with valid university emails can register
- **Simple Sign-up/Login**: Clean authentication flow with Firebase
- **Basic Security**: Email verification and simple validation
- **User-Friendly Interface**: Beautiful login and registration forms

### What You'll Build ✨

- **Email Validation**: Check if the email belongs to a supported university
- **Firebase Authentication**: Sign up and login with email/password
- **Email Verification**: Students must verify their email before accessing the app
- **Simple Security**: Basic protection against invalid registrations

## 📋 Prerequisites

Make sure you've completed Phase 0:

- [ ] Firebase project is set up and configured
- [ ] Firebase Authentication is enabled
- [ ] Basic HTML/CSS/JavaScript understanding

## 🎨 What You'll Learn

- **Firebase Authentication**: Using Firebase Auth for user management
- **Email Validation**: Validating university email addresses
- **Form Handling**: Creating responsive login/signup forms
- **User Experience**: Building smooth authentication flows

## 🛠️ Your Authentication Tasks

### Task 1: Simple University Email Validator 🏫

Create a simple system to check if email addresses belong to supported universities.

#### 1.1 Create the University Validator

**File: `js/university-validator.js`**

```javascript
// Simple university email validation
const SUPPORTED_UNIVERSITIES = {
  iub: {
    name: "Independent University, Bangladesh",
    domains: ["iub.edu.bd"],
    displayName: "IUB",
    colors: {
      primary: "#1e40af",
      secondary: "#3b82f6",
    },
  },
  // Add more universities here as needed
};

/**
 * Check if an email belongs to a supported university
 * @param {string} email - The email to validate
 * @returns {object|null} University info if valid, null if not
 */
function validateUniversityEmail(email) {
  if (!email || typeof email !== "string") {
    return null;
  }

  // Extract domain from email
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) {
    return null;
  }

  // Check each university's domains
  for (const [key, university] of Object.entries(SUPPORTED_UNIVERSITIES)) {
    if (university.domains.includes(domain)) {
      return {
        universityId: key,
        ...university,
        isValid: true,
      };
    }
  }

  return null;
}

/**
 * Get all supported universities for display
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

export { validateUniversityEmail, getSupportedUniversities };
/**
 * Get a friendly error message for invalid emails
 * @param {string} email - The problematic email
 * @returns {string} A helpful error message
 */
export function getFriendlyEmailError(email) {
  if (!email) return "Please enter your email address 📧";

  if (!email.includes("@")) {
    return "That doesn't look like an email address. Missing the @ symbol? 🤔";
  }

  const domain = email.split("@")[1];
  if (!domain) {
    return "That email looks incomplete. Did you finish typing? ✍️";
  }

  // Check for common typos
  if (domain.includes("iub.edu") && !domain.includes("iub.edu.bd")) {
    return "Almost there! Did you mean @iub.edu.bd? 🎯";
  }

  return `${domain} isn't a supported university yet. We currently support IUB students! 🏫`;
}
```

#### 1.2 Create Simple Email Validation Tests

Create `js/university-validator.test.js`:

```javascript
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

  test("rejects email from unsupported domain", () => {
    const result = validateUniversityEmail("user@example.com");
    expect(result).toBe(null);
  });

  test("handles invalid email formats", () => {
    expect(validateUniversityEmail("not-an-email")).toBe(null);
    expect(validateUniversityEmail("@iub.edu.bd")).toBe(null);
    expect(validateUniversityEmail("student@")).toBe(null);
  });

  test("provides helpful error messages", () => {
    expect(getFriendlyEmailError("")).toContain("Please enter");
    expect(getFriendlyEmailError("notemail")).toContain("Missing the @");
    expect(getFriendlyEmailError("student@example.com")).toContain(
      "isn't a supported university"
    );
    expect(getFriendlyEmailError("student@iub.edu")).toContain("@iub.edu.bd");
  });

  test("returns list of supported universities", () => {
    const universities = getSupportedUniversities();
    expect(universities.length).toBeGreaterThan(0);
    expect(universities[0]).toHaveProperty("id");
    expect(universities[0]).toHaveProperty("name");
    expect(universities[0]).toHaveProperty("domains");
  });
});
```

### Mission 2: Build the Secure Authentication Manager 🎨🔐

Time to create a beautiful, secure authentication interface that protects users while providing an exceptional experience!

#### 2.1 Create Security-Enhanced CSS

Create `css/auth.css`:

```css
/* CampXus Secure Authentication Styles - Beautiful meets Bulletproof! */

.auth-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.auth-modal.active {
  opacity: 1;
  visibility: visible;
}

.auth-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow: hidden;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.auth-modal.active .auth-container {
  transform: translateY(0) scale(1);
}

/* Security indicator */
.auth-security-indicator {
  position: absolute;
  top: 16px;
  right: 16px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
}

.auth-security-indicator::before {
  content: "🔐";
  font-size: 12px;
}

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
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.auth-subtitle {
  opacity: 0.9;
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.auth-security-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 6px 12px;
  border-radius: 20px;
  margin-top: 1rem;
  backdrop-filter: blur(10px);
}

.auth-body {
  padding: 2rem;
}

.auth-tabs {
  display: flex;
  background: #f8fafc;
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 2rem;
}

.auth-tab {
  flex: 1;
  background: none;
  border: none;
  padding: 12px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  color: #64748b;
}

.auth-tab.active {
  background: white;
  color: #1e293b;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.auth-form {
  display: none;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s ease;
}

.auth-form.active {
  display: block;
  opacity: 1;
  transform: translateY(0);
}

/* Security Context Display */
.security-context {
  background: #f0f9ff;
  border: 1px solid #0ea5e9;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.security-context-title {
  font-weight: 600;
  color: #0369a1;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.security-checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.security-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
}

.security-check.verified {
  color: #059669;
}

.security-check.warning {
  color: #d97706;
}

.security-check.error {
  color: #dc2626;
}

.university-info {
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  border: 1px solid #0ea5e9;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  display: none;
  transform: translateY(-10px);
  opacity: 0;
  transition: all 0.3s ease;
}

.university-info.visible {
  display: block;
  transform: translateY(0);
  opacity: 1;
}

.university-name {
  font-weight: 700;
  color: #0369a1;
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.university-domain {
  color: #0284c7;
  font-size: 0.9rem;
  font-weight: 500;
}

.university-security-features {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.security-feature {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 500;
}

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
  transition: all 0.2s;
  background: white;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input.error {
  border-color: #ef4444;
  background: #fef2f2;
}

.form-input.success {
  border-color: #10b981;
  background: #f0fdf4;
}

/* Real-time validation indicators */
.input-validation {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 0.8rem;
}

.validation-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.validation-icon.success {
  background: #10b981;
  color: white;
}

.validation-icon.error {
  background: #ef4444;
  color: white;
}

.validation-icon.loading {
  background: #f59e0b;
  color: white;
  animation: spin 1s linear infinite;
}

/* Password strength indicator */
.password-strength {
  margin-top: 8px;
  display: none;
}

.password-strength.visible {
  display: block;
}

.strength-bars {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.strength-bar {
  height: 4px;
  flex: 1;
  background: #e5e7eb;
  border-radius: 2px;
  transition: all 0.3s;
}

.strength-bar.filled {
  background: #10b981;
}

.strength-bar.weak {
  background: #ef4444;
}

.strength-bar.medium {
  background: #f59e0b;
}

.strength-bar.strong {
  background: #10b981;
}

.strength-text {
  font-size: 0.75rem;
  color: #6b7280;
}

.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-message::before {
  content: "⚠️";
  font-size: 16px;
}

.success-message {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #059669;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.success-message::before {
  content: "✅";
  font-size: 16px;
}

.auth-button {
  width: 100%;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.auth-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.auth-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.auth-button .loading-spinner {
  display: none;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-right: 8px;
}

.auth-button.loading .loading-spinner {
  display: inline-block;
}

.auth-button.loading .button-text {
  opacity: 0.8;
}

/* Privacy notice */
.privacy-notice {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-top: 1rem;
  font-size: 0.8rem;
  color: #6b7280;
  text-align: center;
}

.privacy-notice a {
  color: #3b82f6;
  text-decoration: none;
  font-weight: 500;
}

.privacy-notice a:hover {
  text-decoration: underline;
}

/* Close button */
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
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}

.auth-close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

/* Risk warning */
.risk-warning {
  background: linear-gradient(135deg, #fed7d7, #feb2b2);
  border: 1px solid #fc8181;
  color: #742a2a;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.risk-warning-title {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Additional verification required */
.additional-verification {
  background: #fef3c7;
  border: 1px solid #fbbf24;
  color: #92400e;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

/* Animations */
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Mobile responsiveness */
@media (max-width: 640px) {
  .auth-container {
    width: 95%;
    margin: 1rem;
  }

  .auth-header,
  .auth-body {
    padding: 1.5rem;
  }

  .security-checks {
    grid-template-columns: 1fr;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .auth-modal {
    background: rgba(0, 0, 0, 0.8);
  }

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
    border-color: #3b82f6;
  }
}
```

transition: all 0.3s ease;
}

.auth-modal.active {
opacity: 1;
visibility: visible;
}

.auth-container {
background: white;
border-radius: 20px;
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
overflow: hidden;
width: 90%;
max-width: 500px;
transform: translateY(30px);
transition: transform 0.3s ease;
}

.auth-modal.active .auth-container {
transform: translateY(0);
}

.auth-header {
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
color: white;
padding: 2rem;
text-align: center;
position: relative;
}

.auth-header::before {
content: "";
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="white" opacity="0.1"/><circle cx="80" cy="40" r="3" fill="white" opacity="0.1"/><circle cx="60" cy="80" r="1" fill="white" opacity="0.1"/></svg>');
pointer-events: none;
}

.auth-logo {
font-size: 2.5rem;
font-weight: bold;
margin-bottom: 0.5rem;
position: relative;
}

.auth-subtitle {
opacity: 0.9;
font-size: 1.1rem;
position: relative;
}

.auth-body {
padding: 2rem;
}

.auth-tabs {
display: flex;
margin-bottom: 2rem;
background: #f8fafc;
border-radius: 12px;
padding: 4px;
}

.auth-tab {
flex: 1;
padding: 12px 16px;
border: none;
background: transparent;
border-radius: 8px;
cursor: pointer;
font-weight: 500;
transition: all 0.2s ease;
color: #64748b;
}

.auth-tab.active {
background: white;
color: #1e293b;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.auth-form {
display: none;
}

.auth-form.active {
display: block;
}

.form-group {
margin-bottom: 1.5rem;
}

.form-label {
display: block;
font-weight: 500;
color: #374151;
margin-bottom: 0.5rem;
font-size: 0.9rem;
}

.form-input {
width: 100%;
padding: 12px 16px;
border: 2px solid #e5e7eb;
border-radius: 10px;
font-size: 1rem;
transition: all 0.2s ease;
background: #fafafa;
}

.form-input:focus {
outline: none;
border-color: #667eea;
background: white;
box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input.error {
border-color: #ef4444;
background: #fef2f2;
}

.form-error {
color: #ef4444;
font-size: 0.8rem;
margin-top: 0.25rem;
display: none;
}

.form-error.show {
display: block;
}

.auth-button {
width: 100%;
padding: 14px;
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
color: white;
border: none;
border-radius: 10px;
font-size: 1rem;
font-weight: 600;
cursor: pointer;
transition: all 0.2s ease;
position: relative;
overflow: hidden;
}

.auth-button:hover {
transform: translateY(-1px);
box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.auth-button:disabled {
opacity: 0.6;
cursor: not-allowed;
transform: none;
box-shadow: none;
}

.auth-button .loader {
display: none;
width: 20px;
height: 20px;
border: 2px solid transparent;
border-top: 2px solid white;
border-radius: 50%;
animation: spin 1s linear infinite;
margin-right: 8px;
}

.auth-button.loading .loader {
display: inline-block;
}

.university-info {
background: #f0f9ff;
border: 1px solid #bae6fd;
border-radius: 10px;
padding: 1rem;
margin-bottom: 1rem;
display: none;
}

.university-info.show {
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

@keyframes spin {
0% {
transform: rotate(0deg);
}
100% {
transform: rotate(360deg);
}
}

/_ Mobile responsiveness _/
@media (max-width: 640px) {
.auth-container {
width: 95%;
margin: 1rem;
}

.auth-header,
.auth-body {
padding: 1.5rem;
}
}

````

#### 2.2 Build the Secure Authentication Manager

Create `js/auth-manager.js`:

```javascript
/**
 * CampXus Simple Authentication Manager
 * Handles Firebase authentication for university students! 🎓✨
 */

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFriendlyEmailError } from "./university-validator.js";

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authModal = null;
    this.isInitialized = false;
    this.authStateListeners = [];
  }

  /**
   * Initialize the authentication system
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.createAuthModal();
      this.setupAuthStateListener();
      this.isInitialized = true;

      console.log("🎓 CampXus Auth System initialized!");
    } catch (error) {
      console.error("Failed to initialize auth system:", error);
    }
  }

  /**
   * Create the simple authentication modal
   */
  createAuthModal() {
    const modalHTML = `
      <div id="auth-modal" class="auth-modal">
        <div class="auth-container">
          <button class="auth-close" onclick="authManager.closeModal()">
            ✕
          </button>

          <div class="auth-header">
            <div class="auth-logo">🎓 CampXus</div>
            <div class="auth-subtitle">Your University Companion</div>
          </div>

          <div class="auth-body">
            <div class="auth-tabs">
              <button class="auth-tab active" data-tab="signin">Sign In</button>
              <button class="auth-tab" data-tab="signup">Sign Up</button>
            </div>

            <!-- Sign In Form -->
            <form id="signin-form" class="auth-form active">
              <div class="university-info" id="signin-university-info">
                <div class="university-name"></div>
                <div class="university-domain"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signin-email">University Email</label>
                <input
                  type="email"
                  id="signin-email"
                  class="form-input"
                  placeholder="student@iub.edu.bd"
                  autocomplete="email"
                  spellcheck="false"
                />
                <div class="input-validation" id="signin-email-validation"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signin-password">Password</label>
                <input
                  type="password"
                  id="signin-password"
                  class="form-input"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                />
                <div class="input-validation" id="signin-password-validation"></div>
              </div>

              <div id="signin-error" class="error-message" style="display: none;"></div>
              <div id="signin-success" class="success-message" style="display: none;"></div>

              <button type="submit" class="auth-button" id="signin-btn">
                <div class="loading-spinner"></div>
                <span class="button-text">Sign In</span>
              </button>
            </form>

            <!-- Sign Up Form -->
            <form id="signup-form" class="auth-form">
              <div class="university-info" id="signup-university-info">
                <div class="university-name"></div>
                <div class="university-domain"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-email">University Email</label>
                <input
                  type="email"
                  id="signup-email"
                  class="form-input"
                  placeholder="student@iub.edu.bd"
                  autocomplete="email"
                  spellcheck="false"
                />
                <div class="input-validation" id="signup-email-validation"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-password">Password</label>
                <input
                  type="password"
                  id="signup-password"
                  class="form-input"
                  placeholder="Create a password"
                  autocomplete="new-password"
                />
                <div class="password-strength" id="password-strength">
                  <div class="strength-bars">
                    <div class="strength-bar"></div>
                    <div class="strength-bar"></div>
                    <div class="strength-bar"></div>
                    <div class="strength-bar"></div>
                  </div>
                  <div class="strength-text">Password strength</div>
                </div>
                <div class="input-validation" id="signup-password-validation"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-confirm-password">Confirm Password</label>
                <input
                  type="password"
                  id="signup-confirm-password"
                  class="form-input"
                  placeholder="Confirm your password"
                  autocomplete="new-password"
                />
                <div class="input-validation" id="signup-confirm-validation"></div>
              </div>

              <div id="signup-error" class="error-message" style="display: none;"></div>
              <div id="signup-success" class="success-message" style="display: none;"></div>

              <button type="submit" class="auth-button" id="signup-btn">
                <div class="loading-spinner"></div>
                <span class="button-text">Create Account</span>
              </button>
            </form>

            <div class="privacy-notice">
              By continuing, you agree to our
              <a href="/privacy" target="_blank">Privacy Policy</a> and
              <a href="/terms" target="_blank">Terms of Service</a>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.authModal = document.getElementById('auth-modal');
    this.setupModalEventListeners();
  }

  /**
   * Setup event listeners for the modal
   */
  setupModalEventListeners() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Simple email validation
    ['signin-email', 'signup-email'].forEach(inputId => {
      const input = document.getElementById(inputId);
      input.addEventListener('input', (e) => {
        this.validateEmailRealTime(e.target.value, inputId);
      });
    });

    // Password strength checking
    const signupPassword = document.getElementById('signup-password');
    signupPassword.addEventListener('input', (e) => {
      this.checkPasswordStrength(e.target.value);
    });

    // Password confirmation
    const confirmPassword = document.getElementById('signup-confirm-password');
    confirmPassword.addEventListener('input', (e) => {
      this.validatePasswordConfirmation();
    });

    // Form submissions
    document.getElementById('signin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSignIn();
    });

    document.getElementById('signup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSignUp();
    });
  }

  /**
   * Simple email validation
   */
  validateEmailRealTime(email, inputId) {
    const input = document.getElementById(inputId);
    const validation = document.getElementById(`${inputId}-validation`);
    const universityInfo = document.getElementById(`${inputId.split('-')[0]}-university-info`);

    if (!email) {
      this.clearValidation(input, validation, universityInfo);
      return;
    }

    // Basic email validation
    const emailError = getFriendlyEmailError(email);

    if (emailError) {
      this.showValidationError(input, validation, { error: emailError });
      this.hideUniversityInfo(universityInfo);
    } else {
      this.showValidationSuccess(input, validation);
      // Show university info for valid domains
      const domain = email.split('@')[1];
      if (domain) {
        this.showUniversityInfoForDomain(universityInfo, domain);
      }
    }
  }

  /**
   * Check password strength
   */
  checkPasswordStrength(password) {
    const strengthContainer = document.getElementById('password-strength');
    const bars = strengthContainer.querySelectorAll('.strength-bar');
    const text = strengthContainer.querySelector('.strength-text');

    if (!password) {
      strengthContainer.classList.remove('visible');
      return;
    }

    strengthContainer.classList.add('visible');

    const strength = this.calculatePasswordStrength(password);

    // Reset bars
    bars.forEach(bar => {
      bar.classList.remove('filled', 'weak', 'medium', 'strong');
    });

    // Fill bars based on strength
    for (let i = 0; i < strength.score; i++) {
      bars[i].classList.add('filled', strength.level);
    }

    text.textContent = `${strength.text}`;
  }

  /**
   * Calculate password strength
   */
  calculatePasswordStrength(password) {
    let score = 0;

    // Length check
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Limit to 4 bars
    score = Math.min(score, 4);

    const levels = ['weak', 'weak', 'medium', 'strong'];
    const texts = ['Weak', 'Fair', 'Good', 'Strong'];

    return {
      score: score,
      level: levels[Math.min(score - 1, 3)] || 'weak',
      text: texts[Math.min(score - 1, 3)] || 'Weak'
    };
  }

  /**
   * Validate password confirmation
   */
  validatePasswordConfirmation() {
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm-password').value;
    const validation = document.getElementById('signup-confirm-validation');

    if (!confirm) {
      validation.innerHTML = '';
      return;
    }

    if (password === confirm) {
      validation.innerHTML = `
        <div class="validation-icon success">✓</div>
        <span style="color: #059669;">Passwords match</span>
      `;
    } else {
      validation.innerHTML = `
        <div class="validation-icon error">✗</div>
        <span style="color: #dc2626;">Passwords do not match</span>
      `;
    }
  }

  /**
   * Handle sign in
   */
  async handleSignIn() {
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;
    const button = document.getElementById('signin-btn');
    const errorDiv = document.getElementById('signin-error');
    const successDiv = document.getElementById('signin-success');

    this.setButtonLoading(button, true);
    this.hideMessage(errorDiv);
    this.hideMessage(successDiv);

    try {
      // Validate email
      const emailError = getFriendlyEmailError(email);
      if (emailError) {
        throw new Error(emailError);
      }

      // Attempt Firebase authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check email verification
      if (!user.emailVerified) {
        await this.handleEmailVerificationRequired(user);
        return;
      }

      this.showMessage(successDiv, '🎉 Welcome back! Redirecting...', 'success');

      setTimeout(() => {
        this.closeModal();
        window.location.reload();
      }, 1500);

    } catch (error) {
      this.showMessage(errorDiv, this.getFriendlyAuthError(error), 'error');
    } finally {
      this.setButtonLoading(button, false);
    }
  }

  /**
   * Handle sign up
   */
  async handleSignUp() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const button = document.getElementById('signup-btn');
    const errorDiv = document.getElementById('signup-error');
    const successDiv = document.getElementById('signup-success');

    this.setButtonLoading(button, true);
    this.hideMessage(errorDiv);
    this.hideMessage(successDiv);

    try {
      // Basic validation
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const passwordStrength = this.calculatePasswordStrength(password);
      if (passwordStrength.score < 2) {
        throw new Error('Password is too weak. Please create a stronger password.');
      }

      // Validate email
      const emailError = getFriendlyEmailError(email);
      if (emailError) {
        throw new Error(emailError);
      }

      // Create Firebase account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      // Create user document
      await this.createUserDocument(user);

      this.showMessage(successDiv,
        '🎉 Account created! Please check your email to verify your account.',
        'success'
      );

    } catch (error) {
      this.showMessage(errorDiv, this.getFriendlyAuthError(error), 'error');
    } finally {
      this.setButtonLoading(button, false);
    }
  }

  /**
   * Create simple user document
   */
  async createUserDocument(user) {
    const domain = user.email.split('@')[1];

    const userData = {
      email: user.email,
      emailVerified: user.emailVerified,
      university: domain,
      createdAt: serverTimestamp(),
      lastSignIn: serverTimestamp()
    };

    await setDoc(doc(db, "users", user.uid), userData);
  }

  // Additional helper methods for UI management, validation, etc.

  /**
   * Switch between sign in and sign up tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    const tabs = this.authModal.querySelectorAll('.auth-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update forms
    const forms = this.authModal.querySelectorAll('.auth-form');
    forms.forEach(form => {
      form.classList.toggle('active', form.id === `${tabName}-form`);
    });

    // Clear any previous errors
    this.clearFormErrors();
  }

  /**
   * Show university info for valid domain
   */
  showUniversityInfoForDomain(universityInfo, domain) {
    // Simple university lookup (this would be more comprehensive in a real app)
    const universities = {
      'iub.edu.bd': { name: 'Independent University, Bangladesh', domain: 'iub.edu.bd' },
      'du.ac.bd': { name: 'University of Dhaka', domain: 'du.ac.bd' },
      'buet.ac.bd': { name: 'Bangladesh University of Engineering and Technology', domain: 'buet.ac.bd' }
    };

    const university = universities[domain];
    if (university) {
      const nameEl = universityInfo.querySelector('.university-name');
      const domainEl = universityInfo.querySelector('.university-domain');

      nameEl.textContent = university.name;
      domainEl.textContent = `Domain: @${university.domain}`;

      universityInfo.classList.add('show');
    }
  }

  /**
   * Handle email verification required
   */
  async handleEmailVerificationRequired(user) {
    const result = confirm(
      'Please verify your email before signing in. Would you like us to send another verification email?'
    );

    if (result) {
      try {
        await sendEmailVerification(user);
        alert('Verification email sent! Please check your inbox.');
      } catch (error) {
        alert('Failed to send verification email. Please try again later.');
      }
    }
  }

  /**
   * Setup auth state listener
   */
  setupAuthStateListener() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;

      if (user) {
        console.log('👋 User signed in:', user.email);
        this.updateUserLastActive();
      } else {
        console.log('👋 User signed out');
      }

      // Notify all listeners
      this.authStateListeners.forEach(listener => listener(user));
    });
  }

  /**
   * Add listener for auth state changes
   */
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
  }

  /**
   * Sign out the current user
   */
  async signOut() {
    try {
      await signOut(auth);
      console.log('👋 Successfully signed out');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  /**
   * Update user's last active timestamp
   */
  async updateUserLastActive() {
    if (!this.currentUser) return;

    try {
      await setDoc(
        doc(db, 'users', this.currentUser.uid),
        {
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error updating last active:', error);
    }
  }

  /**
   * Show/hide the authentication modal
   */
  showModal() {
    if (!this.authModal) this.createAuthModal();
    this.authModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    if (this.authModal) {
      this.authModal.classList.remove('active');
      document.body.style.overflow = '';
      this.clearFormErrors();
    }
  }

  // UI Helper Methods
  showValidationSuccess(input, validation) {
    input.classList.remove('error');
    input.classList.add('success');
    validation.innerHTML = `
      <div class="validation-icon success">✓</div>
      <span style="color: #059669;">Valid university email</span>
    `;
  }

  showValidationError(input, validation, result) {
    input.classList.add('error');
    validation.innerHTML = `
      <div class="validation-icon error">✗</div>
      <span style="color: #dc2626;">${result.error}</span>
    `;
  }

  clearValidation(input, validation, universityInfo) {
    input.classList.remove('error', 'success');
    validation.innerHTML = '';
    if (universityInfo) {
      universityInfo.classList.remove('show');
    }
  }

  hideUniversityInfo(universityInfo) {
    universityInfo.classList.remove('show');
  }

  setButtonLoading(button, isLoading) {
    button.classList.toggle('loading', isLoading);
    button.disabled = isLoading;
  }

  showMessage(element, message, type) {
    element.textContent = message;
    element.style.display = 'block';
  }

  hideMessage(element) {
    element.style.display = 'none';
  }

  clearFormErrors() {
    const inputs = this.authModal?.querySelectorAll('.form-input');
    inputs?.forEach(input => {
      input.classList.remove('error', 'success');
    });

    const validations = this.authModal?.querySelectorAll('.input-validation');
    validations?.forEach(validation => {
      validation.innerHTML = '';
    });
  }

  getFriendlyAuthError(error) {
    const errorMap = {
      'auth/user-not-found': 'No account found with this email address',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/weak-password': 'Password is too weak. Please choose a stronger password',
      'auth/invalid-email': 'Invalid email address format',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later',
    };

    const errorCode = error.code;
    return errorMap[errorCode] || error.message || 'An unexpected error occurred';
  }
}

// Create and export the global auth manager instance
export const authManager = new AuthManager();
```

### Mission 3: Integration with CampXus 🔗

Now let's weave the authentication seamlessly into your existing CampXus application!

#### 3.1 Update Your Main Script

Add this to your existing `js/script.js`:

```javascript
// Add these imports at the top
import { authManager } from "./auth-manager.js";

// Add this initialization in your existing DOMContentLoaded event
document.addEventListener("DOMContentLoaded", async () => {
  // ...existing code...

  // Initialize authentication
  await authManager.initialize();

  // Set up auth state monitoring
  authManager.onAuthStateChanged((user) => {
    if (user) {
      // User is signed in
      showAuthenticatedUI(user);
    } else {
      // User is signed out
      showUnauthenticatedUI();
    }
  });
});

function showAuthenticatedUI(user) {
  // Hide login button, show user menu
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = "none";

  // Show user info in the header
  showUserInfo(user);

  // Enable all CampXus features
  enableScheduleFeatures();
}

function showUnauthenticatedUI() {
  // Show login button
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = "block";

  // Hide user-specific features
  hideUserInfo();

  // Disable advanced features
  disableScheduleFeatures();
}

function showUserInfo(user) {
  // Create or update user info display
  let userInfo = document.getElementById("user-info");
  if (!userInfo) {
    userInfo = document.createElement("div");
    userInfo.id = "user-info";
    userInfo.innerHTML = `
      <span class="user-email">${user.email}</span>
      <button id="logout-btn" class="btn btn-outline">Sign Out</button>
    `;
    document.querySelector("header").appendChild(userInfo);

    // Add logout functionality
    document.getElementById("logout-btn").addEventListener("click", () => {
      authManager.signOut();
    });
  }
}

function hideUserInfo() {
  const userInfo = document.getElementById("user-info");
  if (userInfo) userInfo.remove();
}

function enableScheduleFeatures() {
  // Enable cloud sync, sharing, etc.
  console.log("🎉 All CampXus features enabled!");
}

function disableScheduleFeatures() {
  // Disable cloud features, keep local scheduling
  console.log("📱 Running in local mode");
}
```

#### 3.2 Add Login Button to Your Header

Update your `index.html` header section:

```html
<header>
  <div class="header-content">
    <h1>🎓 CampXus</h1>
    <nav>
      <button id="login-btn" class="btn btn-primary">Join CampXus</button>
      <!-- User info will be added here dynamically -->
    </nav>
  </div>
</header>
```

#### 3.3 Connect the Login Button

Add this JavaScript to connect your login button:

```javascript
// In your main script file
document.getElementById("login-btn")?.addEventListener("click", () => {
  authManager.showModal();
});
```

## ✅ Testing Your Authentication System

### The Grand Test Plan 🧪

1. **Visual Test**: Click the "Join CampXus" button

   - Modal should appear with beautiful animations
   - Tabs should switch smoothly
   - Forms should look professional

2. **Email Validation Test**:

   - Try typing `student@iub.edu.bd` - should show university info
   - Try `student@gmail.com` - should show friendly error
   - Try partial emails - should validate in real-time

3. **Sign Up Flow**:

   - Create account with valid IUB email
   - Check your email for verification link
   - Verify email and try signing in

4. **Error Handling**:
   - Try wrong password - should show friendly error
   - Try duplicate email - should handle gracefully
   - Try weak password - should guide user
````

                  type="email"
                  id="signin-email"
                  class="form-input"
                  placeholder="your.name@iub.edu.bd"
                  autocomplete="email"
                >
                <div class="form-error" id="signin-email-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signin-password">Password</label>
                <input
                  type="password"
                  id="signin-password"
                  class="form-input"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                >
                <div class="form-error" id="signin-password-error"></div>
              </div>

              <button type="submit" class="auth-button" id="signin-button">
                <span class="loader"></span>
                Sign In to CampXus
              </button>
            </form>

            <!-- Sign Up Form -->
            <form id="signup-form" class="auth-form">
              <div class="university-info" id="signup-university-info">
                <div class="university-name"></div>
                <div class="university-domain"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-email">University Email</label>
                <input
                  type="email"
                  id="signup-email"
                  class="form-input"
                  placeholder="your.name@iub.edu.bd"
                  autocomplete="email"
                >
                <div class="form-error" id="signup-email-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-password">Create Password</label>
                <input
                  type="password"
                  id="signup-password"
                  class="form-input"
                  placeholder="Create a strong password"
                  autocomplete="new-password"
                >
                <div class="form-error" id="signup-password-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="signup-confirm-password">Confirm Password</label>
                <input
                  type="password"
                  id="signup-confirm-password"
                  class="form-input"
                  placeholder="Confirm your password"
                  autocomplete="new-password"
                >
                <div class="form-error" id="signup-confirm-password-error"></div>
              </div>

              <button type="submit" class="auth-button" id="signup-button">
                <span class="loader"></span>
                Join CampXus
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.authModal = document.getElementById("auth-modal");
    this.setupModalEventListeners();

}

/\*\*

- Set up all the modal event listeners
  \*/
  setupModalEventListeners() {
  // Tab switching
  const tabs = this.authModal.querySelectorAll(".auth-tab");
  tabs.forEach((tab) => {
  tab.addEventListener("click", () => this.switchTab(tab.dataset.tab));
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

  // Email validation on input
  const emailInputs = this.authModal.querySelectorAll('input[type="email"]');
  emailInputs.forEach((input) => {
  input.addEventListener("input", () => this.validateEmailInput(input));
  });

  // Close modal when clicking outside
  this.authModal.addEventListener("click", (e) => {
  if (e.target === this.authModal) {
  this.hideAuthModal();
  }
  });

}

/\*\*

- Switch between sign in and sign up tabs
  \*/
  switchTab(tabName) {
  // Update tab buttons
  const tabs = this.authModal.querySelectorAll(".auth-tab");
  tabs.forEach((tab) => {
  tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  // Update forms
  const forms = this.authModal.querySelectorAll(".auth-form");
  forms.forEach((form) => {
  form.classList.toggle("active", form.id === `${tabName}-form`);
  });

  // Clear any previous errors
  this.clearFormErrors();

}

/\*\*

- Validate email input in real-time
  \*/
  validateEmailInput(input) {
  const email = input.value.trim();
  const formType = input.id.startsWith("signin") ? "signin" : "signup";
  const universityInfo = document.getElementById(
  `${formType}-university-info`
  );

  if (!email) {
  universityInfo.classList.remove("show");
  this.clearFieldError(input);
  return;
  }

  const validation = validateUniversityEmail(email);

  if (validation.isValid) {
  // Show university info
  const nameEl = universityInfo.querySelector(".university-name");
  const domainEl = universityInfo.querySelector(".university-domain");

      nameEl.textContent = validation.university.name;
      domainEl.textContent = `Domain: @${validation.university.domains[0]}`;

      universityInfo.classList.add("show");
      this.clearFieldError(input);

  } else {
  universityInfo.classList.remove("show");

      if (email.includes("@")) {
        this.showFieldError(input, getFriendlyEmailError(email));
      } else {
        this.clearFieldError(input);
      }

  }

}

/\*\*

- Handle sign in form submission
  \*/
  async handleSignIn() {
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  const button = document.getElementById("signin-button");

  if (!this.validateSignInForm(email, password)) return;

  this.setLoadingState(button, true);

  try {
  const userCredential = await signInWithEmailAndPassword(
  auth,
  email,
  password
  );

      if (!userCredential.user.emailVerified) {
        throw new Error(
          "Please verify your email before signing in. Check your inbox!"
        );
      }

      console.log("🎉 Sign in successful!");
      this.hideAuthModal();

  } catch (error) {
  console.error("Sign in error:", error);
  this.showAuthError(this.getReadableError(error.message));
  } finally {
  this.setLoadingState(button, false);
  }

}

/\*\*

- Handle sign up form submission
  \*/
  async handleSignUp() {
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById(
  "signup-confirm-password"
  ).value;
  const button = document.getElementById("signup-button");

  if (!this.validateSignUpForm(email, password, confirmPassword)) return;

  this.setLoadingState(button, true);

  try {
  // Create the user account
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

      // Show success message
      alert(
        "🎉 Account created! Please check your email to verify your account before signing in."
      );

      this.switchTab("signin");

  } catch (error) {
  console.error("Sign up error:", error);
  this.showAuthError(this.getReadableError(error.message));
  } finally {
  this.setLoadingState(button, false);
  }

}

/\*\*

- Create user profile in Firestore
  \*/
  async createUserProfile(user, email) {
  const validation = validateUniversityEmail(email);

  const userProfile = {
  email: validation.normalizedEmail,
  university: validation.universityId,
  universityName: validation.university.name,
  displayName: email.split("@")[0], // Default display name from email
  status: "offline",
  createdAt: serverTimestamp(),
  lastActive: serverTimestamp(),
  emailVerified: false,
  profileSetupComplete: false,
  };

  await setDoc(doc(db, "users", user.uid), userProfile);
  console.log("👤 User profile created in Firestore");

}

/\*\*

- Show/hide the authentication modal
  \*/
  showAuthModal() {
  if (!this.authModal) this.createAuthModal();
  this.authModal.classList.add("active");
  document.body.style.overflow = "hidden";
  }

hideAuthModal() {
if (this.authModal) {
this.authModal.classList.remove("active");
document.body.style.overflow = "";
this.clearFormErrors();
}
}

/\*\*

- Set up authentication state listener
  \*/
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

/\*\*

- Add listener for auth state changes
  \*/
  onAuthStateChanged(callback) {
  this.authStateListeners.push(callback);
  }

/\*\*

- Sign out the current user
  \*/
  async signOut() {
  try {
  await signOut(auth);
  console.log("👋 Successfully signed out");
  } catch (error) {
  console.error("Sign out error:", error);
  }
  }

/\*\*

- Update user's last active timestamp
  \*/
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

// Utility methods for form validation and UI management
validateSignInForm(email, password) {
let isValid = true;

    const emailValidation = validateUniversityEmail(email);
    if (!emailValidation.isValid) {
      this.showFieldError(
        document.getElementById("signin-email"),
        emailValidation.error
      );
      isValid = false;
    }

    if (!password) {
      this.showFieldError(
        document.getElementById("signin-password"),
        "Password is required"
      );
      isValid = false;
    }

    return isValid;

}

validateSignUpForm(email, password, confirmPassword) {
let isValid = true;

    const emailValidation = validateUniversityEmail(email);
    if (!emailValidation.isValid) {
      this.showFieldError(
        document.getElementById("signup-email"),
        emailValidation.error
      );
      isValid = false;
    }

    if (!password) {
      this.showFieldError(
        document.getElementById("signup-password"),
        "Password is required"
      );
      isValid = false;
    } else if (password.length < 6) {
      this.showFieldError(
        document.getElementById("signup-password"),
        "Password must be at least 6 characters"
      );
      isValid = false;
    }

    if (password !== confirmPassword) {
      this.showFieldError(
        document.getElementById("signup-confirm-password"),
        "Passwords do not match"
      );
      isValid = false;
    }

    return isValid;

}

showFieldError(input, message) {
input.classList.add("error");
const errorEl = input.parentNode.querySelector(".form-error");
errorEl.textContent = message;
errorEl.classList.add("show");
}

clearFieldError(input) {
input.classList.remove("error");
const errorEl = input.parentNode.querySelector(".form-error");
errorEl.classList.remove("show");
}

clearFormErrors() {
const inputs = this.authModal.querySelectorAll(".form-input");
inputs.forEach((input) => this.clearFieldError(input));
}

setLoadingState(button, isLoading) {
button.classList.toggle("loading", isLoading);
button.disabled = isLoading;
}

showAuthError(message) {
alert(`Authentication Error: ${message}`);
}

getReadableError(errorMessage) {
const errorMap = {
"auth/user-not-found": "No account found with this email address",
"auth/wrong-password": "Incorrect password",
"auth/email-already-in-use": "An account with this email already exists",
"auth/weak-password":
"Password is too weak. Please choose a stronger password",
"auth/invalid-email": "Invalid email address format",
"auth/too-many-requests":
"Too many failed attempts. Please try again later",
};

    for (const [code, message] of Object.entries(errorMap)) {
      if (errorMessage.includes(code)) {
        return message;
      }
    }

    return errorMessage;

}
}

// Create and export the global auth manager instance
export const authManager = new AuthManager();

````

### Mission 3: Integration with CampXus 🔗

Now let's weave the authentication seamlessly into your existing CampXus application!

#### 3.1 Update Your Main Script

Add this to your existing `js/script.js`:

```javascript
// Add these imports at the top
import { authManager } from "./auth-manager.js";

// Add this initialization in your existing DOMContentLoaded event
document.addEventListener("DOMContentLoaded", async () => {
  // ...existing code...

  // Initialize authentication
  await authManager.initialize();

  // Set up auth state monitoring
  authManager.onAuthStateChanged((user) => {
    if (user) {
      // User is signed in
      showAuthenticatedUI(user);
    } else {
      // User is signed out
      showUnauthenticatedUI();
    }
  });
});

function showAuthenticatedUI(user) {
  // Hide login button, show user menu
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = "none";

  // Show user info in the header
  showUserInfo(user);

  // Enable all CampXus features
  enableScheduleFeatures();
}

function showUnauthenticatedUI() {
  // Show login button
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = "block";

  // Hide user-specific features
  hideUserInfo();

  // Disable advanced features
  disableScheduleFeatures();
}

function showUserInfo(user) {
  // Create or update user info display
  let userInfo = document.getElementById("user-info");
  if (!userInfo) {
    userInfo = document.createElement("div");
    userInfo.id = "user-info";
    userInfo.innerHTML = `
      <span class="user-email">${user.email}</span>
      <button id="logout-btn" class="btn btn-outline">Sign Out</button>
    `;
    document.querySelector("header").appendChild(userInfo);

    // Add logout functionality
    document.getElementById("logout-btn").addEventListener("click", () => {
      authManager.signOut();
    });
  }
}

function hideUserInfo() {
  const userInfo = document.getElementById("user-info");
  if (userInfo) userInfo.remove();
}

function enableScheduleFeatures() {
  // Enable cloud sync, sharing, etc.
  console.log("🎉 All CampXus features enabled!");
}

function disableScheduleFeatures() {
  // Disable cloud features, keep local scheduling
  console.log("📱 Running in local mode");
}
````

#### 3.2 Add Login Button to Your Header

Update your `index.html`:

```html
<!-- Add this to your header, replace existing login if any -->
<header>
  <!-- ...existing header content... -->

  <button id="login-btn" class="btn btn-primary">🎓 Join CampXus</button>

  <!-- This will be dynamically created -->
  <div id="user-info" style="display: none;"></div>
</header>

<!-- Add the auth CSS -->
<link rel="stylesheet" href="css/auth.css" />
```

#### 3.3 Connect the Login Button

Add this to your script:

```javascript
// Add this to your DOMContentLoaded event
document.getElementById("login-btn")?.addEventListener("click", () => {
  authManager.showAuthModal();
});
```

## ✅ Testing Your Authentication System

### The Grand Test Plan 🧪

1. **Visual Test**: Click the "Join CampXus" button

   - Modal should appear with beautiful animations
   - Tabs should switch smoothly
   - Forms should look professional

2. **Email Validation Test**:

   - Try typing `student@iub.edu.bd` - should show university info
   - Try `student@gmail.com` - should show friendly error
   - Try partial emails - should validate in real-time

3. **Sign Up Flow**:

   - Create account with valid IUB email
   - Check your email for verification link
   - Verify email and try signing in

4. **Error Handling**:
   - Try wrong password - should show friendly error
   - Try duplicate email - should handle gracefully
   - Try weak password - should guide user

## 🎯 Success Criteria

You've mastered Phase 1 when:

### 🎓 Firebase Authentication Basics

- [ ] Firebase Authentication is properly configured and connected
- [ ] Students can sign up with their university email addresses
- [ ] Email verification works and students can verify their accounts
- [ ] Sign in/out functionality works smoothly
- [ ] Authentication state is properly managed (logged in vs logged out)
- [ ] User sessions persist across browser refreshes

### 🎨 User Experience

- [ ] Authentication modal appears with beautiful design and animations
- [ ] Email validation provides helpful, student-friendly error messages
- [ ] Password strength indicator helps students create good passwords
- [ ] Tab switching between Sign In and Sign Up works smoothly
- [ ] Error messages are clear and help students understand what went wrong
- [ ] Success messages guide students through the verification process

### 🏫 University Email Validation

- [ ] Only university email domains are accepted for registration
- [ ] Students get helpful suggestions when they make typos in their email
- [ ] University information displays when a valid domain is entered
- [ ] Clear feedback when non-university emails are attempted
- [ ] Easy to add new university domains to the system

### 🔧 Technical Implementation

- [ ] Code is well-organized and follows Firebase best practices
- [ ] Authentication manager properly handles Firebase methods
- [ ] User documents are created in Firestore upon registration
- [ ] Event listeners are set up correctly for form interactions
- [ ] CSS styles create a modern, mobile-responsive interface

## 🎉 What You've Built!

### Your Authentication System Features ✨

#### **Firebase Authentication Integration**

- **User Management**: Sign up and sign in with email/password
- **Email Verification**: Students must verify their email before full access
- **Session Management**: Users stay logged in across browser sessions
- **Secure Password Storage**: Firebase handles password encryption and security

#### **University Email Validation**

- **Domain Checking**: Only university email addresses are accepted
- **Helpful Feedback**: Clear error messages guide students to correct emails
- **University Recognition**: System displays university info for valid domains
- **Easy Extension**: Simple to add new universities to the supported list

#### **Beautiful User Interface**

- **Modern Design**: Clean, mobile-responsive authentication modal
- **Smooth Animations**: Professional transitions and visual feedback
- **User-Friendly Forms**: Clear labels, helpful placeholders, and validation
- **Password Strength**: Visual indicator helps students create secure passwords

#### **Firebase Integration**

- **Firestore Database**: User profiles are stored securely in the cloud
- **Real-time Updates**: Authentication state changes are instant
- **Firebase Security Rules**: Built-in protection for user data
- **Scalable Architecture**: Ready to handle growing number of students

### Learning Outcomes 🎓

By completing this phase, you've learned:

- **Firebase Authentication**: How to integrate Firebase Auth into a web application
- **Email Validation**: Techniques for validating and restricting email domains
- **User Experience Design**: Creating intuitive and beautiful authentication flows
- **JavaScript Modules**: Organizing code with ES6 modules and classes
- **Event Handling**: Managing form submissions and user interactions
- **CSS Animation**: Creating smooth, professional transitions and effects
- **Error Handling**: Providing helpful feedback when things go wrong
- **State Management**: Tracking user authentication status across the app

## 🎉 Congratulations!

Fantastic work! You've just built a complete authentication system for CampXus using Firebase. Your university students can now:

✨ **Sign up securely** with their university email addresses  
🎓 **Verify their identity** through email verification  
🔐 **Sign in easily** with a beautiful, user-friendly interface  
📱 **Stay logged in** across different sessions and devices  
🏫 **Join their university community** on CampXus

You've learned valuable skills in Firebase, JavaScript, CSS, and user experience design. This foundation will serve you well as you continue building more features for CampXus!

## ⏭️ Next Adventure: Phase 2

Ready for **Phase 2: User Profile Setup**? We'll help students create their profiles, add their course schedules, and start building their university network on CampXus.

---

**Estimated Time**: 4-6 hours  
**Difficulty**: Intermediate  
**Fun Factor**: 🌟🌟🌟🌟🌟  
**Skills You'll Learn**: Firestore Database, File Upload, User Profiles  
**University Vibes**: 🎓📚✨
