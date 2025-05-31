# Phase 0: Firebase Foundation & Setup

## Overview

Phase 0 establishes the foundation for integrating Firebase into the CampXus application. This phase focuses on learning Firebase concepts, setting up the development environment, and creating the basic infrastructure for all subsequent phases.

## 📋 Prerequisites

- Node.js (v14 or higher) installed
- Basic understanding of JavaScript (ES6+)
- Basic understanding of HTML/CSS
- Google account for Firebase
- Text editor/IDE (VS Code recommended)

## 🎯 Learning Objectives

By the end of Phase 0, you will understand:

- Firebase ecosystem and core services
- Firebase project structure and configuration
- Authentication flow basics
- Firestore database concepts
- Firebase hosting and deployment
- Security rules fundamentals

## 🔧 Setup Tasks

### Task 1: Firebase Account & Project Setup

#### 1.1 Create Firebase Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account
3. Accept Firebase terms of service

#### 1.2 Create Firebase Project

1. Click "Create a project"
2. Project name: `campxus-scheduling`
3. **Disable** Google Analytics (for simplicity in development)
4. Click "Create project"

#### 1.3 Enable Required Services

Navigate to your project dashboard and enable:

**Authentication:**

1. Go to Authentication > Get started
2. Click "Sign-in method" tab
3. Enable "Email/Password" provider
4. Save changes

**Firestore Database:**

