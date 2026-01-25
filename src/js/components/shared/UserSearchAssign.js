import { friendsManager } from "../../services/friends/FriendsService.js";
import {
  renderUserAvatar,
  getAvatarFallback,
} from "../../utils/avatar/avatarUtils.js";
import { currentUser } from "../../store/userStore.js";

const DEBOUNCE_MS = 300;

/**
 * Render a reusable user search list with an Assign button per result.
 * @param {HTMLElement} container target element
 * @param {Object} opts
 * @param {string|null} opts.scopeUniversityId limit results to this universityId/university code
 * @param {boolean} opts.allowAllUniversities allow cross-university search (super admin)
 * @param {(user)=>void} opts.onSelect called when Assign is clicked
 * @param {string} [opts.placeholder] optional placeholder text
 */
export function renderUserSearchAssign(container, opts = {}) {
  if (!container) return;
  const {
    scopeUniversityId = null,
    allowAllUniversities = false,
    onSelect,
    placeholder = "Search by @handle",
    allowMissingProfile = false,
    bypassSearchable = false, // for admin assignment flows
    audit = null, // { enabled: true, source: 'admin_*' }
  } = opts;

  container.innerHTML = `
    <div class="user-search-assign">
      <div class="search-input-row">
        <div class="search-input-wrapper">
          <i class="fas fa-search search-icon"></i>
          <input type="text" id="assignSearchInput" class="search-input" placeholder="${placeholder}" autocomplete="off" />
        </div>
        <button class="btn-search" type="button"><i class="fas fa-search"></i></button>
      </div>
      <div class="search-results-area" id="assignSearchResults"></div>
    </div>
  `;

  const input = container.querySelector("#assignSearchInput");
  const btn = container.querySelector(".btn-search");
  const resultsEl = container.querySelector("#assignSearchResults");
  let timeout = null;
  let seq = 0;
  let lastAudit = { term: null, ts: 0 };

  const filterByUniversity = (user) => {
    if (!scopeUniversityId) return true;
    const uniId =
      user?.universityInfo?.universityId ||
      user?.universityInfo?.university ||
      user?.universityInfo?.universityName ||
      null;
    return uniId === scopeUniversityId;
  };

  async function search(termRaw) {
    const term = termRaw.trim();
    console.log(
      `🔎 UserSearchAssign SEARCH CALLED with term: "${term}", resultsEl:`,
      resultsEl
    );
    if (!term) {
      resultsEl.innerHTML = `<div class="search-status empty"><i class="fas fa-user-slash"></i> Enter a handle to search</div>`;
      return;
    }
    resultsEl.innerHTML = `<div class="search-status loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;
    seq += 1;
    const cur = seq;
    try {
      const results = await friendsManager.searchStudentsWithCache(term, {
        allowAllUniversities,
        includeFriends: true, // we want to find known users too
        allowMissingProfile,
        bypassSearchable, // for admin assignment flows
        // For assignment flows we don't want to be limited
        // by the viewer's own university; we filter by scope
        // below using filterByUniversity.
        respectViewerUniversity: false,
      });
      const extra = await fetchByUid(term);
      if (cur !== seq) return;
      const merged = dedupeById([...results, ...extra]);
      const filtered = merged.filter(filterByUniversity);
      console.log(
        `🔍 UserSearchAssign: ${filtered.length} results after filtering`
      );
      renderResults(filtered);

      // Optional: admin audit logging (best-effort + throttled)
      if (audit && audit.enabled === true) {
        const now = Date.now();
        const sameTermRecently =
          lastAudit.term === term && now - lastAudit.ts < 10_000;
        if (!sameTermRecently && term.length > 1) {
          lastAudit = { term, ts: now };
          try {
            const { logAdminAuditEvent } = await import(
              "../../services/admin/AdminService.js"
            );
            await logAdminAuditEvent("admin_user_search", {
              term,
              resultsCount: filtered.length,
              source: String(audit.source || "unknown"),
              scopeUniversityId: scopeUniversityId || null,
              allowAllUniversities: !!allowAllUniversities,
              bypassSearchable: !!bypassSearchable,
            });
          } catch (_) {
            // audit logging must never affect UX
          }
        }
      }
    } catch (err) {
      if (cur !== seq) return;
      resultsEl.innerHTML = `<div class="search-status error"><i class="fas fa-exclamation-triangle"></i> Error searching. Try again.</div>`;
      console.error("UserSearchAssign search error", err);

      if (audit && audit.enabled === true) {
        try {
          const { logAdminAuditEvent } = await import(
            "../../services/admin/AdminService.js"
          );
          await logAdminAuditEvent("admin_user_search_failed", {
            term,
            source: String(audit.source || "unknown"),
            message: String(err?.message || err),
          });
        } catch (error) { console.debug("Suppressed error", error); }
      }
    }
  }

  // Direct UID lookup fallback (for super admin / known IDs)
  async function fetchByUid(term) {
    // Treat as UID only for longer tokens (avoid spamming rules on handles)
    if (!/^[A-Za-z0-9_-]{20,}$/.test(term)) return [];
    try {
      const { getDoc, doc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase/firebase-config.js");
      if (!db) return [];
      const snap = await getDoc(doc(db, "users", term));
      if (!snap.exists()) return [];
      const data = snap.data() || {};
      return [
        {
          id: term,
          profile: data.profile || {},
          universityInfo: data.universityInfo || {},
          avatarConfig: data.avatarConfig || null,
          profilePhotoUrl: data.profile?.profilePhotoUrl || null,
        },
      ];
    } catch (e) {
      console.warn("UserSearchAssign UID lookup failed", e);
      return [];
    }
  }

  function dedupeById(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (!item?.id) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  function renderResults(list) {
    console.log(
      `🔎 UserSearchAssign renderResults called with ${
        list?.length || 0
      } items`,
      list
    );
    if (!list || list.length === 0) {
      resultsEl.innerHTML = `<div class="search-status empty"><i class="fas fa-user-slash"></i> No matching users found</div>`;
      return;
    }

    const html = `
      <div class="user-results-list">
        ${list.map((u) => renderCard(u)).join("")}
      </div>
    `;
    console.log(
      `🔎 UserSearchAssign setting innerHTML:`,
      html.substring(0, 200)
    );
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll(".btn-assign-user").forEach((btnEl) => {
      btnEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btnEl.dataset.uid;
        const user = list.find((u) => u.id === id);
        if (user && typeof onSelect === "function") {
          onSelect(user);
        }
      });
    });
  }

  function renderCard(user) {
    const profile = user.profile || {};
    const uni =
      user.universityInfo?.name ||
      user.universityInfo?.university ||
      user.universityInfo?.universityId ||
      "Unknown";
    const handle = profile.handle || profile.handle_lower || user.id;
    const firstName = profile.firstName || "";
    const lastName = profile.lastName || "";
    const displayName =
      profile.displayName || `${firstName} ${lastName}`.trim() || handle;
    const avatarHtml = renderUserAvatar(user, {
      fallback: getAvatarFallback(user.id || handle),
    });
    return `
      <div class="user-result-card glass-card" data-uid="${user.id}">
        <div class="user-avatar">${avatarHtml}</div>
        <div class="user-details">
          <div class="user-name">${displayName}</div>
          <div class="user-meta">@${handle} • ${uni}</div>
        </div>
        <button class="btn-assign-user" data-uid="${user.id}" type="button">
          <i class="fas fa-plus"></i> Assign
        </button>
      </div>
    `;
  }

  function handleInput() {
    const term = input.value || "";
    if (!term.trim()) {
      resultsEl.innerHTML = "";
      return;
    }
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => search(term), DEBOUNCE_MS);
  }

  input?.addEventListener("input", handleInput);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (timeout) clearTimeout(timeout);
      search(input.value || "");
    }
  });
  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (timeout) clearTimeout(timeout);
    search(input.value || "");
  });
}
