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

import {
  DEFAULT_TIMESLOTS,
  UNIVERSITY_DAY_CODES,
  SCHEDULE_PARSING_PATTERNS,
  inferTimeSlotFromPartial,
} from "../../utils/constants.js";
import { correctOcrTimeSlot } from "../../utils/time/timeUtils.js";

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
      ...new Set(this.timeSlots.flatMap((slot) => [slot.start, slot.end])),
    ];

    console.log(
      "🎯 University Parser initialized with valid time points:",
      this.validTimePoints
    );
  }

  /**
   * Parse schedule text into structured course objects
   * @param {string} text - Raw schedule text
   * @returns {Array} Array of parsed course objects
   */
  parseScheduleText(text) {
    if (!text || typeof text !== "string") {
      console.warn("⚠️ UniversityParser received invalid input:", {
        text: text,
        type: typeof text,
        length: text ? text.length : "N/A",
      });
      return []; // Return empty array instead of throwing error
    }

    // Check if text is effectively empty (just whitespace)
    if (text.trim().length === 0) {
      console.warn("⚠️ UniversityParser received empty text after trimming");
      return []; // Return empty array for empty text
    }

    // Pre-process OCR text to fix common recognition errors
    const preprocessedText = this.preprocessOcrText(text);
    const lines = preprocessedText.split("\n").filter((line) => line.trim());
    const courses = [];

    console.log(`📝 UniversityParser processing ${lines.length} lines...`);

    // Track processed lines to avoid double-processing fragmented courses
    const processedLines = new Set();
    // Track parsed courses to avoid duplicates
    const seenCourses = new Set();

    // Try to parse as multiline format first (course info + schedule on separate lines)
    for (let i = 0; i < lines.length; i++) {
      // Skip if already processed as part of a fragmented course
      if (processedLines.has(i)) {
        continue;
      }

      const line = lines[i].trim();
      if (line.length === 0) continue;

      try {
        // First try single line parsing
        const course = this.parseCourseLine(line);
        if (course) {
          // Check for duplicates based on course code and time
          const courseKey = `${course.courseCode}-${course.startTime}-${course.endTime}`;
          if (!seenCourses.has(courseKey)) {
            courses.push(course);
            seenCourses.add(courseKey);
            processedLines.add(i);
            console.log(
              `✅ Course parsed: ${course.courseCode} at ${course.startTime}-${
                course.endTime
              } (slot ${course.timeSlotIndex}, pattern: ${
                course.confidence || "STANDARD"
              })`
            );
          } else {
            console.log(
              `⚠️ Duplicate course skipped: ${course.courseCode} at ${course.startTime}-${course.endTime}`
            );
            processedLines.add(i);
          }
          continue;
        }

        // If single line fails, try multiline parsing
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const multilineCourse = this.parseMultilineFormat(line, nextLine);
          if (multilineCourse) {
            const courseKey = `${multilineCourse.courseCode}-${multilineCourse.startTime}-${multilineCourse.endTime}`;
            if (!seenCourses.has(courseKey)) {
              courses.push(multilineCourse);
              seenCourses.add(courseKey);
              processedLines.add(i);
              processedLines.add(i + 1);
              i++; // Skip the next line since we used it
              console.log(
                `✅ Multiline course parsed: ${multilineCourse.courseCode} at ${multilineCourse.startTime}-${multilineCourse.endTime}`
              );
            } else {
              console.log(
                `⚠️ Duplicate multiline course skipped: ${multilineCourse.courseCode}`
              );
              processedLines.add(i);
              processedLines.add(i + 1);
              i++;
            }
            continue;
          }
        }

        // If standard parsing failed, try smart critical elements extraction
        const smartExtracted = this.parseFragmentedMobileLine(line, lines, i);
        if (smartExtracted) {
          const courseKey = `${smartExtracted.courseCode}-${smartExtracted.startTime}-${smartExtracted.endTime}`;
          if (!seenCourses.has(courseKey)) {
            courses.push(smartExtracted);
            seenCourses.add(courseKey);
            processedLines.add(i);

            // Mark related lines as processed if they were part of the reconstruction
            if (smartExtracted.fragmentedParts) {
              smartExtracted.fragmentedParts.forEach((part, partIndex) => {
                // Find which line index this part corresponds to
                for (
                  let j = Math.max(0, i - 2);
                  j <= Math.min(lines.length - 1, i + 2);
                  j++
                ) {
                  if (
                    lines[j] &&
                    lines[j].includes(
                      part.substring(0, Math.min(20, part.length))
                    )
                  ) {
                    processedLines.add(j);
                  }
                }
              });
            }

            console.log(
              `✅ Smart extraction successful: ${smartExtracted.courseCode} | ${smartExtracted.room} | ${smartExtracted.startTime}-${smartExtracted.endTime}`
            );
          } else {
            console.log(
              `⚠️ Duplicate smart extracted course skipped: ${smartExtracted.courseCode}`
            );
            processedLines.add(i);
          }
          continue;
        }
      } catch (error) {
        console.warn(`Failed to parse line ${i + 1}: "${line}"`, error);
        // Continue processing other lines
      }
    }

    console.log(
      `📝 UniversityParser successfully parsed ${courses.length} courses`
    );
    return courses;
  }

  /**
   * Preprocess OCR text to fix common recognition errors
   * @param {string} text - Raw OCR text
   * @returns {string} Preprocessed text
   */
  preprocessOcrText(text) {
    // For OCR text, apply minimal preprocessing since OcrService already does comprehensive cleaning
    // Only fix critical issues that might prevent parsing
    return (
      text
        // Preserve line breaks - this is crucial for multiline course data
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          // Only apply minimal, safe fixes per line
          return (
            line
              // Fix missing colons in times (conservative)
              .replace(/(\d{2})(\d{2})-(\d{2})(\d{2})/g, "$1:$2-$3:$4") // "1430-1610" → "14:30-16:10"
              // Normalize time separators
              .replace(/[-–—]/g, "-") // Normalize different dash types
              // Clean up extra spaces
              .replace(/\s+/g, " ")
              .trim()
          );
        })
        .join("\n")
    );
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
    const scheduleMatch = scheduleLine.match(
      this.patterns.SCHEDULE_LINE_PATTERN
    );

    if (!courseMatch || !scheduleMatch) {
      return null;
    }

    const [, courseCode, courseName, sectionNum, room] = courseMatch;
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
      section: parseInt(sectionNum) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: correctedStart,
      endTime: correctedEnd,
      timeSlotIndex: timeSlotIndex,
      // Extra on schedule line is attendance/grade; do not use for section
      sectionDetail: extra || "",
      originalLine: `${courseLine}\n${scheduleLine}`,
      originalTimes: changed ? `${startTime}-${endTime}` : null, // Track original if corrected
      confidence: "high",
    };
  }

  /**
   * Parse a single course line
   * Enhanced to handle mobile-responsive cut-off times using time slot inference
   * @param {string} line - Single line of course text
   * @returns {Object|null} Parsed course object or null if parsing failed
   */
  parseCourseLine(line) {
    const cleanLine = line.trim().replace(/\s+/g, " ");

    // Try patterns in order of preference for OCR text, including mobile-responsive patterns
    let match = cleanLine.match(this.patterns.MAIN_PATTERN);
    let patternUsed = "MAIN_PATTERN";

    if (!match) {
      // New: sequence-based parsing that follows Code, Name, Sec, Room, Time, Attendance, Grade
      const seq = this.parseSequenceLine(cleanLine);
      if (seq) {
        return seq;
      }

      // Try mobile cut-off pattern (high priority for mobile responsiveness)
      match = cleanLine.match(this.patterns.MOBILE_CUTOFF_PATTERN);
      patternUsed = "MOBILE_CUTOFF_PATTERN";

      if (match) {
        return this.parseMobileCutoffMatch(match, line);
      }
    }

    if (!match) {
      // Try partial time pattern (handles cases where only hour is visible)
      match = cleanLine.match(this.patterns.PARTIAL_TIME_PATTERN);
      patternUsed = "PARTIAL_TIME_PATTERN";

      if (match) {
        return this.parsePartialTimeMatch(match, line);
      }
    }

    if (!match) {
      // Try OCR-friendly pattern with flexible spacing
      match = cleanLine.match(this.patterns.OCR_PATTERN);
      patternUsed = "OCR_PATTERN";
    }
    if (!match) {
      // Try alternative pattern
      match = cleanLine.match(this.patterns.MULTILINE_PATTERN);
      patternUsed = "MULTILINE_PATTERN";
    }
    if (!match) {
      // Try flexible OCR pattern for heavily corrupted text
      match = cleanLine.match(this.patterns.OCR_FLEXIBLE_PATTERN);
      patternUsed = "OCR_FLEXIBLE_PATTERN";

      if (match) {
        // For flexible pattern, we need to extract time info differently
        return this.parseFlexibleOcrMatch(match, line);
      }
    }
    if (!match) {
      // Try broken time pattern as last resort
      match = cleanLine.match(this.patterns.OCR_BROKEN_TIME_PATTERN);
      patternUsed = "OCR_BROKEN_TIME_PATTERN";

      if (match) {
        return this.parseBrokenTimeMatch(match, line);
      }
    }

    if (!match) {
      // Only log warnings for non-empty lines to reduce test noise
      if (cleanLine.trim().length > 0) {
        console.warn("Could not parse line:", line);
        console.warn("📋 Trying to match against:", cleanLine);
        console.warn(
          "🔍 Patterns tried: MAIN_PATTERN, MOBILE_CUTOFF_PATTERN, PARTIAL_TIME_PATTERN, OCR_PATTERN, MULTILINE_PATTERN, OCR_FLEXIBLE_PATTERN, OCR_BROKEN_TIME_PATTERN"
        );
      }
      return null;
    }

    const [
      ,
      courseCode,
      courseName,
      sectionNum,
      room,
      dayCode,
      startTime,
      endTime,
      extra,
    ] = match;

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
      console.warn(
        `⚠️ No time slot match found for ${correctedStart}-${correctedEnd} (pattern: ${patternUsed})`
      );
      console.warn(
        "Available time slots:",
        this.timeSlots.map((s) => `${s.start}-${s.end}`)
      );
    } else {
      console.log(
        `✅ Course parsed: ${courseCode} at ${correctedStart}-${correctedEnd} (slot ${timeSlotIndex}, pattern: ${patternUsed})`
      );
    }

    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      section: parseInt(sectionNum) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: correctedStart,
      endTime: correctedEnd,
      timeSlotIndex: timeSlotIndex,
      sectionDetail: extra || "",
      originalLine: line,
      originalTimes: changed ? `${startTime}-${endTime}` : null, // Track original if corrected
      confidence: match ? "high" : "medium",
    };
  }

  /**
   * Parse a single line using positional sequence (Code, Name, Sec, Room, Time, Attendance, Grade)
   * This is resilient to changing room naming schemes.
   */
  parseSequenceLine(line) {
    try {
      const raw = line.trim();
      if (!raw) return null;

      // Skip headers or meta lines
      const headerKeywords = [
        /^code\b/i,
        /^semester/i,
        /^year\b/i,
        /^summer\b/i,
        /^attendance\*/i,
        /^grade\b/i,
      ];
      if (headerKeywords.some((re) => re.test(raw))) return null;

      // Course code at the start
      const codeMatch = raw.match(/^([A-Z]{2,4}\d{3,4}L?)\b/);
      if (!codeMatch) return null;
      const courseCode = this.correctCourseCode(codeMatch[1]);

      // Remove leading code
      let rest = raw.slice(codeMatch[0].length).trim();

      // Detect trailing grade (Z, W, or A-F with +/-)
      const gradeMatch = rest.match(/\b(Z|W|[A-F](?:[+-])?)\s*$/i);
      if (gradeMatch) {
        rest = rest.slice(0, gradeMatch.index).trim();
      }

      // Detect attendance near end "n / m" or "n/m"
      const attendanceMatch = rest.match(/(\d+)\s*\/\s*(\d+)\s*$/);
      if (attendanceMatch) {
        rest = rest.slice(0, attendanceMatch.index).trim();
      }

      // Detect time: DAY(:)?HH:MM-HH:MM (allow missing colon after day)
      const timeRegex = /(MWF|MW|TR|ST|AR|S|M|T|W|A|F|R)\s*:?(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i;
      const timeMatch = rest.match(timeRegex);
      if (!timeMatch) return null; // Not a sequence line without time

      const dayCode = timeMatch[1].toUpperCase();
      const startTimeRaw = timeMatch[2];
      const endTimeRaw = timeMatch[3];

      // Room is the token immediately before the time
      const beforeTime = rest.slice(0, timeMatch.index).trim();
      const tokensBeforeTime = beforeTime.split(/\s+/);
      if (tokensBeforeTime.length < 2) return null; // Need at least section and room

      const room = tokensBeforeTime[tokensBeforeTime.length - 1];
      const sectionToken = tokensBeforeTime[tokensBeforeTime.length - 2];
      const section = parseInt(sectionToken, 10) || 0;

      // Course name is whatever remains between code and section token
      const nameTokens = tokensBeforeTime.slice(0, tokensBeforeTime.length - 2);
      const courseName = nameTokens.join(" ").trim();

      // Correct times
      const { correctedStart, correctedEnd, changed } = correctOcrTimeSlot(
        startTimeRaw,
        endTimeRaw,
        this.validTimePoints
      );

      // Days array
      const days = this.dayCodes[dayCode] || [];

      return {
        courseCode: courseCode,
        courseName: courseName,
        section,
        room,
        dayCode,
        days,
        startTime: correctedStart,
        endTime: correctedEnd,
        timeSlotIndex: this.findTimeSlotIndex(correctedStart, correctedEnd),
        originalLine: line,
        originalTimes: changed ? `${startTimeRaw}-${endTimeRaw}` : null,
        confidence: "sequence",
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse mobile cut-off match where end time is missing or cut off
   * @param {Array} match - Regex match result from MOBILE_CUTOFF_PATTERN
   * @param {string} originalLine - Original line for reference
   * @returns {Object|null} Parsed course object or null
   */
  parseMobileCutoffMatch(match, originalLine) {
    const [
      ,
      courseCode,
      courseName,
      sectionNum,
      room,
      dayCode,
      partialTime,
      cutoffMarker,
      extra,
    ] = match;

    console.log(`📱 Parsing mobile cut-off line: "${originalLine}"`);
    console.log(`📱 Partial time detected: "${partialTime}"`);

    // Use time slot inference to get complete time slot
    const inferredSlot = inferTimeSlotFromPartial(partialTime);
    if (!inferredSlot) {
      console.warn(
        "❌ Could not infer time slot from partial time:",
        partialTime
      );
      return null;
    }

    console.log(
      `✅ Inferred complete time slot: ${partialTime} → ${inferredSlot.start}-${inferredSlot.end}`
    );

    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      section: parseInt(sectionNum) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: inferredSlot.start,
      endTime: inferredSlot.end,
      timeSlotIndex: inferredSlot.slot,
      sectionDetail: extra || "",
      originalLine: originalLine,
      originalTimes: null, // No original end time available
      confidence: "high", // High confidence due to inference system
      mobileInferred: true, // Flag to indicate this was inferred from mobile cut-off
      inferredFromPartial: partialTime,
    };
  }

  /**
   * Parse partial time match where only hour is visible
   * @param {Array} match - Regex match result from PARTIAL_TIME_PATTERN
   * @param {string} originalLine - Original line for reference
   * @returns {Object|null} Parsed course object or null
   */
  parsePartialTimeMatch(match, originalLine) {
    const [, courseCode, courseName, sectionNum, room, dayCode, hourOnly, extra] =
      match;

    console.log(`📱 Parsing partial time line: "${originalLine}"`);
    console.log(`📱 Hour only detected: "${hourOnly}"`);

    // Use time slot inference to get complete time slot from just the hour
    const inferredSlot = inferTimeSlotFromPartial(hourOnly);
    if (!inferredSlot) {
      console.warn("❌ Could not infer time slot from hour:", hourOnly);
      return null;
    }

    console.log(
      `✅ Inferred complete time slot from hour: ${hourOnly} → ${inferredSlot.start}-${inferredSlot.end}`
    );

    // Get days from day code
    const days = this.dayCodes[dayCode.trim()] || [];

    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      section: parseInt(sectionNum) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: inferredSlot.start,
      endTime: inferredSlot.end,
      timeSlotIndex: inferredSlot.slot,
      sectionDetail: extra || "",
      originalLine: originalLine,
      originalTimes: null, // No original full time available
      confidence: "high", // High confidence due to inference system
      mobileInferred: true, // Flag to indicate this was inferred from partial time
      inferredFromPartial: hourOnly,
    };
  }

  /**
   * Parse flexible OCR match for heavily corrupted text
   * @param {Array} match - Regex match result
   * @param {string} originalLine - Original line for reference
   * @returns {Object|null} Parsed course object or null
   */
  parseFlexibleOcrMatch(match, originalLine) {
    const [, courseCode, courseName, sectionNum, room, dayCode, timeInfo, extra] =
      match;

    // Extract time information from the corrupted time string
    const timeResult = this.extractTimeFromCorruptedString(timeInfo);
    if (!timeResult) {
      console.warn("Could not extract time from:", timeInfo);
      return null;
    }

    const { startTime, endTime } = timeResult;

    // Correct course code if it seems corrupted
    const correctedCourseCode = this.correctCourseCode(courseCode);

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
      courseCode: correctedCourseCode,
      courseName: courseName.trim(),
      section: parseInt(sectionNum) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: correctedStart,
      endTime: correctedEnd,
      timeSlotIndex: timeSlotIndex,
      sectionDetail: extra || "",
      originalLine: originalLine,
      originalTimes: changed ? `${startTime}-${endTime}` : null,
      confidence: "medium",
    };
  }

  /**
   * Parse broken time match where times are severely corrupted
   * @param {Array} match - Regex match result
   * @param {string} originalLine - Original line for reference
   * @returns {Object|null} Parsed course object or null
   */
  parseBrokenTimeMatch(match, originalLine) {
    const [, courseCode, courseName, sectionNum, room, dayCode, timeRest] = match;

    // Try to extract time from the rest of the string
    const timeResult = this.extractTimeFromCorruptedString(timeRest);
    if (!timeResult) {
      console.warn("Could not extract time from broken time string:", timeRest);
      return null;
    }

    const { startTime, endTime } = timeResult;

    // Correct course code if it seems corrupted
    const correctedCourseCode = this.correctCourseCode(courseCode);

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
      courseCode: correctedCourseCode,
      courseName: courseName.trim(),
      section: parseInt(sectionNum) || 0,
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: days,
      startTime: correctedStart,
      endTime: correctedEnd,
      timeSlotIndex: timeSlotIndex,
      sectionDetail: "",
      originalLine: originalLine,
      originalTimes: changed ? `${startTime}-${endTime}` : null,
      confidence: "low",
    };
  }

  /**
   * Smart extraction focusing on course code, room, and time (the most important elements)
   * Handles both mobile and desktop screenshots with intelligent parsing
   * @param {string} line - Text line from OCR
   * @param {Array} allLines - All lines for context
   * @param {number} currentIndex - Current line index
   * @returns {Object|null} Parsed course object or null
   */
  parseFragmentedMobileLine(line, allLines, currentIndex) {
    console.log(`🎯 Smart extraction from line: "${line}"`);

    // Try to extract the three critical elements: course code, room, time
    const extracted = this.extractCriticalElements(
      line,
      allLines,
      currentIndex
    );
    if (extracted) {
      const { courseCode, room, timeInfo, courseName, section, dayCode } = extracted;

      // Try to get complete time using inference
      const timeResult = this.extractTimeFromCorruptedString(timeInfo);
      if (timeResult) {
        console.log(
          `✅ Extracted critical elements: ${courseCode} | Room: ${room} | Time: ${timeResult.startTime}-${timeResult.endTime}`
        );

        // Resolve day code: prefer detected day code from text; fallback to inference
        const resolvedDayCode = (dayCode && this.dayCodes[dayCode])
          ? dayCode
          : this.inferDayCodeFromTime(timeResult.startTime) || "ST";

        return {
          courseCode: this.correctCourseCode(courseCode),
          courseName: courseName || "", // Use extracted name or leave empty
          section: section || 0, // Use extracted section or 0 if not found
          room: room.trim(),
          dayCode: resolvedDayCode,
          days: this.dayCodes[resolvedDayCode] || ["Sunday", "Tuesday"],
          startTime: timeResult.startTime,
          endTime: timeResult.endTime,
          timeSlotIndex: this.findTimeSlotIndex(
            timeResult.startTime,
            timeResult.endTime
          ),
          originalLine: line,
          confidence: "smart-extracted",
          extractedElements: { courseCode, room, timeInfo },
        };
      }
    }

    // Fallback: Try older fragmentation patterns
    return this.parseFragmentedLine(line, allLines, currentIndex);
  }

  /**
   * Extract the three most critical elements: course code, room, and time
   * Enhanced to be more robust with compact screenshots and OCR corruption
   * @param {string} line - Current line
   * @param {Array} allLines - All lines for context
   * @param {number} currentIndex - Current line index
   * @returns {Object|null} Extracted elements or null
   */
  extractCriticalElements(line, allLines, currentIndex) {
    const combinedText = this.getCombinedContext(line, allLines, currentIndex);
    console.log(
      `🔍 Extracting critical elements from line ${currentIndex}: "${line}"`
    );
    console.log(`🔍 Combined context: "${combinedText}"`);

    // Extract course code with corruption handling (prefer current line; preserve optional trailing 'L' for labs)
    let courseCodeMatches = line.match(/([A-Z]{2,4}\d{2,4}L?)/g);
    if (!courseCodeMatches || courseCodeMatches.length === 0) {
      courseCodeMatches = combinedText.match(/([A-Z]{2,4}\d{2,4}L?)/g);
    }
    if (!courseCodeMatches || courseCodeMatches.length === 0) {
      console.log("❌ No course code found in combined text");
      return null;
    }

    // Get the first valid course code and correct it
    let courseCode = courseCodeMatches[0];
    const originalCourseCode = courseCode;
    courseCode = this.correctCourseCode(courseCode);
    console.log(
      `🎯 Found course code: ${originalCourseCode} → corrected: ${courseCode}`
    );

    // Extract room numbers - look for patterns that are clearly rooms, not course codes
    const roomPatterns = [
      /\b([A-Z]{1,3}\d{3,4}L?)\b/g, // C2002, BC6012, MK7005L, etc.
      /\b([A-Z]{2,5}LAB\d*)\b/gi, // CENLAB, CENLAB2
      /\b([A-Z]{2,4}Lab\d*)\b/g, // CSCLab2, etc.
      /\b(GPLab)\b/gi,
    ];

    let room = null;
    // Prefer room detection from the current line; fallback to combined context
    const roomSearchTexts = [line, combinedText];
    for (const searchText of roomSearchTexts) {
      for (const pattern of roomPatterns) {
        const roomMatches = [...searchText.matchAll(pattern)].map((m) => m[1]);
        if (roomMatches.length) {
          const scored = roomMatches
            .filter((c) => c !== courseCode && c !== originalCourseCode)
            .map((c) => ({
              value: c,
              score: /lab/i.test(c) ? 3 : /\dL$/i.test(c) ? 2 : 1,
            }))
            .sort((a, b) => b.score - a.score);
          if (scored.length) {
            room = scored[0].value;
            console.log(`🏢 Room candidate: ${room} (score=${scored[0].score})`);
            break;
          }
        }
      }
      if (room) break;
    }

    // If no distinct room found, try to find it differently
    if (!room || room === courseCode) {
      // Look for room-like patterns after the course code
      const afterCourseMatch = combinedText.match(
        new RegExp(`${courseCode}.*?((?:[A-Z]{1,4}\\d{2,4}L?|GPLab|[A-Z]{1,4}Lab\\d*|[A-Z]{2,5}LAB\\d*))`, "i")
      );
      if (afterCourseMatch && afterCourseMatch[1] !== courseCode) {
        room = afterCourseMatch[1];
        console.log(`🏢 Room found after course code: ${room}`);
      }
    }

    console.log(`🏢 Final room: ${room || "Not found"}`);

    // Enhanced time extraction with better pattern recognition
    const timePatterns = [
      // Full time patterns (highest priority)
      /ST?:?(\d{1,2}:\d{2}-\d{1,2}:\d{2})/i, // ST:14:40-16:10
      /T:?(\d{1,2}:\d{2}-\d{1,2}:\d{2})/i, // T:18:30-21:30
      /(\d{1,2}:\d{2}-\d{1,2}:\d{2})/, // 14:40-16:10

      // Partial patterns with context
      /ST:?(\d{1,2}:\d{1,2})-?/i, // ST:14:40-, ST14:40
      /T:?(\d{1,2}:\d{1,2})-?/i, // T:18:30-

      // Compact patterns - just the start time
      /ST:?(\d{1,2}:\d{1,2})/i, // ST:14:40, ST14:40
      /ST:?(\d{2,4})/i, // ST:1440, ST1440
      /T:?(\d{1,2}:\d{1,2})/i, // T:18:30

      // Handle corrupted time fragments like "ST16:2" (should be "ST:16:20")
      /ST(\d{1,2}):?(\d{1,2})/i, // ST16:2 → 16:20
      /ST(\d{2})(\d)/i, // ST162 → 16:20

      // Very compact - just numbers that could be time
      /\b(\d{1,2}:\d{1,2})\b/, // 14:40
      /\b(\d{3,4})\b/, // 1440, 1830
    ];

    let timeInfo = null;
    let timeContext = "";

    // Prefer extracting time from the current line first, then fallback to combined context
    const timeSearchTexts = [line, combinedText];
    let detectedDayCode = null;
    for (const searchText of timeSearchTexts) {
      for (const pattern of timePatterns) {
        const timeMatch = searchText.match(pattern);
        if (timeMatch) {
          timeInfo = timeMatch[1];
          // Capture surrounding context for better processing
          const matchIndex = searchText.indexOf(timeMatch[0]);
          timeContext = searchText.substring(
            Math.max(0, matchIndex - 20),
            matchIndex + timeMatch[0].length + 20
          );
          // Try to detect a day code near the time (supports optional colon)
          const dcWindow = searchText.substring(
            Math.max(0, matchIndex - 6),
            matchIndex + 1
          );
          const dcMatch = dcWindow.match(/\b(MWF|MW|TR|ST|AR|S|M|T|W|A|F|R)\s*:?[\s]*$/i);
          if (dcMatch) {
            detectedDayCode = dcMatch[1].toUpperCase();
          }
          console.log(
            `⏰ Found time pattern: "${timeMatch[0]}" → extracted: "${timeInfo}"`
          );
          console.log(`📍 Time context: "${timeContext}"`);
          break;
        }
      }
      if (timeInfo) break;
    }

    // Special handling for very compact times like "ST:44" which might be "ST:14:44"
    if (timeInfo && timeInfo.match(/^\d{1,2}$/) && timeInfo.length <= 2) {
      const timeVal = parseInt(timeInfo);

      // If it's a small number, it might be missing the hour part OR it could be minutes
      if (timeVal < 60 && timeVal > 0) {
        console.log(`🕰️ Detected possible minute fragment: ${timeInfo}`);

        // Look for hour context in the surrounding text
        const hourContext = timeContext.match(/(\d{1,2})[:\s]*(\d{1,2})/);
        if (hourContext) {
          const possibleHour = hourContext[1];
          const possibleMinute = hourContext[2];

          // Try to reconstruct the full time
          if (
            possibleHour !== timeInfo &&
            parseInt(possibleHour) >= 8 &&
            parseInt(possibleHour) <= 21
          ) {
            timeInfo = `${possibleHour}:${timeInfo}`;
            console.log(`🕰️ Reconstructed time from context: ${timeInfo}`);
          }
        } else {
          // Try common hour patterns for the minute value (this handles ST:44 = 14:44)
          const commonHourForMinute = {
            44: "14", // ST:44 → 14:44 (common start time)
            40: "14", // 14:40 is most common
            20: "16", // 16:20 is most common
            30: "18", // 18:30 is most common
            50: "17", // 17:50 is most common
            10: "16", // 16:10 is most common
          };

          if (commonHourForMinute[timeInfo]) {
            const reconstructed = `${commonHourForMinute[timeInfo]}:${timeInfo}`;
            console.log(
              `🕰️ Using common pattern for minute ${timeInfo} → ${reconstructed}`
            );
            timeInfo = reconstructed;
          }
        }
      }
    }

    if (!timeInfo) {
      console.log("❌ No time information found in combined text");
      return null;
    }

    // Try to extract course name and section (optional, as this may be truncated)
    const nameSectionPattern = new RegExp(
      `${courseCode}\\s+([^\\d]*?)\\s*(\\d+)?\\s*${room || "\\w+"}`,
      "i"
    );
    const nameSectionMatch = combinedText.match(nameSectionPattern);
    const courseName = nameSectionMatch ? nameSectionMatch[1].trim() : null;
    const section = nameSectionMatch ? parseInt(nameSectionMatch[2]) : null;

    console.log(
      `🎯 Final extraction - Code: ${courseCode}, Room: ${
        room || "DEFAULT"
      }, Time: ${timeInfo}, Name: ${courseName || "N/A"}`
    );

    // Validate extraction results
    if (!courseCode) {
      console.log("❌ Critical extraction failed: No course code");
      return null;
    }

    if (!room) {
      console.log("⚠️ No room found, using default: ROOM");
    }

    if (!timeInfo) {
      console.log("⚠️ No time info found");
    }

    return {
      courseCode,
      room: room || "ROOM", // Use default if no room found
      timeInfo,
      courseName,
      section,
      dayCode: detectedDayCode || null,
    };
  }

  /**
   * Get combined context from current and surrounding lines
   * @param {string} line - Current line
   * @param {Array} allLines - All lines
   * @param {number} currentIndex - Current index
   * @returns {string} Combined text for parsing
   */
  getCombinedContext(line, allLines, currentIndex) {
    const contextLines = [];

    // Include previous line if available
    if (currentIndex > 0) {
      contextLines.push(allLines[currentIndex - 1]);
    }

    // Include current line
    contextLines.push(line);

    // Include next line if available
    if (currentIndex + 1 < allLines.length) {
      contextLines.push(allLines[currentIndex + 1]);
    }

    return contextLines.join(" ").replace(/\s+/g, " ").trim();
  }

  /**
   * Infer day code from time (simple heuristic)
   * @param {string} startTime - Start time like "14:40"
   * @returns {string} Day code
   */
  inferDayCodeFromTime(startTime) {
    const hour = parseInt(startTime.split(":")[0]);

    // Simple heuristics based on common university scheduling
    if (hour >= 8 && hour <= 12) return "MW"; // Morning classes usually MW
    if (hour >= 14 && hour <= 17) return "ST"; // Afternoon classes usually ST
    if (hour >= 18) return "T"; // Evening classes usually T

    return "ST"; // Default
  }

  /**
   * Fallback parsing for fragmented lines (old method)
   * Enhanced to better handle mobile OCR fragmentation
   * @param {string} line - Fragmented line
   * @param {Array} allLines - All lines for context
   * @param {number} currentIndex - Current line index
   * @returns {Object|null} Parsed course object or null
   */
  parseFragmentedLine(line, allLines, currentIndex) {
    console.log(`📱 Enhanced fragmentation parsing: "${line}"`);

    // Pattern 1: Line that looks like a room/time fragment: "BCE012 ST16:2" or "BC6012 ST:16:20"
    const roomTimeMatch = line.match(/^([A-Z]+\d+)\s+(ST?:?\d{1,2}:?\d{0,2})/i);
    if (roomTimeMatch) {
      const [, roomFragment, timeFragment] = roomTimeMatch;
      console.log(
        `🏢 Found room/time fragment: Room="${roomFragment}", Time="${timeFragment}"`
      );

      // Correct common room OCR errors
      let correctedRoom = roomFragment
        .replace(/BCE(\d+)/, "BC$1") // BCE012 → BC012
        .replace(/BC(\d{3})/, "BC$1") // BC012 → BC6012 (if needed)
        .replace(/^([A-Z]{2})(\d{3})$/, "$1$2"); // Basic room format

      // Try to infer a 4-digit room if we only have 3 digits
      if (correctedRoom.match(/^[A-Z]{2}\d{3}$/)) {
        // Common room patterns - if we see BC012, it's likely BC6012
        const roomMappings = {
          BC012: "BC6012",
          BC007: "BC6007",
          C002: "C2002",
        };
        correctedRoom = roomMappings[correctedRoom] || correctedRoom;
      }

      console.log(`🏢 Corrected room: ${roomFragment} → ${correctedRoom}`);

      // Try to find the course info in surrounding lines (look both ways)
      const searchRange = [-2, -1, 1, 2]; // Check 2 lines before and after

      for (const offset of searchRange) {
        const searchIndex = currentIndex + offset;
        if (searchIndex < 0 || searchIndex >= allLines.length) continue;

        const searchLine = allLines[searchIndex];
        console.log(`🔍 Searching line ${searchIndex}: "${searchLine}"`);

        // Look for course patterns in the search line
        const coursePatterns = [
          /([A-Z]{2,4}\d{2,4}L?)\s+(.+?)\s+(\d+)/, // Standard: code name section
          /([A-Z]{2,4}\d{2,4}L?)\s+(.+)/, // Partial: code name
          /([A-Z]{2,4}\d{2,4}L?)/, // Just code
        ];

        for (const pattern of coursePatterns) {
          const courseMatch = searchLine.match(pattern);
          if (courseMatch) {
            const [, courseCode, courseName = "", sectionNum = "0"] = courseMatch;
            console.log(
              `📚 Found course in line ${searchIndex}: Code="${courseCode}", Name="${courseName}", Section="${sectionNum}"`
            );

            // Try to infer complete time from fragment
            const timeResult =
              this.extractTimeFromCorruptedString(timeFragment);
            if (timeResult) {
              console.log(
                `✅ Reconstructed course from fragments: ${courseCode} in ${correctedRoom} at ${timeResult.startTime}-${timeResult.endTime}`
              );

              return {
                courseCode: this.correctCourseCode(courseCode),
                courseName: courseName.trim(),
                section: parseInt(sectionNum) || 0,
                room: correctedRoom,
                dayCode: "ST",
                days: this.dayCodes["ST"] || ["Sunday", "Tuesday"],
                startTime: timeResult.startTime,
                endTime: timeResult.endTime,
                timeSlotIndex: this.findTimeSlotIndex(
                  timeResult.startTime,
                  timeResult.endTime
                ),
                section: "",
                originalLine: `${searchLine} | ${line}`,
                confidence: "mobile-reconstructed",
                fragmentedParts: [searchLine, line],
              };
            }
          }
        }
      }
    }

    // Pattern 2: Line that looks like just a course code fragment
    const codeOnlyMatch = line.match(/^([A-Z]{2,4}\d{2,4}L?)(\s+.*)?$/);
    if (codeOnlyMatch) {
      const [, courseCode, rest] = codeOnlyMatch;
      console.log(`📚 Found course code fragment: "${courseCode}"`);

      // Look for room/time info in the next lines
      for (
        let i = currentIndex + 1;
        i < Math.min(currentIndex + 3, allLines.length);
        i++
      ) {
        const nextLine = allLines[i];
        const roomTimeMatch = nextLine.match(
          /([A-Z]+\d+)\s+(ST?:?\d{1,2}:?\d{0,2})/i
        );
        if (roomTimeMatch) {
          const [, roomFragment, timeFragment] = roomTimeMatch;

          // Correct room
          let correctedRoom = roomFragment.replace(/BCE(\d+)/, "BC$1");
          const roomMappings = {
            BC012: "BC6012",
            BC007: "BC6007",
            C002: "C2002",
          };
          correctedRoom = roomMappings[correctedRoom] || correctedRoom;

          const timeResult = this.extractTimeFromCorruptedString(timeFragment);
          if (timeResult) {
            console.log(
              `✅ Reconstructed course from code+room fragments: ${courseCode} in ${correctedRoom} at ${timeResult.startTime}-${timeResult.endTime}`
            );

            return {
              courseCode: this.correctCourseCode(courseCode),
              courseName: rest ? rest.trim() : "",
              section: parseInt(sectionNum) || 0,
              room: correctedRoom,
              dayCode: "ST",
              days: this.dayCodes["ST"] || ["Sunday", "Tuesday"],
              startTime: timeResult.startTime,
              endTime: timeResult.endTime,
              timeSlotIndex: this.findTimeSlotIndex(
                timeResult.startTime,
                timeResult.endTime
              ),
              sectionDetail: "",
              originalLine: `${line} | ${nextLine}`,
              confidence: "mobile-reconstructed",
              fragmentedParts: [line, nextLine],
            };
          }
        }
      }
    }

    console.log(
      `❌ Could not reconstruct course from fragmented line: "${line}"`
    );
    return null;
  }

  /**
   * Extract time information from corrupted OCR string
   * Enhanced to handle mobile-responsive cut-off times using time slot inference
   * @param {string} timeStr - Corrupted time string like "A8:3021:30", "16:20-17:502", or "ST:14-CUTOFF"
   * @returns {Object|null} Object with startTime and endTime or null
   */
  extractTimeFromCorruptedString(timeStr) {
    // Pre-clean the time string first
    let cleanTimeStr = timeStr
      .replace(/[;]/g, ":") // semicolons to colons
      .replace(/[il1]/g, "1") // OCR often confuses these
      .replace(/[oO]/g, "0") // OCR often confuses these
      .replace(/A(\d)/g, "1$1") // "A8" → "18"
      .replace(/S(\d)/g, "5$1") // "S0" → "50" (common in "50" minutes)
      .replace(/\s+/g, "") // remove all spaces
      .trim();

    console.log("🔧 Cleaning time string:", timeStr, "→", cleanTimeStr);

    // Check for mobile-responsive cut-off pattern first (highest priority)
    if (
      cleanTimeStr.includes("CUTOFF") ||
      cleanTimeStr.match(/(\d{1,2}:?\d{0,2})-?$/)
    ) {
      console.log(
        "📱 Detected mobile cut-off time pattern, using inference..."
      );

      // Extract the partial start time
      const partialMatch = cleanTimeStr.match(
        /([A-Z]{1,3}:)?(\d{1,2}:?\d{0,2})/
      );
      if (partialMatch) {
        const [, dayCode, partialTime] = partialMatch;

        // Use time slot inference to get complete time slot
        const inferredSlot = inferTimeSlotFromPartial(partialTime);
        if (inferredSlot) {
          console.log(
            `✅ Inferred complete time slot: ${partialTime} → ${inferredSlot.start}-${inferredSlot.end}`
          );
          return {
            startTime: inferredSlot.start,
            endTime: inferredSlot.end,
            inferred: true,
            originalPartial: partialTime,
          };
        }
      }
    }

    // Try various patterns to extract times (existing logic)
    let match;

    // Pattern 1: Perfect format "18:30-21:30"
    match = cleanTimeStr.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    if (match) {
      const [, hour1, min1, hour2, min2] = match;
      return {
        startTime: `${hour1.padStart(2, "0")}:${min1}`,
        endTime: `${hour2.padStart(2, "0")}:${min2}`,
        inferred: false,
      };
    }

    // Pattern 2: "1830-2130" (no colons)
    match = cleanTimeStr.match(/(\d{3,4})-(\d{3,4})/);
    if (match) {
      let [, time1, time2] = match;
      time1 = time1.padStart(4, "0");
      time2 = time2.padStart(4, "0");
      return {
        startTime: `${time1.substring(0, 2)}:${time1.substring(2)}`,
        endTime: `${time2.substring(0, 2)}:${time2.substring(2)}`,
        inferred: false,
      };
    }

    // Pattern 3: Corrupted format like "18302130" (all smashed together)
    match = cleanTimeStr.match(/(\d{6,8})/);
    if (match) {
      const timeString = match[1];
      if (timeString.length === 8) {
        // Assume HHMM-HHMM smashed together: "18302130"
        return {
          startTime: `${timeString.substring(0, 2)}:${timeString.substring(
            2,
            4
          )}`,
          endTime: `${timeString.substring(4, 6)}:${timeString.substring(
            6,
            8
          )}`,
          inferred: false,
        };
      }
    }

    // Pattern 4: Single time with enhanced inference for screenshots
    match = cleanTimeStr.match(/(\d{1,2}):?(\d{0,2})/);
    if (match) {
      const [, hour, minute] = match;
      let partialTime = minute ? `${hour}:${minute}` : hour;

      // Enhanced handling for screenshot scenarios
      if (!minute && hour.length === 2) {
        const hourVal = parseInt(hour);

        // Case 1: Hour looks like minutes (40, 20, 30) - check for hour context
        if (hourVal >= 0 && hourVal <= 59 && (hourVal < 8 || hourVal > 21)) {
          console.log(
            `🕰️ Interpreting ${hour} as minutes, scanning context...`
          );

          // Look for hour context in the original string or nearby patterns
          const hourContext = timeStr.match(/(\d{1,2})[:\s]*(\d{2})/);
          if (hourContext && hourContext[1] !== hour) {
            partialTime = `${hourContext[1]}:${hour}`;
            console.log(`🕰️ Reconstructed from context: ${partialTime}`);
          } else {
            // Try common hour patterns for common minute values
            const minuteToHourMap = {
              40: ["14", "16"], // 14:40, 16:40 are common
              20: ["16", "10"], // 16:20, 10:20 are common
              30: ["18", "9"], // 18:30, 9:30 are common
              50: ["17", "11"], // 17:50, 11:50 are common
              10: ["16", "8"], // 16:10, 8:10 are common
            };

            if (minuteToHourMap[hour]) {
              for (const possibleHour of minuteToHourMap[hour]) {
                const testTime = `${possibleHour}:${hour}`;
                const testSlot = inferTimeSlotFromPartial(testTime);
                if (testSlot) {
                  partialTime = testTime;
                  console.log(
                    `🕰️ Mapped minute ${hour} to time ${partialTime}`
                  );
                  break;
                }
              }
            }
          }
        }

        // Case 2: Looks like a truncated hour (e.g., "1" from "14", "2" from "20")
        else if (hourVal >= 1 && hourVal <= 2) {
          // Try expanding single digits to common university hours
          const expandedHours =
            hourVal === 1
              ? ["14", "16", "18", "10", "11", "12"]
              : hourVal === 2
              ? ["20", "21"]
              : [];

          for (const expandedHour of expandedHours) {
            const testSlot = inferTimeSlotFromPartial(expandedHour);
            if (testSlot) {
              partialTime = expandedHour;
              console.log(`🕰️ Expanded ${hour} to hour ${partialTime}`);
              break;
            }
          }
        }
      }

      // Try time slot inference with the processed partial time
      const inferredSlot = inferTimeSlotFromPartial(partialTime);
      if (inferredSlot) {
        console.log(
          `✅ Enhanced inference successful: ${hour}${
            minute ? ":" + minute : ""
          } → ${partialTime} → ${inferredSlot.start}-${inferredSlot.end}`
        );
        return {
          startTime: inferredSlot.start,
          endTime: inferredSlot.end,
          inferred: true,
          originalPartial: partialTime,
          processingNotes: `Enhanced from: ${hour}${
            minute ? ":" + minute : ""
          }`,
        };
      }
    }

    // Pattern 5: Extract just numbers and try to make sense of them
    const numbers = cleanTimeStr.match(/\d+/g);
    if (numbers && numbers.length >= 1) {
      // If we have just one number, try inference
      if (numbers.length === 1) {
        const inferredSlot = inferTimeSlotFromPartial(numbers[0]);
        if (inferredSlot) {
          console.log(
            `✅ Single number inference: ${numbers[0]} → ${inferredSlot.start}-${inferredSlot.end}`
          );
          return {
            startTime: inferredSlot.start,
            endTime: inferredSlot.end,
            inferred: true,
            originalPartial: numbers[0],
          };
        }
      }

      // If we have exactly 2 numbers, try different interpretations
      if (numbers.length === 2) {
        let [start, end] = numbers;

        // Pad to ensure proper time format
        start = start.padStart(4, "0");
        end = end.padStart(4, "0");

        // Check if they look like valid time ranges
        if (start.length === 4 && end.length === 4) {
          const startHour = parseInt(start.substring(0, 2));
          const endHour = parseInt(end.substring(0, 2));

          // Basic sanity check - hours should be between 8-21 for university
          if (
            startHour >= 8 &&
            startHour <= 21 &&
            endHour >= 8 &&
            endHour <= 21 &&
            endHour > startHour
          ) {
            return {
              startTime: `${start.substring(0, 2)}:${start.substring(2)}`,
              endTime: `${end.substring(0, 2)}:${end.substring(2)}`,
              inferred: false,
            };
          }
        }
      }

      // If we have more numbers, try to find the time-like ones
      for (let i = 0; i < numbers.length - 1; i++) {
        let start = numbers[i];
        let end = numbers[i + 1];

        // Skip obviously wrong numbers
        if (start.length > 4 || end.length > 4) continue;

        start = start.padStart(4, "0");
        end = end.padStart(4, "0");

        const startHour = parseInt(start.substring(0, 2));
        const endHour = parseInt(end.substring(0, 2));

        if (
          startHour >= 8 &&
          startHour <= 21 &&
          endHour >= 8 &&
          endHour <= 21 &&
          endHour > startHour
        ) {
          return {
            startTime: `${start.substring(0, 2)}:${start.substring(2)}`,
            endTime: `${end.substring(0, 2)}:${end.substring(2)}`,
            inferred: false,
          };
        }
      }
    }

    console.warn(
      "❌ Could not extract valid time from:",
      timeStr,
      "cleaned to:",
      cleanTimeStr
    );
    return null;
  }

  /**
   * Correct common OCR errors in course codes
   * Enhanced to handle more corruption patterns from compact screenshots
   * @param {string} courseCode - Potentially corrupted course code
   * @returns {string} Corrected course code
   */
  correctCourseCode(courseCode) {
    const raw = (courseCode || "").trim();
    const hasLabSuffix = /L$/i.test(raw);
    let working = raw;
    // Strip lab suffix during normalization; we'll restore it at the end
    if (hasLabSuffix) {
      working = working.replace(/L$/i, "");
    }

    let corrected = working
      // Fix extra characters that get inserted
      .replace(/^C?MIN(\d{3})$/i, "CMN$1") // CMIN205 → CMN205
      .replace(/^CSC?I(\d{3})$/i, "CSC$1") // CSCI311 → CSC311
      .replace(/^CSC?A(\d{2,3})$/i, "CSC$1") // CSCA25 → CSC425
      .replace(/^CSC?AS(\d{2,3})$/i, "CSC$1") // CSCAS5 → CSC455
      .replace(/^CSCA(\d{3})$/i, "CSC$1") // CSCA425 → CSC425
      .replace(/^CSCAS(\d{2,3})$/i, "CSC$1") // CSCAS455 → CSC455

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
      .replace(/([A-Z]{2})s(\d{3})/g, "$1C$2")
      .replace(/([A-Z]{2})z(\d{3})/gi, "$1C$2")

      // Fix common OCR confusions
      .replace(/I/g, "1") // I → 1 in numbers
      .replace(/([A-Z]{2,3})(\d)([A-Z])(\d{2})/g, "$1$2$4") // Remove middle letters in numbers

      // Handle missing digits in course numbers (common in mobile OCR)
      .replace(/^(CSC)(\d{2})$/i, "$1$2") // CSC42 → CSC425 (needs context)
      .replace(/^(CMN)(\d{2})$/i, "$1$20$") // CMN20 → CMN205 (needs context)

      // Ensure proper format: 2-4 letters followed by 2-4 digits
      .replace(/^([A-Z]{2,4})[A-Z]*(\d{2,4}).*$/i, "$1$2")

      // Ensure proper format
      .toUpperCase();

    // Special handling for common incomplete course codes
    if (corrected === "CSC") {
      // If we just have "CSC", try to infer from context (this would need more context)
      console.log(
        `⚠️ Incomplete course code detected: ${courseCode} → ${corrected}`
      );
    }

    // Restore lab suffix if present originally
    if (hasLabSuffix && !/L$/.test(corrected)) {
      corrected = `${corrected}L`;
    }

    console.log(`🔧 Course code correction: ${courseCode} → ${corrected}`);
    return corrected;
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
      const paddedMinutes =
        minutes === "1"
          ? "10"
          : minutes === "2"
          ? "20"
          : minutes === "3"
          ? "30"
          : minutes === "4"
          ? "40"
          : minutes === "5"
          ? "50"
          : minutes + "0";
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
    return this.timeSlots.findIndex(
      (slot) => slot.start === startTime && slot.end === endTime
    );
  }
}

export default UniversityParser;
