import { jest } from "@jest/globals";
import {
  parseTime,
  TimeInterval,
  UnifiedSchedule,
  createUnifiedSchedule,
} from "./timeUtils.js";

describe("Time Parsing Utilities", () => {
  describe("parseTime", () => {
    test("should parse standard time format correctly", () => {
      expect(parseTime("8:00")).toBe(480); // 8 * 60 = 480 minutes
      expect(parseTime("9:30")).toBe(570); // 9 * 60 + 30 = 570 minutes
      expect(parseTime("12:45")).toBe(765); // 12 * 60 + 45 = 765 minutes
      expect(parseTime("0:00")).toBe(0);
      expect(parseTime("23:59")).toBe(1439); // 23 * 60 + 59 = 1439 minutes
    });

    test("should handle edge cases gracefully", () => {
      expect(parseTime("")).toBe(NaN);
      expect(parseTime("invalid")).toBe(NaN);
      expect(parseTime("25:00")).toBe(NaN); // Invalid hour
      expect(parseTime("8:60")).toBe(NaN); // Invalid minute
    });

    test("should handle different time formats", () => {
      expect(parseTime("8")).toBe(NaN); // Missing colon
      expect(parseTime("8:")).toBe(NaN); // Missing minutes
      expect(parseTime(":30")).toBe(NaN); // Missing hours
    });
  });

  describe("TimeInterval", () => {
    test("should create intervals from time strings", () => {
      const interval = new TimeInterval("8:00", "9:00");
      expect(interval.startMinutes).toBe(480); // 8:00 in minutes
      expect(interval.endMinutes).toBe(540); // 9:00 in minutes
      expect(interval.startTime).toBe("08:00");
      expect(interval.endTime).toBe("09:00");
    });

    test("should handle different time formats", () => {
      const interval1 = new TimeInterval("8:30", "9:45");
      expect(interval1.startMinutes).toBe(510); // 8:30 in minutes
      expect(interval1.endMinutes).toBe(585); // 9:45 in minutes

      const interval2 = new TimeInterval("12:00", "13:30");
      expect(interval2.startMinutes).toBe(720); // 12:00 in minutes
      expect(interval2.endMinutes).toBe(810); // 13:30 in minutes
    });

    test("should handle numeric inputs (minutes from midnight)", () => {
      const interval = new TimeInterval(480, 540); // 8:00-9:00 in minutes
      expect(interval.startMinutes).toBe(480);
      expect(interval.endMinutes).toBe(540);
      expect(interval.startTime).toBe("08:00");
      expect(interval.endTime).toBe("09:00");
    });

    test("should throw error for invalid times", () => {
      expect(() => new TimeInterval("invalid", "9:00")).toThrow();
      expect(() => new TimeInterval("8:00", "invalid")).toThrow();
    });

    test("should throw error for invalid time ranges", () => {
      expect(() => new TimeInterval("9:00", "8:00")).toThrow(); // Start after end
      expect(() => new TimeInterval("8:00", "8:00")).toThrow(); // Start equals end
    });
  });

  describe("TimeInterval overlaps", () => {
    test("should detect overlapping intervals", () => {
      const interval1 = new TimeInterval(480, 540); // 8:00-9:00
      const interval2 = new TimeInterval(510, 570); // 8:30-9:30
      expect(interval1.overlaps(interval2)).toBe(true);
      expect(interval2.overlaps(interval1)).toBe(true);
    });

    test("should detect non-overlapping intervals", () => {
      const interval1 = new TimeInterval(480, 540); // 8:00-9:00
      const interval2 = new TimeInterval(540, 600); // 9:00-10:00
      expect(interval1.overlaps(interval2)).toBe(false);
      expect(interval2.overlaps(interval1)).toBe(false);
    });

    test("should handle touching intervals (boundary case)", () => {
      const interval1 = new TimeInterval(480, 540); // 8:00-9:00
      const interval2 = new TimeInterval(540, 600); // 9:00-10:00 (exactly touching)
      expect(interval1.overlaps(interval2)).toBe(false);
      expect(interval2.overlaps(interval1)).toBe(false);
    });

    test("should handle contained intervals", () => {
      const interval1 = new TimeInterval(480, 600); // 8:00-10:00
      const interval2 = new TimeInterval(510, 540); // 8:30-9:00 (contained within)
      expect(interval1.overlaps(interval2)).toBe(true);
      expect(interval2.overlaps(interval1)).toBe(true);
    });

    test("should handle identical intervals", () => {
      const interval1 = new TimeInterval(480, 540); // 8:00-9:00
      const interval2 = new TimeInterval(480, 540); // 8:00-9:00 (identical)
      expect(interval1.overlaps(interval2)).toBe(true);
    });
  });
});

