/**
 * =============================================================================
 *                           UNIVERSITY PARSER
 *                    Text-to-Course Object Conversion
 * =============================================================================
 * 
 * This parser handles converting university schedule text into structured
 * course objects. It supports both single-line and multi-line formats.
 * 
 * Features:
 * - Single line parsing: "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z"
 * - Multi-line parsing: Course info and schedule on separate lines
 * - OCR error correction for time formats
 * - University day code translation
 * - Time slot matching with DEFAULT_TIMESLOTS
 * 
 * =============================================================================
 */

import { DEFAULT_TIMESLOTS, UNIVERSITY_DAY_CODES, SCHEDULE_PARSING_PATTERNS } from '../../utils/constants.js';
import { correctOcrTimeSlot } from '../../utils/time/timeUtils.js';

/**
 * University-specific text parser
 * Handles the specific format used by your university
 */
export class UniversityParser {
  constructor() {
    this.patterns = SCHEDULE_PARSING_PATTERNS;
    this.dayCodes = UNIVERSITY_DAY_CODES;
    this.timeSlots = DEFAULT_TIMESLOTS;
    
    // 🧠 Pre-calculate all valid time points for OCR correction
    // Extract all start and end times from university time slots
    this.validTimePoints = [
      ...new Set(this.timeSlots.flatMap(slot => [slot.start, slot.end]))
    ];
    
    console.log('🎯 University Parser initialized with valid time points:', this.validTimePoints);
  }

  /**
   * Parse schedule text into structured course objects
   * @param {string} text - Raw schedule text
   * @returns {Array} Array of parsed course objects
   */
  parseScheduleText(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: schedule text must be a non-empty string');
    }

    const lines = text.split('\n').filter(line => line.trim());
    const courses = [];

    // Try to parse as multiline format first (course info + schedule on separate lines)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;

      try {
        // First try single line parsing
        const course = this.parseCourseLine(line);
        if (course) {
          courses.push(course);
          continue;
        }

        // If single line fails, try multiline parsing
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const multilineCourse = this.parseMultilineFormat(line, nextLine);
          if (multilineCourse) {
            courses.push(multilineCourse);
            i++; // Skip the next line since we used it
            continue;
          }
        }

      } catch (error) {
        console.warn(`Failed to parse line ${i + 1}: "${line}"`, error);
        // Continue processing other lines
      }
    }

    return courses;
  }

  /**
   * Parse multiline format where course info and schedule are on separate lines
   * @param {string} courseLine - Line with course info
   * @param {string} scheduleLine - Line with schedule info
   * @returns {Object|null} Parsed course object or null
   */
  parseMultilineFormat(courseLine, scheduleLine) {
    // Match course info: "CMN205 Introduction to Interactive Media 2 C2002"
    const courseMatch = courseLine.match(this.patterns.COURSE_INFO_PATTERN);
    // Match schedule: "ST:14:40-16:10 12/14 Z"
    const scheduleMatch = scheduleLine.match(this.patterns.SCHEDULE_LINE_PATTERN);

    if (!courseMatch || !scheduleMatch) {
      return null;
    }

    const [, courseCode, courseName, credits, room] = courseMatch;
    const [, dayCode, startTime, endTime, extra] = scheduleMatch;

    // 🧠 Smart OCR correction for time errors
    const { correctedStart, correctedEnd, changed } = correctOcrTimeSlot(
      startTime, 
      endTime, 
      this.validTimePoints
    );
    
    // Find matching time slot using corrected times
    const timeSlotIndex = this.findTimeSlotIndex(correctedStart, correctedEnd);
    
    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      credits: parseInt(credits) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: correctedStart,
      endTime: correctedEnd,
      timeSlotIndex: timeSlotIndex,
      section: extra ? extra.split(/\s+/)[0] : '',
      originalLine: `${courseLine}\n${scheduleLine}`,
      originalTimes: changed ? `${startTime}-${endTime}` : null, // Track original if corrected
      confidence: 'high'
    };
  }

  /**
   * Parse a single course line
   * @param {string} line - Single line of course text
   * @returns {Object|null} Parsed course object or null if parsing failed
   */
  parseCourseLine(line) {
    const cleanLine = line.trim().replace(/\s+/g, ' ');
    
    // Try patterns in order of preference for OCR text
    let match = cleanLine.match(this.patterns.MAIN_PATTERN);
    if (!match) {
      // Try OCR-friendly pattern with flexible spacing
      match = cleanLine.match(this.patterns.OCR_PATTERN);
    }
    if (!match) {
      // Try alternative pattern
      match = cleanLine.match(this.patterns.MULTILINE_PATTERN);
    }
    
    if (!match) {
      // Only log warnings for non-empty lines to reduce test noise
      if (cleanLine.trim().length > 0) {
        console.warn('Could not parse line:', line);
        console.warn('📋 Trying to match against:', cleanLine);
        console.warn('🔍 Patterns tried: MAIN_PATTERN, OCR_PATTERN, MULTILINE_PATTERN');
      }
      return null;
    }

    const [, courseCode, courseName, credits, room, dayCode, startTime, endTime, extra] = match;
    
    // 🧠 Smart OCR correction for time errors
    const { correctedStart, correctedEnd, changed } = correctOcrTimeSlot(
      startTime, 
      endTime, 
      this.validTimePoints
    );
    
    // Find matching time slot using corrected times
    const timeSlotIndex = this.findTimeSlotIndex(correctedStart, correctedEnd);
    
    // Debug logging for parsing issues
    if (timeSlotIndex === -1) {
      console.warn(`⚠️ No time slot match found for ${correctedStart}-${correctedEnd}`);
      console.warn('Available time slots:', this.timeSlots.map(s => `${s.start}-${s.end}`));
    } else {
      console.log(`✅ Course parsed: ${courseCode} at ${correctedStart}-${correctedEnd} (slot ${timeSlotIndex})`);
    }
    
    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      credits: parseInt(credits) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: correctedStart,
      endTime: correctedEnd,
      timeSlotIndex: timeSlotIndex,
      section: extra ? extra.split(/\s+/)[0] : '',
      originalLine: line,
      originalTimes: changed ? `${startTime}-${endTime}` : null, // Track original if corrected
      confidence: match ? 'high' : 'medium'
    };
  }

  /**
   * Normalize time string (handle OCR errors)
   * @param {string} timeStr - Time string like "16:1" or "16:10"
   * @returns {string} Normalized time string
   */
  normalizeTime(timeStr) {
    // Handle OCR errors: "16:1" → "16:10", "17:5" → "17:50"
    return timeStr.replace(/^(\d{1,2}):(\d{1})$/, (match, hours, minutes) => {
      // If minutes is single digit, pad with 0
      const paddedMinutes = minutes === '1' ? '10' : 
                           minutes === '2' ? '20' : 
                           minutes === '3' ? '30' : 
                           minutes === '4' ? '40' : 
                           minutes === '5' ? '50' : 
                           minutes + '0';
      return `${hours}:${paddedMinutes}`;
    });
  }

  /**
   * Find time slot index for given start and end times
   * @param {string} startTime - Start time like "14:40"
   * @param {string} endTime - End time like "16:10"
   * @returns {number} Index in DEFAULT_TIMESLOTS array, or -1 if not found
   */
  findTimeSlotIndex(startTime, endTime) {
    return this.timeSlots.findIndex(slot => 
      slot.start === startTime && slot.end === endTime
    );
  }
}

export default UniversityParser;