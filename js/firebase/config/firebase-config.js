// Firebase configuration for browser environment
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Browser-compatible configuration loading
// Load Firebase config from environment variables with security validation
function loadFirebaseConfig() {
  // Check if environment configuration is loaded
  if (!window.ENV) {
    console.error("❌ Environment configuration not loaded");
    throw new Error(
      "Missing environment configuration. Please run: npm run dev:serve"
    );
  }

  // Validate required Firebase configuration
  const requiredKeys = [
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
  ];

  const missingKeys = requiredKeys.filter((key) => !window.ENV[key]);
  if (missingKeys.length > 0) {
    console.error("❌ Missing Firebase configuration keys:", missingKeys);
    throw new Error(`Missing Firebase config: ${missingKeys.join(", ")}`);
  }

  return {
    apiKey: window.ENV.FIREBASE_API_KEY,
    authDomain: window.ENV.FIREBASE_AUTH_DOMAIN,
    projectId: window.ENV.FIREBASE_PROJECT_ID,
    storageBucket: window.ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: window.ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId: window.ENV.FIREBASE_APP_ID,
  };
}

const firebaseConfig = loadFirebaseConfig();

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
export const storage = getStorage(app);

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
