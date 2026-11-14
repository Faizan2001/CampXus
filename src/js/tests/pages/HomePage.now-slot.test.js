// Current time slot ("now") marker for the Home day view
import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";

import { initializeDomElements } from "../../utils/dom/domElements.js";

let findCurrentTimeSlotIndex;
let formatNowSlotChipText;
let applyNowSlotMarker;
let _renderDayViewForTesting;
let _setStateForTesting;
let _resetStateForTesting;

beforeAll(async () => {
  // jest.setup.js stubs document.addEventListener with a no-op. Restore
  // jsdom's real method before HomePage registers its spa:page:unload and
  // visibilitychange listeners, so the cleanup path is actually exercised.
  delete document.addEventListener;
  ({
    findCurrentTimeSlotIndex,
    formatNowSlotChipText,
    applyNowSlotMarker,
    _renderDayViewForTesting,
    _setStateForTesting,
    _resetStateForTesting,
  } = await import("../../pages/HomePage.js"));
});

const SLOTS = [
  { start: "08:00", end: "09:30", label: "08:00-09:30" },
  { start: "09:40", end: "11:10", label: "09:40-11:10" },
  { start: "11:20", end: "12:50", label: "11:20-12:50" },
  { start: "12:50", end: "14:20", label: "12:50-14:20" },
];

// Local time on a fixed Monday (2026-11-16, getDay() === 1)
const at = (hours, minutes, seconds = 0, ms = 0) =>
  new Date(2026, 10, 16, hours, minutes, seconds, ms);

describe("findCurrentTimeSlotIndex", () => {
  test("returns the slot containing the time", () => {
    expect(findCurrentTimeSlotIndex(SLOTS, at(10, 15))).toBe(1);
  });

  test("start is inclusive", () => {
    expect(findCurrentTimeSlotIndex(SLOTS, at(9, 40))).toBe(1);
  });

  test("end is exclusive", () => {
    expect(findCurrentTimeSlotIndex(SLOTS, at(9, 30))).toBe(-1);
    expect(findCurrentTimeSlotIndex(SLOTS, at(9, 29, 59, 999))).toBe(0);
  });

  test("back-to-back slots: the boundary belongs to the later slot", () => {
    expect(findCurrentTimeSlotIndex(SLOTS, at(12, 50))).toBe(3);
  });

  test("returns -1 in a gap between slots", () => {
    expect(findCurrentTimeSlotIndex(SLOTS, at(11, 15))).toBe(-1);
  });

  test("returns -1 before the first and after the last slot", () => {
    expect(findCurrentTimeSlotIndex(SLOTS, at(7, 59, 59))).toBe(-1);
    expect(findCurrentTimeSlotIndex(SLOTS, at(14, 20))).toBe(-1);
    expect(findCurrentTimeSlotIndex(SLOTS, at(23, 0))).toBe(-1);
  });

  test("skips malformed or missing bounds without throwing", () => {
    const messy = [
      null,
      {},
      { start: "10:00" },
      { end: "11:00" },
      { start: "abc", end: "11:00" },
      { start: 10, end: 11 },
      { start: "25:00", end: "26:00" },
      { start: "11:00", end: "10:00" }, // end before start
      { start: "10:00", end: "11:00" },
    ];
    expect(() => findCurrentTimeSlotIndex(messy, at(10, 30))).not.toThrow();
    expect(findCurrentTimeSlotIndex(messy, at(10, 30))).toBe(8);
  });

  test("handles bad arguments", () => {
    expect(findCurrentTimeSlotIndex(undefined, at(10, 0))).toBe(-1);
    expect(findCurrentTimeSlotIndex(SLOTS, undefined)).toBe(-1);
    expect(findCurrentTimeSlotIndex(SLOTS, new Date("invalid"))).toBe(-1);
    expect(findCurrentTimeSlotIndex([], at(10, 0))).toBe(-1);
  });
});

