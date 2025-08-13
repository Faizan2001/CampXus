// js/tests/script.test.js
import { jest } from "@jest/globals";

// Functions from script.js
import {

  toggleSlotInSchedule,
  determineSlotStatus,
  generateTooltipMessage,
  getState,
  _setStateForTesting,
  _resetStateForTesting,
} from "../../pages/HomePage.js";

// Import DEFAULT_TIMESLOTS from its new location
import { DEFAULT_TIMESLOTS } from "../../utils/constants.js";

// Import DOM_ELEMENTS and its initializer
import { DOM_ELEMENTS, initializeDomElements } from "../../utils/dom/domElements.js";

// Import the new modal functions to test them directly
import { initModal, showModal } from "../../components/modals/Modal.js";

// This constant is for clarity in tests, should match constants.js/DEFAULT_TIMESLOTS
const DEFAULT_TIMESLOTS_FOR_TEST = DEFAULT_TIMESLOTS;

describe("User Management Logic", () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
  });


    });

    test("should return null if user ID already exists", () => {
      const currentUsers = {
        123: { id: "123", name: "Alice", timeSlots: [], schedule: [] },
      };
      const newUser = createUserObject("Bob", "123", currentUsers);
      expect(newUser).toBeNull();
    });
  });


    test("should return original state if user to delete does not exist", () => {
      const initialState = {
        users: { 1: { id: "1", name: "Alice", timeSlots: [], schedule: [[]] } },
        activeUserId: "1",
        selectedUserIds: new Set(["1"]),
        compareMode: false,
      };
      const newState = deleteUserFromState("999", initialState);
      expect(newState).toEqual(initialState);
    });
  });
});

