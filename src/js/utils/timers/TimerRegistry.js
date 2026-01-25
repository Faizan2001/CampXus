// TimerRegistry.js
//
// Centralized timer tracking for SPA lifecycle cleanup.
// Goal: prevent orphaned setTimeout/setInterval timers from persisting across SPA navigations.

const DEFAULTS = Object.freeze({
  // Only auto-clean up timers that were created while a specific SPA route was active.
  CLEANUP_TIMEOUTS_ON_UNLOAD: true,
  CLEANUP_INTERVALS_ON_UNLOAD: true,
});

class TimerRegistry {
  constructor() {
    this._patched = false;

    this._native = null;
    this._activeRoute = null;
    this._routeStack = [];
    this._records = new Map(); // id -> { type, route, createdAt, persistent }
    this._routeIndex = new Map(); // route -> Set(ids)

    this._boundPageUnload = null;
  }

  patchGlobals() {
    if (this._patched) return;
    if (typeof window === "undefined") return;

    this._native = {
      setTimeout: window.setTimeout.bind(window),
      setInterval: window.setInterval.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      clearInterval: window.clearInterval.bind(window),
    };

    window.setTimeout = (...args) => {
      const id = this._native.setTimeout(...args);
      this._track(id, "timeout");
      return id;
    };
    window.setInterval = (...args) => {
      const id = this._native.setInterval(...args);
      this._track(id, "interval");
      return id;
    };
    window.clearTimeout = (id) => {
      this._untrack(id);
      return this._native.clearTimeout(id);
    };
    window.clearInterval = (id) => {
      this._untrack(id);
      return this._native.clearInterval(id);
    };

    this._bindSpaLifecycle();
    this._patched = true;
  }

  _bindSpaLifecycle() {
    if (typeof document === "undefined") return;
    if (this._boundPageUnload) return;
    this._boundPageUnload = (event) => {
      const route = event?.detail?.route || null;
      if (!route) return;
      this.cleanupRoute(route);
    };

    document.addEventListener("spa:page:unload", this._boundPageUnload);
  }

  enterRoute(route) {
    const r = route || null;
    if (!r) return;
    this._routeStack.push(r);
    this._activeRoute = r;
  }

  exitRoute(route) {
    const r = route || null;
    if (!r) return;
    // Pop only if the top matches; otherwise remove first occurrence (best effort)
    const top = this._routeStack[this._routeStack.length - 1];
    if (top === r) {
      this._routeStack.pop();
    } else {
      const idx = this._routeStack.lastIndexOf(r);
      if (idx >= 0) this._routeStack.splice(idx, 1);
    }
    this._activeRoute = this._routeStack[this._routeStack.length - 1] || null;
  }

  _track(id, type) {
    // Node timers can be objects; browser timers are numbers. Both can be Map keys.
    if (id == null) return;
    if (this._records.has(id)) return;

    const route = this._activeRoute || null;
    const record = {
      type,
      route,
      createdAt: Date.now(),
      persistent: false,
    };
    this._records.set(id, record);

    if (route) {
      if (!this._routeIndex.has(route)) this._routeIndex.set(route, new Set());
      this._routeIndex.get(route).add(id);
    }
  }

  _untrack(id) {
    if (id == null) return;
    const record = this._records.get(id);
    if (!record) return;
    this._records.delete(id);
    if (record.route && this._routeIndex.has(record.route)) {
      const set = this._routeIndex.get(record.route);
      set.delete(id);
      if (set.size === 0) this._routeIndex.delete(record.route);
    }
  }

  markPersistent(id) {
    const record = this._records.get(id);
    if (record) record.persistent = true;
  }

  cleanupRoute(route, options = DEFAULTS) {
    const ids = this._routeIndex.get(route);
    if (!ids || ids.size === 0) return { cleared: 0 };

    let cleared = 0;
    Array.from(ids).forEach((id) => {
      const record = this._records.get(id);
      if (!record || record.persistent) {
        this._untrack(id);
        return;
      }

      try {
        if (record.type === "interval" && options.CLEANUP_INTERVALS_ON_UNLOAD) {
          this._native?.clearInterval?.(id);
          cleared++;
        } else if (
          record.type === "timeout" &&
          options.CLEANUP_TIMEOUTS_ON_UNLOAD
        ) {
          this._native?.clearTimeout?.(id);
          cleared++;
        }
      } catch (_) {
        // Best-effort cleanup
      } finally {
        this._untrack(id);
      }
    });

    return { cleared };
  }

  getStats() {
    const byRoute = {};
    for (const [route, ids] of this._routeIndex.entries()) {
      byRoute[route] = ids.size;
    }
    return {
      activeRoute: this._activeRoute,
      totalTracked: this._records.size,
      byRoute,
    };
  }
}

export const timerRegistry = new TimerRegistry();
