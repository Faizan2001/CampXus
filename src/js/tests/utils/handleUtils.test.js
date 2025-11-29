/**
 * =============================================================================
 *                       HANDLE UTILITIES TEST SUITE
 *                    Testing @username Validation & Formatting
 * =============================================================================
 * 
 * 🎯 What are "Handles"?
 * Handles are unique usernames like @john_doe that users can use to find each other.
 * Think of them like Twitter/Instagram handles!
 * 
 * 🧪 Why test these?
 * - Users see error messages when handles are invalid - we need to show the RIGHT ones
 * - Security: Reserved handles (admin, system) shouldn't be claimable
 * - UX: Cooldowns prevent handle-squatting
 * - @mentions in chat depend on valid handle extraction
 * 
 * =============================================================================
 */

import { jest } from "@jest/globals";
import {
  normalizeHandle,
  validateHandle,
  canChangeHandle,
  formatCooldown,
  isReservedHandle,
  extractMentionCandidates,
  HANDLE_MIN_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_CHANGE_COOLDOWN_MS,
  reservedHandles,
} from "../../utils/handle/handleUtils.js";

// =============================================================================
// 🧹 NORMALIZATION TESTS
// These test that handles are cleaned up consistently
// =============================================================================
describe("normalizeHandle", () => {
  test("should convert handle to lowercase", () => {
    expect(normalizeHandle("JohnDoe")).toBe("johndoe");
    expect(normalizeHandle("ALLCAPS")).toBe("allcaps");
    expect(normalizeHandle("MiXeD_CaSe")).toBe("mixed_case");
  });

  test("should trim whitespace from both ends", () => {
    expect(normalizeHandle("  john_doe  ")).toBe("john_doe");
    expect(normalizeHandle("\tjohn_doe\n")).toBe("john_doe");
    expect(normalizeHandle("   ")).toBe("");
  });

  test("should handle empty and null inputs gracefully", () => {
    expect(normalizeHandle("")).toBe("");
    expect(normalizeHandle(null)).toBe("");
    expect(normalizeHandle(undefined)).toBe("");
  });

  test("should preserve underscores (they're allowed!)", () => {
    expect(normalizeHandle("john_doe_123")).toBe("john_doe_123");
    expect(normalizeHandle("a_b_c")).toBe("a_b_c");
  });
});

