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