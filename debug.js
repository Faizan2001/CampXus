// Simple debug script
import { UnifiedSchedule } from "./js/timeUtils.js";

console.log("Testing UnifiedSchedule...");
const unified = new UnifiedSchedule();

// Add Alice (busy in slot 0, available in slot 1)
console.log("Adding Alice...");
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

// Add Bob (available in slot 0, busy in slot 1)
console.log("Adding Bob...");
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

console.log("Unified slots:", unified.unifiedTimeSlots.length);

console.log("Testing slot status for Monday slot 0...");
const status0 = unified.getSlotStatus(0, 0);
console.log("Slot 0 status:", status0);

console.log("Testing slot status for Monday slot 1...");
const status1 = unified.getSlotStatus(0, 1);
console.log("Slot 1 status:", status1);

console.log("Testing common availability for Monday...");
const commonSlots = unified.findCommonAvailability(0);
console.log("Common slots:", commonSlots);
