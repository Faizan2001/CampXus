
// jest.setup.js
// Import jest for ESM compatibility
import { jest } from '@jest/globals';

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
global.confirm = () => true;

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


// Mock window.matchMedia for tests (jsdom does not implement it by default)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Add missing DOM elements globally for SPA initialization
// Create main content and top nav for SPA to prevent errors
const mainContent = document.createElement('div');
mainContent.className = 'main-content';
document.body.appendChild(mainContent);

const topNav = document.createElement('nav');
topNav.className = 'top-nav';
document.body.appendChild(topNav);

// Fix jsdom document.addEventListener issue - comprehensive approach
// Override the addEventListener property on both document and window.document
const mockAddEventListener = function(event, callback, options) {
  // Mock implementation that does nothing but prevents errors
  return true;
};

// Ensure document has addEventListener
Object.defineProperty(document, 'addEventListener', {
  value: mockAddEventListener,
  writable: true,
  configurable: true
});

// Ensure window.document has addEventListener 
if (window && window.document) {
  Object.defineProperty(window.document, 'addEventListener', {
    value: mockAddEventListener,
    writable: true,
    configurable: true
  });
}


// Cleanup function to prevent async operations after test completion
global.afterEach = global.afterEach || (() => {});
const originalAfterEach = global.afterEach;
global.afterEach = (fn) => {
  return originalAfterEach(() => {
    // Clear any remaining timeouts/intervals
    if (typeof fn === 'function') {
      fn();
    }
    // Clear all timers to prevent teardown issues
    jest.clearAllTimers();
    // Wait a tick to ensure cleanup
    return new Promise(resolve => setTimeout(resolve, 0));
  });
};

// Remove global fake timers - let individual tests handle them
// Add global timeout cleanup without fake timers
global.beforeEach(() => {
  // Clear any existing timers but don't use fake timers globally
});

global.afterEach(() => {
  // Clear all timers to prevent teardown issues
  jest.clearAllTimers();
});

