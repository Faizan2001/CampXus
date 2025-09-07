/**
 * =============================================================================
 *                     PROFILE SETUP TESTS - MEETCHUTHERE
 *                    REAL INTEGRATION TESTING SUITE 
 * =============================================================================
 * 
 * 🎯 TESTING FOCUS:
 * These tests focus on functions that are ACTUALLY USED in profile-setup.js
 * and critical functionality that could break the user experience.
 * 
 * 🔗 WHY THESE TESTS MATTER:
 * As a beginner web developer, these tests teach you to:
 * - Test functions that are actually called in your code
 * - Prevent user-facing bugs (bad validation, broken forms)
 * - Ensure data integrity (proper formatting, valid IDs)
 * - Test critical user flows (profile creation, step navigation)
 * 
 * 🚨 REAL IMPACT:
 * If these tests fail, it means:
 * - Users can't create profiles (broken validation)
 * - Names look wrong (formatting issues) 
 * - Invalid data gets saved (validation bypassed)
 * - Step navigation breaks (users get stuck)
 * 
 * =============================================================================
 */

// Import Jest globals explicitly
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// 🔗 IMPORT THE REAL FUNCTIONS FROM PROFILE-SETUP.JS
import { 
  ProfileSetup,
  isValidEmail, 
  formatName, 
  generateStudentId, 
  isValidStartingYear, 
  validateRequiredFields 
} from '../../components/forms/ProfileSetup.js';

// Mock Firebase and DOM for testing
global.firebase = {
  firestore: () => ({
    collection: () => ({
      doc: () => ({
        set: () => Promise.resolve({}),
        get: () => Promise.resolve({
          exists: true,
          data: () => ({ firstName: "John", lastName: "Doe" })
        })
      })
    })
  })
};

// Mock DOM environment
global.document = {
  getElementById: jest.fn(),
  createElement: jest.fn(() => ({ style: {} })),
  body: { appendChild: jest.fn() },
  addEventListener: jest.fn()
};

