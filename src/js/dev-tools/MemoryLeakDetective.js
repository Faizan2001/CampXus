/**
 * 🕵️‍♂️ Memory Leak Detective - Advanced SPA Memory Monitoring System
 * 
 * This tool helps beginners understand and detect memory leaks in SPAs by monitoring:
 * - Event listeners accumulation 
 * - DOM node leaks
 * - Timer leaks (setInterval/setTimeout)
 * - Network request leaks
 * - Firebase listener leaks
 * - Memory heap growth
 * - And much more!
 * 
 * Usage:
 * 1. Import this in your main app file
 * 2. Call MemoryLeakDetective.start() to begin monitoring
 * 3. Use browser console commands for manual testing
 * 4. Watch the periodic reports in console
 */

class MemoryLeakDetective {
  constructor() {
    this.isMonitoring = false;
    this.startTime = Date.now();
    
    // 📊 Tracking Data
    this.stats = {
      eventListeners: {
        added: 0,
        removed: 0,
        active: 0,
        types: new Map(), // Track by event type
        elements: new Map(), // Track by element type
        details: [], // Store details for debugging
        activeListeners: new Map(), // Track active listeners with full details
        listenerHistory: [], // Track listener lifecycle
        sourceFiles: new Map(), // Track by source file
        leakyPatterns: new Map() // Track patterns that might indicate leaks
      },
      timers: {
        intervals: new Set(),
        timeouts: new Set(),
        activeCount: 0,
        details: []
      },
      domNodes: {
        created: 0,
        removed: 0,
        net: 0,
        observer: null
      },
      networkRequests: {
        pending: new Set(),
        completed: 0,
        failed: 0,
        aborted: 0
      },
      firebaseListeners: {
        active: new Set(),
        count: 0,
        details: []
      },
      memory: {
        initial: null,
        current: null,
        peak: null,
        history: []
      },
      cssLeaks: {
        stylesheets: new Set(),
        count: 0,
        dynamicallyAdded: []
      },
      globalVariables: {
        initial: new Set(),
        current: new Set(),
        leaked: new Set()
      }
    };

    // 🎯 Configuration
    this.config = {
      reportInterval: 2 * 60 * 1000, // Report every 2 minutes
      memoryCheckInterval: 30 * 1000, // Check memory every 30 seconds
      alertThresholds: {
        eventListeners: 200, // Increased due to Firebase Auth creating many listeners during init
        timers: 20,
        memory: 50 * 1024 * 1024, // 50MB
        domNodes: 1000
      },
      verbose: true
    };

    // 🧩 Store original functions for patching
    this.originals = {
      addEventListener: EventTarget.prototype.addEventListener,
      removeEventListener: EventTarget.prototype.removeEventListener,
      setTimeout: window.setTimeout,
      setInterval: window.setInterval,
      clearTimeout: window.clearTimeout,
      clearInterval: window.clearInterval,
      fetch: window.fetch
    };

    this.reportTimer = null;
    this.memoryTimer = null;
    
    this.bindMethods();
  }

  bindMethods() {
    this.patchEventListeners = this.patchEventListeners.bind(this);
    this.patchTimers = this.patchTimers.bind(this);
    this.patchNetworkRequests = this.patchNetworkRequests.bind(this);
    this.checkMemory = this.checkMemory.bind(this);
    this.generateReport = this.generateReport.bind(this);
  }

