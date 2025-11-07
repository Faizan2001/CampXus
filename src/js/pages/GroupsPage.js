import { dataManager } from "../services/data/DataService.js";
import { logManager } from "../utils/debug/LogManager.js";
import { unreadTracker } from "../services/groups/UnreadTracker.js";
import { currentUser } from "../store/userStore.js";
import { groupsCache } from "../services/groups/GroupsCache.js";

function isNonProductionEnvironment() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      if (import.meta.env.DEV) return true;
      const mode = (import.meta.env.MODE || "").toLowerCase();
      if (mode && mode !== "production") return true;
    }
  } catch (_) {
    /* noop */
  }
  try {
    if (typeof window !== "undefined" && window.ENV) {
      const env = String(window.ENV.ENVIRONMENT || "").toLowerCase();
      if (env && env !== "production") return true;
      if (window.ENV.ENABLE_DEV_SPACES === true) return true;
    }
  } catch (_) {
    /* noop */
  }
  return false;
}

function shouldShowDevSpaceTools() {
  return isNonProductionEnvironment();
}

export class GroupsPage {
  constructor() {
    this.container = null;
    this.unsubscribe = null;
    this.showDevTools = shouldShowDevSpaceTools();
    this.isRefreshing = false;
  }

  async mount(rootEl) {
    this.container = rootEl;
    
    // Wait for profile data to load before gating (prevents false negatives on fresh page loads)
    try {
      await currentUser.waitForProfile();
    } catch (e) {
      console.error('[GroupsPage] Failed to load profile', e);
    }
    
    // PRD Requirement: Gate Groups until profile setup is complete
    if (!currentUser.isProfileComplete()) {
      this.container.innerHTML = `
        <section class="groups-page">
          <div class="profile-gate-message">
            <div class="gate-icon">
              <i class="fas fa-user-circle"></i>
            </div>
            <h2>Complete Your Profile First</h2>
            <p>You need to complete your profile setup before accessing class spaces.</p>
            <button id="completeProfileBtn" class="btn primary">Complete Profile</button>
          </div>
        </section>
      `;
      const btn = this.container.querySelector('#completeProfileBtn');
      if (btn) {
        btn.addEventListener('click', async () => {
          try {
            const { navigateTo } = await import("../app.js");
            window.location.hash = '#profile';
            navigateTo('profile');
          } catch (_) {
            window.location.hash = '#profile';
          }
        });
      }
      return;
    }
    
    const devTools = this.showDevTools
      ? `
        <div class="dev-tools" id="devTools">
          <button id="btnCreateDevSpaces" class="btn">Create Test Spaces</button>
          <button id="btnClearDevSpaces" class="btn danger">Clear My Test Spaces</button>
        </div>`
      : "";
    this.container.innerHTML = `
      <section class="groups-page">
        ${devTools}
        <div id="groups-list" class="groups-list"></div>
        <div id="groups-empty" class="groups-empty hidden">No class spaces yet. They are created daily at 06:00.</div>
      </section>
    `;
    if (this.showDevTools) {
      this.bindDevTools();
    }
    await this.loadGroups();
  }

  async loadGroups() {
    const listEl = this.container.querySelector('#groups-list');
    const emptyEl = this.container.querySelector('#groups-empty');
    
    // Get current user ID for cache scoping
    const userId = currentUser?.uid;
    if (!userId) {
      console.warn('[GroupsPage] No user ID available');
      return;
    }
    
    // Check cache first (with soft refresh on navigation)
    const cached = groupsCache.get(userId, true); // true = soft refresh (1min TTL)
    if (cached) {
      console.log("[GroupsPage] Using cached groups data");
      this.renderGroups(cached, listEl, emptyEl);
      this.updateCacheIndicator();
      return;
    }

    // Cache miss - fetch from Firestore
    listEl.innerHTML = '<div class="loading">Loading groups...</div>';
    
    try {
      // Minimal fetch: query classSpaces where memberIds contains current user
      const spaces = await dataManager.getUserClassSpaces();
      
      // Save to cache
      groupsCache.set(spaces, userId);
      this.renderGroups(spaces, listEl, emptyEl);
      this.updateCacheIndicator();
    } catch (error) {
      console.error("[GroupsPage] Error loading groups:", error);
      listEl.innerHTML = `
        <div class="error-message">
          <p>Failed to load groups</p>
          <button class="btn-retry">Retry</button>
        </div>
      `;
      
      listEl.querySelector(".btn-retry")?.addEventListener("click", () => {
        groupsCache.invalidate(userId);
        this.loadGroups();
      });
    }
  }

