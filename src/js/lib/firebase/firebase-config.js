// Firebase configuration for browser environment
import "./env-config.js";
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from "firebase/firestore";

// Browser-compatible configuration loading
// Load Firebase config from environment variables with security validation
function loadFirebaseConfig() {
  // Check if environment configuration is loaded
  if (!window.ENV) {
    console.error("❌ Environment configuration not loaded");
    throw new Error(
      "Missing environment configuration. Please run: npm run dev:serve",
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
    // Optional but helps analytics initialize faster & provides fallback
    ...(window.ENV.FIREBASE_MEASUREMENT_ID
      ? { measurementId: window.ENV.FIREBASE_MEASUREMENT_ID }
      : {}),
  };
}

const firebaseConfig = loadFirebaseConfig();

// Initialize Firebase with error handling
let app;
try {
  app = initializeApp(firebaseConfig);
  // Prefer structured logging via logManager when available
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.dev.debug("Firebase initialized successfully");
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
  throw new Error("Failed to initialize Firebase");
}

// Initialize Auth with explicit persistence configuration to reduce IDBRequest listeners
let auth;
let db;
try {
  // Try browserLocalPersistence first (uses localStorage, fewer IDBRequest listeners)
  auth = initializeAuth(app, {
    persistence: [browserLocalPersistence, indexedDBLocalPersistence],
  });
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.dev.debug(
      "Firebase Auth initialized with optimized persistence (localStorage priority)",
    );
  }
} catch (error) {
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.auth.error(
      "Failed to initialize Auth with custom persistence, falling back to default",
      { message: error.message },
    );
  } else {
    console.warn(
      "⚠️ Failed to initialize Auth with custom persistence, falling back to default:",
      error.message,
    );
  }
  // Fallback to default auth initialization if custom persistence fails
  const { getAuth } = await import("firebase/auth");
  auth = getAuth(app);
  if (typeof window !== "undefined" && window.logManager) {
    window.logManager.dev.debug(
      "Firebase Auth initialized with default persistence",
    );
  }
}

// Initialize Firestore with modern persistent cache (multi-tab friendly)
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error) {
  // Fallback to default Firestore if persistence setup fails
  console.warn(
    "⚠️ Failed to initialize Firestore with persistent cache (non-fatal):",
    error?.message || error,
  );
  db = getFirestore(app);
}

// Initialize other services with error handling
export { auth };
export { db };

// Functions instance (will be connected to emulator if localhost)
let functions = null;

// Connect to emulators in development (localhost only)
const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

if (isLocalhost) {
  const { connectAuthEmulator } = await import("firebase/auth");
  const { connectFirestoreEmulator } = await import("firebase/firestore");
  const { getFunctions, connectFunctionsEmulator } =
    await import("firebase/functions");

  try {
    // Connect Auth emulator
    connectAuthEmulator(auth, "http://localhost:9099", {
      disableWarnings: true,
    });

    // Connect Firestore emulator
    connectFirestoreEmulator(db, "localhost", 8080);

    // Connect Functions emulator
    functions = getFunctions(app, "us-central1");
    connectFunctionsEmulator(functions, "localhost", 5001);

    console.log(
      "%c🔧 EMULATOR MODE 🔧",
      "background: #ff6b6b; color: white; font-size: 16px; font-weight: bold; padding: 8px 16px; border-radius: 4px;",
    );
    console.log(
      "%cConnected to Firebase Emulators:\n" +
        "  • Auth:      http://localhost:9099\n" +
        "  • Firestore: http://localhost:8080\n" +
        "  • Functions: http://localhost:5001\n" +
        "  • Storage:   http://localhost:9199\n" +
        "  • UI:        http://localhost:4000",
      "color: #51cf66; font-weight: bold;",
    );
    console.log(
      "%c⚠️  Data will NOT persist unless you use --export-on-exit",
      "color: #ffd43b; font-weight: bold;",
    );
  } catch (error) {
    console.warn(
      "⚠️ Emulator connection failed (may already be connected):",
      error.message,
    );
  }
}

export { functions };

export async function getFunctionsInstance() {
  if (functions) return functions;
  const { getFunctions } = await import("firebase/functions");
  return getFunctions(app, "us-central1");
}

export async function getStorageInstance() {
  const { getStorage, connectStorageEmulator } =
    await import("firebase/storage");
  const storage = getStorage(app);

  // Connect Storage emulator in development
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  if (isLocalhost) {
    try {
      connectStorageEmulator(storage, "localhost", 9199);
    } catch (error) {
      // Already connected, ignore
    }
  }

  return storage;
}

// TEMPORARY: Expose Firestore helpers globally for manual console testing of handle system
// Remove after Phase 2 once dedicated admin tooling or test harness is in place.
if (typeof window !== "undefined") {
  try {
    import("firebase/firestore").then((mod) => {
      window.__fireTest = {
        db,
        auth, // expose auth for console-based experiments
        doc: mod.doc,
        setDoc: mod.setDoc,
        getDoc: mod.getDoc,
        serverTimestamp: mod.serverTimestamp,
        runTransaction: mod.runTransaction,
        collection: mod.collection,
      };
      console.log(
        "%cHandle Dev Test API available as window.__fireTest",
        "color:#4ade80",
      );
    });
  } catch (e) {
    console.warn("Could not expose test API", e);
  }
}

// 🔧 FIX: Removed duplicate auth listener from firebase-config.js
// Security logging is now handled by auth-manager.js to prevent infinite loops
// This avoids having multiple auth state listeners that can trigger each other

export default app;
