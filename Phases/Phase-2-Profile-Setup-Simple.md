# Phase 2: User Profile Setup 👤✨

## Welcome to Profile Setup! 🚀

Welcome to Phase 2, where we help new CampXus users create their profiles and set up their schedules! Think of this phase as building a digital "Move-in Day" experience - helping students get settled into the app and ready to manage their university schedules.

## What We're Building 🎨

Imagine the first day at university where you meet new friends and share your class schedules. That's what we're building! After users sign in through Firebase Authentication, they'll go through a friendly setup process that:

### The Profile Setup Experience ✨

- **Basic Profile Information**: Collecting name, major, and graduation year
- **Profile Picture Upload**: Adding a photo with Firebase Storage
- **Schedule Import**: Helping users add their class schedules
- **Welcome Completion**: Celebrating their successful setup

## 🏗️ Simple Architecture

This phase uses standard Firebase features:

- **Client-Side**: Simple form handling and file uploads
- **Firebase Auth**: User authentication from Phase 1
- **Firestore**: Storing user profile data
- **Firebase Storage**: Handling profile picture uploads

## 📋 What You Need Before Starting

Make sure you've completed Phase 1:

- [ ] Firebase Authentication is working
- [ ] Users can sign in with email/password
- [ ] Firebase project is properly configured
- [ ] Firestore database is set up

## 🎯 Learning Goals

By the end of Phase 2, you'll know how to:

- **Create User Profiles**: Store additional user data in Firestore
- **Handle File Uploads**: Use Firebase Storage for profile pictures
- **Build Multi-step Forms**: Create a smooth onboarding experience
- **Update User Documents**: Work with Firestore document updates
- **Handle Form Validation**: Ensure data quality with simple checks

## 🛠️ Mission: Your Learning Adventures

### Adventure 1: Create the Profile Setup Interface 🎨

Time to create a friendly and welcoming profile setup experience! We're building a simple multi-step form that helps new users get started with CampXus.

#### 1.1 Create the Profile Setup Styles

Create `css/profile-setup.css`:

```css
/* CampXus Profile Setup - Simple and Friendly! */

.profile-setup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0;
  visibility: hidden;
  transition: all 0.4s ease;
}

.profile-setup-overlay.active {
  opacity: 1;
  visibility: visible;
}

.setup-container {
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  transform: scale(0.9) translateY(20px);
  transition: transform 0.4s ease;
}

.profile-setup-overlay.active .setup-container {
  transform: scale(1) translateY(0);
}

.setup-header {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: white;
  padding: 2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.setup-header::before {
  content: "";
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.1) 1px,
    transparent 1px
  );
  background-size: 30px 30px;
  animation: float 20s linear infinite;
}

.setup-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  position: relative;
}

.setup-subtitle {
  opacity: 0.9;
  font-size: 1.1rem;
  position: relative;
}

.setup-progress {
  background: rgba(255, 255, 255, 0.2);
  height: 6px;
  border-radius: 3px;
  margin-top: 1.5rem;
  overflow: hidden;
  position: relative;
}

.setup-progress-bar {
  background: white;
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;
  width: 0%;
}

.setup-body {
  padding: 2rem;
  max-height: 60vh;
  overflow-y: auto;
}

.setup-step {
  display: none;
  animation: slideInRight 0.4s ease;
}

.setup-step.active {
  display: block;
}

.step-header {
  text-align: center;
  margin-bottom: 2rem;
}

.step-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  display: block;
}

.step-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 0.5rem;
}

.step-description {
  color: #64748b;
  line-height: 1.6;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  font-size: 1rem;
  background: #fafafa;
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: #4f46e5;
  background: white;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.profile-picture-section {
  text-align: center;
  margin-bottom: 2rem;
}

.profile-picture-preview {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e5e7eb 0%, #f3f4f6 100%);
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: #9ca3af;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: all 0.3s ease;
}

.profile-picture-preview:hover {
  transform: scale(1.05);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.profile-picture-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-picture-upload {
  display: none;
}

.upload-button {
  background: #4f46e5;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-button:hover {
  background: #4338ca;
  transform: translateY(-1px);
}

.setup-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.setup-nav-button {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.setup-nav-button.primary {
  background: linear-gradient(135deg, #4f46e5, #3730a3);
  color: white;
}

.setup-nav-button.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

.setup-nav-button.secondary {
  background: #e2e8f0;
  color: #475569;
}

.setup-nav-button.secondary:hover {
  background: #cbd5e1;
}

.setup-nav-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Animations */
@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
  33% {
    transform: translate(30px, -30px) rotate(120deg);
  }
  66% {
    transform: translate(-20px, 20px) rotate(240deg);
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Mobile responsiveness */
@media (max-width: 640px) {
  .setup-container {
    width: 95%;
    margin: 1rem;
  }

  .setup-header,
  .setup-body,
  .setup-navigation {
    padding: 1.5rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
```

