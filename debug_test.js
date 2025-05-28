import { UnifiedSchedule, createUnifiedSchedule } from "./js/timeUtils.js";

console.log("=== Testing heterogeneous schedule issue ===");

const unified = new UnifiedSchedule();

console.log("Adding Alice...");
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

console.log("Adding Bob...");
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

console.log("Users added:", unified.users.size);
console.log("Unified time slots:", unified.unifiedTimeSlots.length);
console.log(
  "Unified time slots:",
  JSON.stringify(unified.unifiedTimeSlots, null, 2)
);
console.log("All time intervals:", unified.allTimeIntervals.length);
console.log(
  "All time intervals:",
  unified.allTimeIntervals.map((i) => `${i.startTime}-${i.endTime}`)
);

console.log("\n=== Testing createUnifiedSchedule null handling ===");
try {
  const result = createUnifiedSchedule(null);
  console.log("ERROR: Should have thrown but returned:", result);
} catch (error) {
  console.log("SUCCESS: Threw error for null:", error.message);
}

try {
  const result = createUnifiedSchedule(undefined);
  console.log("ERROR: Should have thrown but returned:", result);
} catch (error) {
  console.log("SUCCESS: Threw error for undefined:", error.message);
}