describe("formatNowSlotChipText", () => {
  test("whole minutes left, rounded down", () => {
    expect(formatNowSlotChipText(SLOTS[2], at(11, 20))).toBe(
      "Now · 90 min left"
    );
    expect(formatNowSlotChipText(SLOTS[2], at(12, 48, 30))).toBe(
      "Now · 1 min left"
    );
  });

  test("under one minute", () => {
    expect(formatNowSlotChipText(SLOTS[2], at(12, 49, 1))).toBe(
      "Now · <1 min left"
    );
  });

  test("falls back to plain 'Now' for a malformed end", () => {
    expect(formatNowSlotChipText({ end: "nope" }, at(12, 0))).toBe("Now");
  });
});

function buildRows(day, { compare = false } = {}) {
  const container = document.createElement("div");
  SLOTS.forEach((slot, index) => {
    const row = document.createElement("div");
    row.className = compare ? "day-time-slot compare-mode" : "day-time-slot";
    row.dataset.day = String(day);
    row.dataset.timeIndex = String(index);
    row.dataset.slotStart = slot.start;
    row.dataset.slotEnd = slot.end;
    row.innerHTML = `<div class="slot-time">${slot.label}</div><div class="slot-content"></div>`;
    container.appendChild(row);
  });
  return container;
}

describe("applyNowSlotMarker", () => {
  test("marks only the current row on today's day", () => {
    const container = buildRows(1);
    const row = applyNowSlotMarker(container, at(11, 30));

    const marked = container.querySelectorAll(".is-now");
    expect(marked).toHaveLength(1);
    expect(row).toBe(marked[0]);
    expect(row.dataset.timeIndex).toBe("2");
    expect(row.querySelector(".slot-content .now-chip").textContent).toBe(
      "Now · 80 min left"
    );
  });

  test("updates the chip in place and moves the marker when the slot changes", () => {
    const container = buildRows(1);
    applyNowSlotMarker(container, at(11, 30));
    const chip = container.querySelector(".now-chip");

    applyNowSlotMarker(container, at(11, 31));
    expect(container.querySelector(".now-chip")).toBe(chip);
    expect(chip.textContent).toBe("Now · 79 min left");

    applyNowSlotMarker(container, at(12, 50));
    expect(container.querySelectorAll(".is-now")).toHaveLength(1);
    expect(container.querySelectorAll(".now-chip")).toHaveLength(1);
    expect(container.querySelector(".is-now").dataset.timeIndex).toBe("3");
  });

  test("no marker when the rows belong to another day", () => {
    const container = buildRows(2); // Tuesday rows, Monday clock
    expect(applyNowSlotMarker(container, at(11, 30))).toBe(null);
    expect(container.querySelector(".is-now, .now-chip")).toBe(null);
  });

  test("removes the marker once the time is outside every slot", () => {
    const container = buildRows(1);
    applyNowSlotMarker(container, at(11, 30));
    applyNowSlotMarker(container, at(11, 15)); // gap
    expect(container.querySelector(".is-now, .now-chip")).toBe(null);
  });

  test("compare-mode rows are never marked", () => {
    const container = buildRows(1, { compare: true });
    expect(applyNowSlotMarker(container, at(11, 30))).toBe(null);
    expect(container.querySelector(".is-now, .now-chip")).toBe(null);
  });

  test("tolerates a missing or empty container", () => {
    expect(applyNowSlotMarker(null, at(11, 30))).toBe(null);
    expect(applyNowSlotMarker(document.createElement("div"), at(11, 30))).toBe(
      null
    );
  });
});

