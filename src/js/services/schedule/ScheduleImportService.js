/**
 * =============================================================================
 *                          SCHEDULE IMPORT SERVICE
 *                    Modern Schedule Text Parsing & Integration
 * =============================================================================
 *
 * This service orchestrates the schedule import process by coordinating
 * the UniversityParser and ScheduleValidator. It's the main entry point
 * for schedule import functionality.
 *
 * Features:
 * - Text parsing orchestration
 * - Data validation coordination
 * - MeetchuThere format conversion
 * - Seamless ProfileSetup.js integration
 *
 * =============================================================================
 */

import { UniversityParser } from "./UniversityParser.js";
import { ScheduleValidator } from "./ScheduleValidator.js";
import { OcrService } from "./OcrService.js";
import { DEFAULT_TIMESLOTS } from "../../utils/constants.js";
import { parseTime, minutesToTimeString } from "../../utils/time/timeUtils.js";
import { currentUser } from "../../store/userStore.js";

/**
 * Main service class for schedule import functionality
 * Follows the same patterns as DataService.js and AuthService.js
 */
export class ScheduleImportService {
  constructor() {
    this.parser = new UniversityParser();
    this.validator = new ScheduleValidator();
    this.ocrService = new OcrService();
    this.isProcessing = false;
  }

  /**
   * Process text input and return structured schedule data
   * @param {string} scheduleText - Raw schedule text from user
   * @param {boolean} skipLockCheck - Skip processing lock check (for internal calls)
   * @returns {Promise<Object>} Processed schedule data with validation results
   */
  async processScheduleText(scheduleText, skipLockCheck = false) {
    if (!skipLockCheck && this.isProcessing) {
      return {
        success: false,
        error: "Already processing a schedule. Please wait.",
        scheduleData: null,
        validationResult: null,
      };
    }

    if (!skipLockCheck) {
      this.isProcessing = true;
    }

    try {
      // Step 1: Parse the text into course objects
      const parsedCourses = this.parser.parseScheduleText(scheduleText);
      console.log("📅 Parsed courses:", parsedCourses);

      // Step 2: Validate and clean the data
      const validationResult = this.validator.validateSchedule(parsedCourses);
      console.log("✅ Validation result:", validationResult);

      // Step 3: Convert to MeetchuThere format
      const scheduleData = this.convertToMeetchuThereFormat(
        validationResult.validatedCourses
      );

      return {
        success: true,
        scheduleData,
        validationResult,
        stats: {
          totalCourses: parsedCourses.length,
          validCourses: validationResult.validatedCourses.length,
          errorCourses: validationResult.errors.length,
          successRate:
            parsedCourses.length > 0
              ? (
                  (validationResult.validatedCourses.length /
                    parsedCourses.length) *
                  100
                ).toFixed(1)
              : 0,
        },
      };
    } catch (error) {
      console.error("❌ Schedule processing failed:", error);
      return {
        success: false,
        error: error.message,
        scheduleData: null,
        validationResult: null,
      };
    } finally {
      if (!skipLockCheck) {
        this.isProcessing = false;
      }
    }
  }

  /**
   * Convert parsed courses to MeetchuThere schedule format (7x7 matrices)
   * @param {Array} validatedCourses - Array of validated course objects
   * @returns {Object} MeetchuThere-compatible schedule data
   */
  convertToMeetchuThereFormat(validatedCourses) {
    // Build dynamic time slots based on university defaults
    const email = (currentUser?.user?.email || "").toLowerCase();
    const uni = (currentUser?.profile?.universityInfo?.university || "").toLowerCase();
    const isIub = email.endsWith("@iub.edu.bd") || uni === "iub";

    // Start with IUB defaults or empty for others
    const baseSlots = isIub ? [...DEFAULT_TIMESLOTS] : [];
    const lastDefaultEnd = isIub
      ? DEFAULT_TIMESLOTS[DEFAULT_TIMESLOTS.length - 1].end // "17:50"
      : null;

    const slotKey = (s, e) => `${s}-${e}`;
    const seen = new Map();
    baseSlots.forEach((s, idx) => seen.set(slotKey(s.start, s.end), idx));

    // Collect evening ranges to normalize beyond the last default end (IUB only)
    const eveningRanges = [];
    const extraCandidates = [];
    for (const c of validatedCourses) {
      if (!c.startTime || !c.endTime) continue;
      const key = slotKey(c.startTime, c.endTime);
      if (seen.has(key)) continue;
      if (isIub) {
        const afterDefault = parseTime(c.startTime) > parseTime(lastDefaultEnd);
        if (afterDefault) {
          eveningRanges.push({ start: c.startTime, end: c.endTime });
        }
      } else {
        // For non-IUB, collect everything for append (no daytime defaults)
        extraCandidates.push({ start: c.startTime, end: c.endTime });
      }
      seen.set(key, -1);
    }

    // Build normalized evening slots for IUB by splitting on unique boundaries
    let normalizedEveningSlots = [];
    if (isIub && eveningRanges.length > 0) {
      const boundaries = new Set();
      for (const r of eveningRanges) {
        boundaries.add(parseTime(r.start));
        boundaries.add(parseTime(r.end));
      }
      const sorted = Array.from(boundaries).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        const s = minutesToTimeString(sorted[i]);
        const e = minutesToTimeString(sorted[i + 1]);
        // Only include segments that are strictly after lastDefaultEnd
        if (parseTime(s) > parseTime(lastDefaultEnd)) {
          normalizedEveningSlots.push({ start: s, end: e, label: `${s}-${e}` });
        }
      }
    }