#### 1.2 Create the Profile Setup HTML Structure

Create `profile-setup.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Profile Setup - CampXus</title>
    <link rel="stylesheet" href="css/profile-setup.css" />
  </head>
  <body>
    <div id="profile-setup-overlay" class="profile-setup-overlay">
      <div class="setup-container">
        <div class="setup-header">
          <div class="setup-title">Welcome to CampXus! 👋</div>
          <div class="setup-subtitle">Let's set up your profile</div>
          <div class="setup-progress">
            <div class="setup-progress-bar"></div>
          </div>
        </div>

        <div class="setup-body">
          <!-- Step 1: Basic Information -->
          <div class="setup-step active" data-step="0">
            <div class="step-header">
              <span class="step-icon">👋</span>
              <h3 class="step-title">Tell us about yourself</h3>
              <p class="step-description">
                Let's start with the basics. This information will help other
                students recognize and connect with you.
              </p>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="setup-first-name"
                  >First Name</label
                >
                <input
                  type="text"
                  id="setup-first-name"
                  class="form-input"
                  placeholder="John"
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="setup-last-name"
                  >Last Name</label
                >
                <input
                  type="text"
                  id="setup-last-name"
                  class="form-input"
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="setup-email"
                >University Email</label
              >
              <input
                type="email"
                id="setup-email"
                class="form-input"
                readonly
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="setup-student-id"
                  >Student ID (Optional)</label
                >
                <input
                  type="text"
                  id="setup-student-id"
                  class="form-input"
                  placeholder="202X123456"
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="setup-graduation-year"
                  >Graduation Year</label
                >
                <select id="setup-graduation-year" class="form-input" required>
                  <option value="">Select Year</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                  <option value="2028">2028</option>
                  <option value="2029">2029</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="setup-major"
                >Major/Department</label
              >
              <input
                type="text"
                id="setup-major"
                class="form-input"
                placeholder="Computer Science & Engineering"
                required
              />
            </div>
          </div>

          <!-- Step 2: Profile Picture -->
          <div class="setup-step" data-step="1">
            <div class="step-header">
              <span class="step-icon">📸</span>
              <h3 class="step-title">Add your profile picture</h3>
              <p class="step-description">
                Help your fellow students recognize you! You can always change
                this later.
              </p>
            </div>

            <div class="profile-picture-section">
              <div class="profile-picture-preview" id="profile-picture-preview">
                👤
              </div>
              <input
                type="file"
                id="profile-picture-upload"
                class="profile-picture-upload"
                accept="image/*"
              />
              <button
                type="button"
                class="upload-button"
                onclick="document.getElementById('profile-picture-upload').click()"
              >
                Choose Photo
              </button>
              <p style="color: #6b7280; font-size: 0.8rem; margin-top: 0.5rem;">
                JPG, PNG, or GIF up to 5MB
              </p>
            </div>

            <div class="form-group">
              <label class="form-label" for="setup-bio">Bio (Optional)</label>
              <textarea
                id="setup-bio"
                class="form-input"
                placeholder="Tell us a bit about yourself! Your interests, hobbies, what you're studying..."
                maxlength="300"
                style="min-height: 80px; resize: vertical;"
              ></textarea>
              <div
                style="text-align: right; font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem;"
              >
                <span id="bio-count">0</span>/300 characters
              </div>
            </div>
          </div>

          <!-- Step 3: Preferences & Completion -->
          <div class="setup-step" data-step="2">
            <div class="step-header">
              <span class="step-icon">🎉</span>
              <h3 class="step-title">You're all set!</h3>
              <p class="step-description">
                Your CampXus profile has been created successfully. Start
                managing your schedule now!
              </p>
            </div>

            <div
              style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;"
            >
              <h4
                style="color: #059669; margin: 0 0 0.5rem 0; font-size: 1rem;"
              >
                🎉 Welcome to CampXus!
              </h4>
              <p style="color: #059669; margin: 0; font-size: 0.9rem;">
                Your profile is ready. Start adding your classes and connect
                with fellow students!
              </p>
            </div>

            <div class="form-group">
              <label class="form-label" for="setup-timezone">Timezone</label>
              <select id="setup-timezone" class="form-input" required>
                <option value="">Select Timezone</option>
                <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                <option value="America/New_York">
                  America/New_York (GMT-5)
                </option>
                <option value="Europe/London">Europe/London (GMT+0)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="setup-theme"
                >Preferred Theme</label
              >
              <select id="setup-theme" class="form-input">
                <option value="auto">Auto (System)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Notification Preferences</label>
              <div style="margin-top: 0.5rem;">
                <label
                  style="display: block; margin-bottom: 0.5rem; font-weight: normal;"
                >
                  <input
                    type="checkbox"
                    id="notify-schedule-updates"
                    checked
                    style="margin-right: 0.5rem;"
                  />
                  Schedule updates and reminders
                </label>
                <label
                  style="display: block; margin-bottom: 0.5rem; font-weight: normal;"
                >
                  <input
                    type="checkbox"
                    id="notify-friend-requests"
                    checked
                    style="margin-right: 0.5rem;"
                  />
                  Friend requests and social updates
                </label>
                <label style="display: block; font-weight: normal;">
                  <input
                    type="checkbox"
                    id="notify-campus-events"
                    style="margin-right: 0.5rem;"
                  />
                  Campus events and announcements
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="setup-navigation">
          <div>
            <button
              type="button"
              class="setup-nav-button secondary"
              id="setup-prev-btn"
              style="display: none;"
            >
              ← Previous
            </button>
          </div>

          <div style="display: flex; gap: 1rem; align-items: center;">
            <button
              type="button"
              class="setup-nav-button secondary"
              id="setup-skip-btn"
            >
              Skip for now
            </button>
            <button
              type="button"
              class="setup-nav-button primary"
              id="setup-next-btn"
            >
              Next Step →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Firebase Scripts -->
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js"></script>
    <script src="js/firebase-config.js"></script>
    <script src="js/profile-setup.js"></script>
  </body>
</html>
```

