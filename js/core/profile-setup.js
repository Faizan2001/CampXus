// CampXus Profile Setup - Simple Standalone Implementation
class ProfileSetup {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 3; // Basic Info, Profile Pic/Bio, Preferences
    this.currentUser = null;
    this.profileData = {};
    this.profilePictureFile = null;

    // Initialize the setup
    this.checkAuthentication();
  }

  async checkAuthentication() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        console.log("✅ User authenticated:", user.email);
        this.initializeSetup();
      } else {
        // Redirect to main app if not authenticated
        console.log("❌ No user authenticated, redirecting...");
        window.location.href = "../index.html";
      }
    });
  }

  initializeSetup() {
    console.log("🎯 Initializing profile setup...");

    // Pre-fill email
    const emailInput = document.getElementById("setup-email");
    if (emailInput && this.currentUser) {
      emailInput.value = this.currentUser.email;
      console.log("✅ Email populated:", this.currentUser.email);
    }

    // Setup all event listeners
    this.setupEventListeners();

    // Initialize display and validation
    this.updateStepDisplay();
    this.updateProgress();
    this.validateCurrentStep();

    console.log("✅ Profile setup initialized");
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
      nextBtn.addEventListener("click", () => {
        console.log("🖱️ Next button clicked");
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

  setupFormValidation() {
    const requiredFieldsStep0 = [
      "setup-first-name",
      "setup-last-name",
      "setup-graduation-year",
      "setup-major",
    ];
    // Step 1 (Profile Pic/Bio) is optional.
    const requiredFieldsStep2 = ["setup-timezone"];

    const allFields = [...requiredFieldsStep0, ...requiredFieldsStep2];

    allFields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener("input", () => this.validateCurrentStep());
        field.addEventListener("blur", () => this.validateCurrentStep()); // Validate on blur too
      }
    });
  }

  validateCurrentStep() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (!nextBtn) return;

    let buttonText = "Next Step";

    if (this.currentStep === 0) {
      // Step 1: Basic Info
      const firstName =
        document.getElementById("setup-first-name")?.value.trim() || "";
      const lastName =
        document.getElementById("setup-last-name")?.value.trim() || "";
      const graduationYear =
        document.getElementById("setup-graduation-year")?.value || "";
      const major = document.getElementById("setup-major")?.value.trim() || "";

      const hasRequiredFields =
        firstName && lastName && graduationYear && major;
      buttonText = hasRequiredFields ? "Next Step →" : "Next Step →";
    } else if (this.currentStep === 1) {
      // Step 2: Profile picture/bio (optional)
      buttonText = "Next Step →";
    } else if (this.currentStep === 2) {
      // Step 3: Preferences (final step)
      const timezone = document.getElementById("setup-timezone")?.value || "";
      buttonText = timezone ? "Complete Setup!" : "Complete Setup!";
    }

    // Update button text
    if (nextBtn.textContent !== buttonText) {
      nextBtn.textContent = buttonText;
    }

    // Keep button enabled for better UX - validation happens in nextStep
    nextBtn.disabled = false;
  }

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
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];

    if (file.size > maxSize) {
      alert("Image too large! Please choose an image smaller than 5MB.");
      event.target.value = ""; // Reset file input
      if (preview) preview.innerHTML = "👤";
      this.profilePictureFile = null;
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      alert("Invalid file type. Please choose a JPG, PNG, or GIF image.");
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
    const nextBtn = document.getElementById("setup-next-btn");

    if (this.currentStep === 0) {
      // Validate Step 1 (Basic Info)
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const graduationYear = document.getElementById(
        "setup-graduation-year"
      ).value;
      const major = document.getElementById("setup-major").value.trim();

      if (!firstName || !lastName || !graduationYear || !major) {
        // Show validation message
        if (nextBtn) {
          const originalText = nextBtn.textContent;
          nextBtn.textContent = "Please fill required fields";
          nextBtn.style.background = "#ef4444";
          setTimeout(() => {
            nextBtn.textContent = originalText;
            nextBtn.style.background = "";
          }, 2000);
        }
        return false;
      }
    } else if (this.currentStep === 2) {
      // Validate Step 3 (Preferences)
      const timezone = document.getElementById("setup-timezone").value;
      if (!timezone) {
        if (nextBtn) {
          const originalText = nextBtn.textContent;
          nextBtn.textContent = "Please select timezone";
          nextBtn.style.background = "#ef4444";
          setTimeout(() => {
            nextBtn.textContent = originalText;
            nextBtn.style.background = "";
          }, 2000);
        }
        return false;
      }
    }
    // Step 2 (Profile pic/bio) is optional, so no validation needed

    return true;
  }

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
        .value.trim();
      this.profileData.graduationYear = document.getElementById(
        "setup-graduation-year"
      ).value;
      this.profileData.major = document
        .getElementById("setup-major")
        .value.trim();
    } else if (this.currentStep === 1) {
      this.profileData.bio = document.getElementById("setup-bio").value.trim();
      // Profile picture file is handled by this.profilePictureFile
    } else if (this.currentStep === 2) {
      this.profileData.timezone =
        document.getElementById("setup-timezone").value;
      this.profileData.theme = document.getElementById("setup-theme").value;
      this.profileData.notifications = {
        scheduleUpdates: document.getElementById("notify-schedule-updates")
          .checked,
        friendRequests: document.getElementById("notify-friend-requests")
          .checked,
        campusEvents: document.getElementById("notify-campus-events").checked,
      };
    }
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
    const progress = ((this.currentStep + 1) / this.totalSteps) * 100;
    const progressBar = document.querySelector(".setup-progress-bar");
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

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
      `📊 Progress: Step ${this.currentStep + 1}/${
        this.totalSteps
      } (${progress.toFixed(0)}%)`
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

      // Redirect to main app after a short delay
      setTimeout(() => {
        window.location.href = "../index.html";
      }, 2500);
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

      // Redirect to main app
      window.location.href = "../index.html";
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
  // Ensure Firebase is initialized before creating ProfileSetup
  if (typeof firebase !== "undefined" && firebase.app) {
    new ProfileSetup();
  } else {
    console.error(
      "Firebase not initialized. Please check firebase configuration."
    );
    // Show error message to user
    const setupCard = document.querySelector(".profile-setup-card");
    if (setupCard) {
      setupCard.innerHTML = `
        <div class="setup-header">
          <div class="setup-title-section">
            <h1 class="setup-title">Connection Error</h1>
            <p class="setup-subtitle">Unable to connect to services</p>
          </div>
        </div>
        <div class="setup-body" style="text-align: center; padding: 2rem;">
          <div style="background: #fee; border: 1px solid #fcc; border-radius: 8px; padding: 1rem;">
            <div style="font-size: 3rem; color: #c33; margin-bottom: 1rem;">
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3 style="color: #c33; margin-bottom: 0.5rem;">Connection Failed</h3>
            <p style="color: #c33; margin: 0;">
              Could not connect to services. Please check your internet connection or contact support.
            </p>
          </div>
        </div>
      `;
    }
  }
});
