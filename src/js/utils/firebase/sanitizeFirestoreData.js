/**
 * Remove `undefined` values from data before writing to Firestore.
 *
 * Firestore rejects `undefined` anywhere in the payload (including nested objects).
 * This helper preserves non-plain objects (e.g. Firestore FieldValue sentinels like
 * serverTimestamp(), DocumentReferences, GeoPoints, etc.) to avoid corrupting writes.
 *
 * @param {*} input
 * @returns {*}
 */
export function sanitizeFirestoreData(input) {
  const isPlainObject = (value) => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return false;
    return Object.getPrototypeOf(value) === Object.prototype;
  };

  if (input === undefined) return undefined;

  // Preserve null explicitly (Firestore supports null)
  if (input === null) return null;

  // Preserve Date objects as-is
  if (input instanceof Date) return input;

  // Preserve Timestamp-like objects as-is (they expose .toDate())
  if (input && typeof input === "object" && typeof input.toDate === "function") {
    return input;
  }

  // Arrays: sanitize elements and drop undefined entries
  if (Array.isArray(input)) {
    return input
      .map((item) => sanitizeFirestoreData(item))
      .filter((item) => item !== undefined);
  }

  // Only recurse into plain objects. Preserve class instances (e.g., FieldValue).
  if (isPlainObject(input)) {
    const out = {};
    Object.keys(input).forEach((key) => {
      const cleaned = sanitizeFirestoreData(input[key]);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    });
    return out;
  }

  // Primitive values and non-plain objects: keep as-is
  return input;
}

