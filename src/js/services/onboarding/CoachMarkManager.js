/**
 * CoachMarkManager
 * Lightweight helper for anchored onboarding tips with glassmorphism styling.
 * Provides responsive placement, HTML content support, and a promise that
 * resolves when the mark closes so callers can chain hints sequentially.
 */

const ACTIVE_MARKS = new Map();
const DEFAULT_OFFSET = 16;
const MOBILE_BREAKPOINT = 768;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildId(requestedId) {
  return (
    requestedId ||
    `coachmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function isElementVisible(element) {
  if (!element || !(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolvePlacement(basePlacement = "auto", responsivePlacement = {}) {
  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT}px)`
  ).matches;

  if (isMobile && responsivePlacement.mobile) {
    return responsivePlacement.mobile;
  }
  if (!isMobile && responsivePlacement.desktop) {
    return responsivePlacement.desktop;
  }
  return basePlacement;
}

function computeAutoPlacement(targetRect, cardRect, offset) {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  const spaces = {
    top: targetRect.top,
    bottom: viewportHeight - targetRect.bottom,
    left: targetRect.left,
    right: viewportWidth - targetRect.right,
  };

  const neededHeight = cardRect.height + offset * 2;
  const neededWidth = cardRect.width + offset * 2;

  if (spaces.bottom >= neededHeight) return "bottom";
  if (spaces.top >= neededHeight) return "top";
  if (spaces.right >= neededWidth) return "right";
  if (spaces.left >= neededWidth) return "left";
  return "bottom";
}

function applyArrowPosition(card, arrow, placement, targetRect) {
  arrow.style.removeProperty("top");
  arrow.style.removeProperty("bottom");
  arrow.style.removeProperty("left");
  arrow.style.removeProperty("right");
  arrow.style.borderLeft = "1px solid rgba(99, 102, 241, 0.45)";
  arrow.style.borderTop = "1px solid rgba(99, 102, 241, 0.45)";
  arrow.style.borderRight = "none";
  arrow.style.borderBottom = "none";

  const cardRect = card.getBoundingClientRect();
  const arrowSize = arrow.getBoundingClientRect().width || 16;
  const minInset = 10;

  switch (placement) {
    case "top":
      arrow.style.bottom = "-8px";
      arrow.style.borderLeft = "none";
      arrow.style.borderTop = "none";
      arrow.style.borderRight = "1px solid rgba(99, 102, 241, 0.45)";
      arrow.style.borderBottom = "1px solid rgba(99, 102, 241, 0.45)";
      {
        const preferredLeft =
          targetRect.left + targetRect.width / 2 - cardRect.left - arrowSize / 2;
        const maxLeft = cardRect.width - arrowSize - minInset;
        arrow.style.left = `${clamp(
          preferredLeft,
          minInset,
          Math.max(minInset, maxLeft)
        )}px`;
      }
      break;
    case "left":
      arrow.style.right = "-8px";
      arrow.style.borderLeft = "none";
      arrow.style.borderRight = "1px solid rgba(99, 102, 241, 0.45)";
      {
        const preferredTop =
          targetRect.top + targetRect.height / 2 - cardRect.top - arrowSize / 2;
        const maxTop = cardRect.height - arrowSize - minInset;
        arrow.style.top = `${clamp(
          preferredTop,
          minInset,
          Math.max(minInset, maxTop)
        )}px`;
      }
      break;
    case "right":
      arrow.style.left = "-8px";
      arrow.style.borderTop = "none";
      arrow.style.borderBottom = "1px solid rgba(99, 102, 241, 0.45)";
      {
        const preferredTop =
          targetRect.top + targetRect.height / 2 - cardRect.top - arrowSize / 2;
        const maxTop = cardRect.height - arrowSize - minInset;
        arrow.style.top = `${clamp(
          preferredTop,
          minInset,
          Math.max(minInset, maxTop)
        )}px`;
      }
      break;
    default:
      arrow.style.top = "-8px";
      {
        const preferredLeft =
          targetRect.left + targetRect.width / 2 - cardRect.left - arrowSize / 2;
        const maxLeft = cardRect.width - arrowSize - minInset;
        arrow.style.left = `${clamp(
          preferredLeft,
          minInset,
          Math.max(minInset, maxLeft)
        )}px`;
      }
      break;
  }

  card.classList.remove(
    "coachmark-placement-top",
    "coachmark-placement-bottom",
    "coachmark-placement-left",
    "coachmark-placement-right"
  );
  card.classList.add(`coachmark-placement-${placement}`);
}

