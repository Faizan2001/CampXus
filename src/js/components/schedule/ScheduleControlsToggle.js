// ScheduleControlsToggle.js
// Lightweight delegated toggle for the mobile schedule controls bar.
// Exported init ensures it's only bound once per session.

let bound = false;

export function initScheduleControlsToggle() {
  if (bound) return;
  bound = true;

  const CLOSE_EVENTS = ["spa:navigation"]; // auto-close on navigation

  const closeBar = () => {
    const toggleBtn = document.getElementById("scheduleControlsToggle");
    const bar = document.getElementById("scheduleControlsBar");
    if (toggleBtn && bar && toggleBtn.getAttribute("aria-expanded") === "true") {
      toggleBtn.setAttribute("aria-expanded", "false");
      bar.classList.remove("expanded");
      // Remove focus to clear glow styles when closed
      try { toggleBtn.blur(); } catch(_) {}
      // If pin mode is active, turn it off (state managed in HomePage.js)
      try {
        const event = new CustomEvent('scheduleControls:closed');
        document.dispatchEvent(event);
      } catch(_) {}
    }
  };

  const openBar = () => {
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
  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest('#scheduleControlsToggle');
    if (toggleBtn) {
      e.stopPropagation();
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      expanded ? closeBar() : openBar();
      return;
    }
    const bar = document.getElementById("scheduleControlsBar");
    const realToggle = document.getElementById("scheduleControlsToggle");
    if (bar && realToggle && realToggle.getAttribute("aria-expanded") === "true") {
      if (!bar.contains(e.target)) closeBar();
    }
  });

  // Keyboard interactions
  document.addEventListener("keydown", (e) => {
    const toggleBtn = document.getElementById("scheduleControlsToggle");
    if (!toggleBtn) return;
    if (e.key === "Escape") {
      closeBar();
    } else if ((e.key === "Enter" || e.key === " ") && document.activeElement === toggleBtn) {
      e.preventDefault();
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      expanded ? closeBar() : openBar();
    }
  });

  // Auto-close on navigation events
  CLOSE_EVENTS.forEach(evt => {
    document.addEventListener(evt, closeBar);
  });
}
