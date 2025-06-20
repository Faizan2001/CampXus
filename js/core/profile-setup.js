/**
 * =============================================================================
 *                           CAMPXUS PROFILE SETUP
 *                      Modern ES6+ Class-Based Implementation
 * =============================================================================
 *
 * 📋 TABLE OF CONTENTS:
 * ├── 1. Class Definition & Constructor
 * ├── 2. Authentication & User Management
 * ├── 3. Initialization & Setup Methods
 * ├── 4. Form Data Management
 * ├── 5. Step Navigation System
 * ├── 6. Validation & Error Handling
 * ├── 7. UI State Management
 * ├── 8. File Upload & Storage
 * ├── 9. Database Operations
 * ├── 10. Event Listeners & DOM Manipulation
 * ├── 11. Utility & Helper Methods
 * └── 12. Global Initialization System
 *
 * This class manages the complete profile setup workflow for new users,
 * including form validation, file uploads, Firebase integration, and SPA
 * navigation. Uses modern JavaScript features and follows best practices.
 *
 * =============================================================================
 */

// Import Firebase functions we need - using import map from index.html
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config/firebase-config.js";

// Import avatar management system
import AvatarManager from "./avatars.js";

/**
 * =============================================================================
 *                        1. CLASS DEFINITION & CONSTRUCTOR
 * =============================================================================
 */

class ProfileSetup {
  constructor() {
    // CRITICAL: Prevent multiple instances from being created
    if (profileSetupInstance) {
      console.warn(
        "⚠️ ProfileSetup instance already exists! Returning existing instance."
      );
      return profileSetupInstance;
    }

    console.log("🆕 Creating new ProfileSetup instance");

    this.currentStep = 0;
    this.totalSteps = 2; // Basic Info, Avatar & Bio
    this.currentUser = null;
    this.profileData = {};
    this.avatarConfig = null; // Stores user's avatar configuration
    this.authCheckInProgress = false;
    this.dataLoadInProgress = false; // Prevent duplicate data loading
    this.existingProfileData = null; // Cache for existing profile data

    // Store this instance globally to prevent duplicates
    profileSetupInstance = this;

    // Initialize the setup
    this.checkAuthentication();
  }

  /**
   * =============================================================================
   *                      1.5. PROFILE DATA LOADING & MANAGEMENT
   * =============================================================================
   */