describe("UnifiedSchedule Class", () => {
  describe("Constructor and basic functionality", () => {
    test("should create empty unified schedule", () => {
      const unified = new UnifiedSchedule();
      expect(unified instanceof UnifiedSchedule).toBe(true);
      expect(unified.unifiedTimeSlots).toEqual([]);
      expect(unified.users.size).toBe(0);
    });

    test("should add users with homogeneous time slots", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [true, false],
          [false, true],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );
      unified.addUser(
        "2",
        "Bob",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [false, true],
          [true, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );

      expect(unified.users.size).toBe(2);
      expect(unified.unifiedTimeSlots.length).toBe(2); // Two identical time slots should merge into 2 distinct slots
      expect(unified.unifiedTimeSlots[0].start).toBe("08:00");
      expect(unified.unifiedTimeSlots[0].end).toBe("09:00");
    });

    test("should add users with heterogeneous time slots", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [true, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );
      unified.addUser(
        "2",
        "Bob",
        [
          { start: "08:30", end: "09:30", label: "08:30-09:30" },
          { start: "09:30", end: "10:30", label: "09:30-10:30" },
        ],
        [
          [true, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );

      expect(unified.users.size).toBe(2);
      expect(unified.unifiedTimeSlots.length).toBeGreaterThan(2); // Should create merged slots
    });

    test("should handle user removal", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        [[true], [false], [false], [false], [false], [false], [false]]
      );

      expect(unified.users.size).toBe(1);

      unified.removeUser("1");
      expect(unified.users.size).toBe(0);
      expect(unified.unifiedTimeSlots).toEqual([]);
    });
  });

  describe("Slot status functionality", () => {
    test("should get correct slot status for busy users", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [true, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );
      unified.addUser(
        "2",
        "Bob",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [false, true],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );

      const status = unified.getSlotStatus(0, 0); // Monday, first slot
      expect(status.busy.length).toBe(1);
      expect(status.available.length).toBe(1);
      expect(status.total).toBe(2);
    });

    test("should handle invalid slot indices gracefully", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        [[true], [false], [false], [false], [false], [false], [false]]
      );

      const status = unified.getSlotStatus(0, 999); // Invalid slot index
      expect(status.available).toEqual([]);
      expect(status.busy).toEqual([]);
      expect(status.unavailable).toEqual([]);
      expect(status.total).toBe(1);
    });
  });

  describe("Common availability functionality", () => {
    test("should find common availability slots", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [false, true],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );
      unified.addUser(
        "2",
        "Bob",
        [
          { start: "08:00", end: "09:00", label: "08:00-09:00" },
          { start: "09:00", end: "10:00", label: "09:00-10:00" },
        ],
        [
          [false, true],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ]
      );

      const commonSlots = unified.findCommonAvailability(0); // Monday
      expect(Array.isArray(commonSlots)).toBe(true);
      // Both users are busy in slot 1, so no common availability
      expect(commonSlots.length).toBe(1); // Only slot 0 (8:00-9:00) should be available
    });
  });

  describe("Comparison matrix functionality", () => {
    test("should generate comparison matrix", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        [[true], [false], [false], [false], [false], [false], [false]]
      );

      const matrix = unified.generateComparisonMatrix();
      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBe(7); // 7 days
      expect(matrix[0].length).toBe(1); // 1 time slot
      expect(matrix[0][0].status).toBeDefined();
    });
  });

  describe("Export and summary functionality", () => {
    test("should export schedule data", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        [[true], [false], [false], [false], [false], [false], [false]]
      );

      const exported = unified.export();
      expect(exported.users).toBeDefined();
      expect(exported.unifiedTimeSlots).toBeDefined();
      expect(exported.metadata).toBeDefined();
      expect(exported.metadata.totalUsers).toBe(1);
    });

    test("should generate summary statistics", () => {
      const unified = new UnifiedSchedule();

      unified.addUser(
        "1",
        "Alice",
        [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        [[true], [false], [false], [false], [false], [false], [false]]
      );

      const summary = unified.getSummary();
      expect(summary.totalUsers).toBe(1);
      expect(summary.totalTimeSlots).toBe(1);
      expect(summary.totalPossibleSlots).toBe(7); // 1 slot × 7 days
      expect(typeof summary.averageBusyPerSlot).toBe("number");
    });
  });
});

describe("createUnifiedSchedule Function", () => {
  test("should create UnifiedSchedule instance correctly", () => {
    const users = [
      {
        id: "1",
        name: "Alice",
        timeSlots: [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        schedule: [
          [true],
          [false],
          [false],
          [false],
          [false],
          [false],
          [false],
        ],
      },
    ];

    const unified = createUnifiedSchedule(users);
    expect(unified instanceof UnifiedSchedule).toBe(true);
    expect(unified.users.size).toBe(1);
    expect(unified.unifiedTimeSlots.length).toBe(1);
  });

  test("should handle empty input", () => {
    const unified = createUnifiedSchedule([]);
    expect(unified instanceof UnifiedSchedule).toBe(true);
    expect(unified.users.size).toBe(0);
    expect(unified.unifiedTimeSlots).toEqual([]);
  });

  test("should handle null/undefined input gracefully", () => {
    expect(() => createUnifiedSchedule(null)).toThrow();
    expect(() => createUnifiedSchedule(undefined)).toThrow();

    // But an empty array should work
    const unified = createUnifiedSchedule([]);
    expect(unified instanceof UnifiedSchedule).toBe(true);
  });

  test("should skip users with missing required properties", () => {
    const users = [
      {
        id: "1",
        name: "Alice",
        timeSlots: [{ start: "08:00", end: "09:00", label: "08:00-09:00" }],
        schedule: [
          [true],
          [false],
          [false],
          [false],
          [false],
          [false],
          [false],
        ],
      },
      {
        // Missing required properties
        id: "2",
        name: "Bob",
        // No timeSlots or schedule
      },
      {
        id: "3",
        name: "Charlie",
        timeSlots: [{ start: "09:00", end: "10:00", label: "09:00-10:00" }],
        schedule: [
          [false],
          [true],
          [false],
          [false],
          [false],
          [false],
          [false],
        ],
      },
    ];

    const unified = createUnifiedSchedule(users);
    expect(unified instanceof UnifiedSchedule).toBe(true);
    expect(unified.users.size).toBe(2); // Only Alice and Charlie should be added
  });
});
