/**
 * =============================================================================
 *                        MEETCHUTHERE PERFORMANCE DEBUGGER
 * =============================================================================
 *
 * Advanced debugging tools for identifying performance bottlenecks, memory leaks,
 * and redundant operations in real-time systems.
 *
 * Features:
 * ├── Real-time listener monitoring
 * ├── Memory leak detection
 * ├── Performance profiling
 * ├── Event frequency analysis
 * └── Debug commands for browser console
 *
 * =============================================================================
 */

class PerformanceDebugger {
  constructor() {
    this.eventCounts = new Map();
    this.listenerCounts = new Map();
    this.performanceMarks = new Map();
    this.memorySnapshots = [];
    this.isMonitoring = false;
    this.debugLog = [];

    // Thresholds for alerts (industry-standard values)
    this.thresholds = {
      // Performance thresholds
      maxEventFrequency: {
        green: 5, // Good performance
        yellow: 15, // Warning
        red: 30, // Critical
      },
      maxListeners: {
        green: 10, // Good
        yellow: 25, // Warning
        red: 50, // Critical
      },
      memoryGrowth: {
        green: 10, // MB growth in 30s - Good
        yellow: 25, // Warning
        red: 50, // Critical
      },
      memoryTotal: {
        green: 100, // MB total - Good
        yellow: 200, // Warning
        red: 300, // Critical
      },
    };

    // Performance score tracking
    this.performanceScore = 100;
    this.alerts = [];

    // Dev-only initializer; no console noise by default
  }

  // =========================
  // REAL-TIME LISTENER MONITORING
  // =========================

  /**
   * Monitor real-time listener performance
   */
  startListenerMonitoring() {
    this.isMonitoring = true;
    // Starting listener performance monitoring (dev)

    // Monitor RealTimeManager
    if (window.realTimeManager) {
      this.monitorRealTimeManager();
    }

    // Monitor DOM event listeners
    this.monitorDOMListeners();

    // Monitor memory usage
    this.startMemoryMonitoring();

    // Set up periodic reports
    this.reportInterval = setInterval(() => {
      this.generatePerformanceReport();
    }, 30000); // Every 30 seconds
  }

