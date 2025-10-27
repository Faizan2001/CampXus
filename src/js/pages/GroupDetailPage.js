import { classSpacesService } from "../services/groups/ClassSpacesService.js";
import { logManager } from "../utils/debug/LogManager.js";

class GroupDetailPage {
  constructor() {
    this.spaceId = null;
    this.unsub = null;
    this.lastDocs = [];
  }

  parseSpaceIdFromHash() {
    try {
      const hash = window.location.hash || ""; // e.g., #group?id=abc
      const idx = hash.indexOf("?");
      const qs = idx >= 0 ? hash.substring(idx + 1) : "";
      const params = new URLSearchParams(qs);
      const fromQuery = params.get("id");
      if (fromQuery) return fromQuery;
      try {
        const fromStore = sessionStorage.getItem('group:spaceId');
        if (fromStore) return fromStore;
      } catch (_) {}
      return null;
    } catch (_) {
      return null;
    }
  }

  async mount() {
    this.spaceId = this.parseSpaceIdFromHash();
    try { sessionStorage.removeItem('group:spaceId'); } catch (_) {}
    const titleEl = document.getElementById("group-title");
    const subEl = document.getElementById("group-sub");
    const messagesEl = document.getElementById("messages");
    const sendBtn = document.getElementById("sendMessageBtn");
    const input = document.getElementById("messageText");
    const tabChat = document.getElementById("tab-chat");
    const tabMembers = document.getElementById("tab-members");
    const chatPane = document.getElementById("group-chat");
    const membersPane = document.getElementById("group-members");
    const membersList = document.getElementById("membersList");

    if (!this.spaceId) {
      titleEl.textContent = "Group not found";
      return;
    }

    // Load space metadata
    const space = await classSpacesService.getSpace(this.spaceId);
    if (!space) {
      titleEl.textContent = "Group not found";
      return;
    }
    const title = this.buildTitle(space);
    titleEl.textContent = title;
    subEl.textContent = `${space.classroom || ''} • ${space.dayPattern || ''} ${space.timeStart || ''}-${space.timeEnd || ''}`;

    // Members list
    const memberIds = Array.isArray(space.memberIds) ? space.memberIds : [];
    const memberInfo = space.memberInfo || {};
    membersList.innerHTML = memberIds
      .map((uid) => {
        const info = memberInfo[uid] || {};
        const name = `${info.firstName || ''} ${info.lastName || ''}`.trim() || (info.handle ? `@${info.handle}` : uid);
        return `<div class="member-item">${name}</div>`;
      })
      .join("");

    // Tabs
    tabChat.addEventListener('click', () => {
      tabChat.classList.add('active');
      tabMembers.classList.remove('active');
      chatPane.classList.remove('hidden');
      membersPane.classList.add('hidden');
    });
    tabMembers.addEventListener('click', () => {
      tabMembers.classList.add('active');
      tabChat.classList.remove('active');
      membersPane.classList.remove('hidden');
      chatPane.classList.add('hidden');
    });

    // Messages listener
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const myUid = auth?.currentUser?.uid || null;

    this.unsub = classSpacesService.listenToMessages(this.spaceId, (items, docs) => {
      this.lastDocs = docs;
      messagesEl.innerHTML = items
        .map((m) => {
          const isMe = myUid && m.senderId === myUid;
          const sender = m.senderInfo?.firstName || m.senderInfo?.handle || (isMe ? 'You' : m.senderId);
          const text = m.content || '';
          const ts = m.createdAt?.toDate?.() || null;
          const time = ts ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(ts) : '';
          const bubbleClass = isMe ? 'bubble me' : 'bubble other';
          return `<div class="message"><div class="${bubbleClass}"><span class="sender">${sender}</span><span class="time">${time}</span><div class="text">${escapeHtml(text)}</div></div></div>`;
        })
        .join("");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    // Send handler
    sendBtn.addEventListener('click', async () => {
      const text = (input.value || '').trim();
      if (!text) return;
      try {
        sendBtn.disabled = true;
        await classSpacesService.sendMessage(this.spaceId, text);
        input.value = '';
      } catch (e) {
        logManager?.system?.error?.('sendMessage failed', e);
        alert('Failed to send message');
      } finally {
        sendBtn.disabled = false;
      }
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  buildTitle(s) {
    const codeOrName = s.courseCode || (s.courseName ? this.toTitleCase(s.courseName) : 'Course');
    const sec = s.section ? `S-${parseInt(s.section, 10)}` : '';
    const slot = `${s.dayPattern || ''} ${s.timeStart || ''}-${s.timeEnd || ''}`.trim();
    return `${codeOrName} • ${sec} • ${slot}`.replace(/\s+•\s+•/g, ' •').replace(/•\s*$/,'');
  }

  toTitleCase(str) {
    return String(str || '')
      .split(' ')
      .map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '')
      .join(' ');
  }

  destroy() {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Wire to SPA lifecycle
let currentPageInstance = null;
document.addEventListener('spa:page:unload', (e) => {
  if (currentPageInstance) {
    currentPageInstance.destroy();
    currentPageInstance = null;
  }
});

document.addEventListener('spa:page:load', async (event) => {
  const route = event?.detail?.route;
  if (route !== 'group') return;
  currentPageInstance = new GroupDetailPage();
  await currentPageInstance.mount();
});

export { GroupDetailPage };
export default GroupDetailPage;
