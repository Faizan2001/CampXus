/**
 * PresenceIndicator - Schedule-aware presence pill component
 *
 * Renders a text-based presence pill using statusInfo from SchedulePresenceService:
 * { state, pillText, color, metadata }
 *
 * Usage:
 *   createPresencePill(statusInfo, { expanded: false });
 */

const VALID_COLORS = new Set(["blue", "green", "red", "grey"]);

/**
 * Create presence pill markup from status info.
 * @param {Object} statusInfo
 * @param {Object} [options]
 * @param {boolean} [options.expanded=false]
 * @returns {string}
 */
export function createPresencePill(statusInfo = {}, { expanded = false } = {}) {
  const state = statusInfo.state || "";
  const rawColor = (statusInfo.color || "grey").toString().toLowerCase();
  const color = VALID_COLORS.has(rawColor) ? rawColor : "grey";
  const pillText = (statusInfo.pillText || "NO DATA").toString();
  const expandedClass = expanded ? " expanded" : "";

  return `
    <div class="presence-pill ${color}${expandedClass}"
         data-presence-state="${state}"
         data-presence-color="${color}">
      <span class="pill-text">${pillText}</span>
    </div>
  `;
}