export function showCoachMark(options = {}) {
  const {
    id: requestedId,
    target,
    title = "",
    description = "",
    descriptionHtml = "",
    placement: requestedPlacement = "auto",
    responsivePlacement,
    offset = DEFAULT_OFFSET,
    highlightShape = "rounded",
    highlight = true,
    primaryButton,
    secondaryButton,
    dismissOnBackdrop = false,
    onPrimary,
    onSecondary,
    onClose,
    autoFocusPrimary = false,
    maxWidth,
  } = options;

  if (!isElementVisible(target)) {
    return null;
  }

  const id = buildId(requestedId);

  if (ACTIVE_MARKS.has(id)) {
    ACTIVE_MARKS.get(id).close("replaced");
  }

  const overlay = document.createElement("div");
  overlay.className = "coachmark-overlay";
  overlay.dataset.coachmarkId = id;

  const card = document.createElement("div");
  card.className = "coachmark-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-live", "polite");
  card.style.pointerEvents = "auto";
  if (maxWidth) {
    card.style.maxWidth = `${maxWidth}px`;
  }
  overlay.appendChild(card);

  const arrow = document.createElement("div");
  arrow.className = "coachmark-arrow";
  card.appendChild(arrow);

  // Scrollable body container to avoid clipping the arrow
  const body = document.createElement("div");
  body.className = "coachmark-body";
  card.appendChild(body);

  if (title) {
    const heading = document.createElement("h4");
    heading.textContent = title;
    body.appendChild(heading);
  }

  if (descriptionHtml) {
    const wrapper = document.createElement("div");
    wrapper.className = "coachmark-html";
    wrapper.innerHTML = descriptionHtml;
    body.appendChild(wrapper);
  } else if (description) {
    const paragraph = document.createElement("p");
    paragraph.textContent = description;
    body.appendChild(paragraph);
  }

  const actions = document.createElement("div");
  actions.className = "coachmark-actions";
  body.appendChild(actions);

  let resolveClose;
  const waitForClose = new Promise((resolve) => {
    resolveClose = resolve;
  });

  let closed = false;
  const destroyers = [];

  const close = (reason = "dismiss") => {
    if (closed) return;
    closed = true;

    destroyers.forEach((cleanup) => {
      try {
        cleanup();
      } catch (_) {
        /* ignore */
      }
    });

    target.classList.remove("coachmark-highlight", "coachmark-circle");
    overlay.classList.remove("active");
    requestAnimationFrame(() => overlay.remove());
    ACTIVE_MARKS.delete(id);

    if (typeof onClose === "function") {
      try {
        onClose(reason);
      } catch (_) {
        /* ignore */
      }
    }
    resolveClose({ reason, id });
  };

  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "coachmark-btn primary";
  primary.textContent = primaryButton?.text || "Got it";
  primary.addEventListener("click", () => {
    if (typeof onPrimary === "function") {
      try {
        onPrimary();
      } catch (_) {
        /* ignore */
      }
    }
    close("primary");
  });
  actions.appendChild(primary);

  if (secondaryButton) {
    const secondary = document.createElement("button");
    secondary.type = "button";
    secondary.className = "coachmark-btn secondary";
    secondary.textContent = secondaryButton.text || "Skip";
    secondary.addEventListener("click", () => {
      if (typeof onSecondary === "function") {
        try {
          onSecondary();
        } catch (_) {
          /* ignore */
        }
      }
      close("secondary");
    });
    actions.prepend(secondary);
  }

  const interceptPointer = (event) => {
    if (!card.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  overlay.addEventListener("pointerdown", interceptPointer, true);
  overlay.addEventListener("pointerup", interceptPointer, true);
  overlay.addEventListener("click", interceptPointer, true);
  destroyers.push(() => {
    overlay.removeEventListener("pointerdown", interceptPointer, true);
    overlay.removeEventListener("pointerup", interceptPointer, true);
    overlay.removeEventListener("click", interceptPointer, true);
  });

  if (dismissOnBackdrop) {
    const outsideHandler = (event) => {
      if (!card.contains(event.target) && !target.contains(event.target)) {
        event.stopPropagation();
        close("backdrop");
      }
    };
    overlay.addEventListener("pointerdown", outsideHandler, true);
    destroyers.push(() =>
      overlay.removeEventListener("pointerdown", outsideHandler, true)
    );
  }

  const keyHandler = (event) => {
    if (event.key === "Escape") {
      close("escape");
    }
  };
  document.addEventListener("keydown", keyHandler);
  destroyers.push(() => document.removeEventListener("keydown", keyHandler));

  if (highlight) {
    const highlightClasses = ["coachmark-highlight"];
    if ((highlightShape || "") === "circle") {
      highlightClasses.push("coachmark-circle");
    }
    highlightClasses.forEach((cls) => target.classList.add(cls));
    destroyers.push(() =>
      highlightClasses.forEach((cls) => target.classList.remove(cls))
    );
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("active"));

  const updatePosition = () => {
    if (!isElementVisible(target)) {
      close("target-hidden");
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const resolvedPlacement = (() => {
      const userPlacement = resolvePlacement(
        requestedPlacement,
        responsivePlacement
      );

      if (userPlacement === "auto") {
        return computeAutoPlacement(targetRect, cardRect, offset);
      }
      return userPlacement;
    })();

    let top;
    let left;

    switch (resolvedPlacement) {
      case "top":
        top = targetRect.top - cardRect.height - offset;
        left = targetRect.left + targetRect.width / 2 - cardRect.width / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - cardRect.height / 2;
        left = targetRect.left - cardRect.width - offset;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - cardRect.height / 2;
        left = targetRect.right + offset;
        break;
      default:
        top = targetRect.bottom + offset;
        left = targetRect.left + targetRect.width / 2 - cardRect.width / 2;
        break;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Position relative to viewport (overlay is fixed; children are absolute)
    const minLeftBoundary = 12;
    const maxLeftBoundary = Math.max(12, viewportWidth - cardRect.width - 12);
    const desiredLeft = left; // already in viewport coordinates
    let finalLeft = clamp(desiredLeft, minLeftBoundary, maxLeftBoundary);

    if (desiredLeft > maxLeftBoundary) {
      const alignRight = targetRect.right - cardRect.width;
      finalLeft = clamp(alignRight, minLeftBoundary, maxLeftBoundary);
    } else if (desiredLeft < minLeftBoundary) {
      const alignLeft = targetRect.left;
      finalLeft = clamp(alignLeft, minLeftBoundary, maxLeftBoundary);
    }

    const minTopBoundary = 12;
    const maxTopBoundary = Math.max(12, viewportHeight - cardRect.height - 12);
    const desiredTop = top; // already in viewport coordinates
    let finalTop = clamp(desiredTop, minTopBoundary, maxTopBoundary);

    if (desiredTop > maxTopBoundary) {
      const alignBottom = targetRect.bottom - cardRect.height;
      finalTop = clamp(alignBottom, minTopBoundary, maxTopBoundary);
    }

    card.style.left = `${finalLeft}px`;
    card.style.top = `${finalTop}px`;

    applyArrowPosition(card, arrow, resolvedPlacement, targetRect);
  };

  const throttledUpdate = () => requestAnimationFrame(updatePosition);
  window.addEventListener("resize", throttledUpdate);
  window.addEventListener("scroll", throttledUpdate, true);
  destroyers.push(() => {
    window.removeEventListener("resize", throttledUpdate);
    window.removeEventListener("scroll", throttledUpdate, true);
  });

  updatePosition();

  if (autoFocusPrimary) {
    requestAnimationFrame(() => primary.focus());
  }

  const mark = {
    id,
    close,
    update: updatePosition,
    overlay,
    card,
    target,
    waitForClose,
  };

  ACTIVE_MARKS.set(id, mark);
  return mark;
}

export function hasActiveCoachMarks() {
  return ACTIVE_MARKS.size > 0;
}

export function hideCoachMark(id, reason = "dismiss") {
  const mark = ACTIVE_MARKS.get(id);
  if (mark) {
    mark.close(reason);
  }
}

export function hideAllCoachMarks(reason = "dismiss") {
  Array.from(ACTIVE_MARKS.values()).forEach((mark) => mark.close(reason));
}
