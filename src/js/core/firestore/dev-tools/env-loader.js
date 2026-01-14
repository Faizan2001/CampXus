// Environment variable loader for browser applications
// This script loads environment variables and makes them available to the client
// SECURITY: Uses JSON parsing instead of eval() to prevent code injection

/**
 * Loads environment variables from .env.local file for development
 * In production, these should be set via your hosting platform
 */
async function loadEnvironmentVariables() {
  // Check if we're in development mode
  const isDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.includes("local");

  if (isDevelopment) {
    try {
      // For development, we'll load from a generated JSON config file
      // SECURITY FIX: Use JSON instead of eval() to prevent code injection
      const response = await fetch("./js/firebase/env-config.json");
      if (response.ok) {
        const config = await response.json();
        // Safely assign config to window.ENV
        window.ENV = Object.freeze({
          FIREBASE_API_KEY: config.FIREBASE_API_KEY || "",
          FIREBASE_AUTH_DOMAIN: config.FIREBASE_AUTH_DOMAIN || "",
          FIREBASE_PROJECT_ID: config.FIREBASE_PROJECT_ID || "",
          FIREBASE_STORAGE_BUCKET: config.FIREBASE_STORAGE_BUCKET || "",
          FIREBASE_MESSAGING_SENDER_ID: config.FIREBASE_MESSAGING_SENDER_ID || "",
          FIREBASE_APP_ID: config.FIREBASE_APP_ID || "",
          FIREBASE_MEASUREMENT_ID: config.FIREBASE_MEASUREMENT_ID || "",
        });
        console.log("Development environment variables loaded (secure JSON)");
      } else {
        console.warn(
          "Could not load environment config, using fallback values"
        );
      }
    } catch (error) {
      console.warn("Failed to load environment variables:", error);
      console.log("Using fallback Firebase configuration");
    }
  }

  // For production, environment variables should be injected by your build process
  // or hosting platform (Vercel, Netlify, etc.)
}

// Initialize environment variables when script loads
loadEnvironmentVariables();
