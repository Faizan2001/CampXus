// js/timeUtils.js

/**
 * University-specific time parsing (enhanced for Phase-0 schedule import)
 * Handles OCR errors and multiple formats commonly found in university schedules
 * @param {string} timeStr - Time string from university schedule
 * @returns {string} Normalized time string in HH:MM format
 */
export function parseUniversityTime(timeStr) {
  // Use existing convertToHHMM which already handles OCR errors
  return convertToHHMM(timeStr);
}

/**
 * Validates time format in strict HH:MM (24-hour) format.
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
  const ampm = match[3];

  // Convert to 24-hour format if AM/PM is present
  if (ampm) {
    if (ampm === "AM" && hours === 12) {
      hours = 0; // 12 AM is 00:xx
    } else if (ampm === "PM" && hours !== 12) {
      hours += 12; // PM hours (except 12 PM)
    }
    // 12 PM remains 12:xx
  }

  // Format as HH:MM
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
}

/**
 * Parses a time string into total minutes from midnight.
 * Supports multiple formats: HH:MM, H:MM, H:MM AM/PM, HH:MM AM/PM
 * @param {string} timeStr - The time string, e.g., "09:30", "9:30 AM", "5:00 PM".
 * @returns {number} Total minutes from midnight, or NaN if invalid.
 */
export function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return NaN;

  // First, try to convert to HH:MM format using existing function
  const normalizedTime = convertToHHMM(timeStr);

  // If conversion failed or resulted in the same string and it's not valid HH:MM, return NaN
  if (!isValidStrictHHMMTimeFormat(normalizedTime)) {
    return NaN;
  }

  // Parse the normalized HH:MM format
  const parts = normalizedTime.split(":");
  if (parts.length !== 2) return NaN;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  // Check if parsing was successful and values are in valid range
  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return NaN; // Invalid time component
  }
  return hours * 60 + minutes;
}

/**
 * Converts total minutes from midnight back to HH:MM format.
 * @param {number} totalMinutes - Total minutes from midnight.
 * @returns {string} Time string in HH:MM format, or "Invalid" if input is invalid.
 */
