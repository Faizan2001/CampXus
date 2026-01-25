import {
  getClubNotificationDisplay,
  isClubNotification,
} from "../../../services/clubs/ClubNotificationService.js";

describe("ClubNotificationService", () => {
  test("isClubNotification() detects club_* types", () => {
    expect(isClubNotification({ type: "club_new_event" })).toBe(true);
    expect(isClubNotification({ type: "friend_request" })).toBe(false);
    expect(isClubNotification(null)).toBe(false);
  });

  test("getClubNotificationDisplay() provides defaults and mappings", () => {
    const display = getClubNotificationDisplay({
      type: "club_new_event",
      clubInfo: { name: "Chess Club" },
    });
    expect(display.badgeText).toBe("New event");
    expect(display.title).toContain("Chess Club");
  });
});

