/**
 * =============================================================================
 *                    SCHEDULE IMPORT SERVICE TESTS
 *                  Comprehensive Testing for Phase-0
 * =============================================================================
 * 
 * This test suite covers the complete schedule import functionality:
 * - UniversityParser text parsing edge cases
 * - ScheduleValidator validation logic
 * - ScheduleImportService integration
 * - Error handling and recovery
 * 
 * =============================================================================
 */

import { ScheduleImportService } from '../../services/schedule/ScheduleImportService.js';
import { UniversityParser } from '../../services/schedule/UniversityParser.js';
import { ScheduleValidator } from '../../services/schedule/ScheduleValidator.js';

describe('Schedule Import System', () => {
  
  /**
   * =============================================================================
   *                         UNIVERSITY PARSER TESTS
   * =============================================================================
   */
  describe('UniversityParser', () => {
    let parser;

    beforeEach(() => {
      parser = new UniversityParser();
    });

    describe('Single Line Parsing', () => {
      test('should parse standard single-line format', () => {
        const line = 'CSE110 Introduction to Programming 3 C1001 MW:08:00-09:30 Fall2024 A';
        const result = parser.parseCourseLine(line);

        expect(result).toBeTruthy();
        expect(result.courseCode).toBe('CSE110');
        expect(result.courseName).toBe('Introduction to Programming');
        expect(result.credits).toBe(3);
        expect(result.room).toBe('C1001');
        expect(result.dayCode).toBe('MW');
        expect(result.days).toEqual(['monday', 'wednesday']);
        expect(result.startTime).toBe('08:00');
        expect(result.endTime).toBe('09:30');
        expect(result.timeSlotIndex).toBe(0); // First time slot
      });

      test('should handle OCR time format errors', () => {
        const line = 'CSE110 Programming 3 C1001 MW:8:0-9:3 Fall2024 A';
        const result = parser.parseCourseLine(line);

        expect(result).toBeTruthy();
        expect(result.startTime).toBe('08:00'); // Should correct 8:0 → 08:00
        expect(result.endTime).toBe('09:30');   // Should correct 9:3 → 09:30
      });

      test('should parse evening time slots', () => {
        const line = 'CSE470 Software Engineering 3 C2001 ST:18:30-21:30 Fall2024 B';
        const result = parser.parseCourseLine(line);

        expect(result).toBeTruthy();
        expect(result.dayCode).toBe('ST');
        expect(result.days).toEqual(['sunday', 'tuesday']);
        expect(result.startTime).toBe('18:30');
        expect(result.endTime).toBe('21:30');
        expect(result.timeSlotIndex).toBe(6); // 7th time slot (evening)
      });

      test('should handle unknown day codes gracefully', () => {
        const line = 'CSE999 Unknown Course 3 C1001 XYZ:08:00-09:30 Fall2024 A';
        const result = parser.parseCourseLine(line);

        expect(result).toBeTruthy();
        expect(result.dayCode).toBe('XYZ');
        expect(result.days).toEqual([]); // Unknown day code
      });

      test('should return null for invalid lines', () => {
        const invalidLines = [
          '',
          'Not a course line at all',
          'CSE110', // Too short
          'Random text with no structure'
        ];

        invalidLines.forEach(line => {
          const result = parser.parseCourseLine(line);
          expect(result).toBeNull();
        });
      });
    });

    describe('Multi-line Parsing', () => {
      test('should parse course info and schedule on separate lines', () => {
        const courseLine = 'CMN205 Introduction to Interactive Media 2 C2002';
        const scheduleLine = 'ST:14:40-16:10 12/14 Z';
        
        const result = parser.parseMultilineFormat(courseLine, scheduleLine);

        expect(result).toBeTruthy();
        expect(result.courseCode).toBe('CMN205');
        expect(result.courseName).toBe('Introduction to Interactive Media');
        expect(result.credits).toBe(2);
        expect(result.room).toBe('C2002');
        expect(result.dayCode).toBe('ST');
        expect(result.days).toEqual(['sunday', 'tuesday']);
        expect(result.startTime).toBe('14:40');
        expect(result.endTime).toBe('16:10');
        expect(result.confidence).toBe('high');
      });

      test('should handle multi-line with OCR errors', () => {
        const courseLine = 'PHY101 Basic Physics 3 C1001';
        const scheduleLine = 'MW:11:20-12:50 Spring2024 A';
        
        const result = parser.parseMultilineFormat(courseLine, scheduleLine);

        expect(result).toBeTruthy();
        expect(result.startTime).toBe('11:20'); 
        expect(result.endTime).toBe('12:50');   
      });

      test('should return null for malformed multi-line', () => {
        const tests = [
          // Missing course info
          ['', 'ST:14:40-16:10 12/14 Z'],
          // Missing schedule info  
          ['CMN205 Interactive Media 2 C2002', ''],
          // Invalid course format
          ['InvalidCourseFormat', 'ST:14:40-16:10 12/14 Z'],
          // Invalid schedule format
          ['CMN205 Interactive Media 2 C2002', 'InvalidScheduleFormat']
        ];

        tests.forEach(([courseLine, scheduleLine]) => {
          const result = parser.parseMultilineFormat(courseLine, scheduleLine);
          expect(result).toBeNull();
        });
      });
    });

    describe('Full Text Parsing', () => {
      test('should parse mixed single-line and multi-line format', () => {
        const scheduleText = `
CSE110 Introduction to Programming 3 C1001 MW:08:00-09:30 Fall2024 A
CMN205 Introduction to Interactive Media 2 C2002
ST:14:40-16:10 12/14 Z
CSE470 Software Engineering 3 C2001 ST:18:30-21:30 Fall2024 B
        `.trim();

        const courses = parser.parseScheduleText(scheduleText);

        expect(courses).toHaveLength(3);
        
        // First course (single-line)
        expect(courses[0].courseCode).toBe('CSE110');
        expect(courses[0].dayCode).toBe('MW');
        
        // Second course (multi-line)
        expect(courses[1].courseCode).toBe('CMN205');
        expect(courses[1].dayCode).toBe('ST');
        
        // Third course (single-line)
        expect(courses[2].courseCode).toBe('CSE470');
        expect(courses[2].timeSlotIndex).toBe(6); // Evening slot
      });

      test('should handle empty and invalid lines gracefully', () => {
        const scheduleText = `
CSE110 Introduction to Programming 3 C1001 MW:08:00-09:30 Fall2024 A

Invalid line that should be ignored
        
CSE470 Software Engineering 3 C2001 ST:18:30-21:30 Fall2024 B
        `.trim();

        const courses = parser.parseScheduleText(scheduleText);

        expect(courses).toHaveLength(2); // Only valid courses parsed
        expect(courses[0].courseCode).toBe('CSE110');
        expect(courses[1].courseCode).toBe('CSE470');
      });

      test('should throw error for invalid input', () => {
        expect(() => {
          parser.parseScheduleText(null);
        }).toThrow('Invalid input: schedule text must be a non-empty string');

        expect(() => {
          parser.parseScheduleText(123);
        }).toThrow('Invalid input: schedule text must be a non-empty string');
      });
    });

    describe('Time Slot Matching', () => {
      test('should find correct time slot indices', () => {
        const testCases = [
          { start: '08:00', end: '09:30', expected: 0 },
          { start: '09:40', end: '11:10', expected: 1 },
          { start: '11:20', end: '12:50', expected: 2 },
          { start: '13:00', end: '14:30', expected: 3 },
          { start: '14:40', end: '16:10', expected: 4 },
          { start: '16:20', end: '17:50', expected: 5 },
          { start: '18:30', end: '21:30', expected: 6 }, // Evening slot
          { start: '10:00', end: '11:00', expected: -1 }  // Non-standard time
        ];

        testCases.forEach(({ start, end, expected }) => {
          const index = parser.findTimeSlotIndex(start, end);
          expect(index).toBe(expected);
        });
      });
    });
  });

  /**
   * =============================================================================
   *                         SCHEDULE VALIDATOR TESTS
   * =============================================================================
   */
  describe('ScheduleValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new ScheduleValidator();
    });

    describe('Single Course Validation', () => {
      test('should validate a well-formed course', () => {
        const course = {
          courseCode: 'CSE110',
          courseName: 'Introduction to Programming',
          credits: 3,
          room: 'C1001',
          dayCode: 'MW',
          days: ['monday', 'wednesday'],
          startTime: '08:00',
          endTime: '09:30',
          timeSlotIndex: 0,
          originalLine: 'CSE110 Introduction to Programming 3 C1001 MW:08:00-09:30 Fall2024 A'
        };

        const result = validator.validateCourse(course, 0);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should detect missing required fields', () => {
        const incompleteCourse = {
          courseCode: 'CSE110',
          // Missing courseName, days, startTime, endTime
          credits: 3,
          room: 'C1001'
        };

        const result = validator.validateCourse(incompleteCourse, 0);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing or empty field: courseName');
        expect(result.errors).toContain('Missing or empty field: days');
        expect(result.errors).toContain('Missing or empty field: startTime');
        expect(result.errors).toContain('Missing or empty field: endTime');
      });

      test('should detect invalid course code format', () => {
        const course = {
          courseCode: 'INVALID123TOOLONG', // Invalid format
          courseName: 'Test Course',
          days: ['monday'],
          startTime: '08:00',
          endTime: '09:30'
        };

        const result = validator.validateCourse(course, 0);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid course code format (expected: ABC123)');
        expect(result.suggestions).toContain('Course codes should be 2-4 letters followed by 3 digits');
      });

      test('should detect unknown day codes', () => {
        const course = {
          courseCode: 'CSE110',
          courseName: 'Test Course',
          dayCode: 'UNKNOWN',
          days: [], // Empty because day code is unknown
          startTime: '08:00',
          endTime: '09:30'
        };

        const result = validator.validateCourse(course, 0);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unknown day code: UNKNOWN');
        expect(result.suggestions).toContain('Common day codes: ST (Sun/Tue), MW (Mon/Wed), AR (Thu/Sat)');
      });

      test('should warn about non-standard time slots', () => {
        const course = {
          courseCode: 'CSE110',
          courseName: 'Test Course',
          days: ['monday'],
          startTime: '10:00',
          endTime: '11:00',
          timeSlotIndex: -1 // Non-standard time
        };

        const result = validator.validateCourse(course, 0);

        expect(result.isValid).toBe(true); // Still valid, just a warning
        expect(result.warnings).toContain('Time 10:00-11:00 doesn\'t match standard time slots');
        expect(result.suggestions).toContain('Course may need manual time slot assignment');
      });

      test('should auto-correct long course names', () => {
        const course = {
          courseCode: 'CSE110',
          courseName: 'This is an extremely long course name that exceeds the maximum allowed length for course names in the system',
          days: ['monday'],
          startTime: '08:00',
          endTime: '09:30'
        };

        const result = validator.validateCourse(course, 0);

        expect(result.isValid).toBe(true);
        expect(result.correctedData.courseName).toBe('This is an extremely long course name that exceeds...');
        expect(result.warnings).toContain('Course name truncated to 50 characters');
      });
    });

    describe('Schedule Validation', () => {
      test('should validate array of courses', () => {
        const courses = [
          {
            courseCode: 'CSE110',
            courseName: 'Programming',
            days: ['monday'],
            startTime: '08:00',
            endTime: '09:30',
            timeSlotIndex: 0
          },
          {
            courseCode: 'CSE470',
            courseName: 'Software Engineering',
            days: ['tuesday'],
            startTime: '18:30',
            endTime: '21:30',
            timeSlotIndex: 6
          }
        ];

        const result = validator.validateSchedule(courses);

        expect(result.validatedCourses).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      test('should separate valid and invalid courses', () => {
        const courses = [
          {
            courseCode: 'CSE110',
            courseName: 'Programming',
            days: ['monday'],
            startTime: '08:00',
            endTime: '09:30'
          },
          {
            courseCode: 'INVALID', // Invalid course code
            // Missing required fields
            days: []
          }
        ];

        const result = validator.validateSchedule(courses);

        expect(result.validatedCourses).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].courseCode).toBe('INVALID');
        expect(result.errors[0].issues).toContain('Invalid course code format (expected: ABC123)');
      });
    });

    describe('Advanced Validation Features', () => {
      test('should check for duplicate courses', () => {
        const courses = [
          {
            courseCode: 'CSE110',
            dayCode: 'MW',
            startTime: '08:00'
          },
          {
            courseCode: 'CSE110',
            dayCode: 'MW',
            startTime: '08:00'
          }
        ];

        const duplicates = validator.checkForDuplicates(courses);

        expect(duplicates).toHaveLength(1);
        expect(duplicates[0].courseCode).toBe('CSE110');
        expect(duplicates[0].message).toBe('Duplicate course detected');
      });

      test('should detect time conflicts', () => {
        const courses = [
          {
            courseCode: 'CSE110',
            days: ['monday'],
            timeSlotIndex: 0
          },
          {
            courseCode: 'PHY101',
            days: ['monday'], // Same day
            timeSlotIndex: 0  // Same time slot
          }
        ];

        const conflicts = validator.checkTimeConflicts(courses);

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].course1.courseCode).toBe('CSE110');
        expect(conflicts[0].course2.courseCode).toBe('PHY101');
        expect(conflicts[0].day).toBe('monday');
        expect(conflicts[0].timeSlot).toBe(0);
      });
    });
  });

  /**
   * =============================================================================
   *                      SCHEDULE IMPORT SERVICE TESTS
   * =============================================================================
   */
  describe('ScheduleImportService Integration', () => {
    let service;

    beforeEach(() => {
      service = new ScheduleImportService();
    });

    test('should process complete schedule text successfully', async () => {
      const scheduleText = `
CSE110 Introduction to Programming 3 C1001 MW:08:00-09:30 Fall2024 A
CSE470 Software Engineering 3 C2001 ST:18:30-21:30 Fall2024 B
      `.trim();

      const result = await service.processScheduleText(scheduleText);

      expect(result.success).toBe(true);
      expect(result.scheduleData).toBeDefined();
      expect(result.scheduleData.schedule).toHaveLength(7); // 7 days
      expect(result.scheduleData.schedule[0]).toHaveLength(7); // 7 time slots
      expect(result.stats.totalCourses).toBe(2);
      expect(result.stats.validCourses).toBe(2);
      expect(result.stats.errorCourses).toBe(0);
      expect(result.stats.successRate).toBe('100.0');
    });

    test('should handle mixed valid and invalid courses', async () => {
      const scheduleText = `
CSE110 Introduction to Programming 3 C1001 MW:08:00-09:30 Fall2024 A
INVALID COURSE LINE
CSE470 Software Engineering 3 C2001 ST:18:30-21:30 Fall2024 B
      `.trim();

      const result = await service.processScheduleText(scheduleText);

      expect(result.success).toBe(true);
      expect(result.stats.totalCourses).toBe(2); // Only parseable courses counted
      expect(result.stats.validCourses).toBe(2);
      expect(result.stats.successRate).toBe('100.0');
    });

    test('should convert to CampXus 7x7 format correctly', async () => {
      const scheduleText = 'CSE110 Programming 3 C1001 MW:08:00-09:30 Fall2024 A';
      const result = await service.processScheduleText(scheduleText);

      expect(result.success).toBe(true);
      
      // Check Monday (index 1) and Wednesday (index 3) have the course
      expect(result.scheduleData.schedule[1][0]).toBe(true); // Monday, first slot
      expect(result.scheduleData.schedule[3][0]).toBe(true); // Wednesday, first slot
      
      // Check course info is populated
      expect(result.scheduleData.slotInfo[1][0].courseCode).toBe('CSE110');
      expect(result.scheduleData.slotInfo[3][0].courseCode).toBe('CSE110');
      
      // Check other slots are empty
      expect(result.scheduleData.schedule[0][0]).toBe(false); // Sunday, first slot
      expect(result.scheduleData.schedule[1][1]).toBe(false); // Monday, second slot
    });

    test('should prevent concurrent external processing', async () => {
      const scheduleText = 'CSE110 Programming 3 C1001 MW:08:00-09:30 Fall2024 A';
      
      // Start processing  
      service.isProcessing = true; // Simulate ongoing processing
      
      // Try to process while already processing
      const result = await service.processScheduleText(scheduleText);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Already processing a schedule. Please wait.');
      
      // Reset for other tests
      service.isProcessing = false;
    });

    test('should allow internal processScheduleText calls from processScheduleImage', async () => {
      const scheduleText = 'CSE110 Programming 3 C1001 MW:08:00-09:30 Fall2024 A';
      
      // Test that internal calls (with skipLockCheck=true) work even when processing flag is set
      service.isProcessing = true;
      
      const result = await service.processScheduleText(scheduleText, true);
      
      expect(result.success).toBe(true);
      expect(result.scheduleData).toBeDefined();
      
      // Reset for other tests
      service.isProcessing = false;
    });

    test('should generate helpful import summary', async () => {
      const scheduleText = 'CSE110 Programming 3 C1001 MW:08:00-09:30 Fall2024 A';
      const result = await service.processScheduleText(scheduleText);
      
      const summary = service.getImportSummary(result);
      expect(summary).toBe('Imported 1 out of 1 courses (100.0% success rate)');
    });

    test('should handle errors gracefully', async () => {
      const result = await service.processScheduleText('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.scheduleData).toBeNull();
    });
  });

  /**
   * =============================================================================
   *                           ERROR HANDLING TESTS
   * =============================================================================
   */
  describe('Error Handling and Edge Cases', () => {
    test('should handle empty schedule text', async () => {
      const service = new ScheduleImportService();
      const result = await service.processScheduleText('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle malformed JSON-like input', async () => {
      const service = new ScheduleImportService();
      const malformedText = '{ "courses": [ { "invalid": "json" } ] }';
      
      const result = await service.processScheduleText(malformedText);
      
      // Should not crash, but may have no valid courses
      expect(result.success).toBe(true);
      expect(result.stats.validCourses).toBe(0);
    });

    test('should handle special characters in course names', async () => {
      const service = new ScheduleImportService();
      const scheduleText = 'CSE110 Programming: C++ & Java 3 C1001 MW:08:00-09:30 Fall2024 A';
      
      const result = await service.processScheduleText(scheduleText);
      
      expect(result.success).toBe(true);
      expect(result.stats.validCourses).toBe(1);
    });
  });
});