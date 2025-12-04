/**
 * ClubNotificationService
 *
 * Small helper for recognizing and formatting club-related notifications.
 * This keeps notification type logic in one place so the Notifications page
 * can stay focused on rendering.
 */

/**
 * Returns true if the given notification is a club notification.
 * @param {Object} notification
 * @returns {boolean}
 */
export function isClubNotification(notification) {
  const type = notification?.type;
  return typeof type === "string" && type.startsWith("club_");
}

/**
 * Build display metadata for a club notification.
 * This uses the type plus any denormalized clubInfo to choose
 * icon, badge text, and friendly title/description.
 *
 * @param {Object} notification
 * @returns {{
 *   title: string,
 *   message: string,
 *   badgeText: string | null,
 *   badgeClass: string,
 *   iconClass: string
 * }}
 */
export function getClubNotificationDisplay(notification) {
  const type = notification?.type || "";
  const clubInfo = notification?.clubInfo || {};
  const baseTitle = notification?.title || "";
  const baseMessage = notification?.message || "";

  let badgeText = null;
  let badgeClass = "badge-club-generic";
  let iconClass = "fas fa-flag";

  switch (type) {
    case "club_new_event":
      badgeText = "New event";
      badgeClass = "badge-club-new";
      iconClass = "fas fa-calendar-plus";
      break;
    case "club_event_reminder":
      badgeText = "Starting soon";
      badgeClass = "badge-club-reminder";
      iconClass = "fas fa-clock";
      break;
    case "club_event_started":
      badgeText = "Live now";
      badgeClass = "badge-club-live";
      iconClass = "fas fa-broadcast-tower";
      break;
    case "club_event_changed":
      badgeText = "Updated";
      badgeClass = "badge-club-updated";
      iconClass = "fas fa-edit";
      break;
    case "club_event_cancelled":
      badgeText = "Cancelled";
      badgeClass = "badge-club-cancelled";
      iconClass = "fas fa-ban";
      break;
    case "club_event_pending":
      badgeText = "Pending approval";
      badgeClass = "badge-club-pending";
      iconClass = "fas fa-clipboard-check";
      break;
    case "club_event_approved":
      badgeText = "Approved";
      badgeClass = "badge-club-approved";
      iconClass = "fas fa-check-circle";
      break;
    case "club_event_rejected":
      badgeText = "Not approved";
      badgeClass = "badge-club-rejected";
      iconClass = "fas fa-times-circle";
      break;
    default:
      badgeText = null;
      badgeClass = "badge-club-generic";
      iconClass = "fas fa-flag";
  }

  const title =
    baseTitle ||
    (clubInfo.name
      ? `Update from ${clubInfo.name}`
      : "Club update");

  const message =
    baseMessage ||
    (type === "club_new_event"
      ? "A club you follow posted a new event."
      : "There is an update from a club you follow.");

  return {
    title,
    message,
    badgeText,
    badgeClass,
    iconClass,
  };
}

