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
