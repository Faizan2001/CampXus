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
