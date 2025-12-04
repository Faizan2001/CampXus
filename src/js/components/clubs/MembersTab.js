/**
 * MembersTab.js
 *
 * Club roles management interface.
 * Shows only the president and officials with role badges.
 * Presidents can promote/demote officials, transfer presidency, and remove members.
 *
 * Features:
 * - Role hierarchy display (President → Officials)
 * - Role badges with clear visual distinction
 * - Promote/demote/transfer/remove actions for presidents
 * - Search & assign flow for president/officials
 * - Responsive card layout
 */

import { logManager } from "../../utils/debug/LogManager.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { currentUser } from "../../store/userStore.js";
import { showModal } from "../modals/Modal.js";
import { renderUserSearchAssign } from "../shared/UserSearchAssign.js";
import { callFunction } from "../../utils/firebase/functionsHelper.js";
import { isClubPresident } from "../../utils/clubs/roleUtils.js";

/**
 * Render the Members Tab content
 * @param {HTMLElement} container - Target container
 * @param {Object} clubData - Club document data
 * @param {Array} members - Array of member objects from club.members or membersList
 * @param {Function} onMemberUpdated - Callback when member role changes
 */
export function renderMembersTab(
  container,
  clubData,
  members,
  onMemberUpdated
) {
  const canManageRoles = isClubPresident(clubData);

  // Ensure members is always an array (Bug #42 fix)
  const membersList = Array.isArray(members) ? members : [];

  // Build member lists by role (only show president + officials)
  const president = membersList.find((m) => m.uid === clubData.presidentId);
  const officials = membersList
    .filter((m) => m.role === "official" && m.uid !== clubData.presidentId)
    .sort((a, b) =>
      (a.name || a.displayName || "").toLowerCase() <
      (b.name || b.displayName || "").toLowerCase()
        ? -1
        : 1
    );

  const totalCount = (president ? 1 : 0) + officials.length;

  const html = `
    ${
      canManageRoles
        ? `<div class="role-search-section">
            <h4><i class="fas fa-search"></i> Search & assign</h4>
            <div id="club-role-assign-search"></div>
          </div>`
        : ""
    }
    <div class="members-header">
      <h3><i class="fas fa-users"></i> Club Roles</h3>
      <span class="member-count">${totalCount} member${
    totalCount !== 1 ? "s" : ""
  }</span>
    </div>

    ${
      president
        ? renderRoleSection(
            "President",
            [president],
            clubData,
            canManageRoles,
            "president"
          )
        : ""
    }
    
    ${
      officials.length > 0
        ? renderRoleSection(
            "Club Officials",
            officials,
            clubData,
            canManageRoles,
            "official"
          )
        : canManageRoles
        ? `<div class="role-section empty-officials">
            <div class="role-header">
              <span class="role-title"><i class="fas fa-star"></i> Club Officials</span>
              <span class="role-count">0</span>
            </div>
            <p class="hint">No officials yet. Use the search above to assign students.</p>
          </div>`
        : ""
    }
  `;

  container.innerHTML = html;

  if (canManageRoles) {
    const searchContainer = container.querySelector("#club-role-assign-search");
    if (searchContainer) {
      renderUserSearchAssign(searchContainer, {
        scopeUniversityId:
          clubData.universityId ||
          clubData.universityCode ||
          clubData.university ||
          null,
        allowAllUniversities: false,
        allowMissingProfile: true,
        bypassSearchable: true, // Club officers can find users even if they have search disabled
        onSelect: (user) =>
          openAssignModal(clubData, user, president, onMemberUpdated),
      });
    }
  }

  // Bind role management actions
  if (canManageRoles) {
    bindRoleActions(container, clubData.id, members, onMemberUpdated);
  }
}

function openAssignModal(clubData, user, currentPresident, onMemberUpdated) {
  const profile = user.profile || {};
  const fullName = `${profile.firstName || ""} ${
    profile.lastName || ""
  }`.trim();
  const handle = profile.handle || profile.handle_lower || user.id;
  const hasPresident = !!currentPresident;

  const formId = "assign-role-form";
  showModal({
    title: "Confirm role assignment",
    content: `
      <form id="${formId}" class="assign-role-form">
        <p>Assign <strong>@${handle}</strong> to <strong>${escapeHtml(
      clubData.name || "this club"
    )}</strong></p>
        <div class="form-group">
          <label>Role</label>
          <label class="radio">
            <input type="radio" name="role" value="official" checked />
            Official
          </label>
          <label class="radio ${hasPresident ? "disabled" : ""}" title="${
      hasPresident ? "A president already exists" : ""
    }">
            <input type="radio" name="role" value="president" ${
              hasPresident ? "disabled" : ""
            } />
            President
          </label>
        </div>
      </form>
    `,
    confirmText: "Assign",
    onConfirm: async () => {
      const form = document.getElementById(formId);
      const role = form?.elements?.role?.value || "official";
      if (role === "president") {
        await executeTransferPresidency(
          clubData.id,
          user.id,
          fullName || handle,
          onMemberUpdated
        );
      } else {
        await executePromote(
          clubData.id,
          user.id,
          fullName || handle,
          onMemberUpdated
        );
      }
    },
  });
}

