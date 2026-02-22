import { describe, expect, test } from "@jest/globals";
import {
  SchedulePresenceService,
  PRESENCE_STATES,
} from "../../../services/presence/SchedulePresenceService.js";

const BASE_SLOTS = [
  { start: "08:00", end: "09:30", label: "08:00-09:30" },
  { start: "09:40", end: "11:10", label: "09:40-11:10" },
  { start: "11:20", end: "12:50", label: "11:20-12:50" },
  { start: "13:00", end: "14:30", label: "13:00-14:30" },
  { start: "14:40", end: "16:10", label: "14:40-16:10" },
];

// Helper to create a local date (not UTC) for testing
function createLocalDate(year, month, day, hours, minutes) {
  const d = new Date();
  d.setFullYear(year, month - 1, day); // month is 0-indexed
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function createScheduleForDay(now, busySlots = []) {
  const slots = BASE_SLOTS.map((slot) => ({ ...slot }));
  const matrix = Array.from({ length: 7 }, () =>
    Array.from({ length: slots.length }, () => false)
  );
  const dayIndex = now.getDay();
  busySlots.forEach((slotIdx) => {
    if (slotIdx >= 0 && slotIdx < slots.length) {
      matrix[dayIndex][slotIdx] = true;
    }
  });
  return { schedule: matrix, timeSlots: slots };
}

function buildFriend(config, now) {
  const {
    friendId = "friend-1",
    busySlots = [],
    gpsStatus = "unknown",
    lastGpsMinutesAgo,
    isRestricted = false,
    nestedSchedule = false,
  } = config;

  const { schedule, timeSlots } = createScheduleForDay(now, busySlots);
  const friend = {
    friendId,
    gpsStatus,
    isRestricted,
  };

  if (typeof lastGpsMinutesAgo === "number") {
    friend.lastGpsAt = new Date(now.getTime() - lastGpsMinutesAgo * 60000);
  }

  if (!isRestricted) {
    if (nestedSchedule) {
      friend.scheduleData = { schedule, timeSlots };
    } else {
      friend.schedule = schedule;
      friend.timeSlots = timeSlots;
    }
  }

  return friend;
}

describe("SchedulePresenceService.deriveStatus", () => {
  test("returns PRIVATE when friend is restricted", () => {
    const now = createLocalDate(2025, 1, 6, 10, 0); // Monday 10:00 AM local
    const status = SchedulePresenceService.deriveStatus(
      { friendId: "restricted", isRestricted: true },
      now
    );

    expect(status.state).toBe(PRESENCE_STATES.UNKNOWN_PRIVATE);
    expect(status.pillText).toBe("PRIVATE");
    expect(status.metadata.hasSchedule).toBe(false);
  });

  test("combines GPS + schedule to show IN_CLASS when GPS is on campus", () => {
    // At 10:00, slot 1 (09:40-11:10) is active
    const now = createLocalDate(2025, 1, 6, 10, 0); // Monday 10:00 AM local
    const friend = buildFriend(
      { busySlots: [1], gpsStatus: "on", lastGpsMinutesAgo: 4 },
      now
    );

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.IN_CLASS);
    expect(status.color).toBe("blue");
    // Updated: pillText is now "CLASS" not "IN CLASS"
    expect(status.pillText).toBe("CLASS");
    expect(status.metadata.hasFreshGPS).toBe(true);
    expect(status.metadata.source).toBe("mixed");
    expect(status.metadata.currentClassEnd).toBeInstanceOf(Date);
  });

  test("shows FREE_ON_CAMPUS when GPS says on campus but not in class", () => {
    // At 12:20, between slot 2 (11:20-12:50) - but slot 0 is busy, slot 2 is not
    // So at 12:20 with only slot 0 busy (08:00-09:30), no current class
    const now = createLocalDate(2025, 1, 6, 12, 20);
    const friend = buildFriend(
      { busySlots: [0], gpsStatus: "on", lastGpsMinutesAgo: 1 },
      now
    );

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.FREE_ON_CAMPUS);
    expect(status.color).toBe("green");
    expect(status.metadata.source).toBe("gps");
  });

  test("GPS off campus overrides schedule inference", () => {
    const now = createLocalDate(2025, 1, 6, 10, 0);
    const friend = buildFriend(
      { busySlots: [1], gpsStatus: "off", lastGpsMinutesAgo: 2 },
      now
    );

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.OFF_CAMPUS);
    expect(status.color).toBe("red");
    expect(status.metadata.source).toBe("gps");
  });

  test("stale GPS falls back to schedule-derived IN_CLASS", () => {
    // At 10:00 with busySlots [1] (09:40-11:10), should be in class
    const now = createLocalDate(2025, 1, 6, 10, 0);
    const friend = buildFriend(
      { busySlots: [1], gpsStatus: "on", lastGpsMinutesAgo: 45 },
      now
    );

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.IN_CLASS);
    expect(status.metadata.hasFreshGPS).toBe(false);
    expect(status.metadata.source).toBe("schedule");
  });

  test("between classes resolves to FREE with schedule source", () => {
    // Ramadan mapping makes slot 0 end at 09:15 and slot 1 start at 09:20.
    // At 09:18, previous class ended and next class starts soon.
    const now = createLocalDate(2025, 1, 6, 9, 18);
    const friend = buildFriend({ busySlots: [0, 1] }, now);

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.FREE_ON_CAMPUS);
    // Updated: pillText is now "FREE" not "FREE NOW"
    expect(status.pillText).toBe("FREE");
    expect(status.color).toBe("green");
    expect(status.metadata.inDayGap).toBe(true);
    expect(status.metadata.source).toBe("schedule");
  });

  test("before first class shows CLASS LATER pill", () => {
    // At 07:15 before slot 0 (08:00-09:30)
    const now = createLocalDate(2025, 1, 6, 7, 15);
    const friend = buildFriend({ busySlots: [0], nestedSchedule: true }, now);

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.NO_CLASSES);
    expect(status.pillText).toBe("CLASS LATER");
    expect(status.metadata.nextClassTime).toBeInstanceOf(Date);
  });

  test("shows FREE for 20 minutes after the last class ends", () => {
    // Slot 1 is mapped to 09:20-10:35 in Ramadan display logic.
    // At 10:50 user should still be considered free on campus.
    const now = createLocalDate(2025, 1, 6, 10, 50);
    const friend = buildFriend({ busySlots: [1] }, now);

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.FREE_ON_CAMPUS);
    expect(status.pillText).toBe("FREE");
    expect(status.metadata.source).toBe("schedule");
  });

  test("shows NO CLASSES after 20 minutes since the last class ended", () => {
    // Slot 1 is mapped to 09:20-10:35 in Ramadan display logic.
    // At 10:56 user should no longer be in the post-class free window.
    const now = createLocalDate(2025, 1, 6, 10, 56);
    const friend = buildFriend({ busySlots: [1] }, now);

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.NO_CLASSES);
    expect(status.pillText).toBe("NO CLASSES");
    expect(status.metadata.source).toBe("schedule");
  });

  test("no schedule data returns UNKNOWN_NO_DATA", () => {
    const now = createLocalDate(2025, 1, 6, 10, 0);
    const status = SchedulePresenceService.deriveStatus(
      { friendId: "no-data" },
      now
    );

    expect(status.state).toBe(PRESENCE_STATES.UNKNOWN_NO_DATA);
    expect(status.pillText).toBe("NO DATA");
    expect(status.metadata.hasSchedule).toBe(false);
  });
});

describe("SchedulePresenceService.deriveStatusForFriends", () => {
  test("returns map of friendId to status payloads", () => {
    const now = createLocalDate(2025, 1, 6, 10, 0);
    const friends = [
      buildFriend({ friendId: "a", busySlots: [1] }, now),
      { friendId: "b", isRestricted: true },
    ];

    const result = SchedulePresenceService.deriveStatusForFriends(friends, now);

    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(result.a.state).toBeDefined();
    expect(result.b.state).toBe(PRESENCE_STATES.UNKNOWN_PRIVATE);
  });
});
