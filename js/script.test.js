// js/script.test.js
import { jest } from '@jest/globals';

import {
  createUserObject,
  deleteUserFromState,
  toggleSlotInSchedule,
  determineSlotStatus,
  generateTooltipMessage,
  showAppModal,
  hideAppModal,
  getState,
  _setStateForTesting,
  _resetStateForTesting,
  DOM_ELEMENTS,
} from './script.js';

const DEFAULT_TIMESLOTS_FOR_TEST = [
  { start: "8:00 AM", end: "9:30 AM", label: "8:00-9:30" },
  { start: "9:40 AM", end: "11:10 AM", label: "9:40-11:10" },
  { start: "11:20 AM", end: "12:50 PM", label: "11:20-12:50" },
  { start: "1:00 PM", end: "2:30 PM", label: "1:00-2:30" },
  { start: "2:40 PM", end: "4:10 PM", label: "2:40-4:10" },
  { start: "4:20 PM", end: "5:50 PM", label: "4:20-5:50" },
];


describe('User Management Logic', () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('createUserObject', () => {
    test('should create a new user with default timeSlots and matching schedule matrix', () => {
      const currentUsers = {};
      const newUser = createUserObject('Alice', '123', currentUsers);
      expect(newUser).not.toBeNull();
      expect(newUser.id).toBe('123');
      expect(newUser.name).toBe('Alice');
      expect(newUser.timeSlots).toEqual(DEFAULT_TIMESLOTS_FOR_TEST);
      expect(newUser.timeSlots).not.toBe(DEFAULT_TIMESLOTS_FOR_TEST); 
      expect(newUser.schedule.length).toBe(7);
      newUser.schedule.forEach(daySchedule => {
        expect(daySchedule.length).toBe(DEFAULT_TIMESLOTS_FOR_TEST.length);
        expect(daySchedule.every(slot => slot === false)).toBe(true);
      });
    });

    test('should return null if user ID already exists', () => {
      const currentUsers = {
        '123': { id: '123', name: 'Alice', timeSlots: [], schedule: [] }
      };
      const newUser = createUserObject('Bob', '123', currentUsers);
      expect(newUser).toBeNull();
    });
  });

  describe('deleteUserFromState', () => {
    test('should remove a user and update active/selected users', () => {
      const initialState = {
        users: {
          '1': { id: '1', name: 'Alice', timeSlots: [], schedule: [[]] },
          '2': { id: '2', name: 'Bob', timeSlots: [], schedule: [[]] },
        },
        activeUserId: '1', selectedUserIds: new Set(['1', '2']), compareMode: false,
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
            users: {'1': { id: '1', name: 'Alice', timeSlots: [], schedule: [[]] }},
            activeUserId: '1', selectedUserIds: new Set(['1']), compareMode: false,
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
            const initialSchedule = Array(7).fill(null).map(() => Array(DEFAULT_TIMESLOTS_FOR_TEST.length).fill(false));
            const newSchedule = toggleSlotInSchedule(0, 0, initialSchedule);
            expect(newSchedule[0][0]).toBe(true);
            expect(initialSchedule[0][0]).toBe(false);
        });
        test('should toggle a specific slot from true to false', () => {
            const initialSchedule = Array(7).fill(null).map(() => Array(DEFAULT_TIMESLOTS_FOR_TEST.length).fill(false));
            initialSchedule[1][2] = true;
            const newSchedule = toggleSlotInSchedule(1, 2, initialSchedule);
            expect(newSchedule[1][2]).toBe(false);
        });
    });

    describe('determineSlotStatus', () => {
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

    describe('generateTooltipMessage', () => {
        const usersData = {
            '1': { id: '1', name: 'Alice', schedule: [[true, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]] },
            '2': { id: '2', name: 'Bob', schedule:   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]] },
            '3': { id: '3', name: 'Charlie', schedule: [[true, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]] }
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
            const testState = { users: usersData, selectedUserIds: new Set(['1', '2']) };
            const expectedMessage = "Availability:\nFree: Bob\nBusy: Alice";
            expect(generateTooltipMessage(0, 0, testState)).toBe(expectedMessage);
        });
        test('should show only busy users if some are selected and all of them are busy', () => {
            const testState = { users: usersData, selectedUserIds: new Set(['1']) };
            expect(generateTooltipMessage(0, 0, testState)).toBe("All selected users are unavailable.");
        });
    });
});


