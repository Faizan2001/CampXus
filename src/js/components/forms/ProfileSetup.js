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
import { avatarManager } from "../../utils/avatar/avatarManager.js";

// Import data manager for Firestore operations
import { dataManager } from "../../services/data/DataService.js";
import { scheduleStorageService } from "../../services/schedule/ScheduleStorageService.js";
import { currentUser } from "../../store/userStore.js";
import { authManager } from "../../services/auth/AuthService.js";
import { navigateTo } from "../../app.js"; // 🎯 NEW: Import navigateTo for SPA navigation
import { syncUserDataCache } from "../../services/data/DataService.js"; // 🔄 Combined cache sync function (follows DRY principles)
import { ScheduleImportService } from "../../services/schedule/ScheduleImportService.js"; // 🎯 NEW: Schedule import functionality

/**
 * =============================================================================
 *                        1. CLASS DEFINITION & CONSTRUCTOR
 * =============================================================================
 */

class ProfileSetup {
  constructor() {
    // CRITICAL: Prevent multiple instances from being created
    if (window.profileSetupInstance) {
      console.warn(
        "⚠️ ProfileSetup instance already exists! Returning existing instance."
      );
      return window.profileSetupInstance;
    }

    this.currentStep = 0;
    this.totalSteps = 3; // Basic Info, Avatar & Bio, Schedule Import
    this.profileData = {};
    this.avatarConfig = null; // Stores user's avatar configuration
    this.scheduleData = null; // Stores imported schedule data
    this.scheduleImportService = new ScheduleImportService(); // 🎯 NEW: Schedule import service
    this.dataLoadInProgress = false; // Prevent duplicate data loading
    this.existingProfileData = null; // Cache for existing profile data
    this.isInitialized = false; // Flag to prevent re-initialization

    // Store this instance globally to prevent duplicates
    window.profileSetupInstance = this;

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
      const bioCount = document.getElementById("bio-count");

      // Check if elements are available
      if (!firstName || !lastName) {
        setTimeout(populateFields, 200);
        return;
      }

      // 🎯 FINAL FIX: Handle both nested (from DB) and flat (from sign-in) data structures.
      // This is the key to fixing the pre-filling bug on first sign-in.
      const isNested = profileData.profile && profileData.universityInfo;
      const profile = isNested ? profileData.profile : profileData;
      const universityInfo = isNested ? profileData.universityInfo : {};

      // 🗂️ ORGANIZED DATA ACCESS: Extract from the correct structure
      const getProfileValue = (path, defaultValue = "") => {
        return profile[path] || defaultValue;
      };

      const getUniversityValue = (path, defaultValue = "") => {
        return universityInfo[path] || defaultValue;
      };

      // Populate basic info from organized structure
      if (firstName) firstName.value = getProfileValue("firstName");
      if (lastName) lastName.value = getProfileValue("lastName");
      if (email) email.value = getProfileValue("email") || "";

      // 🆔 Always populate student ID from organized structure or email fallback
      const loggedInUser = currentUser.user;
      if (studentId && loggedInUser && loggedInUser.email) {
        const savedStudentId = getUniversityValue("studentId");
        const extractedStudentId = loggedInUser.email.split("@")[0];

        studentId.value = savedStudentId || extractedStudentId;
      }

      if (startingYear) startingYear.value = getProfileValue("startingYear");
      if (major) major.value = getProfileValue("major");
      if (bio) bio.value = getProfileValue("bio");

      // Update bio character counter
      const bioValue = getProfileValue("bio");
      if (bioCount) {
        bioCount.textContent = bioValue.length;
      }

      // Handle avatar configuration
      const avatarSource = isNested ? profileData : profile;
      if (avatarSource.avatarConfig) {
        this.avatarConfig = avatarSource.avatarConfig;
      } else {
        this.avatarConfig = null;
      }

      // Schedule privacy settings have been moved to Friends page for better UX

      // 🗂️ ORGANIZED DATA STRUCTURE: Update internal profile data
      const finalStudentId =
        getUniversityValue("studentId") ||
        (loggedInUser && loggedInUser.email
          ? loggedInUser.email.split("@")[0]
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
   * Navigate to the home page (SPA-style)
   */
  navigateToHome() {
    navigateTo("home");
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
   * Initializes the profile setup process once the user is authenticated.
   * This replaces the old checkAuthentication method.
   */
  async initializeWhenReady() {
    try {
      console.log("⏳ Waiting for user profile to initialize setup...");
      const userProfile = await currentUser.waitForProfile();

      if (userProfile) {
        console.log("✅ User profile loaded, initializing profile setup.");

        // 🎯 CRITICAL: Set this.currentUser from the global currentUser
        this.currentUser = currentUser.user;
        this.existingProfileData = userProfile;

        // The user is authenticated and has a profile,
        // so let's initialize the setup page. It will either be
        // pre-filled for editing or empty for a new user.
        await this.initializeSetup();
      } else {
        console.warn(
          "🤷 No user logged in. Profile setup will not initialize."
        );

        // We can optionally hide the setup form or show a login prompt here.
      }
    } catch (error) {
      console.error("❌ Error during profile setup initialization:", error);
      this.showError("Could not start the profile setup process.");
    }
  }

  /**
   * =============================================================================
   *                      3. INITIALIZATION & SETUP METHODS
   * =============================================================================
   */

  /**
   * Initialize the profile setup UI, populates fields, and sets up listeners.
   * This is the main entry point after the user is authenticated.
   */
  async initializeSetup() {
    // 🎯 FIX for race condition: Wait for the DOM to be ready for painting.
    // This ensures the template from the SPA router has been rendered.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Cache DOM elements for performance
    this.cacheDOMElements();

    // Add debug info to page for development
    if (import.meta.env.DEV) {
      this.addDebugInfo();
    }

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

    this.updateStepDisplay();
    this.setupEventListeners(); // Re-add event listeners
    this.initializeAvatarSystem();
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
      if (authManager) {
        const user = authManager.getCurrentUser();
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
      // Schedule privacy settings are now managed on the Friends page
    } else if (this.currentStep === 2) {
      // Schedule Import step - schedule data is stored separately in this.scheduleData
      // DO NOT add schedule data to profileData to avoid Firestore nested arrays error
      console.log("📅 Schedule import step completed", {
        hasScheduleData: !!this.scheduleData,
        coursesCount: this.scheduleData?.courses?.length || 0
      });
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
      // Final step - save the profile with loading state
      const nextBtn = document.getElementById("setup-next-btn");
      
      // 🔒 Prevent multiple clicks during save operation
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.disabled = true;
        nextBtn.classList.add('loading');
        
        // Store original content and add loading dots
        const originalContent = nextBtn.innerHTML;
        nextBtn.innerHTML = `
          <span class="button-text">Completing...</span>
          <div class="loading-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        `;
        
        try {
          await this.saveProfile();
        } catch (error) {
          console.error('❌ Profile save failed:', error);
          // Re-enable button on error
          nextBtn.disabled = false;
          nextBtn.classList.remove('loading');
          nextBtn.innerHTML = originalContent;
          throw error; // Re-throw to handle in calling context
        }
        // Note: Button stays disabled after successful save since user will be redirected
      }
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
      try {
        navigateTo("home");
      } catch (error) {
        console.error(
          "⚠️ SPA Router not available during skip! Cannot navigate to home.",
          error
        );
        // In Vite/SPA mode, we should never fall back to hard refresh
      }
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
      // Step 1: Avatar & bio (optional)
      nextBtn.textContent = "Next Step →";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled-state");
    } else if (this.currentStep === 2) {
      // Step 2: Schedule Import (optional, this is the new final step)
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
    const nextButton = document.getElementById("setup-next-btn");
    const finishButton = document.getElementById("finish-setup-button");

    if (prevBtn) {
      prevBtn.style.display = this.currentStep === 0 ? "none" : "flex";
    }

    if (skipBtn) {
      // Show skip button on step 0 and 1, hide on final step
      skipBtn.style.display =
        this.currentStep < this.totalSteps - 1 ? "flex" : "none";
    }

    if (nextButton) {
      nextButton.style.display = "inline-block";
    }

    if (finishButton) {
      if (this.currentStep === this.totalSteps - 1) {
        nextButton.style.display = "none";
        finishButton.style.display = "inline-block";
      } else {
        nextButton.style.display = "inline-block";
        finishButton.style.display = "none";
      }
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
   * Shows a success message that replaces the form content.
   * @param {string} message - The main message to display.
   * @param {string} subtitle - A subtitle for the message.
   */
  showSuccessMessage(
    message = "All Set! 🎉",
    subtitle = "Your profile is ready. Redirecting..."
  ) {
    if (this.dom.card) {
      this.dom.card.innerHTML = `
        <div class="setup-header">
          <div class="setup-title-section">
            <h1 class="setup-title">${message}</h1>
            <p class="setup-subtitle">${subtitle}</p>
          </div>
        </div>
        <div class="setup-body" style="display: flex; align-items: center; justify-content: center; min-height: 300px;">
          <div class="success-message">
            <div class="success-icon">
              <i class="fas fa-check-circle"></i>
            </div>
            <h3>Welcome Aboard!</h3>
            <p>Your profile has been set up successfully.</p>
            <div class="success-animation-overlay"></div>
          </div>
        </div>
      `;
    }
  }

  /**
   * =============================================================================
   *                        8. AVATAR MANAGEMENT SYSTEM & DATABASE OPERATIONS
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
    else if (!this.avatarConfig && avatarManager) {
      this.avatarConfig = avatarManager.generateDefaultAvatar(
        this.currentUser.uid
      );
    }
  }

  /**
   * Open avatar editor modal - SIMPLIFIED
   */
  openAvatarEditor() {
    if (!avatarManager) {
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
      avatarManager.generateDefaultAvatar(this.currentUser.uid);

    // Open avatar editor with callback
    avatarManager.openAvatarEditor(currentAvatar, async (newAvatarConfig) => {
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
    });
  }

  /**
   * Save avatar changes to Firestore and update the in-memory profile.
   * This ensures the UI updates immediately after a successful change.
   * @param {object} newAvatarConfig - The new avatar configuration object
   * @returns {Promise<void>}
   */
  async saveAvatarChange(newAvatarConfig) {
    try {
      // 🛡️ SAFEGUARD: Ensure avatar config is clean (should already be clean from avatar editor)
      console.log("🛡️ [ProfileSetup] Verifying avatar config is clean:", newAvatarConfig);
      const cleanedConfig = avatarManager.cleanAvatarConfig(newAvatarConfig);
      console.log("🛡️ [ProfileSetup] Verified clean avatar config:", cleanedConfig);

      // 1. Get the current profile and update avatarConfig
      const currentProfile = { ...currentUser.profile };
      const updatedProfile = {
        ...currentProfile,
        avatarConfig: cleanedConfig,
      };

      // 2. Save the updated profile to Firestore
      const result = await dataManager.saveUserProfile(
        currentUser.user.uid,
        updatedProfile
      );

      if (!result.success) {
        throw new Error(result.error || "Unknown error updating avatar");
      }

      // 3. Update the in-memory profile so the UI updates immediately
      currentUser.setProfile(updatedProfile);
      console.log("🎨 Avatar updated in currentUser store");

      // 4. 🔄 NEW: Sync cached user data so friends see avatar changes immediately
      // Using centralized cache sync for consistency and reliability
      syncUserDataCache(this.currentUser.uid)
        .then(() => console.log("✅ Friends will see your cleaned avatar in real-time!"))
        .catch((err) => console.log("⚠️ Avatar cache update failed (but profile saved):", err));

      // 5. 🎯 CRITICAL: Dispatch avatar change event to refresh menu immediately
      console.log("🚀 Dispatching avatar:changed event for menu refresh...");
      document.dispatchEvent(
        new CustomEvent("avatar:changed", {
          detail: { 
            userData: updatedProfile,
            avatarConfig: cleanedConfig,
            timestamp: Date.now()
          }
        })
      );

      // 6. 🛡️ FALLBACK: Also try direct force refresh as backup
      try {
        // Dynamic import to avoid circular dependencies
        const { forceAvatarRefresh } = await import("../../components/navigation/Menu.js");
        if (typeof forceAvatarRefresh === 'function') {
          forceAvatarRefresh(updatedProfile);
          console.log("✅ Direct avatar refresh fallback called");
        }
      } catch (error) {
        console.log("⚠️ Direct avatar refresh fallback failed (not critical):", error);
      }

      // Optionally, show a success message or trigger a UI update here
      // showFormSuccess("profile-form", "Avatar updated successfully!");
    } catch (error) {
      console.error("❌ Failed to update avatar:", error);
      // Optionally, show an error message to the user
      // showFormError("profile-form", "Failed to update avatar. Please try again.");
      throw error;
    }
  }

  /**
   * Save the complete profile to Firebase Firestore and schedule to localStorage
   */
  async saveProfile() {
    try {
      // 🎯 Create clean profile data with only essential fields (no schedule data)
      const cleanProfileData = {
        firstName: this.profileData.firstName,
        lastName: this.profileData.lastName,
        email: this.profileData.email,
        studentId: this.profileData.studentId,
        startingYear: this.profileData.startingYear,
        major: this.profileData.major,
        bio: this.profileData.bio || "",
        displayName:
          this.profileData.firstName ||
          this.profileData.email?.split("@")[0] ||
          "User",
      };

      // 🎯 FIXED: Only include clean profile data to avoid Firestore nested arrays error
      const profileDataForFirestore = {
        profile: cleanProfileData,
        universityInfo: {
          university: this.currentUser.email.split("@")[1].split(".")[0],
          universityName: "Independent University, Bangladesh",
          studentId: this.profileData.studentId,
        },
        avatarConfig: this.avatarConfig,
        systemInfo: {
          profileSetupComplete: true,
          status: "offline",
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        },
      };

      console.log("💾 Saving profile to Firestore...", {
        userId: this.currentUser.uid,
        profileData: this.profileData,
      });

      // Save profile to Firestore (without schedule data)
      await dataManager.saveUserProfile(this.currentUser.uid, profileDataForFirestore);

      console.log("✅ Profile saved successfully to Firestore");

      // 🎯 Phase-1: Save schedule to Firestore using ScheduleStorageService
      if (this.scheduleData && this.scheduleData.courses && this.scheduleData.courses.length > 0) {
        await this.saveScheduleToFirestore();
        console.log("📅 Schedule saved to Firestore with dual storage strategy");
      }

      // 🔄 NEW: Sync cached user data so friends see changes immediately
      const userInfoForCache = {
        displayName: cleanProfileData.displayName,
        major: cleanProfileData.major,
        university: this.currentUser.email.split("@")[1].split(".")[0],
        avatarConfig: this.avatarConfig,
      };

      // Update cache in background (don't wait for it)
      syncUserDataCache(this.currentUser.uid, userInfoForCache)
        .then(() => console.log("✅ Friends will see your updated info!"))
        .catch((err) =>
          console.log("⚠️ Cache update failed, but profile saved:", err)
        );

      // 🎯 CRITICAL FIX: Update currentUser store with fresh profile data immediately
      console.log(
        "🔄 Updating currentUser store with fresh profile data after save..."
      );

      // Use the imported currentUser module, not window.currentUser
      if (currentUser && typeof currentUser.setProfile === "function") {
        currentUser.setProfile(profileDataForFirestore);
        console.log("✅ currentUser store updated with fresh profile data");
      } else {
        console.error("❌ currentUser store not available for profile update");
      }

      // Show success message and then dispatch event for SPA navigation
      this.showSuccessMessage();

      // Dispatch event after a short delay so the router handles navigation
      setTimeout(() => {
        console.log(
          "🚀 Dispatching profile:setup:complete event for navigation..."
        );
        document.dispatchEvent(
          new CustomEvent("profile:setup:complete", {
            detail: { userData: profileDataForFirestore },
          })
        );
      }, 1500); // 1.5-second delay
    } catch (error) {
      console.error("❌ Final profile save failed:", error);
      alert(
        "Oh no! Something went wrong while saving your profile. Please check your connection and try again."
      );
    }
  }

  /**
   * Save imported schedule to Firestore using Phase-1 ScheduleStorageService
   * Uses dual storage strategy (Firestore + localStorage cache)
   */
  async saveScheduleToFirestore() {
    try {
      if (!this.scheduleData || !this.scheduleData.courses || this.scheduleData.courses.length === 0) {
        console.log("⚠️ No schedule data to save");
        return;
      }

      const userId = this.currentUser.uid;
      
      console.log("📅 Saving imported schedule to Firestore:", {
        userId,
        coursesImported: this.scheduleData.courses.length,
        importSource: 'profile_setup'
      });

      // The scheduleData from ScheduleImportService is already in the correct format:
      // { schedule: 7x7 matrix, slotInfo: 7x7 matrix, courses: array, importedAt: timestamp }
      
      // Add import metadata for tracking
      const scheduleDataWithMetadata = {
        ...this.scheduleData,
        metadata: {
          importSource: 'profile_setup',
          importMethod: this.scheduleData.importedAt ? 'text' : 'manual',
          coursesCount: this.scheduleData.courses?.length || 0,
          importedAt: this.scheduleData.importedAt || new Date().toISOString()
        }
      };

      // Use ScheduleStorageService for Phase-1 dual storage strategy
      const success = await scheduleStorageService.saveUserSchedule(userId, scheduleDataWithMetadata);
      
      if (success) {
        console.log("✅ Schedule saved successfully with dual storage strategy");
        
        // Update currentUser store with schedule data
        currentUser.setScheduleData(scheduleDataWithMetadata);
        currentUser.setScheduleLastSynced(new Date());
        currentUser.clearScheduleError();
      } else {
        throw new Error("ScheduleStorageService returned false");
      }

    } catch (error) {
      console.error("❌ Failed to save schedule to Firestore:", error);
      
      // Update error state in userStore
      currentUser.setScheduleError(error.message);
      
      // Don't throw error - profile saving should still succeed even if schedule save fails
      console.warn("⚠️ Profile setup will continue despite schedule save failure");
    }
  }

  /**
   * =============================================================================
   *                      9. EVENT LISTENERS & DOM MANIPULATION
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
    const parseScheduleBtn = document.getElementById("parse-schedule-btn");
    const scheduleTextInput = document.getElementById("schedule-text-input");
    const scheduleImageInput = document.getElementById("schedule-image-input");
    const scheduleUploadArea = document.getElementById("schedule-upload-area");

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

    // 🎯 NEW: Schedule import event listeners
    if (parseScheduleBtn && !parseScheduleBtn.hasAttribute("data-listener-attached")) {
      parseScheduleBtn.addEventListener("click", () => this.handleScheduleParsing());
      parseScheduleBtn.setAttribute("data-listener-attached", "true");
    }

    if (scheduleUploadArea && !scheduleUploadArea.hasAttribute("data-listener-attached")) {
      scheduleUploadArea.addEventListener("click", () => {
        if (scheduleImageInput) scheduleImageInput.click();
      });
      scheduleUploadArea.setAttribute("data-listener-attached", "true");
    }

    if (scheduleImageInput && !scheduleImageInput.hasAttribute("data-listener-attached")) {
      scheduleImageInput.addEventListener("change", (e) => this.handleImageUpload(e));
      scheduleImageInput.setAttribute("data-listener-attached", "true");
    }

    // Privacy controls have been moved to Friends page for better UX

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
   *                       10. SCHEDULE IMPORT METHODS
   * =============================================================================
   */

  /**
   * Handle schedule text parsing when user clicks "Parse Schedule"
   */
  async handleScheduleParsing() {
    const textInput = document.getElementById("schedule-text-input");
    const parseBtn = document.getElementById("parse-schedule-btn");
    const statusDiv = document.getElementById("import-status");
    const previewDiv = document.getElementById("schedule-preview");

    if (!textInput || !textInput.value.trim()) {
      this.showScheduleError("Please enter some schedule text to parse.");
      return;
    }

    try {
      // Show processing status
      this.showScheduleStatus("Parsing your schedule...");
      parseBtn.disabled = true;
      parseBtn.textContent = "Processing...";

      // Process the schedule text
      const result = await this.scheduleImportService.processScheduleText(textInput.value);

      if (result.success) {
        // Store the schedule data
        this.scheduleData = result.scheduleData;
        
        // Show preview
        this.showSchedulePreview(result);
        
        // Hide status
        this.hideScheduleStatus();
        
        console.log("✅ Schedule parsed successfully:", result);
      } else {
        this.showScheduleError(`Failed to parse schedule: ${result.error}`);
      }
    } catch (error) {
      console.error("❌ Schedule parsing error:", error);
      this.showScheduleError("An error occurred while parsing your schedule. Please try again.");
    } finally {
      parseBtn.disabled = false;
      parseBtn.innerHTML = '<i class="fas fa-search"></i> Parse Schedule';
    }
  }

  /**
   * Handle image upload for OCR processing
   */
  async handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Prevent double-processing by checking if we're already processing
    if (this.isProcessingImage) {
      console.log('🚫 Already processing an image, ignoring duplicate request');
      return;
    }

    this.isProcessingImage = true;

    try {
      // Quick check if OCR is likely to work
      if (!this.isOcrLikelySupported()) {
        throw new Error('Image upload requires a modern browser with web worker support. Please use text paste instead.');
      }
      
      // Show processing status
      this.showScheduleStatus('Uploading image...', 'info');
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select a valid image file (PNG, JPG, etc.)');
      }
      
      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Image file is too large. Please use an image smaller than 10MB.');
      }
      
      // Process image with OCR
      const result = await this.scheduleImportService.processScheduleImage(
        file, 
        (message, progress) => {
          this.showScheduleStatus(message, 'info', progress);
        }
      );
      
      if (result.success) {
        this.scheduleData = result.scheduleData;
        
        // Check if any courses were actually found
        const courseCount = result.validationResult?.validatedCourses?.length || 0;
        
        if (courseCount > 0) {
          // Success with courses found
          this.showSchedulePreview(result);
          const ocrInfo = `✅ Found ${courseCount} courses! OCR completed with ${result.ocrConfidence}% confidence.`;
          this.showScheduleStatus(ocrInfo, 'success');
          console.log('🎉 Image processing successful! Courses found:', courseCount);
        } else {
          // Success but no courses found - provide helpful guidance
          this.showSchedulePreview(result); // Still show empty preview
          const helpMessage = `📷 OCR completed (${result.ocrConfidence}% confidence) but no courses detected. Try:\n• Taking a clearer photo\n• Ensuring good lighting\n• Cropping to show only the schedule table\n• Or paste the text manually instead`;
          this.showScheduleStatus(helpMessage, 'info');
          console.log('ℹ️ OCR successful but no courses parsed. Raw text:', result.extractedText || 'No text extracted');
        }
      } else {
        throw new Error(result.error || 'Failed to process image');
      }
      
    } catch (error) {
      console.error('Image upload failed:', error);
      
      // Provide helpful error messages based on the error type
      let errorMessage = `Image processing failed: ${error.message}`;
      
      if (error.message.includes('security settings') || error.message.includes('CSP')) {
        errorMessage = 'Image upload blocked by browser security. Please refresh the page and try again, or use text paste instead.';
      } else if (error.message.includes('not supported')) {
        errorMessage = 'Image upload not supported in this browser. Please use text paste instead.';
      } else if (error.message.includes('too large')) {
        errorMessage = 'Image file is too large. Please use an image smaller than 10MB.';
      } else if (error.message.includes('valid image')) {
        errorMessage = 'Please select a valid image file (PNG, JPG, etc.).';
      }
      
      this.showScheduleError(errorMessage);
      
      // Clear the file inputCAn 
      event.target.value = '';
    } finally {
      // Always reset the processing flag
      this.isProcessingImage = false;
    }
  }

  /**
   * Show schedule processing status with optional progress and type
   * @param {string} message - Status message to display
   * @param {string} type - Status type: 'info', 'success', 'error' (default: 'info')
   * @param {number} progress - Progress percentage 0-100 (optional)
   */
  showScheduleStatus(message, type = 'info', progress = null) {
    const statusDiv = document.getElementById("import-status");
    const statusText = document.getElementById("status-text");
    
    if (statusDiv && statusText) {
      statusText.textContent = message;
      statusDiv.classList.remove("hidden");
      
      // Update status styling based on type
      statusDiv.className = statusDiv.className.replace(/status-(info|success|error)/g, '');
      statusDiv.classList.add(`status-${type}`);
      
      // Show progress if provided
      if (progress !== null && progress >= 0 && progress <= 100) {
        const progressText = ` (${Math.round(progress)}%)`;
        if (!message.includes('%')) {
          statusText.textContent = message + progressText;
        }
      }
    }
  }

  /**
   * Hide schedule processing status
   */
  hideScheduleStatus() {
    const statusDiv = document.getElementById("import-status");
    if (statusDiv) {
      statusDiv.classList.add("hidden");
    }
  }

  /**
   * Quick check if OCR is likely to be supported
   * @returns {boolean} Whether OCR features might work
   */
  isOcrLikelySupported() {
    try {
      // Check for Worker support
      if (typeof Worker === 'undefined') {
        console.warn('Web Workers not supported - OCR will fail');
        return false;
      }
      
      // Check for blob URL support
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        console.warn('Blob URLs not supported - OCR will fail');
        return false;
      }
      
      // Check for Canvas support
      if (typeof document === 'undefined' || !document.createElement) {
        console.warn('Canvas not supported - OCR will fail');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('OCR support check failed:', error);
      return false;
    }
  }

  /**
   * Show schedule error message
   */
  showScheduleError(message) {
    this.hideScheduleStatus();
    
    // Show error using existing error system or simple alert for now
    console.error("Schedule Import Error:", message);
    alert(message); // TODO: Replace with better error UI
  }

  /**
   * Show schedule preview with parsed courses
   */
  showSchedulePreview(result) {
    const previewDiv = document.getElementById("schedule-preview");
    const coursesFound = document.getElementById("courses-found");
    const previewContent = document.getElementById("preview-content");

    if (!previewDiv || !coursesFound || !previewContent) return;

    // Update stats
    coursesFound.textContent = `${result.stats.validCourses} courses found`;

    // Generate course cards
    const courseCards = result.validationResult.validatedCourses.map(course => `
      <div class="course-card">
        <div class="course-header">
          <span class="course-code">${course.courseCode}</span>
          <span class="course-credits">${course.credits} cr</span>
        </div>
        <h4 class="course-name">${course.courseName}</h4>
        <div class="course-details">
          <div class="time-info">
            <span class="days">${course.days.join(', ')}</span>
            <span class="time">${course.startTime} - ${course.endTime}</span>
          </div>
          <div class="location-info">
            <span class="room">Room: ${course.room}</span>
          </div>
        </div>
      </div>
    `).join('');

    previewContent.innerHTML = courseCards;
    previewDiv.classList.remove("hidden");
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

  // handlePrivacyChange method removed - privacy controls moved to Friends page

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
    if (!this.avatarConfig || !avatarManager) {
      renderInitials();
      return;
    }

    // Try to generate avatar image URL
    let avatarUrl = "";
    try {
      avatarUrl = avatarManager.generateAvatarUrl(this.avatarConfig);
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

  /**
   * Caches frequently accessed DOM elements for performance.
   */
  cacheDOMElements() {
    this.dom = {
      // Form fields
      firstName: document.getElementById("setup-first-name"),
      lastName: document.getElementById("setup-last-name"),
      email: document.getElementById("setup-email"),
      studentId: document.getElementById("setup-student-id"),
      startingYear: document.getElementById("setup-starting-year"),
      major: document.getElementById("setup-major"),
      bio: document.getElementById("setup-bio"),
      bioCount: document.getElementById("bio-count"),

      // Buttons
      nextButton: document.getElementById("setup-next-btn"),
      prevButton: document.getElementById("setup-prev-btn"),
      finishButton: document.getElementById("finish-setup-button"),
      skipButton: document.getElementById("setup-skip-btn"),

      // Containers and structural elements
      card: document.querySelector(".profile-setup-card"),
      body: document.querySelector(".setup-body"),
      stepsContainer: document.querySelector(".setup-steps"),
      stepIndicators: document.querySelectorAll(".step-indicator"),
      stepTitle: document.querySelector(".step-title"),
      formSteps: document.querySelectorAll(".form-step"),
      avatarEditorTrigger: document.querySelector(".avatar-editor-trigger"),
      avatarPreview: document.querySelector(".avatar-preview-container"),
      form: document.querySelector(".profile-setup-form"),
    };
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
      if (authManager && typeof authManager.getCurrentUser === "function") {
        console.log("✅ Auth manager is ready!");
        resolve(authManager);
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
  const currentUser = authManager.getCurrentUser();
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
  authManager.onAuthStateChanged((user) => {
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
      navigateTo("home");
    }
  }, 2000);
}

/**
 * Main initialization function for profile setup
 */
function initializeProfileSetup() {
  console.log("🚀 [DEBUG] initializeProfileSetup triggered.");
  if (!window.profileSetupInstance) {
    console.log("🚀 [DEBUG] No ProfileSetup instance found, creating one.");
    window.profileSetupInstance = new ProfileSetup();
  }

  // Trigger the initialization process.
  // This is now the official entry point.
  window.profileSetupInstance.initializeWhenReady();
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