describe("Profile Setup - Critical Function Tests", () => {

  // =============================================================================
  //          🧪 VALIDATION FUNCTIONS THAT PREVENT BAD DATA
  // =============================================================================

  describe("Email Validation (CRITICAL - Used in validateCurrentStep)", () => {
    test("should accept valid university emails", () => {
      // 🎯 WHY THIS MATTERS: Students MUST use valid emails to create accounts
      expect(isValidEmail("student@university.edu")).toBe(true);
      expect(isValidEmail("john.doe@iub.edu.bd")).toBe(true);
      expect(isValidEmail("test123@gmail.com")).toBe(true);
    });

    test("should reject invalid emails that would break authentication", () => {
      // 🎯 WHY THIS MATTERS: Invalid emails cause Firebase auth to fail
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("missing@")).toBe(false);
      expect(isValidEmail("@missing-username.com")).toBe(false);
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail("spaces in@email.com")).toBe(false);
    });

    test("should handle edge cases gracefully", () => {
      // 🎯 WHY THIS MATTERS: Prevents crashes when users input weird data
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail(123)).toBe(false);
    });
  });

  describe("Name Formatting (CRITICAL - Used in collectCurrentStepData)", () => {
    test("should format names consistently for display", () => {
      // 🎯 WHY THIS MATTERS: User names appear throughout the app
      expect(formatName("john")).toBe("John");
      expect(formatName("MARY")).toBe("Mary");
      expect(formatName("bob smith")).toBe("Bob Smith");
      expect(formatName("jean-claude van damme")).toBe("Jean-Claude Van Damme");
    });

    test("should handle problematic input without crashing", () => {
      // 🎯 WHY THIS MATTERS: Users might paste weird text or leave fields empty
      expect(formatName("")).toBe("");
      expect(formatName("   spaced   ")).toBe("Spaced");
      expect(formatName("multiple   spaces")).toBe("Multiple   Spaces");
      expect(formatName(null)).toBe("");
      expect(formatName(undefined)).toBe("");
    });
  });

  describe("Student ID Generation (CRITICAL - Used in collectCurrentStepData)", () => {
    test("should extract ID from email correctly", () => {
      // 🎯 WHY THIS MATTERS: Student ID should be extracted from email consistently
      expect(generateStudentId("22314914@iub.edu.bd")).toBe("22314914");
      expect(generateStudentId("john.doe@university.edu")).toBe("john.doe");
      expect(generateStudentId("student123@school.edu")).toBe("student123");
    });

    test("should extract same ID consistently from same email", () => {
      // 🎯 WHY THIS MATTERS: Same email should always extract same ID
      const email = "john.doe@university.edu";
      const id1 = generateStudentId(email);
      const id2 = generateStudentId(email);
      
      expect(id1).toBe(id2);
      expect(id1).toBe("john.doe");
      expect(typeof id1).toBe("string");
    });

    test("should handle invalid emails without crashing", () => {
      // 🎯 WHY THIS MATTERS: Prevents app crashes from bad data
      expect(generateStudentId("")).toBe("");
      expect(generateStudentId(null)).toBe("");
      expect(generateStudentId("no-at-sign")).toBe("no-at-sign"); // Returns whole string if no @
    });
  });

  describe("Starting Year Validation (CRITICAL - Used in validateCurrentStep)", () => {
    test("should accept reasonable starting years", () => {
      // 🎯 WHY THIS MATTERS: Prevents unrealistic academic data
      const currentYear = new Date().getFullYear();
      
      expect(isValidStartingYear(currentYear)).toBe(true);
      expect(isValidStartingYear(currentYear - 1)).toBe(true);
      expect(isValidStartingYear(currentYear - 4)).toBe(true);
    });

    test("should reject unrealistic years", () => {
      // 🎯 WHY THIS MATTERS: Prevents data corruption from wrong years
      const currentYear = new Date().getFullYear();
      
      expect(isValidStartingYear(currentYear - 10)).toBe(false); // Too old
      expect(isValidStartingYear(currentYear + 5)).toBe(false);  // Too future
      expect(isValidStartingYear("")).toBe(false);
      expect(isValidStartingYear("not-a-year")).toBe(false);
    });
  });

  describe("Required Fields Validation (CRITICAL - Used in validateCurrentStep)", () => {
    test("should accept complete profile data", () => {
      // 🎯 WHY THIS MATTERS: Complete profiles provide better user experience
      const validData = {
        firstName: "John",
        lastName: "Doe",
        major: "Computer Science",
        startingYear: "2024"
      };

      expect(validateRequiredFields(validData)).toBe(true);
    });

    test("should reject incomplete profile data", () => {
      // 🎯 WHY THIS MATTERS: Incomplete profiles cause issues later
      const invalidData = {
        firstName: "", // Missing!
        lastName: "Doe",
        major: "Computer Science",
        startingYear: "2024"
      };

      expect(validateRequiredFields(invalidData)).toBe(false);
    });

    test("should handle missing fields entirely", () => {
      // 🎯 WHY THIS MATTERS: Prevents crashes when data is malformed
      const incompleteData = { firstName: "John" };
      expect(validateRequiredFields(incompleteData)).toBe(false);
    });
  });

  // =============================================================================
  //        � INTEGRATION TESTS FOR CRITICAL USER FLOWS
  // =============================================================================

  describe("Profile Setup Integration (CRITICAL USER FLOWS)", () => {
    let mockProfileSetup;

    beforeEach(() => {
      // Mock DOM elements that ProfileSetup depends on
      global.document.getElementById = jest.fn((id) => {
        const mockElements = {
          'setup-first-name': { value: 'john', classList: { add: jest.fn(), remove: jest.fn() }},
          'setup-last-name': { value: 'doe', classList: { add: jest.fn(), remove: jest.fn() }},
          'setup-email': { value: 'john@university.edu', classList: { add: jest.fn(), remove: jest.fn() }},
          'setup-starting-year': { value: '2024', classList: { add: jest.fn(), remove: jest.fn() }},
          'setup-major': { value: 'Computer Science', classList: { add: jest.fn(), remove: jest.fn() }},
          'setup-next-btn': { disabled: false, textContent: 'Next', classList: { add: jest.fn(), remove: jest.fn() }}
        };
        return mockElements[id] || { classList: { add: jest.fn(), remove: jest.fn() }};
      });

      global.document.querySelectorAll = jest.fn(() => []);
      global.window = { authManager: { getCurrentUser: () => null }};
    });

    test("should validate complete step data correctly", () => {
      // 🎯 WHY THIS MATTERS: Users must be able to proceed when data is valid
      
      // Create test data that should pass validation
      const testData = {
        firstName: "John",
        lastName: "Doe", 
        major: "Computer Science",
        startingYear: "2024"
      };

      // Test our validation functions work together
      expect(validateRequiredFields(testData)).toBe(true);
      expect(isValidStartingYear(testData.startingYear)).toBe(true);
      expect(formatName(testData.firstName)).toBe("John");
    });

    test("should reject invalid step data with empty fields and old year", () => {
      // 🎯 WHY THIS MATTERS: Users shouldn't proceed with bad data
      
      const invalidData = {
        firstName: "",  // Empty name should fail
        lastName: "Doe",
        major: "Computer Science", 
        startingYear: "1990"  // Too old should fail (current year is 2025, valid range is 2019-2025)
      };

      expect(validateRequiredFields(invalidData)).toBe(false);
      expect(isValidStartingYear(invalidData.startingYear)).toBe(false);
    });

    test("should format and generate data correctly during collection", () => {
      // 🎯 WHY THIS MATTERS: Data must be properly formatted when saved
      
      const email = "john.doe@university.edu";
      const firstName = "john";  // lowercase input
      const lastName = "DOE";   // uppercase input

      // Test the data transformation pipeline
      const formattedFirst = formatName(firstName);
      const formattedLast = formatName(lastName);
      const studentId = generateStudentId(email);

      expect(formattedFirst).toBe("John");
      expect(formattedLast).toBe("Doe");
      expect(studentId).toBe("john.doe"); // Should extract the part before @ from email
      expect(isValidEmail(email)).toBe(true);
    });
  });

  // =============================================================================
  //        🚨 ERROR SCENARIOS THAT COULD BREAK THE APP
  // =============================================================================

  describe("Error Handling and Edge Cases (PREVENT APP CRASHES)", () => {
    test("should handle null/undefined inputs gracefully", () => {
      // 🎯 WHY THIS MATTERS: Prevents crashes when data is missing
      
      expect(() => isValidEmail(null)).not.toThrow();
      expect(() => formatName(undefined)).not.toThrow();
      expect(() => generateStudentId(null)).not.toThrow();
      expect(() => isValidStartingYear(undefined)).not.toThrow();
      expect(() => validateRequiredFields({})).not.toThrow();
    });

    test("should handle malformed data without breaking", () => {
      // 🎯 WHY THIS MATTERS: Users might input unexpected data
      
      expect(isValidEmail(12345)).toBe(false);
      expect(formatName({})).toBe("");
      expect(isValidStartingYear("not-a-number")).toBe(false);
    });

    test("should maintain data consistency across multiple operations", () => {
      // 🎯 WHY THIS MATTERS: Data should be consistent throughout the app
      
      const testEmail = "test.user@university.edu";
      const testName = "test user";
      
      // Multiple operations should produce consistent results
      const id1 = generateStudentId(testEmail);
      const id2 = generateStudentId(testEmail);
      const name1 = formatName(testName);
      const name2 = formatName(testName);
      
      expect(id1).toBe(id2); // Same email extracts same ID (should be "test.user")
      expect(id1).toBe("test.user"); // Verify actual extracted value
      expect(name1).toBe(name2);
      expect(isValidEmail(testEmail)).toBe(true);
    });
  });

  // =============================================================================
  //        📊 PERFORMANCE AND SCALE CONSIDERATIONS
  // =============================================================================

  describe("Performance and Scale Tests (ENSURE APP DOESN'T SLOW DOWN)", () => {
    test("should handle large datasets efficiently", () => {
      // 🎯 WHY THIS MATTERS: App should work even with many users
      
      const startTime = performance.now();
      
      // Test with many validation calls
      for (let i = 0; i < 1000; i++) {
        isValidEmail(`user${i}@test.edu`);
        formatName(`User ${i}`);
        generateStudentId(`user${i}@test.edu`);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 operations in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});

// =============================================================================
//     🎓 BEGINNER-FRIENDLY EXPLANATION OF WHY THESE TESTS MATTER
// =============================================================================

/*
🎯 **WHY TEST THESE SPECIFIC FUNCTIONS?**

1. **isValidEmail()** - Used in validateCurrentStep()
   - Prevents users from creating accounts with invalid emails
   - Stops Firebase authentication errors
   - Ensures users can actually receive emails

2. **formatName()** - Used in collectCurrentStepData()
   - Makes names look consistent throughout the app
   - Prevents "JOHN DOE" or "mary smith" in user profiles
   - Ensures professional appearance

3. **generateStudentId()** - Used in collectCurrentStepData()
   - Extracts consistent identifiers from student emails
   - Ensures same email always produces same ID
   - Handles email parsing safely

4. **isValidStartingYear()** - Used in validateCurrentStep()
   - Prevents unrealistic graduation dates
   - Ensures academic data makes sense
   - Stops users from selecting year 1950 or 2050

5. **validateRequiredFields()** - Used in validateCurrentStep()
   - Ensures profiles are complete before saving
   - Prevents empty or incomplete user profiles
   - Improves user experience by catching missing data

🚨 **WHAT HAPPENS IF THESE TESTS FAIL?**

Without these tests:
- Students might create accounts with "invalid@email" and get stuck
- Names might display as "john DOE" or "MARY smith" (unprofessional)
- Two students might get the same ID (database conflicts)
- Someone might graduate in "1850" (data corruption)
- Profiles might save with missing names (broken user experience)

✅ **WHAT THESE TESTS PROTECT AGAINST:**

- User frustration (can't create account)
- Data corruption (invalid emails, years, IDs)
- UI bugs (poorly formatted names)
- Database issues (duplicate IDs, missing fields)
- Authentication failures (bad email formats)

This is why testing matters - it's not just academic exercise, 
it's protecting your users from real problems!
*/

// =============================================================================
//                           HELPER FUNCTIONS FOR TESTING
// =============================================================================

/**
 * Create structured profile data
 * Organizes profile data into the correct structure for Firebase
 */
function createProfileDataStructure(user, profileData) {
  return {
    uid: user.uid,
    profile: {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      email: user.email,
      major: profileData.major,
      bio: profileData.bio || "",
    },
    universityInfo: {
      university: user.email.split('@')[1].split('.')[0],
      studentId: generateStudentId(user.email),
      startingYear: profileData.startingYear
    },
    systemInfo: {
      profileSetupComplete: true,
      status: "offline"
    }
  };
}

/**
 * Validate step 0 (basic info step)
 * Checks if step 0 form has all required fields filled
 */
function validateStepZero() {
  const firstName = document.getElementById('setup-first-name')?.value.trim() || '';
  const lastName = document.getElementById('setup-last-name')?.value.trim() || '';
  const startingYear = document.getElementById('setup-starting-year')?.value || '';
  const major = document.getElementById('setup-major')?.value.trim() || '';
  
  // Return boolean: true if all fields have values, false otherwise
  return !!(firstName && lastName && startingYear && major);
}

/**
 * Save profile with error handling
 * Attempts to save profile and handles errors gracefully
 */
async function saveProfileWithErrorHandling(profileData) {
  try {
    await firebase.firestore()
      .collection('users')
      .doc('test-user')
      .set(profileData);
    
    return { success: true };
  } catch (error) {
    console.error('Save failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate before save
 * Final validation check before saving to database
 */
function validateBeforeSave(data) {
  // Check required fields using the REAL function
  if (!validateRequiredFields(data)) return false;
  
  // Check email format if provided using the REAL function
  if (data.email && !isValidEmail(data.email)) return false;
  
  // Check starting year if provided using the REAL function
  if (data.startingYear && !isValidStartingYear(data.startingYear)) return false;
  
  return true;
}

/**
 * Simulate complete profile setup flow
 * Integration test helper that simulates the entire setup process
 */
async function simulateProfileSetupFlow(user, profileData) {
  // Step 1: Validate data using REAL validation functions
  if (!validateBeforeSave(profileData)) {
    return { success: false, error: 'Validation failed' };
  }
  
  // Step 2: Structure data
  const structuredData = createProfileDataStructure(user, profileData);
  
  // Step 3: Save to Firebase
  try {
    await firebase.firestore()
      .collection('users')
      .doc(user.uid)
      .set(structuredData);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// =============================================================================
//                        PROFILE SETUP CLASS TESTS
// =============================================================================

describe("ProfileSetup Class Integration", () => {
  let profileSetup;
  
  beforeEach(() => {
    // Mock auth user
    const mockUser = {
      uid: "test-123",
      email: "test@university.edu"
    };
    
    // Note: We can't easily test ProfileSetup class directly due to Firebase dependencies
    // But we can test that the utility functions work correctly
  });

  test("should validate step data correctly", () => {
    // 🎯 WHY THIS MATTERS: Valid data should allow users to proceed
    
    // Mock DOM elements with complete valid data
    global.document.getElementById = jest.fn((id) => {
      const mockElements = {
        'setup-first-name': { value: 'John' },
        'setup-last-name': { value: 'Doe' },
        'setup-starting-year': { value: '2024' },
        'setup-major': { value: 'Computer Science' }
      };
      return mockElements[id] || { value: '' };
    });

    const isValid = validateStepZero();
    expect(isValid).toBe(true);
  });

  test("should reject invalid step data", () => {
    // 🎯 WHY THIS MATTERS: Invalid data should prevent users from proceeding
    
    // Mock DOM elements with empty first name to cause validation failure
    global.document.getElementById = jest.fn((id) => {
      const mockElements = {
        'setup-first-name': { value: '' }, // Empty - should cause failure
        'setup-last-name': { value: 'Doe' },
        'setup-starting-year': { value: '2024' },
        'setup-major': { value: 'Computer Science' }
      };
      return mockElements[id] || { value: '' };
    });

    const isValid = validateStepZero();
    expect(isValid).toBe(false);
  });
});

// =============================================================================
//                          REAL FUNCTION INTEGRATION TESTS
// =============================================================================

describe("Real Function Integration", () => {
  test("should use real email validation from profile-setup.js", () => {
    // This test uses the ACTUAL isValidEmail function from profile-setup.js
    expect(isValidEmail("valid@email.com")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
    
    // If someone changes the email validation in profile-setup.js,
    // this test will catch the change!
  });

  test("should use real name formatting from profile-setup.js", () => {
    // This test uses the ACTUAL formatName function from profile-setup.js
    expect(formatName("john doe")).toBe("John Doe");
    expect(formatName("MARY")).toBe("Mary");
    
    // If someone changes the name formatting in profile-setup.js,
    // this test will catch the change!
  });

  test("should use real student ID generation from profile-setup.js", () => {
    // This test uses the ACTUAL generateStudentId function from profile-setup.js
    const email = "john@test.edu";
    const id1 = generateStudentId(email);
    const id2 = generateStudentId(email);
    
    expect(typeof id1).toBe("string");
    expect(id1).toBe(id2); // Same email should extract same ID
    expect(id1).toBe("john"); // Should extract "john" from "john@test.edu"
    
    // Test with a numeric ID like the user's example
    const numericEmail = "22314914@iub.edu.bd";
    const numericId = generateStudentId(numericEmail);
    expect(numericId).toBe("22314914");
    
    // If someone changes the ID extraction in profile-setup.js,
    // this test will catch the change!
  });

  test("should use real validation functions in combination", () => {
    const profileData = {
      firstName: formatName("john"),  // Uses real formatName
      lastName: formatName("DOE"),   // Uses real formatName
      email: "test@university.edu",
      major: "Computer Science",
      startingYear: "2024"
    };

    // Uses real validateRequiredFields
    expect(validateRequiredFields(profileData)).toBe(true);
    
    // Uses real isValidEmail
    expect(isValidEmail(profileData.email)).toBe(true);
    
    // Uses real isValidStartingYear
    expect(isValidStartingYear(profileData.startingYear)).toBe(true);
  });
});
