// Tiny, dependency-free HTML escape helper for safe innerHTML usage
// Escapes &, <, >, ", '\'' and / to prevent DOM XSS via markup injection
export function escapeHTML(value) {
  if (value == null) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Escape a value for safe use in HTML attributes (e.g., src, href, data-*).
 * Prevents attribute breakout via quotes and XSS via javascript: URIs.
 * @param {string} value - The value to escape
 * @returns {string} Escaped value safe for attribute injection
 */
export function escapeAttr(value) {
  if (value == null) return "";
  const str = String(value);
  // Block javascript: and data: URIs that could execute code
  const lower = str.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:text/html")) {
    return "";
  }
  // Escape characters that could break out of attribute context
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Return an image URL only if it is safe to place in an <img src> attribute.
 * 🛡️ Security: photo/avatar URLs come from user-writable Firestore fields, so
 * they must never be trusted. A value such as `x" onerror="…` would otherwise
 * break out of the attribute and run script in every viewer's session.
 * Allowed: https URLs, http on localhost (emulators), data:image/* and blob:.
 * @param {string} value - Candidate URL
 * @returns {string|null} The URL when safe, otherwise null
 */
export function safeImageUrl(value) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > 4096) return null;
  // No character that could end the attribute or start markup
  if (/["'<>`\s\\]/.test(url)) return null;

  const lower = url.toLowerCase();
  if (lower.startsWith("data:image/")) return url;
  if (lower.startsWith("blob:")) return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return url;
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return url;
    }
  } catch (_) {
    // Not an absolute URL
  }
  return null;
}
