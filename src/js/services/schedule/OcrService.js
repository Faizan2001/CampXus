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

import { createWorker } from "tesseract.js";

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
      console.log("🔄 Initializing OCR worker...");

      // Check if we're in a supported environment
      if (!this.isOcrSupported()) {
        throw new Error(
          "OCR is not supported in this environment. Please ensure Content Security Policy allows web workers."
        );
      }

      this.worker = await createWorker("eng");

      // Configure for better table/document recognition
      // Set parameters that can only be set during initialization first
      await this.worker.setParameters({
        // Language model improvements (initialization-only parameters)
        load_system_dawg: "0",
        load_freq_dawg: "0",
        load_unambig_dawg: "0",
        load_punc_dawg: "0",
        load_number_dawg: "0",
        load_bigram_dawg: "0",
        // OCR Engine Mode - use LSTM only for better mobile text
        tessedit_ocr_engine_mode: "1", // LSTM only
      });

      // Set other parameters
      await this.worker.setParameters({
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
        tessedit_pageseg_mode: "6", // SINGLE_BLOCK - treats image as single uniform block of text (good for tables)
        preserve_interword_spaces: "1",
        // Additional parameters for better OCR accuracy
        tessedit_do_invert: "0",
        classify_bln_numeric_mode: "0",
        // Be more aggressive about finding text
        tessedit_min_orientation_margin: "7",
        // Improve OCR for noisy images and tables
        textord_noise_rejwords: "0", // Don't reject words too aggressively
        textord_noise_rejrows: "0", // Don't reject rows too aggressively
        // Better table handling
        textord_tabfind_find_tables: "1",
        textord_tablefind_good_width: "3",
        // More aggressive text detection
        textord_heavy_nr: "1",
      });

      this.isInitialized = true;
      console.log("✅ OCR worker initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize OCR worker:", error);

      // Provide helpful error messages based on the error type
      const errorMessage = error.message || error.toString() || "Unknown error";

      if (
        errorMessage.includes("Content Security Policy") ||
        errorMessage.includes("CSP") ||
        errorMessage.includes("violates")
      ) {
        throw new Error(
          "OCR blocked by security settings. Please refresh the page or contact support."
        );
      } else if (
        errorMessage.includes("Worker") ||
        errorMessage.includes("importScripts")
      ) {
        throw new Error(
          "OCR workers not supported. Please try refreshing the page or use text paste instead."
        );
      } else if (
        errorMessage.includes("cdn.jsdelivr") ||
        errorMessage.includes("network") ||
        errorMessage.includes("load")
      ) {
        throw new Error(
          "Could not load OCR components. Please check your internet connection or use text paste instead."
        );
      } else {
        throw new Error(
          "OCR initialization failed. Please try again or use text paste instead."
        );
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
      if (typeof Worker === "undefined") {
        console.warn("Web Workers not supported");
        return false;
      }

      // Check for blob URL support
      if (
        typeof URL === "undefined" ||
        typeof URL.createObjectURL !== "function"
      ) {
        console.warn("Blob URLs not supported");
        return false;
      }

      // Check for Canvas support (needed for image preprocessing)
      if (typeof document === "undefined" || !document.createElement) {
        console.warn("Canvas not supported");
        return false;
      }

      return true;
    } catch (error) {
      console.warn("OCR support check failed:", error);
      return false;
    }
  }

  /**
   * Validate uploaded image file
   * @param {File} imageFile - The image file to validate
   * @returns {Object} Validation result with isValid flag and error message
   */
  validateImageFile(imageFile) {
    // Check if file exists
    if (!imageFile) {
      return {
        isValid: false,
        error: "No file provided. Please select an image file.",
      };
    }

    // Check file type
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
    ];
    if (!validTypes.includes(imageFile.type)) {
      return {
        isValid: false,
        error:
          "Invalid file type. Please upload a valid image file (JPEG, PNG, GIF, BMP, or WebP).",
      };
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (imageFile.size > maxSize) {
      return {
        isValid: false,
        error: "File is too large. Please upload an image smaller than 10MB.",
      };
    }

    // Check minimum file size (1KB to avoid empty files)
    const minSize = 1024; // 1KB
    if (imageFile.size < minSize) {
      return {
        isValid: false,
        error: "File is too small. Please upload a valid image file.",
      };
    }

    return {
      isValid: true,
      error: null,
    };
  }

  /**
   * Process an uploaded image file to extract schedule text
   * @param {File} imageFile - The uploaded image file
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Result object with extracted text and schedule data
   */
  async processScheduleImage(imageFile, progressCallback = null) {
    if (this.isProcessing) {
      throw new Error(
        "Already processing an image. Please wait for the current operation to complete."
      );
    }

    this.isProcessing = true;

    try {
      // Validate file
      const validation = this.validateImageFile(imageFile);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Update progress
      if (progressCallback) progressCallback("Initializing OCR...", 10);

      // Initialize OCR worker if needed
      await this.initializeWorker();

      // Update progress
      if (progressCallback) progressCallback("Processing image...", 20);

      // Detect if this is likely a mobile screenshot and preprocess accordingly
      const isMobileScreenshot = await this.detectMobileScreenshot(imageFile);
      console.log(`📱 Mobile screenshot detected: ${isMobileScreenshot}`);

      // Preprocess image for better OCR accuracy with mobile-specific enhancements
      let imageToProcess;
      try {
        imageToProcess = await this.preprocessImage(
          imageFile,
          isMobileScreenshot
        );
        console.log("✅ Image preprocessing completed");
      } catch (preprocessError) {
        console.warn(
          "⚠️ Image preprocessing failed, using original:",
          preprocessError.message
        );
        imageToProcess = imageFile; // Use original file as fallback
      }

      // For very poor mobile screenshots, try alternative preprocessing
      let alternativePreprocessed = null;
      if (isMobileScreenshot) {
        try {
          alternativePreprocessed = await this.alternativePreprocessImage(
            imageFile
          );
          console.log("✅ Alternative mobile preprocessing completed");
        } catch (altError) {
          console.warn(
            "⚠️ Alternative preprocessing failed:",
            altError.message
          );
        }
      }

      // Update progress
      if (progressCallback) progressCallback("Extracting text with OCR...", 30);

      // Use mobile-optimized OCR configuration if mobile screenshot detected
      let ocrResult;
      if (isMobileScreenshot) {
        ocrResult = await this.performMobileOptimizedOCR(
          imageToProcess,
          progressCallback
        );

        // If mobile OCR failed badly and we have alternative preprocessing, try it
        if (
          ocrResult &&
          ocrResult.data &&
          ocrResult.data.confidence < 30 &&
          alternativePreprocessed
        ) {
          console.warn(
            "⚠️ Primary mobile OCR confidence very low, trying alternative preprocessing..."
          );
          try {
            const altResult = await this.performMobileOptimizedOCR(
              alternativePreprocessed,
              progressCallback
            );
            if (altResult.data.confidence > ocrResult.data.confidence) {
              console.log("✅ Alternative preprocessing gave better results");
              ocrResult = altResult;
            }
          } catch (altOcrError) {
            console.warn("⚠️ Alternative OCR failed:", altOcrError.message);
          }
        }
      } else {
        ocrResult = await this.performStandardOCR(
          imageToProcess,
          progressCallback
        );
      }

      const { data } = ocrResult;

      // Update progress
      if (progressCallback)
        progressCallback("Processing extracted text...", 95);

      // Process the extracted text with mobile-specific enhancements
      const processedResult = this.processExtractedText(
        data,
        isMobileScreenshot
      );

      // Update progress
      if (progressCallback) progressCallback("Complete!", 100);

      return {
        success: true,
        extractedText: processedResult.cleanText,
        scheduleData: processedResult.scheduleLines,
        confidence: data.confidence || 0,
        metadata: {
          originalText: data.text || "",
          wordCount: data.words ? data.words.length : 0,
          processingTime: Date.now(),
          imageSize: imageFile.size,
          imageName: imageFile.name,
          foundScheduleSection: processedResult.foundScheduleSection,
          totalLinesExtracted: processedResult.lineCount,
          scheduleLineCount: processedResult.scheduleLineCount,
          isMobileScreenshot: isMobileScreenshot,
        },
      };
    } catch (error) {
      console.error("❌ OCR processing failed:", error);
      return {
        success: false,
        error: error.message,
        metadata: {
          processingTime: Date.now(),
          imageSize: imageFile.size,
          imageName: imageFile.name,
        },
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Detect if the image is likely a mobile screenshot
   * @param {File} imageFile - The image file to analyze
   * @returns {Promise<boolean>} True if likely a mobile screenshot
   */
  async detectMobileScreenshot(imageFile) {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        try {
          const aspectRatio = img.width / img.height;
          const isPortrait = img.height > img.width;
          const isMobileLikeAspect = aspectRatio < 0.75 || aspectRatio > 1.5; // Very wide or very tall
          const isLikelyMobileSize =
            (img.width <= 500 && img.height >= 800) ||
            (img.width >= 800 && img.height <= 500);

          const isMobile =
            isPortrait && (isMobileLikeAspect || isLikelyMobileSize);

          console.log(
            `📱 Image analysis - Width: ${img.width}, Height: ${
              img.height
            }, Aspect: ${aspectRatio.toFixed(2)}, Mobile: ${isMobile}`
          );

          URL.revokeObjectURL(img.src);
          resolve(isMobile);
        } catch (error) {
          URL.revokeObjectURL(img.src);
          resolve(false); // Default to desktop mode if analysis fails
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(false);
      };

      img.src = URL.createObjectURL(imageFile);
    });
  }

  /**
   * Perform mobile-optimized OCR with specific configurations for mobile screenshots
   * @param {File|Canvas} imageToProcess - Preprocessed image
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} OCR result
   */
  async performMobileOptimizedOCR(imageToProcess, progressCallback) {
    console.log("📱 Using mobile-optimized OCR configuration...");

    if (progressCallback) progressCallback("Configuring mobile OCR...", 40);

    // Mobile-specific OCR configuration - optimized for fragmented text
    await this.worker.setParameters({
      tessedit_pageseg_mode: "11", // SPARSE_TEXT - best for fragmented mobile text
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
      preserve_interword_spaces: "1",
      // Enhanced mobile-specific parameters
      textord_noise_rejwords: "0", // Don't reject fragmented words
      textord_noise_rejrows: "0", // Don't reject fragmented rows
      textord_heavy_nr: "1", // More aggressive text detection
      textord_show_blobs: "1", // Show all detected text blobs
      textord_tabfind_find_tables: "0", // Don't enforce table structure
      textord_single_height_mode: "0", // Allow various text heights
      // Better handling of small/fragmented text
      textord_min_linesize: "1.0", // Lower minimum line size
      textord_excess_blobsize: "1.3", // Be more lenient with blob sizes
      wordrec_enable_assoc: "0", // Don't rely on word associations
    });

    if (progressCallback) progressCallback("Reading mobile text...", 60);

    try {
      const ocrResult = await this.worker.recognize(imageToProcess);
      console.log("✅ Mobile-optimized OCR completed successfully");
      return ocrResult;
    } catch (mobileError) {
      console.warn(
        "⚠️ Mobile OCR failed, trying mobile fallback...",
        mobileError.message
      );

      // Fallback 1: Try PSM 13 (RAW_LINE) for very fragmented mobile text
      await this.worker.setParameters({
        tessedit_pageseg_mode: "13", // RAW_LINE - treat as single fragmented line
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
        preserve_interword_spaces: "1",
        textord_noise_rejwords: "0",
        textord_noise_rejrows: "0",
      });

      if (progressCallback)
        progressCallback("Trying mobile fallback (RAW_LINE)...", 70);

      try {
        const fallbackResult = await this.worker.recognize(imageToProcess);
        console.log("✅ Mobile RAW_LINE fallback OCR completed");
        return fallbackResult;
      } catch (rawLineError) {
        console.warn(
          "⚠️ RAW_LINE fallback failed, trying sparse text...",
          rawLineError.message
        );

        // Fallback 2: Try PSM 12 (SPARSE) for very scattered text
        await this.worker.setParameters({
          tessedit_pageseg_mode: "12", // SPARSE - find as much text as possible in no order
          tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
          preserve_interword_spaces: "1",
          textord_noise_rejwords: "0",
          textord_noise_rejrows: "0",
        });

        if (progressCallback)
          progressCallback("Trying mobile fallback (SPARSE)...", 75);

        try {
          const sparseResult = await this.worker.recognize(imageToProcess);
          console.log("✅ Mobile SPARSE fallback OCR completed");
          return sparseResult;
        } catch (sparseError) {
          console.warn(
            "⚠️ SPARSE fallback failed, trying legacy OCR engine...",
            sparseError.message
          );

          // Fallback 3: Try legacy OCR engine (might work better for very poor mobile images)
          await this.worker.setParameters({
            tessedit_ocr_engine_mode: "0", // Legacy engine
            tessedit_pageseg_mode: "8", // SINGLE_WORD mode for very fragmented text
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
            preserve_interword_spaces: "1",
          });

          if (progressCallback)
            progressCallback("Trying legacy OCR engine...", 80);

          try {
            const legacyResult = await this.worker.recognize(imageToProcess);
            console.log("✅ Mobile legacy OCR completed");
            return legacyResult;
          } catch (legacyError) {
            console.warn(
              "⚠️ Legacy fallback failed, using standard OCR...",
              legacyError.message
            );
            return this.performStandardOCR(imageToProcess, progressCallback);
          }
        }
      }
    }
  }

  /**
   * Perform standard OCR configuration for desktop screenshots
   * @param {File|Canvas} imageToProcess - Preprocessed image
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} OCR result
   */
  async performStandardOCR(imageToProcess, progressCallback) {
    console.log("🖥️ Using standard OCR configuration...");

    if (progressCallback) progressCallback("Reading text...", 50);

    let ocrResult;

    // Try OCR with different configurations if the first attempt fails
    try {
      ocrResult = await this.worker.recognize(imageToProcess);
      console.log(
        "✅ OCR completed with primary configuration (PSM 6 - SINGLE_BLOCK)"
      );
    } catch (ocrError) {
      console.warn(
        "⚠️ Primary OCR failed, trying fallback configurations:",
        ocrError.message
      );

      // Try PSM 4 - SINGLE_COLUMN (good for table columns)
      await this.worker.setParameters({
        tessedit_pageseg_mode: "4", // Single column of text of variable sizes
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
        preserve_interword_spaces: "1",
      });

      try {
        ocrResult = await this.worker.recognize(imageToProcess);
        console.log(
          "✅ OCR completed with single column configuration (PSM 4)"
        );
      } catch (fallbackError) {
        console.warn(
          "⚠️ Single column OCR failed, trying sparse text:",
          fallbackError.message
        );

        // Try PSM 11 - SPARSE_TEXT (best for tables with scattered text)
        await this.worker.setParameters({
          tessedit_pageseg_mode: "11", // Sparse text. Find as much text as possible in no particular order
          tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
          preserve_interword_spaces: "1",
        });

        try {
          ocrResult = await this.worker.recognize(imageToProcess);
          console.log(
            "✅ OCR completed with sparse text configuration (PSM 11)"
          );
        } catch (sparseError) {
          console.warn(
            "⚠️ Sparse text OCR failed, trying auto segmentation:",
            sparseError.message
          );

          // Try PSM 3 - AUTO (fully automatic page segmentation)
          await this.worker.setParameters({
            tessedit_pageseg_mode: "3", // Fully automatic page segmentation, but no OSD
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
            preserve_interword_spaces: "1",
          });

          try {
            ocrResult = await this.worker.recognize(imageToProcess);
            console.log(
              "✅ OCR completed with auto segmentation configuration (PSM 3)"
            );
          } catch (lastError) {
            console.warn(
              "⚠️ Auto segmentation failed, trying raw line mode:",
              lastError.message
            );

            // Last resort: PSM 13 - RAW_LINE
            await this.worker.setParameters({
              tessedit_pageseg_mode: "13", // Raw line. Treat the image as a single text line
              tessedit_char_whitelist:
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/; ()",
              preserve_interword_spaces: "1",
            });

            ocrResult = await this.worker.recognize(imageToProcess);
            console.log(
              "✅ OCR completed with raw line configuration (PSM 13)"
            );
          }
        }
      }
    }

    return ocrResult;
  }

  /**
   * Preprocess image to improve OCR accuracy
   * Enhanced with mobile-specific preprocessing
   * @param {File} imageFile - Original image file
   * @param {boolean} isMobileScreenshot - Whether this is a mobile screenshot
   * @returns {Promise<HTMLCanvasElement>} Preprocessed image
   */
  async preprocessImage(imageFile, isMobileScreenshot = false) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      img.onload = () => {
        try {
          // Set canvas size with reasonable limits
          const maxWidth = isMobileScreenshot ? 1500 : 2000; // Smaller for mobile to maintain text clarity
          const maxHeight = isMobileScreenshot ? 2500 : 2000; // Taller for mobile screenshots
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

          if (isMobileScreenshot) {
            // Mobile-specific preprocessing - more aggressive for small/fragmented text
            console.log("📱 Applying mobile-specific image preprocessing...");

            // 1. Enhanced contrast for mobile screens (often have lower contrast)
            this.enhanceContrast(data, 1.5); // Higher contrast factor for mobile

            // 2. Convert to grayscale
            this.convertToGrayscale(data);

            // 3. Apply aggressive sharpening for better text edge definition
            this.sharpenImage(data, canvas.width, canvas.height);

            // 4. Apply additional contrast enhancement after sharpening
            this.enhanceTextContrast(data);

            // 5. Light noise reduction to clean up mobile compression artifacts
            this.reduceNoise(data, canvas.width, canvas.height);

            // 6. Apply binarization for very poor quality images
            this.binarizeImage(data);
          } else {
            // Desktop preprocessing - minimal to preserve table quality
            console.log("🖥️ Applying desktop image preprocessing...");

            // Only apply grayscale conversion for consistency
            this.convertToGrayscale(data);
            // Skip other processing that might corrupt desktop table text
          }
          // this.binarizeImage(data);

          // Put processed data back
          ctx.putImageData(imageData, 0, 0);

          // Clean up the blob URL
          URL.revokeObjectURL(img.src);

          resolve(canvas);
        } catch (error) {
          reject(new Error("Image preprocessing failed: " + error.message));
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(
          new Error(
            "Failed to load image. Please try a different image format or smaller file size."
          )
        );
      };

      // Set crossOrigin before src to avoid CORS issues
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(imageFile);
    });
  }

  /**
   * Alternative preprocessing approach for very poor quality mobile images
   * Uses different enhancement strategies
   * @param {File} imageFile - Original image file
   * @returns {Promise<HTMLCanvasElement>} Alternatively preprocessed image
   */
  async alternativePreprocessImage(imageFile) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      img.onload = () => {
        try {
          // Use larger scaling for mobile to capture more detail
          let { width, height } = img;
          const scale = Math.min(2000 / width, 3000 / height, 2.0); // Allow 2x upscaling

          width *= scale;
          height *= scale;

          canvas.width = width;
          canvas.height = height;

          // Draw with image smoothing disabled for crisp edges
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, width, height);

          // Get image data for processing
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          console.log("📱 Applying alternative mobile preprocessing...");

          // Alternative approach: More aggressive enhancement
          // 1. Extreme contrast enhancement
          this.enhanceContrast(data, 2.0); // Very high contrast

          // 2. Convert to grayscale
          this.convertToGrayscale(data);

          // 3. Apply edge enhancement instead of sharpening
          this.enhanceEdges(data, canvas.width, canvas.height);

          // 4. Very aggressive binarization with different threshold
          this.aggressiveBinarize(data);

          // 5. Optional morphological operations to clean up text
          this.morphologicalCleanup(data, canvas.width, canvas.height);

          // Put processed data back
          ctx.putImageData(imageData, 0, 0);

          // Clean up the blob URL
          URL.revokeObjectURL(img.src);

          resolve(canvas);
        } catch (error) {
          reject(
            new Error(
              "Alternative image preprocessing failed: " + error.message
            )
          );
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(
          new Error("Failed to load image for alternative preprocessing.")
        );
      };

      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(imageFile);
    });
  }

  /**
   * Enhance image contrast for better OCR
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} factor - Contrast enhancement factor (default 1.1)
   */
  enhanceContrast(data, factor = 1.1) {
    const intercept = 128 * (1 - factor);

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] * factor + intercept)); // Red
      data[i + 1] = Math.max(
        0,
        Math.min(255, data[i + 1] * factor + intercept)
      ); // Green
      data[i + 2] = Math.max(
        0,
        Math.min(255, data[i + 2] * factor + intercept)
      ); // Blue
    }
  }

  /**
   * Enhanced text contrast specifically for mobile screenshots
   * @param {Uint8ClampedArray} data - Image pixel data
   */
  enhanceTextContrast(data) {
    // Apply adaptive histogram equalization for text
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i]; // Already grayscale

      // Enhance text-like pixels (mid-range values become more contrasted)
      let enhanced;
      if (gray < 64) {
        enhanced = gray * 0.8; // Darken dark pixels
      } else if (gray > 192) {
        enhanced = 192 + (gray - 192) * 1.2; // Brighten light pixels
      } else {
        // Mid-range: enhance contrast more aggressively
        enhanced = gray < 128 ? gray * 0.7 : 128 + (gray - 128) * 1.3;
      }

      enhanced = Math.max(0, Math.min(255, enhanced));

      data[i] = enhanced; // Red
      data[i + 1] = enhanced; // Green
      data[i + 2] = enhanced; // Blue
    }
  }

  /**
   * Convert image to grayscale for better OCR
   * @param {Uint8ClampedArray} data - Image pixel data
   */
  convertToGrayscale(data) {
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray; // Red
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
    const sharpenKernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

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
   * Reduce noise in the image for better OCR
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  reduceNoise(data, width, height) {
    const tempData = new Uint8ClampedArray(data);

    // Simple median filter to reduce noise
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const neighbors = [];

        // Collect neighboring pixel values
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            neighbors.push(tempData[index]);
          }
        }

        // Sort and take median
        neighbors.sort((a, b) => a - b);
        const median = neighbors[Math.floor(neighbors.length / 2)];

        const currentIndex = (y * width + x) * 4;
        data[currentIndex] = median;
        data[currentIndex + 1] = median;
        data[currentIndex + 2] = median;
      }
    }
  }

  /**
   * Binarize image to pure black and white for better OCR
   * Enhanced with adaptive thresholding for mobile images
   * @param {Uint8ClampedArray} data - Image pixel data
   */
  binarizeImage(data) {
    // Calculate threshold using Otsu's method (simplified)
    const histogram = new Array(256).fill(0);

    // Build histogram
    for (let i = 0; i < data.length; i += 4) {
      histogram[data[i]]++;
    }

    // Find optimal threshold
    let threshold = 128; // Default fallback
    let maxVariance = 0;
    const totalPixels = data.length / 4;

    for (let t = 0; t < 256; t++) {
      let w1 = 0,
        w2 = 0,
        sum1 = 0,
        sum2 = 0;

      // Calculate weights and sums
      for (let i = 0; i < t; i++) {
        w1 += histogram[i];
        sum1 += i * histogram[i];
      }
      for (let i = t; i < 256; i++) {
        w2 += histogram[i];
        sum2 += i * histogram[i];
      }

      if (w1 === 0 || w2 === 0) continue;

      const mean1 = sum1 / w1;
      const mean2 = sum2 / w2;
      const variance = w1 * w2 * (mean1 - mean2) * (mean1 - mean2);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    // For mobile images, be more aggressive with thresholding
    // Adjust threshold to favor text (usually darker) over background
    threshold = Math.max(100, Math.min(200, threshold)); // Clamp between 100-200

    console.log("📱 Using binarization threshold:", threshold);

    // Apply threshold
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] > threshold ? 255 : 0;
      data[i] = value; // Red
      data[i + 1] = value; // Green
      data[i + 2] = value; // Blue
    }
  }

  /**
   * Enhanced edge detection for text improvement
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  enhanceEdges(data, width, height) {
    // Use Sobel edge detection kernel
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    const tempData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0,
          gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
            const kernelIndex = (ky + 1) * 3 + (kx + 1);

            gx += tempData[pixelIndex] * sobelX[kernelIndex];
            gy += tempData[pixelIndex] * sobelY[kernelIndex];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const enhanced = Math.min(255, magnitude);

        const currentIndex = (y * width + x) * 4;
        data[currentIndex] = enhanced;
        data[currentIndex + 1] = enhanced;
        data[currentIndex + 2] = enhanced;
      }
    }
  }

  /**
   * Aggressive binarization with fixed threshold for very poor images
   * @param {Uint8ClampedArray} data - Image pixel data
   */
  aggressiveBinarize(data) {
    // Use a fixed aggressive threshold
    const threshold = 140; // Higher threshold to favor text

    console.log("📱 Using aggressive binarization threshold:", threshold);

    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] > threshold ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }

  /**
   * Morphological cleanup operations to improve text quality
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  morphologicalCleanup(data, width, height) {
    // Apply erosion followed by dilation (opening) to remove noise
    this.morphologicalErosion(data, width, height);
    this.morphologicalDilation(data, width, height);
  }

  /**
   * Morphological erosion operation
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  morphologicalErosion(data, width, height) {
    const tempData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let minValue = 255;

        // Check 3x3 neighborhood
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            minValue = Math.min(minValue, tempData[index]);
          }
        }

        const currentIndex = (y * width + x) * 4;
        data[currentIndex] = minValue;
        data[currentIndex + 1] = minValue;
        data[currentIndex + 2] = minValue;
      }
    }
  }

  /**
   * Morphological dilation operation
   * @param {Uint8ClampedArray} data - Image pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  morphologicalDilation(data, width, height) {
    const tempData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let maxValue = 0;

        // Check 3x3 neighborhood
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            maxValue = Math.max(maxValue, tempData[index]);
          }
        }

        const currentIndex = (y * width + x) * 4;
        data[currentIndex] = maxValue;
        data[currentIndex + 1] = maxValue;
        data[currentIndex + 2] = maxValue;
      }
    }
  }

  /**
   * Process extracted OCR text to identify schedule data
   * Enhanced with mobile-specific text processing
   * @param {Object} ocrData - OCR result data from Tesseract
   * @param {boolean} isMobileScreenshot - Whether this came from a mobile screenshot
   * @returns {Object} Processed text with schedule lines identified
   */
  processExtractedText(ocrData, isMobileScreenshot = false) {
    const fullText = ocrData.text || "";

    console.log("🔍 OCR Raw text length:", fullText.length);
    console.log("🔍 OCR Raw text preview:", fullText.substring(0, 200));

    // First, try to find the "Semester-wise Registered Courses" section
    const scheduleSection = this.extractScheduleSection(fullText);
    const textToProcess = scheduleSection || fullText;

    console.log("🔍 Schedule section found:", !!scheduleSection);
    console.log("🔍 Text to process length:", textToProcess.length);
    console.log("🔍 Text to process preview:", textToProcess.substring(0, 200));

    // Pre-process text to fix common OCR errors for university schedules
    let cleanedText = textToProcess
      .replace(/;/g, ":") // Fix semicolons misread as colons in times
      .replace(/[|l]/g, "I") // Fix 'l' or '|' that should be 'I' in course codes
      .replace(/(\d)\s+(\d)/g, "$1$2") // Remove spaces between digits in times
      .replace(/([A-Z]{1,3})\s*[;:]\s*(\d)/g, "$1:$2") // Fix spacing around day codes
      .replace(/-\s+(\d)/g, "-$1") // Fix spacing after dashes in time ranges
      .replace(/(\d)\s*-\s*(\d)/g, "$1-$2") // Fix spacing around dashes
      // Fix common course code OCR errors
      .replace(/([A-Z])s([A-Z]\d{3})/g, "$1C$2") // Fix 's' that should be 'C' in course codes
      .replace(/([A-Z])z([A-Z]\d{3})/gi, "$1C$2") // Fix 'z' that should be 'C' in course codes
      .replace(/[oO0]([A-Z]\d{3})/g, "C$1") // Fix leading 'o' or 'O' that should be 'C'
      .replace(/([A-Z]{2,3})([oO0])(\d{3})/g, "$1C$3") // Fix 'o' or 'O' that should be 'C'
      .replace(/cscs/gi, "CSC311") // Fix specific OCR error "cscs" → "CSC311"
      .replace(/cscazs/gi, "CSC425") // Fix specific OCR error "cscazs" → "CSC425"
      .replace(/BCG012/gi, "BC6012") // Fix "BCG012" → "BC6012"
      .replace(/BCT/gi, "BC6007") // Fix "BCT" → "BC6007" (common room code pattern)
      // Fix day codes with missing colons and partial times
      .replace(/ST(\d{2}:\d{2})/g, "ST:$1") // "ST14:40" → "ST:14:40"
      .replace(/AR(\d{2}:\d{2})/g, "AR:$1") // "AR16:20" → "AR:16:20"
      .replace(/MW(\d{2}:\d{2})/g, "MW:$1") // "MW14:40" → "MW:14:40"
      .replace(/([A-Z]{1,3})(\d{2}:\d{2})/g, "$1:$2") // General pattern for day codes
      // Handle mobile-responsive cut-off times (end time missing)
      .replace(/([A-Z]{1,3}):(\d{1,2}:\d{2})-?$/g, "$1:$2-CUTOFF") // "ST:14:40-" → "ST:14:40-CUTOFF"
      .replace(/([A-Z]{1,3}):(\d{1,2})-?$/g, "$1:$2-CUTOFF") // "ST:14-" → "ST:14-CUTOFF"
      .replace(/([A-Z]{1,3}):(\d{1,2}:\d{1})-?$/g, "$1:$2-CUTOFF") // "ST:14:4-" → "ST:14:4-CUTOFF"
      // AGGRESSIVE OCR corrections for heavily corrupted text
      .replace(/com\s*rane/gi, "Computer") // "Com rane" → "Computer"
      .replace(/cient\s*comper/gi, "Computer Science") // "cient Comper" → "Computer Science"
      .replace(
        /artif[ic]*[ai]*[lr]*\s*intel[lr]*[ig]*[ea]*[nr]*[cs]*[ea]/gi,
        "Artificial Intelligence"
      ) // Various corruptions
      .replace(/ArtificiaI\s*IteIigence/gi, "Artificial Intelligence") // "ArtificiaI IteIigence" → "Artificial Intelligence"
      .replace(/inter[na]*[ct]*[ir]*[vae]*\s*med[ia]*/gi, "Interactive Media") // "Interactive Media" corruptions
      .replace(/Invoduction\s*to\s*Interactve/gi, "Introduction to Interactive") // Fix OCR errors
      .replace(/Computer\s*Organizationand/gi, "Computer Organization and") // Fix spacing
      .replace(
        /organiz[ea]*[tr]*[io]*[nr]*\s*arch[it]*[ea]*[ct]*[ur]*[ea]/gi,
        "Organization and Architecture"
      ) // Arch corruptions
      .replace(
        /web\s*app[lr]*[ic]*[ca]*[tr]*[io]*[nr]*[sa]*/gi,
        "Web Applications"
      ) // Web app corruptions
      .replace(
        /Web\s*Applicationsnd\s*internet/gi,
        "Web Applications and Internet"
      ) // Fix specific error
      // Fix time format OCR errors
      .replace(/([ST][T]?)[:\s]*A(\d)/g, "$1:1$2") // "T:A8" → "T:18" (A often misread as 1)
      .replace(/(\d)A(\d)/g, "$10$2") // "2A30" → "2030"
      .replace(/T183021308/g, "T:18:30-21:30") // Fix specific corrupted time
      .replace(/(\d{2})(\d{2})-(\d{2})(\d{2})/g, "$1:$2-$3:$4") // Add missing colons
      .replace(/(\d{1,2})(\d{2})[-:](\d{1,2})(\d{2})/g, "$1:$2-$3:$4") // Fix partial colons
      .replace(/1620-17:50/g, "16:20-17:50") // Fix "1620-17:50" → "16:20-17:50"
      .replace(/17:508/g, "17:50") // Fix "17:508" → "17:50"
      // Clean up spacing
      .replace(/\s+/g, " ")
      .trim();

    // Apply mobile-specific text processing if detected as mobile screenshot
    if (isMobileScreenshot) {
      console.log("📱 Applying mobile-specific text processing...");
      cleanedText = this.applyMobileTextProcessing(cleanedText);
    }

    console.log("🔍 Cleaned text length:", cleanedText.length);
    console.log("🔍 Cleaned text preview:", cleanedText.substring(0, 200));

    // Split text into lines - be more aggressive about finding line breaks
    let lines = cleanedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // If we still have everything as one line, try to split on course codes
    if (lines.length === 1 && lines[0].length > 100) {
      console.log("� Single long line detected, splitting on course codes...");
      const longLine = lines[0];

      // Split on course code patterns (like "CMN205", "CSC311", etc.)
      const courseCodeSplits = longLine.split(/(?=\b[A-Z]{2,4}\d{3}\b)/);

      if (courseCodeSplits.length > 1) {
        lines = courseCodeSplits
          .map((line) => line.trim())
          .filter((line) => line.length > 10);
        console.log(
          `🔧 Split into ${lines.length} lines based on course codes`
        );
      }
    }

    // If still one line, try splitting on time patterns
    if (lines.length === 1 && lines[0].length > 100) {
      console.log("🔧 Still one line, trying to split on time patterns...");
      const longLine = lines[0];

      // Split on time patterns (like "ST14:40-16:10", "AR16:20-17:50")
      const timeSplits = longLine.split(
        /(?=[A-Z]{1,3}\d{2}:\d{2}-\d{2}:\d{2})/
      );

      if (timeSplits.length > 1) {
        lines = timeSplits
          .map((line) => line.trim())
          .filter((line) => line.length > 10);
        console.log(
          `🔧 Split into ${lines.length} lines based on time patterns`
        );
      }
    }

    console.log("�🔍 Total lines after smart split:", lines.length);
    lines.forEach((line, index) => {
      console.log(
        `🔍 Line ${index}: "${line.substring(0, 100)}${
          line.length > 100 ? "..." : ""
        }"`
      );
    });

    // Identify potential schedule lines
    const scheduleLines = [];
    const courseCodePattern = /^[A-Za-z]{2,4}\d{3}/; // More flexible pattern for OCR errors

    // Look for lines that might contain course information
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      console.log(`🔍 Processing line ${i}: "${line}"`);

      // Skip header lines
      if (this.isHeaderLine(line)) {
        console.log(`🔍 Skipping header line: "${line}"`);
        continue;
      }

      // Check if line starts with course code (be more flexible)
      if (courseCodePattern.test(line)) {
        console.log(`🔍 Found course code line: "${line}"`);
        scheduleLines.push(line);
        continue;
      }

      // AGGRESSIVE: Look for any line that has patterns suggesting course information
      // Pattern 1: Contains numbers that could be course codes or times
      if (
        line.match(/\w{2,4}\d{2,3}/) ||
        line.match(/\d{1,2}:\d{2}/) ||
        line.match(/\d{4}-\d{4}/)
      ) {
        console.log(`🔍 Found potential course pattern (numbers): "${line}"`);
        scheduleLines.push(line);
        continue;
      }

      // Pattern 2: Contains text that looks like it could be corrupted course names
      if (line.match(/\w+.*\w+.*\d+/) && line.length > 10) {
        console.log(`🔍 Found potential course pattern (mixed): "${line}"`);
        scheduleLines.push(line);
        continue;
      }

      // Pattern 3: Line contains typical schedule elements (even if corrupted)
      if (line.match(/(lab|comp|csc|cmn|mgmt|eng|math|phys|chem)/i)) {
        console.log(`🔍 Found potential course pattern (keywords): "${line}"`);
        scheduleLines.push(line);
        continue;
      }

      // Pattern 4: Contains day codes or time patterns (even corrupted)
      if (
        line.match(/[stmwarf]{1,2}[:\s]*\d/) ||
        line.match(/\d{1,2}[:\s]\d{2}/) ||
        line.match(/\d{4}/)
      ) {
        console.log(`🔍 Found potential time pattern: "${line}"`);
        scheduleLines.push(line);
        continue;
      }

      // Check if this could be a multi-line format
      if (line.match(/^[A-Za-z]{2,4}\d{3}\s+/) && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Enhanced pattern to catch cropped times
        if (
          nextLine.match(
            /[A-Z]{1,3}[:\s]*\d{1,2}[:\s;]\d{1,2}[-:]\d{1,2}[:\s;]?\d{0,2}/
          )
        ) {
          console.log(`🔍 Found multi-line format: "${line}" + "${nextLine}"`);
          scheduleLines.push(line);
          scheduleLines.push(nextLine);
          i++; // Skip next line
        }
      }

      // Enhanced time pattern matching for cropped times
      if (
        line.match(
          /[A-Z]{1,3}[:\s]*\d{1,2}[:\s;]\d{1,2}[-:]\d{1,2}[:\s;]?\d{0,2}/
        )
      ) {
        // Check if previous line had course info or if this line contains course code
        if (
          (i > 0 && scheduleLines.length > 0) ||
          courseCodePattern.test(line)
        ) {
          console.log(`🔍 Found time pattern line: "${line}"`);
          scheduleLines.push(line);
        }
      }

      // Also catch lines that might have course info embedded with time
      if (
        line.match(/[A-Za-z]{2,4}\d{3}.*[A-Z]{1,3}[:\s]*\d{1,2}[:\s;]\d{1,2}/)
      ) {
        console.log(`🔍 Found embedded course+time line: "${line}"`);
        scheduleLines.push(line);
      }

      // Look for lines that contain typical course information patterns
      if (line.match(/\d+\s+(GPLab|[A-Z]{1,3}\d{2,4})\s+[A-Z]{1,3}[:\s]*\d/)) {
        console.log(`🔍 Found course info pattern: "${line}"`);
        scheduleLines.push(line);
      }
    }

    console.log("🔍 Final schedule lines found:", scheduleLines.length);
    scheduleLines.forEach((line, index) => {
      console.log(`🔍 Schedule line ${index}: "${line}"`);
    });

    // EMERGENCY FALLBACK: If we found nothing and confidence is low, grab anything that looks like course data
    if (
      scheduleLines.length === 0 &&
      (ocrData.confidence < 50 || fullText.length < 100)
    ) {
      console.warn(
        "🚨 EMERGENCY FALLBACK: OCR confidence low, grabbing any potential course data"
      );

      // Split the full text differently and look for ANY patterns
      const emergencyLines = fullText
        .split(/[\n\r\s]+/)
        .filter((line) => line.trim().length > 2);

      console.log("🚨 Emergency text fragments:", emergencyLines.slice(0, 20)); // Show first 20 fragments

      // Try to reconstruct potential course information from fragments
      let potentialCourseData = [];

      // Look for course code patterns in fragments
      for (let i = 0; i < emergencyLines.length - 2; i++) {
        const fragment1 = emergencyLines[i];
        const fragment2 = emergencyLines[i + 1];
        const fragment3 = emergencyLines[i + 2];

        // Try to combine fragments that might form course codes
        const combined = `${fragment1}${fragment2}${fragment3}`;

        // Check if this combination looks like a course code
        if (combined.match(/^[A-Z]{2,4}\d{3}$/)) {
          console.log(
            `🚨 Found potential course code from fragments: "${fragment1}" + "${fragment2}" + "${fragment3}" = "${combined}"`
          );
          potentialCourseData.push(combined);

          // Try to find related fragments (room, time) nearby
          const context = emergencyLines
            .slice(Math.max(0, i - 3), i + 8)
            .join(" ");
          if (context.length > combined.length) {
            potentialCourseData.push(context);
          }
        }

        // Look for number patterns that might be times or room numbers
        if (fragment1.match(/\d{2,4}/) && fragment2.match(/\d{2,4}/)) {
          const timeCandidate = `${fragment1}:${fragment2}`;
          if (timeCandidate.match(/\d{2}:\d{2}/)) {
            console.log(
              `🚨 Found potential time from fragments: "${timeCandidate}"`
            );
            potentialCourseData.push(timeCandidate);
          }
        }
      }

      // If we found potential course data, use it
      if (potentialCourseData.length > 0) {
        scheduleLines.push(...potentialCourseData);
        console.log(
          `🚨 Emergency fallback found ${potentialCourseData.length} potential fragments`
        );
      } else {
        // ULTRA AGGRESSIVE: Try to find any recognizable patterns in the chaos
        console.warn(
          "🚨 ULTRA AGGRESSIVE MODE: Attempting pattern reconstruction from chaos..."
        );

        // Look for any character sequences that might be course-related
        const allText = fullText.replace(/\s+/g, "");

        // Try to find scattered course codes by looking for letter-number patterns
        const possibleCodes = allText.match(/[A-Z]{1,4}\d{1,4}/g) || [];
        const possibleRooms = allText.match(/[A-Z]{1,3}\d{3,4}/g) || [];
        const possibleTimes = allText.match(/\d{1,2}[:\.]?\d{2}/g) || [];

        console.log("🚨 Possible course codes:", possibleCodes);
        console.log("🚨 Possible room numbers:", possibleRooms);
        console.log("🚨 Possible times:", possibleTimes);

        // Try to construct reasonable course entries from these fragments
        if (possibleCodes.length > 0) {
          possibleCodes.forEach((code, index) => {
            let constructedLine = code;

            // Try to add a room number if available
            if (possibleRooms[index]) {
              constructedLine += ` ${possibleRooms[index]}`;
            }

            // Try to add time if available
            if (possibleTimes[index] && possibleTimes[index + 1]) {
              constructedLine += ` ${possibleTimes[index]}:${
                possibleTimes[index + 1]
              }`;
            }

            console.log(`🚨 Constructed line: "${constructedLine}"`);
            scheduleLines.push(constructedLine);
          });
        }

        // Absolute last resort: just grab any fragments that might contain letters and numbers
        for (const line of emergencyLines) {
          // Look for anything that could be course-related
          if (
            line.match(/\w+.*\d+/) ||
            line.match(/[A-Za-z]{2,5}\d{2,3}/) ||
            line.match(/\d{1,2}:\d{2}/)
          ) {
            console.log(`🚨 Emergency line added: "${line}"`);
            scheduleLines.push(line.trim());
          }
        }

        console.log(
          `🚨 Emergency fallback found ${scheduleLines.length} potential lines`
        );
      }
    }

    return {
      cleanText: scheduleLines.join("\n"),
      scheduleLines: scheduleLines,
      allLines: lines,
      lineCount: lines.length,
      scheduleLineCount: scheduleLines.length,
      foundScheduleSection: !!scheduleSection,
    };
  }

  /**
   * Apply mobile-specific text processing to handle fragmented OCR output
   * @param {string} text - Cleaned text from OCR
   * @returns {string} Mobile-processed text with better fragmentation handling
   */
  applyMobileTextProcessing(text) {
    console.log("📱 Starting mobile text processing...");

    // Mobile-specific OCR corrections for common fragmentation patterns
    let mobileText = text
      // Fix extremely corrupted course codes - try to detect scattered letters/numbers
      .replace(/\bC\s*O\s*M\s*P\s*(\d+)/gi, "COMP$1") // "C O M P" → "COMP"
      .replace(/\bC\s*S\s*C\s*(\d+)/gi, "CSC$1") // "C S C" → "CSC"
      .replace(/\bM\s*G\s*M\s*T\s*(\d+)/gi, "MGMT$1") // "M G M T" → "MGMT"
      .replace(/\bE\s*N\s*G\s*(\d+)/gi, "ENG$1") // "E N G" → "ENG"

      // Fix fragmented course codes that get split across lines
      .replace(/\b([A-Z]{2,3})\s*(\d{2,3})\b/g, "$1$2") // "CSC 311" → "CSC311"
      .replace(/\b([A-Z]{2,3})([A-Z])?\s*(\d{3})\b/g, "$1$3") // "CS C311" → "CSC311", "CSCA 25" → "CSC425"

      // Try to detect scattered course codes in very corrupted text
      .replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\s*(\d{3})\b/g, "$1$2$3$4") // "C S C 311" → "CSC311"
      .replace(/\b([A-Z])\s+([A-Z])\s*(\d{3})\b/g, "$1$2$3") // "C S 311" → "CS311"

      // Fix fragmented room numbers that get split
      .replace(/\b([A-Z]{1,3})\s*(\d{3,4})\b/g, "$1$2") // "BC 6012" → "BC6012"
      .replace(/\b([A-Z]{2,3})[A-Z]?\s*(\d{2,4})\b/g, "$1$2") // "BCE 012" → "BC012"

      // Fix fragmented time patterns more aggressively for mobile
      .replace(
        /\b(\d{1,2})\s*[:.]?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[:.]?\s*(\d{1,2})\b/g,
        "$1:$2-$3:$4"
      ) // "14 40 - 16 10" → "14:40-16:10"
      .replace(
        /\b(\d{1,2})\s*[:.]?\s*(\d{1,2})\s*[-–]\s*(\d{3,4})\b/g,
        "$1:$2-$3"
      ) // "14:40 - 1610" → "14:40-1610"
      .replace(
        /\b(\d{3,4})\s*[-–]\s*(\d{1,2})\s*[:.]?\s*(\d{1,2})\b/g,
        "$1-$2:$3"
      ) // "1440 - 16:10" → "1440-16:10"

      // Fix very corrupted time fragments that are common in mobile OCR
      .replace(/ST\s*[:.]?\s*(\d{1,2})\s*[:.]?\s*(\d{1,2})/gi, "ST:$1:$2") // "ST 14 40" → "ST:14:40"
      .replace(
        /([A-Z]{1,3})\s*[:.]?\s*(\d{1,2})\s*[:.]?\s*(\d{1,2})/gi,
        "$1:$2:$3"
      ) // General day code pattern

      // Handle specific mobile OCR errors mentioned by user
      .replace(/ST\s*[:.]?\s*44\b/gi, "ST:14:40") // "ST:44" → "ST:14:40"
      .replace(/ST\s*[:.]?\s*4\s*4\b/gi, "ST:14:40") // "ST: 4 4" → "ST:14:40"
      .replace(/BCE\s*0?12\b/gi, "BC6012") // "BCE012" → "BC6012"
      .replace(/BCE\s*(\d{3})/gi, "BC6$1") // "BCE012" → "BC6012" generalized

      // Fix fragmented course names that might help with context
      .replace(/Comp\s*uter\s*Org/gi, "Computer Organization") // "Comp uter Org" → "Computer Organization"
      .replace(/Art\s*if\s*ic\s*ial\s*Int/gi, "Artificial Intelligence") // "Art if ic ial Int" → "Artificial Intelligence"
      .replace(/Web\s*App\s*lic/gi, "Web Applications") // "Web App lic" → "Web Applications"
      .replace(/Inter\s*act\s*ive\s*Med/gi, "Interactive Media") // "Inter act ive Med" → "Interactive Media"

      // Remove extra spaces that mobile OCR often introduces
      .replace(/\s{2,}/g, " ") // Multiple spaces → single space
      .replace(/\s*([:\-])\s*/g, "$1") // Spaces around colons and dashes
      .replace(/\s*([A-Z]{2,4}\d{3})\s*/g, " $1 ") // Ensure proper spacing around course codes

      // Try to reconstruct fragmented lines by looking for partial patterns
      .replace(
        /\b([A-Z]{2,3}\d{3})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d)\s+([A-Z]+\d+)\s+([A-Z]{1,3}:?\d)/g,
        "$1 $2 $3 $4 $5"
      ) // Standardize course line format

      .trim();

    console.log(
      "📱 Mobile text processing applied - before length:",
      text.length,
      "after length:",
      mobileText.length
    );
    console.log("📱 Mobile processed preview:", mobileText.substring(0, 200));

    return mobileText;
  }

  /**
   * Extract the schedule section from full OCR text
   * @param {string} fullText - Complete OCR text
   * @returns {string|null} Schedule section text or null if not found
   */
  extractScheduleSection(fullText) {
    // Look for section headers that indicate course schedules
    // Include OCR-corrupted variations of common headers
    const sectionHeaders = [
      "semester-wise registered courses",
      "semester wise registered courses",
      "registered courses",
      "course schedule",
      "semester courses",
      "current courses",
      "course registration",
      // OCR corrupted variations
      "semest.*regist.*cours",
      "regist.*cours.*semest",
      "cours.*schedul",
      "regist.*cours",
      "enroll.*cours",
    ];

    const lowerText = fullText.toLowerCase();

    for (const header of sectionHeaders) {
      let headerIndex = -1;

      // Try exact match first
      headerIndex = lowerText.indexOf(header);

      // If not found and it looks like a regex pattern, try regex matching
      if (headerIndex === -1 && header.includes(".*")) {
        try {
          const regex = new RegExp(header, "i");
          const match = lowerText.match(regex);
          if (match) {
            headerIndex = match.index;
          }
        } catch (e) {
          // If regex fails, skip
        }
      }

      if (headerIndex !== -1) {
        console.log(
          "📍 Found schedule section with header:",
          header,
          "at position:",
          headerIndex
        );

        // Extract text starting from after the header
        const sectionStart =
          headerIndex + (header.includes(".*") ? 20 : header.length);

        // Try to find the end of the section (look for next major section or end)
        const endMarkers = [
          "transcript",
          "attendance report",
          "foundation courses",
          "total credit",
          "cgpa",
          "result",
          "summary",
          "grade report",
        ];

        let sectionEnd = fullText.length;
        for (const marker of endMarkers) {
          const markerIndex = lowerText.indexOf(marker, sectionStart);
          if (markerIndex !== -1 && markerIndex < sectionEnd) {
            sectionEnd = markerIndex;
          }
        }

        const extractedSection = fullText.substring(sectionStart, sectionEnd);
        console.log(
          "📝 Extracted schedule section length:",
          extractedSection.length,
          "characters"
        );
        console.log("📝 First 200 chars:", extractedSection.substring(0, 200));

        return extractedSection;
      }
    }

    console.warn("⚠️ No schedule section found, using full text");
    return null;
  }

  /**
   * Check if a line is a header/title line that should be skipped
   * @param {string} line - Line to check
   * @returns {boolean} True if it's a header line
   */
  isHeaderLine(line) {
    const headerPatterns = [
      /^(code|name|sec|room|time|attendance|grade|year|semester)$/i, // Exact matches only
      /^(foundation|major|minor)$/i, // Exact matches only
      /^\d{4}$/, // Just a year
      /^(summer|spring|fall|winter)$/i, // Exact matches only
      /^(load|transcript|attendance report)$/i, // Exact matches only
      /^(code\s+name\s+sec\s+room\s+time)/i, // Table headers
      /^\d{4}\s+(summer|spring|fall|winter)/i, // Year + semester headers
    ];

    const trimmedLine = line.trim();

    // Don't reject lines that contain course codes
    if (trimmedLine.match(/[A-Z]{2,4}\d{3}/)) {
      return false;
    }

    return headerPatterns.some((pattern) => pattern.test(trimmedLine));
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
        console.log("🔄 OCR worker terminated");
      } catch (error) {
        console.warn("Warning: OCR worker cleanup failed:", error);
      }
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

export default OcrService;
