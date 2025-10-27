import { dataManager } from "../services/data/DataService.js";
import { logManager } from "../utils/debug/LogManager.js";

export class GroupsPage {
  constructor() {
    this.container = null;
    this.unsubscribe = null;
  }

  async mount(rootEl) {
    this.container = rootEl;
    this.container.innerHTML = `
      <section class="groups-page">
        <div class="dev-tools" id="devTools">
          <button id="btnCreateDevSpaces" class="btn">Create Test Spaces</button>
          <button id="btnClearDevSpaces" class="btn danger">Clear My Test Spaces</button>
        </div>
        <div id="groups-list" class="groups-list"></div>
        <div id="groups-empty" class="groups-empty hidden">No class spaces yet. They are created daily at 06:00.</div>
      </section>
    `;
    this.bindDevTools();
    await this.loadGroups();
  }

  async loadGroups() {
    const listEl = this.container.querySelector('#groups-list');
    const emptyEl = this.container.querySelector('#groups-empty');
    listEl.innerHTML = '';
    try {
      // Minimal fetch: query classSpaces where memberIds contains current user
      const spaces = await dataManager.getUserClassSpaces();
      if (!spaces || spaces.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');
      for (const s of spaces) {
        const title = this.buildTitle(s);
        const members = s.memberCount || (s.memberIds?.length || 0);
        const preview = s.lastMessagePreview?.content || '';
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
          <div class="group-title">${title}</div>
          <div class="group-sub">${s.classroom || ''} • ${s.dayPattern || ''} ${this.slotToDisplay(s)}</div>
          <div class="group-meta">${members} classmates</div>
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
    } catch (e) {
      logManager?.system?.error?.('Failed to load groups', e);
      emptyEl.classList.remove('hidden');
    }
  }

  bindDevTools() {
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