### Adventure 2: Create the Simple JavaScript Implementation 🚀

Now let's add the JavaScript functionality! We'll create a simple, clean implementation that handles the profile setup flow using basic Firebase operations.

#### 2.1 Create the Profile Setup JavaScript

Create `js/profile-setup.js`:

```javascript
// CampXus Profile Setup - Simple Firebase Implementation
class ProfileSetup {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 3;
    this.currentUser = null;
    this.profileData = {};
    this.profilePictureFile = null;

    // Check if user is authenticated
    this.checkAuthentication();
  }

  // Check if user is authenticated and initialize
  async checkAuthentication() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        this.checkIfProfileComplete();
      } else {
        // Redirect to login if not authenticated
        window.location.href = "index.html";
      }
    });
  }

  // Check if user already has a complete profile
  async checkIfProfileComplete() {
    try {
      const userDoc = await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        // If profile is complete, redirect to dashboard
        if (userData.profileComplete) {
          window.location.href = "dashboard.html";
          return;
        }
      }

      // If profile is not complete, show setup wizard
      this.showSetupWizard();
    } catch (error) {
      console.error("Error checking profile:", error);
      this.showSetupWizard();
    }
  }

  // Show the profile setup wizard
  showSetupWizard() {
    const overlay = document.getElementById("profile-setup-overlay");
    overlay.classList.add("active");

    // Pre-fill email from authentication
    document.getElementById("setup-email").value = this.currentUser.email;

    this.setupEventListeners();
    this.updateProgress();
  }

  // Set up event listeners
  setupEventListeners() {
    // Navigation buttons
    document.getElementById("setup-next-btn").addEventListener("click", () => {
      this.nextStep();
    });

    document.getElementById("setup-prev-btn").addEventListener("click", () => {
      this.prevStep();
    });

    document.getElementById("setup-skip-btn").addEventListener("click", () => {
      this.skipSetup();
    });

    // Profile picture upload
    document
      .getElementById("profile-picture-upload")
      .addEventListener("change", (e) => {
        this.handleProfilePictureUpload(e);
      });

    // Bio character counter
    document.getElementById("setup-bio").addEventListener("input", (e) => {
      document.getElementById("bio-count").textContent = e.target.value.length;
    });

    // Form validation
    this.setupFormValidation();
  }

  // Set up basic form validation
  setupFormValidation() {
    const requiredFields = [
      "setup-first-name",
      "setup-last-name",
      "setup-graduation-year",
      "setup-major",
    ];

    requiredFields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener("input", () => this.validateCurrentStep());
        field.addEventListener("blur", () => this.validateCurrentStep());
      }
    });
  }

  // Validate current step
  validateCurrentStep() {
    const nextBtn = document.getElementById("setup-next-btn");

    if (this.currentStep === 0) {
      // Validate basic info step
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const graduationYear = document.getElementById(
        "setup-graduation-year"
      ).value;
      const major = document.getElementById("setup-major").value.trim();

      const isValid = firstName && lastName && graduationYear && major;
      nextBtn.disabled = !isValid;

      if (isValid) {
        nextBtn.textContent = "Next Step →";
      } else {
        nextBtn.textContent = "Fill Required Fields";
      }
    } else if (this.currentStep === 1) {
      // Profile picture step - optional, always valid
      nextBtn.disabled = false;
      nextBtn.textContent = "Complete Setup →";
    } else if (this.currentStep === 2) {
      // Final step
      const timezone = document.getElementById("setup-timezone").value;
      const isValid = timezone;
      nextBtn.disabled = !isValid;
      nextBtn.textContent = isValid
        ? "Start Using CampXus!"
        : "Select Timezone";
    }
  }

  // Handle profile picture upload
  handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Basic file validation
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];

    if (file.size > maxSize) {
      alert("Please choose an image smaller than 5MB");
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      alert("Please choose a JPG, PNG, or GIF image");
      return;
    }

    this.profilePictureFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById("profile-picture-preview");
      preview.innerHTML = `<img src="${e.target.result}" alt="Profile Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    };
    reader.readAsDataURL(file);
  }

  // Go to next step
  async nextStep() {
    if (this.currentStep < this.totalSteps - 1) {
      // Collect data from current step
      this.collectCurrentStepData();

      this.currentStep++;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep();
    } else {
      // Final step - save profile
      await this.saveProfile();
    }
  }

  // Go to previous step
  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep();
    }
  }

  // Collect data from current step
  collectCurrentStepData() {
    if (this.currentStep === 0) {
      // Basic info
      this.profileData = {
        firstName: document.getElementById("setup-first-name").value.trim(),
        lastName: document.getElementById("setup-last-name").value.trim(),
        email: document.getElementById("setup-email").value,
        studentId: document.getElementById("setup-student-id").value.trim(),
        graduationYear: document.getElementById("setup-graduation-year").value,
        major: document.getElementById("setup-major").value.trim(),
      };
    } else if (this.currentStep === 1) {
      // Profile picture and bio
      this.profileData.bio = document.getElementById("setup-bio").value.trim();
    } else if (this.currentStep === 2) {
      // Preferences
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

  // Update step display
  updateStepDisplay() {
    // Hide all steps
    const steps = document.querySelectorAll(".setup-step");
    steps.forEach((step) => (step.style.display = "none"));

    // Show current step
    const currentStepElement = document.querySelector(
      `[data-step="${this.currentStep}"]`
    );
    if (currentStepElement) {
      currentStepElement.style.display = "block";
    }

    // Update navigation buttons
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");

    if (this.currentStep === 0) {
      prevBtn.style.display = "none";
    } else {
      prevBtn.style.display = "block";
    }

    if (this.currentStep === this.totalSteps - 1) {
      skipBtn.style.display = "none";
    } else {
      skipBtn.style.display = "block";
    }
  }

  // Update progress bar
  updateProgress() {
    const progress = ((this.currentStep + 1) / this.totalSteps) * 100;
    const progressBar = document.querySelector(".setup-progress-bar");
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    // Update step counter in header
    const stepCounter = document.querySelector(".setup-step-counter");
    if (stepCounter) {
      stepCounter.textContent = `Step ${this.currentStep + 1} of ${
        this.totalSteps
      }`;
    }
  }

  // Save profile to Firebase
  async saveProfile() {
    try {
      // Show loading state
      const nextBtn = document.getElementById("setup-next-btn");
      const originalText = nextBtn.textContent;
      nextBtn.textContent = "Saving...";
      nextBtn.disabled = true;

      // Collect final step data
      this.collectCurrentStepData();

      // Upload profile picture if provided
      let profilePictureUrl = null;
      if (this.profilePictureFile) {
        profilePictureUrl = await this.uploadProfilePicture();
      }

      // Prepare user data
      const userData = {
        ...this.profileData,
        profilePictureUrl: profilePictureUrl,
        profileComplete: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Save to Firestore
      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .set(userData, { merge: true });

      // Show success and redirect
      this.showSuccessMessage();

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("There was an error saving your profile. Please try again.");

      // Reset button
      const nextBtn = document.getElementById("setup-next-btn");
      nextBtn.textContent = originalText;
      nextBtn.disabled = false;
    }
  }

  // Upload profile picture to Firebase Storage
  async uploadProfilePicture() {
    if (!this.profilePictureFile) return null;

    try {
      const storageRef = firebase.storage().ref();
      const imageRef = storageRef.child(
        `profile-pictures/${this.currentUser.uid}`
      );

      // Upload the file
      const snapshot = await imageRef.put(this.profilePictureFile);

      // Get the download URL
      const downloadURL = await snapshot.ref.getDownloadURL();
      return downloadURL;
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      throw error;
    }
  }

  // Skip setup for now
  async skipSetup() {
    try {
      // Save minimal profile data
      const minimalData = {
        email: this.currentUser.email,
        profileComplete: false,
        skippedSetup: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await firebase
        .firestore()
        .collection("users")
        .doc(this.currentUser.uid)
        .set(minimalData, { merge: true });

      // Redirect to dashboard
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Error skipping setup:", error);
      alert("There was an error. Please try again.");
    }
  }

  // Show success message
  showSuccessMessage() {
    const setupContainer = document.querySelector(".setup-container");
    setupContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 2rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
        <h2 style="color: #059669; margin-bottom: 1rem;">Welcome to CampXus!</h2>
        <p style="color: #6b7280; margin-bottom: 2rem;">
          Your profile has been created successfully. You'll be redirected to your dashboard in a moment.
        </p>
        <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
          <p style="color: #059669; margin: 0; font-weight: 500;">
            🚀 Ready to start managing your schedule and connecting with classmates!
          </p>
        </div>
      </div>
    `;
  }
}

// Initialize profile setup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new ProfileSetup();
});
```

### Adventure 3: Add Profile Setup to Your Main App 🔗

Now let's integrate the profile setup into your main application flow.

#### 3.1 Update your Dashboard (dashboard.html)

Add a check for incomplete profiles in your dashboard JavaScript:

```javascript
// Add this to your dashboard.js
function checkProfileCompletion() {
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await firebase
          .firestore()
          .collection("users")
          .doc(user.uid)
          .get();

        if (!userDoc.exists || !userDoc.data().profileComplete) {
          // Redirect to profile setup
          window.location.href = "profile-setup.html";
        }
      } catch (error) {
        console.error("Error checking profile:", error);
      }
    }
  });
}

// Call this when dashboard loads
checkProfileCompletion();
```

#### 3.2 Update your Authentication Flow

Update your sign-in success handler to check for profile completion:

```javascript
// In your auth-manager.js or wherever you handle sign-in
async function handleSignInSuccess(user) {
  // Check if user has completed profile setup
  try {
    const userDoc = await firebase
      .firestore()
      .collection("users")
      .doc(user.uid)
      .get();

    if (!userDoc.exists || !userDoc.data().profileComplete) {
      // Redirect to profile setup
      window.location.href = "profile-setup.html";
    } else {
      // Redirect to dashboard
      window.location.href = "dashboard.html";
    }
  } catch (error) {
    console.error("Error checking profile status:", error);
    // Default to dashboard
    window.location.href = "dashboard.html";
  }
}
```

## ✅ Testing Your Simple Profile Setup

### Test Adventure 🧪

1. **New User Flow Test**:

   - Create a new account
   - Sign in and verify profile setup appears
   - Go through each step and fill out information
   - Test form validation (try submitting empty required fields)

2. **Profile Picture Upload Test**:

   - Upload different image types (JPG, PNG, GIF)
   - Test file size limits (try uploading a large file)
   - Verify preview shows correctly

3. **Data Persistence Test**:

   - Complete profile setup
   - Check Firebase Console to see saved data
   - Sign out and sign back in - should go to dashboard

4. **Skip Flow Test**:

   - Start setup and click "Skip for now"
   - Should create minimal profile and go to dashboard
   - Profile setup should be available to complete later

5. **Navigation Test**:
   - Test Previous/Next buttons
   - Verify progress bar updates
   - Test form validation on each step

## 🎯 Victory Conditions

You've conquered Phase 2 when:

- [ ] New users see profile setup after signing in
- [ ] Multi-step form works smoothly with navigation
- [ ] Form validation prevents proceeding with invalid data
- [ ] Profile pictures upload to Firebase Storage
- [ ] User data saves to Firestore correctly
- [ ] Skip flow works and allows later completion
- [ ] Users with complete profiles go to dashboard
- [ ] Mobile responsive design works well
- [ ] Success message appears after completion

## 🎉 Celebration Station!

Amazing work! You've built a smooth, user-friendly profile setup experience that welcomes new users to CampXus. The simple Firebase integration ensures data is stored securely while keeping the code clean and maintainable.

New users will now have a delightful onboarding experience that helps them get started with the app quickly and easily!

## ⏭️ Next Adventure: Phase 3

Ready for **Phase 3: Friends Discovery & Social Features**? We'll build the social heart of CampXus where students can find and connect with their classmates!

---

**Estimated Time**: 2-3 hours  
**Difficulty**: Beginner to Intermediate  
**Fun Factor**: 🌟🌟🌟🌟🌟  
**Student-Friendly**: ✅ Perfect for learning!