    // For non-IUB, append unique detected slots (sorted), no boundary splitting yet
    if (!isIub && extraCandidates.length > 0) {
      const extrasSet = new Set();
      const uniqueExtras = [];
      for (const s of extraCandidates) {
        const k = slotKey(s.start, s.end);
        if (!extrasSet.has(k)) {
          extrasSet.add(k);
          uniqueExtras.push(s);
        }
      }
      uniqueExtras.sort((a, b) => parseTime(a.start) - parseTime(b.start));
      normalizedEveningSlots = uniqueExtras.map((s) => ({
        start: s.start,
        end: s.end,
        label: `${s.start}-${s.end}`,
      }));
    }

    const dynamicTimeSlots = [
      ...baseSlots.map((s) => ({ ...s })),
      ...normalizedEveningSlots,
    ];

    // Build schedule matrices using dynamic time slot count
    const slotsLen = dynamicTimeSlots.length;
    const schedule = Array.from({ length: 7 }, () => Array(slotsLen).fill(false));
    const slotInfo = Array.from({ length: 7 }, () =>
      Array.from({ length: slotsLen }, () => ({ courseCode: "", classroomNumber: "" }))
    );

    // Day index map
    const dayIndexMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    // Helper: find slot index by exact start/end match (for base slots)
    const findDynamicSlotIndex = (start, end) =>
      dynamicTimeSlots.findIndex((s) => s.start === start && s.end === end);

    // Populate schedule using dynamic slots
    const eveningStartIndex = baseSlots.length; // where normalized evening slots begin for IUB
    for (const course of validatedCourses) {
      if (!course.days || course.days.length === 0) continue;
      const startMin = parseTime(course.startTime);
      const endMin = parseTime(course.endTime);

      const mapByOverlap = () => {
        for (let idx = eveningStartIndex; idx < dynamicTimeSlots.length; idx++) {
          const s = parseTime(dynamicTimeSlots[idx].start);
          const e = parseTime(dynamicTimeSlots[idx].end);
          // Overlap if course start < slot end AND course end > slot start
          if (startMin < e && endMin > s) {
            for (const dayName of course.days) {
              const dayIndex = dayIndexMap[dayName.toLowerCase()];
              if (dayIndex === undefined) continue;
              schedule[dayIndex][idx] = true;
              slotInfo[dayIndex][idx] = {
                courseCode: course.courseCode,
                classroomNumber: course.room || "",
              };
            }
          }
        }
      };

      if (isIub) {
        // For IUB, map daytime by exact match; evenings by overlap
        const withinDay = startMin <= parseTime(lastDefaultEnd);
        if (withinDay) {
          const idx = findDynamicSlotIndex(course.startTime, course.endTime);
          if (idx !== -1) {
            for (const dayName of course.days) {
              const dayIndex = dayIndexMap[dayName.toLowerCase()];
              if (dayIndex === undefined) continue;
              schedule[dayIndex][idx] = true;
              slotInfo[dayIndex][idx] = {
                courseCode: course.courseCode,
                classroomNumber: course.room || "",
              };
            }
          }
        } else {
          mapByOverlap();
        }
      } else {
        // Non-IUB: map everything by overlap (since slots are fully dynamic)
        for (let idx = 0; idx < dynamicTimeSlots.length; idx++) {
          const s = parseTime(dynamicTimeSlots[idx].start);
          const e = parseTime(dynamicTimeSlots[idx].end);
          if (startMin < e && endMin > s) {
            for (const dayName of course.days) {
              const dayIndex = dayIndexMap[dayName.toLowerCase()];
              if (dayIndex === undefined) continue;
              schedule[dayIndex][idx] = true;
              slotInfo[dayIndex][idx] = {
                courseCode: course.courseCode,
                classroomNumber: course.room || "",
              };
            }
          }
        }
      }
    }

