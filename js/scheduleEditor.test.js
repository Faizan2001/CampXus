// js/scheduleEditor.test.js
import { jest } from "@jest/globals";

// Functions from script.js (exported directly by their original names)
import {
  handleTimeSlotHeaderClick,
  openEditTimeSlotModal,
  processTimeSlotEdit,
  getState,
  _setStateForTesting,
  _resetStateForTesting,
} from "./script.js";

// Modules needed for setup
import { DEFAULT_TIMESLOTS, LOCAL_STORAGE_KEY } from "./constants.js";
import { DOM_ELEMENTS, initializeDomElements } from "./domElements.js";
import { initModal } from "./modal.js";

// Helper function to set up a comprehensive DOM structure
const setupBaseTestDOM = () => {
  document.body.innerHTML = `
        <input id="userName" />
        <input id="userId" />
        <div class="add-user"><button>Add User</button></div>
        <div id="userList"></div>
        <table id="scheduleTable">
            <thead><tr><th>Day/Time</th><th id="addTimeSlotHeaderCell"><button id="addNewTimeSlotBtn">+</button></th></tr></thead>
            <tbody></tbody>
        </table>
        <button id="compare"></button>
        <div id="slotTooltip" style="display: none;"></div>
        <textarea id="importText"></textarea>
        <div class="export-import"><button>Export</button><button>Import</button></div>
        <div id="appModal" style="display: none;">
            <div class="modal-content">
                <h3 id="modalTitle"></h3>
                <div id="modalMessage"></div>
                <div id="modalActionButtons" style="display: none;">
                    <button id="modalConfirmBtn"></button>
                    <button id="modalCancelBtn"></button>
                </div>
                <button id="modalCloseBtn"></button>
            </div>
        </div>
    `;
  initializeDomElements();
  if (DOM_ELEMENTS.appModal && DOM_ELEMENTS.modalContent) {
    initModal(DOM_ELEMENTS);
  } else {
    console.error(
      "scheduleEditor.test.js: CRITICAL modal elements for initModal not found."
    );
  }
};

