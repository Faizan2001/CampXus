# 🧪 Testing Guide for CampXus

> A beginner-friendly guide to understanding tests. Welcome to the world of testing! 🎉

## Table of Contents

- [Why Do We Test?](#why-do-we-test)
- [The Testing Pyramid](#the-testing-pyramid-)
- [Types of Tests Explained](#types-of-tests-explained)
- [Our Testing Setup](#our-testing-setup)
- [How to Run Tests](#how-to-run-tests)
- [Writing Your First Test](#writing-your-first-test)
- [What We Test (and Why)](#what-we-test-and-why)
- [Tips & Best Practices](#tips--best-practices)

---

## Why Do We Test?

Imagine you're building a house of cards 🃏. Every time you add a new card, there's a chance the whole thing comes crashing down. Software is similar!

**Tests are like having a safety net** that catches you when you accidentally break something. They help you:

1. **Catch bugs early** - Before users see them! 🐛
2. **Refactor with confidence** - Change code without fear of breaking things
3. **Document behavior** - Tests show how code is _supposed_ to work
4. **Sleep better at night** - Knowing your code works! 😴

---

## The Testing Pyramid 🔺

Think of tests like a pyramid with three layers:

```
         /\
        /  \        🌐 E2E Tests (Few)
       /----\       Real browser, real clicks, slow but comprehensive
      /      \
     /--------\     🔗 Integration Tests (Some)
    /          \    Components working together
   /------------\
  /              \  🧱 Unit Tests (Many)
 /________________\ Individual functions, fast & isolated
```

### The Golden Rule:

- **Many** unit tests (fast, cheap, reliable)
- **Some** integration tests (moderate speed)
- **Few** E2E tests (slow, expensive, but realistic)

---

## Types of Tests Explained

### 🧱 Unit Tests - "Does this Lego brick work?"

**What:** Test ONE thing in isolation (a function, a small utility)

**Analogy:** Testing if a single Lego brick is the right shape and size, without building the whole castle.

**Example from our codebase:**

```javascript
// Testing the normalizeHandle function
test("normalizes handle to lowercase", () => {
  expect(normalizeHandle("JOHN_DOE")).toBe("john_doe");
});
```

**Characteristics:**

- ⚡ Super fast (milliseconds)
- 🎯 Tests one specific thing
- 🔒 No network, no database, no external stuff
- ✅ Should be most of your tests

**We use unit tests for:**

- `handleUtils.js` - Handle validation and formatting
- `timeUtils.js` - Time calculations
- `scheduleParsing.js` - Schedule text parsing
- Pure utility functions

---

### 🔗 Integration Tests - "Do these Lego pieces fit together?"

**What:** Test how multiple pieces work together

**Analogy:** Testing if several Lego bricks can snap together correctly and form a small structure.

**Example:**

```javascript
// Testing Router + Authentication together
test("redirects unauthenticated users to landing", async () => {
  authManager.isAuthenticated.mockReturnValue(false);
  await router.navigate("/home");
  expect(window.location.hash).toBe("#landing");
});
```

**Characteristics:**

- 🐢 Slower than unit tests
- 🤝 Tests components interacting
- 📦 May need mocks for external services
- ⚖️ Balance between speed and realism

**We use integration tests for:**

- `Router.js` - Navigation + auth guards + templates
- Page controllers - Components + services
- Firebase listeners - Service + state management

---

### 🌐 E2E (End-to-End) Tests - "Does the whole castle work?"

**What:** Test the entire app like a real user would

**Analogy:** Actually building the complete Lego castle and testing if doors open, drawbridge works, and knights can move around.

**Example:**

```javascript
// Playwright/Cypress E2E test (we don't have these yet)
test("user can import their schedule", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Sign In");
  await page.fill("#email", "test@test.com");
  await page.click("text=Import Schedule");
  // ... more real user interactions
});
```

**Characteristics:**

- 🐌 Slowest (seconds to minutes)
- 🌍 Tests real browser behavior
- 💰 Expensive to write and maintain
- 🎬 Like recording a user's journey

**When to use E2E:**

- Critical user flows (login, signup)
- Payment flows (if any)
- Complex multi-step processes

> **Note:** We don't have E2E tests yet in CampXus. For most projects, starting with unit and integration tests gives you the best bang for your buck! 💰

---

## Our Testing Setup

### Tools We Use

| Tool           | Purpose                                        |
| -------------- | ---------------------------------------------- |
| **Jest**       | Test runner - executes tests and shows results |
| **jsdom**      | Fake browser in Node.js - simulates DOM        |
| **ES Modules** | Modern JavaScript imports                      |

### File Structure

```
src/js/tests/
├── __mocks__/          # Fake versions of complex modules
│   └── spaInit.js      # Mock for SPA initialization
├── core/               # Tests for core functionality
│   └── script.test.js  # HomePage interactions
├── firebase/           # Tests for Firebase services
├── router/             # Tests for navigation
│   └── Router.test.js  # SPA routing tests
├── services/           # Tests for business logic
│   ├── campusLocation.test.js
│   ├── schedule*.test.js
│   └── FriendsService.test.js
└── utils/              # Tests for utility functions
    └── handleUtils.test.js
```

### The jest.setup.js File

This runs before every test and sets up:

- 🪟 Fake `window.ENV` with Firebase config
- 💾 Fake `localStorage`
- 📱 Fake `matchMedia` for responsive tests
- 🧹 Cleanup after each test

---

## How to Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm test -- --watch

# Run a specific test file
npm test -- handleUtils.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="validates handle"

# See test coverage
npm test -- --coverage
```

### Reading Test Output

```
 PASS  src/js/tests/utils/handleUtils.test.js
  handleUtils
    normalizeHandle
      ✓ returns empty string for null input (2 ms)
      ✓ normalizes handle to lowercase (1 ms)
      ✓ trims whitespace from handles
    validateHandle
      ✓ rejects handles shorter than 3 characters (1 ms)
      ✓ rejects handles longer than 20 characters
      ✓ accepts valid handles

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Time:        1.234 s
```

- ✓ Green checkmarks = passing tests 🎉
- ✗ Red X = failing tests 😱
- Time tells you how long tests took

---

## Writing Your First Test

### The AAA Pattern

Every test follows three steps - **Arrange, Act, Assert**:

```javascript
test("adds two numbers correctly", () => {
  // 🎬 ARRANGE - Set up the test data
  const a = 2;
  const b = 3;

  // 🎯 ACT - Do the thing you're testing
  const result = add(a, b);

  // ✅ ASSERT - Check the result
  expect(result).toBe(5);
});
```

### Real Example from CampXus

```javascript
import {
  normalizeHandle,
  validateHandle,
} from "../../utils/handle/handleUtils.js";

describe("handleUtils", () => {
  describe("normalizeHandle", () => {
    test("converts uppercase to lowercase", () => {
      // Arrange
      const input = "JOHN_DOE";

      // Act
      const result = normalizeHandle(input);

      // Assert
      expect(result).toBe("john_doe");
    });

    test("trims whitespace", () => {
      expect(normalizeHandle("  john  ")).toBe("john");
    });
  });

  describe("validateHandle", () => {
    test("rejects handles that are too short", () => {
      const result = validateHandle("ab");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 3");
    });
  });
});
```

### Common Jest Matchers

```javascript
// Equality
expect(value).toBe(5); // Exact match (===)
expect(value).toEqual({ a: 1 }); // Deep equality for objects

// Truthiness
expect(value).toBeTruthy(); // Passes if truthy
expect(value).toBeFalsy(); // Passes if falsy
expect(value).toBeNull(); // Passes if null
expect(value).toBeDefined(); // Passes if not undefined

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThanOrEqual(10);

// Strings
expect(string).toContain("hello");
expect(string).toMatch(/pattern/);

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Exceptions
expect(() => badFunction()).toThrow();
expect(() => badFunction()).toThrow("specific error");
```

---

## What We Test (and Why)

### ✅ High Priority - Always Test These

| Module                 | Why It's Important                          |
| ---------------------- | ------------------------------------------- |
| `handleUtils.js`       | User-facing validation, can't have bugs!    |
| `Router.js`            | Core navigation, auth guards protect routes |
| `timeUtils.js`         | Schedule calculations must be accurate      |
| `scheduleParsing.js`   | Import feature users depend on              |
| `ScheduleValidator.js` | Prevents bad data in database               |

### 📊 Medium Priority - Test When Possible

| Module           | Why                                       |
| ---------------- | ----------------------------------------- |
| Page controllers | Complex logic orchestration               |
| Services         | Business logic that could have edge cases |
| State management | Data integrity                            |

### ⏭️ Lower Priority - Skip or Mock

| Module                | Why                                  |
| --------------------- | ------------------------------------ |
| Simple UI components  | Hard to test, low bug risk           |
| Firebase direct calls | Mock these, test integration instead |
| Third-party libraries | They have their own tests            |

---

## Tips & Best Practices

### 📝 Test Naming

Write test names that read like sentences:

```javascript
// ❌ Bad - unclear what's being tested
test('handle test 1', () => { ... });

// ✅ Good - reads like documentation
test('rejects handles containing special characters', () => { ... });
```

### 🧹 Keep Tests Independent

Each test should be able to run alone:

```javascript
// ❌ Bad - tests depend on each other
let user;
test("creates user", () => {
  user = createUser();
});
test("deletes user", () => {
  deleteUser(user);
}); // Fails if run alone!

// ✅ Good - each test sets up its own data
test("creates user", () => {
  const user = createUser();
  expect(user).toBeDefined();
});

test("deletes user", () => {
  const user = createUser(); // Create fresh user
  deleteUser(user);
  expect(getUser(user.id)).toBeNull();
});
```

### 🎭 Mocking External Services

When testing code that uses Firebase, localStorage, or APIs:

```javascript
// Mock Firebase auth
jest.mock("../../lib/firebase/auth.js", () => ({
  authManager: {
    isAuthenticated: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

test("redirects unauthenticated user", () => {
  // Control the mock's behavior
  authManager.isAuthenticated.mockReturnValue(false);

  // Now test your code
  // ...
});
```

### 🎯 Test Edge Cases

Think about what could go wrong:

```javascript
describe('validateHandle', () => {
  // Happy path
  test('accepts valid handle', () => { ... });

  // Edge cases - what could go wrong?
  test('handles null input', () => { ... });
  test('handles empty string', () => { ... });
  test('handles whitespace only', () => { ... });
  test('handles maximum length', () => { ... });
  test('handles special characters', () => { ... });
  test('handles unicode characters', () => { ... });
});
```

### 🚀 Run Tests Before Committing

Make it a habit:

```bash
# Before every commit
npm test && npm run build && git commit -m "feat: add feature"
```

---

## Quick Reference

### Test File Template

```javascript
/**
 * Tests for [ModuleName]
 *
 * What this module does:
 * - Thing 1
 * - Thing 2
 */

// Import the module being tested
import { functionA, functionB } from "../../path/to/module.js";

// Group related tests together
describe("ModuleName", () => {
  // Run before each test (optional)
  beforeEach(() => {
    // Reset state, clear mocks, etc.
  });

  describe("functionA", () => {
    test("does something expected", () => {
      const result = functionA("input");
      expect(result).toBe("expected");
    });

    test("handles edge case", () => {
      expect(functionA(null)).toBe("default");
    });
  });

  describe("functionB", () => {
    // More tests...
  });
});
```

---

## 🎉 You Made It!

Testing might seem like extra work, but it's actually a superpower:

1. **Fewer bugs** reach production
2. **Faster development** - catch issues early
3. **Better documentation** - tests show how code works
4. **Confident refactoring** - change code without fear

Remember: **Any test is better than no test!** Start small, and you'll get better with practice.

Happy testing! 🧪✨

---

_Questions? Check out the [Jest documentation](https://jestjs.io/docs/getting-started) or ask in the team chat!_