/**
 * Render a section of members by role
 */
function renderRoleSection(title, members, clubData, canManageRoles, roleType) {
  const icon =
    roleType === "president"
      ? "fa-crown"
      : roleType === "official"
      ? "fa-star"
      : "fa-user-friends";

  return `
    <div class="role-section ${roleType}-section">
      <div class="role-header">
        <span class="role-title"><i class="fas ${icon}"></i> ${title}</span>
        <span class="role-count">${members.length}</span>
      </div>
      <div class="members-grid">
        ${members
          .map((member) =>
            renderMemberCard(member, clubData, canManageRoles, roleType)
          )
          .join("")}
      </div>
    </div>
  `;
}

/**
 * Render a single member card
 */
function renderMemberCard(member, clubData, canManageRoles, roleType) {
  const uid = member.uid;
  const rawName = member.name || member.displayName || "Unknown Member";
  const name = escapeHtml(rawName);
  const initials = getInitials(rawName);
  const encodedName = encodeURIComponent(rawName);
  const photoUrl = member.photoUrl || member.photoURL || null;
  const joinedAt = member.joinedAt?.toDate
    ? formatDate(member.joinedAt.toDate())
    : "";

  // Determine if this member can be promoted/demoted
  const isMemberPresident = uid === clubData.presidentId;
  const isCurrentUser = uid === currentUser?.uid;
  const showActions = canManageRoles && !isMemberPresident && !isCurrentUser;

  // Role badge
  let roleBadge = "";
  if (isMemberPresident) {
    roleBadge = `<span class="role-badge president-badge"><i class="fas fa-crown"></i> President</span>`;
  } else if (roleType === "official" || member.role === "official") {
    roleBadge = `<span class="role-badge official-badge"><i class="fas fa-star"></i> Official</span>`;
  }

  // Action buttons
  let actions = "";
  if (showActions) {
    const baseActions = [];

    if (roleType === "official" || member.role === "official") {
      baseActions.push(
        `<button class="action-icon demote-btn" data-uid="${uid}" data-name="${encodedName}" title="Remove from officials">
            <i class="fas fa-arrow-down"></i>
         </button>`
      );
    } else if (roleType === "member" || !member.role) {
      baseActions.push(
        `<button class="action-icon promote-btn" data-uid="${uid}" data-name="${encodedName}" title="Make official">
            <i class="fas fa-arrow-up"></i>
         </button>`
      );
    }

    baseActions.push(
      `<button class="action-icon make-president-btn" data-uid="${uid}" data-name="${encodedName}" title="Transfer presidency">
          <i class="fas fa-crown"></i>
       </button>`
    );

    baseActions.push(
      `<button class="action-icon kick-btn" data-uid="${uid}" data-name="${encodedName}" title="Remove from club">
          <i class="fas fa-user-slash"></i>
       </button>`
    );

    actions = `
      <div class="member-actions">
        ${baseActions.join("")}
      </div>
    `;
  }

  return `
    <div class="member-card ${isCurrentUser ? "is-you" : ""}" data-uid="${uid}">
      <div class="member-avatar">
        ${
          photoUrl
            ? `<img src="${photoUrl}" alt="${name}" loading="lazy" />`
            : `<span class="avatar-initials">${initials}</span>`
        }
      </div>
      <div class="member-info">
        <span class="member-name">${name}${isCurrentUser ? " (You)" : ""}</span>
        ${roleBadge}
        ${
          joinedAt
            ? `<span class="member-joined">Joined ${joinedAt}</span>`
            : ""
        }
      </div>
      ${actions}
    </div>
  `;
}

/**
 * Bind promote/demote button actions
 */
function bindRoleActions(container, clubId, members, onMemberUpdated) {
  // Promote buttons
  container.querySelectorAll(".promote-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const name = decodeURIComponent(btn.dataset.name || "");
      showPromoteConfirmation(clubId, uid, name, onMemberUpdated);
    });
  });

  // Demote buttons
  container.querySelectorAll(".demote-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const name = decodeURIComponent(btn.dataset.name || "");
      showDemoteConfirmation(clubId, uid, name, onMemberUpdated);
    });
  });

  // Transfer presidency buttons
  container.querySelectorAll(".make-president-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const name = decodeURIComponent(btn.dataset.name || "");
      showTransferPresidencyConfirmation(clubId, uid, name, onMemberUpdated);
    });
  });

  // Kick member buttons
  container.querySelectorAll(".kick-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const name = decodeURIComponent(btn.dataset.name || "");
      showKickConfirmation(clubId, uid, name, onMemberUpdated);
    });
  });
}

