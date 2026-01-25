import { jest } from "@jest/globals";

describe("Page controllers (basic SPA lifecycle)", () => {
  const cases = [
    { route: "landing", path: "../../pages/LandingPage.js" },
    { route: "home", path: "../../pages/HomePage.js" },
    { route: "friends", path: "../../pages/FriendsPage.js" },
    { route: "notifications", path: "../../pages/NotificationsPage.js" },
    { route: "messages", path: "../../pages/GroupsPage.js" },
    { route: "clubs", path: "../../pages/ClubsPage.js" },
    { route: "club", path: "../../pages/ClubDetailPage.js" },
    { route: "user", path: "../../pages/UserProfilePage.js" },
    { route: "admin", path: "../../pages/AdminPage.js" },
    { route: "saf", path: "../../pages/SafModeratePage.js" },
    { route: "group", path: "../../pages/GroupDetailPage.js" },
  ];

  beforeEach(() => {
    document.body.innerHTML = `<div class="main-content"></div>`;
  });

  test.each(cases)("loads/unloads without throwing: $route", async ({ route, path }) => {
    // Importing a controller module should be safe (it wires up listeners).
    await expect(import(path)).resolves.toBeTruthy();

    const loadEvt = new CustomEvent("spa:page:load", {
      detail: { route, router: null, hash: `#${route}` },
    });
    const unloadEvt = new CustomEvent("spa:page:unload", {
      detail: { route, router: null, hash: `#${route}` },
    });

    expect(() => document.dispatchEvent(loadEvt)).not.toThrow();
    expect(() => document.dispatchEvent(unloadEvt)).not.toThrow();
  });

  test("does not leak test timeouts by default", async () => {
    // Guardrail test: at least ensure we can import without hanging.
    jest.setTimeout(10000);
    await expect(import("../../pages/LandingPage.js")).resolves.toBeTruthy();
  });
});

