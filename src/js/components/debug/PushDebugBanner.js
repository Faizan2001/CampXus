// Lightweight in-app banner to debug Web Push registration
// Shows permission, SW state, messaging support, and server token docs

import { currentUser } from "../../store/userStore.js";

export async function installPushDebugBanner() {
  try {
    // Only enable when explicitly requested
    const params = new URLSearchParams(location.search);
    const enabled =
      params.get("pushdebug") === "1" ||
      (typeof localStorage !== "undefined" &&
        localStorage.getItem("push:debug") === "true");
    if (!enabled) return;

    // Create container
    const el = document.createElement("div");
    el.id = "push-debug-banner";
    el.style.cssText =
      "position:fixed;bottom:12px;left:12px;z-index:99999;background:rgba(10,11,15,0.92);color:#fff;padding:10px 12px;border-radius:8px;font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;box-shadow:0 4px 14px rgba(0,0,0,0.3);max-width:92vw;";
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <strong>Push Debug</strong>
        <span id="pd-user" style="opacity:.9"></span>
        <span id="pd-perm" style="opacity:.9"></span>
        <span id="pd-sw" style="opacity:.9"></span>
        <span id="pd-msg" style="opacity:.9"></span>
        <span id="pd-tokens" style="opacity:.9"></span>
        <button id="pd-refresh" style="margin-left:6px;background:#6366f1;border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer">Refresh</button>
        <button id="pd-test" style="background:#f59e0b;border:none;color:#0b141a;padding:4px 8px;border-radius:6px;cursor:pointer">Test Push</button>
        <button id="pd-register" style="background:#10b981;border:none;color:#0b141a;padding:4px 8px;border-radius:6px;cursor:pointer">Force Register</button>
        <button id="pd-close" style="background:#e11d48;border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer">Close</button>
      </div>
      <div id="pd-last" style="margin-top:6px;color:#cbd5e1;max-width:80ch;word-break:break-word"></div>
    `;
    document.body.appendChild(el);

    const ui = {
      user: el.querySelector("#pd-user"),
      perm: el.querySelector("#pd-perm"),
      sw: el.querySelector("#pd-sw"),
      msg: el.querySelector("#pd-msg"),
      tokens: el.querySelector("#pd-tokens"),
      last: el.querySelector("#pd-last"),
      refresh: el.querySelector("#pd-refresh"),
      test: el.querySelector("#pd-test"),
      register: el.querySelector("#pd-register"),
      close: el.querySelector("#pd-close"),
    };

    async function gatherState() {
      const state = {
        permission:
          typeof Notification !== "undefined" ? Notification.permission : "n/a",
        swControlled:
          typeof navigator !== "undefined" &&
          navigator.serviceWorker &&
          !!navigator.serviceWorker.controller,
        swHasRegistration: false,
        messagingSupported: false,
        tokens: [],
      };

      try {
        const reg =
          (await navigator.serviceWorker?.getRegistration("/sw.js")) ||
          (await navigator.serviceWorker?.ready);
        state.swHasRegistration = !!reg;
      } catch (_) {}

      try {
        const { isSupported } = await import("firebase/messaging");
        state.messagingSupported = await isSupported();
      } catch (_) {}

      try {
        const uid = currentUser?.uid;
        if (uid) {
          const { getFirestore, collection, getDocs } = await import(
            "firebase/firestore"
          );
          const db = getFirestore();
          const snap = await getDocs(collection(db, "users", uid, "fcmTokens"));
          snap.forEach((d) => {
            const t = d.data() || {};
            state.tokens.push({ id: d.id, isPWA: t.isPWA === true, platform: t.platform || "" });
          });
        }
      } catch (_) {}

      return state;
    }

    async function render() {
      const s = await gatherState();
      try {
        const uid = currentUser?.uid || "(signed out)";
        ui.user.textContent = `user: ${uid}`;
      } catch (_) {}
      ui.perm.textContent = `perm: ${s.permission}`;
      ui.sw.textContent = `sw: ${s.swHasRegistration ? "reg" : "no-reg"}/${
        s.swControlled ? "ctrl" : "no-ctrl"
      }`;
      ui.msg.textContent = `msg: ${s.messagingSupported ? "ok" : "no"}`;
      if (!s.tokens.length) {
        ui.tokens.textContent = `tokens: 0`;
      } else {
        const parts = s.tokens.map((t) => `${t.isPWA ? "PWA" : "WEB"}`);
        ui.tokens.textContent = `tokens: ${s.tokens.length} [${parts.join(", ")}]`;
      }
    }

    ui.refresh.addEventListener("click", () => render());
    ui.test.addEventListener("click", async () => {
      try {
        const { default: app, auth } = await import(
          "../../lib/firebase/firebase-config.js"
        );
        // Prefer HTTP endpoint with explicit ID token to avoid callable 401s
        const user = auth?.currentUser;
        if (!user) throw new Error("No auth user for test push (sign in)");
        const idToken = await user.getIdToken(/*forceRefresh*/ true);
        const projectId = (window.ENV && window.ENV.FIREBASE_PROJECT_ID) || "";
        const url = `https://us-central1-${projectId}.cloudfunctions.net/sendTestPushHttp`;
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({}),
        });
        const json = await r.json().catch(() => ({}));
        const resp = { data: json };
        const data = resp?.data || {};
        console.log("Test push result", data);
        if (ui.last) {
          if (data.ok && data.details) {
            const d = data.details;
            const codes = (d.errors || []).map((e) => e.code).join(',');
            ui.last.textContent = `last: ok, sent=${d.sent}, failed=${d.failed}, tokensSent=${d.tokensSent}, tokensConsidered=${d.tokensConsidered}, usedPwaOnly=${d.usedPwaOnly}${codes ? `, failedCodes=${codes}` : ''}`;
          } else {
            ui.last.textContent = `last: error ${data.error || "unknown"}`;
          }
        }
      } catch (e) {
        console.warn("Test push call failed", e);
        if (ui.last) ui.last.textContent = `last: call failed ${e?.message || e}`;
      }
    });
    ui.register.addEventListener("click", async () => {
      try {
        const { pushMessagingService } = await import(
          "../../services/realtime/PushMessagingService.js"
        );
        await pushMessagingService._getAndSaveTokenIfNeeded(true);
      } catch (_) {}
      await render();
    });
    ui.close.addEventListener("click", () => {
      try { localStorage.removeItem("push:debug"); } catch (_) {}
      el.remove();
    });

    // Initial render and keep fresh after permission changes
    await render();
    try {
      navigator.permissions?.query({ name: "notifications" }).then((p) => {
        p.onchange = render;
      });
    } catch (_) {}
  } catch (_) {
    /* ignore */
  }
}

export default installPushDebugBanner;