export function minutesToTimeString(totalMinutes) {
  if (
    typeof totalMinutes !== "number" ||
    isNaN(totalMinutes) ||
    totalMinutes < 0 ||
    totalMinutes >= 1440
  ) {
    return "Invalid";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
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
    console.error(
      `Invalid time encountered in isTimeBefore: ${time1}, ${time2}`
    );
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
 * Represents a time interval with start and end times.
 * Provides methods for overlap detection, merging, and comparison.
 */
export class TimeInterval {
  /**
   * Creates a new TimeInterval.
   * @param {string|number} start - Start time (HH:MM format or minutes from midnight)
   * @param {string|number} end - End time (HH:MM format or minutes from midnight)
   * @param {string} [label] - Optional label for the interval
   */
  constructor(start, end, label = "") {
    // Convert to minutes if string format
    this.startMinutes = typeof start === "string" ? parseTime(start) : start;
    this.endMinutes = typeof end === "string" ? parseTime(end) : end;
    this.label = label;

    // Validate
    if (isNaN(this.startMinutes) || isNaN(this.endMinutes)) {
      throw new Error(`Invalid time interval: ${start} - ${end}`);
    }

    if (this.startMinutes >= this.endMinutes) {
      throw new Error(`Start time must be before end time: ${start} - ${end}`);
    }
  }

  /**
   * Gets the start time in HH:MM format.
   * @returns {string} Start time as HH:MM
   */
  get startTime() {
    return minutesToTimeString(this.startMinutes);
  }

  /**
   * Gets the end time in HH:MM format.
   * @returns {string} End time as HH:MM
   */
  get endTime() {
    return minutesToTimeString(this.endMinutes);
  }

  /**
   * Gets the duration in minutes.
   * @returns {number} Duration in minutes
   */
  get duration() {
    return this.endMinutes - this.startMinutes;
  }

  /**
   * Checks if this interval overlaps with another interval.
   * @param {TimeInterval} other - The other interval to check
   * @returns {boolean} True if intervals overlap
   */
  overlaps(other) {
    return (
      this.startMinutes < other.endMinutes &&
      this.endMinutes > other.startMinutes
    );
  }

  /**
   * Checks if this interval contains another interval completely.
   * @param {TimeInterval} other - The other interval to check
   * @returns {boolean} True if this interval contains the other
   */
  contains(other) {
    return (
      this.startMinutes <= other.startMinutes &&
      this.endMinutes >= other.endMinutes
    );
  }

  /**
   * Checks if this interval is contained within another interval.
   * @param {TimeInterval} other - The other interval to check
   * @returns {boolean} True if this interval is within the other
   */
  isWithin(other) {
    return other.contains(this);
  }

  /**
   * Gets the overlap between this interval and another.
   * @param {TimeInterval} other - The other interval
   * @returns {TimeInterval|null} The overlapping interval, or null if no overlap
   */
  getOverlap(other) {
    if (!this.overlaps(other)) {
      return null;
    }

    const overlapStart = Math.max(this.startMinutes, other.startMinutes);
    const overlapEnd = Math.min(this.endMinutes, other.endMinutes);

    return new TimeInterval(
      overlapStart,
      overlapEnd,
      `${this.label} ∩ ${other.label}`.trim()
    );
  }

  /**
   * Merges this interval with another if they overlap or are adjacent.
   * @param {TimeInterval} other - The other interval to merge with
   * @returns {TimeInterval|null} Merged interval, or null if they can't be merged
   */
  merge(other) {
    // Check if intervals overlap or are adjacent (no gap between them)
    if (
      this.overlaps(other) ||
      this.endMinutes === other.startMinutes ||
      other.endMinutes === this.startMinutes
    ) {
      const mergedStart = Math.min(this.startMinutes, other.startMinutes);
      const mergedEnd = Math.max(this.endMinutes, other.endMinutes);
      const mergedLabel =
        this.label && other.label
          ? `${this.label}+${other.label}`
          : this.label || other.label;

      return new TimeInterval(mergedStart, mergedEnd, mergedLabel);
    }

    return null;
  }

  /**
   * Splits this interval at a specific time point.
   * @param {string|number} splitTime - Time to split at (HH:MM or minutes)
   * @returns {TimeInterval[]} Array of resulting intervals (1 or 2 intervals)
   */
  split(splitTime) {
    const splitMinutes =
      typeof splitTime === "string" ? parseTime(splitTime) : splitTime;

    if (
      isNaN(splitMinutes) ||
      splitMinutes <= this.startMinutes ||
      splitMinutes >= this.endMinutes
    ) {
      return [this]; // No split needed or invalid split point
    }

    return [
      new TimeInterval(this.startMinutes, splitMinutes, `${this.label}_part1`),
      new TimeInterval(splitMinutes, this.endMinutes, `${this.label}_part2`),
    ];
  }

  /**
   * Returns a string representation of the interval.
   * @returns {string} String representation
   */
  toString() {
    const timeRange = `${this.startTime}-${this.endTime}`;
    return this.label ? `${this.label} (${timeRange})` : timeRange;
  }

  /**
   * Creates a copy of this interval.
   * @returns {TimeInterval} A copy of this interval
   */
  clone() {
    return new TimeInterval(this.startMinutes, this.endMinutes, this.label);
  }
}

/**
 * Merges overlapping intervals in an array and returns sorted, non-overlapping intervals.
 * @param {TimeInterval[]} intervals - Array of time intervals
 * @returns {TimeInterval[]} Array of merged, non-overlapping intervals
 */
export function mergeOverlappingIntervals(intervals) {
  if (!intervals || intervals.length === 0) {
    return [];
  }

  // Sort intervals by start time
  const sorted = intervals
    .slice()
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const merged = [sorted[0].clone()];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastMerged = merged[merged.length - 1];

    const mergedInterval = lastMerged.merge(current);
    if (mergedInterval) {
      // Replace the last merged with the new merged interval
      merged[merged.length - 1] = mergedInterval;
    } else {
      // No overlap, add as separate interval
      merged.push(current.clone());
    }
  }

  return merged;
}

/**
 * Merges only truly overlapping intervals (not adjacent ones) for schedule comparison.
 * This preserves distinct time slots even if they're adjacent.
 * @param {TimeInterval[]} intervals - Array of time intervals
 * @returns {TimeInterval[]} Array of merged intervals, keeping adjacent intervals separate
 */
export function mergeOnlyOverlappingIntervals(intervals) {
  if (!intervals || intervals.length === 0) {
    return [];
  }

  // Sort intervals by start time
  const sorted = intervals
    .slice()
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const merged = [sorted[0].clone()];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastMerged = merged[merged.length - 1];

    // Only merge if they truly overlap (not just adjacent)
    if (lastMerged.overlaps(current)) {
      const mergedInterval = lastMerged.merge(current);
      if (mergedInterval) {
        merged[merged.length - 1] = mergedInterval;
      }
    } else {
      // No overlap, add as separate interval
      merged.push(current.clone());
    }
  }

  return merged;
}

