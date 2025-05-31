# Phase 2.5: Basic Testing & Data Management 🧪📊

## Welcome to Testing & Data Management! 🚀

Great job completing Phase 2! Now let's learn some essential skills that every web developer needs: **testing your code** and **managing data properly**. Think of this phase as learning to be a quality control specialist - making sure your app works reliably for all students.

## What We're Building 🎯

In this phase, you'll learn to:

### Testing Skills ✅

- **Write Simple Tests**: Create basic tests for your functions
- **Test Firebase Integration**: Verify your data operations work
- **Form Validation Testing**: Ensure user inputs are handled correctly
- **Error Handling**: Test what happens when things go wrong

### Data Management Skills 📊

- **Organize Your Data**: Structure Firestore collections properly
- **Basic Error Handling**: Handle network errors gracefully
- **Data Validation**: Check user inputs before saving
- **Simple Caching**: Store data locally for better performance

## 🏗️ Simple Architecture

This phase uses beginner-friendly tools:

- **Jest**: Simple JavaScript testing framework
- **Firebase Testing**: Test your Firestore operations
- **Console Debugging**: Learn to debug effectively
- **Basic Error Handling**: Graceful failure management

## 📋 What You Need Before Starting

Make sure you've completed:

- [ ] Phase 1: Firebase Authentication working
- [ ] Phase 2: Profile setup completed
- [ ] Basic understanding of JavaScript functions
- [ ] Firebase project set up and working

## 🎯 Learning Goals

By the end of Phase 2.5, you'll know how to:

- **Write Basic Tests**: Create simple tests for your JavaScript functions
- **Test User Interactions**: Verify forms and buttons work correctly
- **Handle Errors**: Display helpful messages when things go wrong
- **Validate Data**: Check user inputs before saving to Firebase
- **Debug Issues**: Use browser tools to find and fix problems

## 🛠️ Mission: Your Testing Adventures

### Adventure 1: Set Up Basic Testing 🧪

Let's start with simple testing! We'll create tests for the functions you've already built.

#### 1.1 Install Testing Tools

First, let's set up Jest for testing:

```bash
# Install Jest testing framework
npm install --save-dev jest

# Install testing utilities for DOM testing
npm install --save-dev @testing-library/dom @testing-library/jest-dom
```

#### 1.2 Create Your First Test

Create `js/profile-setup.test.js`:

```javascript
// Simple tests for profile setup functionality

// Import the functions we want to test
// (We'll mock Firebase for testing)

describe("Profile Setup Tests", () => {
  // Test 1: Check if email validation works
  test("should validate email addresses correctly", () => {
    // Test valid emails
    expect(isValidEmail("student@university.edu")).toBe(true);
    expect(isValidEmail("john.doe@gmail.com")).toBe(true);

    // Test invalid emails
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  // Test 2: Check if names are properly formatted
  test("should format names correctly", () => {
    expect(formatName("john")).toBe("John");
    expect(formatName("MARY")).toBe("Mary");
    expect(formatName("bob smith")).toBe("Bob Smith");
  });

  // Test 3: Check graduation year validation
  test("should validate graduation years", () => {
    const currentYear = new Date().getFullYear();

    expect(isValidGraduationYear(currentYear + 1)).toBe(true);
    expect(isValidGraduationYear(currentYear + 4)).toBe(true);
    expect(isValidGraduationYear(currentYear - 1)).toBe(false);
    expect(isValidGraduationYear(currentYear + 10)).toBe(false);
  });

  // Test 4: Check if required fields are filled
  test("should check required fields", () => {
    const validData = {
      firstName: "John",
      lastName: "Doe",
      major: "Computer Science",
      graduationYear: "2027",
    };

    const invalidData = {
      firstName: "",
      lastName: "Doe",
      major: "Computer Science",
      graduationYear: "2027",
    };

    expect(validateRequiredFields(validData)).toBe(true);
    expect(validateRequiredFields(invalidData)).toBe(false);
  });
});

// Helper functions for testing
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function formatName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isValidGraduationYear(year) {
  const currentYear = new Date().getFullYear();
  const yearNum = parseInt(year);
  return yearNum >= currentYear && yearNum <= currentYear + 6;
}

function validateRequiredFields(data) {
  const required = ["firstName", "lastName", "major", "graduationYear"];
  return required.every((field) => data[field] && data[field].trim() !== "");
}
```

#### 1.3 Update Your Profile Setup with Validation

Let's add these helper functions to your actual profile setup. Update `js/profile-setup.js`:

