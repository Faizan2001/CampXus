import {
  interestIcon,
  isValidCustomInterest,
  normalizeInterest,
} from "../../../services/profile/InterestsService.js";

describe("InterestsService", () => {
  test("normalizeInterest() trims and lowercases", () => {
    expect(normalizeInterest("  Foo-Bar ")).toBe("foo-bar");
  });

  test("isValidCustomInterest() enforces length and charset", () => {
    expect(isValidCustomInterest("ai")).toBe(false);
    expect(isValidCustomInterest("ai club")).toBe(true);
    expect(isValidCustomInterest("bad!")).toBe(false);
  });

  test("interestIcon() falls back when unknown", () => {
    expect(interestIcon("coding")).toContain("fa-");
    expect(interestIcon("unknown-interest")).toBe("fas fa-star");
  });
});

