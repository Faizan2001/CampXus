import { dataManager } from "../data/DataService.js";
import { currentUser } from "../../store/userStore.js";

const SESSION_STORAGE_KEY = "campxus:onboarding:dismissed";

export const DEFAULT_ONBOARDING_STATE = Object.freeze({
  version: 2,
  scheduleControlsHintSeen: false,
  viewToggleHintSeen: false,
  addSlotHintSeen: false,
  scheduleTapHintSeen: false,
  pinHintSeen: false,
  compareHintSeen: false,
  comparePromptSeen: false,
  campusPresenceHintSeen: false,
  friendActionsHintSeen: false,
  schedulePasteHelpSeen: false,
});

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

class OnboardingService {
  constructor() {
    this._state = cloneState(DEFAULT_ONBOARDING_STATE);
    this._initialized = false;
    this._initializingPromise = null;
    this._profileReady = false;
    // Track current UID to scope session suppression per-user
    this._currentUid = currentUser?.uid || null;
    this._sessionDismissed = this._loadSessionDismissed(this._currentUid);
    this._pendingRemoteUpdates = {};

    this._unsubscribe = currentUser.subscribe((snapshot) => {
      // Switch session suppression namespace when UID changes
      const nextUid = snapshot?.user?.uid || null;
      if (nextUid !== this._currentUid) {
        this._currentUid = nextUid;
        // Load per-user session dismissed set; for logged-out (null) default to empty
        this._sessionDismissed = this._loadSessionDismissed(this._currentUid);

  // Reset onboarding state when account changes to ensure per-user isolation
  // and avoid inheriting the previous user's flags/state in memory.
  this._state = cloneState(DEFAULT_ONBOARDING_STATE);
  this._initialized = false; // Force re-init for the new user
  this._profileReady = false; // Wait for the new profile/onboarding to load
  // Drop any pending remote updates from the previous user
  this._pendingRemoteUpdates = {};
      }

      const profile = snapshot?.profile;
      if (!profile) {
        // If logged out, also mark profile as not ready so new user will re-init
        if (!snapshot?.isLoggedIn) {
          this._profileReady = false;
          // Do not change persisted user-level onboarding state here; only session suppression.
        }
        return;
      }
      const onboarding = profile?.systemInfo?.onboarding;
      if (onboarding && typeof onboarding === "object") {
        this._applyProfile(onboarding);
      } else if (profile.systemInfo) {
        this._profileReady = true;
      }
    });

    // Cleanup legacy global session key so old device-level suppressions don't leak
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  async init(force = false) {
    if (this._initialized && !force) {
      return this._state;
    }

    if (this._initializingPromise && !force) {
      return this._initializingPromise;
    }

    this._initializingPromise = (async () => {
      try {
        const profile = await currentUser
          .waitForProfileWithTimeout?.(2000)
          .catch(() => currentUser.profile);
        if (profile?.systemInfo?.onboarding) {
          this._applyProfile(profile.systemInfo.onboarding);
        } else {
          this._state = cloneState(DEFAULT_ONBOARDING_STATE);
          this._initialized = true;
        }
      } catch (_) {
        this._state = cloneState(DEFAULT_ONBOARDING_STATE);
        this._initialized = true;
      } finally {
        this._initializingPromise = null;
      }
      return this._state;
    })();

    return this._initializingPromise;
  }

  getState() {
    return cloneState(this._state);
  }

  shouldShow(key) {
    if (!key) return false;
    // For friend actions onboarding, also ignore session suppression to
    // reduce cross-device/session inconsistencies.
    if (key === "friendActionsHintSeen") {
      return this._state[key] !== true;
    }
    // For core Home hints, ignore session suppression so they can show
    // reliably across reloads within the same device session during dev.
    if (
      key === "scheduleControlsHintSeen" ||
      key === "viewToggleHintSeen" ||
      key === "addSlotHintSeen" ||
      key === "pinHintSeen" ||
      key === "scheduleTapHintSeen"
    ) {
      return this._state[key] !== true;
    }
    return this._state[key] !== true && !this._sessionDismissed.has(key);
  }

  dismissForSession(key) {
    if (!key) return;
    this._sessionDismissed.add(key);
    this._saveSessionDismissed();
  }

  async markSeen(keys, options = {}) {
    const { allowPending = false, persist = true } = options;
    await this.init();

    const keysArray = Array.isArray(keys) ? keys : [keys];
    const updatePayload = {};
    let changed = false;

    keysArray.forEach((key) => {
      if (!key) return;
      if (this._state[key] !== true) {
        this._state[key] = true;
        changed = true;
        updatePayload[key] = true;
      }
      this._sessionDismissed.add(key);
    });

    this._saveSessionDismissed();

    if (!changed || !persist) {
      return { success: true, persisted: false };
    }

    currentUser.setOnboardingState?.(updatePayload);

    if (this._profileReady && currentUser.uid) {
      try {
        if (this._state.version !== DEFAULT_ONBOARDING_STATE.version) {
          updatePayload.version = DEFAULT_ONBOARDING_STATE.version;
          this._state.version = DEFAULT_ONBOARDING_STATE.version;
        }
        await dataManager.updateOnboardingState(currentUser.uid, updatePayload);
        return { success: true, persisted: true };
      } catch (error) {
        if (allowPending) {
          this._queuePending(updatePayload);
          return { success: false, deferred: true };
        }
        throw error;
      }
    }

    if (allowPending) {
      this._queuePending(updatePayload);
      return { success: true, deferred: true };
    }

    return { success: true, persisted: false };
  }

  _applyProfile(onboardingSnapshot) {
    this._profileReady = true;
    const incoming = cloneState(onboardingSnapshot);
    const incomingVersion = incoming?.version ?? 0;
    const needsUpgrade = incomingVersion !== DEFAULT_ONBOARDING_STATE.version;

    if (needsUpgrade) {
      this._state = cloneState(DEFAULT_ONBOARDING_STATE);
      this._initialized = true;
      this._resetSessionDismissed();
      currentUser.setOnboardingState?.(this._state);

      if (currentUser.uid) {
        dataManager
          .updateOnboardingState(currentUser.uid, this._state)
          .catch(() => this._queuePending(this._state));
      } else {
        this._queuePending(this._state);
      }
      return;
    }

    const merged = {
      ...cloneState(DEFAULT_ONBOARDING_STATE),
      ...incoming,
    };
    merged.version = DEFAULT_ONBOARDING_STATE.version;
    this._state = merged;
    this._initialized = true;

    if (Object.keys(this._pendingRemoteUpdates).length) {
      this.flushPending().catch(() => {});
    }
  }

  _queuePending(payload) {
    this._pendingRemoteUpdates = {
      ...this._pendingRemoteUpdates,
      ...payload,
    };
  }

  _resetSessionDismissed() {
    this._sessionDismissed = new Set();
    this._saveSessionDismissed();
  }

  resetSessionHints() {
    this._resetSessionDismissed();
  }

  async resetAll({ persist = false } = {}) {
    await this.init(true);
    this._state = cloneState(DEFAULT_ONBOARDING_STATE);
    this._pendingRemoteUpdates = {};
    this._resetSessionDismissed();
    this._initialized = true;
    currentUser.setOnboardingState?.(this._state);

    if (persist && currentUser.uid) {
      try {
        await dataManager.updateOnboardingState(currentUser.uid, this._state);
      } catch (error) {
        this._queuePending(this._state);
        throw error;
      }
    } else if (persist) {
      this._queuePending(this._state);
    }

    return this.getState();
  }

  async flushPending() {
    if (!this._profileReady || !currentUser.uid) return;
    const payload = { ...this._pendingRemoteUpdates };
    if (!Object.keys(payload).length) return;
    this._pendingRemoteUpdates = {};
    if (!payload.version && !this._state.version) {
      payload.version = DEFAULT_ONBOARDING_STATE.version;
    }
    currentUser.setOnboardingState?.(payload);
    try {
      await dataManager.updateOnboardingState(currentUser.uid, payload);
    } catch (error) {
      // Re-queue on failure so we can retry next time
      this._queuePending(payload);
      throw error;
    }
  }

  _effectiveSessionKey(uid) {
    // Namespace by UID so dismissals don’t leak across accounts in same device session
    const suffix = uid ? String(uid) : "guest";
    return `${SESSION_STORAGE_KEY}:${suffix}`;
  }

  _loadSessionDismissed(uid) {
    try {
      if (!uid) {
        // For logged-out sessions, start fresh each time
        return new Set();
      }
      const stored = sessionStorage.getItem(this._effectiveSessionKey(uid));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch (_) {
      /* ignore */
    }
    return new Set();
  }

  _saveSessionDismissed() {
    try {
      const key = this._effectiveSessionKey(this._currentUid);
      sessionStorage.setItem(
        key,
        JSON.stringify(Array.from(this._sessionDismissed))
      );
    } catch (_) {
      /* ignore */
    }
  }
}

export const onboardingService = new OnboardingService();

try {
  const envMode =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.MODE) ||
    (typeof window !== "undefined" && window.ENV && window.ENV.ENVIRONMENT) ||
    "development";

  if (typeof window !== "undefined" && envMode !== "production") {
    window.campxusOnboarding = {
      getState: () => onboardingService.getState(),
      resetSession: () => onboardingService.resetSessionHints(),
      resetAll: (persist = false) => onboardingService.resetAll({ persist }),
    };
  }
} catch (_) {
  /* ignore exposure errors */
}