/**
 * Finds all overlaps between two arrays of time intervals.
 * @param {TimeInterval[]} intervals1 - First set of intervals
 * @param {TimeInterval[]} intervals2 - Second set of intervals
 * @returns {TimeInterval[]} Array of overlapping intervals
 */
export function findOverlaps(intervals1, intervals2) {
  const overlaps = [];

  for (const interval1 of intervals1) {
    for (const interval2 of intervals2) {
      const overlap = interval1.getOverlap(interval2);
      if (overlap) {
        overlaps.push(overlap);
      }
    }
  }

  return mergeOverlappingIntervals(overlaps);
}

/**
 * Creates TimeInterval objects from time slot objects.
 * @param {Array} timeSlots - Array of time slot objects with start, end, label properties
 * @returns {TimeInterval[]} Array of TimeInterval objects
 */
export function createIntervalsFromTimeSlots(timeSlots) {
  if (!timeSlots || !Array.isArray(timeSlots)) {
    return [];
  }

  return timeSlots
    .map((slot) => {
      try {
        return new TimeInterval(slot.start, slot.end, slot.label);
      } catch (error) {
        console.warn(
          `Skipping invalid time slot: ${slot.start}-${slot.end}`,
          error
        );
        return null;
      }
    })
    .filter((interval) => interval !== null);
}

/**
 * Advanced validation for adding a new time slot to a user's schedule.
 * Provides detailed validation results with specific error messages.
 *
 * @param {string} startTime - Start time in any supported format
 * @param {string} endTime - End time in any supported format
 * @param {Array} existingTimeSlots - Array of existing time slot objects
 * @param {Object} options - Validation options
 * @param {boolean} options.allowOverlaps - Whether to allow overlapping slots (default: false)
 * @param {boolean} options.requireSequential - Whether new slots must be sequential (default: true)
 * @param {number} options.minDuration - Minimum duration in minutes (default: 15)
 * @param {number} options.maxDuration - Maximum duration in minutes (default: 480)
 * @returns {Object} Validation result with success, errors, warnings, and normalized times
 */
