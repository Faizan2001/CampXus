import { getStorageInstance } from "../../lib/firebase/firebase-config.js";

// Resize and upload profile photo and thumb to Storage.
// Returns { url, thumbUrl } on success.

async function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };
    img.src = URL.createObjectURL(file);
  });
}

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

// Detect WebP encoding support (Safari/iOS does NOT support canvas→WebP)
let _webpSupported = null;
function supportsWebPEncoding() {
  if (_webpSupported !== null) return _webpSupported;
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    _webpSupported = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch (_) {
    _webpSupported = false;
  }
  return _webpSupported;
}

// Best available lossy format: WebP where supported, JPEG as fallback (Safari/iOS)
function getBestFormat() {
  return supportsWebPEncoding()
    ? { mime: "image/webp", ext: "webp" }
    : { mime: "image/jpeg", ext: "jpg" };
}

async function canvasToBlob(canvas, quality = 0.82) {
  const { mime } = getBestFormat();
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

// Max allowed processed photo size (must match storage.rules)
export const MAX_PROFILE_PHOTO_BYTES = 500 * 1024; // 500 KB
// Max raw file size accepted before processing (skip obviously huge files)
export const MAX_RAW_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function processProfilePhoto(file) {
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error(`File too large (${Math.round(file.size / 1024 / 1024)}MB). Please choose an image under 15 MB.`);
  }

  const img = await fileToImage(file);
  const main = centerCropToSquare(img, 512);
  const thumb = centerCropToSquare(img, 128);

  // Adaptive quality: start high, step down gently (never below 0.70 — faces
  // show visible artifacts below that threshold per WebP/JPEG compression studies)
  const qualitySteps = [0.85, 0.80, 0.75, 0.70];
  let mainBlob;
  for (const q of qualitySteps) {
    mainBlob = await canvasToBlob(main, q);
    if (mainBlob.size <= MAX_PROFILE_PHOTO_BYTES) break;
  }

  const thumbBlob = await canvasToBlob(thumb, 0.75);
  const { mime, ext } = getBestFormat();
  return { mainBlob, thumbBlob, mime, ext };
}

export async function uploadProfilePhotoBlobs(uid, mainBlob, thumbBlob, mime) {
  const storage = await getStorageInstance();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const format = getBestFormat();
  const contentType = mime || format.mime;
  const ext = format.ext;
  const mainRef = ref(storage, `profilePhotos/${uid}/photo.${ext}`);
  const thumbRef = ref(storage, `profilePhotos/${uid}/thumb.${ext}`);
  const metadata = {
    contentType,
    // Cache-friendly: we store versioned download URLs (via `v=` query param) so it's
    // safe to cache aggressively without risking stale profile photos after an update.
    cacheControl: "public, max-age=31536000, immutable",
  };
  await uploadBytes(mainRef, mainBlob, metadata);
  await uploadBytes(thumbRef, thumbBlob, metadata);
  const uploadedAt = Date.now();
  const appendVersion = (rawUrl) => {
    try {
      const u = new URL(rawUrl);
      u.searchParams.set("v", String(uploadedAt));
      return u.toString();
    } catch (_e) {
      const sep = rawUrl.includes("?") ? "&" : "?";
      return `${rawUrl}${sep}v=${uploadedAt}`;
    }
  };

  const url = appendVersion(await getDownloadURL(mainRef));
  const thumbUrl = appendVersion(await getDownloadURL(thumbRef));
  return { url, thumbUrl };
}

export async function deleteExistingProfilePhotos(uid) {
  try {
    const storage = await getStorageInstance();
    const { ref, deleteObject } = await import("firebase/storage");
    // Clean up both possible formats (user may switch between WebP and JPEG browsers)
    const paths = [
      `profilePhotos/${uid}/photo.webp`,
      `profilePhotos/${uid}/thumb.webp`,
      `profilePhotos/${uid}/photo.jpg`,
      `profilePhotos/${uid}/thumb.jpg`,
    ];
    await Promise.allSettled(paths.map((p) => deleteObject(ref(storage, p))));
  } catch (_) {
    // Ignore deletion failures; files might not exist
  }
}