// ============================================
// Confirmation Modals (replacing native confirm())
// ============================================

function showPromoteConfirmation(
  clubId,
  memberUid,
  memberName,
  onMemberUpdated
) {
  showModal({
    title: "Promote to Official",
    content: `
      <p>Promote <strong>${escapeHtml(
        memberName
      )}</strong> to Club Official?</p>
      <p class="modal-hint"><i class="fas fa-info-circle"></i> Officials can create events (pending your approval).</p>
    `,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Promote",
    cancelText: "Cancel",
    onConfirm: () =>
      executePromote(clubId, memberUid, memberName, onMemberUpdated),
  });
}

function showDemoteConfirmation(
  clubId,
  memberUid,
  memberName,
  onMemberUpdated
) {
  showModal({
    title: "Remove from Officials",
    content: `
      <p>Remove <strong>${escapeHtml(
        memberName
      )}</strong> from Club Officials?</p>
      <p class="modal-hint"><i class="fas fa-info-circle"></i> They will no longer be able to create events.</p>
    `,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Remove",
    cancelText: "Cancel",
    onConfirm: () =>
      executeDemote(clubId, memberUid, memberName, onMemberUpdated),
  });
}

function showTransferPresidencyConfirmation(
  clubId,
  memberUid,
  memberName,
  onMemberUpdated
) {
  showModal({
    title: "Transfer Presidency",
    content: `
      <p>Make <strong>${escapeHtml(memberName)}</strong> the Club President?</p>
      <p class="modal-hint modal-warning"><i class="fas fa-exclamation-triangle"></i> You will lose presidency of this club.</p>
    `,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Transfer",
    cancelText: "Cancel",
    onConfirm: () =>
      executeTransferPresidency(clubId, memberUid, memberName, onMemberUpdated),
  });
}

function showKickConfirmation(clubId, memberUid, memberName, onMemberUpdated) {
  showModal({
    title: "Remove Member",
    content: `
      <p>Remove <strong>${escapeHtml(memberName)}</strong> from this club?</p>
      <p class="modal-hint modal-warning"><i class="fas fa-exclamation-triangle"></i> They will lose all access and roles.</p>
    `,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Remove",
    cancelText: "Cancel",
    onConfirm: () =>
      executeKick(clubId, memberUid, memberName, onMemberUpdated),
  });
}

// ============================================
// Cloud Function Executors
// ============================================

async function executePromote(clubId, memberUid, memberName, onMemberUpdated) {
  try {
    await callFunction("promoteClubOfficial", { clubId, userId: memberUid });

    notificationManager.show(
      `${memberName} is now a Club Official!`,
      "success"
    );

    if (onMemberUpdated) {
      await onMemberUpdated();
    }
  } catch (err) {
    logManager.error("[MembersTab] Promote error:", err);
    notificationManager.show(
      "Failed to promote member. Please try again.",
      "error"
    );
  }
}

async function executeDemote(clubId, memberUid, memberName, onMemberUpdated) {
  try {
    await callFunction("demoteClubOfficial", { clubId, userId: memberUid });

    notificationManager.show(
      `${memberName} has been removed from Officials.`,
      "info"
    );

    if (onMemberUpdated) {
      await onMemberUpdated();
    }
  } catch (err) {
    logManager.error("[MembersTab] Demote error:", err);
    notificationManager.show(
      "Failed to update member role. Please try again.",
      "error"
    );
  }
}

async function executeTransferPresidency(
  clubId,
  memberUid,
  memberName,
  onMemberUpdated
) {
  try {
    await callFunction("assignClubPresident", { clubId, userId: memberUid });

    notificationManager.show(
      `${memberName} is now the Club President.`,
      "success"
    );

    if (onMemberUpdated) {
      await onMemberUpdated();
    }
  } catch (err) {
    logManager.error("[MembersTab] Transfer presidency error:", err);
    notificationManager.show(
      "Failed to transfer presidency. Please try again.",
      "error"
    );
  }
}

async function executeKick(clubId, memberUid, memberName, onMemberUpdated) {
  try {
    await callFunction("removeClubMember", { clubId, userId: memberUid });

    notificationManager.show(`${memberName} has been removed.`, "info");

    if (onMemberUpdated) {
      await onMemberUpdated();
    }
  } catch (err) {
    logManager.error("[MembersTab] Kick member error:", err);
    notificationManager.show(
      "Failed to remove member. Please try again.",
      "error"
    );
  }
}

// ============================================
// Helper functions
// ============================================
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name.substring(0, 2) || "?").toUpperCase();
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default { renderMembersTab };
