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
    const now = new Date("2025-01-06T10:00:00.000Z");
    const status = SchedulePresenceService.deriveStatus(
      { friendId: "restricted", isRestricted: true },
      now
    );

    expect(status.state).toBe(PRESENCE_STATES.UNKNOWN_PRIVATE);
    expect(status.pillText).toBe("PRIVATE");
    expect(status.metadata.hasSchedule).toBe(false);
  });

  test("combines GPS + schedule to show IN_CLASS when GPS is on campus", () => {
    const now = new Date("2025-01-06T10:00:00.000Z");
    const friend = buildFriend(
      { busySlots: [1], gpsStatus: "on", lastGpsMinutesAgo: 4 },
      now
    );

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.IN_CLASS);
    expect(status.color).toBe("blue");
    expect(status.pillText).toBe("IN CLASS");
    expect(status.metadata.hasFreshGPS).toBe(true);
    expect(status.metadata.source).toBe("mixed");
    expect(status.metadata.currentClassEnd).toBeInstanceOf(Date);
  });

  test("shows FREE_ON_CAMPUS when GPS says on campus but not in class", () => {
    const now = new Date("2025-01-06T12:20:00.000Z");
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
    const now = new Date("2025-01-06T10:00:00.000Z");
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
    const now = new Date("2025-01-06T10:00:00.000Z");
    const friend = buildFriend(
      { busySlots: [1], gpsStatus: "on", lastGpsMinutesAgo: 45 },
      now
    );

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.IN_CLASS);
    expect(status.metadata.hasFreshGPS).toBe(false);
    expect(status.metadata.source).toBe("schedule");
  });

  test("between classes resolves to FREE_NOW with schedule source", () => {
    const now = new Date("2025-01-06T09:35:00.000Z");
    const friend = buildFriend({ busySlots: [0, 1] }, now);

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.FREE_ON_CAMPUS);
    expect(status.pillText).toBe("FREE NOW");
    expect(status.color).toBe("green");
    expect(status.metadata.inDayGap).toBe(true);
    expect(status.metadata.source).toBe("schedule");
  });

  test("before first class shows CLASS LATER pill", () => {
    const now = new Date("2025-01-06T07:15:00.000Z");
    const friend = buildFriend({ busySlots: [0], nestedSchedule: true }, now);

    const status = SchedulePresenceService.deriveStatus(friend, now);

    expect(status.state).toBe(PRESENCE_STATES.NO_CLASSES);
    expect(status.pillText).toBe("CLASS LATER");
    expect(status.metadata.nextClassTime).toBeInstanceOf(Date);
  });

  test("no schedule data returns UNKNOWN_NO_DATA", () => {
    const now = new Date("2025-01-06T10:00:00.000Z");
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
    const now = new Date("2025-01-06T10:00:00.000Z");
    const friends = [
      buildFriend({ friendId: "a", busySlots: [1] }, now),
      { friendId: "b", isRestricted: true },
    ];

    const result =
      SchedulePresenceService.deriveStatusForFriends(friends, now);

    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(result.a.state).toBeDefined();
    expect(result.b.state).toBe(PRESENCE_STATES.UNKNOWN_PRIVATE);
  });
});
