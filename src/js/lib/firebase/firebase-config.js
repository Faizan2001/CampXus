// Firebase configuration for browser environment
import "./env-config.js";
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
} from "firebase/auth";
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
  // Prefer structured logging via logManager when available
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.system.init("Firebase initialized successfully");
  } else {
    console.log("Firebase initialized successfully");
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
  throw new Error("Failed to initialize Firebase");
}

// Initialize Auth with explicit persistence configuration to reduce IDBRequest listeners
let auth;
try {
  // Try browserLocalPersistence first (uses localStorage, fewer IDBRequest listeners)
  auth = initializeAuth(app, {
    persistence: [browserLocalPersistence, indexedDBLocalPersistence],
  });
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.auth.user(
      "Firebase Auth initialized with optimized persistence (localStorage priority)"
    );
  } else {
    console.log(
      "✅ Firebase Auth initialized with optimized persistence (localStorage priority)"
    );
  }
} catch (error) {
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.auth.error(
      "Failed to initialize Auth with custom persistence, falling back to default",
      { message: error.message }
    );
  } else {
    console.warn(
      "⚠️ Failed to initialize Auth with custom persistence, falling back to default:",
      error.message
    );
  }
  // Fallback to default auth initialization if custom persistence fails
  const { getAuth } = await import("firebase/auth");
  auth = getAuth(app);
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.auth.user(
      "Firebase Auth initialized with default persistence"
    );
  } else {
    console.log("✅ Firebase Auth initialized with default persistence");
  }
}

// Initialize other services with error handling
export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

// 🔧 FIX: Removed duplicate auth listener from firebase-config.js
// Security logging is now handled by auth-manager.js to prevent infinite loops
// This avoids having multiple auth state listeners that can trigger each other

export default app;
