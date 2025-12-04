/**
 * ClubImageService - Handles image processing and upload for clubs/events
 * Follows the same pattern as ProfilePhotoService
 * 
 * SECURITY: File paths include ownerUid prefix to enforce storage rules
 * Format: {ownerUid}_hero.webp - rules verify request.auth.uid matches prefix
 */

import { getStorageInstance } from "../../lib/firebase/firebase-config.js";
import { currentUser } from "../../store/userStore.js";
import { logManager } from "../../utils/debug/LogManager.js";

// ============================================
// Image Processing Helpers
// ============================================

/**
 * Convert a File to an Image element
 */
async function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src); // Clean up
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Resize image to fit within max dimensions (maintains aspect ratio)
 * For event hero images: 16:9 or similar landscape
 */
function resizeToFit(img, maxWidth = 1200, maxHeight = 675) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // Calculate scale to fit within max dimensions
  const scale = Math.min(maxWidth / srcW, maxHeight / srcH, 1);
  
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);

  canvas.width = newW;
  canvas.height = newH;

  // Use high-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  
  ctx.drawImage(img, 0, 0, newW, newH);
  
  return canvas;
}

/**
 * Resize image to square (center crop) - for logos
 */
function centerCropToSquare(img, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const side = Math.min(srcW, srcH);
  const sx = (srcW - side) / 2;
  const sy = (srcH - side) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  
  return canvas;
}

/**
 * Convert canvas to WebP blob
 */
async function canvasToWebPBlob(canvas, quality = 0.85) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/webp",
      quality
    );
  });
}

/**
 * Generate a preview data URL from a file
 */
export async function generatePreview(file, maxSize = 400) {
  const img = await fileToImage(file);
  const canvas = resizeToFit(img, maxSize, maxSize);
  return canvas.toDataURL("image/webp", 0.8);
}

// ============================================
// Event Image Functions
// ============================================

/**
 * Process event hero image - resize to max 1200x675 (16:9 landscape)
 * Returns a WebP blob ready for upload
 */
export async function processEventImage(file) {
  const img = await fileToImage(file);
  const canvas = resizeToFit(img, 1200, 675);
  const blob = await canvasToWebPBlob(canvas, 0.85);
  
  logManager.debug(`[ClubImageService] Processed event image: ${Math.round(blob.size / 1024)}KB`);
  
  return blob;
}

/**
 * Upload event hero image to Storage
 * Path: clubEvents/{clubId}/{eventId}/{ownerUid}_hero.webp
 * Security: Filename prefix with ownerUid ensures storage rules validate ownership
 * Returns the download URL
 */
export async function uploadEventImage(clubId, eventId, blob) {
  const storage = await getStorageInstance();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  
  const ownerUid = currentUser?.uid;
  if (!ownerUid) {
    throw new Error("Must be authenticated to upload event images");
  }
  
  // Filename includes ownerUid prefix for storage rule validation
  const filename = `${ownerUid}_hero.webp`;
  const path = `clubEvents/${clubId}/${eventId}/${filename}`;
  const imageRef = ref(storage, path);
  
  await uploadBytes(imageRef, blob, { contentType: "image/webp" });
  const url = await getDownloadURL(imageRef);
  
  logManager.info(`[ClubImageService] Uploaded event image: ${path}`);
  
  return url;
}

/**
 * Delete event image from Storage
 * Note: Can only delete images you uploaded (filename must match your UID)
 */
export async function deleteEventImage(clubId, eventId) {
  try {
    const storage = await getStorageInstance();
    const { ref, deleteObject, listAll } = await import("firebase/storage");
    
    const ownerUid = currentUser?.uid;
    if (!ownerUid) {
      throw new Error("Must be authenticated to delete event images");
    }
    
    // Try to delete with current user's UID prefix
    const filename = `${ownerUid}_hero.webp`;
    const path = `clubEvents/${clubId}/${eventId}/${filename}`;
    const imageRef = ref(storage, path);
    
    await deleteObject(imageRef);
    logManager.info(`[ClubImageService] Deleted event image: ${path}`);
  } catch (err) {
    // Ignore if file doesn't exist or permission denied (someone else uploaded it)
    if (err.code !== "storage/object-not-found") {
      logManager.warn(`[ClubImageService] Failed to delete event image:`, err);
    }
  }
}

// ============================================
// Club Logo/Banner Functions (for future use)
// ============================================

/**
 * Process club logo - square, 256x256
 */
export async function processClubLogo(file) {
  const img = await fileToImage(file);
  const canvas = centerCropToSquare(img, 256);
  const blob = await canvasToWebPBlob(canvas, 0.85);
  
  logManager.debug(`[ClubImageService] Processed club logo: ${Math.round(blob.size / 1024)}KB`);
  
  return blob;
}

/**
 * Process club banner - 1200x400 (3:1 aspect)
 */
export async function processClubBanner(file) {
  const img = await fileToImage(file);
  const canvas = resizeToFit(img, 1200, 400);
  const blob = await canvasToWebPBlob(canvas, 0.85);
  
  logManager.debug(`[ClubImageService] Processed club banner: ${Math.round(blob.size / 1024)}KB`);
  
  return blob;
}

/**
 * Upload club logo
 * Path: clubAssets/{clubId}/{ownerUid}_logo.webp
 */
export async function uploadClubLogo(clubId, blob) {
  const storage = await getStorageInstance();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  
  const ownerUid = currentUser?.uid;
  if (!ownerUid) {
    throw new Error("Must be authenticated to upload club logo");
  }
  
  const filename = `${ownerUid}_logo.webp`;
  const path = `clubAssets/${clubId}/${filename}`;
  const imageRef = ref(storage, path);
  
  await uploadBytes(imageRef, blob, { contentType: "image/webp" });
  const url = await getDownloadURL(imageRef);
  
  logManager.info(`[ClubImageService] Uploaded club logo: ${path}`);
  
  return url;
}

/**
 * Upload club banner
 * Path: clubAssets/{clubId}/{ownerUid}_banner.webp
 */
export async function uploadClubBanner(clubId, blob) {
  const storage = await getStorageInstance();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  
  const ownerUid = currentUser?.uid;
  if (!ownerUid) {
    throw new Error("Must be authenticated to upload club banner");
  }
  
  const filename = `${ownerUid}_banner.webp`;
  const path = `clubAssets/${clubId}/${filename}`;
  const imageRef = ref(storage, path);
  
  await uploadBytes(imageRef, blob, { contentType: "image/webp" });
  const url = await getDownloadURL(imageRef);
  
  logManager.info(`[ClubImageService] Uploaded club banner: ${path}`);
  
  return url;
}
