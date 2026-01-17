import { getStorageInstance } from "../../lib/firebase/firebase-config.js";

// Resize and upload profile photo and thumb to Storage.
// Returns { url, thumbUrl } on success.

async function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    const url = URL.createObjectURL(file);
    img.src = url;
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

  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

async function canvasToWebPBlob(canvas, quality = 0.82) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/webp",
      quality
    );
  });
}

export async function processProfilePhoto(file) {
  const img = await fileToImage(file);
  const main = centerCropToSquare(img, 512);
  const thumb = centerCropToSquare(img, 128);
  const mainBlob = await canvasToWebPBlob(main, 0.82);
  const thumbBlob = await canvasToWebPBlob(thumb, 0.8);
  return { mainBlob, thumbBlob };
}

export async function uploadProfilePhotoBlobs(uid, mainBlob, thumbBlob) {
  const storage = await getStorageInstance();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const mainRef = ref(storage, `profilePhotos/${uid}/photo.webp`);
  const thumbRef = ref(storage, `profilePhotos/${uid}/thumb.webp`);
  const metadata = {
    contentType: "image/webp",
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
    const mainRef = ref(storage, `profilePhotos/${uid}/photo.webp`);
    const thumbRef = ref(storage, `profilePhotos/${uid}/thumb.webp`);
    await Promise.allSettled([deleteObject(mainRef), deleteObject(thumbRef)]);
  } catch (_) {
    // Ignore deletions failures; they might not exist
  }
}