describe("Phase 3: Time Slot Header Editing (Mock-less)", () => {
  beforeEach(() => {
    _resetStateForTesting();
    localStorage.clear();
    document.body.innerHTML = "";
    setupBaseTestDOM();
    jest.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("handleTimeSlotHeaderClick", () => {
    let mockEvent;
    let userTimeSlots;

    beforeEach(() => {
      userTimeSlots = [{ start: "08:00", end: "09:00", label: "08:00-09:00" }];
      _setStateForTesting({
        activeUserId: "user1",
        users: {
          user1: {
            id: "user1",
            name: "Test User",
            timeSlots: userTimeSlots,
            schedule: [],
          },
        },
      });
      mockEvent = { currentTarget: { dataset: {} } };
    });

    test("should display edit modal with correct data for valid slot click", () => {
      mockEvent.currentTarget.dataset.slotIndex = "0";
      handleTimeSlotHeaderClick(mockEvent); // Calling the imported function directly
      jest.runAllTimers();

      expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Edit Time Slot");
      const modalMessageContent = DOM_ELEMENTS.modalMessage.innerHTML;
      expect(modalMessageContent).toContain(
        "<p>Current: <strong>08:00-09:00</strong></p>"
      );
      expect(document.getElementById("edit-slot-start-time")?.value).toBe(
        "08:00"
      ); // Check input value
    });

    test("should show error modal if slotIndex is missing from dataset", () => {
      // mockEvent.currentTarget.dataset.slotIndex is already undefined or missing
      handleTimeSlotHeaderClick(mockEvent);
      jest.runAllTimers();
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Error");
      expect(DOM_ELEMENTS.modalMessage.textContent).toContain(
        "Slot index missing"
      );
    });

    test("should show error modal if slotIndex is not a number", () => {
      mockEvent.currentTarget.dataset.slotIndex = "abc";
      handleTimeSlotHeaderClick(mockEvent);
      jest.runAllTimers();
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Error");
      expect(DOM_ELEMENTS.modalMessage.textContent).toContain(
        "Invalid slot index provided. Must be a number."
      );
    });

    test("should show error modal if active user has no timeSlots array", () => {
      _setStateForTesting({
        activeUserId: "user1",
        users: { user1: { id: "user1", name: "Test User", schedule: [] } }, // No timeSlots
      });
      mockEvent.currentTarget.dataset.slotIndex = "0";
      handleTimeSlotHeaderClick(mockEvent);
      jest.runAllTimers();
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Error");
      expect(DOM_ELEMENTS.modalMessage.textContent).toContain(
        "selected time slot could not be found"
      );
    });

    test("should show error modal if active user has empty timeSlots array", () => {
      _setStateForTesting({
        activeUserId: "user1",
        users: {
          user1: {
            id: "user1",
            name: "Test User",
            timeSlots: [],
            schedule: [],
          },
        },
      });
      mockEvent.currentTarget.dataset.slotIndex = "0";
      handleTimeSlotHeaderClick(mockEvent);
      jest.runAllTimers();
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Error");
      expect(DOM_ELEMENTS.modalMessage.textContent).toContain(
        "selected time slot could not be found"
      );
    });
    test("should show error modal if no active user is set", () => {
      _setStateForTesting({ activeUserId: null, users: {} });
      mockEvent.currentTarget.dataset.slotIndex = "0"; // Ensure slotIndex is set
      handleTimeSlotHeaderClick(mockEvent); // mockEvent still has slotIndex: '0' but no active user
      jest.runAllTimers();
      expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Error");
      expect(DOM_ELEMENTS.modalMessage.textContent).toContain(
        "No active user selected"
      );
    });

    test("should show error modal if slotIndex is out of bounds for user timeSlots", () => {
      // User has 1 slot (index 0)
      mockEvent.currentTarget.dataset.slotIndex = "1"; // Invalid index
      handleTimeSlotHeaderClick(mockEvent);
      jest.runAllTimers();
      expect(DOM_ELEMENTS.appModal.style.display).toBe("flex");
      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Error");
      expect(DOM_ELEMENTS.modalMessage.textContent).toContain(
        "selected time slot could not be found"
      );
    });
  });

  describe("openEditTimeSlotModal", () => {
    test("should correctly populate and show the modal with different slot data", () => {
      const activeUser = {
        id: "user2",
        name: "Another User",
        timeSlots: [{ start: "14:00", end: "15:30", label: "14:00-15:30" }],
      };
      openEditTimeSlotModal(0, activeUser); // Calling imported function directly
      jest.runAllTimers();

      expect(DOM_ELEMENTS.modalTitle.textContent).toBe("Edit Time Slot");
      const modalMessageContent = DOM_ELEMENTS.modalMessage.innerHTML;
      expect(modalMessageContent).toContain(
        "<p>Current: <strong>14:00-15:30</strong></p>"
      );
      expect(document.getElementById("edit-slot-start-time")?.value).toBe(
        "14:00"
      );
      expect(document.getElementById("edit-slot-end-time")?.value).toBe(
        "15:30"
      );
    });
  });

  describe("processTimeSlotEdit", () => {
    let activeUserObject;
    let slotIndexToEdit;

    // Helper to set values for the global edit form inputs
    const setEditFormInputValues = (startVal, endVal) => {
      const startTimeInput = document.getElementById("edit-slot-start-time");
      const endTimeInput = document.getElementById("edit-slot-end-time");
      const errorDiv = document.getElementById("edit-slot-error-message");

      if (startTimeInput) {
        startTimeInput.value = startVal;
        startTimeInput.classList.remove("input-error");
      } else {
        // console.error("setEditFormInputValues: edit-slot-start-time not found during test.");
      }

      if (endTimeInput) {
        endTimeInput.value = endVal;
        endTimeInput.classList.remove("input-error");
      } else {
        // console.error("setEditFormInputValues: edit-slot-end-time not found during test.");
      }

      if (errorDiv) {
        errorDiv.textContent = "";
        errorDiv.style.display = "none";
      }
    };

    beforeEach(() => {
      const userTimeSlots = [
        { start: "08:00", end: "09:00", label: "08:00-09:00" },
        { start: "10:00", end: "11:00", label: "10:00-11:00" },
        { start: "12:00", end: "13:00", label: "12:00-13:00" },
      ];
      activeUserObject = {
        id: "userEdit",
        name: "Edit User",
        timeSlots: JSON.parse(JSON.stringify(userTimeSlots)),
        schedule: [],
      };
      _setStateForTesting({
        activeUserId: "userEdit",
        users: { userEdit: activeUserObject },
      });
      slotIndexToEdit = 1;
      // Modal opening and input setting will be done in each test
    });

    test("should update state, localStorage, and return true for valid inputs", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("10:15", "11:15");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(true);

      const updatedSlots = getState().users["userEdit"].timeSlots;
      expect(updatedSlots[slotIndexToEdit]).toEqual({
        start: "10:15",
        end: "11:15",
        label: "10:15-11:15",
      });
      expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toContain("10:15-11:15");
      expect(
        document.getElementById("edit-slot-error-message").style.display
      ).toBe("none");
    });

    test("should not update if new times are identical to old times", () => {
      const originalTimeSlots = JSON.parse(
        JSON.stringify(activeUserObject.timeSlots)
      );
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject); // Open modal
      jest.runAllTimers();
      // Inputs are already set to original values by openEditTimeSlotModal
      // and the default values in its HTML.
      // We can explicitly set them if needed to be sure, but openEditTimeSlotModal should handle it.
      setEditFormInputValues(
        activeUserObject.timeSlots[slotIndexToEdit].start,
        activeUserObject.timeSlots[slotIndexToEdit].end
      );

      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(true);

      const finalState = getState().users["userEdit"].timeSlots;
      expect(finalState).toEqual(originalTimeSlots);
    });

    test("should display error in DOM and return false if start time is empty", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("", "11:00");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain("required");
      expect(
        document
          .getElementById("edit-slot-start-time")
          .classList.contains("input-error")
      ).toBe(true);
    });

    test("should display error in DOM and return false if end time is empty", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("10:00", "");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain("required");
      expect(
        document
          .getElementById("edit-slot-end-time")
          .classList.contains("input-error")
      ).toBe(true);
    });

    test("should display error for invalid start time format and return false", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("abc", "11:00");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain('Invalid Start Time: "abc"');
    });

    test("should display error for invalid end time format and return false", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("10:00", "xyz");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain('Invalid End Time: "xyz"');
    });

    test('should correctly process "H:MM" input, update state, and return true', () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("9:15", "9:45"); // Changed input values
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(true);
      const updatedSlots = getState().users["userEdit"].timeSlots;
      expect(updatedSlots[slotIndexToEdit].start).toBe("09:15"); // Updated assertion
      expect(updatedSlots[slotIndexToEdit].end).toBe("09:45"); // Updated assertion
      expect(updatedSlots[slotIndexToEdit].label).toBe("09:15-09:45"); // Updated assertion
    });

    test("should display error if start time not before end time and return false", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("11:30", "10:15");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain("must be strictly before");
    });

    test("should display error on conflict with previous slot and return false", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("08:30", "09:30"); // Conflicts with 08:00-09:00
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain("must be after previous slot's end (09:00)");
    });

    test("should display error on conflict with next slot and return false", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("11:30", "12:30"); // Conflicts with 12:00-13:00
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain("must be before next slot's start (12:00)");
    });

    test("should allow editing first slot without previous conflict error", () => {
      slotIndexToEdit = 0;
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("07:00", "07:30");

      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(true);
      expect(getState().users["userEdit"].timeSlots[0].label).toBe(
        "07:00-07:30"
      );
    });

    test("should allow editing last slot without next conflict error", () => {
      slotIndexToEdit = activeUserObject.timeSlots.length - 1;
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("13:30", "14:00");

      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(true);
      expect(
        getState().users["userEdit"].timeSlots[slotIndexToEdit].label
      ).toBe("13:30-14:00");
    });

    test("should show error and return false for start time as just spaces", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("   ", "11:00");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(false);
      expect(
        document.getElementById("edit-slot-error-message").textContent
      ).toContain("required");
    });

    test("should successfully update slot with valid inputs that have spaces", () => {
      openEditTimeSlotModal(slotIndexToEdit, activeUserObject);
      jest.runAllTimers();
      setEditFormInputValues("  10:30  ", "  11:45  ");
      const result = processTimeSlotEdit(slotIndexToEdit, activeUserObject);
      expect(result).toBe(true);
      const updatedSlots = getState().users["userEdit"].timeSlots;
      expect(updatedSlots[slotIndexToEdit].label).toBe("10:30-11:45");
    });
  });
});
