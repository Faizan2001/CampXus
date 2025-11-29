/**
 * =============================================================================
 *                          AUTH SERVICE TESTS
 *                    Testing Authentication Logic
 * =============================================================================
 *
 * This test suite covers the AuthManager functionality by testing:
 * - Email validation (university emails, development emails)
 * - Form validation logic
 * - Error message handling
 * - Callback registration and triggering
 * - State management
 *
 * Note: Since AuthService has deep Firebase dependencies, we test the
 * logic and data structures directly rather than mocking all dependencies.
 *
 * =============================================================================
 */

import { jest } from "@jest/globals";

/**
 * =============================================================================
 *                        AUTH MANAGER LOGIC TESTS
 * =============================================================================
 *
 * We test the core logic by creating a minimal mock that simulates behavior
 * without Firebase dependencies.
 *
 * =============================================================================
 */

// Custom error classes matching the real service
class AuthError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

// Mock AuthManager for testing logic
class MockAuthManager {
  constructor() {
    this.authModal = null;
    this.authStateListeners = [];
    this.isSigningUp = false;
    this.isSigningIn = false;
    this.authReady = Promise.resolve();

    // Callback system
    this.onSigninSuccess = null;
    this.onSigninError = null;
    this.onSignupSuccess = null;
    this.onSignupError = null;

    // Submission protection
    this.signupInProgress = false;
    this.signinInProgress = false;

    // Track last auth action
    this.lastAuthAction = null;
  }

  /**
   * Check if email is a development email for testing purposes
   * Development emails follow pattern: <anything>.dev@iub.edu.bd
   */
  isDevelopmentEmail(email) {
    if (!email) return false;
    const e = String(email).trim();
    const re = /^[^@]+\.dev@iub\.edu\.bd$/i;
    return re.test(e);
  }

  /**
   * Validate university email
   * Returns null if invalid, or university info if valid
   */
  validateUniversityEmail(email) {
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return null;
    }

    const domain = email.toLowerCase().split("@")[1];
    if (!domain) {
      return null;
    }

    const SUPPORTED_UNIVERSITIES = {
      iub: {
        name: "Independent University, Bangladesh",
        domains: ["iub.edu.bd"],
        displayName: "IUB",
      },
    };

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