    return {
      schedule,
      slotInfo,
      timeSlots: dynamicTimeSlots,
      courses: validatedCourses,
      importedAt: new Date().toISOString(),
    };
  }

  /**
   * Process image input and return structured schedule data
   * @param {File} imageFile - Image file from user upload
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} Processed schedule data with OCR and validation results
   */
  async processScheduleImage(imageFile, progressCallback = null) {
    if (this.isProcessing) {
      return {
        success: false,
        error: "Already processing a schedule. Please wait.",
        scheduleData: null,
        validationResult: null,
        ocrResult: null,
      };
    }

    this.isProcessing = true;

    try {
      // Step 1: Extract text from image using OCR
      if (progressCallback) progressCallback("Starting OCR processing...", 5);

      const ocrResult = await this.ocrService.processScheduleImage(
        imageFile,
        progressCallback
      );

      if (!ocrResult.success) {
        return {
          success: false,
          error: `OCR failed: ${ocrResult.error}`,
          scheduleData: null,
          validationResult: null,
          ocrResult: ocrResult,
        };
      }

      console.log("📷 OCR extracted text:", ocrResult.extractedText);
      console.log("📊 OCR confidence:", `${Math.round(ocrResult.confidence)}%`);
      console.log(
        "📄 OCR found schedule section:",
        ocrResult.metadata?.foundScheduleSection
      );
      console.log(
        "📋 OCR extracted lines:",
        ocrResult.scheduleData?.length || 0
      );

      // Log each extracted line for debugging
      if (ocrResult.scheduleData && ocrResult.scheduleData.length > 0) {
        console.log("📝 Individual extracted lines:");
        ocrResult.scheduleData.forEach((line, index) => {
          console.log(`  ${index + 1}: "${line}"`);
        });
      }

      // Check if OCR extracted any meaningful text
      if (
        !ocrResult.extractedText ||
        ocrResult.extractedText.trim().length === 0
      ) {
        console.warn("⚠️ OCR extracted no text from image");
        return {
          success: false,
          error:
            "No text could be extracted from the image. Please ensure the image is clear and contains visible course schedule information. Try using a higher quality image or paste the text manually instead.",
          scheduleData: null,
          validationResult: null,
          ocrResult: ocrResult,
          feedback: {
            suggestion:
              'Try taking a clearer screenshot with good lighting, or use the "Paste Text" option instead.',
            ocrConfidence: Math.round(ocrResult.confidence),
            extractedLines: ocrResult.scheduleData?.length || 0,
          },
        };
      }

      // Step 2: Process the extracted text using existing text pipeline
      if (progressCallback)
        progressCallback("Processing extracted text...", 95);

      const textResult = await this.processScheduleText(
        ocrResult.extractedText,
        true
      );

      // Combine results
      const combinedResult = {
        ...textResult,
        ocrResult: ocrResult,
        importType: "image",
        ocrConfidence: Math.round(ocrResult.confidence),
        extractedLinesCount: ocrResult.scheduleData?.length || 0,
      };

      if (progressCallback) progressCallback("Complete!", 100);

      return combinedResult;
    } catch (error) {
      console.error("❌ Image processing failed:", error);
      return {
        success: false,
        error: error.message,
        scheduleData: null,
        validationResult: null,
        ocrResult: null,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get import statistics for display
   * @param {Object} processResult - Result from processScheduleText or processScheduleImage
   * @returns {string} Human-readable stats
   */
  getImportSummary(processResult) {
    if (!processResult.success) {
      return `Import failed: ${processResult.error}`;
    }

    const { stats } = processResult;
    let summary = `Imported ${stats.validCourses} out of ${stats.totalCourses} courses (${stats.successRate}% success rate)`;

    // Add OCR-specific info if available
    if (processResult.importType === "image" && processResult.ocrConfidence) {
      summary += ` | OCR confidence: ${processResult.ocrConfidence}%`;
    }

    return summary;
  }

  /**
   * Clean up resources (important for OCR worker)
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this.ocrService) {
      await this.ocrService.cleanup();
    }
  }
}

// Export for use in ProfileSetup.js
export default ScheduleImportService;
