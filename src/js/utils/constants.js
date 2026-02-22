export const DEFAULT_TIMESLOTS = [
  { start: "08:00", end: "09:15", label: "08:00-09:15" },
  { start: "09:20", end: "10:35", label: "09:20-10:35" },
  { start: "10:40", end: "11:55", label: "10:40-11:55" },
  { start: "12:00", end: "13:15", label: "12:00-13:15" },
  { start: "13:20", end: "14:35", label: "13:20-14:35" },
  { start: "14:40", end: "15:55", label: "14:40-15:55" },
];

// Time slot inference map for mobile-responsive OCR (handles partial/cut-off times)
// Maps start time patterns to complete time slots for robust recognition
export const TIME_SLOT_INFERENCE_MAP = {
  // Hour-based mapping (most robust - works even with just hour visible)
  "08": { start: "08:00", end: "09:15", label: "08:00-09:15", slot: 0 },
  "09": { start: "09:20", end: "10:35", label: "09:20-10:35", slot: 1 },
  10: { start: "10:40", end: "11:55", label: "10:40-11:55", slot: 2 },
  12: { start: "12:00", end: "13:15", label: "12:00-13:15", slot: 3 },
  13: { start: "13:20", end: "14:35", label: "13:20-14:35", slot: 4 },
  14: { start: "14:40", end: "15:55", label: "14:40-15:55", slot: 5 },
  18: { start: "18:30", end: "21:30", label: "18:30-21:30", slot: 6 },

  // Full start time mapping (most precise)
  "08:00": { start: "08:00", end: "09:15", label: "08:00-09:15", slot: 0 },
  "09:20": { start: "09:20", end: "10:35", label: "09:20-10:35", slot: 1 },
  "10:40": { start: "10:40", end: "11:55", label: "10:40-11:55", slot: 2 },
  "12:00": { start: "12:00", end: "13:15", label: "12:00-13:15", slot: 3 },
  "13:20": { start: "13:20", end: "14:35", label: "13:20-14:35", slot: 4 },
  "14:40": { start: "14:40", end: "15:55", label: "14:40-15:55", slot: 5 },
  "18:30": { start: "18:30", end: "21:30", label: "18:30-21:30", slot: 6 },

  // Partial time patterns (handles OCR variations)
  "8:00": { start: "08:00", end: "09:15", label: "08:00-09:15", slot: 0 },
  "9:20": { start: "09:20", end: "10:35", label: "09:20-10:35", slot: 1 },
  800: { start: "08:00", end: "09:15", label: "08:00-09:15", slot: 0 },
  920: { start: "09:20", end: "10:35", label: "09:20-10:35", slot: 1 },
  1040: { start: "10:40", end: "11:55", label: "10:40-11:55", slot: 2 },
  1200: { start: "12:00", end: "13:15", label: "12:00-13:15", slot: 3 },
  1320: { start: "13:20", end: "14:35", label: "13:20-14:35", slot: 4 },
  1440: { start: "14:40", end: "15:55", label: "14:40-15:55", slot: 5 },
  1830: { start: "18:30", end: "21:30", label: "18:30-21:30", slot: 6 },
};

/**
 * Infer complete time slot from partial time information
 * Handles mobile-responsive OCR where end times might be cut off
 * @param {string} partialTime - Partial time like "14", "14:40", "14:40-", "ST:14"
 * @returns {Object|null} Complete time slot info or null if not found
 */
export function inferTimeSlotFromPartial(partialTime) {
  if (!partialTime || typeof partialTime !== "string") {
    return null;
  }

  // Clean the input - remove day codes, colons, dashes, spaces
  const cleanTime = partialTime
    .replace(/^[A-Z]{1,3}:?/i, "") // Remove day codes like "ST:", "MW:", "AR:"
    .replace(/[-\s]+.*$/, "") // Remove everything after dash or space
    .replace(/[^\d:]/g, "") // Keep only digits and colons
    .trim();

  console.log(
    `🕐 Inferring time slot from: "${partialTime}" → cleaned: "${cleanTime}"`
  );

  // Try exact matches first
  if (TIME_SLOT_INFERENCE_MAP[cleanTime]) {
    const result = TIME_SLOT_INFERENCE_MAP[cleanTime];
    console.log(`✅ Exact match found: ${cleanTime} → ${result.label}`);
    return result;
  }

  // Try hour-only matches
  const hourMatch = cleanTime.match(/^(\d{1,2})/);
  if (hourMatch) {
    const hour = hourMatch[1].padStart(2, "0");
    if (TIME_SLOT_INFERENCE_MAP[hour]) {
      const result = TIME_SLOT_INFERENCE_MAP[hour];
      console.log(`✅ Hour match found: ${hour} → ${result.label}`);
      return result;
    }
  }

  // Try partial time patterns (like "14:4" for "14:40")
  const partialMatch = cleanTime.match(/^(\d{1,2}):?(\d{1,2})?/);
  if (partialMatch) {
    const [, hour, minute] = partialMatch;
    const paddedHour = hour.padStart(2, "0");

    // Try with just the hour
    if (TIME_SLOT_INFERENCE_MAP[paddedHour]) {
      const result = TIME_SLOT_INFERENCE_MAP[paddedHour];
      console.log(`✅ Partial match found: ${paddedHour} → ${result.label}`);
      return result;
    }

    // Try reconstructing the full time if we have partial minutes
    if (minute) {
      const possibleTimes = [
        `${paddedHour}:${minute.padEnd(2, "0")}`, // "14:4" → "14:40"
        `${paddedHour}:${minute}0`, // "14:4" → "14:40"
        `${paddedHour}:${minute}`, // "14:4" → "14:4"
      ];

      for (const possibleTime of possibleTimes) {
        if (TIME_SLOT_INFERENCE_MAP[possibleTime]) {
          const result = TIME_SLOT_INFERENCE_MAP[possibleTime];
          console.log(
            `✅ Reconstructed match found: ${possibleTime} → ${result.label}`
          );
          return result;
        }
      }
    }
  }

  console.warn(`❌ No time slot inference possible for: "${partialTime}"`);
  return null;
}

