// PushPermissionBanner.js
// Reusable banner for enabling web push notifications with value-focused copy

import { notificationPermissionService } from "../../services/realtime/NotificationPermissionService.js";

let bound = false;

function bannerHtml(state) {
  const base = (inner) => `
    <div class="push-permission-banner" role="region" aria-label="Notifications setup">
      <div class="ppb-body">${inner}</div>
    </div>
  `;

  if (!state.supported || state.actionable === "unsupported") {
    return base(`
      <div class="ppb-title">Notifications not supported</div>
      <div class="ppb-text">Your browser/device doesn’t support web push notifications.</div>
    `);
  }

  if (state.actionable === "granted") {
    return ""; // no banner
  }

  if (state.actionable === "needs_install" && state.isIOS && !state.isStandalone) {
    return base(`
      <div class="ppb-title">Install app to enable notifications</div>
      <div class="ppb-text">Get instant alerts when friends share their campus location. On iPhone, install the app from Safari to allow notifications.</div>
      <div class="ppb-actions">
        <button class="ppb-btn ios-install" type="button">
          <i class="fas fa-download"></i> Install on iOS
        </button>
      </div>
    `);
  }

  if (state.actionable === "denied") {
    return base(`
      <div class="ppb-title">Notifications are blocked</div>
      <div class="ppb-text">Enable notifications in Settings to get alerts when friends share their campus location.</div>
      <div class="ppb-actions">
        <button class="ppb-btn outline recheck" type="button">
          <i class="fas fa-sync"></i> I’ve updated settings
        </button>
      </div>
    `);
  }

  // default promptable
  return base(`
    <div class="ppb-title">Enable notifications to stay updated</div>
    <div class="ppb-text">Get instant alerts when friends share their campus location.</div>
    <div class="ppb-actions">
      <button class="ppb-btn enable" type="button">
        <i class="fas fa-bolt"></i> Enable Notifications
      </button>
    </div>
  `);
}

async function attachHandlers(container) {
  if (!container) return;
  const enableBtn = container.querySelector(".ppb-btn.enable");
  const iosInstallBtn = container.querySelector(".ppb-btn.ios-install");
  const recheckBtn = container.querySelector(".ppb-btn.recheck");

  if (enableBtn && !enableBtn.dataset.bound) {
    enableBtn.dataset.bound = "true";
    enableBtn.addEventListener("click", async () => {
      try {
        await notificationPermissionService.requestPermissionWithGesture();
      } catch (error) { console.debug("Suppressed error", error); }
      // re-render after outcome
      renderPushPermissionBanner();
    });
  }

  if (iosInstallBtn && !iosInstallBtn.dataset.bound) {
    iosInstallBtn.dataset.bound = "true";
    iosInstallBtn.addEventListener("click", async () => {
      try {
        const { pwaInstallService } = await import(
          "../../services/pwa/PWAInstallService.js"
        );
        pwaInstallService.showIOSInstructions();
      } catch (error) { console.debug("Suppressed error", error); }
    });
  }

  if (recheckBtn && !recheckBtn.dataset.bound) {
    recheckBtn.dataset.bound = "true";
    recheckBtn.addEventListener("click", () => renderPushPermissionBanner());
  }
}

export function renderPushPermissionBanner() {
  try {
    const host = document.getElementById("pushPermissionBanner");
    if (!host) return;
    const state = notificationPermissionService.getState();
    const html = bannerHtml(state);
    // Hide if no content
    if (!html) {
      host.innerHTML = "";
      host.style.display = "none";
      return;
    }
    host.innerHTML = html;
    host.style.display = "block";
    attachHandlers(host);
  } catch (error) { console.debug("Suppressed error", error); }
}

