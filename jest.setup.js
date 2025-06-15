// jest.setup.js
// Note: Using require syntax for Jest setup compatibility

// jest.setup.js
// Note: Using require syntax for Jest setup compatibility

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock global functions
global.alert = () => {};

// Mock clipboard API
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(""),
  },
  writable: true,
});

// Mock Firebase environment configuration for tests
Object.defineProperty(window, "ENV", {
  value: {
    FIREBASE_API_KEY: "test-api-key",
    FIREBASE_AUTH_DOMAIN: "test-project.firebaseapp.com",
    FIREBASE_PROJECT_ID: "test-project",
    FIREBASE_STORAGE_BUCKET: "test-project.firebasestorage.app",
    FIREBASE_MESSAGING_SENDER_ID: "123456789",
    FIREBASE_APP_ID: "1:123456789:web:testappid",
    NODE_ENV: "test",
  },
  writable: true,
});

// Note: Firebase mocking will be handled in individual test files if needed