  /**
   * Load existing profile data from Firestore
   * @param {string} userId - User ID to fetch data for
   * @returns {Promise<Object|null>} Profile data or null if not found
   */
  async loadProfileData(userId) {
    if (this.dataLoadInProgress) {
      console.log("🔄 Profile data loading already in progress, skipping...");
      return this.existingProfileData;
    }

    this.dataLoadInProgress = true;
    console.log("📥 Loading profile data for user:", userId);

    try {
      // Show loading state
      this.showLoadingState("Loading your profile...");

      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        console.log("✅ Profile data loaded successfully:", data);

        this.existingProfileData = data;

        // Hide loading state
        this.hideLoadingState();

        return data;
      } else {
        console.log("📝 No existing profile data found, starting fresh setup");
        this.existingProfileData = null;
        this.hideLoadingState();
        return null;
      }
    } catch (error) {
      console.error("❌ Error loading profile data:", error);
      this.hideLoadingState();
      this.showError("Failed to load profile data. Please try again.");
      return null;
    } finally {
      this.dataLoadInProgress = false;
    }
  }

  /**
   * Populate form fields with existing profile data
   * @param {Object} profileData - Profile data from Firestore
   */
  populateFormFields(profileData) {
    console.log("📝 Populating form fields with existing data...");

    // Wait for DOM elements to be available
    const populateFields = () => {
      // Basic Information fields
      const firstName = document.getElementById("setup-first-name");
      const lastName = document.getElementById("setup-last-name");
      const email = document.getElementById("setup-email");
      const studentId = document.getElementById("setup-student-id");
      const startingYear = document.getElementById("setup-starting-year");
      const major = document.getElementById("setup-major");
      const bio = document.getElementById("setup-bio");

      // Check if elements are available
      if (!firstName || !lastName) {
        console.log("🔄 Form elements not ready, retrying in 200ms...");
        setTimeout(populateFields, 200);
        return;
      }

      // Populate basic info
      if (profileData.firstName) firstName.value = profileData.firstName;
      if (profileData.lastName) lastName.value = profileData.lastName;
      if (profileData.email) email.value = profileData.email;

      // 🐛 BUG FIX: Always populate student ID from email, even if not in saved data
      if (studentId && this.currentUser && this.currentUser.email) {
        // First try saved data, then extract from email as fallback
        const savedStudentId = profileData.studentId;
        const extractedStudentId = this.currentUser.email.split("@")[0];

        studentId.value = savedStudentId || extractedStudentId;
        console.log(
          `🆔 Student ID populated: ${studentId.value} (from ${
            savedStudentId ? "saved data" : "email extraction"
          })`
        );
      }

      if (profileData.startingYear)
        startingYear.value = profileData.startingYear;
      if (profileData.major) major.value = profileData.major;
      if (profileData.bio && bio) bio.value = profileData.bio;

      // Update bio character counter
      if (profileData.bio && bio) {
        const bioCount = document.getElementById("bio-count");
        if (bioCount) {
          bioCount.textContent = profileData.bio.length;
        }
      }

      // Handle avatar configuration
      if (profileData.avatarConfig) {
        this.avatarConfig = profileData.avatarConfig;
        console.log("🎨 Loaded avatar config:", this.avatarConfig);
        this.updateAvatarPreview();
      }

      // Update internal profile data object
      // 🐛 BUG FIX: Ensure student ID is always populated from email if missing
      const finalStudentId =
        profileData.studentId ||
        (this.currentUser && this.currentUser.email
          ? this.currentUser.email.split("@")[0]
          : "");

      this.profileData = {
        firstName: profileData.firstName || "",
        lastName: profileData.lastName || "",
        email: profileData.email || "",
        studentId: finalStudentId,
        startingYear: profileData.startingYear || "",
        major: profileData.major || "",
        bio: profileData.bio || "",
      };

      console.log("✅ Form fields populated successfully");
      console.log(
        `🆔 Final student ID in profileData: "${this.profileData.studentId}"`
      );

      // Add visual indicators for readonly fields (especially email and student ID)
      this.styleReadonlyFields();

      // Re-validate current step after populating
      this.validateCurrentStep();
    };

    populateFields();
  }

  /**
   * Show loading state with custom message using SPA router's loading animation
   * @param {string} message - Loading message to display
   */
  showLoadingState(message = "Loading...") {
    // Create SPA-style loading overlay if it doesn't exist
    let loadingOverlay = document.getElementById("profile-spa-loading");

    if (!loadingOverlay) {
      loadingOverlay = document.createElement("div");
      loadingOverlay.id = "profile-spa-loading";
      loadingOverlay.className = "spa-loading";
      loadingOverlay.innerHTML = `
        <div class="loading-container">
          <div class="loading-animation">
            <div class="loading-dots">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
            <div class="loading-pulse"></div>
          </div>
          <div class="loading-text">
            <span class="loading-message">${message}</span>
            <span class="loading-ellipsis">...</span>
          </div>
        </div>
      `;

      // Apply SPA router loading styles
      loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: none;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
      `;

      // Add SPA loading styles if not already present
      if (!document.getElementById("profile-spa-loading-styles")) {
        const loadingStyles = document.createElement("style");
        loadingStyles.id = "profile-spa-loading-styles";
        loadingStyles.textContent = `
          .spa-loading.show {
            opacity: 1 !important;
          }

          .spa-loading .loading-container {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            background: rgba(255, 255, 255, 0.95);
            padding: 2.5rem 3rem;
            border-radius: 20px;
            box-shadow: 
              0 20px 40px rgba(0, 0, 0, 0.1),
              0 8px 20px rgba(0, 0, 0, 0.05),
              inset 0 1px 0 rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            min-width: 200px;
            animation: slideUpIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          @media (prefers-color-scheme: dark) {
            .spa-loading .loading-container {
              background: rgba(40, 44, 52, 0.95);
              border: 1px solid rgba(255, 255, 255, 0.1);
              box-shadow: 
                0 20px 40px rgba(0, 0, 0, 0.3),
                0 8px 20px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            }
          }

          .spa-loading .loading-animation {
            position: relative;
            margin-bottom: 1.5rem;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .spa-loading .loading-dots {
            display: flex;
            gap: 8px;
            position: relative;
            z-index: 2;
          }

          .spa-loading .loading-dots .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            animation: dotBounce 1.4s infinite ease-in-out both;
          }

          .spa-loading .loading-dots .dot:nth-child(1) {
            animation-delay: -0.32s;
          }

          .spa-loading .loading-dots .dot:nth-child(2) {
            animation-delay: -0.16s;
          }

          .spa-loading .loading-dots .dot:nth-child(3) {
            animation-delay: 0s;
          }

          .spa-loading .loading-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(102, 126, 234, 0.3) 0%, transparent 70%);
            transform: translate(-50%, -50%);
            animation: pulse 2s infinite ease-in-out;
          }

          .spa-loading .loading-text {
            color: #4a5568;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 500;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
          }

          @media (prefers-color-scheme: dark) {
            .spa-loading .loading-text {
              color: #e2e8f0;
            }
          }

          .spa-loading .loading-ellipsis {
            animation: ellipsis 1.5s infinite ease-in-out;
            display: inline-block;
            width: 20px;
            text-align: left;
          }

          @keyframes dotBounce {
            0%, 80%, 100% {
              transform: scale(0.8) translateY(0);
              opacity: 0.7;
            }
            40% {
              transform: scale(1.2) translateY(-10px);
              opacity: 1;
            }
          }

          @keyframes pulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.6;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0.2;
            }
          }

          @keyframes ellipsis {
            0% { content: ''; }
            33% { content: '.'; }
            66% { content: '..'; }
            100% { content: '...'; }
          }

          @keyframes slideUpIn {
            0% {
              transform: translate(-50%, -40%);
              opacity: 0;
              filter: blur(10px);
            }
            100% {
              transform: translate(-50%, -50%);
              opacity: 1;
              filter: blur(0);
            }
          }

          @media (max-width: 480px) {
            .spa-loading .loading-container {
              padding: 2rem;
              margin: 0 1rem;
              min-width: auto;
              max-width: 280px;
            }
            
            .spa-loading .loading-dots .dot {
              width: 10px;
              height: 10px;
            }
            
            .spa-loading .loading-text {
              font-size: 14px;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .spa-loading .loading-container {
              animation: none;
            }
            
            .spa-loading .loading-dots .dot {
              animation: dotBounceReduced 2s infinite ease-in-out both;
            }
            
            .spa-loading .loading-pulse {
              animation: none;
              opacity: 0.3;
            }
            
            @keyframes dotBounceReduced {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
          }
        `;
        document.head.appendChild(loadingStyles);
      }

      document.body.appendChild(loadingOverlay);
    } else {
      // Update message
      const messageEl = loadingOverlay.querySelector(".loading-message");
      if (messageEl) messageEl.textContent = message;
    }

    // Show the overlay with SPA router's smooth animation
    loadingOverlay.style.display = "block";
    // Use requestAnimationFrame for smooth animation like SPA router
    requestAnimationFrame(() => {
      loadingOverlay.classList.add("show");
    });
  }

  /**
   * Hide loading state using SPA router's smooth animation
   */
  hideLoadingState() {
    const loadingOverlay = document.getElementById("profile-spa-loading");
    if (loadingOverlay) {
      // Use SPA router's smooth hide animation
      loadingOverlay.classList.remove("show");
      // Wait for fade out animation before hiding (match SPA router timing)
      setTimeout(() => {
        if (loadingOverlay) {
          loadingOverlay.style.display = "none";
        }
      }, 300); // Match the CSS transition duration
    }
  }

  /**
   * Show error message to user
   * @param {string} message - Error message to display
   */
  showError(message) {
    // Simple error display - could be enhanced with better UI
    console.error("🚨 Profile Setup Error:", message);
    alert(message); // TODO: Replace with better error UI
  }

  /**
   * Check if user has completed profile setup
   * @param {Object} profileData - Profile data to check
   * @returns {boolean} True if profile is complete
   */
  isProfileComplete(profileData) {
    if (!profileData) return false;

    return !!(
      profileData.profileSetupComplete &&
      profileData.firstName &&
      profileData.lastName &&
      profileData.email &&
      profileData.studentId &&
      profileData.startingYear &&
      profileData.major
    );
  }

  /**
   * =============================================================================
   *                      2. AUTHENTICATION & USER MANAGEMENT
   * =============================================================================
   */

  /**
   * Check if user is authenticated and setup auth state listeners
   * Handles both immediate auth and auth state changes
   */
  async checkAuthentication() {
    // Prevent multiple authentication checks
    if (this.authCheckInProgress) {
      console.log("🔄 Authentication check already in progress, skipping...");
      return;
    }

    this.authCheckInProgress = true;
    console.log("🔐 Starting authentication check...");

    // Check if auth manager is available (modern approach)
    if (window.authManager) {
      console.log("🔥 Using modern auth manager");

      // 🎯 IMMEDIATE USER CHECK: First, try to get current user immediately
      const currentUser = window.authManager.getCurrentUser();
      if (currentUser) {
        this.currentUser = currentUser;
        console.log("✅ Found immediate user:", this.currentUser.email);
        // Initialize setup immediately without delay
        this.initializeSetup();
        return; // Exit early if we found a user
      }

      // Listen for auth state changes through auth manager
      window.authManager.onAuthStateChanged((user) => {
        if (user && !this.currentUser) {
          // Only process if we don't already have a user
          this.currentUser = user;
          console.log(
            "✅ User authenticated via auth manager callback:",
            user.email
          );
          // Initialize setup immediately without delay for callback
          this.initializeSetup();
        } else if (!user) {
          console.log("❌ No user authenticated, navigating to home...");
          if (window.spaRouter) {
            window.spaRouter.navigateTo("home");
          } else {
            window.location.href = "../index.html";
          }
        }
      });

      // Also check the direct property as fallback
      if (!this.currentUser && window.authManager.currentUser) {
        this.currentUser = window.authManager.currentUser;
        console.log(
          "✅ Found user via direct property:",
          this.currentUser.email
        );
        // Initialize setup immediately
        this.initializeSetup();
      }
    }
    // No auth system available
    else {
      console.error("❌ No authentication system available");
      if (window.spaRouter) {
        window.spaRouter.navigateTo("home");
      }
    }
  }

  /**
   * Navigate to home page using available navigation method
   */
  navigateToHome() {
    if (window.spaRouter) {
      window.spaRouter.navigateTo("home");
    } else {
      window.location.href = "../index.html";
    }
  }

  /**
   * Check if email is a development/test email
   * @param {string} email - Email to check
   * @returns {boolean} True if it's a development email
   */
  isDevelopmentEmail(email) {
    const devPatterns = ["dev", "test", "fake", "demo"];
    return devPatterns.some((pattern) => email.toLowerCase().includes(pattern));
  }

  /**
   * =============================================================================
   *                      3. INITIALIZATION & SETUP METHODS
   * =============================================================================
   */

  /**
   * Initialize the profile setup UI and functionality
   */
  async initializeSetup() {
    console.log("🎯 Initializing profile setup...");
    console.log("🔍 Auth Manager available:", !!window.authManager);
    console.log("🔍 Current user:", this.currentUser?.email || "None");

    // CRITICAL: Check if profile template is loaded first
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");

    if (!profileCard || !setupBody) {
      console.log("⚠️ Profile template not fully loaded, waiting...");
      setTimeout(() => {
        this.initializeSetup();
      }, 200);
      return;
    }

    console.log(
      "✅ Profile template is loaded, proceeding with initialization"
    );

    // Add debug info to page for development
    this.addDebugInfo();

    // 🎯 LOAD EXISTING PROFILE DATA: Check for existing profile data first
    if (this.currentUser && this.currentUser.uid) {
      try {
        const existingData = await this.loadProfileData(this.currentUser.uid);

        if (existingData) {
          console.log("📋 Found existing profile data, populating fields...");
          this.populateFormFields(existingData);

          // If profile is complete, show in edit mode
          if (this.isProfileComplete(existingData)) {
            console.log("✅ Profile is complete, entering edit mode");
            // 🐛 BUG FIX: Always start from step 0 in edit mode
            this.currentStep = 0;
            this.updateStepTitles("edit");
            this.updateStepDisplay();
          }
        } else {
          console.log("📝 No existing data, starting fresh setup");
          // 🎯 IMMEDIATE DATA PREFILL: Pre-fill email and student ID for new setup
          this.prefillUserData();
        }
      } catch (error) {
        console.error("❌ Error loading profile data:", error);
        // Fallback to normal prefill if data loading fails
        this.prefillUserData();
      }
    } else {
      // No user available, use fallback prefill
      this.prefillUserData();
    }

    // Initialize avatar system
    this.initializeAvatarSystem();

    // Setup all event listeners
    this.setupEventListeners();

    // Initialize display and validation - CRITICAL FOR VISIBILITY
    console.log(
      "🎯 CRITICAL: About to call updateStepDisplay() - this should make step 0 visible"
    );
    this.updateStepDisplay();

    console.log("🎯 CRITICAL: About to call updateProgress()");
    this.updateProgress();

    console.log("🎯 CRITICAL: About to call validateCurrentStep()");
    this.validateCurrentStep();

    console.log("✅ Profile setup initialized with immediate data prefill");

    // 🧪 IMMEDIATE VERIFICATION: Check if step 0 is actually visible now
    setTimeout(() => {
      this.verifyInitialization();
    }, 50);

    // Add diagnostic information for debugging display issues (with delay)
    setTimeout(() => {
      this.addDiagnosticInfo();
    }, 200);

    // 🧪 Add a test button for manual debugging (development only)
    if (this.currentUser && this.isDevelopmentEmail(this.currentUser.email)) {
      this.addTestButton();
    }
  }

  /**
   * Re-initialize setup for a fresh template (SPA navigation case)
   * This is called when the user navigates back to the profile page
   * and the template has been reloaded but the instance still exists
   */
  async reinitializeForFreshTemplate() {
    console.log("🔄 Re-initializing profile setup for fresh template...");

    // Check if template is loaded
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");

    if (!profileCard || !setupBody) {
      console.log("⚠️ Template not ready yet, retrying...");
      setTimeout(() => this.reinitializeForFreshTemplate(), 100);
      return;
    }

    // 🎯 LOAD EXISTING PROFILE DATA: Just like in initializeSetup, check for existing data
    if (this.currentUser && this.currentUser.uid) {
      try {
        // Check if we already have cached data to avoid unnecessary loading
        if (this.existingProfileData) {
          console.log("📋 Using cached profile data for re-initialization...");
          this.populateFormFields(this.existingProfileData);

          // If profile is complete, show in edit mode
          if (this.isProfileComplete(this.existingProfileData)) {
            console.log("✅ Profile is complete, entering edit mode");
            // 🐛 BUG FIX: Always start from step 0 in edit mode
            this.currentStep = 0;
            this.updateStepTitles("edit");
          }
        } else {
          // Load fresh data from Firestore
          const existingData = await this.loadProfileData(this.currentUser.uid);

          if (existingData) {
            console.log(
              "📋 Found existing profile data during re-initialization..."
            );
            this.populateFormFields(existingData);

            // If profile is complete, show in edit mode
            if (this.isProfileComplete(existingData)) {
              console.log("✅ Profile is complete, entering edit mode");
              // 🐛 BUG FIX: Always start from step 0 in edit mode
              this.currentStep = 0;
              this.updateStepTitles("edit");
            }
          } else {
            console.log("📝 No existing data found, using basic prefill");
            this.prefillUserData();
          }
        }
      } catch (error) {
        console.error(
          "❌ Error loading profile data during re-initialization:",
          error
        );
        // Fallback to basic prefill if data loading fails
        this.prefillUserData();
      }
    } else {
      // No user available, use basic prefill
      this.prefillUserData();
    }

    // Re-initialize avatar system
    this.initializeAvatarSystem();

    // Re-setup event listeners (in case they were lost)
    this.setupEventListeners();

    // Update display and validation
    this.updateStepDisplay();
    this.updateProgress();
    this.validateCurrentStep();

    console.log(
      "✅ Profile setup re-initialized for fresh template with data loading"
    );
  }

  /**
   * =============================================================================
   *                        4. FORM DATA MANAGEMENT
   * =============================================================================
   */

  /**
   * Pre-fill form fields with user data from authentication
   */
  prefillUserData() {
    const emailInput = document.getElementById("setup-email");
    const studentIdInput = document.getElementById("setup-student-id");

    // If fields aren't available yet, retry after a short delay
    if (!emailInput || !studentIdInput) {
      console.log("🔄 Form fields not ready, retrying in 200ms...");
      setTimeout(() => this.prefillUserData(), 200);
      return;
    }

    if (!this.currentUser) {
      console.warn("⚠️ No current user available for prefilling");

      // Try one more time to get user from auth manager
      if (window.authManager) {
        const user = window.authManager.getCurrentUser();
        if (user) {
          console.log("🔄 Retry successful: Found user", user.email);
          this.currentUser = user;
        } else {
          // Update placeholders to show no user found
          emailInput.placeholder = "Please sign in first";
          studentIdInput.placeholder = "Please sign in first";
          return;
        }
      } else {
        emailInput.placeholder = "Please sign in first";
        studentIdInput.placeholder = "Please sign in first";
        return;
      }
    }

    console.log("🔍 Current user for prefilling:", this.currentUser.email);

    // Check if this is a development email
    const isDev = this.isDevelopmentEmail(this.currentUser.email);
    console.log("🔧 Is development email?", isDev);

    // 🎯 IMMEDIATE AUTO-FILL: Pre-fill email immediately without any loading text
    if (emailInput) {
      // Always set the value, even if it was already set (SPA template reload case)
      emailInput.value = this.currentUser.email || "";
      emailInput.placeholder = isDev
        ? "Development email"
        : "Your university email";
      console.log("✅ Email populated immediately:", emailInput.value);
    }

    // 🎯 IMMEDIATE AUTO-FILL: Automatically extract and populate Student ID from email immediately
    if (studentIdInput && this.currentUser.email) {
      const emailParts = this.currentUser.email.split("@");
      if (emailParts.length > 0) {
        // Always set the value, even if it was already set (SPA template reload case)
        studentIdInput.value = emailParts[0];
        studentIdInput.placeholder = isDev
          ? "Development ID"
          : "Student ID (from email)";
        console.log(
          "✅ Student ID extracted and populated immediately:",
          studentIdInput.value
        );
      }
    }

    // 🎉 SUCCESS LOG: Check if both fields were successfully populated
    if (emailInput.value && studentIdInput.value) {
      console.log(
        "🎉 SUCCESS: Both email and student ID fields have been auto-filled instantly!"
      );
      console.log(`📧 Email: ${emailInput.value}`);
      console.log(`🆔 Student ID: ${studentIdInput.value}`);
    }

    // Add visual indicators for readonly fields
    this.styleReadonlyFields();
  }

  /**
   * Collect data from the current step
   */
  collectCurrentStepData() {
    if (this.currentStep === 0) {
      this.profileData.firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      this.profileData.lastName = document
        .getElementById("setup-last-name")
        .value.trim();
      this.profileData.email = document.getElementById("setup-email").value; // Already pre-filled and readonly
      this.profileData.studentId = document
        .getElementById("setup-student-id")
        .value.trim(); // Auto-populated and readonly
      this.profileData.startingYear = document.getElementById(
        "setup-starting-year"
      ).value;
      this.profileData.major = document
        .getElementById("setup-major")
        .value.trim();
    } else if (this.currentStep === 1) {
      this.profileData.bio = document.getElementById("setup-bio").value.trim();
      // Avatar configuration is handled by this.avatarConfig
    }
  }

  /**
   * =============================================================================
   *                         5. STEP NAVIGATION SYSTEM
   * =============================================================================
   */

  /**
   * Move to the next step in the setup process
   */
  async nextStep() {
    console.log("🔄 Moving to next step, current step:", this.currentStep);

    // Validate current step before proceeding
    if (!this.validateStepData()) {
      return; // Don't proceed if validation fails
    }

    // Collect data from current step
    this.collectCurrentStepData();

    if (this.currentStep < this.totalSteps - 1) {
      // Move to next step
      this.currentStep++;
      console.log("✅ Advanced to step:", this.currentStep + 1);
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep();
    } else {
      // Final step - save the profile
      console.log("💾 Saving profile...");
      await this.saveProfile();
    }
  }

  /**
   * Move to the previous step in the setup process
   */
  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep(); // Validate the new current step
    }
  }

  /**
   * Skip the entire setup process
   */
  async skipSetup() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (nextBtn) nextBtn.disabled = true;

    try {
      const userData = {
        uid: this.currentUser.uid,
        email: this.currentUser.email,
        profileSetupComplete: false,
        skippedSetupAt: serverTimestamp(),
      };

      // Use modern Firebase v9 syntax
      const userDocRef = doc(db, "users", this.currentUser.uid);
      await setDoc(userDocRef, userData, { merge: true });

      // 🎯 SPA Integration: Dispatch skip event instead of page redirect
      document.dispatchEvent(
        new CustomEvent("profile:setup:skip", {
          detail: { userData },
        })
      );

      // Fallback navigation if SPA router isn't available
      setTimeout(() => {
        if (!window.spaRouter) {
          window.location.href = "../index.html";
        } else {
          window.spaRouter.navigateTo("home");
        }
      }, 1000);
    } catch (error) {
      console.error("Error during skip setup:", error);
      alert("Could not process skip action. Please try again.");
      if (nextBtn) nextBtn.disabled = false;
    }
  }

  /**
   * =============================================================================
   *                       6. VALIDATION & ERROR HANDLING
   * =============================================================================
   */

  /**
   * Validate the current step's input fields
   */
  validateCurrentStep() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (!nextBtn) return;

    if (this.currentStep === 0) {
      // Step 0: Basic Info
      const firstName =
        document.getElementById("setup-first-name")?.value.trim() || "";
      const lastName =
        document.getElementById("setup-last-name")?.value.trim() || "";
      const startingYear =
        document.getElementById("setup-starting-year")?.value || "";
      const major = document.getElementById("setup-major")?.value.trim() || "";

      const hasRequiredFields = firstName && lastName && startingYear && major;

      // Always keep "Next Step →" text, just enable/disable button
      nextBtn.textContent = "Next Step →";
      nextBtn.disabled = !hasRequiredFields;

      // Add visual styling for disabled state
      if (!hasRequiredFields) {
        nextBtn.classList.add("disabled-state");
      } else {
        nextBtn.classList.remove("disabled-state");
      }
    } else if (this.currentStep === 1) {
      // Step 1: Avatar & bio (optional, this is the new final step)
      nextBtn.textContent = "Complete Setup!";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled-state");
    }
  }

  /**
   * Validate step data before proceeding to next step
   * @returns {boolean} True if validation passes
   */
  validateStepData() {
    if (this.currentStep === 0) {
      // Validate Step 0 (Basic Info)
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const startingYear = document.getElementById("setup-starting-year").value;
      const major = document.getElementById("setup-major").value.trim();

      if (!firstName || !lastName || !startingYear || !major) {
        // Show visual feedback for incomplete fields
        this.showIncompleteFieldsFeedback();
        return false;
      }
    }
    // Step 1 (Profile pic/bio) is optional, so no validation needed

    return true;
  }

  /**
   * Show visual feedback when disabled button is clicked
   */
  showIncompleteFieldsFeedback() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (!nextBtn) return;

    // Scroll to button smoothly
    nextBtn.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });

    // Add red glow animation
    nextBtn.classList.add("red-glow-pulse");

    // Remove the animation after it completes
    setTimeout(() => {
      nextBtn.classList.remove("red-glow-pulse");
    }, 800);

    console.log("🔴 Incomplete fields feedback shown");
  }

  /**
   * =============================================================================
   *                          7. UI STATE MANAGEMENT
   * =============================================================================
   */

  /**
   * Update the step display to show current step
   */
  updateStepDisplay() {
    console.log("🔄 Updating step display, current step:", this.currentStep);

    const steps = document.querySelectorAll(".setup-step");
    console.log("🔍 Found steps:", steps.length);

    // Log current state before making changes
    steps.forEach((step, index) => {
      const dataStep = step.getAttribute("data-step");
      const hasActive = step.classList.contains("active");
      console.log(
        `📋 BEFORE: Step ${index} (data-step=${dataStep}) has active=${hasActive}`
      );
    });

    steps.forEach((step) => step.classList.remove("active")); // More robust way to hide

    const currentStepElement = document.querySelector(
      `.setup-step[data-step="${this.currentStep}"]`
    );

    if (currentStepElement) {
      console.log("✅ Found current step element, making it active");
      currentStepElement.classList.add("active"); // More robust way to show

      // Verify it was actually added
      const hasActiveNow = currentStepElement.classList.contains("active");
      console.log("✅ Active class added successfully:", hasActiveNow);
    } else {
      console.error(
        "❌ Could not find step element for step:",
        this.currentStep
      );
      console.log("🔍 Available steps:");
      steps.forEach((step, index) => {
        console.log(
          `  Step ${index}: data-step="${step.getAttribute("data-step")}"`
        );
      });
    }

    // Log final state after making changes
    setTimeout(() => {
      const stepsAfter = document.querySelectorAll(".setup-step");
      stepsAfter.forEach((step, index) => {
        const dataStep = step.getAttribute("data-step");
        const hasActive = step.classList.contains("active");
        const isVisible = window.getComputedStyle(step).display !== "none";
        console.log(
          `📋 AFTER: Step ${index} (data-step=${dataStep}) active=${hasActive}, visible=${isVisible}`
        );
      });
    }, 50);

    // Update navigation button visibility
    this.updateNavigationButtons();

    // Next button text is handled by validateCurrentStep
    this.validateCurrentStep(); // Re-validate to update button text and state
  }

  /**
   * Update navigation button visibility and state
   */
  updateNavigationButtons() {
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");

    if (prevBtn) {
      prevBtn.style.display = this.currentStep === 0 ? "none" : "flex";
    }

    if (skipBtn) {
      // Show skip button on step 0 and 1, hide on final step
      skipBtn.style.display =
        this.currentStep < this.totalSteps - 1 ? "flex" : "none";
    }
  }

  /**
   * Update progress indicator display
   */
  updateProgress() {
    // Update step blocks instead of progress bar
    const stepBlocks = document.querySelectorAll(".step-block");
    stepBlocks.forEach((block, index) => {
      block.classList.remove("active", "completed");

      if (index < this.currentStep) {
        // Previous steps are completed
        block.classList.add("completed");
      } else if (index === this.currentStep) {
        // Current step is active
        block.classList.add("active");
      }
      // Future steps remain default styling
    });

    // Update step text elements
    const currentStepElement = document.querySelector(".current-step");
    const totalStepsElement = document.querySelector(".total-steps");

    if (currentStepElement) {
      currentStepElement.textContent = `Step ${this.currentStep + 1}`;
    }
    if (totalStepsElement) {
      totalStepsElement.textContent = `${this.totalSteps}`;
    }

    console.log(
      `📊 Progress: Step ${this.currentStep + 1}/${this.totalSteps} - Block ${
        this.currentStep
      } active`
    );
  }

  /**
   * Display success message after profile completion
   */
  showSuccessMessage() {
    const setupCard = document.querySelector(".profile-setup-card");
    if (setupCard) {
      setupCard.innerHTML = `
        <div class="setup-header">
          <div class="setup-title-section">
            <h1 class="setup-title">All Set! 🎉</h1>
            <p class="setup-subtitle">Your CampXus profile is ready</p>
          </div>
        </div>
        <div class="setup-body" style="text-align: center; padding: 3rem;">
          <div class="success-message">
            <div class="success-icon" style="font-size: 4rem; color: #10b981; margin-bottom: 1rem;">
              <i class="fas fa-rocket"></i>
            </div>
            <h3 style="color: #10b981; margin-bottom: 1rem;">Welcome Aboard!</h3>
            <p style="color: #6b7280;">You'll be redirected to your dashboard shortly.</p>
          </div>
        </div>
      `;
    }
  }

  /**
   * =============================================================================
   *                        8. AVATAR MANAGEMENT SYSTEM
   * =============================================================================
   */

  /**
   * Initialize avatar system with default avatar for user
   */
  initializeAvatarSystem() {
    if (!this.currentUser) {
      console.log("⚠️ No user available for avatar system");
      return;
    }

    // Generate default avatar configuration if none exists
    if (!this.avatarConfig) {
      this.avatarConfig = window.avatarManager.generateDefaultAvatar(
        this.currentUser.uid
      );
      console.log("🎨 Generated default avatar config:", this.avatarConfig);
    }

    // Update avatar preview
    this.updateAvatarPreview();
  }

  /**
   * Open avatar editor modal
   */
  openAvatarEditor() {
    console.log("🎨 Opening avatar editor...");

    if (!window.avatarManager) {
      console.error("❌ Avatar manager not available");
      alert("Avatar system is not loaded. Please refresh the page.");
      return;
    }

    if (!this.currentUser) {
      console.error("❌ No user available for avatar editor");
      alert("Please sign in to customize your avatar.");
      return;
    }

    // Initialize with current avatar or generate default
    const currentAvatar =
      this.avatarConfig ||
      window.avatarManager.generateDefaultAvatar(this.currentUser.uid);

    // Open avatar editor with callback
    window.avatarManager.openAvatarEditor(currentAvatar, (newAvatarConfig) => {
      console.log("✅ Avatar saved:", newAvatarConfig);
      this.avatarConfig = newAvatarConfig;
      this.updateAvatarPreview();
    });
  }

  /**
   * Update the avatar preview in the profile setup
   */
  updateAvatarPreview() {
    const avatarPreview = document.getElementById("avatar-preview-display");

    if (avatarPreview && this.avatarConfig) {
      const avatarUrl = window.avatarManager.generateAvatarUrl(
        this.avatarConfig
      );
      avatarPreview.innerHTML = `<img src="${avatarUrl}" alt="Your Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      console.log("🖼️ Avatar preview updated in profile setup");
    } else if (avatarPreview) {
      // Show default avatar placeholder
      avatarPreview.innerHTML = "🎨";
    }
  }

  /**
   * =============================================================================
   *                          9. DATABASE OPERATIONS
   * =============================================================================
   */

  /**
   * Save the complete profile to Firebase Firestore
   */
  async saveProfile() {
    const nextBtn = document.getElementById("setup-next-btn");
    const originalText = nextBtn ? nextBtn.textContent : "Complete Setup";
    if (nextBtn) {
      nextBtn.textContent = "Saving...";
      nextBtn.disabled = true;
    }

    // Ensure data from the final step is collected
    this.collectCurrentStepData();

    try {
      // Ensure we have an avatar configuration
      if (!this.avatarConfig && this.currentUser) {
        this.avatarConfig = window.avatarManager.generateDefaultAvatar(
          this.currentUser.uid
        );
        console.log(
          "🎨 Generated default avatar for saving:",
          this.avatarConfig
        );
      }

      const userData = {
        ...this.profileData,
        uid: this.currentUser.uid,
        email: this.currentUser.email,
        avatarConfig: this.avatarConfig, // Store avatar configuration instead of file URL
        profileSetupComplete: true,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };

      // Remove undefined fields
      Object.keys(userData).forEach(
        (key) => userData[key] === undefined && delete userData[key]
      );

      // Use modern Firebase v9 syntax
      const userDocRef = doc(db, "users", this.currentUser.uid);
      await setDoc(userDocRef, userData, { merge: true });

      console.log(
        "💾 Profile saved successfully with avatar config:",
        this.avatarConfig
      );

      this.showSuccessMessage();

      // 🎯 SPA Integration: Dispatch completion event instead of page redirect
      document.dispatchEvent(
        new CustomEvent("profile:setup:complete", {
          detail: { userData },
        })
      );

      // Fallback navigation if SPA router isn't available
      setTimeout(() => {
        if (!window.spaRouter) {
          window.location.href = "../index.html";
        } else {
          window.spaRouter.navigateTo("home");
        }
      }, 3000);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert(
        "Oh no! Something went wrong while saving your profile. Please check your connection and try again."
      );
      if (nextBtn) {
        nextBtn.textContent = originalText;
        nextBtn.disabled = false;
      }
    }
  }

  /**
   * =============================================================================
   *                    10. EVENT LISTENERS & DOM MANIPULATION
   * =============================================================================
   */

  /**
   * Setup all event listeners for the profile setup form
   */
  setupEventListeners() {
    const nextBtn = document.getElementById("setup-next-btn");
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");
    const avatarEditBtn = document.getElementById("avatar-edit-btn");
    const bioInput = document.getElementById("setup-bio");

    console.log("🔗 Setting up event listeners...");
    console.log("Next button found:", !!nextBtn);
    console.log("Previous button found:", !!prevBtn);
    console.log("Skip button found:", !!skipBtn);
    console.log("Avatar edit button found:", !!avatarEditBtn);

    // 🎯 DEFENSIVE: Remove existing listeners first to prevent duplicates
    if (nextBtn && !nextBtn.hasAttribute("data-listener-attached")) {
      nextBtn.addEventListener("click", (e) => {
        console.log("🖱️ Next button clicked");

        // If button is disabled, show visual feedback and scroll to button
        if (nextBtn.disabled) {
          e.preventDefault();
          this.showIncompleteFieldsFeedback();
          return;
        }

        this.nextStep();
      });
      nextBtn.setAttribute("data-listener-attached", "true");
    }

    if (prevBtn && !prevBtn.hasAttribute("data-listener-attached")) {
      prevBtn.addEventListener("click", () => this.prevStep());
      prevBtn.setAttribute("data-listener-attached", "true");
    }

    if (skipBtn && !skipBtn.hasAttribute("data-listener-attached")) {
      skipBtn.addEventListener("click", () => this.skipSetup());
      skipBtn.setAttribute("data-listener-attached", "true");
    }

    // Avatar editor button event listener
    if (
      avatarEditBtn &&
      !avatarEditBtn.hasAttribute("data-listener-attached")
    ) {
      avatarEditBtn.addEventListener("click", () => {
        console.log("🎨 Avatar edit button clicked");
        this.openAvatarEditor();
      });
      avatarEditBtn.setAttribute("data-listener-attached", "true");
    }

    if (bioInput && !bioInput.hasAttribute("data-listener-attached")) {
      bioInput.addEventListener("input", (e) => {
        const bioCount = document.getElementById("bio-count");
        if (bioCount) {
          bioCount.textContent = e.target.value.length;
        }
      });
      bioInput.setAttribute("data-listener-attached", "true");
    }

    this.setupFormValidation();
  }

  /**
   * Setup form field validation event listeners
   */
  setupFormValidation() {
    // Define required fields for the first step (Basic Information)
    const requiredFieldsStep0 = [
      "setup-first-name",
      "setup-last-name",
      "setup-starting-year",
      "setup-major",
    ];

    // Attach event listeners to all fields in the first step for real-time validation
    requiredFieldsStep0.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener("input", () => this.validateCurrentStep());
        field.addEventListener("blur", () => this.validateCurrentStep());
      }
    });
  }

  /**
   * =============================================================================
   *                       11. UTILITY & HELPER METHODS
   * =============================================================================
   */

  /**
   * Add visual styling for readonly form fields
   */
  styleReadonlyFields() {
    const readonlyFields = document.querySelectorAll(".form-input[readonly]");
    readonlyFields.forEach((field) => {
      field.classList.add("readonly-field");
    });
  }

  /**
   * Verify that initialization completed successfully
   */
  verifyInitialization() {
    const step0 = document.querySelector('.setup-step[data-step="0"]');
    if (step0) {
      const hasActive = step0.classList.contains("active");
      const isVisible = window.getComputedStyle(step0).display !== "none";
      console.log(`🧪 VERIFICATION: Step 0 has active class: ${hasActive}`);
      console.log(`🧪 VERIFICATION: Step 0 is visible: ${isVisible}`);

      // Also verify that the email and student ID fields have been populated
      const emailInput = document.getElementById("setup-email");
      const studentIdInput = document.getElementById("setup-student-id");
      if (emailInput && studentIdInput) {
        console.log(
          `🧪 VERIFICATION: Email field value: "${emailInput.value}"`
        );
        console.log(
          `🧪 VERIFICATION: Student ID field value: "${studentIdInput.value}"`
        );
      }
    }
  }

  /**
   * Add diagnostic information for debugging display issues
   */
  addDiagnosticInfo() {
    console.log("🔍 DIAGNOSTIC: Profile setup DOM analysis");

    // Check current page context
    const currentHash = window.location.hash;
    const currentBodyClass = document.body.className;
    console.log("🔍 Current URL hash:", currentHash);
    console.log("🔍 Body classes:", currentBodyClass);

    // Check main containers
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");
    const steps = document.querySelectorAll(".setup-step");

    console.log("📋 Profile card found:", !!profileCard);
    console.log("📋 Setup body found:", !!setupBody);
    console.log("📋 Total steps found:", steps.length);

    // Check for email/student ID inputs specifically
    const emailInput = document.getElementById("setup-email");
    const studentIdInput = document.getElementById("setup-student-id");
    console.log("📋 Email input found:", !!emailInput);
    console.log("📋 Student ID input found:", !!studentIdInput);

    // Check individual steps
    steps.forEach((step, index) => {
      const dataStep = step.getAttribute("data-step");
      const isActive = step.classList.contains("active");
      const isVisible = window.getComputedStyle(step).display !== "none";
      console.log(
        `📋 Step ${index}: data-step=${dataStep}, active=${isActive}, visible=${isVisible}`
      );
    });

    // Check current step specifically
    const currentStepEl = document.querySelector(
      `[data-step="${this.currentStep}"]`
    );
    if (currentStepEl) {
      console.log("✅ Current step element found and should be active");
      console.log("🎯 Current step classes:", currentStepEl.className);
      console.log(
        "🎯 Current step display:",
        window.getComputedStyle(currentStepEl).display
      );
    } else {
      console.error("❌ Current step element NOT found!");
      console.log(
        "🔍 Looking for selector:",
        `[data-step="${this.currentStep}"]`
      );
    }
  }

  /**
   * Add debug information for development users
   */
  addDebugInfo() {
    if (!this.currentUser) return;

    const isDev = this.isDevelopmentEmail(this.currentUser.email);
    const debugDiv = document.createElement("div");
    debugDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${isDev ? "#4ade80" : "#3b82f6"};
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 1000;
      font-family: monospace;
    `;
    debugDiv.textContent = `🔧 ${isDev ? "DEV" : "PROD"}: ${
      this.currentUser.email
    }`;
    document.body.appendChild(debugDiv);

    // Remove after 5 seconds
    setTimeout(() => debugDiv.remove(), 5000);
  }

  /**
   * Add test button for development debugging
   */
  addTestButton() {
    const testButton = document.createElement("button");
    testButton.textContent = "🧪 Test Step Display";
    testButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #ff6b6b;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      z-index: 2000;
      font-family: monospace;
    `;

    testButton.addEventListener("click", () => {
      console.log("🧪 MANUAL TEST: Calling updateStepDisplay()");
      this.updateStepDisplay();
    });

    document.body.appendChild(testButton);

    // Remove after 30 seconds to keep things clean
    setTimeout(() => testButton.remove(), 30000);
  }

  /**
   * Update step titles and descriptions based on mode (setup vs edit)
   * @param {string} mode - Either "setup" or "edit"
   */
  updateStepTitles(mode = "setup") {
    const stepDescription = document.querySelector(
      '[data-step="1"] .step-description'
    );

    if (stepDescription) {
      if (mode === "edit") {
        stepDescription.textContent = "Update your avatar and bio information.";
      } else {
        stepDescription.textContent = "Choose your avatar and add a short bio.";
      }
    }

    // Update main title if in edit mode
    const mainTitle = document.querySelector(".setup-title");
    const mainSubtitle = document.querySelector(".setup-subtitle");

    if (mode === "edit" && mainTitle && mainSubtitle) {
      mainTitle.textContent = "Update Your Profile";
      mainSubtitle.textContent = "Make changes to your profile information.";
    }
  }
}