  renderGroups(spaces, listEl, emptyEl) {
    listEl.innerHTML = '';
    if (!spaces || spaces.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    
    const userId = currentUser?.uid;
    
    for (const s of spaces) {
      const title = this.buildTitle(s);
      const members = s.memberCount || (s.memberIds?.length || 0);
      const preview = s.lastMessagePreview?.content || '';
      const hasUnread = unreadTracker.hasUnread(s.spaceId, s, userId);
      const relativeTime = unreadTracker.getRelativeTime(s);
      
      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `
        <div class="group-title">${title}${hasUnread ? '<span class="unread-badge"></span>' : ''}</div>
        <div class="group-sub">${s.classroom || ''} • ${s.dayPattern || ''} ${this.slotToDisplay(s)}</div>
        <div class="group-meta">
          <span>${members} classmates</span>
          ${relativeTime ? `<span class="group-time">• ${relativeTime}</span>` : ''}
        </div>
        <div class="group-preview">${preview}</div>
      `;
      card.addEventListener('click', async () => {
        try {
          const { navigateTo } = await import("../app.js");
          // Store selected spaceId for router (hash gets normalized)
          try { sessionStorage.setItem('group:spaceId', s.spaceId); } catch (_) {}
          window.location.hash = `#group`;
          navigateTo("group");
        } catch (_) {
          try { sessionStorage.setItem('group:spaceId', s.spaceId); } catch (_) {}
          window.location.hash = `#group`;
        }
      });
      listEl.appendChild(card);
    }
  }

  updateCacheIndicator() {
    const userId = currentUser?.uid;
    if (!userId) return;
    
    const ageStr = groupsCache.getAgeString(userId);
    let indicator = this.container.querySelector('.cache-indicator');
    
    if (!indicator && ageStr) {
      const groupsSection = this.container.querySelector('.groups-page');
      if (groupsSection) {
        indicator = document.createElement('div');
        indicator.className = 'cache-indicator';
        groupsSection.insertBefore(indicator, groupsSection.querySelector('.groups-list'));
      }
    }
    
    if (indicator) {
      if (ageStr) {
        indicator.innerHTML = `
          <span class="cache-age">Updated ${ageStr}</span>
          <button class="btn-refresh" title="Refresh groups">
            <span class="refresh-icon">↻</span>
          </button>
        `;
        
        const refreshBtn = indicator.querySelector('.btn-refresh');
        refreshBtn?.addEventListener('click', async () => {
          if (this.isRefreshing) return;
          this.isRefreshing = true;
          refreshBtn.disabled = true;
          
          groupsCache.invalidate(userId);
          await this.loadGroups();
          
          this.isRefreshing = false;
          refreshBtn.disabled = false;
        });
      } else {
        indicator.remove();
      }
    }
  }

  bindDevTools() {
    if (!this.showDevTools) return;
    const createBtn = this.container.querySelector('#btnCreateDevSpaces');
    const clearBtn = this.container.querySelector('#btnClearDevSpaces');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        createBtn.disabled = true;
        try {
          const { createDevSpacesForUser } = await import("../services/groups/DevSpaceTools.js");
          await createDevSpacesForUser(2);
          await this.loadGroups();
        } catch (e) {
          console.error('Create test spaces failed', e);
          alert('Failed to create test spaces');
        } finally {
          createBtn.disabled = false;
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        clearBtn.disabled = true;
        try {
          const { clearMyDevSpaces } = await import("../services/groups/DevSpaceTools.js");
          await clearMyDevSpaces();
          await this.loadGroups();
        } catch (e) {
          console.error('Clear test spaces failed', e);
          alert('Failed to clear test spaces');
        } finally {
          clearBtn.disabled = false;
        }
      });
    }
  }

  slotToDisplay(s) {
    try {
      const start = s.timeStart || '';
      const end = s.timeEnd || '';
      return start && end ? `${start}–${end}` : '';
    } catch (_) { return ''; }
  }

  buildTitle(s) {
    const codeOrName = s.courseCode || (s.courseName ? this.toTitleCase(s.courseName) : 'Course');
    const sec = s.section ? `S-${parseInt(s.section, 10)}` : '';
    const slot = `${s.dayPattern || ''} ${this.slotToDisplay(s)}`.trim();
    return `${codeOrName} • ${sec} • ${slot}`.replace(/\s+•\s+•/g, ' •').replace(/•\s*$/,'');
  }

  toTitleCase(str) {
    return String(str || '')
      .split(' ')
      .map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '')
      .join(' ');
  }
}

export default GroupsPage;

// Wire to SPA router lifecycle
document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "groups") return;
  const root = document.querySelector('#groups-root') || document.querySelector('.main-content');
  const page = new GroupsPage();
  await page.mount(root);
});
