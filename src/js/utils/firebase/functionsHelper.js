/**
 * functionsHelper.js
 *
 * Utility for calling Firebase Cloud Functions with automatic emulator detection.
 * Eliminates boilerplate for connecting to emulators in development.
 */

import app from "../../lib/firebase/firebase-config.js";

// Track if emulator has been connected (only needs to happen once per session)
let emulatorConnected = false;

/**
 * Check if running on localhost (development environment)
 * @returns {boolean}
 */
export function isLocalhost() {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

/**
 * Get a callable Cloud Function with automatic emulator connection in development.
 *
 * @param {string} functionName - The name of the Cloud Function to call
 * @returns {Promise<Function>} - A callable function that accepts data and returns a promise
 *
 * @example
 * const promoteOfficial = await getCallableFunction("promoteClubOfficial");
 * await promoteOfficial({ clubId: "abc", userId: "xyz" });
 */
export async function getCallableFunction(functionName) {
  const { getFunctions, httpsCallable, connectFunctionsEmulator } =
    await import("firebase/functions");

  const functions = getFunctions(app, "us-central1");

  // Connect to emulator once in development
  if (isLocalhost() && !emulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "localhost", 5001);
      emulatorConnected = true;
    } catch (_) {
      // Emulator already connected or unavailable; non-fatal
    }
  }

  return httpsCallable(functions, functionName);
}

/**
 * Call a Cloud Function directly with the given data.
 * Convenience wrapper that combines getCallableFunction + invocation.
 *
 * @param {string} functionName - The name of the Cloud Function to call
 * @param {Object} data - The data to pass to the function
 * @returns {Promise<Object>} - The result from the Cloud Function
 *
 * @example
 * const result = await callFunction("promoteClubOfficial", { clubId: "abc", userId: "xyz" });
 */
export async function callFunction(functionName, data = {}) {
  const callable = await getCallableFunction(functionName);
  return callable(data);
}
