// Security event logging and monitoring
export class SecurityLogger {
  constructor() {
    this.events = [];
    this.maxEvents = 1000;
    this.sensitiveFields = ["password", "token", "key", "secret"];
  }

  log(event, data = {}, level = "info") {
    const sanitizedData = this.sanitizeData(data);

    const logEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      event: event,
      level: level,
      data: sanitizedData,
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.getSessionId(),
    };

    this.events.push(logEntry);

    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Console output for development
    if (level === "error" || level === "security") {
      console.error("Security Event:", logEntry);
    } else {
      console.log("Security Event:", logEntry);
    }

    // Send to monitoring service (implement in later phases)
    this.sendToMonitoring(logEntry);
  }

  sanitizeData(data) {
    const sanitized = { ...data };

    this.sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    return sanitized;
  }

  generateId() {
    return "sec_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  getSessionId() {
    let sessionId = sessionStorage.getItem("meetchuthere_session_id");
    if (!sessionId) {
      sessionId =
        "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem("meetchuthere_session_id", sessionId);
    }
    return sessionId;
  }

  sendToMonitoring(logEntry) {
    // Placeholder for monitoring service integration
    // Will be implemented with Cloud Functions in later phases
    if (logEntry.level === "security" || logEntry.level === "error") {
      // Store in localStorage for now, send to server later
      const alertKey = "meetchuthere_security_alerts";
      const alerts = JSON.parse(localStorage.getItem(alertKey) || "[]");
      alerts.push(logEntry);
      localStorage.setItem(alertKey, JSON.stringify(alerts.slice(-100)));
    }
  }

  // Security event helpers
  logAuthAttempt(email, success, error = null) {
    this.log(
      "auth_attempt",
      {
        email: email,
        success: success,
        error: error?.message,
      },
      success ? "info" : "security"
    );
  }

  logSuspiciousActivity(activity, details) {
    this.log(
      "suspicious_activity",
      {
        activity: activity,
        details: details,
      },
      "security"
    );
  }

  logRateLimitHit(endpoint, attempts) {
    this.log(
      "rate_limit_hit",
      {
        endpoint: endpoint,
        attempts: attempts,
      },
      "security"
    );
  }

  // Get security report
  getSecurityReport() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentEvents = this.events.filter(
      (event) => new Date(event.timestamp) > last24h
    );

    const securityEvents = recentEvents.filter(
      (event) => event.level === "security" || event.level === "error"
    );

    return {
      totalEvents: recentEvents.length,
      securityEvents: securityEvents.length,
      events: securityEvents.slice(-50), // Last 50 security events
    };
  }
}

// Initialize security logger
export const securityLogger = new SecurityLogger();
window.securityLogger = securityLogger; // Make globally available for debugging
