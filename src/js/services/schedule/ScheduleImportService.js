/**
 * =============================================================================
 *                          SCHEDULE IMPORT SERVICE
 *                    Modern Schedule Text Parsing & Integration
 * =============================================================================
 * 
 * This service handles importing university schedules from text or images,
 * following the existing CampXus service architecture patterns.
 * 
 * Features:
 * - Text parsing with university format support
 * - Integration with existing time slot system
 * - Data validation and error handling
 * - Seamless ProfileSetup.js integration
 * 
 * =============================================================================
 */

import { DEFAULT_TIMESLOTS, UNIVERSITY_DAY_CODES, SCHEDULE_PARSING_PATTERNS } from '../../utils/constants.js';

/**
 * Main service class for schedule import functionality
 * Follows the same patterns as DataService.js and AuthService.js
 */
export class ScheduleImportService {
  constructor() {
    this.parser = new UniversityParser();
    this.validator = new ScheduleValidator();
    this.isProcessing = false;
  }

  /**
   * Process text input and return structured schedule data
   * @param {string} scheduleText - Raw schedule text from user
   * @returns {Promise<Object>} Processed schedule data with validation results
   */
  async processScheduleText(scheduleText) {
    if (this.isProcessing) {
      throw new Error('Already processing a schedule. Please wait.');
    }

    this.isProcessing = true;

    try {
      // Step 1: Parse the text into course objects
      const parsedCourses = this.parser.parseScheduleText(scheduleText);
      console.log('📅 Parsed courses:', parsedCourses);

      // Step 2: Validate and clean the data
      const validationResult = this.validator.validateSchedule(parsedCourses);
      console.log('✅ Validation result:', validationResult);

      // Step 3: Convert to CampXus format
      const scheduleData = this.convertToCampXusFormat(validationResult.validatedCourses);

      return {
        success: true,
        scheduleData,
        validationResult,
        stats: {
          totalCourses: parsedCourses.length,
          validCourses: validationResult.validatedCourses.length,
          errorCourses: validationResult.errors.length,
          successRate: parsedCourses.length > 0 ? 
            (validationResult.validatedCourses.length / parsedCourses.length * 100).toFixed(1) : 0
        }
      };
    } catch (error) {
      console.error('❌ Schedule processing failed:', error);
      return {
        success: false,
        error: error.message,
        scheduleData: null,
        validationResult: null
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Convert parsed courses to CampXus schedule format (7x7 matrices)
   * @param {Array} validatedCourses - Array of validated course objects
   * @returns {Object} CampXus-compatible schedule data
   */
  convertToCampXusFormat(validatedCourses) {
    // Initialize 7x7 matrices (7 days, 7 time slots)
    const schedule = Array(7).fill(null).map(() => Array(7).fill(false));
    const slotInfo = Array(7).fill(null).map(() => 
      Array(7).fill(null).map(() => ({ courseCode: "", classroomNumber: "" }))
    );

    // Map day names to indices
    const dayIndexMap = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };

    // Populate matrices from courses
    validatedCourses.forEach(course => {
      if (course.timeSlotIndex >= 0 && course.days.length > 0) {
        course.days.forEach(dayName => {
          const dayIndex = dayIndexMap[dayName.toLowerCase()];
          if (dayIndex !== undefined && dayIndex >= 0) {
            // Mark slot as busy
            schedule[dayIndex][course.timeSlotIndex] = true;
            
            // Add course information
            slotInfo[dayIndex][course.timeSlotIndex] = {
              courseCode: course.courseCode,
              classroomNumber: course.room || ""
            };
          }
        });
      }
    });

    return {
      schedule,
      slotInfo,
      courses: validatedCourses,
      importedAt: new Date().toISOString()
    };
  }

  /**
   * Get import statistics for display
   * @param {Object} processResult - Result from processScheduleText
   * @returns {string} Human-readable stats
   */
  getImportSummary(processResult) {
    if (!processResult.success) {
      return `Import failed: ${processResult.error}`;
    }

    const { stats } = processResult;
    return `Imported ${stats.validCourses} out of ${stats.totalCourses} courses (${stats.successRate}% success rate)`;
  }
}

/**
 * University-specific text parser
 * Handles the specific format used by your university
 */
class UniversityParser {
  constructor() {
    this.patterns = SCHEDULE_PARSING_PATTERNS;
    this.dayCodes = UNIVERSITY_DAY_CODES;
    this.timeSlots = DEFAULT_TIMESLOTS;
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

    // Normalize times (handle OCR errors)
    const normalizedStart = this.normalizeTime(startTime);
    const normalizedEnd = this.normalizeTime(endTime);
    
    // Find matching time slot
    const timeSlotIndex = this.findTimeSlotIndex(normalizedStart, normalizedEnd);
    
    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      credits: parseInt(credits) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      timeSlotIndex: timeSlotIndex,
      section: extra ? extra.split(/\s+/)[0] : '',
      originalLine: `${courseLine}\n${scheduleLine}`,
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
    
    // Try main pattern first
    let match = cleanLine.match(this.patterns.MAIN_PATTERN);
    if (!match) {
      // Try alternative pattern
      match = cleanLine.match(this.patterns.MULTILINE_PATTERN);
    }
    
    if (!match) {
      console.warn('Could not parse line:', line);
      return null;
    }

    const [, courseCode, courseName, credits, room, dayCode, startTime, endTime, extra] = match;
    
    // Normalize times (handle OCR errors)
    const normalizedStart = this.normalizeTime(startTime);
    const normalizedEnd = this.normalizeTime(endTime);
    
    // Find matching time slot
    const timeSlotIndex = this.findTimeSlotIndex(normalizedStart, normalizedEnd);
    
    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      credits: parseInt(credits) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      timeSlotIndex: timeSlotIndex,
      section: extra ? extra.split(/\s+/)[0] : '',
      originalLine: line,
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

/**
 * Schedule data validator
 * Ensures data quality and catches common errors
 */
class ScheduleValidator {
  constructor() {
    this.requiredFields = ['courseCode', 'courseName', 'days', 'startTime', 'endTime'];
  }

  /**
   * Validate array of parsed courses
   * @param {Array} courses - Array of course objects
   * @returns {Object} Validation result with validated courses and errors
   */
  validateSchedule(courses) {
    const validatedCourses = [];
    const errors = [];
    const warnings = [];

    courses.forEach((course, index) => {
      const validation = this.validateCourse(course, index);
      
      if (validation.isValid) {
        validatedCourses.push({
          ...course,
          ...validation.correctedData
        });
      } else {
        errors.push({
          courseIndex: index,
          course: course.originalLine,
          courseCode: course.courseCode,
          issues: validation.errors,
          suggestions: validation.suggestions
        });
      }
      
      if (validation.warnings.length > 0) {
        warnings.push({
          courseIndex: index,
          course: course.courseCode,
          warnings: validation.warnings
        });
      }
    });

    return {
      validatedCourses,
      errors,
      warnings
    };
  }

  /**
   * Validate a single course object
   * @param {Object} course - Course object to validate
   * @param {number} index - Course index for error reporting
   * @returns {Object} Validation result
   */
  validateCourse(course, index) {
    const errors = [];
    const warnings = [];
    const suggestions = [];
    const correctedData = {};

    // Check required fields
    this.requiredFields.forEach(field => {
      if (!course[field] || (Array.isArray(course[field]) && course[field].length === 0)) {
        errors.push(`Missing or empty field: ${field}`);
      }
    });

    // Validate course code format
    if (course.courseCode && !/^[A-Z]{2,4}\d{3}$/.test(course.courseCode)) {
      errors.push('Invalid course code format (expected: ABC123)');
      suggestions.push('Course codes should be 2-4 letters followed by 3 digits');
    }

    // Validate day codes
    if (course.days && course.days.length === 0) {
      errors.push(`Unknown day code: ${course.dayCode}`);
      suggestions.push('Common day codes: ST (Sun/Tue), MW (Mon/Wed), AR (Thu/Sat)');
    }

    // Validate time slot mapping
    if (course.timeSlotIndex === -1) {
      warnings.push(`Time ${course.startTime}-${course.endTime} doesn't match standard time slots`);
      suggestions.push('Course may need manual time slot assignment');
    }

    // Auto-correct common issues
    if (course.courseName && course.courseName.length > 50) {
      correctedData.courseName = course.courseName.substring(0, 50) + '...';
      warnings.push('Course name truncated to 50 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      correctedData
    };
  }
}

// Export for use in ProfileSetup.js
export default ScheduleImportService;