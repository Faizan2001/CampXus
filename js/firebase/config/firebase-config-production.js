// js/firebase/config/firebase-config-production.js
// This file provides the Firebase configuration for production environments
// where env-config.js (generated locally and gitignored) is not available.

// IMPORTANT: Replace these placeholder values with your ACTUAL Firebase project configuration!
// These keys are safe to be included in client-side code for Firebase web applications.
const firebaseProductionConfig = {
  FIREBASE_API_KEY: "AIzaSyC_kanIBFqxyq8LLE4CKuzH24yEfCMjFiQ",
  FIREBASE_AUTH_DOMAIN: "meetchuthere-00.firebaseapp.com",
  FIREBASE_PROJECT_ID: "meetchuthere-00",
  FIREBASE_STORAGE_BUCKET: "meetchuthere-00.firebasestorage.app",
  FIREBASE_MESSAGING_SENDER_ID: "749689064628",
  FIREBASE_APP_ID: "1:749689064628:web:e757a95468a0a9a285dbe1",
  // Optional: Add FIREBASE_MEASUREMENT_ID if you use Google Analytics for Firebase
  // FIREBASE_MEASUREMENT_ID: "YOUR_PRODUCTION_FIREBASE_MEASUREMENT_ID"
};

// Only define window.ENV if it's not already defined (e.g., by env-config.js in local development)
if (typeof window.ENV === "undefined") {
  console.log(
    "🚀 Production Firebase config loaded: window.ENV was not defined, setting it now."
  );
  window.ENV = firebaseProductionConfig;
} else {
  console.log(
    "🔧 Development Firebase config (window.ENV) already loaded. Production config will not override."
  );
}
