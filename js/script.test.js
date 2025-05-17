// js/script.test.js
import { jest } from '@jest/globals';

import {
  createUserObject,
  deleteUserFromState,
  toggleSlotInSchedule,
  determineSlotStatus,
  generateTooltipMessage, // Now we'll test this
  showAppModal,           // For testing modal
  hideAppModal,           // For testing modal
  // getState,            // We might not need to import getState if we check effects via other means
  _setStateForTesting,
  _resetStateForTesting,
  DOM_ELEMENTS
} from './script.js';


describe('User Management Logic', () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('createUserObject', () => {
    test('should create a new user object with a unique ID', () => {
      const currentUsers = {};
      const newUser = createUserObject('Alice', '123', currentUsers);
      expect(newUser).toEqual({
        id: '123',
        name: 'Alice',
        schedule: Array(7).fill(null).map(() => Array(6).fill(false)),
      });
    });

    test('should return null if user ID already exists', () => {
      const currentUsers = { '123': { id: '123', name: 'Alice', schedule: [] } };
      const newUser = createUserObject('Bob', '123', currentUsers);
      expect(newUser).toBeNull();
    });
  });

  describe('deleteUserFromState', () => {
    test('should remove a user and update active/selected users', () => {
      const initialState = {
        users: {
          '1': { id: '1', name: 'Alice', schedule: [[]] },
          '2': { id: '2', name: 'Bob', schedule: [[]] },
        },
        activeUserId: '1',
        selectedUserIds: new Set(['1', '2']),
        compareMode: false,
      };
      const newState = deleteUserFromState('1', initialState);
      expect(newState.users['1']).toBeUndefined();
      expect(newState.users['2']).toBeDefined();
      expect(newState.activeUserId).toBeNull();
      expect(newState.selectedUserIds.has('1')).toBe(false);
      expect(newState.selectedUserIds.has('2')).toBe(true);
    });

    test('should return original state if user to delete does not exist', () => {
        const initialState = {
            users: {'1': { id: '1', name: 'Alice', schedule: [[]] }},
            activeUserId: '1',
            selectedUserIds: new Set(['1']),
            compareMode: false,
        };
        const newState = deleteUserFromState('999', initialState);
        expect(newState).toEqual(initialState);
    });
  });
});