  /**
   * 🚀 Start monitoring for memory leaks
   */
  start() {
    if (this.isMonitoring) {
      console.warn("🕵️‍♂️ Memory Leak Detective already running!");
      return;
    }

    console.log(`
🕵️‍♂️ MEMORY LEAK DETECTIVE STARTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Monitoring: Event Listeners, Timers, DOM, Network, Memory
📊 Reports every: ${this.config.reportInterval / 1000}s
🚨 Will alert if listeners exceed: ${this.config.alertThresholds.eventListeners}

Available Console Commands:
• detective.report() - Generate immediate report
• detective.analyzeListenerLeaks() - Detailed listener leak analysis
• detective.showActiveListeners() - Show all active listeners with source info
• detective.showListenerHistory() - Show recent listener add/remove history
• detective.findListenersInFile(fileName) - Find listeners from specific file
• detective.testListeners() - Add test listeners
• detective.testTimers() - Create test timers  
• detective.cleanup() - Emergency cleanup
• detective.memoryProfile() - Detailed memory analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    this.isMonitoring = true;
    this.startTime = Date.now();
    
    // 🔧 Patch browser APIs to track usage
    this.patchEventListeners();
    this.patchTimers();
    this.patchNetworkRequests();
    this.setupDOMObserver();
    this.captureInitialState();
    
    // ⏰ Start periodic monitoring
    this.reportTimer = setInterval(() => this.generateReport(), this.config.reportInterval);
    this.memoryTimer = setInterval(() => this.checkMemory(), this.config.memoryCheckInterval);
    
    // 🌐 Expose to window for console access
    window.detective = this;
    
    // 🔧 Debug: Confirm detective is available
    console.log("🔧 Detective instance exposed to window.detective");
    
    // 🎯 Initial memory snapshot
    this.checkMemory();
    
    console.log("✅ Memory Leak Detective is now monitoring your app!");
  }

  /**
   * 🛑 Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) return;

    console.log("🛑 Stopping Memory Leak Detective...");
    
    // Restore original functions
    EventTarget.prototype.addEventListener = this.originals.addEventListener;
    EventTarget.prototype.removeEventListener = this.originals.removeEventListener;
    window.setTimeout = this.originals.setTimeout;
    window.setInterval = this.originals.setInterval;
    window.clearTimeout = this.originals.clearTimeout;
    window.clearInterval = this.originals.clearInterval;
    window.fetch = this.originals.fetch;

    // Clean up our own timers
    if (this.reportTimer) clearInterval(this.reportTimer);
    if (this.memoryTimer) clearInterval(this.memoryTimer);
    if (this.stats.domNodes.observer) this.stats.domNodes.observer.disconnect();

    this.isMonitoring = false;
    delete window.detective;
    
    console.log("✅ Memory Leak Detective stopped");
  }

  /**
   * 🎯 Patch addEventListener/removeEventListener to track listeners
   */
  patchEventListeners() {
    const detective = this;

    EventTarget.prototype.addEventListener = function(type, listener, options) {
      // Call original function first
      detective.originals.addEventListener.call(this, type, listener, options);
      
      // 🔍 Parse stack trace for detailed source tracking
      const stack = new Error().stack || '';
      const stackLines = stack.split('\n');
      const sourceInfo = detective.parseStackTrace(stackLines);
      
      const isFirebaseInternal = stack.includes('firebase_auth.js') || 
                                stack.includes('firebase') || 
                                stack.includes('_addListener') ||
                                stack.includes('startPolling');
      
      // Create unique identifier for this listener
      const listenerKey = `${type}_${this.constructor.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Track the listener
      detective.stats.eventListeners.added++;
      detective.stats.eventListeners.active++;
      
      // Track by type
      const typeCount = detective.stats.eventListeners.types.get(type) || 0;
      detective.stats.eventListeners.types.set(type, typeCount + 1);
      
      // Track by element type
      const elementType = this.constructor.name || 'Unknown';
      const elemCount = detective.stats.eventListeners.elements.get(elementType) || 0;
      detective.stats.eventListeners.elements.set(elementType, elemCount + 1);

      // Track by source file
      if (sourceInfo.fileName) {
        const fileCount = detective.stats.eventListeners.sourceFiles.get(sourceInfo.fileName) || 0;
        detective.stats.eventListeners.sourceFiles.set(sourceInfo.fileName, fileCount + 1);
      }

      // Comprehensive listener tracking
      const listenerDetails = {
        key: listenerKey,
        type,
        elementType,
        element: this,
        listener,
        options,
        timestamp: Date.now(),
        isFirebase: isFirebaseInternal,
        sourceInfo,
        status: 'active',
        stackTrace: detective.config.verbose && !isFirebaseInternal ? stack : null
      };

      // Store active listener
      detective.stats.eventListeners.activeListeners.set(listenerKey, listenerDetails);
      
      // Store in history
      detective.stats.eventListeners.listenerHistory.push({
        ...listenerDetails,
        action: 'added'
      });
      
      // Detect potential leaky patterns
      detective.detectLeakyPatterns(listenerDetails);

      // Store details for debugging (limit to last 100 for performance)
      detective.stats.eventListeners.details.push(listenerDetails);
      
      if (detective.stats.eventListeners.details.length > 100) {
        detective.stats.eventListeners.details.shift();
      }

      // 🚨 Alert if threshold exceeded (but not for Firebase internal spam)
      if (detective.stats.eventListeners.active > detective.config.alertThresholds.eventListeners && !isFirebaseInternal) {
        console.warn(`🚨 MEMORY LEAK ALERT: ${detective.stats.eventListeners.active} active listeners!`);
        console.log('🔍 Recent listeners:', detective.getRecentListeners(10));
      }
    };

    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      detective.originals.removeEventListener.call(this, type, listener, options);
      
      // Find and mark listener as removed
      let removedListener = null;
      for (const [key, listenerData] of detective.stats.eventListeners.activeListeners.entries()) {
        if (listenerData.type === type && 
            listenerData.listener === listener && 
            listenerData.element === this) {
          removedListener = { ...listenerData };
          removedListener.status = 'removed';
          removedListener.removedAt = Date.now();
          detective.stats.eventListeners.activeListeners.delete(key);
          break;
        }
      }
      
      detective.stats.eventListeners.removed++;
      detective.stats.eventListeners.active = Math.max(0, detective.stats.eventListeners.active - 1);
      
      // Decrease type counter
      const typeCount = detective.stats.eventListeners.types.get(type) || 0;
      detective.stats.eventListeners.types.set(type, Math.max(0, typeCount - 1));
      
      // Decrease element counter
      const elementType = this.constructor.name || 'Unknown';
      const elemCount = detective.stats.eventListeners.elements.get(elementType) || 0;
      detective.stats.eventListeners.elements.set(elementType, Math.max(0, elemCount - 1));

      // Track removal in history
      if (removedListener) {
        detective.stats.eventListeners.listenerHistory.push({
          ...removedListener,
          action: 'removed'
        });
      }
    };
  }

