// Environment variable loader for browser applications
// This script loads environment variables and makes them available to the client

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
      // For development, we'll load from a generated config file
      const response = await fetch("./js/firebase/env-config.js");
      if (response.ok) {
        const configScript = await response.text();
        // Safely evaluate the config
        eval(configScript);
        console.log("Development environment variables loaded");
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