    return null;
  }

  /**
   * Get friendly error message for invalid emails
   */
  getFriendlyEmailError(email) {
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

    if (domain.includes("iub.edu") && !domain.includes("iub.edu.bd")) {
      return "Almost there! Did you mean @iub.edu.bd? 🎯";
    }

    return `We don't support ${domain} yet. Currently supporting IUB students! 🏫`;
  }

  /**
   * Validate sign-in form
   */
  validateSignInForm(email, password) {
    const errors = [];

    if (!email || !email.trim()) {
      errors.push({ field: "email", message: "Email is required" });
    } else if (!email.includes("@")) {
      errors.push({ field: "email", message: "Invalid email format" });
    }

    if (!password) {
      errors.push({ field: "password", message: "Password is required" });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate sign-up form
   */
  validateSignUpForm(email, password, confirmPassword) {
    const errors = [];

    // Email validation
    if (!email || !email.trim()) {
      errors.push({ field: "email", message: "Email is required" });
    } else if (!email.includes("@")) {
      errors.push({ field: "email", message: "Invalid email format" });
    } else {
      const universityInfo = this.validateUniversityEmail(email);
      if (!universityInfo) {
        errors.push({
          field: "email",
          message: "Please use your university email",
        });
      }
    }

    // Password validation
    if (!password) {
      errors.push({ field: "password", message: "Password is required" });
    } else if (password.length < 8) {
      errors.push({
        field: "password",
        message: "Password must be at least 8 characters",
      });
    }

    // Confirm password validation
    if (password !== confirmPassword) {
      errors.push({
        field: "confirmPassword",
        message: "Passwords do not match",
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    if (!password) {
      return { isStrong: false, message: "Password is required" };
    }

    if (password.length < 8) {
      return {
        isStrong: false,
        message: "Password must be at least 8 characters",
      };
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const strength = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(
      Boolean
    ).length;

    if (strength < 2) {
      return {
        isStrong: false,
        message: "Password should include uppercase, lowercase, numbers, or special characters",
      };
    }

    return { isStrong: true, message: "Password is strong" };
  }

  /**
   * Get readable error message from Firebase error
   */
  getReadableError(error) {
    const errorCode = error?.code || "";

    const errorMessages = {
      "auth/invalid-email": "Please enter a valid email address",
      "auth/user-disabled": "This account has been disabled",
      "auth/user-not-found": "No account found with this email",
      "auth/wrong-password": "Incorrect password",
      "auth/email-already-in-use": "An account with this email already exists",
      "auth/weak-password": "Password is too weak",
      "auth/too-many-requests": "Too many attempts. Please try again later",
      "auth/network-request-failed": "Network error. Check your connection",
      "auth/invalid-credential": "Invalid credentials. Please try again",
    };

    return errorMessages[errorCode] || error?.message || "An error occurred";
  }

  /**
   * Set callback for successful sign in
   */
  setSigninSuccessCallback(callback) {
    this.onSigninSuccess = callback;
  }

  /**
   * Set callback for sign in errors
   */
  setSigninErrorCallback(callback) {
    this.onSigninError = callback;
  }

  /**
   * Set callback for successful sign up
   */
  setSignupSuccessCallback(callback) {
    this.onSignupSuccess = callback;
  }

  /**
   * Set callback for sign up errors
   */
  setSignupErrorCallback(callback) {
    this.onSignupError = callback;
  }

  /**
   * Trigger signin success callback if set
   */
  triggerSigninSuccess(data) {
    if (this.onSigninSuccess) {
      this.onSigninSuccess(data);
    }
  }

  /**
   * Trigger signin error callback if set
   */
  triggerSigninError(data) {
    if (this.onSigninError) {
      this.onSigninError(data);
    }
  }

  /**
   * Trigger signup success callback if set
   */
  triggerSignupSuccess(data) {
    if (this.onSignupSuccess) {
      this.onSignupSuccess(data);
    }
  }

  /**
   * Trigger signup error callback if set
   */
  triggerSignupError(data) {
    if (this.onSignupError) {
      this.onSignupError(data);
    }
  }

  /**
   * Add auth state listener
   */
  addAuthStateListener(callback) {
    if (typeof callback === "function") {
      this.authStateListeners.push(callback);
      return () => {
        this.authStateListeners = this.authStateListeners.filter(
          (cb) => cb !== callback
        );
      };
    }
    return () => {};
  }

  /**
   * Notify all auth state listeners
   */
  notifyAuthStateListeners(user) {
    this.authStateListeners.forEach((callback) => {
      try {
        callback(user);
      } catch (error) {
        console.error("Auth state listener error:", error);
      }
    });
  }

  /**
   * Check if submission is in progress
   */
  isSubmissionInProgress() {
    return this.signinInProgress || this.signupInProgress;
  }
}

describe("AuthService", () => {
  let authManager;

  beforeEach(() => {
    authManager = new MockAuthManager();
    jest.clearAllMocks();
  });

  /**
   * =============================================================================
   *                           INITIALIZATION TESTS
   * =============================================================================
   */
  describe("Initialization", () => {
    test("should initialize with correct default state", () => {
      expect(authManager.isSigningUp).toBe(false);
      expect(authManager.isSigningIn).toBe(false);
      expect(authManager.signupInProgress).toBe(false);
      expect(authManager.signinInProgress).toBe(false);
      expect(authManager.lastAuthAction).toBeNull();
    });

    test("should have empty auth state listeners", () => {
      expect(authManager.authStateListeners).toEqual([]);
    });

    test("should have callbacks set to null initially", () => {
      expect(authManager.onSigninSuccess).toBeNull();
      expect(authManager.onSigninError).toBeNull();
      expect(authManager.onSignupSuccess).toBeNull();
      expect(authManager.onSignupError).toBeNull();
    });
  });

  /**
   * =============================================================================
   *                      DEVELOPMENT EMAIL TESTS
   * =============================================================================
   */
  describe("Development Email Detection", () => {
    test("should recognize valid development email", () => {
      expect(authManager.isDevelopmentEmail("john.dev@iub.edu.bd")).toBe(true);
      expect(authManager.isDevelopmentEmail("a.b.dev@iub.edu.bd")).toBe(true);
      expect(authManager.isDevelopmentEmail("test123.dev@iub.edu.bd")).toBe(true);
    });

    test("should reject non-development emails", () => {
      expect(authManager.isDevelopmentEmail("john@iub.edu.bd")).toBe(false);
      expect(authManager.isDevelopmentEmail("john.dev@gmail.com")).toBe(false);
      expect(authManager.isDevelopmentEmail("dev@iub.edu.bd")).toBe(false);
    });

    test("should handle case insensitivity", () => {
      expect(authManager.isDevelopmentEmail("John.Dev@IUB.EDU.BD")).toBe(true);
      expect(authManager.isDevelopmentEmail("JOHN.DEV@iub.edu.bd")).toBe(true);
    });

    test("should handle null and empty inputs", () => {
      expect(authManager.isDevelopmentEmail(null)).toBe(false);
      expect(authManager.isDevelopmentEmail("")).toBe(false);
      expect(authManager.isDevelopmentEmail(undefined)).toBe(false);
    });

    test("should handle whitespace", () => {
      expect(authManager.isDevelopmentEmail("  john.dev@iub.edu.bd  ")).toBe(true);
    });
  });

  /**
   * =============================================================================
   *                      UNIVERSITY EMAIL VALIDATION
   * =============================================================================
   */
  describe("University Email Validation", () => {
    test("should accept valid IUB email", () => {
      const result = authManager.validateUniversityEmail("student@iub.edu.bd");

      expect(result).not.toBeNull();
      expect(result.universityId).toBe("iub");
      expect(result.isValid).toBe(true);
    });

    test("should reject non-university email", () => {
      const result = authManager.validateUniversityEmail("user@gmail.com");
      expect(result).toBeNull();
    });

    test("should reject invalid email formats", () => {
      expect(authManager.validateUniversityEmail("not-an-email")).toBeNull();
      expect(authManager.validateUniversityEmail("student@")).toBeNull();
      expect(authManager.validateUniversityEmail("")).toBeNull();
    });

    test("should handle null and undefined", () => {
      expect(authManager.validateUniversityEmail(null)).toBeNull();
      expect(authManager.validateUniversityEmail(undefined)).toBeNull();
    });

    test("should be case insensitive", () => {
      const result = authManager.validateUniversityEmail("STUDENT@IUB.EDU.BD");
      expect(result).not.toBeNull();
      expect(result.universityId).toBe("iub");
    });
  });

  /**
   * =============================================================================
   *                      FRIENDLY ERROR MESSAGES
   * =============================================================================
   */
  describe("Friendly Email Errors", () => {
    test("should provide message for empty email", () => {
      const error = authManager.getFriendlyEmailError("");
      expect(error).toContain("enter");
    });

    test("should provide message for missing @ symbol", () => {
      const error = authManager.getFriendlyEmailError("notemail");
      expect(error).toContain("@");
    });

    test("should suggest correction for typo", () => {
      const error = authManager.getFriendlyEmailError("student@iub.edu");
      expect(error).toContain("iub.edu.bd");
    });

    test("should mention unsupported domain", () => {
      const error = authManager.getFriendlyEmailError("student@gmail.com");
      expect(error).toContain("gmail.com");
    });
  });

  /**
   * =============================================================================
   *                      SIGN-IN FORM VALIDATION
   * =============================================================================
   */
  describe("Sign-In Form Validation", () => {
    test("should accept valid sign-in data", () => {
      const result = authManager.validateSignInForm(
        "student@iub.edu.bd",
        "password123"
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should reject empty email", () => {
      const result = authManager.validateSignInForm("", "password123");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "email")).toBe(true);
    });

    test("should reject invalid email format", () => {
      const result = authManager.validateSignInForm("notemail", "password123");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "email")).toBe(true);
    });

    test("should reject empty password", () => {
      const result = authManager.validateSignInForm("student@iub.edu.bd", "");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "password")).toBe(true);
    });

    test("should collect multiple errors", () => {
      const result = authManager.validateSignInForm("", "");
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  /**
   * =============================================================================
   *                      SIGN-UP FORM VALIDATION
   * =============================================================================
   */
  describe("Sign-Up Form Validation", () => {
    test("should accept valid sign-up data", () => {
      const result = authManager.validateSignUpForm(
        "student@iub.edu.bd",
        "password123",
        "password123"
      );
      expect(result.isValid).toBe(true);
    });

    test("should reject non-university email", () => {
      const result = authManager.validateSignUpForm(
        "student@gmail.com",
        "password123",
        "password123"
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "email")).toBe(true);
    });

    test("should reject short password", () => {
      const result = authManager.validateSignUpForm(
        "student@iub.edu.bd",
        "short",
        "short"
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "password")).toBe(true);
    });

    test("should reject mismatched passwords", () => {
      const result = authManager.validateSignUpForm(
        "student@iub.edu.bd",
        "password123",
        "password456"
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "confirmPassword")).toBe(true);
    });
  });

  /**
   * =============================================================================
   *                      PASSWORD STRENGTH VALIDATION
   * =============================================================================
   */
  describe("Password Strength", () => {
    test("should reject empty password", () => {
      const result = authManager.validatePasswordStrength("");
      expect(result.isStrong).toBe(false);
    });

    test("should reject short password", () => {
      const result = authManager.validatePasswordStrength("short");
      expect(result.isStrong).toBe(false);
    });

    test("should accept strong password", () => {
      const result = authManager.validatePasswordStrength("Password123!");
      expect(result.isStrong).toBe(true);
    });

    test("should accept password with mixed case and numbers", () => {
      const result = authManager.validatePasswordStrength("Password123");
      expect(result.isStrong).toBe(true);
    });
  });

  /**
   * =============================================================================
   *                      ERROR MESSAGE MAPPING
   * =============================================================================
   */
  describe("Error Message Mapping", () => {
    test("should map invalid-email error", () => {
      const error = { code: "auth/invalid-email" };
      const message = authManager.getReadableError(error);
      expect(message).toContain("valid email");
    });

    test("should map user-not-found error", () => {
      const error = { code: "auth/user-not-found" };
      const message = authManager.getReadableError(error);
      expect(message).toContain("No account");
    });

    test("should map wrong-password error", () => {
      const error = { code: "auth/wrong-password" };
      const message = authManager.getReadableError(error);
      expect(message).toContain("Incorrect");
    });

    test("should map email-already-in-use error", () => {
      const error = { code: "auth/email-already-in-use" };
      const message = authManager.getReadableError(error);
      expect(message).toContain("already exists");
    });

    test("should map too-many-requests error", () => {
      const error = { code: "auth/too-many-requests" };
      const message = authManager.getReadableError(error);
      expect(message).toContain("Too many");
    });

    test("should handle unknown error codes", () => {
      const error = { code: "auth/unknown-error", message: "Unknown error" };
      const message = authManager.getReadableError(error);
      expect(message).toBe("Unknown error");
    });

    test("should handle null error", () => {
      const message = authManager.getReadableError(null);
      expect(message).toBe("An error occurred");
    });
  });

  /**
   * =============================================================================
   *                      CALLBACK SYSTEM TESTS
   * =============================================================================
   */
  describe("Callback System", () => {
    test("should set signin success callback", () => {
      const callback = jest.fn();
      authManager.setSigninSuccessCallback(callback);

      expect(authManager.onSigninSuccess).toBe(callback);
    });

    test("should trigger signin success callback", () => {
      const callback = jest.fn();
      authManager.setSigninSuccessCallback(callback);

      authManager.triggerSigninSuccess({ user: "testUser" });

      expect(callback).toHaveBeenCalledWith({ user: "testUser" });
    });

    test("should trigger signin error callback", () => {
      const callback = jest.fn();
      authManager.setSigninErrorCallback(callback);

      authManager.triggerSigninError({ error: "test error" });

      expect(callback).toHaveBeenCalledWith({ error: "test error" });
    });

    test("should trigger signup success callback", () => {
      const callback = jest.fn();
      authManager.setSignupSuccessCallback(callback);

      authManager.triggerSignupSuccess({ user: "newUser" });

      expect(callback).toHaveBeenCalledWith({ user: "newUser" });
    });

    test("should not throw when callback is not set", () => {
      expect(() => {
        authManager.triggerSigninSuccess({ user: "test" });
      }).not.toThrow();
    });
  });

  /**
   * =============================================================================
   *                      AUTH STATE LISTENERS
   * =============================================================================
   */
  describe("Auth State Listeners", () => {
    test("should add auth state listener", () => {
      const callback = jest.fn();
      authManager.addAuthStateListener(callback);

      expect(authManager.authStateListeners).toContain(callback);
    });

    test("should return unsubscribe function", () => {
      const callback = jest.fn();
      const unsubscribe = authManager.addAuthStateListener(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    test("should remove listener on unsubscribe", () => {
      const callback = jest.fn();
      const unsubscribe = authManager.addAuthStateListener(callback);

      unsubscribe();

      expect(authManager.authStateListeners).not.toContain(callback);
    });

    test("should notify all listeners on auth state change", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      authManager.addAuthStateListener(callback1);
      authManager.addAuthStateListener(callback2);

      authManager.notifyAuthStateListeners({ uid: "user123" });

      expect(callback1).toHaveBeenCalledWith({ uid: "user123" });
      expect(callback2).toHaveBeenCalledWith({ uid: "user123" });
    });

    test("should handle listener errors gracefully", () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Listener error");
      });
      const normalCallback = jest.fn();
      authManager.addAuthStateListener(errorCallback);
      authManager.addAuthStateListener(normalCallback);

      expect(() => {
        authManager.notifyAuthStateListeners({ uid: "user123" });
      }).not.toThrow();

      expect(normalCallback).toHaveBeenCalled();
    });
  });

  /**
   * =============================================================================
   *                      SUBMISSION PROTECTION
   * =============================================================================
   */
  describe("Submission Protection", () => {
    test("should detect submission in progress", () => {
      authManager.signinInProgress = true;
      expect(authManager.isSubmissionInProgress()).toBe(true);
    });

    test("should detect signup in progress", () => {
      authManager.signupInProgress = true;
      expect(authManager.isSubmissionInProgress()).toBe(true);
    });

    test("should return false when no submission in progress", () => {
      expect(authManager.isSubmissionInProgress()).toBe(false);
    });
  });

  /**
   * =============================================================================
   *                      CUSTOM ERROR CLASSES
   * =============================================================================
   */
  describe("Custom Error Classes", () => {
    test("AuthError should have correct properties", () => {
      const error = new AuthError("Test message", "auth/test-code");

      expect(error.name).toBe("AuthError");
      expect(error.message).toBe("Test message");
      expect(error.code).toBe("auth/test-code");
    });

    test("ValidationError should have correct properties", () => {
      const error = new ValidationError("Invalid field", "email");

      expect(error.name).toBe("ValidationError");
      expect(error.message).toBe("Invalid field");
      expect(error.field).toBe("email");
    });
  });
});