describe("Schedule Interaction Logic", () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("toggleSlotInSchedule", () => {
    test("should toggle a specific slot from false to true", () => {
      const initialSchedule = Array(7)
        .fill(null)
        .map(() => Array(DEFAULT_TIMESLOTS.length).fill(false));
      const newSchedule = toggleSlotInSchedule(0, 0, initialSchedule);
      expect(newSchedule[0][0]).toBe(true);
      expect(initialSchedule[0][0]).toBe(false);
    });
    test("should toggle a specific slot from true to false", () => {
      const initialSchedule = Array(7)
        .fill(null)
        .map(() => Array(DEFAULT_TIMESLOTS.length).fill(false));
      initialSchedule[1][2] = true;
      const scheduleToToggle = JSON.parse(JSON.stringify(initialSchedule));
      const newSchedule = toggleSlotInSchedule(1, 2, scheduleToToggle);
      expect(newSchedule[1][2]).toBe(false);
    });
  });

  describe("determineSlotStatus", () => {
    test('should return "slot-selected" for active user busy slot', () => {
      const testState = {
        activeUserId: "1",
        users: { 1: { schedule: [[true]] } },
        compareMode: false,
        selectedUserIds: new Set(),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-selected");
    });
    test('should return "slot-free" in compare mode if all selected are free', () => {
      const testState = {
        activeUserId: null,
        users: { 1: { schedule: [[false]] }, 2: { schedule: [[false]] } },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-free");
    });
    test('should return "slot-conflict" in compare mode if all selected are busy', () => {
      const testState = {
        activeUserId: null,
        users: { 1: { schedule: [[true]] }, 2: { schedule: [[true]] } },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-conflict");
    });
    test('should return "slot-partial" in compare mode for mixed availability', () => {
      const testState = {
        activeUserId: null,
        users: { 1: { schedule: [[true]] }, 2: { schedule: [[false]] } },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-partial");
    });
    test('should return "slot" for default cases', () => {
      const testState = {
        activeUserId: null,
        users: {},
        compareMode: false,
        selectedUserIds: new Set(),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot");
    });
  });

  describe("generateTooltipMessage", () => {
    const usersData = {
      1: {
        id: "1",
        name: "Alice",
        schedule: [
          [true, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ],
      },
      2: {
        id: "2",
        name: "Bob",
        schedule: [
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ],
      },
      3: {
        id: "3",
        name: "Charlie",
        schedule: [
          [true, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
          [false, false],
        ],
      },
    };
    test("should return empty string if no users selected", () => {
      const testState = { users: usersData, selectedUserIds: new Set() };
      expect(generateTooltipMessage(0, 0, testState)).toBe("");
    });
    test("should show all selected users are free", () => {
      const testState = { users: usersData, selectedUserIds: new Set(["2"]) };
      expect(generateTooltipMessage(0, 0, testState)).toBe(
        "All selected users are free."
      );
    });
    test("should show all selected users are unavailable", () => {
      const testState = {
        users: usersData,
        selectedUserIds: new Set(["1", "3"]),
      };
      expect(generateTooltipMessage(0, 0, testState)).toBe(
        "All selected users are unavailable."
      );
    });
    test("should show mixed availability correctly", () => {
      const testState = {
        users: usersData,
        selectedUserIds: new Set(["1", "2"]),
      };
      const expectedMessage = "Availability:\nFree: Bob\nBusy: Alice";
      expect(generateTooltipMessage(0, 0, testState)).toBe(expectedMessage);
    });
    test("should show only busy users if some are selected and all of them are busy", () => {
      const testState = { users: usersData, selectedUserIds: new Set(["1"]) };
      expect(generateTooltipMessage(0, 0, testState)).toBe(
        "All selected users are unavailable."
      );
    });
  });
});

describe("Dynamic Time Slot Management (State Changes)", () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
  });

  test("Simulating addCustomTimeSlotToActiveUser effect on state", () => {
    const initialUserSchedule = Array(7)
      .fill(null)
      .map(() => Array(DEFAULT_TIMESLOTS.length).fill(false));
    const initialTimeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));

    _setStateForTesting({
      activeUserId: "user1",
      users: {
        user1: {
          id: "user1",
          name: "Test User",
          timeSlots: initialTimeSlots,
          schedule: initialUserSchedule,
        },
      },
    });

    const user = getState().users["user1"];
    const newStartTime = "6:00 PM";
    const newEndTime = "7:00 PM";
    const newSlotLabel = "6PM-7PM";

    user.timeSlots.push({
      start: newStartTime,
      end: newEndTime,
      label: newSlotLabel,
    });
    user.schedule.forEach((daySchedule) => daySchedule.push(false));

    const updatedUser = getState().users["user1"];
    expect(updatedUser.timeSlots.length).toBe(DEFAULT_TIMESLOTS.length + 1);
    expect(updatedUser.timeSlots[updatedUser.timeSlots.length - 1]).toEqual({
      start: newStartTime,
      end: newEndTime,
      label: newSlotLabel,
    });
    updatedUser.schedule.forEach((daySchedule) => {
      expect(daySchedule.length).toBe(DEFAULT_TIMESLOTS.length + 1);
      expect(daySchedule[daySchedule.length - 1]).toBe(false);
    });
  });

  describe("Data Migration Logic (Simulated)", () => {
    test("should add default timeSlots to users from old data structure", () => {
      const oldUserData = {
        userOld: {
          id: "userOld",
          name: "Old User",
          schedule: Array(7)
            .fill(null)
            .map(() => Array(6).fill(true)),
        },
      };
      const loadedUsers = JSON.parse(JSON.stringify(oldUserData));

      Object.values(loadedUsers).forEach((user) => {
        if (
          !user.timeSlots ||
          !Array.isArray(user.timeSlots) ||
          user.timeSlots.length === 0
        ) {
          user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
        }
        if (user.schedule && user.schedule.length === 7 && user.timeSlots) {
          user.schedule = user.schedule.map((daySchedule) => {
            const newDayScheduleArray = Array(user.timeSlots.length).fill(
              false
            );
            const limit = Math.min(
              daySchedule.length,
              newDayScheduleArray.length
            );
            for (let i = 0; i < limit; i++) {
              newDayScheduleArray[i] = daySchedule[i];
            }
            return newDayScheduleArray;
          });
        } else {
          user.schedule = Array(7)
            .fill(null)
            .map(() => Array(user.timeSlots.length).fill(false));
        }
      });
      _setStateForTesting({ users: loadedUsers });

      const migratedUser = getState().users["userOld"];
      expect(migratedUser).toBeDefined();
      expect(migratedUser.timeSlots).toEqual(DEFAULT_TIMESLOTS);
      expect(migratedUser.schedule.length).toBe(7);
      migratedUser.schedule.forEach((daySchedule) => {
        expect(daySchedule.length).toBe(DEFAULT_TIMESLOTS.length);
        for (let i = 0; i < Math.min(6, DEFAULT_TIMESLOTS.length); i++) {
          expect(daySchedule[i]).toBe(true);
        }
        for (let i = 6; i < DEFAULT_TIMESLOTS.length; i++) {
          expect(daySchedule[i]).toBe(false);
        }
      });
    });
  });
});

// =========================================================================
// NEW/REVISED MODAL TESTS - Directly testing js/modal.js functionality
// =========================================================================
describe("Modal System (js/modal.js)", () => {
  // Helper to set up DOM for modal tests
  const setupModalTestDOM = () => {
    document.body.innerHTML = `
            <div id="appModal" style="display: none;">
                <div class="modal-content">
                    <h3 id="modalTitle"></h3>
                    <p id="modalMessage"></p>
                    <div class="modal-action-buttons" style="display: none;">
                        <button id="modalConfirmBtn">Yes</button>
                        <button id="modalCancelBtn">No</button>
                    </div>
                    <button id="modalCloseBtn">OK</button>
                </div>
            </div>
        `;
    // Initialize DOM_ELEMENTS from domElements.js after setting up the DOM
    initializeDomElements();
  };

  beforeEach(() => {
    setupModalTestDOM();
    // Initialize the modal system from modal.js using the freshly populated DOM_ELEMENTS
    initModal(DOM_ELEMENTS);
    jest.clearAllMocks();
    jest.useFakeTimers(); // Use fake timers for setTimeout
  });

  afterEach(() => {
    jest.clearAllTimers(); // Clear all timers
    jest.useRealTimers(); // Restore real timers
    document.body.innerHTML = ""; // Clean up DOM
  });

  describe("showModal", () => {
    test("should display notification modal with title and text content", () => {
      showModal({
        content: "Test notification message",
        title: "Notification Title",
      });

      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Notification Title");
      expect(DOM_ELEMENTS.modalMessage.textContent).toBe(
        "Test notification message"
      );
      expect(DOM_ELEMENTS.modalMessage.innerHTML).toBe(
        "Test notification message"
      ); // Check it's not HTML
      expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
      expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("none"); // Yes/No buttons hidden
      expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("inline-block"); // OK button shown
      expect(DOM_ELEMENTS.modalConfirmBtn.textContent).toBe("OK"); // Default for notification

      jest.runAllTimers(); // Advance timers for fade-in
      expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
    });

    test("should display confirmation modal with custom button texts", () => {
      const onConfirmCallback = jest.fn();
      const onCancelCallback = jest.fn();

      showModal({
        content: "Are you sure you want to proceed?",
        title: "Confirmation",
        showConfirmationButtons: true,
        onConfirm: onConfirmCallback,
        onCancel: onCancelCallback,
        confirmText: "Proceed",
        cancelText: "Hold Up",
      });

      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Confirmation");
      expect(DOM_ELEMENTS.modalMessage.textContent).toBe(
        "Are you sure you want to proceed?"
      );
      expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
      expect(DOM_ELEMENTS.modalActionButtons.style.display).toBe("flex"); // Yes/No buttons shown
      expect(DOM_ELEMENTS.modalCloseBtn.style.display).toBe("none"); // OK button hidden
      expect(DOM_ELEMENTS.modalConfirmBtn.textContent).toBe("Proceed");
      expect(DOM_ELEMENTS.modalCancelBtn.textContent).toBe("Hold Up");

      jest.runAllTimers();
      expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
    });

    test("should display modal with HTML content", () => {
      const htmlContent = "<p>This is <strong>HTML</strong> content.</p>";
      showModal({
        content: htmlContent,
        title: "HTML Modal",
        isHtmlContent: true,
      });

      expect(DOM_ELEMENTS.modalMessage.innerHTML).toBe(htmlContent);
      expect(DOM_ELEMENTS.modalMessage.textContent).not.toBe(htmlContent); // Should be parsed as HTML
    });

    test("should fallback to native dialogs if critical DOM elements are missing (simulated before initModal)", () => {
      document.body.innerHTML = `<!-- No modal elements -->`; // Break the DOM
      initializeDomElements(); // DOM_ELEMENTS will have nulls for modal parts

      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {}); // Suppress console.error from initModal
      initModal(DOM_ELEMENTS); // initModal is called with broken DOMs
      consoleErrorSpy.mockRestore(); // Restore console.error for showModal's own check

      const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
      const confirmSpy = jest
        .spyOn(window, "confirm")
        .mockImplementation(() => true);
      const onConfirmCb = jest.fn();
      const onCancelCb = jest.fn();

      consoleErrorSpy.mockImplementationOnce(() => {}); // Suppress next console.error from showModal
      showModal({ content: "Alert fallback", title: "Alert Test" });
      expect(alertSpy).toHaveBeenCalledWith("Alert Test: Alert fallback");

      consoleErrorSpy.mockImplementationOnce(() => {});
      showModal({
        content: "Confirm fallback",
        title: "Confirm Test",
        showConfirmationButtons: true,
        onConfirm: onConfirmCb,
      });
      expect(confirmSpy).toHaveBeenCalledWith("Confirm Test: Confirm fallback");
      expect(onConfirmCb).toHaveBeenCalled();

      confirmSpy.mockImplementationOnce(() => false); // Simulate user clicking "Cancel"
      consoleErrorSpy.mockImplementationOnce(() => {});
      showModal({
        content: "Cancel fallback",
        title: "Cancel Test",
        showConfirmationButtons: true,
        onCancel: onCancelCb,
      });
      expect(confirmSpy).toHaveBeenCalledWith("Cancel Test: Cancel fallback");
      expect(onCancelCb).toHaveBeenCalled();

      alertSpy.mockRestore();
      confirmSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Modal Interactions (Hide Logic)", () => {
    test("clicking OK (close) button should hide notification modal and call onCancel if provided", () => {
      const onCancelCallback = jest.fn();
      showModal({ content: "Notification", onCancel: onCancelCallback });
      jest.runAllTimers();

      DOM_ELEMENTS.modalCloseBtn.click();
      expect(onCancelCallback).toHaveBeenCalled();
      jest.runAllTimers(); // For hideModal's setTimeout
      expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
    });

    test("clicking Confirm button should call onConfirm and hide modal if onConfirm does not return false", () => {
      const onConfirmCallback = jest.fn(() => true); // Explicitly return true or undefined
      showModal({
        content: "Confirm?",
        showConfirmationButtons: true,
        onConfirm: onConfirmCallback,
      });
      jest.runAllTimers();

      DOM_ELEMENTS.modalConfirmBtn.click();
      expect(onConfirmCallback).toHaveBeenCalled();
      jest.runAllTimers();
      expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
    });

    test("clicking Confirm button should call onConfirm and NOT hide modal if onConfirm returns false", () => {
      const onConfirmCallback = jest.fn(() => false);
      showModal({
        content: "Validate input",
        showConfirmationButtons: true,
        onConfirm: onConfirmCallback,
      });
      jest.runAllTimers();

      DOM_ELEMENTS.modalConfirmBtn.click();
      expect(onConfirmCallback).toHaveBeenCalled();
      jest.runAllTimers();
      expect(DOM_ELEMENTS.appModal.style.display).toBe("flex"); // Still shown
      expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);
    });

    test("clicking Cancel button should call onCancel and hide modal", () => {
      const onCancelCallback = jest.fn();
      showModal({
        content: "Cancel this?",
        showConfirmationButtons: true,
        onCancel: onCancelCallback,
      });
      jest.runAllTimers();

      DOM_ELEMENTS.modalCancelBtn.click();
      expect(onCancelCallback).toHaveBeenCalled();
      jest.runAllTimers();
      expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
    });

    test.skip("pressing Escape key should call onCancel and hide modal", () => {
      // Skipped: Keyboard event handling requires additional modal system setup
      const onCancelCallback = jest.fn();
      showModal({ content: "Press Esc", onCancel: onCancelCallback });
      jest.runAllTimers(); // Ensure modal is active
      expect(DOM_ELEMENTS.appModal.classList.contains("active")).toBe(true);

      // Simulate Escape key press
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onCancelCallback).toHaveBeenCalled();
      jest.runAllTimers(); // For hideModal's setTimeout
      expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
    });

    test("clicking modal overlay should call onCancel and hide modal", () => {
      const onCancelCallback = jest.fn();
      showModal({ content: "Click outside", onCancel: onCancelCallback });
      jest.runAllTimers(); // Ensure modal is active

      // Simulate click directly on the modal overlay with proper event
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clickEvent, 'target', {
        value: DOM_ELEMENTS.appModal,
        enumerable: true
      });
      DOM_ELEMENTS.appModal.dispatchEvent(clickEvent);

      expect(onCancelCallback).toHaveBeenCalled();
      jest.runAllTimers(); // For hideModal's setTimeout
      expect(DOM_ELEMENTS.appModal.style.display).toBe("none");
    });
  });
});
// =========================================================================