// =============================================================================
// ✅ VALIDATION TESTS
// These test the rules for what makes a valid handle
// =============================================================================
describe("validateHandle", () => {
  describe("valid handles", () => {
    test("should accept basic alphanumeric handles", () => {
      const result = validateHandle("johndoe");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("johndoe");
    });

    test("should accept handles with underscores", () => {
      expect(validateHandle("john_doe").valid).toBe(true);
      expect(validateHandle("john_doe_123").valid).toBe(true);
    });

    test("should accept minimum length handle (3 chars)", () => {
      expect(validateHandle("abc").valid).toBe(true);
    });

    test("should accept maximum length handle (20 chars)", () => {
      expect(validateHandle("abcdefghij1234567890").valid).toBe(true);
    });

    test("should accept handles with numbers after first letter", () => {
      expect(validateHandle("a123456789").valid).toBe(true);
      expect(validateHandle("john2024").valid).toBe(true);
    });

    test("should allow consecutive underscores (double underscore)", () => {
      expect(validateHandle("john__doe").valid).toBe(true);
    });
  });

  describe("invalid handles - length issues", () => {
    test("should reject empty handles", () => {
      const result = validateHandle("");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("empty");
    });

    test("should reject handles that are too short", () => {
      const result = validateHandle("ab");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("too_short");
    });

    test("should reject handles that are too long", () => {
      const result = validateHandle("abcdefghij12345678901"); // 21 chars
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("too_long");
    });
  });

  describe("invalid handles - format issues", () => {
    test("should reject handles starting with a number", () => {
      const result = validateHandle("123john");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_format");
    });

    test("should reject handles starting with underscore", () => {
      const result = validateHandle("_johndoe");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_format");
    });

    test("should reject handles ending with underscore", () => {
      const result = validateHandle("johndoe_");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_format");
    });

    test("should reject handles with special characters", () => {
      expect(validateHandle("john.doe").valid).toBe(false);
      expect(validateHandle("john-doe").valid).toBe(false);
      expect(validateHandle("john@doe").valid).toBe(false);
      expect(validateHandle("john doe").valid).toBe(false);
      expect(validateHandle("john!doe").valid).toBe(false);
    });

    test("should reject handles with only underscores", () => {
      expect(validateHandle("___").valid).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("should normalize before validating (uppercase → lowercase)", () => {
      const result = validateHandle("JohnDoe");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("johndoe");
    });

    test("should trim before validating", () => {
      const result = validateHandle("  johndoe  ");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("johndoe");
    });
  });
});

// =============================================================================
// ⏰ COOLDOWN TESTS
// These test the handle change rate limiting (prevents abuse)
// =============================================================================
describe("canChangeHandle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should allow change if never changed before (null)", () => {
    const result = canChangeHandle(null);
    expect(result.allowed).toBe(true);
    expect(result.remainingMs).toBe(0);
  });

  test("should allow change if never changed before (undefined)", () => {
    const result = canChangeHandle(undefined);
    expect(result.allowed).toBe(true);
    expect(result.remainingMs).toBe(0);
  });

  test("should allow change if cooldown has passed", () => {
    // Set last change to 2 days ago (cooldown is 1 day)
    const twoDaysAgo = new Date("2025-01-13T12:00:00Z");
    const result = canChangeHandle(twoDaysAgo);
    expect(result.allowed).toBe(true);
    expect(result.remainingMs).toBe(0);
  });

  test("should deny change if still in cooldown", () => {
    // Set last change to 12 hours ago (cooldown is 1 day)
    const twelveHoursAgo = new Date("2025-01-15T00:00:00Z");
    const result = canChangeHandle(twelveHoursAgo);
    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBeGreaterThan(0);
    expect(result.remainingMs).toBeLessThanOrEqual(HANDLE_CHANGE_COOLDOWN_MS);
  });

  test("should handle Firestore timestamp objects (with toDate method)", () => {
    const firestoreTimestamp = {
      toDate: () => new Date("2025-01-10T12:00:00Z"), // 5 days ago
    };
    const result = canChangeHandle(firestoreTimestamp);
    expect(result.allowed).toBe(true);
  });

  test("should handle numeric timestamps (milliseconds)", () => {
    const fiveDaysAgoMs = new Date("2025-01-10T12:00:00Z").getTime();
    const result = canChangeHandle(fiveDaysAgoMs);
    expect(result.allowed).toBe(true);
  });

  test("should handle Date objects directly", () => {
    const tenDaysAgo = new Date("2025-01-05T12:00:00Z");
    const result = canChangeHandle(tenDaysAgo);
    expect(result.allowed).toBe(true);
  });

  test("should allow custom cooldown periods", () => {
    const oneHourAgo = new Date("2025-01-15T11:00:00Z");
    const twoHourCooldown = 2 * 60 * 60 * 1000;
    
    const result = canChangeHandle(oneHourAgo, twoHourCooldown);
    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBeGreaterThan(0);
  });
});

// =============================================================================
// 🕐 COOLDOWN FORMATTING TESTS
// These test human-readable cooldown displays
// =============================================================================
describe("formatCooldown", () => {
  test("should return 'now' for zero or negative remaining time", () => {
    expect(formatCooldown(0)).toBe("now");
    expect(formatCooldown(-1000)).toBe("now");
  });

  test("should format days and hours correctly", () => {
    const twoDaysOneHour = 2 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000;
    expect(formatCooldown(twoDaysOneHour)).toBe("2d 1h");
  });

  test("should format hours and minutes when less than a day", () => {
    const threeHours30Min = 3 * 60 * 60 * 1000 + 30 * 60 * 1000;
    expect(formatCooldown(threeHours30Min)).toBe("3h 30m");
  });

  test("should handle exact day boundaries", () => {
    const exactlyOneDay = 24 * 60 * 60 * 1000;
    expect(formatCooldown(exactlyOneDay)).toBe("1d 0h");
  });

  test("should handle minutes only (less than an hour)", () => {
    const fortyFiveMinutes = 45 * 60 * 1000;
    expect(formatCooldown(fortyFiveMinutes)).toBe("0h 45m");
  });
});

