import { jest } from "@jest/globals";

describe("GroupsPage auth gating", () => {
  test("attachGroupsListener exits quietly until Firebase auth is ready", async () => {
    const { GroupsPage } = await import("../../pages/GroupsPage.js");

    const root = document.createElement("div");
    root.innerHTML = `
      <div id="groups-list">initial</div>
      <div id="groups-empty"></div>
    `;
    const listEl = root.querySelector("#groups-list");
    const emptyEl = root.querySelector("#groups-empty");

    const page = new GroupsPage();
    page.ensureFirebaseAuth = jest.fn().mockResolvedValue(false);

    await page.attachGroupsListener("uid_123", listEl, emptyEl);

    expect(page.ensureFirebaseAuth).toHaveBeenCalledWith("uid_123");
    expect(page.groupsListener).toBe(null);
    expect(listEl.innerHTML).toBe("initial");
  });
});