/**
 * =============================================================================
 *                      12. GLOBAL INITIALIZATION SYSTEM
 * =============================================================================
 */

// Global instance variable and initialization flag
let profileSetupInstance = null;
let initializationInProgress = false;

/**
 * Wait for auth manager to be available
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds
 * @param {number} checkInterval - Interval between checks in milliseconds
 * @returns {Promise<Object>} Promise that resolves with auth manager
 */
function waitForAuthManager(maxWaitTime = 5000, checkInterval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function checkAuthManager() {
      if (
        window.authManager &&
        typeof window.authManager.getCurrentUser === "function"
      ) {
        console.log("✅ Auth manager is ready!");
        resolve(window.authManager);
      } else if (Date.now() - startTime >= maxWaitTime) {
        reject(new Error("Timeout waiting for auth manager"));
      } else {
        setTimeout(checkAuthManager, checkInterval);
      }
    }

    checkAuthManager();
  });
}

/**
 * Check authentication once auth manager is available and initialize if needed
 */
function checkAuthenticationAndInitialize() {
  // Check if user is already signed in
  const currentUser = window.authManager.getCurrentUser();
  console.log(
    "🔍 Current user from auth manager:",
    currentUser?.email || "None"
  );

  if (currentUser) {
    console.log(
      "✅ Found signed-in user, initializing profile setup immediately"
    );

    // Check if we're still on the profile page before creating instance
    const profileElements = document.querySelector(
      "#setup-email, #setup-student-id, .profile-setup-card"
    );
    if (profileElements && !profileSetupInstance) {
      profileSetupInstance = new ProfileSetup();
    } else if (!profileElements) {
      console.log(
        "🔄 User found but not on profile page, skipping initialization"
      );
    }
    return;
  }

  // No user signed in, listen for auth state changes
  console.log("👂 No user signed in, setting up auth state listener...");
  window.authManager.onAuthStateChanged((user) => {
    if (user && !profileSetupInstance) {
      console.log(
        "✅ User signed in via state change, checking if on profile page"
      );

      // Only initialize if we're on the profile page
      const profileElements = document.querySelector(
        "#setup-email, #setup-student-id, .profile-setup-card"
      );
      if (profileElements) {
        console.log("✅ On profile page, initializing profile setup");
        profileSetupInstance = new ProfileSetup();
      } else {
        console.log("🔄 User authenticated but not on profile page");
      }
    }
  });

  // Redirect to home after a reasonable delay if still no user
  setTimeout(() => {
    if (!profileSetupInstance) {
      console.log("❌ Still no user after waiting, redirecting to home");
      if (window.spaRouter) {
        window.spaRouter.navigateTo("home");
      }
    }
  }, 2000);
}

