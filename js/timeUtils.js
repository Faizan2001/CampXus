// js/timeUtils.js

/**
 * Parses a time string (HH:MM) into total minutes from midnight.
 * @param {string} timeStr - The time string, e.g., "09:30".
 * @returns {number} Total minutes from midnight, or NaN if invalid.
 */
export function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return NaN;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return NaN;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    // Check if parsing was successful and values are in valid range
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return NaN; // Invalid time component
    }
    return hours * 60 + minutes;
}

/**
 * Checks if time1 is strictly before time2.
 * Assumes HH:MM format for inputs.
 * @param {string} time1 - First time string (HH:MM).
 * @param {string} time2 - Second time string (HH:MM).
 * @returns {boolean} True if time1 is before time2, false otherwise or if inputs are invalid.
 */
export function isTimeBefore(time1, time2) {
    const minutes1 = parseTime(time1);
    const minutes2 = parseTime(time2);

    // If either time is invalid (NaN from parseTime), comparison is not meaningful, return false.
    if (isNaN(minutes1) || isNaN(minutes2)) {
        console.error(`Invalid time encountered in isTimeBefore: ${time1}, ${time2}`);
        return false;
    }
    return minutes1 < minutes2;
}

/**
 * Validates time format (HH:MM or H:MM, optional AM/PM).
 * More flexible version from your existing code.
 * @param {string} time - The time string to validate.
 * @returns {boolean} True if valid format, false otherwise.
 */
export function isValidTimeFormat(time) {
  if (!time || typeof time !== "string") return false;
  // Allows HH:MM, HH:MM AM/PM, H:MM, H:MM AM/PM, also HH.MM
  const timeFormatRegex =
    /^\s*([0-1]?[0-9]|2[0-3])[:.]([0-5]\d)(\s*([AP]M))?\s*$/i;
  return timeFormatRegex.test(time.trim());
}

/**
 * Validates a stricter HH:MM time format.
 * @param {string} time - The time string to validate.
 * @returns {boolean} True if valid HH:MM format, false otherwise.
 */
export function isValidStrictHHMMTimeFormat(time) {
  if (!time || typeof time !== "string") return false;
  const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/; // HH:MM format
  return timeRegex.test(time.trim());
}

/**
 * Converts a time string (potentially with AM/PM) to a 24-hour HH:MM format string.
 * Example: "8:00 AM" -> "08:00", "5:30 PM" -> "17:30", "14:00" -> "14:00"
 * Returns original string if conversion is not applicable or fails.
 * @param {string} timeStr - The time string input.
 * @returns {string} Time string in HH:MM format.
 */
export function convertToHHMM(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return timeStr; // Or throw error/return null

  const trimmedTime = timeStr.trim().toUpperCase();
  // Regex to capture hours, minutes, and AM/PM
  // Allows H:MM, HH:MM, with optional space before AM/PM
  const match = trimmedTime.match(/^(\d{1,2})[:.](\d{2})\s*([AP]M)?$/);

  if (!match) {
    // If it doesn't match the expected pattern (e.g., already "HH:MM" or invalid)
    // and it's a valid HH:MM format, return it. Otherwise, it might be invalid.
    if (isValidStrictHHMMTimeFormat(trimmedTime)) return trimmedTime; // e.g. "14:30"
    return timeStr; // Return original if not AM/PM and not strictly HH:MM (let other validators catch it)
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]; // AM/PM or undefined

  if (isNaN(hours) || isNaN(minutes)) return timeStr; // Should not happen if regex matches digits

  if (period) {
    // If AM/PM is present
    if (period === "PM" && hours < 12) {
      hours += 12;
    } else if (period === "AM" && hours === 12) {
      // Midnight case: 12 AM is 00 hours
      hours = 0;
    }
  }
  // Ensure hours and minutes are two digits (e.g., "08:00" not "8:0")
  const formattedHours = String(hours).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");

  return `${formattedHours}:${formattedMinutes}`;
}
