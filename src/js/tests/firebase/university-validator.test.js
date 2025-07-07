// Simple tests to make sure our email validator works correctly
import {
  validateUniversityEmail,
  getFriendlyEmailError,
  getSupportedUniversities,
} from "../../firebase/auth/university-validator.js";

describe("University Email Validator", () => {
  test("accepts valid IUB email", () => {
    const result = validateUniversityEmail("student@iub.edu.bd");
    expect(result.isValid).toBe(true);
    expect(result.universityId).toBe("iub");
    expect(result.name).toBe("Independent University, Bangladesh");
  });

  test("rejects non-university email", () => {
    const result = validateUniversityEmail("user@gmail.com");
    expect(result).toBe(null);
  });

  test("handles invalid email formats", () => {
    expect(validateUniversityEmail("not-an-email")).toBe(null);
    expect(validateUniversityEmail("student@")).toBe(null);
  });

  test("provides helpful error messages", () => {
    expect(getFriendlyEmailError("")).toContain("Please enter");
    expect(getFriendlyEmailError("notemail")).toContain("@ symbol");
    expect(getFriendlyEmailError("student@gmail.com")).toContain(
      "don't support"
    );
  });

  test("lists supported universities", () => {
    const universities = getSupportedUniversities();
    expect(universities.length).toBeGreaterThan(0);
    expect(universities[0]).toHaveProperty("name");
  });
});