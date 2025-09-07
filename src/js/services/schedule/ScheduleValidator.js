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
    this.requiredFields = [
      "courseCode",
      "days",
      "startTime",
      "endTime",
    ];
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
          ...validation.correctedData,
        });
      } else {
        errors.push({
          courseIndex: index,
          course: course.originalLine,
          courseCode: course.courseCode,
          issues: validation.errors,
          suggestions: validation.suggestions,
        });
      }

      if (validation.warnings.length > 0) {
        warnings.push({
          courseIndex: index,
          course: course.courseCode,
          warnings: validation.warnings,
        });
      }
    });

    return {
      validatedCourses,
      errors,
      warnings,
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
    this.requiredFields.forEach((field) => {
      if (
        !course[field] ||
        (Array.isArray(course[field]) && course[field].length === 0)
      ) {
        errors.push(`Missing or empty field: ${field}`);
      }
    });

    // Validate course code format - be more lenient for OCR data
    if (course.courseCode) {
      // First try strict format (allow optional trailing 'L' for lab courses)
      if (!/^[A-Z]{2,4}\d{3,4}L?$/.test(course.courseCode)) {
        // For OCR data, be more flexible and try to auto-correct
        const correctedCode = this.correctCourseCode(course.courseCode);
        if (correctedCode && /^[A-Z]{2,4}\d{3,4}L?$/.test(correctedCode)) {
          correctedData.courseCode = correctedCode;
          warnings.push(
            `Course code auto-corrected from "${course.courseCode}" to "${correctedCode}"`
          );
        } else {
          errors.push("Invalid course code format (expected: ABC123)");
          suggestions.push(
            "Course codes should be 2-4 letters followed by 3-4 digits, optionally ending with 'L' for labs"
          );
        }
      }
    }

    // Validate day codes - be more lenient for OCR data
    if (course.days && course.days.length === 0 && course.dayCode) {
      // Try to auto-correct common OCR errors in day codes
      const correctedDayCode = this.correctDayCode(course.dayCode);
      if (correctedDayCode && correctedDayCode !== course.dayCode) {
        correctedData.dayCode = correctedDayCode;
        // Re-lookup days with corrected day code
        const correctedDays = this.getDaysFromDayCode(correctedDayCode);
        if (correctedDays.length > 0) {
          correctedData.days = correctedDays;
          warnings.push(
            `Day code auto-corrected from "${course.dayCode}" to "${correctedDayCode}"`
          );
        } else {
          errors.push(`Unknown day code: ${course.dayCode}`);
          suggestions.push(
            "Common day codes: ST (Sun/Tue), MW (Mon/Wed), AR (Thu/Sat)"
          );
        }
      } else {
        errors.push(`Unknown day code: ${course.dayCode}`);
        suggestions.push(
          "Common day codes: ST (Sun/Tue), MW (Mon/Wed), AR (Thu/Sat)"
        );
      }
    }

    // Validate time slot mapping
    if (course.timeSlotIndex === -1) {
      warnings.push(
        `Time ${course.startTime}-${course.endTime} doesn't match standard time slots`
      );
      suggestions.push("Course may need manual time slot assignment");
    }

    // Auto-correct common issues
    if (course.courseName && course.courseName.length > 50) {
      correctedData.courseName = course.courseName.substring(0, 50) + "...";
      warnings.push("Course name truncated to 50 characters");
    }

    // No numeric credits validation (numeric field remapped to section)

    // Validate room format
    if (course.room && course.room.length > 20) {
      correctedData.room = course.room.substring(0, 20);
      warnings.push("Room name truncated to 20 characters");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      correctedData,
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
          message: "Duplicate course detected",
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
        course.days.forEach((day) => {
          const key = `${day}-${course.timeSlotIndex}`;

          if (timeSlotMap.has(key)) {
            const conflictingCourse = timeSlotMap.get(key);
            conflicts.push({
              course1: {
                index: conflictingCourse.index,
                courseCode: conflictingCourse.courseCode,
              },
              course2: {
                index: index,
                courseCode: course.courseCode,
              },
              day: day,
              timeSlot: course.timeSlotIndex,
              message: `Time conflict on ${day} at slot ${course.timeSlotIndex}`,
            });
          } else {
            timeSlotMap.set(key, { index, courseCode: course.courseCode });
          }
        });
      }
    });

    return conflicts;
  }

  /**
   * Auto-correct common OCR errors in course codes
   * @param {string} courseCode - Potentially corrupted course code
   * @returns {string} Corrected course code
   */
  correctCourseCode(courseCode) {
    if (!courseCode) return courseCode;

    return (
      courseCode
        // Fix common character substitutions
        .replace(/[oO0]/g, (match, offset, string) => {
          // In course codes, 'o' or 'O' should likely be '0' if surrounded by letters and numbers
          const before = string[offset - 1];
          const after = string[offset + 1];
          if (/[A-Z]/.test(before) && /\d/.test(after)) return "0";
          if (/\d/.test(before) && /\d/.test(after)) return "0";
          return match;
        })
        // Fix 's' that should be 'C'
        .replace(/([A-Z]{1,2})s(\d{3})/g, "$1C$2")
        .replace(/([A-Z]{1,2})z(\d{3})/gi, "$1C$2")
        // Fix 'I' that should be '1' or vice versa
        .replace(/([A-Z]{2,3})I(\d{2})/g, "$11$2")
        .replace(/([A-Z]{2,3})1(\d{2})/g, "$1I$2")
        // Ensure proper format and case
        .toUpperCase()
        .trim()
    );
  }

  /**
   * Auto-correct common OCR errors in day codes
   * @param {string} dayCode - Potentially corrupted day code
   * @returns {string} Corrected day code
   */
  correctDayCode(dayCode) {
    if (!dayCode) return dayCode;

    const corrected = dayCode
      .replace(/[oO0]/g, "") // Remove mistakenly added O's or 0's
      .replace(/[Il1]/g, "I") // Fix I vs 1 vs l confusion
      .replace(/[5S]/g, "S") // Fix 5 vs S confusion
      .toUpperCase()
      .trim();

    // Map common OCR errors to correct day codes
    const errorMap = {
      S1: "ST", // S1 → ST
      SI: "ST", // SI → ST
      "5T": "ST", // 5T → ST
      "M W": "MW", // M W → MW (space removal)
      "A R": "AR", // A R → AR (space removal)
      "T R": "TR", // T R → TR
      A: "AR", // Single A might be AR
      R: "AR", // Single R might be AR
    };

    return errorMap[corrected] || corrected;
  }

  /**
   * Get days array from day code using the same logic as the parser
   * @param {string} dayCode - Day code like 'ST', 'MW', etc.
   * @returns {Array} Array of day names
   */
  getDaysFromDayCode(dayCode) {
    // Import the day codes from constants
    const UNIVERSITY_DAY_CODES = {
      ST: ["sunday", "tuesday"],
      MW: ["monday", "wednesday"],
      AR: ["thursday", "saturday"],
      T: ["tuesday"],
      TR: ["tuesday", "thursday"],
      MWF: ["monday", "wednesday", "friday"],
      S: ["sunday"],
      M: ["monday"],
      W: ["wednesday"],
      A: ["thursday"],
      F: ["friday"],
      R: ["saturday"],
    };

    return UNIVERSITY_DAY_CODES[dayCode.trim()] || [];
  }
}

export default ScheduleValidator;