describe('Schedule Interaction Logic', () => {
    beforeEach(() => {
        _resetStateForTesting();
        localStorage.clear();
        jest.clearAllMocks();
    });

    describe('toggleSlotInSchedule', () => {
        test('should toggle a specific slot from false to true', () => {
            const initialSchedule = Array(7).fill(null).map(() => Array(6).fill(false));
            const newSchedule = toggleSlotInSchedule(0, 0, initialSchedule);
            expect(newSchedule[0][0]).toBe(true);
            expect(initialSchedule[0][0]).toBe(false); 
        });

        test('should toggle a specific slot from true to false', () => {
            const initialSchedule = Array(7).fill(null).map(() => Array(6).fill(false));
            initialSchedule[1][2] = true;
            const newSchedule = toggleSlotInSchedule(1, 2, initialSchedule);
            expect(newSchedule[1][2]).toBe(false);
        });
    });

    describe('determineSlotStatus', () => {
        // ... (your existing determineSlotStatus tests are good, keeping them) ...
        test('should return "slot-selected" for active user busy slot', () => {
            const testState = { activeUserId: '1', users: { '1': { schedule: [[true]] } }, compareMode: false, selectedUserIds: new Set() };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-selected');
        });
        test('should return "slot-free" in compare mode if all selected are free', () => {
            const testState = { activeUserId: null, users: { '1': { schedule: [[false]] }, '2': { schedule: [[false]] } }, compareMode: true, selectedUserIds: new Set(['1', '2']) };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-free');
        });
        test('should return "slot-conflict" in compare mode if all selected are busy', () => {
            const testState = { activeUserId: null, users: { '1': { schedule: [[true]] }, '2': { schedule: [[true]] } }, compareMode: true, selectedUserIds: new Set(['1', '2']) };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-conflict');
        });
        test('should return "slot-partial" in compare mode for mixed availability', () => {
            const testState = { activeUserId: null, users: { '1': { schedule: [[true]] }, '2': { schedule: [[false]] } }, compareMode: true, selectedUserIds: new Set(['1', '2']) };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-partial');
        });
        test('should return "slot" for default cases', () => {
            const testState = { activeUserId: null, users: {}, compareMode: false, selectedUserIds: new Set() };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot');
        });
    });

    // --- NEW TESTS for generateTooltipMessage ---
    describe('generateTooltipMessage', () => {
        const usersData = {
            '1': { id: '1', name: 'Alice', schedule: [[true, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]] }, // Busy day 0, slot 0
            '2': { id: '2', name: 'Bob', schedule:   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]] }, // Free day 0, slot 0
            '3': { id: '3', name: 'Charlie', schedule: [[true, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]] } // Busy day 0, slot 0
        };

        test('should return empty string if no users selected', () => {
            const testState = { users: usersData, selectedUserIds: new Set() };
            expect(generateTooltipMessage(0, 0, testState)).toBe("");
        });

        test('should show all selected users are free', () => {
            const testState = { users: usersData, selectedUserIds: new Set(['2']) };
            expect(generateTooltipMessage(0, 0, testState)).toBe("All selected users are free.");
        });
        
        test('should show all selected users are unavailable', () => {
            const testState = { users: usersData, selectedUserIds: new Set(['1', '3']) };
            expect(generateTooltipMessage(0, 0, testState)).toBe("All selected users are unavailable.");
        });

        test('should show mixed availability correctly', () => {
            const testState = { users: usersData, selectedUserIds: new Set(['1', '2']) }; // Alice busy, Bob free
            const expectedMessage = "Availability:\nFree: Bob\nBusy: Alice";
            expect(generateTooltipMessage(0, 0, testState)).toBe(expectedMessage);
        });

        test('should show only busy users if some are selected and all of them are busy', () => {
            const testState = { users: usersData, selectedUserIds: new Set(['1']) }; // Alice busy
            // This scenario falls under "All selected users are unavailable"
            expect(generateTooltipMessage(0, 0, testState)).toBe("All selected users are unavailable.");
        });
    });
});