/**
 * Main initialization function for profile setup
 */
function initializeProfileSetup() {
  console.log("🚀 Starting profile setup initialization...");

  // Prevent multiple simultaneous initializations
  if (initializationInProgress) {
    console.log("⚠️ Initialization already in progress, skipping...");
    return;
  }

  // If instance already exists, don't create another
  if (profileSetupInstance) {
    console.log("⚠️ Profile setup instance already exists, skipping...");
    return;
  }

  initializationInProgress = true;

  // Debug what's available
  console.log("🔍 Debugging available auth systems:");
  console.log("   - window.authManager:", !!window.authManager);
  console.log(
    "   - window.authManager.getCurrentUser:",
    typeof window.authManager?.getCurrentUser
  );

  // Wait for auth manager if it's not available yet
  waitForAuthManager()
    .then(() => {
      console.log(
        "✅ Auth manager is now available, checking authentication..."
      );
      checkAuthenticationAndInitialize();
    })
    .catch((error) => {
      console.error("❌ Timeout waiting for auth manager:", error);
      console.log("❌ Redirecting to home page...");
      if (window.spaRouter) {
        window.spaRouter.navigateTo("home");
      }
    })
    .finally(() => {
      initializationInProgress = false;
    });
}

/**
 * Helper function to retry auth detection for existing instance
 */