  /**
   * ⏲️ Patch setTimeout/setInterval to track timers
   */
  patchTimers() {
    const detective = this;

    window.setTimeout = function(callback, delay, ...args) {
      const id = detective.originals.setTimeout.call(this, (...args) => {
        detective.stats.timers.timeouts.delete(id);
        detective.stats.timers.activeCount--;
        return callback.apply(this, args);
      }, delay, ...args);

      detective.stats.timers.timeouts.add(id);
      detective.stats.timers.activeCount++;
      detective.stats.timers.details.push({
        type: 'timeout',
        id,
        delay,
        timestamp: Date.now(),
        stack: detective.config.verbose ? new Error().stack : null
      });

      return id;
    };

    window.setInterval = function(callback, interval, ...args) {
      const id = detective.originals.setInterval.call(this, callback, interval, ...args);
      
      detective.stats.timers.intervals.add(id);
      detective.stats.timers.activeCount++;
      detective.stats.timers.details.push({
        type: 'interval',
        id,
        interval,
        timestamp: Date.now(),
        stack: detective.config.verbose ? new Error().stack : null
      });

      return id;
    };

    window.clearTimeout = function(id) {
      detective.originals.clearTimeout.call(this, id);
      if (detective.stats.timers.timeouts.delete(id)) {
        detective.stats.timers.activeCount--;
      }
    };

    window.clearInterval = function(id) {
      detective.originals.clearInterval.call(this, id);
      if (detective.stats.timers.intervals.delete(id)) {
        detective.stats.timers.activeCount--;
      }
    };
  }

  /**
   * 🌐 Patch fetch to track network requests
   */
  patchNetworkRequests() {
    const detective = this;

    window.fetch = function(...args) {
      const request = {
        url: args[0],
        timestamp: Date.now(),
        id: Math.random().toString(36).substring(2, 11)
      };

      detective.stats.networkRequests.pending.add(request);

      return detective.originals.fetch.apply(this, args)
        .then(response => {
          detective.stats.networkRequests.pending.delete(request);
          detective.stats.networkRequests.completed++;
          return response;
        })
        .catch(error => {
          detective.stats.networkRequests.pending.delete(request);
          detective.stats.networkRequests.failed++;
          throw error;
        });
    };
  }