export function validateTimeSlotAdvanced(
  startTime,
  endTime,
  existingTimeSlots = [],
  options = {}
) {
  const result = {
    success: false,
    errors: [],
    warnings: [],
    normalizedStartTime: null,
    normalizedEndTime: null,
    suggestedLabel: null,
    conflictingSlots: [],
    duration: 0,
  };

  // Set default options
  const {
    allowOverlaps = false,
    requireSequential = true,
    minDuration = 15,
    maxDuration = 480, // 8 hours
  } = options;

  // Step 1: Validate and normalize input formats
  if (!startTime || typeof startTime !== "string") {
    result.errors.push("Start time is required and must be a string");
    return result;
  }

  if (!endTime || typeof endTime !== "string") {
    result.errors.push("End time is required and must be a string");
    return result;
  }

  // Step 2: Convert to HH:MM format
  const normalizedStart = convertToHHMM(startTime.trim());
  const normalizedEnd = convertToHHMM(endTime.trim());

  // Step 3: Validate converted formats
  if (!isValidStrictHHMMTimeFormat(normalizedStart)) {
    result.errors.push(
      `Invalid start time format: "${startTime}". Use formats like "08:00", "8:00 AM", or "5:30 PM"`
    );
    return result;
  }

  if (!isValidStrictHHMMTimeFormat(normalizedEnd)) {
    result.errors.push(
      `Invalid end time format: "${endTime}". Use formats like "08:00", "8:00 AM", or "5:30 PM"`
    );
    return result;
  }

  result.normalizedStartTime = normalizedStart;
  result.normalizedEndTime = normalizedEnd;

  // Step 4: Validate time relationship
  if (!isTimeBefore(normalizedStart, normalizedEnd)) {
    result.errors.push(
      `Start time (${normalizedStart}) must be before end time (${normalizedEnd})`
    );
    return result;
  }

  // Step 5: Calculate and validate duration
  const startMinutes = parseTime(normalizedStart);
  const endMinutes = parseTime(normalizedEnd);
  result.duration = endMinutes - startMinutes;

  if (result.duration < minDuration) {
    result.errors.push(
      `Duration (${result.duration} minutes) is too short. Minimum is ${minDuration} minutes`
    );
    return result;
  }

  if (result.duration > maxDuration) {
    result.errors.push(
      `Duration (${result.duration} minutes) is too long. Maximum is ${maxDuration} minutes`
    );
    return result;
  }

  // Step 6: Create suggested label
  result.suggestedLabel = `${normalizedStart}-${normalizedEnd}`;

  // Step 7: Check for existing slots and validate against them
  if (!existingTimeSlots || !Array.isArray(existingTimeSlots)) {
    result.success = true;
    return result;
  }

  // Convert existing slots to TimeInterval objects
  const existingIntervals = createIntervalsFromTimeSlots(existingTimeSlots);
  const newInterval = new TimeInterval(normalizedStart, normalizedEnd);

  // Step 8: Check for label conflicts (case-insensitive)
  const labelConflict = existingTimeSlots.find(
    (slot) =>
      slot.label &&
      slot.label.toLowerCase() === result.suggestedLabel.toLowerCase()
  );
  if (labelConflict) {
    result.errors.push(
      `A time slot with label "${result.suggestedLabel}" already exists`
    );
    return result;
  }

  // Step 9: Check for overlaps
  for (const existingInterval of existingIntervals) {
    if (newInterval.overlaps(existingInterval)) {
      result.conflictingSlots.push({
        label: existingInterval.label,
        start: existingInterval.startTime,
        end: existingInterval.endTime,
        overlapStart: Math.max(
          newInterval.startMinutes,
          existingInterval.startMinutes
        ),
        overlapEnd: Math.min(
          newInterval.endMinutes,
          existingInterval.endMinutes
        ),
      });

      if (!allowOverlaps) {
        const overlap = newInterval.getOverlap(existingInterval);
        result.errors.push(
          `New slot overlaps with existing slot "${existingInterval.label}" ` +
            `(${overlap.startTime}-${overlap.endTime})`
        );
      }
    }
  }

  // Step 10: Check sequential requirement
  if (requireSequential && existingIntervals.length > 0) {
    // Sequential requirement means new slots must be added at the end of the timeline
    // Find the interval with the latest end time
    const latestEndInterval = existingIntervals.reduce((latest, current) =>
      current.endMinutes > latest.endMinutes ? current : latest
    );

    // New slot should start at or after the latest existing slot ends
    if (newInterval.startMinutes < latestEndInterval.endMinutes) {
      result.errors.push(
        `New slot must start after the last existing slot ends (${latestEndInterval.endTime}). ` +
          `Consider starting at ${latestEndInterval.endTime} or later.`
      );
    } else if (newInterval.startMinutes > latestEndInterval.endMinutes) {
      // There's a gap - add a warning
      const gapDuration =
        newInterval.startMinutes - latestEndInterval.endMinutes;
      result.warnings.push(
        `There will be a ${gapDuration}-minute gap between the last slot ` +
          `(${latestEndInterval.endTime}) and the new slot (${normalizedStart})`
      );
    }
    // If startMinutes === latestEndInterval.endMinutes, it's perfectly adjacent (no gap, no overlap)
  }

  // Step 11: Final validation result
  if (result.errors.length === 0) {
    result.success = true;

    // Add helpful suggestions
    if (result.warnings.length === 0 && existingIntervals.length > 0) {
      result.warnings.push(
        "New time slot validated successfully and fits well with existing schedule"
      );
    }
  }

  return result;
}

/**
 * Validates multiple time slots for consistency and conflicts.
 * Useful for batch validation or importing schedules.
 *
 * @param {Array} timeSlots - Array of time slot objects to validate
 * @param {Object} options - Validation options (same as validateTimeSlotAdvanced)
 * @returns {Object} Batch validation result
 */
export function validateTimeSlotsBatch(timeSlots, options = {}) {
  const result = {
    success: false,
    validSlots: [],
    invalidSlots: [],
    conflicts: [],
    totalDuration: 0,
    errors: [],
    warnings: [],
  };

  if (!timeSlots || !Array.isArray(timeSlots)) {
    result.errors.push("Time slots must be provided as an array");
    return result;
  }

  if (timeSlots.length === 0) {
    result.success = true;
    return result;
  }

  // Validate each slot individually first (without considering other slots in the batch)
  const validatedSlots = [];

  for (let i = 0; i < timeSlots.length; i++) {
    const slot = timeSlots[i];
    const validation = validateTimeSlotAdvanced(
      slot.start,
      slot.end,
      [], // Empty array - don't check against other slots yet
      { ...options, requireSequential: false, allowOverlaps: true } // Allow overlaps for now
    );

    if (validation.success) {
      const validatedSlot = {
        ...slot,
        start: validation.normalizedStartTime,
        end: validation.normalizedEndTime,
        label: slot.label || validation.suggestedLabel,
        duration: validation.duration,
      };

      validatedSlots.push(validatedSlot);
      result.validSlots.push(validatedSlot);
      result.totalDuration += validation.duration;
    } else {
      result.invalidSlots.push({
        originalSlot: slot,
        errors: validation.errors,
        index: i,
      });
    }
  }

  // Check for conflicts between valid slots
  const intervals = createIntervalsFromTimeSlots(result.validSlots);
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      if (intervals[i].overlaps(intervals[j])) {
        const overlap = intervals[i].getOverlap(intervals[j]);
        result.conflicts.push({
          slot1: result.validSlots[i],
          slot2: result.validSlots[j],
          overlap: {
            start: overlap.startTime,
            end: overlap.endTime,
            duration: overlap.duration,
          },
        });
      }
    }
  }

  // Set success status
  result.success =
    result.invalidSlots.length === 0 && result.conflicts.length === 0;

  // Add summary warnings
  if (result.invalidSlots.length > 0) {
    result.warnings.push(
      `${result.invalidSlots.length} invalid time slots found`
    );
  }

  if (result.conflicts.length > 0) {
    result.warnings.push(
      `${result.conflicts.length} conflicts found between time slots`
    );
  }

  return result;
}

