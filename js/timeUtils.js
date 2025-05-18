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
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return NaN;
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
    if (isNaN(minutes1) || isNaN(minutes2)) return false; // Invalid time format
    return minutes1 < minutes2;
}

/**
 * Validates time format (HH:MM or H:MM, optional AM/PM).
 * More flexible version from your existing code.
 * @param {string} time - The time string to validate.
 * @returns {boolean} True if valid format, false otherwise.
 */
export function isValidTimeFormat(time) {
    if (!time || typeof time !== 'string') return false;
    // Allows HH:MM, HH:MM AM/PM, H:MM, H:MM AM/PM, also HH.MM
    const timeFormatRegex = /^\s*([0-1]?[0-9]|2[0-3])[:.]([0-5]\d)(\s*([AP]M))?\s*$/i;
    return timeFormatRegex.test(time.trim());
}

/**
 * Validates a stricter HH:MM time format.
 * @param {string} time - The time string to validate.
 * @returns {boolean} True if valid HH:MM format, false otherwise.
 */
export function isValidStrictHHMMTimeFormat(time) {
    if (!time || typeof time !== 'string') return false;
    const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/; // HH:MM format
    return timeRegex.test(time.trim());
}