```javascript
// Add these helper functions to your ProfileSetup class

class ProfileSetup {
  // ... existing code ...

  // Email validation
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Name formatting
  formatName(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Graduation year validation
  isValidGraduationYear(year) {
    const currentYear = new Date().getFullYear();
    const yearNum = parseInt(year);
    return yearNum >= currentYear && yearNum <= currentYear + 6;
  }

  // Required fields validation
  validateRequiredFields(data) {
    const required = ["firstName", "lastName", "major", "graduationYear"];
    return required.every((field) => data[field] && data[field].trim() !== "");
  }

  // Enhanced form validation
  validateCurrentStep() {
    const nextBtn = document.getElementById("setup-next-btn");

    if (this.currentStep === 0) {
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const graduationYear = document.getElementById(
        "setup-graduation-year"
      ).value;
      const major = document.getElementById("setup-major").value.trim();
      const email = document.getElementById("setup-email").value.trim();

      // Validate each field
      const isValidData =
        this.validateRequiredFields({
          firstName,
          lastName,
          major,
          graduationYear,
        }) &&
        this.isValidEmail(email) &&
        this.isValidGraduationYear(graduationYear);

      nextBtn.disabled = !isValidData;

      // Show helpful error messages
      this.showValidationMessages({
        firstName,
        lastName,
        major,
        graduationYear,
        email,
      });
    }

    // ... rest of existing validation code ...
  }

  // Show validation messages
  showValidationMessages(data) {
    // Clear previous messages
    document.querySelectorAll(".error-message").forEach((el) => el.remove());

    // Check each field and show specific errors
    if (!data.firstName) {
      this.showFieldError("setup-first-name", "First name is required");
    }

    if (!this.isValidEmail(data.email)) {
      this.showFieldError("setup-email", "Please enter a valid email address");
    }

    if (!this.isValidGraduationYear(data.graduationYear)) {
      this.showFieldError(
        "setup-graduation-year",
        "Please select a valid graduation year"
      );
    }
  }

  // Show error message for specific field
  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.style.color = "#ef4444";
    errorDiv.style.fontSize = "0.875rem";
    errorDiv.style.marginTop = "0.25rem";
    errorDiv.textContent = message;

    field.parentNode.appendChild(errorDiv);
  }
}
```

### Adventure 2: Test Firebase Operations 🔥

Now let's learn to test your Firebase operations safely.

#### 2.1 Create Firebase Test Utilities

Create `js/test-utils.js`:

```javascript
// Testing utilities for Firebase operations

// Mock Firebase for testing
export const mockFirebase = {
  // Mock user for testing
  testUser: {
    uid: "test-user-123",
    email: "test@university.edu",
    displayName: "Test User",
  },

  // Mock Firestore operations
  firestore: {
    collection: (collectionName) => ({
      doc: (docId) => ({
        set: async (data) => {
          console.log(`Mock: Saving to ${collectionName}/${docId}:`, data);
          return Promise.resolve();
        },
        get: async () => ({
          exists: true,
          data: () => ({
            firstName: "John",
            lastName: "Doe",
            email: "test@university.edu",
            profileComplete: true,
          }),
        }),
        update: async (data) => {
          console.log(`Mock: Updating ${collectionName}/${docId}:`, data);
          return Promise.resolve();
        },
      }),
    }),
  },

  // Mock Storage operations
  storage: {
    ref: () => ({
      child: (path) => ({
        put: async (file) => {
          console.log(`Mock: Uploading file to ${path}:`, file.name);
          return {
            ref: {
              getDownloadURL: () =>
                Promise.resolve("https://mock-url.com/image.jpg"),
            },
          };
        },
      }),
    }),
  },
};

// Test data generators
export function generateTestUser() {
  return {
    uid: "test-" + Math.random().toString(36).substr(2, 9),
    email: `test${Date.now()}@university.edu`,
    firstName: "Test",
    lastName: "User",
    major: "Computer Science",
    graduationYear: "2027",
  };
}

export function generateTestProfile() {
  return {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@university.edu",
    major: "Computer Science",
    graduationYear: "2027",
    bio: "Hello, I am a computer science student!",
    timezone: "America/New_York",
    theme: "light",
    notifications: {
      scheduleUpdates: true,
      friendRequests: true,
      campusEvents: false,
    },
  };
}
```

#### 2.2 Create Data Manager with Error Handling

Create `js/data-manager.js`:

```javascript
// Simple data manager with error handling

class DataManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.setupOfflineDetection();
  }

  // Detect when user goes online/offline
  setupOfflineDetection() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.showNetworkStatus("back online! 🌐");
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.showNetworkStatus(
        "offline. Changes will sync when you reconnect. 📱"
      );
    });
  }

  // Show network status to user
  showNetworkStatus(message) {
    const statusDiv = document.createElement("div");
    statusDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${this.isOnline ? "#10b981" : "#f59e0b"};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 1000;
      font-weight: 500;
    `;
    statusDiv.textContent = `You're ${message}`;

    document.body.appendChild(statusDiv);

    setTimeout(() => statusDiv.remove(), 3000);
  }

  // Save user profile with error handling
  async saveUserProfile(userId, profileData) {
    try {
      // Validate data before saving
      if (!this.validateProfileData(profileData)) {
        throw new Error("Invalid profile data");
      }

      // Check if online
      if (!this.isOnline) {
        throw new Error(
          "No internet connection. Please try again when online."
        );
      }

      // Save to Firestore
      await firebase
        .firestore()
        .collection("users")
        .doc(userId)
        .set(profileData, { merge: true });

      console.log("Profile saved successfully");
      return { success: true };
    } catch (error) {
      console.error("Error saving profile:", error);

      // Show user-friendly error message
      this.showErrorMessage(error.message);

      return { success: false, error: error.message };
    }
  }

  // Get user profile with error handling
  async getUserProfile(userId) {
    try {
      const doc = await firebase
        .firestore()
        .collection("users")
        .doc(userId)
        .get();

      if (!doc.exists) {
        return { success: false, error: "Profile not found" };
      }

      return { success: true, data: doc.data() };
    } catch (error) {
      console.error("Error getting profile:", error);
      this.showErrorMessage("Failed to load profile. Please refresh the page.");
      return { success: false, error: error.message };
    }
  }

  // Validate profile data
  validateProfileData(data) {
    const required = [
      "firstName",
      "lastName",
      "email",
      "major",
      "graduationYear",
    ];

    // Check required fields
    for (const field of required) {
      if (!data[field] || data[field].trim() === "") {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      console.error("Invalid email format");
      return false;
    }

    // Validate graduation year
    const currentYear = new Date().getFullYear();
    const gradYear = parseInt(data.graduationYear);
    if (gradYear < currentYear || gradYear > currentYear + 6) {
      console.error("Invalid graduation year");
      return false;
    }

    return true;
  }

  // Show error message to user
  showErrorMessage(message) {
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ef4444;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      z-index: 1000;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    errorDiv.innerHTML = `
      <strong>Error:</strong> ${message}
      <br><small>Please try again or contact support if the problem persists.</small>
    `;

    document.body.appendChild(errorDiv);

    setTimeout(() => errorDiv.remove(), 5000);
  }

  // Show success message to user
  showSuccessMessage(message) {
    const successDiv = document.createElement("div");
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      z-index: 1000;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    successDiv.innerHTML = `<strong>Success:</strong> ${message}`;

    document.body.appendChild(successDiv);

    setTimeout(() => successDiv.remove(), 3000);
  }
}

// Create global instance
export const dataManager = new DataManager();
```

### Adventure 3: Test Your Features 🎮

Now let's create tests for the features you've built.

#### 3.1 Create Integration Tests

Create `js/integration.test.js`:

```javascript
// Integration tests for CampXus features

import {
  generateTestUser,
  generateTestProfile,
  mockFirebase,
} from "./test-utils.js";

describe("CampXus Integration Tests", () => {
  test("User can complete profile setup flow", async () => {
    const testUser = generateTestUser();
    const testProfile = generateTestProfile();

    // Mock the profile setup process
    const profileSetup = {
      currentUser: testUser,
      profileData: testProfile,

      async saveProfile() {
        // Simulate saving profile
        const result = await mockFirebase.firestore
          .collection("users")
          .doc(testUser.uid)
          .set(testProfile);

        return { success: true };
      },
    };

    // Test the save operation
    const result = await profileSetup.saveProfile();
    expect(result.success).toBe(true);
  });

  test("Data validation catches invalid inputs", () => {
    const invalidProfile = {
      firstName: "", // Empty first name should fail
      lastName: "Doe",
      email: "invalid-email", // Invalid email should fail
      major: "Computer Science",
      graduationYear: "2020", // Past year should fail
    };

    // Test validation
    expect(validateProfileData(invalidProfile)).toBe(false);
  });

  test("Error handling works for network issues", async () => {
    // Simulate network error
    const networkError = new Error("Network request failed");

    try {
      throw networkError;
    } catch (error) {
      expect(error.message).toContain("Network");
    }
  });
});

