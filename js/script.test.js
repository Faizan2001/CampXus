// js/script.test.js

// If your script.js functions are global (not ideal for testing, but for simplicity here):
// You would need to load script.js in your test environment.
// Or, ideally, you'd export functions from script.js:
// e.g., in script.js: export function createUserObject(...) { ... }
// then in script.test.js: import { createUserObject } from './script';

// For this example, let's assume createUserObject is somehow accessible.
// If it's global, Jest might pick it up if script.js is loaded via HTML in jsdom.
// A better way for Jest is to directly import.
// For now, let's define a similar function here for testing concept
// (IN A REAL SCENARIO, YOU WOULD IMPORT IT FROM SCRIPT.JS)

function createUserObjectForTest(name, userId, existingUsers = {}) {
  if (!existingUsers[userId]) {
    const schedule = Array(7).fill(null).map(() => Array(6).fill(false));
    return { id: userId, name: name, schedule: schedule };
  }
  return null;
}

describe('User Management Functions', () => {
  describe('createUserObjectForTest', () => { // Or describe('createUserObject' if imported)
    const existingUsers = {};

    beforeEach(() => {
      // Reset state for each test if needed, or clear mocks
      // For createUserObject, it depends on the 'users' part of your state
      // localStorage.clear(); // If it relied on localStorage directly
    });

    test('should create a new user object with a unique ID', () => {
      const newUser = createUserObjectForTest('Alice', '123', existingUsers);
      expect(newUser).not.toBeNull();
      expect(newUser.id).toBe('123');
      expect(newUser.name).toBe('Alice');
      expect(newUser.schedule).toEqual(Array(7).fill(null).map(() => Array(6).fill(false)));
    });

    test('should return null if user ID already exists', () => {
      const usersWithAlice = { '123': { id: '123', name: 'Alice', schedule: [] } };
      const newUser = createUserObjectForTest('Bob', '123', usersWithAlice);
      expect(newUser).toBeNull();
    });

    test('should initialize schedule as a 7x6 boolean matrix filled with false', () => {
      const newUser = createUserObjectForTest('Charlie', '789', existingUsers);
      expect(newUser.schedule.length).toBe(7);
      newUser.schedule.forEach(daySchedule => {
        expect(daySchedule.length).toBe(6);
        expect(daySchedule.every(slot => slot === false)).toBe(true);
      });
    });
  });

  // You would add more describe blocks and tests for other functions:
  // describe('deleteUser', () => { ... });
  // describe('setActiveUser', () => { ... });
  // etc.
});

// To test DOM manipulating functions like renderUserList, you'd need to:
// 1. Set up document.body.innerHTML with the necessary HTML structure (e.g., <div id="userList"></div>)
// 2. Call your function.
// 3. Make assertions about the state of the DOM (e.g., expect(userListContainer.innerHTML).toContain(...))

// Example for a DOM-dependent function (conceptual)
// describe('renderUserList', () => {
//   beforeEach(() => {
//     // Set up a mock DOM environment for each test
//     document.body.innerHTML = '<div id="userList"></div>';
//     // Reset your global state object for users
//     // state.users = {}; 
//     // state.activeUserId = null; 
//     // etc.
//     // (This highlights why global state is hard to test without careful setup/teardown)
//   });

//   test('should display "No users added yet" when users object is empty', () => {
//     // Assuming state.users is empty
//     // Call your actual renderUserList() function which uses the global 'state'
//     // renderUserList(); // This would need access to your script.js's state and function
//     const userListContainer = document.getElementById('userList');
//     // expect(userListContainer.innerHTML).toBe("<p>No users added yet.</p>");
//     // This test is more complex because renderUserList relies on global state and DOM elements.
//   });
// });