// Firebase configuration for browser environment
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Browser-compatible configuration loading
// Load Firebase config from environment variables or fallback to embedded values
const firebaseConfig = {
  apiKey:
    window.ENV?.FIREBASE_API_KEY || "AIzaSyC_kanIBFqxyq8LLE4CKuzH24yEfCMjFiQ",
  authDomain:
    window.ENV?.FIREBASE_AUTH_DOMAIN || "meetchuthere-00.firebaseapp.com",
  projectId: window.ENV?.FIREBASE_PROJECT_ID || "meetchuthere-00",
  storageBucket:
    window.ENV?.FIREBASE_STORAGE_BUCKET ||
    "meetchuthere-00.firebasestorage.app",
  messagingSenderId: window.ENV?.FIREBASE_MESSAGING_SENDER_ID || "749689064628",
  appId:
    window.ENV?.FIREBASE_APP_ID || "1:749689064628:web:e757a95468a0a9a285dbe1",
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
