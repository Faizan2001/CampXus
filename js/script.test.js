// js/script.test.js
import { jest } from '@jest/globals'; // <--- ADDED THIS IMPORT

import {
  createUserObject,
  deleteUserFromState,
  toggleSlotInSchedule,
  determineSlotStatus,
  // generateTooltipMessage, // Assuming you'll add tests for this later
  // getState, 
  _setStateForTesting, 
  _resetStateForTesting, 
  DOM_ELEMENTS 
} from './script.js'; 


describe('User Management Logic', () => {
  beforeEach(() => {
    _resetStateForTesting(); 
    localStorage.clear();    // CORRECTED
    jest.clearAllMocks();     // This will now use the imported 'jest' object
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
        localStorage.clear();    // CORRECTED
        jest.clearAllMocks();    // This will now use the imported 'jest' object
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
        test('should return "slot-selected" for active user busy slot', () => {
            const testState = {
                activeUserId: '1',
                users: { '1': { schedule: [[true]] } }, 
                compareMode: false,
                selectedUserIds: new Set(),
            };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-selected');
        });

        // ... other determineSlotStatus tests ...
        test('should return "slot-free" in compare mode if all selected are free', () => {
            const testState = {
                activeUserId: null,
                users: {
                    '1': { schedule: [[false]] },
                    '2': { schedule: [[false]] }
                },
                compareMode: true,
                selectedUserIds: new Set(['1', '2']),
            };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-free');
        });

        test('should return "slot-conflict" in compare mode if all selected are busy', () => {
            const testState = {
                activeUserId: null,
                users: {
                    '1': { schedule: [[true]] },
                    '2': { schedule: [[true]] }
                },
                compareMode: true,
                selectedUserIds: new Set(['1', '2']),
            };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-conflict');
        });

        test('should return "slot-partial" in compare mode for mixed availability', () => {
            const testState = {
                activeUserId: null,
                users: {
                    '1': { schedule: [[true]] },
                    '2': { schedule: [[false]] }
                },
                compareMode: true,
                selectedUserIds: new Set(['1', '2']),
            };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot-partial');
        });

        test('should return "slot" for default cases', () => {
            const testState = {
                activeUserId: null,
                users: {},
                compareMode: false,
                selectedUserIds: new Set(),
            };
            expect(determineSlotStatus(0, 0, testState)).toBe('slot');
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
        `;
        _resetStateForTesting(); 
        localStorage.clear();    
        jest.clearAllMocks();     // This will now use the imported 'jest' object

        if (DOM_ELEMENTS) { 
            DOM_ELEMENTS.userListContainer = document.getElementById("userList");
            DOM_ELEMENTS.scheduleTable = document.getElementById("schedule");
            DOM_ELEMENTS.compareButton = document.getElementById("compare");
        }
    });

    test.skip('UI Rendering tests are pending', () => { 
        expect(true).toBe(true);
    });
});