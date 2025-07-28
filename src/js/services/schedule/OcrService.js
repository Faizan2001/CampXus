/**
 * =============================================================================
 *                              OCR SERVICE
 *                    Image-to-Text Extraction for Schedules
 * =============================================================================
 * 
 * This service handles extracting text from university transcript/schedule
 * images using Tesseract.js OCR. It includes preprocessing, table detection,
 * and integration with the existing UniversityParser.
 * 
 * Features:
 * - Image preprocessing for better OCR accuracy
 * - Table structure detection and extraction
 * - Integration with existing text parsing pipeline
 * - Robust error handling and progress feedback
 * 
 * =============================================================================
 */

import { createWorker } from 'tesseract.js';

/**
 * OCR Service for extracting schedule data from images
 * Designed to work seamlessly with existing UniversityParser
 */
export class OcrService {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.isProcessing = false;
  }

  /**
   * Initialize the OCR worker (lazy loading for performance)
   * @returns {Promise<void>}
   */
  async initializeWorker() {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing OCR worker...');
      
      // Check if we're in a supported environment
      if (!this.isOcrSupported()) {
        throw new Error('OCR is not supported in this environment. Please ensure Content Security Policy allows web workers.');
      }
      
      this.worker = await createWorker('eng');
      
      // Configure for better table/document recognition
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ',
        tessedit_pageseg_mode: '6', // Uniform block of text (good for tables)
        preserve_interword_spaces: '1'
      });
      
      this.isInitialized = true;
      console.log('✅ OCR worker initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OCR worker:', error);
      
      // Provide helpful error messages based on the error type
      const errorMessage = error.message || error.toString() || 'Unknown error';
      
      if (errorMessage.includes('Content Security Policy') || errorMessage.includes('CSP') || errorMessage.includes('violates')) {
        throw new Error('OCR blocked by security settings. Please refresh the page or contact support.');
      } else if (errorMessage.includes('Worker') || errorMessage.includes('importScripts')) {
        throw new Error('OCR workers not supported. Please try refreshing the page or use text paste instead.');
      } else if (errorMessage.includes('cdn.jsdelivr') || errorMessage.includes('network') || errorMessage.includes('load')) {
        throw new Error('Could not load OCR components. Please check your internet connection or use text paste instead.');
      } else {
        throw new Error('OCR initialization failed. Please try again or use text paste instead.');
      }
    }
  }

  /**
   * Check if OCR is supported in the current environment
   * @returns {boolean} Whether OCR features are available
   */
  isOcrSupported() {
    try {
      // Check for Worker support
      if (typeof Worker === 'undefined') {
        console.warn('Web Workers not supported');
        return false;
      }
      
      // Check for blob URL support
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        console.warn('Blob URLs not supported');
        return false;
      }
      
      // Check for Canvas support (needed for image preprocessing)
      if (typeof document === 'undefined' || !document.createElement) {
        console.warn('Canvas not supported');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('OCR support check failed:', error);
      return false;
    }
  }

  /**
   * Process an image file and extract schedule text
   * @param {File} imageFile - Image file from user upload
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} Extraction result with text and metadata
   */
  async processScheduleImage(imageFile, progressCallback = null) {
    if (this.isProcessing) {
      throw new Error('Already processing an image. Please wait.');
    }

    this.isProcessing = true;

    try {
      // Validate image file
      if (!imageFile || !imageFile.type.startsWith('image/')) {
        throw new Error('Please provide a valid image file (PNG, JPG, etc.)');
      }

      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (imageFile.size > maxSize) {
        throw new Error('Image file is too large. Please use an image smaller than 10MB.');
      }

      // Initialize worker if needed
      await this.initializeWorker();

      // Update progress
      if (progressCallback) progressCallback('Preprocessing image...', 10);

      // Try to preprocess image, fall back to original if it fails
      let imageToProcess;
      try {
        imageToProcess = await this.preprocessImage(imageFile);
        console.log('✅ Image preprocessing completed');
      } catch (preprocessError) {
        console.warn('⚠️ Image preprocessing failed, using original:', preprocessError.message);
        imageToProcess = imageFile; // Use original file as fallback
      }

      // Update progress  
      if (progressCallback) progressCallback('Extracting text with OCR...', 30);

      // Perform OCR without logger to avoid DataCloneError
      // Progress will be handled with simple status updates
      if (progressCallback) progressCallback('Reading text...', 50);
      
      const { data } = await this.worker.recognize(imageToProcess);

      // Update progress
      if (progressCallback) progressCallback('Processing extracted text...', 95);

      // Process the extracted text
      const processedResult = this.processExtractedText(data);

      // Update progress
      if (progressCallback) progressCallback('Complete!', 100);

      return {
        success: true,
        extractedText: processedResult.cleanText,
        scheduleData: processedResult.scheduleLines,
        confidence: data.confidence || 0,
        metadata: {
          originalText: data.text || '',
          wordCount: data.words ? data.words.length : 0,
          processingTime: Date.now(),
          imageSize: imageFile.size,
          imageName: imageFile.name
        }
      };

    } catch (error) {
      console.error('❌ OCR processing failed:', error);
      return {
        success: false,
        error: error.message,
        extractedText: null,
        scheduleData: null
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Preprocess image to improve OCR accuracy
   * @param {File} imageFile - Original image file
   * @returns {Promise<HTMLCanvasElement>} Preprocessed image
   */
  async preprocessImage(imageFile) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        try {
          // Set canvas size with reasonable limits
          const maxWidth = 2000;
          const maxHeight = 2000;
          let { width, height } = img;
          
          // Scale down if too large
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width *= scale;
            height *= scale;
          }
          
          canvas.width = width;
          canvas.height = height;

          // Draw original image
          ctx.drawImage(img, 0, 0, width, height);

          // Get image data for processing
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Apply preprocessing filters
          this.enhanceContrast(data);
          this.convertToGrayscale(data);
          this.sharpenImage(data, canvas.width, canvas.height);

          // Put processed data back
          ctx.putImageData(imageData, 0, 0);
          
          // Clean up the blob URL
          URL.revokeObjectURL(img.src);

          resolve(canvas);
        } catch (error) {
          reject(new Error('Image preprocessing failed: ' + error.message));
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image. Please try a different image format or smaller file size.'));
      };

      // Set crossOrigin before src to avoid CORS issues
      img.crossOrigin = 'anonymous';
      img.src = URL.createObjectURL(imageFile);
    });
  }

  /**
   * Enhance image contrast for better OCR
   * @param {Uint8ClampedArray} data - Image pixel data
   */
  enhanceContrast(data) {
    const factor = 1.2; // Contrast enhancement factor
    const intercept = 128 * (1 - factor);

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] * factor + intercept));     // Red
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * factor + intercept)); // Green
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * factor + intercept)); // Blue
    }
  }

  /**
   * Convert image to grayscale for better OCR
   * @param {Uint8ClampedArray} data - Image pixel data
   */
  convertToGrayscale(data) {
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;     // Red
      data[i + 1] = gray; // Green
      data[i + 2] = gray; // Blue
    }
  }

  /**
   * Apply sharpening filter to enhance text edges
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  sharpenImage(data, width, height) {
    const sharpenKernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    const tempData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let newValue = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            newValue += tempData[pixelIndex] * sharpenKernel[kernelIndex];
          }
        }

        const currentIndex = (y * width + x) * 4;
        data[currentIndex] = Math.max(0, Math.min(255, newValue));
        data[currentIndex + 1] = data[currentIndex];
        data[currentIndex + 2] = data[currentIndex];
      }
    }
  }

  /**
   * Process extracted OCR text to identify schedule data
   * @param {Object} ocrData - OCR result data from Tesseract
   * @returns {Object} Processed text with schedule lines identified
   */
  processExtractedText(ocrData) {
    const fullText = ocrData.text || '';
    
    // Pre-process text to fix common OCR errors for university schedules
    const cleanedText = fullText
      .replace(/;/g, ':')  // Fix semicolons misread as colons in times
      .replace(/(\d)\s+(\d)/g, '$1$2')  // Remove spaces between digits
      .replace(/([A-Z]{1,3})\s*:\s*(\d)/g, '$1:$2')  // Fix spacing around day codes
      .replace(/-\s+(\d)/g, '-$1')  // Fix spacing after dashes in time ranges
      .replace(/(\d)\s*-\s*(\d)/g, '$1-$2');  // Fix spacing around dashes
    
    const lines = cleanedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Identify potential schedule lines
    const scheduleLines = [];
    const courseCodePattern = /^[A-Z]{2,4}\d{3}/; // Matches CSE110, CMN205, etc.

    // Look for lines that might contain course information
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if line starts with course code
      if (courseCodePattern.test(line)) {
        scheduleLines.push(line);
        continue;
      }

      // Check if this could be a multi-line format
      if (line.match(/^[A-Z]{2,4}\d{3}\s+/) && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Enhanced pattern to catch cropped times like "ST:14:40-16:1" or "ST:14;40-16"
        if (nextLine.match(/[A-Z]{1,3}[:\s]*\d{1,2}[:\s;]\d{1,2}[-:]\d{1,2}[:\s;]?\d{0,2}/)) {
          scheduleLines.push(line);
          scheduleLines.push(nextLine);
          i++; // Skip next line
        }
      }

      // Enhanced time pattern matching for cropped times
      // Matches: "ST:14:40-16:10", "ST:14;40-16:1", "ST:14:40-16", etc.
      if (line.match(/[A-Z]{1,3}[:\s]*\d{1,2}[:\s;]\d{1,2}[-:]\d{1,2}[:\s;]?\d{0,2}/)) {
        // Check if previous line had course info or if this line contains course code
        if ((i > 0 && scheduleLines.length > 0) || courseCodePattern.test(line)) {
          scheduleLines.push(line);
        }
      }

      // Also catch lines that might have course info embedded with time
      // Like "CMN205 Introduction... ST:14;40-16:1"
      if (line.match(/[A-Z]{2,4}\d{3}.*[A-Z]{1,3}[:\s]*\d{1,2}[:\s;]\d{1,2}/)) {
        scheduleLines.push(line);
      }
    }

    return {
      cleanText: scheduleLines.join('\n'),
      scheduleLines: scheduleLines,
      allLines: lines,
      lineCount: lines.length,
      scheduleLineCount: scheduleLines.length
    };
  }

  /**
   * Get processing statistics and confidence metrics
   * @param {Object} result - OCR processing result
   * @returns {string} Human-readable summary
   */
  getProcessingSummary(result) {
    if (!result.success) {
      return `OCR failed: ${result.error}`;
    }

    const confidence = Math.round(result.confidence);
    const lineCount = result.scheduleData?.length || 0;

    return `Extracted ${lineCount} potential course lines with ${confidence}% confidence`;
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this.worker) {
      try {
        await this.worker.terminate();
        console.log('🔄 OCR worker terminated');
      } catch (error) {
        console.warn('Warning: OCR worker cleanup failed:', error);
      }
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

export default OcrService;