// Handle utilities: normalization, validation, cooldown calculations
// Canonical handle rules:
// - lowercase alphanumeric and underscores only
// - length 3-20
// - must start with a letter
// - cannot end with underscore
// - consecutive underscores now allowed
// Cooldown: 7 days between changes (handled via timestamps in user profile)

// Consolidated clean implementation
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
export const HANDLE_CHANGE_COOLDOWN_MS = 1 * 24 * 60 * 60 * 1000; // 7 days

export const HANDLE_REGEX = /^([a-z])[a-z0-9_]+[a-z0-9]$/; // double underscore allowed

export function normalizeHandle(raw = "") {
  return (raw || "").trim().toLowerCase();
}

export function validateHandle(raw) {
  const normalized = normalizeHandle(raw);
  if (!normalized) return { valid: false, normalized, reason: "empty" };
  if (normalized.length < HANDLE_MIN_LENGTH)
    return { valid: false, normalized, reason: "too_short" };
  if (normalized.length > HANDLE_MAX_LENGTH)
    return { valid: false, normalized, reason: "too_long" };
  if (!HANDLE_REGEX.test(normalized))
    return { valid: false, normalized, reason: "invalid_format" };
  return { valid: true, normalized };
}

export function canChangeHandle(
  lastChange,
  cooldownMs = HANDLE_CHANGE_COOLDOWN_MS
) {
  if (!lastChange) return { allowed: true, remainingMs: 0 };
  let lastDate;
  if (lastChange?.toDate) lastDate = lastChange.toDate();
  else if (typeof lastChange === "number") lastDate = new Date(lastChange);
  else if (lastChange instanceof Date) lastDate = lastChange;
  else lastDate = null;
  if (!lastDate) return { allowed: true, remainingMs: 0 };
  const diff = Date.now() - lastDate.getTime();
  if (diff >= cooldownMs) return { allowed: true, remainingMs: 0 };
  return { allowed: false, remainingMs: cooldownMs - diff };
}

export function formatCooldown(remainingMs) {
  if (remainingMs <= 0) return "now";
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  );
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

export const reservedHandles = new Set([
  "admin",
  "system",
  "support",
  "root",
  "null",
  "undefined",
]);
export function isReservedHandle(handle) {
  return reservedHandles.has(handle);
}

// Future: mention parsing helper stub
export function extractMentionCandidates(text = "") {
  // Simple @word extractor; validation deferred to validateHandle
  return Array.from(
    new Set((text.match(/@([a-z0-9_]+)/g) || []).map((t) => t.slice(1)))
  );
}