  stopListenerMonitoring() {
    this.isMonitoring = false;
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }
    // Stopped listener performance monitoring
  }

  monitorRealTimeManager() {
    const rtm = window.realTimeManager;
    if (!rtm) return;

    // Wrap the emit method to track event frequency
    const originalEmit = rtm.emit.bind(rtm);
    rtm.emit = (eventType, data) => {
      this.trackEvent(`realtime:${eventType}`);
      return originalEmit(eventType, data);
    };

    // Wrap the on method to track listener counts
    const originalOn = rtm.on.bind(rtm);
    rtm.on = (eventType, callback) => {
      this.trackListener(`realtime:${eventType}`, "add");
      const unsubscribe = originalOn(eventType, callback);

      // Wrap unsubscribe to track removal
      return () => {
        this.trackListener(`realtime:${eventType}`, "remove");
        return unsubscribe();
      };
    };

    if (process.env.NODE_ENV === "development")
      console.log("🎛️ RealTimeManager monitoring active");
  }

  monitorDOMListeners() {
    // Wrap addEventListener to track DOM listeners
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener =
      EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options
    ) {
      if (this.dataset?.friendId || this.classList?.contains("friend-card")) {
        window.performanceDebugger?.trackListener(`dom:${type}`, "add");
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options
    ) {
      if (this.dataset?.friendId || this.classList?.contains("friend-card")) {
        window.performanceDebugger?.trackListener(`dom:${type}`, "remove");
      }
      return originalRemoveEventListener.call(this, type, listener, options);
    };

    if (process.env.NODE_ENV === "development")
      console.log("🎛️ DOM listener monitoring active");
  }

  // =========================
  // COLOR-CODED LOGGING
  // =========================

  logGood(message) {
    console.log(`%c🟢 ${message}`, "color: #22c55e; font-weight: bold;");
  }

  logWarning(message) {
    console.warn(`%c🟡 ${message}`, "color: #f59e0b; font-weight: bold;");
    this.performanceScore -= 5;
  }

  logCritical(message) {
    console.error(`%c🔴 ${message}`, "color: #ef4444; font-weight: bold;");
    this.performanceScore -= 15;
    this.alerts.push({ timestamp: Date.now(), level: "critical", message });
  }

  logInfo(message) {
    console.log(`%c🔵 ${message}`, "color: #3b82f6; font-weight: bold;");
  }

  // =========================
  // EVENT TRACKING
  // =========================

  trackEvent(eventType) {
    const now = Date.now();
    if (!this.eventCounts.has(eventType)) {
      this.eventCounts.set(eventType, []);
    }

    const events = this.eventCounts.get(eventType);
    events.push(now);

    // Keep only events from last 10 seconds for frequency calculation
    const cutoff = now - 10000;
    const recentEvents = events.filter((time) => time > cutoff);
    this.eventCounts.set(eventType, recentEvents);

    // Check for excessive frequency with color coding
    const frequency = recentEvents.length;
    if (frequency >= this.thresholds.maxEventFrequency.red) {
      this.logCritical(
        `High frequency detected for ${eventType}: ${frequency} events/10s (CRITICAL)`
      );
    } else if (frequency >= this.thresholds.maxEventFrequency.yellow) {
      this.logWarning(
        `Elevated frequency for ${eventType}: ${frequency} events/10s (WARNING)`
      );
    } else if (frequency <= this.thresholds.maxEventFrequency.green) {
      // Only log occasionally for good performance to avoid spam
      if (Math.random() < 0.1) {
        this.logGood(
          `Good event frequency for ${eventType}: ${frequency} events/10s`
        );
      }
    }
  }

  trackListener(listenerType, action) {
    if (!this.listenerCounts.has(listenerType)) {
      this.listenerCounts.set(listenerType, 0);
    }

    const current = this.listenerCounts.get(listenerType);
    const newCount = action === "add" ? current + 1 : Math.max(0, current - 1);
    this.listenerCounts.set(listenerType, newCount);

    // Check for excessive listeners with color coding
    if (newCount >= this.thresholds.maxListeners.red) {
      this.logCritical(
        `Too many listeners for ${listenerType}: ${newCount} (CRITICAL)`
      );
    } else if (newCount >= this.thresholds.maxListeners.yellow) {
      this.logWarning(
        `High listener count for ${listenerType}: ${newCount} (WARNING)`
      );
    } else if (newCount <= this.thresholds.maxListeners.green && newCount > 0) {
      // Occasionally log good performance
      if (Math.random() < 0.05) {
        this.logGood(`Healthy listener count for ${listenerType}: ${newCount}`);
      }
    }
  }

  // =========================
  // MEMORY MONITORING
  // =========================

  startMemoryMonitoring() {
    this.memoryInterval = setInterval(() => {
      if (performance.memory) {
        const snapshot = {
          timestamp: Date.now(),
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        };

        this.memorySnapshots.push(snapshot);

        // Keep only last 20 snapshots (10 minutes worth)
        if (this.memorySnapshots.length > 20) {
          this.memorySnapshots.shift();
        }

        // Check for memory growth with color coding
        if (this.memorySnapshots.length >= 2) {
          const previous =
            this.memorySnapshots[this.memorySnapshots.length - 2];
          const growth = snapshot.used - previous.used;

          // Memory growth analysis
          if (growth >= this.thresholds.memoryGrowth.red) {
            this.logCritical(
              `High memory growth: +${growth}MB in 30s (CRITICAL - Possible leak!)`
            );
          } else if (growth >= this.thresholds.memoryGrowth.yellow) {
            this.logWarning(
              `Elevated memory growth: +${growth}MB in 30s (WARNING)`
            );
          } else if (
            growth <= this.thresholds.memoryGrowth.green &&
            growth >= 0
          ) {
            this.logGood(`Healthy memory growth: +${growth}MB in 30s`);
          } else if (growth < 0) {
            this.logGood(`Memory cleaned up: ${growth}MB (Garbage collection)`);
          }

          // Total memory analysis
          if (snapshot.used >= this.thresholds.memoryTotal.red) {
            this.logCritical(
              `High total memory usage: ${snapshot.used}MB (CRITICAL)`
            );
          } else if (snapshot.used >= this.thresholds.memoryTotal.yellow) {
            this.logWarning(
              `Elevated memory usage: ${snapshot.used}MB (WARNING)`
            );
          }
        }
      }
    }, 30000); // Every 30 seconds
  }

  // =========================
  // PERFORMANCE ANALYSIS
  // =========================

  analyzeListenerLeaks() {
    console.log("🔍 Analyzing potential listener leaks...");

    const suspiciousListeners = [];
    this.listenerCounts.forEach((count, type) => {
      if (count > 5) {
        // More than 5 listeners of same type is suspicious
        suspiciousListeners.push({ type, count });
      }
    });

    if (suspiciousListeners.length > 0) {
      console.warn("⚠️ Suspicious listener counts found:");
      suspiciousListeners.forEach(({ type, count }) => {
        console.warn(`  ${type}: ${count} listeners`);
      });
    } else {
      console.log("✅ No obvious listener leaks detected");
    }

    return suspiciousListeners;
  }

  analyzeEventFrequency() {
    console.log("📊 Analyzing event frequency...");

    const highFrequencyEvents = [];
    this.eventCounts.forEach((events, type) => {
      const frequency = events.length; // Events in last 10 seconds
      if (frequency > 5) {
        highFrequencyEvents.push({ type, frequency });
      }
    });

    if (highFrequencyEvents.length > 0) {
      console.warn("⚠️ High frequency events detected:");
      highFrequencyEvents.forEach(({ type, frequency }) => {
        console.warn(`  ${type}: ${frequency} events/10s`);
      });
    } else {
      console.log("✅ Event frequencies look normal");
    }

    return highFrequencyEvents;
  }

  // =========================
  // DEBUGGING COMMANDS
  // =========================

  getQuickAccessDebugInfo() {
    if (process.env.NODE_ENV === "development")
      console.log("🔍 Quick Access Debug Information:");

    // Check RealTimeManager status
    if (window.realTimeManager) {
      const status = window.realTimeManager.getDebugInfo();
      console.log("📡 RealTimeManager Status:", status);
    }

    // Check FriendsPage listeners
    if (window.friendsPage) {
      console.log("👥 FriendsPage Active:", !!window.friendsPage.isActive);
      console.log(
        "👥 FriendsPage Real-time Setup:",
        !!window.friendsPage.realTimeUnsubscriber
      );
    }

    // Check DataService cache
    if (window.dataManager) {
      console.log(
        "💾 DataManager Cache Keys:",
        Object.keys(window.dataManager.cache || {})
      );
    }

    return {
      realTimeManager: window.realTimeManager?.getDebugInfo(),
      friendsPage: {
        isActive: !!window.friendsPage?.isActive,
        hasRealTimeSetup: !!window.friendsPage?.realTimeUnsubscriber,
      },
      dataManager: {
        cacheKeys: Object.keys(window.dataManager?.cache || {}),
      },
    };
  }

  findDuplicateListeners() {
    if (process.env.NODE_ENV === "development")
      console.log("🔍 Searching for duplicate listeners...");

    // Check for multiple instances of the same component
    const friendCards = document.querySelectorAll(".friend-card");
    const duplicateIds = new Map();

    friendCards.forEach((card) => {
      const friendId = card.dataset.friendId;
      if (friendId) {
        duplicateIds.set(friendId, (duplicateIds.get(friendId) || 0) + 1);
      }
    });

    const duplicates = Array.from(duplicateIds.entries()).filter(
      ([id, count]) => count > 1
    );

    if (duplicates.length > 0) {
      console.warn("⚠️ Duplicate friend cards found:");
      duplicates.forEach(([id, count]) => {
        console.warn(`  Friend ${id}: ${count} cards`);
      });
    } else {
      console.log("✅ No duplicate friend cards found");
    }

    return duplicates;
  }

  // =========================
  // OPTIMIZATION SUGGESTIONS
  // =========================

  generateOptimizationSuggestions() {
    const suggestions = [];

    // Check listener counts
    this.listenerCounts.forEach((count, type) => {
      if (count > 10) {
        suggestions.push(`Reduce ${type} listeners (currently ${count})`);
      }
    });

    // Check event frequency
    this.eventCounts.forEach((events, type) => {
      if (events.length > 8) {
        suggestions.push(
          `Debounce ${type} events (${events.length} events/10s)`
        );
      }
    });

    // Check memory usage
    if (this.memorySnapshots.length >= 2) {
      const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
      const previous = this.memorySnapshots[this.memorySnapshots.length - 2];
      const growth = latest.used - previous.used;

      if (growth > 20) {
        suggestions.push(
          `Memory growing rapidly (+${growth}MB in 30s) - check for leaks`
        );
      }
    }

    return suggestions;
  }

  // =========================
  // REPORTING
  // =========================

  generatePerformanceReport() {
    if (!this.isMonitoring) return;

    // Calculate overall performance score
    const score = Math.max(0, Math.min(100, this.performanceScore));
    let scoreColor = "";
    let scoreEmoji = "";

    if (score >= 80) {
      scoreColor = "color: #22c55e; font-weight: bold;";
      scoreEmoji = "🟢";
    } else if (score >= 60) {
      scoreColor = "color: #f59e0b; font-weight: bold;";
      scoreEmoji = "🟡";
    } else {
      scoreColor = "color: #ef4444; font-weight: bold;";
      scoreEmoji = "🔴";
    }

    console.log(`%c${scoreEmoji} Performance Score: ${score}/100`, scoreColor);
    console.log("📊 Detailed Performance Report:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Listener summary
    console.log("🎛️ Active Listeners:");
    this.listenerCounts.forEach((count, type) => {
      if (count > 0) {
        console.log(`  ${type}: ${count}`);
      }
    });

    // Event frequency summary
    console.log("📡 Event Frequency (last 10s):");
    this.eventCounts.forEach((events, type) => {
      if (events.length > 0) {
        console.log(`  ${type}: ${events.length} events`);
      }
    });

    // Memory usage
    if (this.memorySnapshots.length > 0) {
      const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
      console.log(`💾 Memory: ${latest.used}MB used / ${latest.total}MB total`);
    }

    // Chrome DevTools integration suggestions
    this.generateChromeDevToolsSuggestions();

    // Optimization suggestions
    const suggestions = this.generateOptimizationSuggestions();
    if (suggestions.length > 0) {
      console.warn("💡 Optimization Suggestions:");
      suggestions.forEach((suggestion) => console.warn(`  • ${suggestion}`));
    }

    // Recent alerts summary
    if (this.alerts.length > 0) {
      console.error("🚨 Recent Critical Alerts:");
      this.alerts.slice(-3).forEach((alert) => {
        const time = new Date(alert.timestamp).toLocaleTimeString();
        console.error(`  ${time}: ${alert.message}`);
      });
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Reset performance score for next interval
    this.performanceScore = 100;
  }

  // =========================
  // CHROME DEVTOOLS INTEGRATION
  // =========================

  generateChromeDevToolsSuggestions() {
    const suggestions = [];

    // Memory analysis
    if (this.memorySnapshots.length > 0) {
      const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
      if (latest.used > this.thresholds.memoryTotal.yellow) {
        suggestions.push(
          "Open Chrome DevTools > Memory tab > Take heap snapshot"
        );
      }
    }

    // Event frequency analysis
    let hasHighFrequency = false;
    this.eventCounts.forEach((events, type) => {
      if (events.length > this.thresholds.maxEventFrequency.yellow) {
        hasHighFrequency = true;
      }
    });

    if (hasHighFrequency) {
      suggestions.push(
        "Open Chrome DevTools > Performance tab > Record while using app"
      );
    }

    // Listener analysis
    let hasHighListeners = false;
    this.listenerCounts.forEach((count, type) => {
      if (count > this.thresholds.maxListeners.yellow) {
        hasHighListeners = true;
      }
    });

    if (hasHighListeners) {
      suggestions.push(
        "Check Chrome DevTools > Elements > Event Listeners panel"
      );
    }

    if (suggestions.length > 0) {
      this.logInfo("Chrome DevTools Recommendations:");
      suggestions.forEach((suggestion) => {
        console.log(`%c  🔧 ${suggestion}`, "color: #3b82f6;");
      });
    }
  }

  // Advanced memory leak detection
  detectMemoryLeaks() {
    if (this.memorySnapshots.length < 5) {
      return {
        status: "insufficient_data",
        recommendation: "Need more data points",
      };
    }

    const recent5 = this.memorySnapshots.slice(-5);
    const growthPattern = recent5
      .map((snapshot, index) => {
        if (index === 0) return 0;
        return snapshot.used - recent5[index - 1].used;
      })
      .slice(1);

    const avgGrowth =
      growthPattern.reduce((sum, growth) => sum + growth, 0) /
      growthPattern.length;

    if (avgGrowth > this.thresholds.memoryGrowth.yellow) {
      return {
        status: "potential_leak",
        avgGrowth,
        recommendation: "Use Chrome DevTools Memory tab to take heap snapshots",
      };
    }

    return { status: "healthy", avgGrowth };
  }

  // =========================
  // UTILITIES
  // =========================

  logAlert(message) {
    console.warn(message);
    this.debugLog.push({
      timestamp: Date.now(),
      type: "alert",
      message,
    });
  }

  reset() {
    this.eventCounts.clear();
    this.listenerCounts.clear();
    this.performanceMarks.clear();
    this.memorySnapshots = [];
    this.debugLog = [];
    if (process.env.NODE_ENV === "development")
      console.log("🔄 Performance debugger reset");
  }
}

// Export and global setup
export const performanceDebugger = new PerformanceDebugger();

// Make available globally for debugging
if (typeof window !== "undefined") {
  window.performanceDebugger = performanceDebugger;

  // Console commands for debugging
  window.debugQuickAccess = () => performanceDebugger.getQuickAccessDebugInfo();
  window.findDuplicateListeners = () =>
    performanceDebugger.findDuplicateListeners();
  window.analyzePerformance = () => {
    performanceDebugger.analyzeListenerLeaks();
    performanceDebugger.analyzeEventFrequency();
    return performanceDebugger.generateOptimizationSuggestions();
  };
  window.startPerformanceMonitoring = () => {
    performanceDebugger.startListenerMonitoring();
    performanceDebugger.logInfo(
      "Performance monitoring started - reports every 30s"
    );
  };
  window.stopPerformanceMonitoring = () => {
    performanceDebugger.stopListenerMonitoring();
    performanceDebugger.logInfo("Performance monitoring stopped");
  };
  window.checkMemoryLeaks = () => performanceDebugger.detectMemoryLeaks();
  window.getPerformanceScore = () => performanceDebugger.performanceScore;

  // Dev command helpers are available via window.* without printing banners
}