1. Go to Firestore Database > Create database
2. Choose "Start in test mode" (we'll secure it later)
3. Select a location (choose closest to your target users)
4. Click "Done"

**Hosting (Optional for Phase 0):**

1. Go to Hosting > Get started
2. Follow the setup wizard (we'll configure this later)

### Task 2: Local Development Environment

#### 2.1 Install Firebase CLI

```bash
npm install -g firebase-tools
```

#### 2.2 Login to Firebase

```bash
firebase login
```

#### 2.3 Initialize Firebase in CampXus Project

Navigate to your CampXus project directory:

```bash
cd /home/faizan/Desktop/CampXus
firebase init
```

**Configuration choices:**

- **Services to enable:**
  - ✅ Firestore
  - ✅ Hosting
  - ✅ Functions (for future phases)
- **Project:** Select your `campxus-scheduling` project
- **Firestore rules:** Use default (`firestore.rules`)
- **Firestore indexes:** Use default (`firestore.indexes.json`)
- **Public directory:** Choose `public` (we'll move files later)
- **Single-page app:** Yes
- **GitHub deployment:** No (for now)
- **Functions language:** JavaScript
- **ESLint:** Yes
- **Install dependencies:** Yes

#### 2.4 Install Firebase SDK

```bash
npm install firebase
```

### Task 3: Project Structure Setup

#### 3.1 Create Firebase Configuration

Create `js/firebase-config.js`:

```javascript
// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  // We'll add this after Task 3.2
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
```

#### 3.2 Get Firebase Configuration

1. Go to Firebase Console > Project Settings
2. Scroll down to "Your apps"
3. Click "Web" icon (</>) to add a web app
4. App nickname: `CampXus Web`
5. **Don't** enable Firebase Hosting (we'll do this manually)
6. Click "Register app"
7. Copy the `firebaseConfig` object
8. Paste it into `js/firebase-config.js`

#### 3.3 Update Package.json

Add Firebase-related scripts to your `package.json`:

```json
{
  "scripts": {
    "firebase:serve": "firebase serve",
    "firebase:deploy": "firebase deploy",
    "firebase:emulators": "firebase emulators:start"
  }
}
```

### Task 4: Basic Firebase Integration Test

#### 4.1 Create Test Authentication Component

Create `js/firebase-test.js`:

```javascript
import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// Test Firebase connection
export function testFirebaseConnection() {
  console.log("Firebase Auth instance:", auth);
  console.log("Firebase connection test successful!");
}

// Basic auth test functions (for testing only)
export async function testSignUp(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    console.log("Test sign up successful:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Test sign up error:", error.message);
    throw error;
  }
}

export async function testSignIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    console.log("Test sign in successful:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Test sign in error:", error.message);
    throw error;
  }
}

export async function testSignOut() {
  try {
    await signOut(auth);
    console.log("Test sign out successful");
  } catch (error) {
    console.error("Test sign out error:", error.message);
    throw error;
  }
}

// Listen for auth state changes
export function setupAuthListener() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("User is signed in:", user.email);
    } else {
      console.log("User is signed out");
    }
  });
}
```

#### 4.2 Add Test Button to Index.html

Add this temporary test section to your `index.html` (remove after testing):

```html
<!-- Temporary Firebase Test Section (Remove after Phase 0) -->
<div
  id="firebase-test"
  style="position: fixed; top: 10px; right: 10px; background: #f0f0f0; padding: 10px; border-radius: 5px; z-index: 1000;"
>
  <h4>Firebase Test</h4>
  <button onclick="testFirebaseConnection()">Test Connection</button>
  <br /><br />
  <input type="email" id="test-email" placeholder="test@iub.edu.bd" />
  <input type="password" id="test-password" placeholder="password" />
  <br />
  <button onclick="testAuth('signup')">Test Sign Up</button>
  <button onclick="testAuth('signin')">Test Sign In</button>
  <button onclick="testAuth('signout')">Test Sign Out</button>
</div>

<script type="module">
  import {
    testFirebaseConnection,
    testSignUp,
    testSignIn,
    testSignOut,
    setupAuthListener,
  } from "./js/firebase-test.js";

  // Make functions globally available for testing
  window.testFirebaseConnection = testFirebaseConnection;
  window.testAuth = async function (action) {
    const email = document.getElementById("test-email").value;
    const password = document.getElementById("test-password").value;

    try {
      switch (action) {
        case "signup":
          await testSignUp(email, password);
          break;
        case "signin":
          await testSignIn(email, password);
          break;
        case "signout":
          await testSignOut();
          break;
      }
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  // Setup auth listener
  setupAuthListener();
</script>
```

### Task 5: Firestore Database Setup

#### 5.1 Create Database Structure

In Firebase Console > Firestore Database, create these collections manually:

**Users Collection:**

1. Collection ID: `users`
2. Document ID: `sample-user`
3. Fields:
   - `email`: `test@iub.edu.bd`
   - `university`: `iub`
   - `displayName`: `Test User`
   - `status`: `offline`
   - `createdAt`: (timestamp) - current time
   - `lastActive`: (timestamp) - current time

**Universities Collection:**

1. Collection ID: `universities`
2. Document ID: `iub`
3. Fields:
   - `name`: `Independent University, Bangladesh`
   - `domain`: `iub.edu.bd`
   - `allowedDomains`: `["iub.edu.bd"]`
   - `isActive`: `true`

#### 5.2 Test Firestore Connection

Create `js/firestore-test.js`:

```javascript
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";

// Test Firestore connection
export async function testFirestoreConnection() {
  try {
    const universitiesRef = collection(db, "universities");
    const snapshot = await getDocs(universitiesRef);

    console.log("Firestore connection successful!");
    console.log("Universities found:", snapshot.size);

    snapshot.forEach((doc) => {
      console.log("University:", doc.id, doc.data());
    });

    return true;
  } catch (error) {
    console.error("Firestore connection error:", error);
    return false;
  }
}

// Test reading a specific university
export async function testGetUniversity(universityId) {
  try {
    const docRef = doc(db, "universities", universityId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      console.log("University data:", docSnap.data());
      return docSnap.data();
    } else {
      console.log("University not found");
      return null;
    }
  } catch (error) {
    console.error("Error getting university:", error);
    throw error;
  }
}

// Test user operations
export async function testUserOperations() {
  try {
    // Read users
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    console.log("Users found:", snapshot.size);
    snapshot.forEach((doc) => {
      console.log("User:", doc.id, doc.data());
    });

    return true;
  } catch (error) {
    console.error("Error with user operations:", error);
    return false;
  }
}
```

## ✅ Testing & Validation

### Test Checklist

- [ ] Firebase project created successfully
- [ ] Firebase CLI installed and authenticated
- [ ] Firebase initialized in project directory
- [ ] Configuration files created (`firebase.json`, `.firebaserc`)
- [ ] Firebase SDK installed (`package.json` updated)
- [ ] `js/firebase-config.js` created with valid config
- [ ] Test authentication functions work
- [ ] Firestore database accessible
- [ ] Sample data created in Firestore
- [ ] Browser console shows no Firebase errors

### Validation Steps

1. **Start Local Development Server:**

   ```bash
   firebase serve
   ```

2. **Open Browser and Test:**

   - Navigate to `http://localhost:5000`
   - Open browser console (F12)
   - Click "Test Connection" button
   - Try sign up with a test email
   - Verify user appears in Firebase Console > Authentication

3. **Test Firestore:**
   - Add Firestore test button to your test panel
   - Verify data can be read from universities collection
   - Check browser network tab for successful Firebase requests

## 📚 Key Concepts to Understand

### Firebase Services Overview

- **Authentication:** User management and login
- **Firestore:** NoSQL document database
- **Functions:** Server-side code execution
- **Hosting:** Web app deployment
- **Storage:** File upload and storage

### Security Model

- **Authentication:** Who you are
- **Authorization:** What you can do
- **Firestore Rules:** Database-level permissions
- **Function security:** Server-side validation

### Data Structure Design

- **Collections:** Like tables in SQL
- **Documents:** Individual records
- **Subcollections:** Nested data structures
- **References:** Links between documents

## 🚨 Important Notes

### Security Warnings

- Test mode Firestore rules allow all access
- Never deploy test rules to production
- Always validate data on client AND server
- Use authentication before database operations

### Development Best Practices

- Keep configuration files out of version control (use environment variables)
- Use Firebase emulators for local development
- Test with real data early and often
- Plan your data structure before implementing

### Common Pitfalls

- Forgetting to initialize Firebase services
- Using wrong import syntax for Firebase v9+
- Not handling async/await properly
- Ignoring error handling

## 📖 Additional Resources

### Official Documentation

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Auth Guide](https://firebase.google.com/docs/auth)
- [Firestore Guide](https://firebase.google.com/docs/firestore)

### Learning Resources

- [Firebase Fundamentals Course](https://firebase.google.com/codelabs)
- [JavaScript Promises and Async/Await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous)

## 🔐 Security Baseline Setup

### Security Fundamentals (New Addition)

Security is not an afterthought in CampXus - it's built into every layer from day one. This section establishes critical security foundations that will be built upon in every subsequent phase.

### Task 6: Content Security Policy (CSP)

#### 6.1 Create CSP Configuration

Add to your `index.html` head section:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self' 'unsafe-eval' https://*.firebase.com https://*.firebaseapp.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https://*.googleusercontent.com;
  connect-src 'self' https://*.firebase.com https://*.firebaseapp.com wss://*.firebaseio.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
"
/>
```

#### 6.2 Create Security Headers

Create `firebase.json` hosting configuration (if not exists):

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "X-XSS-Protection",
            "value": "1; mode=block"
          },
          {
            "key": "Strict-Transport-Security",
            "value": "max-age=31536000; includeSubDomains"
          },
          {
            "key": "Referrer-Policy",
            "value": "strict-origin-when-cross-origin"
          }
        ]
      }
    ]
  }
}
```

### Task 7: Basic Security Rules

#### 7.1 Firestore Security Rules Foundation

Create/update `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Security baseline - deny all by default
    match /{document=**} {
      allow read, write: if false;
    }

    // Basic authenticated user rules (will be expanded in later phases)
    match /users/{userId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && isValidUserData(request.resource.data);
    }

    // Universities collection - read only for authenticated users
    match /universities/{universityId} {
      allow read: if request.auth != null;
      allow write: if false; // Admin only (handled in Cloud Functions)
    }

    // Helper functions
    function isValidUserData(data) {
      return data.keys().hasAll(['email', 'university', 'displayName', 'createdAt'])
        && data.email is string
        && data.university is string
        && data.displayName is string
        && data.createdAt is timestamp;
    }
  }
}
```

#### 7.2 Environment Variables Setup

Create `.env.local` (add to .gitignore):

```env
# Firebase Configuration (Development)
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef

# Security Settings
NODE_ENV=development
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=100
```

Update `js/firebase-config.js` to use environment variables:

```javascript
// Firebase configuration with environment variables
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Secure configuration loading
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "your_api_key_here",
  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN || "your_project.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "your_project_id",
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET || "your_project.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.FIREBASE_APP_ID || "1:123456789:web:abcdef",
};

// Initialize Firebase with error handling
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Firebase initialization error:", error);
  throw new Error("Failed to initialize Firebase");
}

// Initialize services with error handling
export const auth = getAuth(app);
export const db = getFirestore(app);

// Security event logging
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("Security: User authenticated", {
      uid: user.uid,
      email: user.email,
      timestamp: new Date().toISOString(),
    });
  } else {
    console.log("Security: User signed out", {
      timestamp: new Date().toISOString(),
    });
  }
});

export default app;
```

### Task 8: Privacy & GDPR Compliance Foundation

#### 8.1 Privacy Policy Template

Create `pages/privacy.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy - CampXus</title>
    <link rel="stylesheet" href="../css/styles.css" />
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>Privacy Policy</h1>
        <p><strong>Last updated:</strong> [Current Date]</p>

        <h2>1. Information We Collect</h2>
        <ul>
          <li>University email address (for verification)</li>
          <li>Display name and profile information</li>
          <li>Schedule and course information</li>
          <li>Friend connections within your university</li>
          <li>Usage analytics (anonymized)</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>Provide schedule management services</li>
          <li>Connect you with classmates and friends</li>
          <li>Improve our platform</li>
          <li>Ensure platform security</li>
        </ul>

        <h2>3. Data Security</h2>
        <p>We implement industry-standard security measures including:</p>
        <ul>
          <li>End-to-end encryption for sensitive data</li>
          <li>Multi-factor authentication</li>
          <li>Regular security audits</li>
          <li>GDPR compliance measures</li>
        </ul>

        <h2>4. Your Rights</h2>
        <ul>
          <li>Access your data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your account and data</li>
          <li>Export your data</li>
          <li>Withdraw consent</li>
        </ul>

        <h2>5. Contact Us</h2>
        <p>For privacy-related questions: privacy@campxus.com</p>
      </div>
    </div>
  </body>
</html>
```

#### 8.2 GDPR Consent Manager

Create `js/privacy-manager.js`:

```javascript
// Privacy and GDPR compliance manager
export class PrivacyManager {
  constructor() {
    this.consentKey = "campxus_privacy_consent";
    this.consentVersion = "1.0";
    this.init();
  }

  init() {
    this.checkConsentStatus();
    this.setupConsentBanner();
  }

  checkConsentStatus() {
    const consent = localStorage.getItem(this.consentKey);
    if (!consent) {
      this.showConsentBanner();
    } else {
      const consentData = JSON.parse(consent);
      if (consentData.version !== this.consentVersion) {
        this.showConsentBanner();
      }
    }
  }

  showConsentBanner() {
    const banner = document.createElement("div");
    banner.className = "privacy-consent-banner";
    banner.innerHTML = `
      <div class="privacy-consent-content">
        <p>We use cookies and collect data to provide you with the best experience. 
           By using CampXus, you agree to our 
           <a href="/pages/privacy.html" target="_blank">Privacy Policy</a>.</p>
        <div class="privacy-consent-actions">
          <button class="btn btn-secondary" onclick="privacyManager.acceptEssential()">
            Essential Only
          </button>
          <button class="btn btn-primary" onclick="privacyManager.acceptAll()">
            Accept All
          </button>
        </div>
      </div>
    `;

    // Add banner styles
    banner.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #1a365d;
      color: white;
      padding: 1rem;
      z-index: 10000;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    `;

    document.body.appendChild(banner);
  }

  acceptEssential() {
    this.saveConsent({
      essential: true,
      analytics: false,
      marketing: false,
    });
    this.hideConsentBanner();
  }

  acceptAll() {
    this.saveConsent({
      essential: true,
      analytics: true,
      marketing: true,
    });
    this.hideConsentBanner();
  }

  saveConsent(preferences) {
    const consentData = {
      version: this.consentVersion,
      timestamp: new Date().toISOString(),
      preferences: preferences,
    };
    localStorage.setItem(this.consentKey, JSON.stringify(consentData));

    // Log consent for audit trail
    console.log("Privacy: Consent updated", consentData);
  }

  hideConsentBanner() {
    const banner = document.querySelector(".privacy-consent-banner");
    if (banner) {
      banner.remove();
    }
  }

  hasConsent(type) {
    const consent = localStorage.getItem(this.consentKey);
    if (!consent) return false;

    const consentData = JSON.parse(consent);
    return consentData.preferences[type] || false;
  }

  // GDPR right to be forgotten
  deleteAllUserData() {
    return new Promise((resolve, reject) => {
      try {
        // Clear local storage
        localStorage.clear();
        sessionStorage.clear();

        // Clear Firebase auth (user must delete account through Firebase)
        // Database deletion handled by Cloud Functions

        console.log("Privacy: Local user data deleted");
        resolve();
      } catch (error) {
        console.error("Privacy: Error deleting user data", error);
        reject(error);
      }
    });
  }
}

// Initialize privacy manager
export const privacyManager = new PrivacyManager();
window.privacyManager = privacyManager; // Make globally available
```

### Task 9: Security Monitoring Foundation

#### 9.1 Security Logger

Create `js/security-logger.js`:

```javascript
// Security event logging and monitoring
export class SecurityLogger {
  constructor() {
    this.events = [];
    this.maxEvents = 1000;
    this.sensitiveFields = ["password", "token", "key", "secret"];
  }

  log(event, data = {}, level = "info") {
    const sanitizedData = this.sanitizeData(data);

    const logEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      event: event,
      level: level,
      data: sanitizedData,
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.getSessionId(),
    };

    this.events.push(logEntry);

    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Console output for development
    if (level === "error" || level === "security") {
      console.error("Security Event:", logEntry);
    } else {
      console.log("Security Event:", logEntry);
    }

    // Send to monitoring service (implement in later phases)
    this.sendToMonitoring(logEntry);
  }

  sanitizeData(data) {
    const sanitized = { ...data };

    this.sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    return sanitized;
  }

  generateId() {
    return "sec_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  getSessionId() {
    let sessionId = sessionStorage.getItem("campxus_session_id");
    if (!sessionId) {
      sessionId =
        "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem("campxus_session_id", sessionId);
    }
    return sessionId;
  }

  sendToMonitoring(logEntry) {
    // Placeholder for monitoring service integration
    // Will be implemented with Cloud Functions in later phases
    if (logEntry.level === "security" || logEntry.level === "error") {
      // Store in localStorage for now, send to server later
      const alertKey = "campxus_security_alerts";
      const alerts = JSON.parse(localStorage.getItem(alertKey) || "[]");
      alerts.push(logEntry);
      localStorage.setItem(alertKey, JSON.stringify(alerts.slice(-100)));
    }
  }

  // Security event helpers
  logAuthAttempt(email, success, error = null) {
    this.log(
      "auth_attempt",
      {
        email: email,
        success: success,
        error: error?.message,
      },
      success ? "info" : "security"
    );
  }

  logSuspiciousActivity(activity, details) {
    this.log(
      "suspicious_activity",
      {
        activity: activity,
        details: details,
      },
      "security"
    );
  }

  logRateLimitHit(endpoint, attempts) {
    this.log(
      "rate_limit_hit",
      {
        endpoint: endpoint,
        attempts: attempts,
      },
      "security"
    );
  }

  // Get security report
  getSecurityReport() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentEvents = this.events.filter(
      (event) => new Date(event.timestamp) > last24h
    );

    const securityEvents = recentEvents.filter(
      (event) => event.level === "security" || event.level === "error"
    );

    return {
      totalEvents: recentEvents.length,
      securityEvents: securityEvents.length,
      events: securityEvents.slice(-50), // Last 50 security events
    };
  }
}

