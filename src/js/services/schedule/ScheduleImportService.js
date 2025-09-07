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
    // Initialize 7x7 matrices (7 days, 7 time slots)
    const schedule = Array(7)
      .fill(null)
      .map(() => Array(7).fill(false));
    const slotInfo = Array(7)
      .fill(null)
      .map(() =>
        Array(7)
          .fill(null)
          .map(() => ({ courseCode: "", classroomNumber: "" }))
      );

    // Map day names to indices
    const dayIndexMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    // Populate matrices from courses
    validatedCourses.forEach((course) => {
      if (course.timeSlotIndex >= 0 && course.days.length > 0) {
        course.days.forEach((dayName) => {
          const dayIndex = dayIndexMap[dayName.toLowerCase()];
          if (dayIndex !== undefined && dayIndex >= 0) {
            // Mark slot as busy
            schedule[dayIndex][course.timeSlotIndex] = true;

            // Add course information
            slotInfo[dayIndex][course.timeSlotIndex] = {
              courseCode: course.courseCode,
              classroomNumber: course.room || "",
            };
          }
        });
      }
    });

    return {
      schedule,
      slotInfo,
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