describe("day view render (placeholders + now marker)", () => {
  const homeTemplate = fs.readFileSync(
    path.join(process.cwd(), "public/templates/home.html"),
    "utf8"
  );

  const user = {
    id: "me",
    name: "You",
    timeSlots: SLOTS,
    schedule: Array.from({ length: 7 }, () => SLOTS.map((_, i) => i === 2)),
    slotInfo: Array.from({ length: 7 }, () =>
      SLOTS.map((_, i) =>
        i === 2 ? { courseCode: "CSE303", classroomNumber: "BC5012" } : null
      )
    ),
    pinnedSlots: Array.from({ length: 7 }, () => SLOTS.map(() => false)),
  };

  beforeEach(() => {
    // Fake only Date; renderDayView awaits a real setTimeout internally
    jest.useFakeTimers({
      now: at(11, 30),
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    _resetStateForTesting();
    document.body.innerHTML = homeTemplate;
    initializeDomElements();
  });

  afterEach(() => {
    // Home unload stops the minute timer and the visibilitychange listener
    document.dispatchEvent(
      new CustomEvent("spa:page:unload", { detail: { route: "home" } })
    );
    jest.useRealTimers();
    delete document.hidden; // restore jsdom's own getter if a test stubbed it
    document.body.innerHTML = "";
  });

  test("template ships aria-hidden placeholder rows that are not slots", () => {
    const container = document.getElementById("dayViewContainer");
    const placeholders = container.querySelectorAll(".day-slot-placeholder");
    expect(placeholders.length).toBe(6);
    placeholders.forEach((el) =>
      expect(el.getAttribute("aria-hidden")).toBe("true")
    );
    expect(container.querySelector(".day-time-slot, .slot")).toBe(null);
  });

  test("render replaces placeholders and marks today's current slot", async () => {
    _setStateForTesting({
      activeUserId: "me",
      users: { me: user },
      viewMode: "day",
      selectedDay: 1,
    });

    await _renderDayViewForTesting();

    const container = document.getElementById("dayViewContainer");
    expect(container.querySelector(".day-slot-placeholder")).toBe(null);
    expect(container.querySelectorAll(".day-time-slot")).toHaveLength(4);

    const nowRow = container.querySelector(".day-time-slot.is-now");
    expect(nowRow.dataset.timeIndex).toBe("2");
    expect(nowRow.querySelector(".slot-course-code").textContent).toBe(
      "CSE303"
    );
    expect(nowRow.querySelector(".now-chip").textContent).toBe(
      "Now · 80 min left"
    );
  });

  test("visibilitychange re-applies the marker until home unloads", async () => {
    _setStateForTesting({
      activeUserId: "me",
      users: { me: user },
      viewMode: "day",
      selectedDay: 1,
    });
    await _renderDayViewForTesting();

    const container = document.getElementById("dayViewContainer");
    const stripMarker = () => {
      container.querySelectorAll(".now-chip").forEach((el) => el.remove());
      container
        .querySelectorAll(".is-now")
        .forEach((el) => el.classList.remove("is-now"));
    };

    // jsdom reports the document as hidden unless told otherwise
    let hidden = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });

    // While hidden nothing updates
    stripMarker();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(container.querySelector(".is-now, .now-chip")).toBe(null);

    // Becoming visible updates immediately
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(container.querySelector(".is-now .now-chip")).not.toBe(null);

    // After the home unload the listener is gone
    document.dispatchEvent(
      new CustomEvent("spa:page:unload", { detail: { route: "home" } })
    );
    stripMarker();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(container.querySelector(".is-now, .now-chip")).toBe(null);
  });

  test("another day renders without the marker", async () => {
    _setStateForTesting({
      activeUserId: "me",
      users: { me: user },
      viewMode: "day",
      selectedDay: 3,
    });

    await _renderDayViewForTesting();

    const container = document.getElementById("dayViewContainer");
    expect(container.querySelectorAll(".day-time-slot")).toHaveLength(4);
    expect(container.querySelector(".is-now, .now-chip")).toBe(null);
  });

  test("an empty schedule clears the placeholders and leaves no rows", async () => {
    _setStateForTesting({
      activeUserId: "me",
      users: { me: { ...user, timeSlots: [] } },
      viewMode: "day",
      selectedDay: 1,
    });

    await _renderDayViewForTesting();

    const container = document.getElementById("dayViewContainer");
    expect(container.children).toHaveLength(0);
  });
});
