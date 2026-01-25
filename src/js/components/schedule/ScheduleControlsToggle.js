// ScheduleControlsToggle.js
// Lightweight delegated toggle for the mobile schedule controls bar.
// Exported init ensures it's only bound once per session.

let bound = false;
let closeBar = null;
let openBar = null;
let handleDocumentClick = null;
let handleDocumentKeydown = null;
let handleNavigationEvent = null;
const CLOSE_EVENTS = ["spa:navigation"]; // auto-close on navigation

export function initScheduleControlsToggle() {
  if (bound) return;
  bound = true;

  closeBar = () => {
    const toggleBtn = document.getElementById("scheduleControlsToggle");
    const bar = document.getElementById("scheduleControlsBar");
    if (toggleBtn && bar && toggleBtn.getAttribute("aria-expanded") === "true") {
      toggleBtn.setAttribute("aria-expanded", "false");
      bar.classList.remove("expanded");
      // Remove focus to clear glow styles when closed
      try {
        toggleBtn.blur();
      } catch (err) {
        try {
          logManager?.dev?.debug?.("Toggle button blur failed", err);
        } catch (error) { console.debug("Suppressed error", error); }
      }
      // If pin mode is active, turn it off (state managed in HomePage.js)
      try {
        const event = new CustomEvent("scheduleControls:closed");
        document.dispatchEvent(event);
      } catch (error) { console.debug("Suppressed error", error); }
    }
  };

  openBar = () => {
    const toggleBtn = document.getElementById("scheduleControlsToggle");
    const bar = document.getElementById("scheduleControlsBar");
    if (toggleBtn && bar && toggleBtn.getAttribute("aria-expanded") === "false") {
      toggleBtn.setAttribute("aria-expanded", "true");
      bar.classList.add("expanded");
      setTimeout(() => {
        const first = bar.querySelector('.control-btn');
        if (first) first.focus();
      }, 180);
      try {
        document.dispatchEvent(
          new CustomEvent("scheduleControls:opened", {
            detail: { trigger: "user" },
          })
        );
      } catch (_) {
        /* ignore */
      }
    }
  };

  // Delegated click handling
  handleDocumentClick = (e) => {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (!target) return;

    const toggleBtn = target.closest("#scheduleControlsToggle");
    if (toggleBtn) {
      e.stopPropagation();
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      expanded ? closeBar() : openBar();
      return;
    }
    const bar = document.getElementById("scheduleControlsBar");
    const realToggle = document.getElementById("scheduleControlsToggle");
    if (bar && realToggle && realToggle.getAttribute("aria-expanded") === "true") {
      if (!bar.contains(target)) closeBar();
    }
  };
  document.addEventListener("click", handleDocumentClick);

  // Keyboard interactions
  handleDocumentKeydown = (e) => {
    const toggleBtn = document.getElementById("scheduleControlsToggle");
    if (!toggleBtn) return;
    if (e.key === "Escape") {
      closeBar();
    } else if ((e.key === "Enter" || e.key === " ") && document.activeElement === toggleBtn) {
      e.preventDefault();
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      expanded ? closeBar() : openBar();
    }
  };
  document.addEventListener("keydown", handleDocumentKeydown);

  // Auto-close on navigation events
  handleNavigationEvent = () => closeBar?.();
  CLOSE_EVENTS.forEach((evt) => {
    document.addEventListener(evt, handleNavigationEvent);
  });
}

export function destroyScheduleControlsToggle() {
  if (!bound) return;

  try {
    if (handleDocumentClick) {
      document.removeEventListener("click", handleDocumentClick);
    }
  } catch (error) { console.debug("Suppressed error", error); }

  try {
    if (handleDocumentKeydown) {
      document.removeEventListener("keydown", handleDocumentKeydown);
    }
  } catch (error) { console.debug("Suppressed error", error); }

  try {
    if (handleNavigationEvent) {
      CLOSE_EVENTS.forEach((evt) => {
        document.removeEventListener(evt, handleNavigationEvent);
      });
    }
  } catch (error) { console.debug("Suppressed error", error); }

  bound = false;
  closeBar = null;
  openBar = null;
  handleDocumentClick = null;
  handleDocumentKeydown = null;
  handleNavigationEvent = null;
}