/**
 * PHASE 4 SEGMENT 4 - SCHEDULE MERGING
 * Enables cross-user schedule comparison with different time slot structures
 */

/**
 * Represents a unified schedule that can combine multiple users with different time structures.
 * Enables Alice/Bob style comparison where users have different time slots.
 */
export class UnifiedSchedule {
  constructor() {
    this.users = new Map(); // userId -> { name, timeSlots, schedule, intervals }
    this.allTimeIntervals = []; // All unique time intervals across all users
    this.unifiedTimeSlots = []; // Merged and sorted time slots
  }

  /**
   * Adds a user's schedule to the unified schedule.
   * @param {string} userId - User ID
   * @param {string} userName - User name
   * @param {Array} timeSlots - User's time slots
   * @param {Array} schedule - User's schedule (7 days x time slots)
   */
  addUser(userId, userName, timeSlots, schedule) {
    // Convert user's time slots to intervals
    const intervals = createIntervalsFromTimeSlots(timeSlots);

    // Filter to only busy intervals based on the schedule
    const busyIntervals = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      if (schedule[dayIndex]) {
        for (
          let slotIndex = 0;
          slotIndex < schedule[dayIndex].length;
          slotIndex++
        ) {
          if (schedule[dayIndex][slotIndex] && intervals[slotIndex]) {
            // Clone the interval and add day information
            const busyInterval = intervals[slotIndex].clone();
            busyInterval.dayIndex = dayIndex;
            busyInterval.userId = userId;
            busyInterval.userName = userName;
            busyIntervals.push(busyInterval);
          }
        }
      }
    }

    this.users.set(userId, {
      name: userName,
      timeSlots: timeSlots,
      schedule: schedule,
      intervals: intervals,
      busyIntervals: busyIntervals,
    });