  /**
   * 👁️ Setup DOM mutation observer
   */
  setupDOMObserver() {
    if (!window.MutationObserver) return;

    this.stats.domNodes.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        this.stats.domNodes.created += mutation.addedNodes.length;
        this.stats.domNodes.removed += mutation.removedNodes.length;
        this.stats.domNodes.net = this.stats.domNodes.created - this.stats.domNodes.removed;
      });
    });

    this.stats.domNodes.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 🔍 Parse stack trace to get source file and line information
   */
  parseStackTrace(stackLines) {
    // Look for the first line that contains our application code (not browser internals)
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i];
      
      // Skip internal browser functions and our own patching code
      if (line.includes('at EventTarget.addEventListener') ||
          line.includes('at MemoryLeakDetective') ||
          line.includes('at Object.addEventListener') ||
          line.includes('chrome-extension://') ||
          line.includes('extensions::')) {
        continue;
      }
      
      // Extract file name and line number using regex
      const match = line.match(/at (?:.*?\s+)?\(?(.+):(\d+):(\d+)\)?/);
      if (match) {
        const fullPath = match[1];
        const lineNumber = match[2];
        const columnNumber = match[3];
        
        // Extract just the filename from the full path
        const fileName = fullPath.split('/').pop() || fullPath;
        
        return {
          fileName,
          fullPath,
          lineNumber: parseInt(lineNumber),
          columnNumber: parseInt(columnNumber),
          stackLine: line.trim()
        };
      }
    }
    
    return {
      fileName: 'unknown',
      fullPath: 'unknown',
      lineNumber: 0,
      columnNumber: 0,
      stackLine: 'No stack trace available'
    };
  }

  /**
   * 🚨 Detect patterns that might indicate memory leaks
   */
  detectLeakyPatterns(listenerDetails) {
    const { type, elementType, sourceInfo } = listenerDetails;
    
    // Pattern 1: Same event type from same source file added repeatedly
    const patternKey = `${type}_${elementType}_${sourceInfo.fileName}`;
    const count = this.stats.eventListeners.leakyPatterns.get(patternKey) || 0;
    this.stats.eventListeners.leakyPatterns.set(patternKey, count + 1);
    
    // Alert if we see too many of the same pattern
    if (count > 20) {
      console.warn(`🚨 POTENTIAL LEAK PATTERN: ${type} listeners on ${elementType} from ${sourceInfo.fileName} (${count + 1} times)`);
      console.log(`🔍 Source: ${sourceInfo.fileName}:${sourceInfo.lineNumber}`);
    }
  }

  /**
   * 📋 Get recent listeners for debugging
   */
  getRecentListeners(count = 10) {
    return Array.from(this.stats.eventListeners.activeListeners.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
      .map(listener => ({
        type: listener.type,
        element: listener.elementType,
        source: `${listener.sourceInfo.fileName}:${listener.sourceInfo.lineNumber}`,
        age: `${((Date.now() - listener.timestamp) / 1000).toFixed(1)}s ago`,
        isFirebase: listener.isFirebase
      }));
  }

  /**
   * 🔍 Analyze listener leaks and provide detailed report
   */
  analyzeListenerLeaks() {
    console.group('🕵️‍♂️ DETAILED LISTENER LEAK ANALYSIS');
    
    // Active listeners by source file
    console.group('📁 Active Listeners by Source File');
    const fileStats = new Map();
    for (const listener of this.stats.eventListeners.activeListeners.values()) {
      if (!listener.isFirebase) {
        const file = listener.sourceInfo.fileName;
        const stats = fileStats.get(file) || { count: 0, types: new Set() };
        stats.count++;
        stats.types.add(listener.type);
        fileStats.set(file, stats);
      }
    }
    
    const sortedFiles = Array.from(fileStats.entries())
      .sort(([,a], [,b]) => b.count - a.count);
    
    sortedFiles.forEach(([file, stats]) => {
      console.log(`📄 ${file}: ${stats.count} listeners`);
      console.log(`   Event types: ${Array.from(stats.types).join(', ')}`);
    });
    console.groupEnd();
    
    // Leaky patterns analysis
    console.group('🚨 Potential Leak Patterns');
    const sortedPatterns = Array.from(this.stats.eventListeners.leakyPatterns.entries())
      .filter(([, count]) => count > 5)
      .sort(([,a], [,b]) => b - a);
    
    if (sortedPatterns.length > 0) {
      sortedPatterns.forEach(([pattern, count]) => {
        const [type, element, file] = pattern.split('_');
        console.warn(`🔴 ${file}: ${count}x ${type} on ${element}`);
      });
    } else {
      console.log('✅ No concerning leak patterns detected');
    }
    console.groupEnd();
    
    // Listeners that have been active for a long time
    console.group('⏰ Long-Running Listeners');
    const oldListeners = Array.from(this.stats.eventListeners.activeListeners.values())
      .filter(listener => !listener.isFirebase && (Date.now() - listener.timestamp) > 300000) // 5 minutes
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 10);
    
    if (oldListeners.length > 0) {
      oldListeners.forEach(listener => {
        const ageMinutes = ((Date.now() - listener.timestamp) / 60000).toFixed(1);
        console.log(`🕐 ${listener.type} on ${listener.elementType} - ${ageMinutes}m old`);
        console.log(`   Source: ${listener.sourceInfo.fileName}:${listener.sourceInfo.lineNumber}`);
      });
    } else {
      console.log('✅ No long-running listeners detected');
    }
    console.groupEnd();
    
    // Unmatched removals (listeners removed but we couldn't find them)
    const unmatchedRemovals = this.stats.eventListeners.listenerHistory
      .filter(entry => entry.action === 'removed' && !entry.key);
    
    if (unmatchedRemovals.length > 0) {
      console.group('❓ Unmatched Listener Removals');
      console.warn(`Found ${unmatchedRemovals.length} removeEventListener calls that couldn't be matched to tracked listeners`);
      console.log('This might indicate listeners added before tracking started or complex listener management');
      console.groupEnd();
    }
    
    console.groupEnd();
  }

  /**
   * 📸 Capture initial state for comparison
   */
  captureInitialState() {
    // Capture initial global variables
    for (let key in window) {
      if (window.hasOwnProperty(key)) {
        this.stats.globalVariables.initial.add(key);
      }
    }

    // Capture initial stylesheets
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        this.stats.cssLeaks.stylesheets.add(sheet.href || 'inline');
      } catch (e) {
        // Cross-origin stylesheets can't be accessed
      }
    });
  }

  /**
   * 🧠 Check memory usage
   */
  checkMemory() {
    if (!performance.memory) {
      return; // Not available in all browsers
    }

    const memory = {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      timestamp: Date.now()
    };

    if (!this.stats.memory.initial) {
      this.stats.memory.initial = { ...memory };
    }

    this.stats.memory.current = memory;
    
    if (!this.stats.memory.peak || memory.used > this.stats.memory.peak.used) {
      this.stats.memory.peak = { ...memory };
    }

    // Store history (keep last 50 entries)
    this.stats.memory.history.push(memory);
    if (this.stats.memory.history.length > 50) {
      this.stats.memory.history.shift();
    }

    // Alert on excessive memory usage
    const growth = memory.used - this.stats.memory.initial.used;
    if (growth > this.config.alertThresholds.memory) {
      console.warn(`🧠 MEMORY ALERT: ${(growth / 1024 / 1024).toFixed(1)}MB growth detected!`);
    }
  }

  /**
   * 📊 Generate immediate report (public method for console use)
   */
  report() {
    return this.generateReport();
  }

  /**
   * 📈 Memory profiling (public method for console use)
   */
  memoryProfile() {
    if (!performance.memory) {
      console.warn("Memory profiling not available in this browser");
      return;
    }

    console.group("📈 DETAILED MEMORY PROFILE");
    
    const memory = this.stats.memory.current;
    const initial = this.stats.memory.initial;
    
    console.log("Current Memory Stats:");
    console.table({
      "Used Heap": `${(memory.used / 1024 / 1024).toFixed(2)} MB`,
      "Total Heap": `${(memory.total / 1024 / 1024).toFixed(2)} MB`,
      "Heap Limit": `${(memory.limit / 1024 / 1024).toFixed(2)} MB`,
      "Growth": `${((memory.used - initial.used) / 1024 / 1024).toFixed(2)} MB`,
      "Utilization": `${((memory.used / memory.total) * 100).toFixed(1)}%`
    });

    if (this.stats.memory.history.length > 10) {
      console.log("Memory History (last 10 checks):");
      const recentHistory = this.stats.memory.history.slice(-10).map((entry, index) => ({
        check: index + 1,
        used: `${(entry.used / 1024 / 1024).toFixed(2)} MB`,
        change: index > 0 ? 
          `${(((entry.used - this.stats.memory.history[this.stats.memory.history.length - 10 + index - 1].used) / 1024 / 1024)).toFixed(2)} MB` : 
          "baseline"
      }));
      console.table(recentHistory);
    }

    console.groupEnd();
  }

  /**
   * 📊 Generate comprehensive report
   */
  generateReport() {
    const uptime = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
    
    console.group(`🕵️‍♂️ MEMORY LEAK DETECTIVE REPORT (${uptime}m uptime)`);
    
    // Enhanced Event Listeners Report
    console.group("🎧 Event Listeners (Enhanced Tracking)");
    console.log(`Active: ${this.stats.eventListeners.active} | Added: ${this.stats.eventListeners.added} | Removed: ${this.stats.eventListeners.removed}`);
    console.log(`Tracked Active: ${this.stats.eventListeners.activeListeners.size} | History Entries: ${this.stats.eventListeners.listenerHistory.length}`);
    
    if (this.stats.eventListeners.types.size > 0) {
      console.log("Most common types:", 
        Array.from(this.stats.eventListeners.types.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
      );
    }
    
    if (this.stats.eventListeners.elements.size > 0) {
      console.log("Most common elements:", 
        Array.from(this.stats.eventListeners.elements.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
      );
    }

    // Source file breakdown
    if (this.stats.eventListeners.sourceFiles.size > 0) {
      console.log("Top source files:", 
        Array.from(this.stats.eventListeners.sourceFiles.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
      );
    }

    // Show potential leak patterns
    const leakyPatterns = Array.from(this.stats.eventListeners.leakyPatterns.entries())
      .filter(([, count]) => count > 10)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
    
    if (leakyPatterns.length > 0) {
      console.warn("🚨 Potential leak patterns:");
      leakyPatterns.forEach(([pattern, count]) => {
        const [type, element, file] = pattern.split('_');
        console.warn(`   ${file}: ${count}x ${type} on ${element}`);
      });
    }

    // Show recent listeners (non-Firebase)
    const recentNonFirebase = this.getRecentListeners(5).filter(l => !l.isFirebase);
    if (recentNonFirebase.length > 0) {
      console.log("Recent listeners (non-Firebase):");
      recentNonFirebase.forEach(listener => {
        console.log(`   ${listener.type} on ${listener.element} (${listener.source}) - ${listener.age}`);
      });
    }
    
    console.groupEnd();

    // Timers Report
    console.group("⏲️ Timers");
    console.log(`Active: ${this.stats.timers.activeCount} | Intervals: ${this.stats.timers.intervals.size} | Timeouts: ${this.stats.timers.timeouts.size}`);
    if (this.stats.timers.activeCount > this.config.alertThresholds.timers) {
      console.warn(`🚨 HIGH TIMER COUNT: ${this.stats.timers.activeCount} active timers!`);
    }
    console.groupEnd();

    // DOM Nodes Report
    console.group("🏗️ DOM Nodes");
    console.log(`Net change: ${this.stats.domNodes.net} | Created: ${this.stats.domNodes.created} | Removed: ${this.stats.domNodes.removed}`);
    if (Math.abs(this.stats.domNodes.net) > this.config.alertThresholds.domNodes) {
      console.warn(`🚨 DOM GROWTH: ${this.stats.domNodes.net} net nodes created!`);
    }
    console.groupEnd();

    // Network Report
    console.group("🌐 Network Requests");
    console.log(`Pending: ${this.stats.networkRequests.pending.size} | Completed: ${this.stats.networkRequests.completed} | Failed: ${this.stats.networkRequests.failed}`);
    if (this.stats.networkRequests.pending.size > 0) {
      console.warn("Pending requests:", Array.from(this.stats.networkRequests.pending).map(r => r.url));
    }
    console.groupEnd();

    // Memory Report
    if (this.stats.memory.current) {
      console.group("🧠 Memory Usage");
      const current = this.stats.memory.current;
      const initial = this.stats.memory.initial;
      const growth = current.used - initial.used;
      
      console.log(`Current: ${(current.used / 1024 / 1024).toFixed(1)}MB | Growth: ${(growth / 1024 / 1024).toFixed(1)}MB`);
      console.log(`Peak: ${(this.stats.memory.peak.used / 1024 / 1024).toFixed(1)}MB | Limit: ${(current.limit / 1024 / 1024).toFixed(1)}MB`);
      
      if (growth > 10 * 1024 * 1024) { // 10MB
        console.warn(`🚨 MEMORY GROWTH: ${(growth / 1024 / 1024).toFixed(1)}MB increase!`);
      }
      console.groupEnd();
    }

    // Summary & Health Score
    let healthScore = 100;
    const issues = [];
    
    if (this.stats.eventListeners.active > 50) {
      healthScore -= 20;
      issues.push("High listener count");
    }
    
    if (this.stats.timers.activeCount > 10) {
      healthScore -= 15;
      issues.push("Many active timers");
    }
    
    if (Math.abs(this.stats.domNodes.net) > 500) {
      healthScore -= 15;
      issues.push("DOM growth");
    }
    
    if (this.stats.networkRequests.pending.size > 0) {
      healthScore -= 10;
      issues.push("Pending requests");
    }

    const healthEmoji = healthScore >= 90 ? "🟢" : healthScore >= 70 ? "🟡" : "🔴";
    console.log(`${healthEmoji} App Health Score: ${healthScore}/100`);
    
    if (issues.length > 0) {
      console.warn("Issues detected:", issues.join(", "));
    }

    console.groupEnd();
  }

  /**
   * 📋 Show all active listeners with detailed source information
   */
  showActiveListeners(filterFirebase = true) {
    console.group('📋 ACTIVE LISTENERS DETAILED VIEW');
    
    const listeners = Array.from(this.stats.eventListeners.activeListeners.values())
      .filter(listener => filterFirebase ? !listener.isFirebase : true)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (listeners.length === 0) {
      console.log('No active listeners found (excluding Firebase)');
      console.groupEnd();
      return;
    }
    
    console.log(`Found ${listeners.length} active listeners:`);
    
    listeners.forEach((listener, index) => {
      const age = ((Date.now() - listener.timestamp) / 1000).toFixed(1);
      console.group(`${index + 1}. ${listener.type} on ${listener.elementType}`);
      console.log(`📄 Source: ${listener.sourceInfo.fileName}:${listener.sourceInfo.lineNumber}`);
      console.log(`⏰ Age: ${age}s`);
      console.log(`🎯 Element: ${listener.elementType}`);
      if (listener.options && typeof listener.options !== 'boolean') {
        console.log(`⚙️ Options:`, listener.options);
      }
      console.groupEnd();
    });
    
    console.groupEnd();
  }

  /**
   * 📜 Show listener history (add/remove events)
   */
  showListenerHistory(count = 20) {
    console.group('📜 LISTENER HISTORY');
    
    const history = this.stats.eventListeners.listenerHistory
      .slice(-count)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    console.log(`Last ${count} listener events:`);
    
    history.forEach((event, index) => {
      const age = ((Date.now() - event.timestamp) / 1000).toFixed(1);
      const icon = event.action === 'added' ? '➕' : '➖';
      const color = event.action === 'added' ? 'color: green' : 'color: red';
      
      console.log(
        `${icon} %c${event.action.toUpperCase()}%c ${event.type} on ${event.elementType} (${age}s ago)`,
        color,
        'color: inherit'
      );
      console.log(`   📄 ${event.sourceInfo.fileName}:${event.sourceInfo.lineNumber}`);
    });
    
    console.groupEnd();
  }

  /**
   * 🔍 Find listeners from a specific file
   */
  findListenersInFile(fileName) {
    console.group(`🔍 LISTENERS FROM ${fileName}`);
    
    const listeners = Array.from(this.stats.eventListeners.activeListeners.values())
      .filter(listener => listener.sourceInfo.fileName.includes(fileName))
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (listeners.length === 0) {
      console.log(`No active listeners found from files containing "${fileName}"`);
      console.groupEnd();
      return;
    }
    
    console.log(`Found ${listeners.length} active listeners:`);
    
    // Group by exact file and line
    const byLocation = new Map();
    listeners.forEach(listener => {
      const key = `${listener.sourceInfo.fileName}:${listener.sourceInfo.lineNumber}`;
      const list = byLocation.get(key) || [];
      list.push(listener);
      byLocation.set(key, list);
    });
    
    Array.from(byLocation.entries()).forEach(([location, listenerList]) => {
      console.group(`📍 ${location} (${listenerList.length} listeners)`);
      
      // Group by event type
      const typeGroups = new Map();
      listenerList.forEach(listener => {
        const typeList = typeGroups.get(listener.type) || [];
        typeList.push(listener);
        typeGroups.set(listener.type, typeList);
      });
      
      Array.from(typeGroups.entries()).forEach(([type, typeList]) => {
        console.log(`🎯 ${type}: ${typeList.length} listeners on ${typeList[0].elementType}`);
        
        if (typeList.length > 5) {
          console.warn(`⚠️ Many listeners of same type - potential leak?`);
        }
      });
      
      console.groupEnd();
    });
    
    console.groupEnd();
  }

  /**
   * 🧪 Test functions for manual testing
   */
  testListeners(count = 10) {
    console.log(`🧪 Adding ${count} test event listeners...`);
    
    for (let i = 0; i < count; i++) {
      const element = document.body;
      const handler = () => console.log(`Test listener ${i} fired`);
      element.addEventListener('click', handler);
      
      // Don't clean these up immediately - let them accumulate
    }
    
    console.log(`✅ Added ${count} test listeners. Check report for accumulation.`);
  }

  testTimers(count = 5) {
    console.log(`🧪 Creating ${count} test timers...`);
    
    for (let i = 0; i < count; i++) {
      // Create intervals that run forever (memory leak!)
      setInterval(() => {
        console.log(`Test timer ${i} - ${Date.now()}`);
      }, 10000 + (i * 1000));
      
      // Create timeouts with long delays
      setTimeout(() => {
        console.log(`Test timeout ${i} completed`);
      }, 60000 + (i * 5000));
    }
    
    console.log(`✅ Created ${count} test timers. Check report for timer count.`);
  }

  testDOMLeaks(count = 100) {
    console.log(`🧪 Creating ${count} DOM nodes...`);
    
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.innerHTML = `Test node ${i}`;
      div.style.display = 'none';
      document.body.appendChild(div);
      
      // Add listeners to each node (double whammy!)
      div.addEventListener('click', () => console.log(`Node ${i} clicked`));
    }
    
    console.log(`✅ Created ${count} DOM nodes with listeners. Check report for growth.`);
  }

  /**
   * 🧹 Emergency cleanup function
   */
  cleanup() {
    console.log("🧹 Emergency cleanup starting...");
    
    // Clear all test timers
    let clearedIntervals = 0;
    let clearedTimeouts = 0;
    
    this.stats.timers.intervals.forEach(id => {
      clearInterval(id);
      clearedIntervals++;
    });
    
    this.stats.timers.timeouts.forEach(id => {
      clearTimeout(id);
      clearedTimeouts++;
    });
    
    console.log(`✅ Cleaned up ${clearedIntervals} intervals and ${clearedTimeouts} timeouts`);
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
      console.log("✅ Forced garbage collection");
    }
    
    // Generate report after cleanup
    setTimeout(() => this.generateReport(), 1000);
  }

  /**
   * 📈 Detailed memory profiling
   */
  memoryProfile() {
    if (!performance.memory) {
      console.warn("Memory profiling not available in this browser");
      return;
    }

    console.group("📈 DETAILED MEMORY PROFILE");
    
    const memory = this.stats.memory.current;
    const initial = this.stats.memory.initial;
    
    console.log("Current Memory Stats:");
    console.table({
      "Used Heap": `${(memory.used / 1024 / 1024).toFixed(2)} MB`,
      "Total Heap": `${(memory.total / 1024 / 1024).toFixed(2)} MB`,
      "Heap Limit": `${(memory.limit / 1024 / 1024).toFixed(2)} MB`,
      "Growth": `${((memory.used - initial.used) / 1024 / 1024).toFixed(2)} MB`,
      "Utilization": `${((memory.used / memory.total) * 100).toFixed(1)}%`
    });

    if (this.stats.memory.history.length > 10) {
      console.log("Memory History (last 10 checks):");
      const recentHistory = this.stats.memory.history.slice(-10).map((entry, index) => ({
        check: index + 1,
        used: `${(entry.used / 1024 / 1024).toFixed(2)} MB`,
        change: index > 0 ? 
          `${(((entry.used - this.stats.memory.history[this.stats.memory.history.length - 10 + index - 1].used) / 1024 / 1024)).toFixed(2)} MB` : 
          "baseline"
      }));
      console.table(recentHistory);
    }

    console.groupEnd();
  }

  /**
   * 📱 Manual test plan for user
   */
  static getTestPlan() {
    return `
🧪 ENHANCED MEMORY LEAK TEST PLAN WITH SOURCE TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Establish Baseline
• Open browser DevTools (F12)
• Run: detective.report()
• Run: detective.showActiveListeners()
• Note initial listener count and source files

STEP 2: Test Event Listener Accumulation with Source Tracking
• Navigate: Home → Friends → Home → Friends (repeat 5 times)
• Run: detective.report()
• Run: detective.analyzeListenerLeaks()
• Expected: Listener count should stay stable or grow minimally
• 🚨 If listeners keep growing = MEMORY LEAK DETECTED!
• Use: detective.findListenersInFile('HomePage.js') to find specific leaks

STEP 3: Identify Problematic Files
• Run: detective.showListenerHistory(50)
• Look for files that keep adding listeners without removing them
• Use: detective.findListenersInFile('YourSuspiciousFile.js')
• Check which specific lines are creating listeners

STEP 4: Test Timer Leaks
• Run: detective.testTimers(3)
• Wait 30 seconds
• Run: detective.report()
• Expected: Should show 3+ active timers
• Run: detective.cleanup()
• Expected: Timer count should decrease

STEP 5: Deep Listener Analysis
• Run: detective.analyzeListenerLeaks()
• Check for:
  - Long-running listeners (>5 minutes old)
  - Potential leak patterns (same file/type repeated)
  - Unmatched removals

STEP 6: File-Specific Leak Detection
• Test each major file: 
  - detective.findListenersInFile('FriendsPage.js')
  - detective.findListenersInFile('HomePage.js') 
  - detective.findListenersInFile('HorizontalFriendsBar.js')
• Look for accumulation patterns

STEP 7: Real Navigation Test
• Navigate between pages 10 times
• After each navigation, run: detective.showActiveListeners()
• Monitor which files are accumulating listeners
• Focus on listeners that don't get cleaned up

🎯 NEW SUCCESS CRITERIA:
✅ Event listeners don't continuously accumulate
✅ Each file cleans up its listeners on page changes
✅ No long-running listeners (>10 minutes) from app files
✅ Leak patterns show <10 repeated listener types per file
✅ Memory growth stays under control (<20MB)
✅ Source files are properly identified in reports

🔍 ENHANCED DEBUGGING COMMANDS:
• detective.analyzeListenerLeaks() - Full leak analysis
• detective.showActiveListeners() - All active listeners with sources
• detective.showListenerHistory(30) - Recent add/remove events
• detective.findListenersInFile('fileName') - File-specific analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;
  }
}

// 🚀 Auto-start in development mode
if (import.meta.env?.DEV || window.location.hostname === 'localhost') {
  const detective = new MemoryLeakDetective();
  
  // 🎯 Expose globally for console access IMMEDIATELY
  window.MemoryLeakDetective = MemoryLeakDetective;
  window.detective = detective;
  
  console.log("🔧 Detective instance created and exposed globally");
  console.log("📍 Available commands: window.detective.report(), window.detective.testListeners(), etc.");
  
  // Add some delay to ensure app is loaded, then start monitoring
  setTimeout(() => {
    detective.start();
    console.log("🕵️‍♂️ Detective started monitoring!");
    console.log(MemoryLeakDetective.getTestPlan());
  }, 2000); // Increased delay to ensure Firebase init is complete
}

export default MemoryLeakDetective;