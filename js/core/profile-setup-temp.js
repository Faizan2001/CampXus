// CampXus Profile Setup - Fixed Version with Proper Auth Manager Loading

// Import Firebase functions we need - using import map from index.html
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage } from "../firebase/config/firebase-config.js";

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
    this.totalSteps = 2; // Basic Info, Profile Pic/Bio
    this.currentUser = null;
    this.profileData = {};
    this.profilePictureFile = null;

    // Store this instance globally to prevent duplicates
    profileSetupInstance = this;

    // Initialize the setup
    this.checkAuthentication();
  }

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

      // First, try to get current user immediately
      const currentUser = window.authManager.getCurrentUser();
      if (currentUser) {
        this.currentUser = currentUser;
        console.log("✅ Found immediate user:", this.currentUser.email);
        setTimeout(() => {
          this.initializeSetup();
        }, 100);
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
          setTimeout(() => {
            this.initializeSetup();
          }, 100);
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
        setTimeout(() => {
          this.initializeSetup();
        }, 100);
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

  initializeSetup() {
    console.log("🎯 Initializing profile setup...");
    console.log("🔍 Auth Manager available:", !!window.authManager);
    console.log("🔍 Current user:", this.currentUser?.email || "None");

    // Add debug info to page for development
    this.addDebugInfo();

    // Pre-fill email and student ID with better error handling
    this.prefillUserData();

    // Setup all event listeners
    this.setupEventListeners();

    // Initialize display and validation
    this.updateStepDisplay();
    this.updateProgress();
    this.validateCurrentStep();

    console.log("✅ Profile setup initialized");

    // Add diagnostic information for debugging display issues (with delay)
    setTimeout(() => {
      this.addDiagnosticInfo();
    }, 200);
  }

  // Add diagnostic method to check what's in the DOM
  addDiagnosticInfo() {
    console.log("🔍 DIAGNOSTIC: Profile setup DOM analysis");

    // Check main containers
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");
    const steps = document.querySelectorAll(".setup-step");

    console.log("📋 Profile card found:", !!profileCard);
    console.log("📋 Setup body found:", !!setupBody);
    console.log("📋 Total steps found:", steps.length);

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
    }
  }

  // Add debug information for development
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

  prefillUserData() {
    const emailInput = document.getElementById("setup-email");
    const studentIdInput = document.getElementById("setup-student-id");

    // If fields aren't available yet, retry after a short delay
    if (!emailInput || !studentIdInput) {
      console.log("🔄 Form fields not ready, retrying in 500ms...");
      setTimeout(() => this.prefillUserData(), 500);
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
    console.log("🔍 User object:", this.currentUser);

    // Check if this is a development email
    const isDev = this.isDevelopmentEmail(this.currentUser.email);
    console.log("🔧 Is development email?", isDev);

    // Pre-fill email
    if (emailInput) {
      emailInput.value = this.currentUser.email || "";
      emailInput.placeholder = isDev
        ? "Development email (auto-filled)"
        : "Your university email (auto-filled)";
      console.log("✅ Email populated:", emailInput.value);
    }

    // Automatically extract and populate Student ID from email
    if (studentIdInput && this.currentUser.email) {
      const emailParts = this.currentUser.email.split("@");
      if (emailParts.length > 0) {
        studentIdInput.value = emailParts[0];
        studentIdInput.placeholder = isDev
          ? "Development ID (extracted)"
          : "Student ID (extracted from email)";
        console.log(
          "✅ Student ID extracted and populated:",
          studentIdInput.value
        );
      }
    }

    // 🎉 SUCCESS LOG: Check if both fields were successfully populated
    if (emailInput.value && studentIdInput.value) {
      console.log(
        "🎉 SUCCESS: Both email and student ID fields have been successfully pre-filled!"
      );
      console.log(`📧 Email: ${emailInput.value}`);
      console.log(`🆔 Student ID: ${studentIdInput.value}`);
    }

    // Add visual indicators for readonly fields
    this.styleReadonlyFields();
  }

  // Add development email detection method
  isDevelopmentEmail(email) {
    const devPatterns = ["dev", "test", "fake", "demo"];
    return devPatterns.some((pattern) => email.toLowerCase().includes(pattern));
  }

  styleReadonlyFields() {
    const readonlyFields = document.querySelectorAll(".form-input[readonly]");
    readonlyFields.forEach((field) => {
      field.classList.add("readonly-field");
    });
  }

  setupEventListeners() {
    const nextBtn = document.getElementById("setup-next-btn");
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");
    const pictureUpload = document.getElementById("profile-picture-upload");
    const bioInput = document.getElementById("setup-bio");

    console.log("🔗 Setting up event listeners...");
    console.log("Next button found:", !!nextBtn);
    console.log("Previous button found:", !!prevBtn);
    console.log("Skip button found:", !!skipBtn);

    if (nextBtn) {
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
    }
    if (prevBtn) {
      prevBtn.addEventListener("click", () => this.prevStep());
    }
    if (skipBtn) {
      skipBtn.addEventListener("click", () => this.skipSetup());
    }
    if (pictureUpload) {
      pictureUpload.addEventListener("change", (e) =>
        this.handleProfilePictureUpload(e)
      );
    }
    if (bioInput) {
      bioInput.addEventListener("input", (e) => {
        const bioCount = document.getElementById("bio-count");
        if (bioCount) {
          bioCount.textContent = e.target.value.length;
        }
      });
    }
    this.setupFormValidation();
  }

  // Method to set up event listeners for form field validation
  setupFormValidation() {
    // Define required fields for the first step (Basic Information)
    const requiredFieldsStep0 = [
      "setup-first-name",
      "setup-last-name",
      "setup-starting-year", // Changed from setup-graduation-year
      "setup-major",
    ];
    // Step 1 (Profile Pic/Bio) is optional, so no specific required fields array here.

    // Attach event listeners to all fields in the first step for real-time validation
    requiredFieldsStep0.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener("input", () => this.validateCurrentStep());
        field.addEventListener("blur", () => this.validateCurrentStep()); // Validate on blur too
      }
    });
  }

  // Method to validate the current step's input fields
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
      // Step 1: Profile picture/bio (optional, this is the new final step)
      nextBtn.textContent = "Complete Setup!";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled-state");
    }
  }

  // Method to show visual feedback when disabled button is clicked
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

  // Method to handle profile picture upload
  handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    const preview = document.getElementById("profile-picture-preview");
    if (!file) {
      // If no file selected, or selection cancelled, reset to default
      if (preview) preview.innerHTML = "👤";
      this.profilePictureFile = null;
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ["image/jpeg", "image/png"]; // Removed "image/gif"

    if (file.size > maxSize) {
      alert("Image too large! Please choose an image smaller than 5MB.");
      event.target.value = ""; // Reset file input
      if (preview) preview.innerHTML = "👤";
      this.profilePictureFile = null;
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      alert("Invalid file type. Please choose a JPG or PNG image."); // Updated message
      event.target.value = ""; // Reset file input
      if (preview) preview.innerHTML = "👤";
      this.profilePictureFile = null;
      return;
    }

    this.profilePictureFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (preview) {
        preview.innerHTML = `<img src="${e.target.result}" alt="Profile Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      }
    };
    reader.readAsDataURL(file);
  }

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

  // Separate validation method for cleaner code
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

  // Method to navigate to the previous step
  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep(); // Validate the new current step
    }
  }

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
        // Changed from graduationYear
        "setup-starting-year"
      ).value;
      this.profileData.major = document
        .getElementById("setup-major")
        .value.trim();
    } else if (this.currentStep === 1) {
      this.profileData.bio = document.getElementById("setup-bio").value.trim();
      // Profile picture file is handled by this.profilePictureFile
    }
    // Removed old else if (this.currentStep === 2) block for Preferences data collection
  }

  updateStepDisplay() {
    console.log("🔄 Updating step display, current step:", this.currentStep);

    const steps = document.querySelectorAll(".setup-step");
    console.log("🔍 Found steps:", steps.length);

    steps.forEach((step) => step.classList.remove("active")); // More robust way to hide

    const currentStepElement = document.querySelector(
      `[data-step="${this.currentStep}"]`
    );

    if (currentStepElement) {
      console.log("✅ Found current step element, making it active");
      currentStepElement.classList.add("active"); // More robust way to show
    } else {
      console.error(
        "❌ Could not find step element for step:",
        this.currentStep
      );
    }

    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");
    const nextBtn = document.getElementById("setup-next-btn");

    if (prevBtn) {
      prevBtn.style.display = this.currentStep === 0 ? "none" : "flex"; // Use flex as it's a flex item
    }

    if (skipBtn) {
      // Show skip button on step 0 and 1, hide on step 2 (final confirmation)
      skipBtn.style.display =
        this.currentStep < this.totalSteps - 1 ? "flex" : "none";
    }

    // Next button text is handled by validateCurrentStep
    this.validateCurrentStep(); // Re-validate to update button text and state
  }

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
      let profilePictureUrl = null;
      if (this.profilePictureFile) {
        profilePictureUrl = await this.uploadProfilePicture();
      }

      const userData = {
        ...this.profileData,
        uid: this.currentUser.uid,
        email: this.currentUser.email,
        profilePictureUrl: profilePictureUrl,
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

  async uploadProfilePicture() {
    if (!this.profilePictureFile || !this.currentUser) {
      return null;
    }
    const filePath = `profilePictures/${this.currentUser.uid}/${this.profilePictureFile.name}`;
    const storageRef = ref(storage, filePath);

    try {
      const snapshot = await uploadBytes(storageRef, this.profilePictureFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      alert(
        "Could not upload your profile picture. Please try a different image or try again later."
      );
      return null;
    }
  }

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
}

// ===== SIMPLIFIED INITIALIZATION SYSTEM =====

// Global instance variable and initialization flag
let profileSetupInstance = null;
let initializationInProgress = false;

// Function to wait for auth manager
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

// Function to check authentication once auth manager is available
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
    profileSetupInstance = new ProfileSetup();
    return;
  }

  // No user signed in, listen for auth state changes
  console.log("👂 No user signed in, setting up auth state listener...");
  window.authManager.onAuthStateChanged((user) => {
    if (user && !profileSetupInstance) {
      console.log(
        "✅ User signed in via state change, initializing profile setup"
      );
      profileSetupInstance = new ProfileSetup();
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

// Simplified initialization function
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

// Helper function to retry auth detection for existing instance
function retryAuthDetection() {
  if (
    profileSetupInstance &&
    typeof profileSetupInstance.checkAuthentication === "function"
  ) {
    console.log("🔄 Retrying authentication detection for existing instance");
    profileSetupInstance.checkAuthentication();
  }
}

// 🎯 FIX #1: Listen for SPA navigation to profile page
document.addEventListener("spa:navigation", (event) => {
  if (event.detail.route === "profile") {
    console.log("🔄 Navigated to profile page via SPA...");

    // If profile setup instance doesn't exist, create it now
    if (!profileSetupInstance) {
      console.log("🎯 Profile setup not initialized, creating instance...");
      initializeProfileSetup();
    } else {
      console.log(
        "🔄 Profile setup already exists, skipping duplicate initialization"
      );
      // Don't retry auth detection - the instance should already be working
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
