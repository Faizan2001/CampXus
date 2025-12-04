/**
 * Club moderation tests
 *
 * These tests focus on the "laws" of club moderation:
 * - Which events are visible to which users (pending vs approved)
 * - How president/official roles are inferred
 *
 * They exercise the gating logic used by the Events tab and
 * CreateEventModal without needing Firestore or the router.
 */

import ClubDetailPage from "../../../pages/ClubDetailPage.js";
import { CreateEventModal } from "../../../components/clubs/CreateEventModal.js";
import { currentUser } from "../../../store/userStore.js";

describe("Club moderation visibility rules", () => {
  beforeEach(() => {
    // Reset DOM and user state between tests
    document.body.innerHTML = "";
    currentUser.reset(false);
  });

  function setUser(uid) {
    currentUser.setUser({ uid, email: `${uid}@test.dev` });
    currentUser.setProfile({
      profile: { firstName: "Test", lastName: "User", email: `${uid}@test.dev` },
      systemInfo: {},
    });
  }

  function buildEvent(id, status = "approved") {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return {
      id,
      status,
      firstSlotStart: start,
      lastSlotEnd: end,
      title: `${status} event`,
      location: "Room 101",
      timeSlots: [
        {
          date: start.toISOString().slice(0, 10),
          startTime: "10:00",
          endTime: "11:00",
        },
      ],
    };
  }

  test("regular user only sees approved events", () => {
    setUser("student1");

    const page = new ClubDetailPage();
    page.clubData = {
      id: "club1",
      createdBy: "president1",
      presidentId: "president1",
      devOwnerUid: null,
      officialIds: ["official1"],
    };
    page.members = [
      { uid: "official1", role: "official", name: "Official One" },
      { uid: "student1", role: "member", name: "Student One" },
    ];
    page.events = [
      buildEvent("approved1", "approved"),
      buildEvent("pending1", "pending_president"),
      buildEvent("rejected1", "rejected"),
    ];

    const container = document.createElement("div");
    page.renderEventsTab(container);

    const cards = Array.from(container.querySelectorAll(".event-card"));
    const ids = cards.map((c) => c.getAttribute("data-event-id"));

    expect(ids).toContain("approved1");
    expect(ids).not.toContain("pending1");
    expect(ids).not.toContain("rejected1");
  });

  test("club president sees pending and rejected events", () => {
    setUser("president1");

    const page = new ClubDetailPage();
    page.clubData = {
      id: "club1",
      createdBy: "creator1",
      presidentId: "president1",
      devOwnerUid: null,
      officialIds: ["official1"],
    };
    page.members = [{ uid: "president1", role: "president", name: "President" }];
    page.events = [
      buildEvent("approved1", "approved"),
      buildEvent("pending1", "pending_president"),
      buildEvent("rejected1", "rejected"),
    ];

    const container = document.createElement("div");
    page.renderEventsTab(container);

    const cards = Array.from(container.querySelectorAll(".event-card"));
    const ids = cards.map((c) => c.getAttribute("data-event-id"));

    expect(ids).toContain("approved1");
    expect(ids).toContain("pending1");
    expect(ids).toContain("rejected1");
  });

  test("club official (non-president) also sees pending and rejected events", () => {
    setUser("official1");

    const page = new ClubDetailPage();
    page.clubData = {
      id: "club1",
      createdBy: "creator1",
      presidentId: "president1",
      devOwnerUid: null,
      officialIds: ["official1"],
    };
    page.members = [{ uid: "official1", role: "official", name: "Official" }];
    page.events = [
      buildEvent("approved1", "approved"),
      buildEvent("pending1", "pending_president"),
      buildEvent("rejected1", "rejected"),
    ];

    const container = document.createElement("div");
    page.renderEventsTab(container);

    const cards = Array.from(container.querySelectorAll(".event-card"));
    const ids = cards.map((c) => c.getAttribute("data-event-id"));

    expect(ids).toContain("approved1");
    expect(ids).toContain("pending1");
    expect(ids).toContain("rejected1");
  });
});

describe("CreateEventModal president detection", () => {
  beforeEach(() => {
    currentUser.reset(false);
  });

  function setUser(uid) {
    currentUser.setUser({ uid, email: `${uid}@test.dev` });
    currentUser.setProfile({
      profile: { firstName: "Test", lastName: "User", email: `${uid}@test.dev` },
      systemInfo: {},
    });
  }

  test("dev owner is treated as president for devTest clubs", () => {
    setUser("devOwner");
    const clubData = {
      devTest: true,
      devOwnerUid: "devOwner",
      presidentId: "someoneElse",
      createdBy: "someoneElse",
    };
    const modal = new CreateEventModal({ clubId: "club1", clubData });

    expect(modal.isUserPresident()).toBe(true);
  });

  test("presidentId is treated as president", () => {
    setUser("president1");
    const clubData = {
      devTest: false,
      devOwnerUid: null,
      presidentId: "president1",
      createdBy: "creator1",
    };
    const modal = new CreateEventModal({ clubId: "club1", clubData });

    expect(modal.isUserPresident()).toBe(true);
  });

  test("createdBy is treated as president fallback", () => {
    setUser("creator1");
    const clubData = {
      devTest: false,
      devOwnerUid: null,
      presidentId: "someoneElse",
      createdBy: "creator1",
    };
    const modal = new CreateEventModal({ clubId: "club1", clubData });

    expect(modal.isUserPresident()).toBe(true);
  });

  test("regular member is not president", () => {
    setUser("member1");
    const clubData = {
      devTest: false,
      devOwnerUid: null,
      presidentId: "president1",
      createdBy: "creator1",
    };
    const modal = new CreateEventModal({ clubId: "club1", clubData });

    expect(modal.isUserPresident()).toBe(false);
  });
});
