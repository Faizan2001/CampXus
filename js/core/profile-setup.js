// CampXus Profile Setup - Simple Standalone Implementation
class ProfileSetup {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 2; // Basic Info, Profile Pic/Bio
    this.currentUser = null;
    this.profileData = {};
    this.profilePictureFile = null;

    // Initialize the setup
    this.checkAuthentication();
  }

  async checkAuthentication() {
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
    // Fallback to old Firebase v8 syntax if auth manager not available
    else if (typeof firebase !== "undefined" && firebase.auth) {
      console.log("🔄 Using legacy Firebase auth");
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          this.currentUser = user;
          console.log("✅ User authenticated via legacy Firebase:", user.email);
          setTimeout(() => {
            this.initializeSetup();
          }, 100);
        } else {
          console.log("❌ No user authenticated, navigating to home...");
          if (window.spaRouter) {
            window.spaRouter.navigateTo("home");
          } else {
            window.location.href = "../index.html";
          }
        }
      });

      // Fallback: If no user after 3 seconds, try to get current user directly
      setTimeout(() => {
        if (!this.currentUser) {
          const user = firebase.auth().currentUser;
          if (user) {
            console.log("🔄 Fallback: Found current user", user.email);
            this.currentUser = user;
            this.initializeSetup();
          }
        }
      }, 3000);
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
        : "Your university email";
      console.log("✅ Email populated:", emailInput.value);
    }

    // Automatically extract and populate Student ID from email
    if (studentIdInput && this.currentUser.email) {
      const emailParts = this.currentUser.email.split("@");
      if (emailParts.length > 0) {
        studentIdInput.value = emailParts[0];
        studentIdInput.placeholder = isDev
          ? "Development ID (extracted)"
          : "Extracted from your email";
        console.log(
          "✅ Student ID extracted and populated:",
          studentIdInput.value
        );
      }
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
    const steps = document.querySelectorAll(".setup-step");
    steps.forEach((step) => step.classList.remove("active")); // More robust way to hide

    const currentStepElement = document.querySelector(
      `[data-step="${this.currentStep}"]`
    );
    if (currentStepElement) {
      currentStepElement.classList.add("active"); // More robust way to show
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
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Remove undefined fields
      Object.keys(userData).forEach(
        (key) => userData[key] === undefined && delete userData[key]
      );

      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .set(userData, { merge: true });

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
        skippedSetupAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .set(userData, { merge: true });

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
    const storageRef = firebase.storage().ref(filePath);

    try {
      const snapshot = await storageRef.put(this.profilePictureFile);
      const downloadURL = await snapshot.ref.getDownloadURL();
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

// Initialize profile setup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("🎯 Profile setup DOM loaded, checking auth system...");

  // Wait for auth system to be ready
  const initializeWhenReady = () => {
    // Check if auth manager is available and initialized
    if (window.authManager && window.authManager.currentUser !== undefined) {
      console.log("✅ Auth manager ready, initializing profile setup");
      new ProfileSetup();
    }
    // Check for legacy Firebase as fallback
    else if (typeof firebase !== "undefined" && firebase.app) {
      console.log("✅ Legacy Firebase ready, initializing profile setup");
      new ProfileSetup();
    }
    // Auth system not ready yet, wait a bit more
    else {
      console.log("⏳ Auth system not ready, retrying in 100ms...");
      setTimeout(initializeWhenReady, 100);
    }
  };

  initializeWhenReady();
});
