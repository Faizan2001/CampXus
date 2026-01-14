/**
 * LiveEventsSection - "Mother Card" design for live events on Clubs tab
 *
 * Per PRD Section 4.1 - Mother Card UX:
 *
 * This is a PERMANENT card at the top of the Clubs page that:
 * - Shows "X events live now" count with pulsing indicator
 * - ACTIVE state: colorful gradient + glow when ≥1 live event
 * - INACTIVE state: greyed out subtle card when 0 live events
 * - Contains a horizontal carousel of live event cards when active
 * - Has expandable dropdown sections for Upcoming and Past events
 *
 * LIVE events are those that:
 * - isLive === true (officially started by an official), OR
 * - Currently within their time window (auto-live)
 *
 * Display differences:
 * - "LIVE" badge (red pulsing) - auto-live because in time window
 * - "OFFICIALLY LIVE" badge (green) - official confirmed event started
 *
 * Event becomes PAST when:
 * - Official clicks "End Event", OR
 * - 24h after event end time (PRD Q8)
 */

import { currentUser } from "../../store/userStore.js";
import { logManager } from "../../utils/debug/LogManager.js";

export class LiveEventsSection {
  constructor(options = {}) {
    this.container = options.container;
    this.universityCode = options.universityCode || "iub";
    this.onEventClick = options.onEventClick || (() => {});
    this.onClubClick = options.onClubClick || (() => {});

    this.events = { live: [], upcoming: [], past: [] };
    this.clubs = new Map(); // Cache club data
    this.refreshInterval = null;
    this.isDestroyed = false; // Flag to prevent updates after destroy
    this.isLoading = false; // Bug #25: Flag to prevent concurrent loadEvents calls

    // Dropdown state
    this.upcomingExpanded = false;
    this.pastExpanded = false;
  }

  /**
   * Initialize and render the section
   */
  async init() {
    await this.loadEvents();
    this.render();
    this.bindEvents();
    this.startAutoRefresh();
  }