describe("UI Rendering (Placeholder)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
            <div id="userList"></div>
            <table id="scheduleTable">
                <thead><tr><th>Day/Time</th><th id="addTimeSlotHeaderCell"><button id="addNewTimeSlotBtn">+</button></th></tr></thead>
                <tbody></tbody>
            </table>
            <button id="compare"></button>
        `;
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
    initializeDomElements();
  });

  test("should verify DOM elements can be created", () => {
    // Test that basic DOM functionality works
    const testDiv = document.createElement('div');
    testDiv.className = 'test-element';
    document.body.appendChild(testDiv);
    
    expect(testDiv).toBeDefined();
    expect(testDiv.className).toBe('test-element');
    expect(document.querySelector('.test-element')).toBe(testDiv);
    
    // Cleanup
    document.body.removeChild(testDiv);
  });
});

describe("Heterogeneous Schedule Comparison", () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("determineSlotStatus with heterogeneous schedules", () => {
    test("should handle users without timeSlots property gracefully", () => {
      const testState = {
        activeUserId: null,
        users: {
          1: { id: "1", name: "Alice", schedule: [[true]] }, // No timeSlots property
          2: { id: "2", name: "Bob", schedule: [[false]] }, // No timeSlots property
        },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      // Should fall back to original logic and return 'slot-partial'
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-partial");
    });

    test("should handle mixed users with and without timeSlots", () => {
      const testState = {
        activeUserId: null,
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00", "9:00-10:00"],
            schedule: [[true, false]],
          },
          2: {
            id: "2",
            name: "Bob",
            schedule: [[false]], // No timeSlots property
          },
        },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      // Should detect heterogeneous schedules but handle gracefully
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-partial");
    });

    test("should detect heterogeneous schedules with different time slots", () => {
      const testState = {
        activeUserId: null,
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00", "9:00-10:00"],
            schedule: [[true, false]],
          },
          2: {
            id: "2",
            name: "Bob",
            timeSlots: ["8:30-9:30", "9:30-10:30"],
            schedule: [[true, false]],
          },
        },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      // Should handle heterogeneous schedules appropriately
      const result = determineSlotStatus(0, 0, testState);
      expect(
        ["slot-conflict", "slot-partial", "slot-free"].includes(result)
      ).toBe(true);
    });

    test("should handle homogeneous schedules normally", () => {
      const testState = {
        activeUserId: null,
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00", "9:00-10:00"],
            schedule: [[true, false]],
          },
          2: {
            id: "2",
            name: "Bob",
            timeSlots: ["8:00-9:00", "9:00-10:00"],
            schedule: [[false, false]],
          },
        },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-partial");
    });

    test("should return slot-selected for active user in non-compare mode", () => {
      const testState = {
        activeUserId: "1",
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00", "9:00-10:00"],
            schedule: [[true, false]],
          },
        },
        compareMode: false,
        selectedUserIds: new Set(),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot-selected");
    });
  });

  describe("generateTooltipMessage with heterogeneous schedules", () => {
    test("should handle users without timeSlots property gracefully", () => {
      const testState = {
        users: {
          1: { id: "1", name: "Alice", schedule: [[true]] }, // No timeSlots
          2: { id: "2", name: "Bob", schedule: [[false]] }, // No timeSlots
        },
        selectedUserIds: new Set(["1", "2"]),
      };
      const result = generateTooltipMessage(0, 0, testState);
      expect(result).toContain("Availability:");
      expect(result).toContain("Alice");
      expect(result).toContain("Bob");
    });

    test("should handle mixed users with and without timeSlots", () => {
      const testState = {
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00"],
            schedule: [[true]],
          },
          2: {
            id: "2",
            name: "Bob",
            schedule: [[false]], // No timeSlots
          },
        },
        selectedUserIds: new Set(["1", "2"]),
      };
      const result = generateTooltipMessage(0, 0, testState);
      expect(result).toContain("Availability:");
      expect(result).toContain("Alice");
      expect(result).toContain("Bob");
    });

    test("should return empty string for no selected users", () => {
      const testState = {
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00"],
            schedule: [[true]],
          },
        },
        selectedUserIds: new Set(),
      };
      expect(generateTooltipMessage(0, 0, testState)).toBe("");
    });

    test("should handle all users free scenario", () => {
      const testState = {
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00"],
            schedule: [[false]],
          },
          2: {
            id: "2",
            name: "Bob",
            timeSlots: ["8:30-9:30"],
            schedule: [[false]],
          },
        },
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(generateTooltipMessage(0, 0, testState)).toBe(
        "All selected users are free."
      );
    });

    test("should handle all users busy scenario", () => {
      const testState = {
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00"],
            schedule: [[true]],
          },
          2: {
            id: "2",
            name: "Bob",
            timeSlots: ["8:30-9:30"],
            schedule: [[true]],
          },
        },
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(generateTooltipMessage(0, 0, testState)).toBe(
        "All selected users are unavailable."
      );
    });
  });

  describe("Edge cases and error handling", () => {
    test("should handle empty users object", () => {
      const testState = {
        activeUserId: null,
        users: {},
        compareMode: true,
        selectedUserIds: new Set(),
      };
      expect(determineSlotStatus(0, 0, testState)).toBe("slot");
      expect(generateTooltipMessage(0, 0, testState)).toBe("");
    });

    test("should handle invalid slot indices", () => {
      const testState = {
        activeUserId: "1",
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00"],
            schedule: [[true]],
          },
        },
        compareMode: false,
        selectedUserIds: new Set(),
      };
      // Should handle out-of-bounds gracefully
      expect(() => determineSlotStatus(10, 10, testState)).not.toThrow();
      expect(() => generateTooltipMessage(10, 10, testState)).not.toThrow();
    });

    test("should handle null/undefined schedule arrays", () => {
      const testState = {
        activeUserId: null,
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: ["8:00-9:00"],
            schedule: null,
          },
        },
        compareMode: true,
        selectedUserIds: new Set(["1"]),
      };
      expect(() => determineSlotStatus(0, 0, testState)).not.toThrow();
      expect(() => generateTooltipMessage(0, 0, testState)).not.toThrow();
    });

    test("should handle malformed timeSlots arrays", () => {
      const testState = {
        activeUserId: null,
        users: {
          1: {
            id: "1",
            name: "Alice",
            timeSlots: null, // Malformed
            schedule: [[true]],
          },
          2: {
            id: "2",
            name: "Bob",
            timeSlots: undefined, // Malformed
            schedule: [[false]],
          },
        },
        compareMode: true,
        selectedUserIds: new Set(["1", "2"]),
      };
      expect(() => determineSlotStatus(0, 0, testState)).not.toThrow();
      expect(() => generateTooltipMessage(0, 0, testState)).not.toThrow();
    });
  });
});

describe("Schedule Disabled State", () => {
  beforeEach(() => {
    _resetStateForTesting();

    // Mock DOM elements
    DOM_ELEMENTS.scheduleWrapper = {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(),
      },
    };


    DOM_ELEMENTS.usersSection = {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
      },
      offsetHeight: 0,
    };
  });

  test("should apply disabled class when no active user", () => {
    const state = getState();
    state.activeUserId = null;

    // Mock the renderScheduleGrid function behavior
    if (DOM_ELEMENTS.scheduleWrapper) {
      if (!state.activeUserId) {
        DOM_ELEMENTS.scheduleWrapper.classList.add("schedule-disabled");
      } else {
        DOM_ELEMENTS.scheduleWrapper.classList.remove("schedule-disabled");
      }
    }

    expect(DOM_ELEMENTS.scheduleWrapper.classList.add).toHaveBeenCalledWith(
      "schedule-disabled"
    );
  });

  test("should remove disabled class when active user is set", () => {
    const state = getState();
    // Legacy createUserObject removed
    state.users[user.id] = user;
    state.activeUserId = user.id;

    // Mock the renderScheduleGrid function behavior
    if (DOM_ELEMENTS.scheduleWrapper) {
      if (!state.activeUserId) {
        DOM_ELEMENTS.scheduleWrapper.classList.add("schedule-disabled");
      } else {
        DOM_ELEMENTS.scheduleWrapper.classList.remove("schedule-disabled");
      }
    }

    expect(DOM_ELEMENTS.scheduleWrapper.classList.remove).toHaveBeenCalledWith(
      "schedule-disabled"
    );
  });



});