// Initialize security logger
export const securityLogger = new SecurityLogger();
window.securityLogger = securityLogger; // Make globally available for debugging
```

#### 9.2 Update Package.json with Security Dependencies

Add security-related dependencies to `package.json`:

```json
{
  "scripts": {
    "security:audit": "npm audit",
    "security:fix": "npm audit fix",
    "security:check": "npx audit-ci"
  },
  "devDependencies": {
    "audit-ci": "^6.6.1"
  }
}
```

### Security Testing & Validation

#### Updated Test Checklist

- [ ] Content Security Policy headers configured
- [ ] Firestore security rules deny by default
- [ ] Environment variables configured
- [ ] Privacy policy created
- [ ] GDPR consent manager implemented
- [ ] Security logging functional
- [ ] No sensitive data in client-side code
- [ ] HTTPS enforced (in production)
- [ ] Security headers properly set

## 🎯 Phase 0 Completion Criteria

You have successfully completed Phase 0 when:

- [ ] Firebase project is set up and configured
- [ ] Local development environment is working
- [ ] Firebase SDK is properly integrated
- [ ] Test authentication functions work
- [ ] Firestore database is accessible
- [ ] You understand basic Firebase concepts
- [ ] You can deploy to Firebase hosting

## ⏭️ Next Steps: Phase 1

Once Phase 0 is complete, you'll be ready for **Phase 1: University Email Authentication**, which will include:

- University domain validation
- Email verification workflow
- Secure authentication flows
- Error handling and user feedback
- Integration with existing CampXus UI

---

**Estimated Time:** 4-6 hours for complete beginners, 2-3 hours for developers familiar with Firebase

**Difficulty Level:** Beginner

**Prerequisites for Next Phase:** All Phase 0 tasks completed and tested