    this._rebuildUnifiedTimeSlots();
  }

  /**
   * Removes a user from the unified schedule.
   * @param {string} userId - User ID to remove
   */
  removeUser(userId) {
    this.users.delete(userId);
    this._rebuildUnifiedTimeSlots();
  }

  /**
   * Rebuilds the unified time slots by creating a timeline from all unique time boundaries.
   * For heterogeneous schedule comparison, we want to preserve all distinct time slots.
   * @private
   */
  _rebuildUnifiedTimeSlots() {
    if (this.users.size === 0) {
      this.allTimeIntervals = [];
      this.unifiedTimeSlots = [];
      return;
    }

    // SMART MERGE: Collect only boundaries where availability can change.
    // Use busy interval boundaries across all users (all days) + global edges.
    const timePoints = new Set();

    let globalEarliest = Infinity;
    let globalLatest = -Infinity;

    for (const user of this.users.values()) {
      // Track global edges from each user's full day intervals (timeSlots)
      for (const interval of user.intervals) {
        if (interval.startMinutes < globalEarliest)
          globalEarliest = interval.startMinutes;
        if (interval.endMinutes > globalLatest)
          globalLatest = interval.endMinutes;
      }

      // Only add boundaries for busy intervals (where state flips)
      if (user.busyIntervals && user.busyIntervals.length) {
        for (const busy of user.busyIntervals) {
          timePoints.add(busy.startMinutes);
          timePoints.add(busy.endMinutes);
        }
      }
    }

    // Always include global edges so the whole comparison span is covered
    if (
      isFinite(globalEarliest) &&
      isFinite(globalLatest) &&
      globalEarliest < globalLatest
    ) {
      timePoints.add(globalEarliest);
      timePoints.add(globalLatest);
    }

    // Convert to sorted array
    const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);

    // Fallback: If there were no busy intervals at all, choose the coarsest user's schedule
    // to avoid over-fragmentation when everyone is free.
    if (sortedTimePoints.length < 2) {
      let coarsestUser = null;
      for (const [_, user] of this.users) {
        if (
          !coarsestUser ||
          (user.timeSlots?.length || 0) < (coarsestUser.timeSlots?.length || 0)
        ) {
          coarsestUser = user;
        }
      }

      const points = new Set();
      if (coarsestUser && Array.isArray(coarsestUser.intervals)) {
        for (const interval of coarsestUser.intervals) {
          points.add(interval.startMinutes);
          points.add(interval.endMinutes);
        }
      }
      const fallbackSorted = Array.from(points).sort((a, b) => a - b);
      this.allTimeIntervals = [];
      for (let i = 0; i < fallbackSorted.length - 1; i++) {
        const start = fallbackSorted[i];
        const end = fallbackSorted[i + 1];
        const interval = new TimeInterval(
          start,
          end,
          `${minutesToTimeString(start)}-${minutesToTimeString(end)}`
        );
        this.allTimeIntervals.push(interval);
      }
    } else {
      // Create intervals from consecutive time points (minimal set where state can change)
      this.allTimeIntervals = [];
      for (let i = 0; i < sortedTimePoints.length - 1; i++) {
        const start = sortedTimePoints[i];
        const end = sortedTimePoints[i + 1];
        const interval = new TimeInterval(
          start,
          end,
          `${minutesToTimeString(start)}-${minutesToTimeString(end)}`
        );
        this.allTimeIntervals.push(interval);
      }
    }

    // Convert back to time slot format
    this.unifiedTimeSlots = this.allTimeIntervals.map((interval) => ({
      start: interval.startTime,
      end: interval.endTime,
      label: `${interval.startTime}-${interval.endTime}`,
      duration: interval.duration,
    }));
  }

  /**
   * Gets the availability status for a specific day and unified time slot.
   * @param {number} dayIndex - Day index (0-6)
   * @param {number} unifiedSlotIndex - Index in unified time slots
   * @returns {Object} Status object with counts and user details
   */
  getSlotStatus(dayIndex, unifiedSlotIndex) {
    if (!this.unifiedTimeSlots[unifiedSlotIndex]) {
      return {
        available: [],
        busy: [],
        unavailable: [],
        total: this.users.size,
      };
    }

    const targetInterval = this.allTimeIntervals[unifiedSlotIndex];
    const status = {
      available: [], // Users who are free during this time
      busy: [], // Users who are busy during this time
      unavailable: [], // Users who don't have this time slot
      total: this.users.size,
    };

    for (const [userId, user] of this.users) {
      // Check if user has any time slot that overlaps with target interval
      const userOverlaps = user.intervals.filter((interval) =>
        targetInterval.overlaps(interval)
      );

      if (userOverlaps.length === 0) {
        // User doesn't have this time slot at all
        status.unavailable.push({
          userId: userId,
          name: user.name,
          reason: "No matching time slot",
        });
        continue;
      }

      // Enhanced conflict detection: Check if user is busy during any part of the unified slot
      let isBusy = false;

      // Method 1: Check if any of user's busy intervals on this day overlap with target interval
      if (user.busyIntervals) {
        for (const busyInterval of user.busyIntervals) {
          if (
            busyInterval.dayIndex === dayIndex &&
            targetInterval.overlaps(busyInterval)
          ) {
            isBusy = true;
            break;
          }
        }
      }

      // Method 2: Fallback - check original schedule array mapping
      if (!isBusy) {
        for (const userInterval of userOverlaps) {
          const slotIndex = user.intervals.findIndex(
            (interval) =>
              interval.startMinutes === userInterval.startMinutes &&
              interval.endMinutes === userInterval.endMinutes
          );

          if (
            slotIndex >= 0 &&
            user.schedule[dayIndex] &&
            user.schedule[dayIndex][slotIndex]
          ) {
            isBusy = true;
            break;
          }
        }
      }

      if (isBusy) {
        status.busy.push({
          userId: userId,
          name: user.name,
          timeSlots: userOverlaps.map((interval) => interval.toString()),
        });
      } else {
        status.available.push({
          userId: userId,
          name: user.name,
          timeSlots: userOverlaps.map((interval) => interval.toString()),
        });
      }
    }

    return status;
  }

  /**
   * Finds all time slots where all users are available.
   * @param {number} dayIndex - Day index (0-6)
   * @returns {Array} Array of time slots where everyone is free
   */
  findCommonAvailability(dayIndex) {
    const commonSlots = [];

    for (
      let slotIndex = 0;
      slotIndex < this.unifiedTimeSlots.length;
      slotIndex++
    ) {
      const status = this.getSlotStatus(dayIndex, slotIndex);

      // All users must be available (not busy or unavailable)
      if (status.busy.length === 0 && status.unavailable.length === 0) {
        commonSlots.push({
          slot: this.unifiedTimeSlots[slotIndex],
          slotIndex: slotIndex,
          participants: status.available,
        });
      }
    }

    return commonSlots;
  }

  /**
   * Generates a comparison matrix for visualization.
   * @returns {Array} 7x(unified slots) matrix with detailed status for each cell
   */
  generateComparisonMatrix() {
    const matrix = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayRow = [];
      for (
        let slotIndex = 0;
        slotIndex < this.unifiedTimeSlots.length;
        slotIndex++
      ) {
        const status = this.getSlotStatus(dayIndex, slotIndex);

        // Determine overall status
        let overallStatus = "free";
        if (status.busy.length === status.total) {
          overallStatus = "conflict"; // Everyone is busy
        } else if (status.busy.length > 0) {
          overallStatus = "partial"; // Some busy, some free
        } else if (status.unavailable.length > 0) {
          overallStatus = "partial"; // Some don't have this slot
        }

        dayRow.push({
          dayIndex: dayIndex,
          slotIndex: slotIndex,
          timeSlot: this.unifiedTimeSlots[slotIndex],
          status: overallStatus,
          details: status,
          tooltip: this._generateTooltip(status),
        });
      }
      matrix.push(dayRow);
    }

    return matrix;
  }

  /**
   * Generates a tooltip message for a time slot.
   * @param {Object} status - Slot status from getSlotStatus
   * @returns {string} Tooltip message
   * @private
   */
  _generateTooltip(status) {
    const messages = [];

    if (status.available.length > 0) {
      messages.push(
        `Available: ${status.available.map((u) => u.name).join(", ")}`
      );
    }

    if (status.busy.length > 0) {
      messages.push(`Busy: ${status.busy.map((u) => u.name).join(", ")}`);
    }

    if (status.unavailable.length > 0) {
      // 3-state model: treat unavailable as available for decisioning but annotate in tooltip
      const unavailableUsers = status.unavailable.map((u) => u.name);
      if (unavailableUsers.length === 1) {
        messages.push(`Available (no slot): ${unavailableUsers[0]}`);
      } else {
        messages.push(`Available (no slot): ${unavailableUsers.join(", ")}`);
      }
    }

    return messages.join("\n");
  }

  /**
   * Exports the unified schedule data for persistence or analysis.
   * @returns {Object} Complete schedule data
   */
  export() {
    const userData = {};
    for (const [userId, user] of this.users) {
      userData[userId] = {
        name: user.name,
        timeSlots: user.timeSlots,
        schedule: user.schedule,
      };
    }

    return {
      users: userData,
      unifiedTimeSlots: this.unifiedTimeSlots,
      metadata: {
        totalUsers: this.users.size,
        totalTimeSlots: this.unifiedTimeSlots.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Gets summary statistics about the unified schedule.
   * @returns {Object} Summary statistics
   */
  getSummary() {
    let totalBusySlots = 0;
    let totalConflicts = 0;
    let totalFreeSlots = 0;

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      for (
        let slotIndex = 0;
        slotIndex < this.unifiedTimeSlots.length;
        slotIndex++
      ) {
        const status = this.getSlotStatus(dayIndex, slotIndex);

        if (status.busy.length === status.total) {
          totalConflicts++;
        } else if (
          status.busy.length === 0 &&
          status.unavailable.length === 0
        ) {
          totalFreeSlots++;
        }

        totalBusySlots += status.busy.length;
      }
    }

    return {
      totalUsers: this.users.size,
      totalTimeSlots: this.unifiedTimeSlots.length,
      totalPossibleSlots: this.unifiedTimeSlots.length * 7,
      totalConflicts: totalConflicts,
      totalFreeSlots: totalFreeSlots,
      averageBusyPerSlot: totalBusySlots / (this.unifiedTimeSlots.length * 7),
    };
  }
}

/**
 * Helper function to create a unified schedule from multiple users.
 * @param {Array} users - Array of user objects with { id, name, timeSlots, schedule }
 * @returns {UnifiedSchedule} A new unified schedule instance
 */
export function createUnifiedSchedule(users) {
  if (users == null) {
    throw new Error("Users array cannot be null or undefined");
  }

  if (!Array.isArray(users)) {
    throw new Error("Users must be an array");
  }

  // Use empty array as default only after validation
  if (users.length === 0) {
    users = [];
  }

  const unifiedSchedule = new UnifiedSchedule();

  for (const user of users) {
    if (user.id && user.name && user.timeSlots && user.schedule) {
      unifiedSchedule.addUser(
        user.id,
        user.name,
        user.timeSlots,
        user.schedule
      );
    }
  }

  return unifiedSchedule;
}

/**
 * Quick utility to compare two users' availability for a specific day.
 * @param {Object} user1 - First user object
 * @param {Object} user2 - Second user object
 * @param {number} dayIndex - Day to compare (0-6)
 * @returns {Object} Comparison result with common free slots
 */
export function compareUserAvailability(user1, user2, dayIndex) {
  const unifiedSchedule = createUnifiedSchedule([user1, user2]);
  const commonSlots = unifiedSchedule.findCommonAvailability(dayIndex);

  return {
    commonSlots: commonSlots,
    summary: unifiedSchedule.getSummary(),
    matrix: unifiedSchedule.generateComparisonMatrix()[dayIndex],
  };
}

/**
 * =============================================================================
 *                       SMART OCR TIME CORRECTION UTILITIES
 * =============================================================================
 */

/**
 * Finds the closest time from a list of valid times within a given tolerance.
 * This is the 🧠 "brain" function that fixes OCR errors like 16:11 → 16:10
 * @param {string} timeStr - The time string to correct (e.g., "16:11")
 * @param {string[]} validTimes - Array of valid time strings (e.g., ["16:10", "17:50"])
 * @param {number} [tolerance=5] - Maximum difference in minutes to allow for snapping
 * @returns {string} The corrected time string or original if no close match found
 */
export function snapToClosestTime(timeStr, validTimes, tolerance = 5) {
  const timeInMinutes = parseTime(timeStr);
  if (isNaN(timeInMinutes)) {
    return timeStr; // Cannot parse the input time
  }

  let closestTime = timeStr;
  let minDifference = Infinity;

  for (const validTime of validTimes) {
    const validTimeInMinutes = parseTime(validTime);
    if (isNaN(validTimeInMinutes)) {
      continue;
    }

    const difference = Math.abs(timeInMinutes - validTimeInMinutes);

    if (difference < minDifference) {
      minDifference = difference;
      closestTime = validTime;
    }
  }

  return minDifference <= tolerance ? closestTime : timeStr;
}

/**
 * Pads single-digit minutes with a trailing zero.
 * Handles OCR errors like "16:1" → "16:10" or "17:5" → "17:50"
 * @param {string} timeStr - The time string to pad
 * @returns {string} The padded time string
 */
export function padTimeMinutes(timeStr) {
  if (!timeStr) return timeStr;
  return timeStr.replace(/^(\d{1,2}):(\d)$/, (match, hours, minutes) => {
    return `${hours}:${minutes}0`;
  });
}

/**
 * Smart OCR time correction that combines padding and snapping.
 * This is the main function that university parser will use.
 * @param {string} startTime - Raw start time from OCR (e.g., "14:40")
 * @param {string} endTime - Raw end time from OCR (e.g., "16:11")
 * @param {string[]} validTimePoints - Array of all valid time points from university
 * @returns {{correctedStart: string, correctedEnd: string, changed: boolean}}
 */
export function correctOcrTimeSlot(startTime, endTime, validTimePoints) {
  // Step 1: Pad single-digit minutes (e.g., 17:5 → 17:50)
  const paddedStart = padTimeMinutes(startTime);
  const paddedEnd = padTimeMinutes(endTime);

  // Step 2: Snap to closest valid time point within 5-minute tolerance
  const correctedStart = snapToClosestTime(paddedStart, validTimePoints, 5);
  const correctedEnd = snapToClosestTime(paddedEnd, validTimePoints, 5);

  // Track if any changes were made
  const changed = correctedStart !== startTime || correctedEnd !== endTime;

  if (changed) {
    console.log(
      `🔧 OCR Time Correction: ${startTime}-${endTime} → ${correctedStart}-${correctedEnd}`
    );
  } else {
    console.log(
      `📝 Time correction check: ${startTime}-${endTime} (no change needed)`
    );
  }

  return {
    correctedStart,
    correctedEnd,
    changed,
    originalStart: startTime,
    originalEnd: endTime,
  };
}
