// Firebase configuration for browser environment
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
  // Prefer runtime-injected window.ENV (dev) but fall back to Vite env (prod/CI).
  const runtimeEnv =
    typeof window !== "undefined" && window.ENV ? window.ENV : null;
  let viteEnv = null;
  try {
    viteEnv =
      typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : null;
  } catch (_) {
    viteEnv = null;
  }

  const getValue = (runtimeKey, viteKey) => {
    if (runtimeEnv && runtimeEnv[runtimeKey]) return runtimeEnv[runtimeKey];
    if (viteEnv && viteEnv[viteKey]) return viteEnv[viteKey];
    return "";
  };

  const apiKey = getValue("FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY");
  const authDomain = getValue("FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = getValue("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
  const storageBucket = getValue(
    "FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_STORAGE_BUCKET"
  );
  const messagingSenderId = getValue(
    "FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_MESSAGING_SENDER_ID"
  );
  const appId = getValue("FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID");
  const measurementId = getValue(
    "FIREBASE_MEASUREMENT_ID",
    "VITE_FIREBASE_MEASUREMENT_ID"
  );

  // Validate required Firebase configuration
  const missing = [];
  if (!apiKey) missing.push("FIREBASE_API_KEY / VITE_FIREBASE_API_KEY");
  if (!authDomain)
    missing.push("FIREBASE_AUTH_DOMAIN / VITE_FIREBASE_AUTH_DOMAIN");
  if (!projectId)
    missing.push("FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID");
  if (!storageBucket)
    missing.push("FIREBASE_STORAGE_BUCKET / VITE_FIREBASE_STORAGE_BUCKET");
  if (!messagingSenderId)
    missing.push(
      "FIREBASE_MESSAGING_SENDER_ID / VITE_FIREBASE_MESSAGING_SENDER_ID"
    );
  if (!appId) missing.push("FIREBASE_APP_ID / VITE_FIREBASE_APP_ID");

  if (missing.length > 0) {
    const isDev =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.DEV) ||
      (typeof window !== "undefined" &&
        window.ENV &&
        window.ENV.ENVIRONMENT !== "production");
    if (isDev) {
      console.error("❌ Missing Firebase configuration keys:", missing);
    } else {
      console.error("❌ Missing Firebase configuration keys");
    }
    throw new Error(
      "Missing environment configuration. For dev run: npm run dev (or npm run dev:config). For CI/prod set VITE_FIREBASE_* env vars."
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    // Optional but helps analytics initialize faster & provides fallback
    ...(measurementId
      ? { measurementId }
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
const __DEV__ =
  typeof window !== "undefined" &&
  (import.meta?.env?.DEV ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV === "development"));
if (__DEV__) {
  try {
    const mod = await import("firebase/firestore");
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
  } catch (e) {
    console.warn("Could not expose test API", e);
  }
}

// 🔧 FIX: Removed duplicate auth listener from firebase-config.js
// Security logging is now handled by auth-manager.js to prevent infinite loops
// This avoids having multiple auth state listeners that can trigger each other

export default app;