function retryAuthDetection() {
  if (
    profileSetupInstance &&
    typeof profileSetupInstance.checkAuthentication === "function"
  ) {
    console.log("🔄 Retrying authentication detection for existing instance");
    profileSetupInstance.checkAuthentication();
  }
}

// =============================================================================
//                           EVENT LISTENERS & INITIALIZATION
// =============================================================================

// 🎯 FIX #1: Listen for SPA navigation to profile page
document.addEventListener("spa:navigation", (event) => {
  if (event.detail.route === "profile") {
    console.log("🔄 Navigated to profile page via SPA...");

    // If profile setup instance doesn't exist, create it now
    if (!profileSetupInstance) {
      console.log("🎯 Profile setup not initialized, creating instance...");

      // Add a small delay to ensure template is loaded
      setTimeout(() => {
        if (!profileSetupInstance) {
          initializeProfileSetup();
        }
      }, 200);
    } else {
      console.log(
        "🔄 Profile setup already exists, checking if template needs re-initialization..."
      );

      // 🎯 CRITICAL FIX: Always re-initialize when navigating back to profile page
      // This handles the case where SPA navigation reloads the template but the instance exists
      setTimeout(() => {
        const emailInput = document.getElementById("setup-email");
        const studentIdInput = document.getElementById("setup-student-id");

        if (emailInput && studentIdInput) {
          const emailEmpty =
            !emailInput.value || emailInput.value.trim() === "";
          const studentIdEmpty =
            !studentIdInput.value || studentIdInput.value.trim() === "";

          console.log(
            `🔍 Template reload check - Email empty: ${emailEmpty}, Student ID empty: ${studentIdEmpty}`
          );

          if (
            emailEmpty &&
            studentIdEmpty &&
            profileSetupInstance.currentUser
          ) {
            console.log(
              "🔄 Template was reloaded with empty fields, re-populating..."
            );
            profileSetupInstance.reinitializeForFreshTemplate();
          } else if (emailEmpty || studentIdEmpty) {
            console.log(
              "🔄 Some fields empty, ensuring all fields are populated..."
            );
            profileSetupInstance.prefillUserData();
          } else {
            console.log("✅ Fields are already populated, no action needed");
          }
        } else {
          console.log("⚠️ Form fields not found in reloaded template");
        }
      }, 100);
    }
  }
});