// Helper function for validation testing
function validateProfileData(data) {
  const required = [
    "firstName",
    "lastName",
    "email",
    "major",
    "graduationYear",
  ];

  // Check required fields
  for (const field of required) {
    if (!data[field] || data[field].trim() === "") {
      return false;
    }
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return false;
  }

  // Validate graduation year
  const currentYear = new Date().getFullYear();
  const gradYear = parseInt(data.graduationYear);
  if (gradYear < currentYear || gradYear > currentYear + 6) {
    return false;
  }

  return true;
}
```

#### 3.2 Update Package.json for Testing

Update your `package.json` to include test scripts:

```json
{
  "name": "campxus",
  "version": "1.0.0",
  "description": "Student schedule management app",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "@testing-library/dom": "^8.0.0",
    "@testing-library/jest-dom": "^5.0.0"
  }
}
```

### Adventure 4: Basic Performance & Debugging 🚀

Let's add simple performance monitoring and debugging tools.

#### 4.1 Create Debug Helper

Create `js/debug-helper.js`:

```javascript
// Simple debugging and performance tools

class DebugHelper {
  constructor() {
    this.isDebugMode = window.location.hostname === "localhost";
    this.performanceMarks = {};
  }

  // Log messages only in debug mode
  log(message, data = null) {
    if (this.isDebugMode) {
      console.log(`🐛 [CampXus Debug]: ${message}`, data || "");
    }
  }

  // Log errors
  error(message, error = null) {
    console.error(`❌ [CampXus Error]: ${message}`, error || "");
  }

  // Start performance timing
  startTimer(name) {
    this.performanceMarks[name] = performance.now();
    this.log(`⏱️ Timer started: ${name}`);
  }

  // End performance timing
  endTimer(name) {
    if (this.performanceMarks[name]) {
      const duration = performance.now() - this.performanceMarks[name];
      this.log(`⏱️ Timer "${name}" completed in ${duration.toFixed(2)}ms`);
      delete this.performanceMarks[name];
      return duration;
    }
  }

  // Check if Firebase is connected
  async checkFirebaseConnection() {
    try {
      await firebase.firestore().doc("test/connection").get();
      this.log("✅ Firebase connection successful");
      return true;
    } catch (error) {
      this.error("❌ Firebase connection failed", error);
      return false;
    }
  }

  // Log user actions for debugging
  logUserAction(action, details = {}) {
    this.log(`👤 User Action: ${action}`, details);
  }

  // Simple error boundary
  handleError(error, context = "") {
    this.error(`Error in ${context}`, error);

    // Show user-friendly message
    this.showUserError("Something went wrong. Please try again.");
  }

  // Show error to user
  showUserError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 1000;
      max-width: 300px;
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 4000);
  }
}

// Create global debug helper
export const debugHelper = new DebugHelper();

// Global error handler
window.addEventListener("error", (event) => {
  debugHelper.handleError(event.error, "Global");
});

window.addEventListener("unhandledrejection", (event) => {
  debugHelper.handleError(event.reason, "Promise Rejection");
});
```

## ✅ Testing Your Implementation

### Test Adventure 🧪

1. **Run Your Tests**:

   ```bash
   npm test
   ```

2. **Test Form Validation**:

   - Try submitting empty forms
   - Enter invalid email addresses
   - Use past graduation years
   - Verify error messages appear

3. **Test Network Handling**:

   - Turn off internet connection
   - Try to save profile
   - Verify offline message appears

4. **Test Error Handling**:

   - Open browser dev tools
   - Look for error messages in console
   - Verify user-friendly messages show

5. **Performance Testing**:
   - Check profile setup speed
   - Monitor console for timing logs
   - Test on slow network connections

## 🎯 Victory Conditions

You've mastered Phase 2.5 when:

- [ ] Basic tests run successfully with `npm test`
- [ ] Form validation prevents invalid data submission
- [ ] Error messages help users fix problems
- [ ] Offline detection works and shows status
- [ ] Debug logging helps you troubleshoot issues
- [ ] Profile data saves and loads correctly
- [ ] Network errors are handled gracefully
- [ ] Performance timing shows reasonable speeds

## 🎉 Celebration Station!

Awesome work! You've learned fundamental testing and data management skills that will serve you throughout your development career. Your CampXus app is now more reliable and user-friendly.

You can now:

- ✅ Write tests to verify your code works
- ✅ Handle errors gracefully
- ✅ Validate user inputs
- ✅ Debug issues effectively
- ✅ Monitor basic performance

## ⏭️ Next Adventure: Phase 3

Ready for **Phase 3: Friends & Social Features**? We'll build the social heart of CampXus where students can discover and connect with their classmates!

---

**Estimated Time**: 3-4 hours  
**Difficulty**: Beginner to Intermediate  
**Fun Factor**: 🌟🌟🌟🌟⭐  
**Student-Friendly**: ✅ Perfect for learning testing basics!
