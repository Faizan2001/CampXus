/**
 * =============================================================================
 *                      OCR INTEGRATION TESTS (SIMPLIFIED)
 *                    Testing Image Import Without Tesseract Mocking
 * =============================================================================
 *
 * Note: Image import functionality has been disabled. These tests verify
 * that the graceful fallback message is returned.
 */

import { ScheduleImportService } from "../../services/schedule/ScheduleImportService.js";

describe("Image Import Integration", () => {
  let service;

  beforeEach(() => {
    service = new ScheduleImportService();
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe("ScheduleImportService with OCR", () => {
    test("should have processScheduleImage method", () => {
      expect(typeof service.processScheduleImage).toBe("function");
    });

    test("should return graceful message when image import is disabled", async () => {
      const mockFile = {
        type: "image/jpeg",
        size: 1024,
        name: "test.jpg",
      };

      const result = await service.processScheduleImage(mockFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Image import is not available");
    });

    test("should handle getImportSummary for image imports", () => {
      const mockImageResult = {
        success: true,
        stats: {
          validCourses: 3,
          totalCourses: 4,
          errorCourses: 1,
          successRate: "75.0",
        },
        importType: "image",
        ocrConfidence: 85,
      };

      const summary = service.getImportSummary(mockImageResult);

      expect(summary).toContain("3 out of 4 courses");
      expect(summary).toContain("75.0% success rate");
      expect(summary).toContain("OCR confidence: 85%");
    });

    test("should handle cleanup method", async () => {
      // Should not throw
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