// --- NEW TESTS for Modal Functions ---
describe('Modal UI Functions', () => {
    // Helper to set up basic modal HTML structure in the JSDOM
    const setupModalDOM = () => {
        document.body.innerHTML = `
            <div id="appModal" style="display: none;">
                <div class="modal-content">
                    <h3 id="modalTitle"></h3>
                    <p id="modalMessage"></p>
                    <div id="modalActionButtons" style="display: none;">
                        <button id="modalConfirmBtn"></button>
                        <button id="modalCancelBtn"></button>
                    </div>
                    <button id="modalCloseBtn"></button>
                </div>
            </div>
        `;
        // Re-assign to DOM_ELEMENTS for the test scope, as they are cached in script.js
        // This assumes DOM_ELEMENTS is exported from script.js
        DOM_ELEMENTS.appModal = document.getElementById("appModal");
        DOM_ELEMENTS.modalTitle = document.getElementById("modalTitle");
        DOM_ELEMENTS.modalMessage = document.getElementById("modalMessage");
        DOM_ELEMENTS.modalCloseBtn = document.getElementById("modalCloseBtn");
        DOM_ELEMENTS.modalActionButtons = document.getElementById("modalActionButtons");
        DOM_ELEMENTS.modalConfirmBtn = document.getElementById("modalConfirmBtn");
        DOM_ELEMENTS.modalCancelBtn = document.getElementById("modalCancelBtn");
    };

    beforeEach(() => {
        setupModalDOM();
        jest.clearAllMocks(); // Clear any mocks from other tests
        // Mock setTimeout and clearTimeout for controlling them in tests
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllTimers(); // Clear all timers after each test
        jest.useRealTimers(); // Restore real timers
    });

    describe('showAppModal', () => {
        test('should display the modal with correct title and message for notifications', () => {
            showAppModal("Test Message", "Test Title");
            
            expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Test Title");
            expect(DOM_ELEMENTS.modalMessage.textContent).toBe("Test Message");
            expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
            expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("none"); // Yes/No hidden
            expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("inline-block"); // OK shown

            jest.runAllTimers(); // Fast-forward timers
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
        });

        test('should display modal with Yes/No buttons for confirmation', () => {
            const mockOnConfirm = jest.fn();
            showAppModal("Are you sure?", "Confirm", true, mockOnConfirm);

            expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Confirm");
            expect(DOM_ELEMENTS.modalMessage.textContent).toBe("Are you sure?");
            expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
            expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("flex"); // Yes/No shown
            expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("none");    // OK hidden
            
            jest.runAllTimers();
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
            
            // Simulate clicking confirm button (event listener for this is in initializeApp,
            // so we test the callback assignment here and the effect in an integration/handler test)
            // For now, we just test that the callback would be set if showAppModal was used correctly by a handler
        });

        test('should fallback to alert/confirm if modal DOM elements are missing', () => {
            // Temporarily hide modal elements to simulate them missing
            const originalAppModal = DOM_ELEMENTS.appModal;
            DOM_ELEMENTS.appModal = null; // Simulate missing element
            
            const mockConfirmCallback = jest.fn();
            window.confirm = jest.fn(() => true); // Mock native confirm to return true

            showAppModal("Confirm please", "Native Confirm", true, mockConfirmCallback);
            expect(window.confirm).toHaveBeenCalledWith("Native Confirm: Confirm please");
            expect(mockConfirmCallback).toHaveBeenCalled();

            DOM_ELEMENTS.appModal = originalAppModal; // Restore
        });
    });

    describe('hideAppModal', () => {
        test('should hide the modal and reset button visibility', () => {
            // First, show the modal to set it up
            showAppModal("A message", "A Title", true, jest.fn());
            jest.runAllTimers(); // Ensure it's active
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);

            hideAppModal();
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(false);
            
            jest.runAllTimers(); // Fast-forward the hide timeout
            expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
            expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("none");
            expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("inline-block"); // Resets to show OK
        });
    });
});


describe('UI Rendering', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="userList"></div>
            <table id="schedule"><tbody>
                <tr>
                    <td>Sunday</td>
                    <td class="slot" data-day="0" data-time="0"></td>
                    <td class="slot" data-day="0" data-time="1"></td>
                </tr>
            </tbody></table>
            <button id="compare"></button>
            <div id="appModal" style="display: none;"><div class="modal-content"><h3 id="modalTitle"></h3><p id="modalMessage"></p><div id="modalActionButtons"><button id="modalConfirmBtn"></button><button id="modalCancelBtn"></button></div><button id="modalCloseBtn"></button></div></div>
        `; // Added modal structure for completeness, though not directly tested here yet
        _resetStateForTesting(); 
        localStorage.clear();    
        jest.clearAllMocks();     

        if (DOM_ELEMENTS) { 
            DOM_ELEMENTS.userListContainer = document.getElementById("userList");
            DOM_ELEMENTS.scheduleTable = document.getElementById("schedule");
            DOM_ELEMENTS.compareButton = document.getElementById("compare");
            // Add modal elements too if they are manipulated by other UI functions being tested
            DOM_ELEMENTS.appModal = document.getElementById("appModal");
            DOM_ELEMENTS.modalTitle = document.getElementById("modalTitle");
            DOM_ELEMENTS.modalMessage = document.getElementById("modalMessage");
            DOM_ELEMENTS.modalCloseBtn = document.getElementById("modalCloseBtn");
            DOM_ELEMENTS.modalActionButtons = document.getElementById("modalActionButtons");
            DOM_ELEMENTS.modalConfirmBtn = document.getElementById("modalConfirmBtn");
            DOM_ELEMENTS.modalCancelBtn = document.getElementById("modalCancelBtn");
        }
    });

    test.skip('UI Rendering tests are pending', () => { 
        expect(true).toBe(true);
    });
});