export const LOCAL_STORAGE_KEY = "scheduleUsers";

// University day codes mapping (from Phase-0 plan)
export const UNIVERSITY_DAY_CODES = {
  ST: ["Sunday", "Tuesday"], // Sunday + Tuesday
  MW: ["Monday", "Wednesday"], // Monday + Wednesday
  AR: ["Thursday", "Saturday"], // Thursday + Saturday
  T: ["Tuesday"], // Tuesday only
  TR: ["Tuesday", "Thursday"], // Tuesday + Thursday
  MWF: ["Monday", "Wednesday", "Friday"], // Monday + Wednesday + Friday

  // Single day codes (if needed)
  S: ["Sunday"],
  M: ["Monday"],
  W: ["Wednesday"],
  A: ["Thursday"], // 'A' represents Thursday in university system
  F: ["Friday"],
  R: ["Saturday"], // 'R' represents Saturday in university system
};

// Schedule parsing patterns for text import
export const SCHEDULE_PARSING_PATTERNS = {
  // Main pattern: "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z"
  // Updated to handle OCR truncated text like "Introduction to Inte..."
  MAIN_PATTERN:
    /^([A-Z]{2,4}\d{3,4}L?)\s+(.+?(?:\.\.\.)?\s*)\s+(\d+)\s+(?:([A-Z]{1,2}\d{3,4}L?|GPLab|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))\s+([A-Z]{1,5}):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s*(.*)$/,

  // OCR-friendly pattern that's more flexible with spacing and truncated text
  OCR_PATTERN:
    /^([A-Z]{2,4}\d{3,4}L?)\s+(.+?(?:\.\.\.)?\s*)\s+(\d+)\s+(?:([A-Z]{1,2}\d{3,4}L?|GPLab|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))\s+([A-Z]{1,5}):(\d{1,2}:\d{1,2})-(\d{1,2}:\d{1,2})\s*(.*)$/,

  // Mobile-responsive pattern for cut-off end times: "CMN205 ... ST:14:40-" or "CMN205 ... ST:14-"
  MOBILE_CUTOFF_PATTERN:
    /^([A-Z]{2,4}\d{3,4}L?)\s+(.+?(?:\.\.\.)?\s*)\s+(\d+)\s+(?:([A-Z]{1,2}\d{3,4}L?|GPLab|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))\s+([A-Z]{1,5}):(\d{1,2}:?\d{0,2})-?(CUTOFF|$)\s*(.*)$/,

  // Pattern for partial times with inference: "CMN205 ... ST:14" (just hour visible)
  PARTIAL_TIME_PATTERN:
    /^([A-Z]{2,4}\d{3,4}L?)\s+(.+?(?:\.\.\.)?\s*)\s+(\d+)\s+(?:([A-Z]{1,2}\d{3,4}L?|GPLab|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))\s+([A-Z]{1,5}):(\d{1,2})\s*(.*)$/,

  // Alternative pattern for multiline or different formats
  MULTILINE_PATTERN:
    /^([A-Z]{2,4}\d{3,4}L?)\s+(.+?)\s+(\d+)\s+((?:GPLab|[A-Z]{1,2}\d{3,4}L?|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))\s+([A-Z]{1,5}):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(.+)$/,

  // Enhanced OCR patterns for heavily corrupted text from image recognition
  OCR_FLEXIBLE_PATTERN:
    /^([A-Za-z0-9]{3,8})\s+(.+?)\s+(\d+)\s+((?:[A-Z]{1,3}\d{2,4}L?|GPLab|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))\s*([A-Z]{1,5})[:\s]*([A0-9]{1,2}[:\s;][A0-9]{1,2}[-:\s][A0-9]{1,2}[:\s;]?[A0-9]{0,2})\s*(.*)$/,

  // Pattern for malformed times like "T:A8:3021:30" or "ST16:20-17:50"
  OCR_BROKEN_TIME_PATTERN:
    /^([A-Za-z0-9]{3,7})\s+(.+?)\s+(\d+)\s+([A-Z]{1,3}\d{2,4}|GPLab)\s*([A-Z]{1,5})[:\s]*(.+)$/,

  // Course info pattern (for when course info and schedule are on separate lines)
  COURSE_INFO_PATTERN:
    /^([A-Z]{2,4}\d{3,4}L?)\s+(.+?)\s+(\d+)\s+((?:[A-Z]{1,2}\d{3,4}L?|GPLab|[A-Z]{1,4}Lab\d*|[A-Z]{2,5}LAB\d*))$/,

  // Schedule line pattern (for when schedule is on separate line)
  SCHEDULE_LINE_PATTERN:
    /^([A-Z]{1,5}):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(.+)$/,

  // Time normalization pattern (handles OCR errors like "16:1" → "16:10")
  TIME_NORMALIZATION: /(\d{1,2}):?(\d{1,2}?)-(\d{1,2}):?(\d{1,2}?)/,
};