// =============================================================================
// 🚫 RESERVED HANDLES TESTS
// These test that system handles can't be claimed
// =============================================================================
describe("isReservedHandle", () => {
  test("should identify reserved handles", () => {
    expect(isReservedHandle("admin")).toBe(true);
    expect(isReservedHandle("system")).toBe(true);
    expect(isReservedHandle("support")).toBe(true);
    expect(isReservedHandle("root")).toBe(true);
    expect(isReservedHandle("null")).toBe(true);
    expect(isReservedHandle("undefined")).toBe(true);
    expect(isReservedHandle("iub")).toBe(true);
  });

  test("should allow non-reserved handles", () => {
    expect(isReservedHandle("johndoe")).toBe(false);
    expect(isReservedHandle("student123")).toBe(false);
    expect(isReservedHandle("faizan2001")).toBe(false);
  });

  test("should be case-sensitive (normalized handles are lowercase)", () => {
    // Since handles are normalized to lowercase before checking,
    // the function receives lowercase strings
    expect(isReservedHandle("Admin")).toBe(false); // Not in Set
    expect(isReservedHandle("ADMIN")).toBe(false); // Not in Set
    expect(isReservedHandle("admin")).toBe(true);  // In Set
  });

  test("should allow handles that CONTAIN reserved words", () => {
    // "admin_user" contains "admin" but is NOT exactly "admin"
    expect(isReservedHandle("admin_user")).toBe(false);
    expect(isReservedHandle("the_admin")).toBe(false);
    expect(isReservedHandle("iub_student")).toBe(false);
    expect(isReservedHandle("rifat_iub")).toBe(false);
  });

  test("reservedHandles Set should contain expected entries", () => {
    expect(reservedHandles.size).toBeGreaterThanOrEqual(7);
    expect(reservedHandles.has("admin")).toBe(true);
  });
});

// =============================================================================
// 📝 @MENTION EXTRACTION TESTS
// These test finding @usernames in text (for future chat features)
// =============================================================================
describe("extractMentionCandidates", () => {
  test("should extract single mention", () => {
    const result = extractMentionCandidates("Hello @johndoe!");
    expect(result).toEqual(["johndoe"]);
  });

  test("should extract multiple mentions", () => {
    const result = extractMentionCandidates("Hey @alice and @bob, check this out!");
    expect(result).toEqual(expect.arrayContaining(["alice", "bob"]));
    expect(result.length).toBe(2);
  });

  test("should deduplicate mentions", () => {
    const result = extractMentionCandidates("@john said hi, then @john said bye");
    expect(result).toEqual(["john"]);
  });

  test("should extract mentions with underscores", () => {
    const result = extractMentionCandidates("Thanks @john_doe_123!");
    expect(result).toEqual(["john_doe_123"]);
  });

  test("should extract mentions with numbers", () => {
    const result = extractMentionCandidates("Shoutout to @student2024!");
    expect(result).toEqual(["student2024"]);
  });

  test("should return empty array for text without mentions", () => {
    expect(extractMentionCandidates("No mentions here")).toEqual([]);
    expect(extractMentionCandidates("Just an @ symbol")).toEqual([]);
    expect(extractMentionCandidates("email@example.com")).toEqual(["example"]); // @ triggers extraction
  });

  test("should handle empty and undefined inputs", () => {
    // Empty string should return empty array
    expect(extractMentionCandidates("")).toEqual([]);
    // Undefined uses default parameter (empty string)
    expect(extractMentionCandidates(undefined)).toEqual([]);
    // Note: null is NOT handled - the function doesn't guard against it
    // This is intentional - callers should pass valid strings
  });

  test("should extract mentions at start and end of text", () => {
    expect(extractMentionCandidates("@start of message")).toEqual(["start"]);
    expect(extractMentionCandidates("end of message @end")).toEqual(["end"]);
  });
});

// =============================================================================
// 📊 CONSTANTS TESTS
// These verify the constants are set correctly
// =============================================================================
describe("Handle Constants", () => {
  test("minimum length should be 3", () => {
    expect(HANDLE_MIN_LENGTH).toBe(3);
  });

  test("maximum length should be 20", () => {
    expect(HANDLE_MAX_LENGTH).toBe(20);
  });

  test("cooldown should be 1 day in milliseconds", () => {
    const oneDayMs = 1 * 24 * 60 * 60 * 1000;
    expect(HANDLE_CHANGE_COOLDOWN_MS).toBe(oneDayMs);
  });
});