// 🎯 TRADITIONAL: Handle traditional page loads with DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("🎯 Profile setup DOM loaded, checking auth system...");

  // Only initialize if we don't already have an instance
  if (!profileSetupInstance) {
    // Add a small delay to ensure SPA navigation has had a chance to run first
    setTimeout(() => {
      if (!profileSetupInstance) {
        console.log("🎯 No instance created by SPA, creating via DOM ready...");
        initializeProfileSetup();
      } else {
        console.log(
          "🎯 Instance already exists from SPA navigation, skipping DOM ready init"
        );
      }
    }, 50);
  } else {
    console.log(
      "🎯 Instance already exists, skipping DOM ready initialization"
    );
  }
});

// 🎯 FIX #2: FALLBACK - If DOM is already loaded (SPA case), initialize immediately
if (document.readyState === "loading") {
  // DOM still loading, DOMContentLoaded will fire
  console.log("📄 DOM still loading, waiting for DOMContentLoaded...");
} else {
  // DOM already loaded, initialize now if we're on the profile page
  console.log("📄 DOM already loaded, checking if we're on profile page...");

  // Check if profile setup elements are present
  const profileElements = document.querySelector(
    "#setup-email, #setup-student-id"
  );
  if (profileElements && !profileSetupInstance) {
    console.log(
      "🎯 Profile page detected and setup not initialized, starting now..."
    );

    // Small delay to ensure elements are fully rendered
    setTimeout(() => {
      if (!profileSetupInstance) {
        console.log("🎯 Creating instance via immediate DOM check...");
        initializeProfileSetup();
      } else {
        console.log(
          "🎯 Instance already created, skipping immediate DOM check"
        );
      }
    }, 100);
  } else if (profileSetupInstance) {
    console.log("🎯 Instance already exists, skipping immediate DOM check");
  }
}

// =============================================================================
//                                    END
// =============================================================================
