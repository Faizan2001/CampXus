/**
 * =============================================================================
 *                      OCR INTEGRATION TESTS (SIMPLIFIED)
 *                    Testing Image Import Without Tesseract Mocking
 * =============================================================================
 */

import { ScheduleImportService } from '../../services/schedule/ScheduleImportService.js';

describe('Image Import Integration', () => {
  let service;

  beforeEach(() => {
    service = new ScheduleImportService();
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('ScheduleImportService with OCR', () => {
    test('should have processScheduleImage method', () => {
      expect(typeof service.processScheduleImage).toBe('function');
    });

    test('should handle invalid image file gracefully', async () => {
      const invalidFile = {
        type: 'text/plain',
        size: 1024,
        name: 'test.txt'
      };

      const result = await service.processScheduleImage(invalidFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain('valid image file');
    });

    test('should handle oversized files', async () => {
      const largeFile = {
        type: 'image/jpeg',
        size: 11 * 1024 * 1024, // 11MB
        name: 'large.jpg'
      };

      const result = await service.processScheduleImage(largeFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
    });

    test('should prevent concurrent processing', async () => {
      const mockFile = {
        type: 'image/jpeg',
        size: 1024,
        name: 'test.jpg'
      };
      
      // Mark as processing
      service.isProcessing = true;

      const result = await service.processScheduleImage(mockFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Already processing');
    });

    test('should handle getImportSummary for image imports', () => {
      const mockImageResult = {
        success: true,
        stats: {
          validCourses: 3,
          totalCourses: 4,
          errorCourses: 1,
          successRate: '75.0'
        },
        importType: 'image',
        ocrConfidence: 85
      };

      const summary = service.getImportSummary(mockImageResult);

      expect(summary).toContain('3 out of 4 courses');
      expect(summary).toContain('75.0% success rate');
      expect(summary).toContain('OCR confidence: 85%');
    });

    test('should handle cleanup method', async () => {
      // Should not throw
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});