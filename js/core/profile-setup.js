// CampXus Profile Setup - Simple Firebase Implementation
class ProfileSetup {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 3; // Corresponds to 3 steps: Basic Info, Profile Pic/Bio, Preferences
    this.currentUser = null;
    this.profileData = {};
    this.profilePictureFile = null;

    this.checkAuthentication();
  }

  async checkAuthentication() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        this.checkIfProfileComplete();
      } else {
        // If not authenticated, redirect to the main page which should handle login
        window.location.href = "../index.html"; // Adjusted path
      }
    });
  }

  async checkIfProfileComplete() {
    try {
      const userDoc = await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.profileSetupComplete) {
          // Changed from profileComplete
          // If profile is complete, redirect to dashboard (assuming dashboard.html is in root)
          window.location.href = "../index.html"; // Or your main dashboard page
          return;
        }
      }
      // If profile doesn't exist or is not complete, show the setup wizard
      this.showSetupWizard();
    } catch (error) {
      console.error("Error checking profile:", error);
      // Fallback to showing setup wizard in case of error
      this.showSetupWizard();
    }
  }

  showSetupWizard() {
    const overlay = document.getElementById("profile-setup-overlay");
    if (overlay) {
      overlay.classList.add("active");
    }

    const emailInput = document.getElementById("setup-email");
    if (emailInput && this.currentUser) {
      emailInput.value = this.currentUser.email;
    }

    this.setupEventListeners();
    this.updateStepDisplay(); // Call this to set initial button states
    this.updateProgress();
    this.validateCurrentStep(); // And validate to set initial button text/state
  }

  setupEventListeners() {
    const nextBtn = document.getElementById("setup-next-btn");
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");
    const pictureUpload = document.getElementById("profile-picture-upload");
    const bioInput = document.getElementById("setup-bio");

    if (nextBtn) {
      nextBtn.addEventListener("click", () => this.nextStep());
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

    let isValid = false;
    let buttonText = "Next Step →";

    if (this.currentStep === 0) {
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const graduationYear = document.getElementById(
        "setup-graduation-year"
      ).value;
      const major = document.getElementById("setup-major").value.trim();
      isValid = !!(firstName && lastName && graduationYear && major);
      buttonText = isValid ? "Next Step →" : "Fill Required Fields";
    } else if (this.currentStep === 1) {
      // Bio/Profile picture step is optional, so it's always "valid" to proceed
      isValid = true;
      buttonText = "Complete Setup →";
    } else if (this.currentStep === 2) {
      // Final step - Preferences
      const timezone = document.getElementById("setup-timezone").value;
      isValid = !!timezone;
      buttonText = isValid ? "Start Using CampXus!" : "Select Timezone";
    }

    nextBtn.disabled = !isValid;
    nextBtn.textContent = buttonText;
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
        preview.innerHTML = `<img src="\${e.target.result}" alt="Profile Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      }
    };
    reader.readAsDataURL(file);
  }

  async nextStep() {
    // First, ensure current step is valid before proceeding (though button should be disabled if not)
    this.validateCurrentStep();
    const nextBtn = document.getElementById("setup-next-btn");
    if (nextBtn && nextBtn.disabled) {
      // If button is disabled, means validation failed.
      // We could shake the button or show a more prominent message.
      // For now, just return.
      return;
    }

    this.collectCurrentStepData(); // Collect data before incrementing step

    if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep(); // Validate the new current step
    } else {
      // This is the final step, attempt to save the profile
      await this.saveProfile();
    }
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
      `\[data-step="\${this.currentStep}"]`
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

    // The document mentions updating a .setup-step-counter, but it's not in the HTML.
    // If you add <span class="setup-step-counter"></span> to your .setup-header, this will work:
    const stepCounterElement = document.querySelector(".setup-step-counter");
    if (stepCounterElement) {
      stepCounterElement.textContent = `Step \${this.currentStep + 1} of \${this.totalSteps}`;
    }
  }

  async saveProfile() {
    const nextBtn = document.getElementById("setup-next-btn");
    const originalText = nextBtn ? nextBtn.textContent : "Start Using CampXus!";
    if (nextBtn) {
      nextBtn.textContent = "Saving...";
      nextBtn.disabled = true;
    }

    // Ensure data from the final step is collected if not already
    this.collectCurrentStepData();

    try {
      let profilePictureUrl = this.profileData.profilePictureUrl || null; // Preserve if already set from a previous attempt
      if (this.profilePictureFile) {
        profilePictureUrl = await this.uploadProfilePicture();
      }

      const userData = {
        ...this.profileData, // Contains data from all steps
        uid: this.currentUser.uid, // Add UID for easier querying if needed
        profilePictureUrl: profilePictureUrl,
        profileSetupComplete: true, // Changed from profileComplete
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      };
      // Remove undefined fields that might have been added if some optional fields were skipped
      Object.keys(userData).forEach(
        (key) => userData[key] === undefined && delete userData[key]
      );

      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .set(userData, { merge: true }); // Use merge:true to avoid overwriting existing fields if any

      this.showSuccessMessage();
      setTimeout(() => {
        window.location.href = "../index.html"; // Redirect to dashboard or main app page
      }, 2500); // Slightly longer for user to read success message
    } catch (error) {
      console.error("Error saving profile:", error);
      alert(
        "Oh no! Something went wrong while saving your profile. Please check your connection and try again. If the problem persists, contact support."
      );
      if (nextBtn) {
        nextBtn.textContent = originalText; // Reset button text
        nextBtn.disabled = false; // Re-enable button
      }
    }
  }

  async uploadProfilePicture() {
    if (!this.profilePictureFile || !this.currentUser) {
      return null;
    }
    const filePath = `profilePictures/\${this.currentUser.uid}/\${this.profilePictureFile.name}`;
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

  async skipSetup() {
    // If user skips, we still want to create a basic document for them
    // so they don't get prompted again immediately, but mark profile as incomplete.
    const nextBtn = document.getElementById("setup-next-btn");
    if (nextBtn) nextBtn.disabled = true; // Disable buttons during skip

    try {
      const userData = {
        uid: this.currentUser.uid,
        email: this.currentUser.email, // Save email at least
        profileSetupComplete: false, // Changed from profileComplete
        skippedSetupAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .set(userData, { merge: true }); // Merge to not overwrite if some partial data exists

      // Redirect to dashboard or main app page
      window.location.href = "../index.html";
    } catch (error) {
      console.error("Error during skip setup:", error);
      alert("Could not process skip action. Please try again.");
      if (nextBtn) nextBtn.disabled = false;
    }
  }

  showSuccessMessage() {
    const setupContainer = document.querySelector(".setup-container");
    if (setupContainer) {
      // Clear existing content and show success
      setupContainer.innerHTML = `
        <div class="setup-header" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
          <div class="setup-title">All Set! 🎉</div>
          <div class="setup-subtitle">Your CampXus profile is ready.</div>
        </div>
        <div class="setup-body" style="text-align: center; padding: 3rem;">
          <span class="step-icon" style="font-size: 4rem; color: #10B981;">🚀</span>
          <h3 class="step-title" style="font-size: 1.8rem; margin-top: 1rem;">Welcome Aboard!</h3>
          <p class="step-description" style="font-size: 1.1rem; margin-top: 0.5rem;">
            You'll be redirected to your dashboard shortly.
          </p>
        </div>
      `;
    }
  }
}

// Initialize profile setup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Ensure Firebase is initialized before creating ProfileSetup
  // This assumes firebase-config.js handles initialization and is loaded before this script.
  if (typeof firebase !== "undefined" && firebase.app) {
    new ProfileSetup();
  } else {
    console.error(
      "Firebase not initialized. Make sure firebase-config.js is loaded and configured correctly before profile-setup.js"
    );
    // Optionally, display an error to the user on the page
    const overlay = document.getElementById("profile-setup-overlay");
    if (overlay) {
      overlay.classList.add("active"); // Show the container
      const container = document.querySelector(".setup-container");
      if (container) {
        container.innerHTML = `
                <div class="setup-header" style="background: #EF4444;">
                    <div class="setup-title">Initialization Error</div>
                </div>
                <div class="setup-body" style="text-align: center; padding: 2rem;">
                    <p class="step-description" style="color: #B91C1C;">
                        Could not connect to services. Please check your internet connection or contact support if the issue persists.
                    </p>
                </div>
            `;
      }
    }
  }
});
