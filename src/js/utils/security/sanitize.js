/**
 * Strip dangerous HTML elements and attributes while keeping safe formatting.
 * Used as defense-in-depth for innerHTML sinks that intentionally render HTML.
 * Removes: <script>, <iframe>, <object>, <embed>, <form>, on* attributes, javascript: URIs.
 * @param {string} html - The HTML string to sanitize
 * @returns {string} Sanitized HTML safe for innerHTML
 */
export function sanitizeHTML(html) {
  if (html == null) return "";
  const str = String(html);
  return str
    // Remove script/iframe/object/embed/form tags and their content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    // Remove self-closing dangerous tags
    .replace(/<script[^>]*\/?>/gi, "")
    .replace(/<iframe[^>]*\/?>/gi, "")
    // Remove event handler attributes (on*)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove javascript: and data:text/html URIs in attributes
    .replace(/\s+(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "")
    .replace(/\s+(href|src|action)\s*=\s*(?:"data:text\/html[^"]*"|'data:text\/html[^']*')/gi, "");
}

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

// Alias for consistency with common casing in older modules/tests
export const escapeHtml = escapeHTML;

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