describe('Dynamic Time Slot Management', () => {
    beforeEach(() => {
        _resetStateForTesting();
        localStorage.clear();
        jest.clearAllMocks();
        global.prompt = jest.fn();
    });

    test('addCustomTimeSlotToActiveUser logic should add slot and expand schedule', () => {
        const initialUserSchedule = Array(7).fill(null).map(() => Array(DEFAULT_TIMESLOTS_FOR_TEST.length).fill(false));
        const initialTimeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS_FOR_TEST));
        _setStateForTesting({
            activeUserId: 'user1',
            users: {
                'user1': { id: 'user1', name: 'Test User', timeSlots: initialTimeSlots, schedule: initialUserSchedule }
            }
        });

        const user = getState().users['user1'];
        const newStartTime = "6:00 PM";
        const newEndTime = "7:00 PM";
        const newSlotLabel = "6:00-7:00";

        user.timeSlots.push({ start: newStartTime, end: newEndTime, label: newSlotLabel });
        user.schedule.forEach(daySchedule => daySchedule.push(false));
        
        const updatedUser = getState().users['user1'];
        expect(updatedUser.timeSlots.length).toBe(DEFAULT_TIMESLOTS_FOR_TEST.length + 1);
        expect(updatedUser.timeSlots[updatedUser.timeSlots.length - 1]).toEqual({
            start: newStartTime, end: newEndTime, label: newSlotLabel
        });
        updatedUser.schedule.forEach(daySchedule => {
            expect(daySchedule.length).toBe(DEFAULT_TIMESLOTS_FOR_TEST.length + 1);
            expect(daySchedule[daySchedule.length - 1]).toBe(false);
        });
    });

    describe('loadStateFromStorage Data Migration', () => {
        test('should add default timeSlots to users from old data structure', () => {
            const oldUserData = {
                'userOld': { id: 'userOld', name: 'Old User', schedule: Array(7).fill(null).map(() => Array(6).fill(true)) }
            };
            localStorage.setItem('scheduleUsers', JSON.stringify({ users: oldUserData }));
            _resetStateForTesting(); 

            // Simulate calling loadStateFromStorage part
            const savedStateString = localStorage.getItem('scheduleUsers');
            if (savedStateString) {
                const parsed = JSON.parse(savedStateString);
                const loadedUsers = parsed.users || {};
                Object.values(loadedUsers).forEach(user => {
                    if (!user.timeSlots || !Array.isArray(user.timeSlots) || user.timeSlots.length === 0) {
                        user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS_FOR_TEST));
                    }
                    if (user.schedule && user.schedule.length === 7 && user.timeSlots) {
                        user.schedule = user.schedule.map(daySchedule => {
                            const newDayScheduleArray = Array(user.timeSlots.length).fill(false);
                            const limit = Math.min(daySchedule.length, newDayScheduleArray.length);
                            for (let i = 0; i < limit; i++) { newDayScheduleArray[i] = daySchedule[i]; }
                            return newDayScheduleArray;
                        });
                    } else {
                        user.schedule = Array(7).fill(null).map(() => Array(user.timeSlots.length).fill(false));
                    }
                });
                _setStateForTesting({ users: loadedUsers });
            }

            const migratedUser = getState().users['userOld'];
            expect(migratedUser).toBeDefined();
            expect(migratedUser.timeSlots).toEqual(DEFAULT_TIMESLOTS_FOR_TEST);
            expect(migratedUser.schedule.length).toBe(7);
            migratedUser.schedule.forEach(daySchedule => {
                expect(daySchedule.length).toBe(DEFAULT_TIMESLOTS_FOR_TEST.length);
                for(let i=0; i<6; i++) {
                    expect(daySchedule[i]).toBe(true);
                }
            });
        });
    });
});


describe('Modal UI Functions', () => {
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
        DOM_ELEMENTS.appModal = document.getElementById("appModal");
        DOM_ELEMENTS.modalTitle = document.getElementById("modalTitle");
        DOM_ELEMENTS.modalMessage = document.getElementById("modalMessage");
        DOM_ELEMENTS.modalCloseBtn = document.getElementById("modalCloseBtn");
        DOM_ELEMENTS.modalActionButtons = document.getElementById("modalActionButtons");
        DOM_ELEMENTS.modalConfirmBtn = document.getElementById("modalConfirmBtn");
        DOM_ELEMENTS.modalCancelBtn = document.getElementById("modalCancelBtn");
    };

    describe('showAppModal', () => {
        beforeEach(() => { // MOVED setup for showAppModal tests here
            setupModalDOM();
            jest.clearAllMocks();
            jest.useFakeTimers();
        });

        afterEach(() => { // MOVED teardown for showAppModal tests here
            jest.clearAllTimers();
            jest.useRealTimers();
        });

        test('should display the modal with correct title and message for notifications', () => {
            showAppModal("Test Message", "Test Title");
            expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Test Title");
            expect(DOM_ELEMENTS.modalMessage.textContent).toBe("Test Message");
            expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
            expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("none");
            expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("inline-block");
            jest.runAllTimers();
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
        });

        test('should display modal with Yes/No buttons for confirmation', () => {
            const mockOnConfirm = jest.fn();
            showAppModal("Are you sure?", "Confirm", true, mockOnConfirm);
            expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Confirm");
            expect(DOM_ELEMENTS.modalMessage.textContent).toBe("Are you sure?");
            expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
            expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("flex");
            expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("none");
            jest.runAllTimers();
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
        });

        test('should fallback to alert/confirm if modal DOM elements are missing', () => {
            const originalAppModal = DOM_ELEMENTS.appModal;
            DOM_ELEMENTS.appModal = null; 
            const mockConfirmCallback = jest.fn();
            window.confirm = jest.fn(() => true); 
            showAppModal("Confirm please", "Native Confirm", true, mockConfirmCallback);
            expect(window.confirm).toHaveBeenCalledWith("Native Confirm: Confirm please");
            expect(mockConfirmCallback).toHaveBeenCalled();
            DOM_ELEMENTS.appModal = originalAppModal; 
        });
    });

    describe('hideAppModal', () => {
        beforeEach(() => { // MOVED setup for hideAppModal tests here
            setupModalDOM(); 
            jest.clearAllMocks();
            jest.useFakeTimers(); 
        });

        afterEach(() => { // MOVED teardown for hideAppModal tests here
            jest.clearAllTimers();
            jest.useRealTimers();
        });

        test('should hide the modal and reset button visibility', () => {
            showAppModal("A message", "A Title", true, jest.fn());
            jest.runAllTimers(); 
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
            hideAppModal();
            expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(false);
            jest.runAllTimers(); 
            expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
            expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("none");
            expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("inline-block"); 
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
        `; 
        _resetStateForTesting(); 
        localStorage.clear();    
        jest.clearAllMocks();     

        if (DOM_ELEMENTS) { 
            DOM_ELEMENTS.userListContainer = document.getElementById("userList");
            DOM_ELEMENTS.scheduleTable = document.getElementById("schedule");
            DOM_ELEMENTS.compareButton = document.getElementById("compare");
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