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
import { serverTimestamp } from "firebase/firestore";

// Import avatar management system
import AvatarManager from "./avatars.js";

// Import data manager for Firestore operations
import { dataManager } from "./data-manager.js";

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

    // Add offline/online event listeners for UI feedback
    window.addEventListener("offline", () => this.showOfflineBanner(true));
    window.addEventListener("online", () => this.showOfflineBanner(false));
    // Show banner if already offline on load
    if (!navigator.onLine) {
      this.showOfflineBanner(true);
    }
  }

  /**
   * =============================================================================
   *                      1.5. PROFILE DATA LOADING & MANAGEMENT
   * =============================================================================
   */

  /**
   * Load existing profile data from Firestore using dataManager
   * @param {string} userId - User ID to fetch data for
   * @returns {Promise<Object|null>} Profile data or null if not found
   */
  async loadProfileData(userId) {
    if (this.dataLoadInProgress) {
      return this.existingProfileData;
    }

    this.dataLoadInProgress = true;

    try {
      // Show loading state
      this.showLoadingState("Loading your profile...");

      // Use dataManager instead of direct Firestore calls
      const data = await dataManager.getUserProfile(userId);

      if (data) {
        this.existingProfileData = data;
        this.hideLoadingState();
        return data;
      } else {
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
        setTimeout(populateFields, 200);
        return;
      }

      // 🗂️ ORGANIZED DATA ACCESS: Extract from grouped structure
      const getProfileValue = (path, defaultValue = "") => {
        return profileData.profile?.[path] || defaultValue;
      };

      const getUniversityValue = (path, defaultValue = "") => {
        return profileData.universityInfo?.[path] || defaultValue;
      };

      // Populate basic info from organized structure
      if (firstName) firstName.value = getProfileValue("firstName");
      if (lastName) lastName.value = getProfileValue("lastName");
      if (email) email.value = getProfileValue("email") || "";

      // 🆔 Always populate student ID from organized structure or email fallback
      if (studentId && this.currentUser && this.currentUser.email) {
        const savedStudentId = getUniversityValue("studentId");
        const extractedStudentId = this.currentUser.email.split("@")[0];

        studentId.value = savedStudentId || extractedStudentId;
      }

      if (startingYear) startingYear.value = getProfileValue("startingYear");
      if (major) major.value = getProfileValue("major");
      if (bio) bio.value = getProfileValue("bio");

      // Update bio character counter
      const bioValue = getProfileValue("bio");
      if (bioValue && bio) {
        const bioCount = document.getElementById("bio-count");
        if (bioCount) {
          bioCount.textContent = bioValue.length;
        }
      }

      // Handle avatar configuration
      if (profileData.avatarConfig) {
        this.avatarConfig = profileData.avatarConfig;
      } else {
        this.avatarConfig = null;
      }

      // 🗂️ ORGANIZED DATA STRUCTURE: Update internal profile data
      const finalStudentId =
        getUniversityValue("studentId") ||
        (this.currentUser && this.currentUser.email
          ? this.currentUser.email.split("@")[0]
          : "");

      this.profileData = {
        firstName: getProfileValue("firstName"),
        lastName: getProfileValue("lastName"),
        email: getProfileValue("email") || "",
        studentId: finalStudentId,
        startingYear: getProfileValue("startingYear"),
        major: getProfileValue("major"),
        bio: getProfileValue("bio"),
      };

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
   * Check if user has completed profile setup (using dataManager)
   * @param {Object} profileData - Profile data to check
   * @returns {boolean} True if profile is complete
   */
  isProfileComplete(profileData) {
    // Use dataManager's enhanced validation logic
    return dataManager.isProfileComplete(profileData);
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
      return;
    }

    this.authCheckInProgress = true;

    // Check if auth manager is available (modern approach)
    if (window.authManager) {
      // 🎯 IMMEDIATE USER CHECK: First, try to get current user immediately
      const currentUser = window.authManager.getCurrentUser();
      if (currentUser) {
        this.currentUser = currentUser;
        // Initialize setup immediately without delay
        this.initializeSetup();
        return; // Exit early if we found a user
      }

      // Listen for auth state changes through auth manager
      window.authManager.onAuthStateChanged((user) => {
        if (user && !this.currentUser) {
          // Only process if we don't already have a user
          this.currentUser = user;
          // Initialize setup immediately without delay for callback
          this.initializeSetup();
        } else if (!user) {
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
    // CRITICAL: Check if profile template is loaded first
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");

    if (!profileCard || !setupBody) {
      setTimeout(() => {
        this.initializeSetup();
      }, 200);
      return;
    }

    // Add debug info to page for development
    this.addDebugInfo();

    // 🎯 LOAD EXISTING PROFILE DATA: Check for existing profile data first
    if (this.currentUser && this.currentUser.uid) {
      try {
        const existingData = await this.loadProfileData(this.currentUser.uid);

        if (existingData) {
          this.populateFormFields(existingData);

          // If profile is complete, show in edit mode
          if (this.isProfileComplete(existingData)) {
            // 🎯 CRITICAL FIX: Always start from step 0 when editing profile
            // This ensures consistent navigation regardless of which step has data
            this.currentStep = 0;
            this.updateStepTitles("edit");
            this.updateStepDisplay();
          } else {
            this.currentStep = 0;
          }
        } else {
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
    this.updateStepDisplay();
    this.updateProgress();
    this.validateCurrentStep();

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
    // Check if template is loaded
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");

    if (!profileCard || !setupBody) {
      setTimeout(() => this.reinitializeForFreshTemplate(), 100);
      return;
    }

    // Load existing profile data - ALWAYS FRESH DATA for avatar updates
    if (this.currentUser && this.currentUser.uid) {
      try {
        // Always load fresh data from database to ensure we have latest avatar config
        const freshData = await this.loadProfileData(this.currentUser.uid);

        if (freshData) {
          this.existingProfileData = freshData; // Update cache with fresh data
          this.populateFormFields(freshData);

          // If profile is complete, show in edit mode
          if (this.isProfileComplete(freshData)) {
            this.currentStep = 0;
            this.updateStepTitles("edit");
          } else {
            this.currentStep = 0;
          }
        } else {
          this.currentStep = 0;
          this.prefillUserData();
        }
      } catch (error) {
        console.error(
          "❌ Error loading fresh profile data during re-initialization:",
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
      setTimeout(() => this.prefillUserData(), 200);
      return;
    }

    if (!this.currentUser) {
      // Try one more time to get user from auth manager
      if (window.authManager) {
        const user = window.authManager.getCurrentUser();
        if (user) {
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

    // Check if this is a development email
    const isDev = this.isDevelopmentEmail(this.currentUser.email);

    // 🎯 IMMEDIATE AUTO-FILL: Pre-fill email immediately without any loading text
    if (emailInput) {
      // Always set the value, even if it was already set (SPA template reload case)
      emailInput.value = this.currentUser.email || "";
      emailInput.placeholder = isDev
        ? "Development email"
        : "Your university email";
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
      }
    }

    // Add visual indicators for readonly fields
    this.styleReadonlyFields();
  }

  /**
   * Collect data from the current step
   */
  collectCurrentStepData() {
    if (this.currentStep === 0) {
      // Format names using our utility function!
      this.profileData.firstName = formatName(
        document.getElementById("setup-first-name").value.trim()
      );
      this.profileData.lastName = formatName(
        document.getElementById("setup-last-name").value.trim()
      );
      this.profileData.email = document.getElementById("setup-email").value; // Already pre-filled and readonly
      this.profileData.studentId = generateStudentId(this.profileData.email); // Generate using our function!
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
   * Move to the next step in the setup process - SIMPLIFIED
   */
  async nextStep() {
    // Validate current step before proceeding
    if (!this.validateStepData()) {
      return; // Don't proceed if validation fails
    }

    // Collect data from current step
    this.collectCurrentStepData();

    if (this.currentStep < this.totalSteps - 1) {
      // Move to next step
      this.currentStep++;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep();

      // Update avatar preview when navigating to avatar step (step 1)
      if (this.currentStep === 1) {
        // Simple single preview update
        this.updateAvatarPreview();
      }
    } else {
      // Final step - save the profile
      await this.saveProfile();
    }
  }

  /**
   * Move to the previous step in the setup process - SIMPLIFIED
   */
  async prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep(); // Validate the new current step

      // Update avatar preview when navigating back to avatar step (step 1)
      if (this.currentStep === 1) {
        // Simple single preview update
        this.updateAvatarPreview();
      }
    }
  }

  /**
   * Skip the entire setup process
   */
  async skipSetup() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (nextBtn) nextBtn.disabled = true;

    try {
      // Use dataManager for skip profile save
      const userData = {
        uid: this.currentUser.uid,
        profile: {
          email: this.currentUser.email,
          displayName:
            this.currentUser.displayName ||
            this.currentUser.email.split("@")[0],
        },
        systemInfo: {
          profileSetupComplete: false,
          status: "offline",
          lastUpdated: serverTimestamp(),
        },
      };
      const result = await dataManager.saveUserProfile(
        this.currentUser.uid,
        userData
      );
      if (!result.success) throw new Error(result.error);
      document.dispatchEvent(
        new CustomEvent("profile:setup:skip", {
          detail: { userData },
        })
      );
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
      // Step 0: Basic Info - Using our validation functions!
      const firstName =
        document.getElementById("setup-first-name")?.value.trim() || "";
      const lastName =
        document.getElementById("setup-last-name")?.value.trim() || "";
      const startingYear =
        document.getElementById("setup-starting-year")?.value || "";
      const major = document.getElementById("setup-major")?.value.trim() || "";
      const email = document.getElementById("setup-email")?.value.trim() || "";

      // Use our utility functions for validation!
      const hasValidEmail = isValidEmail(email);
      const hasValidStartingYear = isValidStartingYear(startingYear);
      const hasRequiredFields = validateRequiredFields({
        firstName,
        lastName,
        major,
        startingYear,
      });

      // All validations must pass
      const isStepValid =
        hasRequiredFields && hasValidEmail && hasValidStartingYear;

      // Always keep "Next Step →" text, just enable/disable button
      nextBtn.textContent = "Next Step →";
      nextBtn.disabled = !isStepValid;

      // Add visual styling for disabled state
      if (!isStepValid) {
        nextBtn.classList.add("disabled-state");
        // Show specific validation messages
        this.showValidationErrors(
          firstName,
          lastName,
          email,
          startingYear,
          major
        );
      } else {
        nextBtn.classList.remove("disabled-state");
        this.clearValidationErrors();
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
      // Validate Step 0 (Basic Info) using our utility functions
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const startingYear = document.getElementById("setup-starting-year").value;
      const major = document.getElementById("setup-major").value.trim();
      const email = document.getElementById("setup-email").value.trim();

      // Use our validation functions!
      const hasRequiredFields = validateRequiredFields({
        firstName,
        lastName,
        major,
        startingYear,
      });
      const hasValidEmail = isValidEmail(email);
      const hasValidStartingYear = isValidStartingYear(startingYear);

      if (!hasRequiredFields || !hasValidEmail || !hasValidStartingYear) {
        // Show visual feedback for incomplete/invalid fields
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
  }

  /**
   * Show validation errors to help users fix their input
   * @param {string} firstName - First name value
   * @param {string} lastName - Last name value
   * @param {string} email - Email value
   * @param {string} startingYear - Starting year value
   * @param {string} major - Major value
   */
  showValidationErrors(firstName, lastName, email, startingYear, major) {
    // Clear previous errors first
    this.clearValidationErrors();

    // Check each field and show specific errors
    if (!firstName.trim()) {
      this.showFieldError("setup-first-name", "First name is required");
    }

    if (!lastName.trim()) {
      this.showFieldError("setup-last-name", "Last name is required");
    }

    if (!email.trim()) {
      this.showFieldError("setup-email", "Email is required");
    } else if (!isValidEmail(email)) {
      this.showFieldError("setup-email", "Please enter a valid email address");
    }

    if (!startingYear) {
      this.showFieldError("setup-starting-year", "Starting year is required");
    } else if (!isValidStartingYear(startingYear)) {
      this.showFieldError(
        "setup-starting-year",
        "Please enter a valid starting year"
      );
    }

    if (!major.trim()) {
      this.showFieldError("setup-major", "Major is required");
    }
  }

  /**
   * Show an error message for a specific field
   * @param {string} fieldId - The ID of the field element
   * @param {string} message - The error message to display
   */
  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    // Add error styling to the field
    field.classList.add("error");

    // Create or update error message element
    const errorId = `${fieldId}-error`;
    let errorElement = document.getElementById(errorId);

    if (!errorElement) {
      errorElement = document.createElement("div");
      errorElement.id = errorId;
      errorElement.className = "error-message";
      field.parentNode.appendChild(errorElement);
    }

    errorElement.textContent = message;
    errorElement.style.display = "block";
  }

  /**
   * Clear all validation errors from the form
   */
  clearValidationErrors() {
    // Remove error styling from all form fields
    const formFields = document.querySelectorAll(
      ".form-field input, .form-field select, .form-field textarea"
    );
    formFields.forEach((field) => {
      field.classList.remove("error");
    });

    // Hide all error messages
    const errorMessages = document.querySelectorAll(".error-message");
    errorMessages.forEach((error) => {
      error.style.display = "none";
    });
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
    const steps = document.querySelectorAll(".setup-step");
    steps.forEach((step) => step.classList.remove("active")); // More robust way to hide

    const currentStepElement = document.querySelector(
      `.setup-step[data-step="${this.currentStep}"]`
    );

    if (currentStepElement) {
      currentStepElement.classList.add("active"); // More robust way to show
    } else {
      console.error(
        "❌ Could not find step element for step:",
        this.currentStep
      );
    }

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
  }

  /**
   * Display success message after profile completion
   * Shows an extra message if offline, and attempts to show sync status if available.
   */
  showSuccessMessage() {
    const setupCard = document.querySelector(".profile-setup-card");
    if (setupCard) {
      // Check if offline and optionally get sync status from dataManager
      let offlineMsg = "";
      if (!navigator.onLine) {
        offlineMsg = `
          <div class="offline-success-info" style="margin-top:1.5rem; background:#f87171; color:#fff; padding:0.75rem 1rem; border-radius:8px; font-size:1rem; text-align:center; max-width:400px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <span style="display:inline-block;margin-right:0.5em;vertical-align:middle;">⚠️</span>
            <span style="vertical-align:middle;">You are offline. Your profile is saved locally and will sync to the cloud when you reconnect.</span>
          </div>
        `;
      }
      // Optionally, show more info if dataManager provides sync state (for advanced users)
      if (
        window.dataManager &&
        typeof window.dataManager.getSyncStatus === "function"
      ) {
        try {
          const syncStatus = window.dataManager.getSyncStatus();
          if (syncStatus && syncStatus.pendingWrites > 0) {
            offlineMsg += `
              <div class="sync-status-info" style="margin-top:0.5rem; color:#fbbf24; font-size:0.95rem;">
                <span style="display:inline-block;margin-right:0.3em;">⏳</span>
                <span>Pending changes: ${syncStatus.pendingWrites}. They will sync automatically.</span>
              </div>
            `;
          }
        } catch (e) {
          // Ignore errors, just don't show sync status
        }
      }
      setupCard.innerHTML = `
        <div class="setup-header">
          <div class="setup-title-section">
            <h1 class="setup-title">All Set! 🎉</h1>
            <p class="setup-subtitle">Your profile is ready</p>
          </div>
        </div>
        <div class="setup-body" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 350px; padding: 3rem 1rem;">
          <div class="success-message" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
            <div class="success-icon" style="font-size: 4rem; color: #10b981; margin-bottom: 1rem;">
              <i class="fas fa-rocket" aria-hidden="true"></i>
            </div>
            <h3 style="color: #059669; margin-bottom: 1rem; text-align: center;">Welcome Aboard!</h3>
            <p style="color:rgb(248, 248, 248); text-align: center; max-width: 350px;">You'll be redirected to your dashboard shortly.</p>
            ${offlineMsg}
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
   * Initialize avatar system with default avatar for user - SIMPLIFIED
   */
  async initializeAvatarSystem() {
    if (!this.currentUser) {
      console.log("⚠️ No user available for avatar system");
      return;
    }

    // Use existing avatar config from loaded profile data (always fresh)
    if (this.existingProfileData?.avatarConfig) {
      this.avatarConfig = this.existingProfileData.avatarConfig;
    }
    // Generate default avatar if none exists
    else if (!this.avatarConfig && window.avatarManager) {
      this.avatarConfig = window.avatarManager.generateDefaultAvatar(
        this.currentUser.uid
      );
    }
  }

  /**
   * Open avatar editor modal - SIMPLIFIED
   */
  openAvatarEditor() {
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

    // Use current avatar or generate default
    const currentAvatar =
      this.avatarConfig ||
      window.avatarManager.generateDefaultAvatar(this.currentUser.uid);

    // Open avatar editor with callback
    window.avatarManager.openAvatarEditor(
      currentAvatar,
      async (newAvatarConfig) => {
        this.avatarConfig = newAvatarConfig;

        // Update the preview immediately
        this.updateAvatarPreview();

        // If profile is complete, save the avatar change immediately
        if (
          this.currentUser &&
          this.isProfileComplete(this.existingProfileData || this.profileData)
        ) {
          await this.saveAvatarChange(newAvatarConfig);
        }
      }
    );
  }

  /**
   * Save avatar change to database (for completed profiles)
   */
  async saveAvatarChange(avatarConfig) {
    try {
      // Use dataManager's new updateAvatarConfig method for proper validation
      const result = await dataManager.updateAvatarConfig(
        this.currentUser.uid,
        avatarConfig
      );
      if (!result.success) throw new Error(result.error);

      // Use the cleaned config that was actually saved
      const cleanedAvatarConfig = result.cleanedConfig || avatarConfig;

      // Update cached profile data immediately with the cleaned config
      if (this.existingProfileData) {
        this.existingProfileData.avatarConfig = cleanedAvatarConfig;
      }
      // Update menu with new avatar (use cleaned config)
      if (window.updateUserDataAfterProfileCompletion) {
        const updatedUserData = {
          uid: this.currentUser.uid,
          name: this.currentUser.displayName,
          email: this.currentUser.email,
          avatarConfig: cleanedAvatarConfig,
          profileSetupComplete: true,
        };
        window.updateUserDataAfterProfileCompletion(updatedUserData);
      }
    } catch (error) {
      console.error("❌ Error saving avatar:", error);
      alert("Failed to save avatar. Please try again.");
    }
  }

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
      // 🗂️ ORGANIZED STRUCTURE: Group related fields for better data management
      const userData = {
        uid: this.currentUser.uid,
        universityInfo: {
          university: this.currentUser.email.split("@")[1].split(".")[0],
          universityName: "Independent University, Bangladesh",
          studentId: this.profileData.studentId,
        },
        profile: {
          firstName: this.profileData.firstName,
          lastName: this.profileData.lastName,
          bio: this.profileData.bio || "",
          major: this.profileData.major,
          startingYear: this.profileData.startingYear,
          email: this.currentUser.email,
          displayName:
            this.profileData.firstName || this.currentUser.email.split("@")[0],
        },
        avatarConfig: this.avatarConfig,
        systemInfo: {
          profileSetupComplete: true,
          status: "offline",
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        },
      };
      Object.keys(userData).forEach(
        (key) => userData[key] === undefined && delete userData[key]
      );
      // Use dataManager for profile save
      const result = await dataManager.saveUserProfile(
        this.currentUser.uid,
        userData
      );
      if (!result.success) throw new Error(result.error);
      console.log(
        "💾 Profile saved successfully with avatar config:",
        this.avatarConfig
      );
      this.showSuccessMessage();
      document.dispatchEvent(
        new CustomEvent("profile:setup:complete", {
          detail: { userData },
        })
      );
      if (window.updateUserDataAfterProfileCompletion) {
        const menuUserData = {
          uid: userData.uid,
          name: `${userData.profile.firstName} ${userData.profile.lastName}`,
          email: userData.profile.email,
          avatarConfig: userData.avatarConfig,
          profileSetupComplete: userData.systemInfo.profileSetupComplete,
        };
        window.updateUserDataAfterProfileCompletion(menuUserData);
      }
      sessionStorage.setItem("profileJustCompleted", "true");
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
   *                       9. DATABASE OPERATIONS
   * =============================================================================
   */

  /**
   * Skip the entire setup process
   */
  async skipSetup() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (nextBtn) nextBtn.disabled = true;

    try {
      // Use dataManager for skip profile save
      const userData = {
        uid: this.currentUser.uid,
        profile: {
          email: this.currentUser.email,
          displayName:
            this.currentUser.displayName ||
            this.currentUser.email.split("@")[0],
        },
        systemInfo: {
          profileSetupComplete: false,
          status: "offline",
          lastUpdated: serverTimestamp(),
        },
      };
      const result = await dataManager.saveUserProfile(
        this.currentUser.uid,
        userData
      );
      if (!result.success) throw new Error(result.error);
      document.dispatchEvent(
        new CustomEvent("profile:setup:skip", {
          detail: { userData },
        })
      );
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
   *                      10. EVENT LISTENERS & DOM MANIPULATION
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

    // 🎯 DEFENSIVE: Remove existing listeners first to prevent duplicates
    if (nextBtn && !nextBtn.hasAttribute("data-listener-attached")) {
      nextBtn.addEventListener("click", (e) => {
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
    if (!step0) {
      console.error("❌ Step 0 element not found during verification");
      return;
    }

    const hasActive = step0.classList.contains("active");
    const isVisible = window.getComputedStyle(step0).display !== "none";

    if (!hasActive || !isVisible) {
      console.error("❌ Step 0 is not properly visible or active");
    }
  }

  /**
   * Add diagnostic information for debugging display issues
   */
  addDiagnosticInfo() {
    // Only show critical diagnostic info - current step not found
    const currentStepEl = document.querySelector(
      `[data-step="${this.currentStep}"]`
    );
    if (!currentStepEl) {
      console.error("❌ Current step element NOT found!");
      console.error(
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

  /**
   * Test DiceBear API connectivity and provide debugging info
   */
  async testAvatarAPIConnectivity() {
    try {
      // Test with the simplest possible URL
      const testUrl = "https://api.dicebear.com/9.x/initials/svg?seed=test";

      const response = await fetch(testUrl, { method: "HEAD" });

      if (response.ok) {
        return true;
      } else {
        console.error(
          "❌ DiceBear API returned error status:",
          response.status
        );
        return false;
      }
    } catch (error) {
      console.error("❌ DiceBear API connectivity test failed:", error);
      return false;
    }
  }

  /**
   * Test avatar API connectivity with a simple request
   */
  async testAvatarAPI() {
    try {
      // Test with the simplest possible request
      const testUrl =
        "https://api.dicebear.com/9.x/initials/svg?seed=test&backgroundColor=b6e3f4";

      const response = await fetch(testUrl, { method: "HEAD" });

      if (response.ok) {
        return true;
      } else {
        console.error("❌ Avatar API returned error:", response.status);
        return false;
      }
    } catch (error) {
      console.error("❌ Avatar API test failed:", error);
      return false;
    }
  }

  /**
   * Create a simple avatar config for testing
   */
  createSimpleAvatarConfig() {
    if (!this.currentUser) return null;

    return {
      style: "initials",
      seed: this.currentUser.uid.substring(0, 8),
      options: {
        backgroundColor: "b6e3f4",
      },
    };
  }

  /**
   * Efficiently update the avatar preview in the profile setup flow.
   * Shows a loading spinner while the avatar image loads, and only shows initials if the image fails to load or no avatar config is present.
   * This method is called when entering the avatar step or after editing the avatar.
   */
  updateAvatarPreview() {
    const previewContainer = document.getElementById("avatar-preview-display");
    if (!previewContainer) {
      console.warn("⚠️ Avatar preview container not found");
      return;
    }

    // Clear previous content
    previewContainer.innerHTML = "";

    // Helper: Get initials from profile data or email
    const getInitials = () => {
      const firstName = this.profileData?.firstName || "";
      const lastName = this.profileData?.lastName || "";
      if (firstName && lastName) {
        return `${firstName[0]}${lastName[0]}`.toUpperCase();
      }
      // Fallback: use email
      const email = this.profileData?.email || this.currentUser?.email || "";
      if (email) {
        return email[0].toUpperCase();
      }
      return "?";
    };

    // Helper: Render fallback initials avatar
    const renderInitials = () => {
      const initials = getInitials();
      const fallbackDiv = document.createElement("div");
      fallbackDiv.className = "avatar-fallback";
      fallbackDiv.setAttribute("aria-label", `Avatar fallback: ${initials}`);
      fallbackDiv.style.cssText = `
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: var(--avatar-fallback-bg, #b6e3f4);
        color: var(--avatar-fallback-fg, #222);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      `;
      fallbackDiv.textContent = initials;
      previewContainer.innerHTML = "";
      previewContainer.appendChild(fallbackDiv);
    };

    // Helper: Render accessible loading spinner
    const renderSpinner = () => {
      const spinnerWrapper = document.createElement("div");
      spinnerWrapper.className = "avatar-spinner-wrapper";
      spinnerWrapper.style.cssText = `
        width: 96px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      // Visually hidden text for screen readers
      const srText = document.createElement("span");
      srText.className = "sr-only";
      srText.textContent = "Loading avatar...";
      srText.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0,0,0,0);
        border: 0;
      `;
      // SVG spinner (accessible, contrast-friendly)
      const spinner = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      spinner.setAttribute("width", "48");
      spinner.setAttribute("height", "48");
      spinner.setAttribute("viewBox", "0 0 50 50");
      spinner.setAttribute("role", "status");
      spinner.setAttribute("aria-label", "Loading avatar");
      spinner.innerHTML = `
        <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" stroke-width="5" opacity="0.2"/>
        <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 94.2" stroke-dashoffset="0">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite"/>
        </circle>
      `;
      spinnerWrapper.appendChild(spinner);
      spinnerWrapper.appendChild(srText);
      previewContainer.appendChild(spinnerWrapper);
    };

    // If no avatar config or avatarManager, show fallback
    if (!this.avatarConfig || !window.avatarManager) {
      renderInitials();
      return;
    }

    // Try to generate avatar image URL
    let avatarUrl = "";
    try {
      avatarUrl = window.avatarManager.generateAvatarUrl(this.avatarConfig);
    } catch (e) {
      console.error("❌ Failed to generate avatar URL:", e);
      renderInitials();
      return;
    }

    // Show spinner while loading
    renderSpinner();

    let didFinish = false; // Track if image loaded or errored

    // Create image element for avatar
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = "User avatar";
    img.width = 96;
    img.height = 96;
    img.loading = "lazy";
    img.style.cssText = `
      width: 96px;
      height: 96px;
      border-radius: 50%;
      object-fit: cover;
      background: #f3f4f6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: block;
    `;
    img.setAttribute("aria-label", "User avatar preview");

    // If image fails to load, show fallback
    img.onerror = () => {
      if (didFinish) return;
      didFinish = true;
      previewContainer.innerHTML = "";
      renderInitials();
    };

    // When image loads, replace spinner with image
    img.onload = () => {
      if (didFinish) return;
      didFinish = true;
      previewContainer.innerHTML = "";
      previewContainer.appendChild(img);
    };

    // Timeout fallback: if image doesn't load in 5 seconds, show initials
    setTimeout(() => {
      if (!didFinish) {
        didFinish = true;
        previewContainer.innerHTML = "";
        renderInitials();
      }
    }, 5000);

    // Start loading image (browser will handle caching)
    // Spinner remains until image loads or fails
  }

  /**
   * Show or hide an offline status banner at the top of the profile setup page.
   * This helps users know when they are offline and that changes will sync later.
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
}

/**
 * =============================================================================
 *                        GLOBAL INITIALIZATION SYSTEM
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

// 🎯 NEW: Event listener for SPA page loads
document.addEventListener("spa:page:load", (event) => {
  const { route } = event.detail;
  console.log(`[profile-setup.js] Received spa:page:load for route: ${route}`);

  if (route === "profile") {
    console.log("🚀 Initializing Profile Setup page...");
    // The core initialization logic from the old DOMContentLoaded listener
    initializeProfileSetup();
  }
});

// 🗑️ LEGACY: The traditional DOMContentLoaded listener is no longer needed for the SPA.
// The logic has been moved into the `spa:page:load` event listener above to ensure
// it runs every time the profile page is loaded via the router.
// document.addEventListener("DOMContentLoaded", () => {
//   if (document.readyState === "interactive" || document.readyState === "complete") {
//     console.log("🚀 DOM fully loaded and parsed, initializing profile setup...");
//     initializeProfileSetup();
//   } else {
//     console.log("📄 DOM still loading, waiting for DOMContentLoaded...");
//   }
// });

/* ===============================================================================================
 * 🎓 LEARNING MOMENT: From DOMContentLoaded to SPA Events
 *
 * In traditional web development, we often rely on the `DOMContentLoaded` event to initialize scripts
 * that depend on the DOM being fully loaded. However, in Single Page Applications (SPAs), navigation
 * between pages doesn't trigger a full page reload, and thus `DOMContentLoaded` may not fire as expected.
 *
 * To adapt to SPAs, we listen for custom events like `spa:page:load` that signal when a new page is
 * fully loaded and ready for interaction. This ensures our initialization code runs at the right time,
 * every time the user navigates to the profile page, regardless of how they got there.
 *
 * =============================================================================================== */

// =============================================================================
//                         UTILITY FUNCTIONS FOR TESTING
// =============================================================================

/**
 * Email validation utility function
 * @param {string} email - Email to validate
 * @returns {boolean} True if email is valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Name formatting utility function
 * @param {string} name - Name to format
 * @returns {string} Properly formatted name
 */
export function formatName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Extract student ID from email
 * @param {string} email - Email to extract ID from
 * @returns {string} Student ID extracted from email (part before @)
 */
export function generateStudentId(email) {
  if (!email || typeof email !== "string") return "";
  const emailParts = email.split("@");
  return emailParts.length > 0 ? emailParts[0] : "";
}

/**
 * Starting year validation utility
 * @param {string|number} year - Year to validate
 * @returns {boolean} True if year is valid
 */
export function isValidStartingYear(year) {
  if (!year) return false;
  const yearNum = parseInt(year);
  if (isNaN(yearNum)) return false;

  const currentYear = new Date().getFullYear();
  return yearNum >= currentYear - 6 && yearNum <= currentYear;
}

/**
 * Validate required profile fields
 * @param {Object} data - Profile data to validate
 * @returns {boolean} True if all required fields are present
 */
export function validateRequiredFields(data) {
  const required = ["firstName", "lastName", "major", "startingYear"];
  return required.every(
    (field) =>
      data[field] &&
      typeof data[field] === "string" &&
      data[field].trim() !== ""
  );
}

// Export the ProfileSetup class for testing
export { ProfileSetup };

// =============================================================================
//                                    END
// =============================================================================

/**
 * Global function to refresh avatar preview (can be called from other modules)
 */
window.refreshProfileAvatarPreview = function () {
  if (
    profileSetupInstance &&
    typeof profileSetupInstance.refreshAvatarFromDatabase === "function"
  ) {
    console.log("🔄 Global avatar refresh called");
    profileSetupInstance.refreshAvatarFromDatabase();
  } else {
    console.log("⚠️ Profile setup instance not available for avatar refresh");
  }
};