  /**
   * Load events that are live, happening now, upcoming, or recently past
   */
  async loadEvents() {
    // Bug #25: Prevent concurrent loadEvents calls
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { collection, query, where, getDocs, orderBy, Timestamp } =
        await import("firebase/firestore");

      // Get all approved events from all clubs
      const now = new Date();
      const threeDaysFromNow = new Date(
        now.getTime() + 3 * 24 * 60 * 60 * 1000
      );
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // First, get all clubs for this university
      // Try universityCode first, then fallback to university field
      let clubsSnap;
      const clubsQueryByCode = query(
        collection(db, "clubs"),
        where("universityCode", "==", this.universityCode)
      );
      clubsSnap = await getDocs(clubsQueryByCode);

      // If no clubs found by universityCode, try university field as fallback
      if (clubsSnap.empty) {
        const clubsQueryByName = query(
          collection(db, "clubs"),
          where("university", "==", this.universityCode)
        );
        clubsSnap = await getDocs(clubsQueryByName);
      }

      this.clubs.clear();
      const allEvents = [];

      for (const clubDoc of clubsSnap.docs) {
        const clubData = { id: clubDoc.id, ...clubDoc.data() };
        this.clubs.set(clubDoc.id, clubData);

        // Get approved events for this club
        const eventsQuery = query(
          collection(db, "clubs", clubDoc.id, "events"),
          where("status", "==", "approved")
        );

        const eventsSnap = await getDocs(eventsQuery);
        for (const eventDoc of eventsSnap.docs) {
          allEvents.push({
            id: eventDoc.id,
            clubId: clubDoc.id,
            club: clubData,
            ...eventDoc.data(),
          });
        }
      }

      // Categorize events into live, upcoming, past
      this.events = this.categorizeEvents(
        allEvents,
        now,
        threeDaysFromNow,
        sevenDaysAgo
      );

      logManager.system?.debug?.(
        `[LiveEventsSection] Loaded ${allEvents.length} events, categorized: live=${this.events.live.length}, upcoming=${this.events.upcoming.length}, past=${this.events.past.length}`
      );
    } catch (error) {
      logManager.system?.error?.(
        "[LiveEventsSection] Error loading events:",
        error
      );
      this.events = { live: [], upcoming: [], past: [] };
    } finally {
      this.isLoading = false; // Bug #25: Reset loading flag
    }
  }

  /**
   * Categorize events into live, upcoming, and past
   * Per Implementation Plan 4.1: "Query events where isLive == true OR in time window"
   *
   * Live = isLive === true OR currently in time window (and not ended)
   * Upcoming = future events (not yet in time window)
   * Past = ended by official OR event end time has passed (show last 7 days)
   */
  categorizeEvents(events, now, maxFutureDate, minPastDate) {
    const live = [];
    const upcoming = [];
    const past = [];

    for (const event of events) {
      const { isInTimeWindow, hasEnded, firstStart, lastEnd } =
        this.getEventTimeInfo(event, now);

      // Check if officially ended by an official OR explicitly stopped (e.g., edited while live)
      const isOfficiallyEnded = !!event.endedAt;
      const wasLiveStopped = !!event.liveStoppedAt;

      // Event is past if:
      // 1. Officially ended by an official, OR
      // 2. Explicitly stopped (liveStoppedAt is set), OR
      // 3. Its scheduled end time has passed
      const isPast = isOfficiallyEnded || wasLiveStopped || hasEnded;

      if (isPast) {
        // Only show past events from last 7 days
        if (lastEnd && lastEnd >= minPastDate) {
          past.push({
            ...event,
            timeInfo: { firstStart, lastEnd },
            isOfficiallyEnded,
          });
        }
        continue;
      }

      // Determine if event should be in Live section
      // Per Implementation Plan: "isLive == true OR in time window" (but not after it has ended)
      const isOfficiallyLive = event.isLive === true;
      const shouldShowAsLive =
        !hasEnded && (isOfficiallyLive || isInTimeWindow);

      if (shouldShowAsLive) {
        live.push({
          ...event,
          timeInfo: { firstStart, lastEnd },
          isOfficiallyLive, // Track whether official clicked Go Live
        });
      } else if (firstStart > now && firstStart <= maxFutureDate) {
        // Future events within next 3 days
        upcoming.push({ ...event, timeInfo: { firstStart, lastEnd } });
      }
    }

    // Sort: live by time remaining (soonest to end first), upcoming by start time, past by end time (most recent first)
    live.sort((a, b) => a.timeInfo.lastEnd - b.timeInfo.lastEnd);
    upcoming.sort((a, b) => a.timeInfo.firstStart - b.timeInfo.firstStart);
    past.sort((a, b) => b.timeInfo.lastEnd - a.timeInfo.lastEnd);

    return { live, upcoming, past };
  }

  /**
   * Get time information for an event
   * R25: For multi-day events, only mark as live when now is within one of the
   * specific day/time ranges, NOT as a continuous window from first start to last end.
   */
  getEventTimeInfo(event, now) {
    if (!event.timeSlots || event.timeSlots.length === 0) {
      return {
        isInTimeWindow: false,
        hasEnded: true,
        firstStart: null,
        lastEnd: null,
      };
    }

    const firstSlot = event.timeSlots[0];
    const lastSlot = event.timeSlots[event.timeSlots.length - 1];

    const firstStart = new Date(`${firstSlot.date}T${firstSlot.startTime}`);
    let lastEnd = new Date(`${lastSlot.date}T${lastSlot.endTime}`);

    // Handle overnight events for last slot
    if (lastSlot.endTime < lastSlot.startTime) {
      lastEnd.setDate(lastEnd.getDate() + 1);
    }

    // R25: Check each time slot individually - event is only "in time window"
    // when current time is within one of the defined day/time ranges
    let isInTimeWindow = false;
    for (const slot of event.timeSlots) {
      const slotStart = new Date(`${slot.date}T${slot.startTime}`);
      let slotEnd = new Date(`${slot.date}T${slot.endTime}`);

      // Handle overnight: if end time is before start time, event ends next day
      if (slot.endTime < slot.startTime) {
        slotEnd.setDate(slotEnd.getDate() + 1);
      }

      if (now >= slotStart && now <= slotEnd) {
        isInTimeWindow = true;
        break;
      }
    }

    const hasEnded = now > lastEnd;

    return { isInTimeWindow, hasEnded, firstStart, lastEnd };
  }

  /**
   * Render the Mother Card
   * Per PRD 4.1: Permanent card at top with live events carousel and dropdown sections
   */
  render() {
    if (!this.container) return;

    const liveCount = this.events.live?.length || 0;
    const upcomingCount = this.events.upcoming?.length || 0;
    const pastCount = this.events.past?.length || 0;
    const isActive = liveCount > 0;

    this.container.innerHTML = `
      <div class="events-mother-card ${isActive ? "active" : "inactive"}">
        <!-- Mother Card Header -->
        <div class="mother-card-header">
          <div class="mother-card-status">
            <div class="status-indicator ${isActive ? "live" : "dormant"}">
              <span class="status-dot"></span>
            </div>
            <div class="status-text">
              ${
                isActive
                  ? `<span class="live-count">${liveCount}</span> event${
                      liveCount !== 1 ? "s" : ""
                    } live now`
                  : "No live events"
              }
            </div>
          </div>
          ${
            isActive
              ? `
            <div class="mother-card-badge">
              <i class="fas fa-bolt"></i>
              LIVE
            </div>
          `
              : ""
          }
        </div>
        
        <!-- Live Events Carousel (only when active) -->
        ${
          isActive
            ? `
          <div class="live-events-carousel">
            ${this.events.live.map((e) => this.renderLiveEventCard(e)).join("")}
          </div>
        `
            : `
          <div class="no-live-events">
            <i class="fas fa-calendar-day"></i>
            <p>Check back during scheduled events</p>
          </div>
        `
        }
        
        <!-- Dropdown Sections -->
        <div class="mother-card-dropdowns">
          <!-- Upcoming Events Dropdown -->
          <div class="dropdown-section ${upcomingCount > 0 ? "" : "empty"}">
            <button class="dropdown-toggle ${
              this.upcomingExpanded ? "expanded" : ""
            }" data-section="upcoming">
              <div class="dropdown-label">
                <i class="fas fa-clock"></i>
                <span>Upcoming</span>
                ${
                  upcomingCount > 0
                    ? `<span class="dropdown-count">${upcomingCount}</span>`
                    : ""
                }
              </div>
              <i class="fas fa-chevron-down dropdown-arrow"></i>
            </button>
            
            <div class="dropdown-content ${
              this.upcomingExpanded ? "expanded" : ""
            }">
              ${
                upcomingCount > 0
                  ? `
                <div class="dropdown-events-list">
                  ${this.events.upcoming
                    .slice(0, 5)
                    .map((e) => this.renderDropdownEventCard(e, "upcoming"))
                    .join("")}
                  ${
                    upcomingCount > 5
                      ? `
                    <div class="show-more-hint">
                      +${upcomingCount - 5} more upcoming
                    </div>
                  `
                      : ""
                  }
                </div>
              `
                  : `
                <div class="dropdown-empty">
                  <p>No upcoming events in the next 3 days</p>
                </div>
              `
              }
            </div>
          </div>
          
          <!-- Past Events Dropdown -->
          <div class="dropdown-section ${pastCount > 0 ? "" : "empty"}">
            <button class="dropdown-toggle ${
              this.pastExpanded ? "expanded" : ""
            }" data-section="past">
              <div class="dropdown-label">
                <i class="fas fa-history"></i>
                <span>Past Events</span>
                ${
                  pastCount > 0
                    ? `<span class="dropdown-count">${pastCount}</span>`
                    : ""
                }
              </div>
              <i class="fas fa-chevron-down dropdown-arrow"></i>
            </button>
            
            <div class="dropdown-content ${
              this.pastExpanded ? "expanded" : ""
            }">
              ${
                pastCount > 0
                  ? `
                <div class="dropdown-events-list">
                  ${this.events.past
                    .slice(0, 5)
                    .map((e) => this.renderDropdownEventCard(e, "past"))
                    .join("")}
                  ${
                    pastCount > 5
                      ? `
                    <div class="show-more-hint">
                      +${pastCount - 5} more past events
                    </div>
                  `
                      : ""
                  }
                </div>
              `
                  : `
                <div class="dropdown-empty">
                  <p>No past events from the last 7 days</p>
                </div>
              `
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a live event card for the carousel
   * Per PRD 4.2: Pulsing LIVE badge, event title, club logo+name, location, time remaining
   *
   * Shows different badge based on whether official clicked "Go Live":
   * - "LIVE" (red) - auto-live because in time window
   * - "OFFICIALLY LIVE" (green) - official confirmed event started
   */
  renderLiveEventCard(event) {
    const club = event.club;
    const title = this.escapeHtml(event.title || "Untitled Event");
    const location = this.escapeHtml(event.location || "TBA");
    const timeRemaining = this.getTimeRemaining(event.timeInfo.lastEnd);
    const isOfficiallyLive = event.isOfficiallyLive === true;

    return `
      <div class="live-event-card ${isOfficiallyLive ? "officially-live" : ""}" 
           data-event-id="${event.id}" 
           data-club-id="${event.clubId}">
        <div class="live-badge ${isOfficiallyLive ? "official" : ""}">
          <span class="badge-dot"></span>
          ${
            isOfficiallyLive
              ? '<i class="fas fa-check-circle"></i> OFFICIALLY LIVE'
              : "LIVE"
          }
        </div>
        
        ${
          event.imageUrl
            ? `
          <div class="live-event-image">
            <img src="${this.escapeAttr(
              event.imageUrl
            )}" alt="${title}" loading="lazy" />
          </div>
        `
            : ""
        }
        
        <div class="live-event-content">
          <h4 class="live-event-title">${title}</h4>
          
          <div class="live-event-club">
            ${
              club?.logoUrl
                ? `<img src="${this.escapeAttr(
                    club.logoUrl
                  )}" alt="${this.escapeHtml(
                    club.name
                  )}" class="club-mini-logo" loading="lazy" />`
                : `<div class="club-mini-logo placeholder" style="background: ${
                    club?.accentColor || "#8b7de8"
                  }">
                  ${(club?.name || "?").charAt(0)}
                 </div>`
            }
            <span class="club-name">${this.escapeHtml(
              club?.name || "Unknown Club"
            )}</span>
          </div>
          
          <div class="live-event-meta">
            <span class="event-location"><i class="fas fa-map-marker-alt"></i> ${location}</span>
            ${
              timeRemaining
                ? `<span class="event-time-remaining"><i class="fas fa-clock"></i> ${timeRemaining}</span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render compact event card for dropdown sections (upcoming/past)
   */
  renderDropdownEventCard(event, type) {
    const club = event.club;
    const title = this.escapeHtml(event.title || "Untitled Event");
    const location = this.escapeHtml(event.location || "TBA");

    let timeText = "";
    if (type === "upcoming") {
      timeText = this.getStartsIn(event.timeInfo.firstStart);
    } else if (type === "past") {
      timeText = this.getEndedAgo(event.timeInfo.lastEnd);
    }

    // Format date
    const dateStr =
      (type === "upcoming"
        ? event.timeInfo.firstStart
        : event.timeInfo.lastEnd
      )?.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }) || "";

    return `
      <div class="dropdown-event-card ${type}" 
           data-event-id="${event.id}" 
           data-club-id="${event.clubId}">
        ${
          event.imageUrl
            ? `
          <div class="dropdown-event-thumb">
            <img src="${this.escapeAttr(
              event.imageUrl
            )}" alt="${title}" loading="lazy" />
          </div>
        `
            : `
          <div class="dropdown-event-thumb placeholder" style="background: ${
            club?.accentColor || "#8b7de8"
          }">
            <i class="fas fa-calendar-alt"></i>
          </div>
        `
        }
        
        <div class="dropdown-event-info">
          <h5 class="dropdown-event-title">${title}</h5>
          <div class="dropdown-event-meta">
            <span class="event-club-name">${this.escapeHtml(
              club?.name || "Unknown"
            )}</span>
            <span class="event-time-badge">${timeText}</span>
          </div>
          <div class="dropdown-event-date">
            <i class="fas fa-calendar"></i> ${dateStr}
            <i class="fas fa-map-marker-alt"></i> ${location}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get time remaining string
   */
  getTimeRemaining(endTime) {
    if (!endTime) return null;
    const now = new Date();
    const diffMs = endTime - now;

    if (diffMs <= 0) return null;

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `Ends in ${hours}h ${minutes}m`;
    }
    return `Ends in ${minutes}m`;
  }

  /**
   * Get "starts in" string for upcoming events
   */
  getStartsIn(startTime) {
    if (!startTime) return "";
    const now = new Date();
    const diffMs = startTime - now;

    if (diffMs <= 0) return "Starting soon";

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `In ${days} day${days !== 1 ? "s" : ""}`;
    }
    if (hours > 0) {
      return `In ${hours}h`;
    }

    const minutes = Math.floor(diffMs / (1000 * 60));
    return `In ${minutes}m`;
  }

  /**
   * Get "ended ago" string for past events
   */
  getEndedAgo(endTime) {
    if (!endTime) return "";
    const now = new Date();
    const diffMs = now - endTime;

    if (diffMs <= 0) return "Just ended";

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days !== 1 ? "s" : ""} ago`;
    }
    if (hours > 0) {
      return `${hours}h ago`;
    }

    const minutes = Math.floor(diffMs / (1000 * 60));
    return minutes > 0 ? `${minutes}m ago` : "Just ended";
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    if (!this.container) return;

    // Live event cards and dropdown event cards
    this.container
      .querySelectorAll(".live-event-card, .dropdown-event-card")
      .forEach((card) => {
        card.addEventListener("click", () => {
          const eventId = card.dataset.eventId;
          const clubId = card.dataset.clubId;
          const event = [
            ...this.events.live,
            ...this.events.upcoming,
            ...this.events.past,
          ].find((e) => e.id === eventId);

          if (event) {
            this.onEventClick(event, clubId);
          }
        });
      });

    // Dropdown toggles
    this.container.querySelectorAll(".dropdown-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const section = btn.dataset.section;

        if (section === "upcoming") {
          this.upcomingExpanded = !this.upcomingExpanded;
        } else if (section === "past") {
          this.pastExpanded = !this.pastExpanded;
        }

        // Re-render to update dropdown state
        this.render();
        this.bindEvents();
      });
    });
  }

  /**
   * Start auto-refresh every 60 seconds
   */
  startAutoRefresh() {
    // Clear existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      // If container is no longer in the DOM or destroyed, stop refreshing
      if (
        this.isDestroyed ||
        !this.container ||
        !document.body.contains(this.container)
      ) {
        this.stopAutoRefresh();
        return;
      }

      await this.loadEvents();

      // Check again after async operation (race condition fix)
      if (this.isDestroyed || !this.container) {
        return;
      }

      this.render();
      this.bindEvents();
    }, 60000); // 60 seconds
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.isDestroyed = true; // Mark as destroyed to prevent race conditions
    this.stopAutoRefresh();
    if (this.container) {
      this.container.innerHTML = "";
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Escape value for safe use in HTML attributes (src, href, etc.)
   */
  escapeAttr(value) {
    if (value == null) return "";
    const str = String(value);
    const lower = str.toLowerCase().trim();
    if (lower.startsWith("javascript:") || lower.startsWith("data:text/html")) {
      return "";
    }
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

/**
 * Helper function to create and show the live events section
 */
export function initLiveEventsSection(container, options = {}) {
  const section = new LiveEventsSection({
    container,
    ...options,
  });
  section.init();
  return section;
}
