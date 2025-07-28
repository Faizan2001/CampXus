/**
 * =============================================================================
 *                           SCHEDULE VALIDATOR
 *                     Data Quality & Error Detection
 * =============================================================================
 * 
 * This validator ensures schedule data quality and catches common parsing errors.
 * It validates course objects, provides suggestions for fixes, and auto-corrects
 * minor issues where possible.
 * 
 * Features:
 * - Required field validation
 * - Course code format checking
 * - Day code validation
 * - Time slot verification
 * - Auto-correction for common issues
 * - Detailed error reporting with suggestions
 * 
 * =============================================================================
 */

/**
 * Schedule data validator
 * Ensures data quality and catches common errors
 */
export class ScheduleValidator {
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

    // Validate credits
    if (course.credits && (course.credits < 0 || course.credits > 6)) {
      warnings.push(`Unusual credit count: ${course.credits}`);
      suggestions.push('Credit counts are typically 1-6');
    }

    // Validate room format
    if (course.room && course.room.length > 20) {
      correctedData.room = course.room.substring(0, 20);
      warnings.push('Room name truncated to 20 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      correctedData
    };
  }

  /**
   * Get a summary of validation results
   * @param {Object} validationResult - Result from validateSchedule()
   * @returns {string} Human-readable summary
   */
  getValidationSummary(validationResult) {
    const { validatedCourses, errors, warnings } = validationResult;
    const total = validatedCourses.length + errors.length;
    
    let summary = `✅ ${validatedCourses.length}/${total} courses validated successfully`;
    
    if (errors.length > 0) {
      summary += `\n❌ ${errors.length} courses failed validation`;
    }
    
    if (warnings.length > 0) {
      summary += `\n⚠️ ${warnings.length} courses have warnings`;
    }
    
    return summary;
  }

  /**
   * Check for duplicate courses in the schedule
   * @param {Array} courses - Array of course objects
   * @returns {Array} Array of duplicate course warnings
   */
  checkForDuplicates(courses) {
    const duplicates = [];
    const courseMap = new Map();

    courses.forEach((course, index) => {
      const key = `${course.courseCode}-${course.dayCode}-${course.startTime}`;
      
      if (courseMap.has(key)) {
        duplicates.push({
          courseIndex: index,
          courseCode: course.courseCode,
          originalIndex: courseMap.get(key),
          message: 'Duplicate course detected'
        });
      } else {
        courseMap.set(key, index);
      }
    });

    return duplicates;
  }

  /**
   * Check for time conflicts in the schedule
   * @param {Array} courses - Array of course objects
   * @returns {Array} Array of time conflict warnings
   */
  checkTimeConflicts(courses) {
    const conflicts = [];
    const timeSlotMap = new Map();

    courses.forEach((course, index) => {
      if (course.timeSlotIndex >= 0 && course.days.length > 0) {
        course.days.forEach(day => {
          const key = `${day}-${course.timeSlotIndex}`;
          
          if (timeSlotMap.has(key)) {
            const conflictingCourse = timeSlotMap.get(key);
            conflicts.push({
              course1: {
                index: conflictingCourse.index,
                courseCode: conflictingCourse.courseCode
              },
              course2: {
                index: index,
                courseCode: course.courseCode
              },
              day: day,
              timeSlot: course.timeSlotIndex,
              message: `Time conflict on ${day} at slot ${course.timeSlotIndex}`
            });
          } else {
            timeSlotMap.set(key, { index, courseCode: course.courseCode });
          }
        });
      }
    });

    return conflicts;
  }
}

export default ScheduleValidator;