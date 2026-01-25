import { describe, expect, test } from "@jest/globals";

import { notificationManager } from "../../services/realtime/NotificationService.js";

describe("NotificationService security", () => {
  const resetNotifications = () => {
    try {
      notificationManager.notifications = [];
      notificationManager.container = null;
    } catch (error) { console.debug("Suppressed error", error); }
    document.body.innerHTML = "";
  };

  test("does not inject HTML from notification message/title", () => {
    resetNotifications();

    const payload = `<img src=x onerror="window.__xss=1">XSS`;
    notificationManager.showSystemNotification(payload, "error", {
      duration: 0,
    });

    const container = document.querySelector(".notification-container");
    expect(container).toBeTruthy();

    const notif = container.querySelector(".notification");
    expect(notif).toBeTruthy();

    // If this were injected via innerHTML, we'd end up with an actual <img>.
    expect(notif.querySelector("img")).toBeFalsy();

    const messageEl = notif.querySelector(".notification-message");
    expect(messageEl).toBeTruthy();
    expect(messageEl.textContent).toContain("XSS");
    expect(messageEl.textContent).toContain("<img");
  });

  test("does not inject HTML from friend_request handle", () => {
    resetNotifications();

    notificationManager.showFriendRequestNotification({
      handle: `bad"><img src=x onerror="window.__xss=1">`,
    });

    const notif = document.querySelector(".notification-container .notification");
    expect(notif).toBeTruthy();
    expect(notif.querySelector("img")).toBeFalsy();
  });
});
