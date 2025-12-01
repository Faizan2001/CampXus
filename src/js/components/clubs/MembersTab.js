/**
 * MembersTab.js
 *
 * Club members display and management interface.
 * Shows the president, officials, and regular members with role badges.
 * Presidents can promote/demote officials and manage roles.
 *
 * Features:
 * - Role hierarchy display (President → Officials → Members)
 * - Role badges with clear visual distinction
 * - Promote/demote actions for presidents
 * - Member count and search (future)
 * - Responsive card layout
 */

import { logManager } from "../../utils/debug/LogManager.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { currentUser } from "../../store/userStore.js";

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
  const isPresident = checkIsPresident(clubData);
  const canManageRoles = isPresident;

  // Build member lists by role
  const president = members.find((m) => m.uid === clubData.presidentId);
  const officials = members.filter(
    (m) => m.role === "official" && m.uid !== clubData.presidentId
  );
  const regularMembers = members.filter(
    (m) => (!m.role || m.role === "member") && m.uid !== clubData.presidentId
  );

  // Sort officials and members by name
  const sortByName = (a, b) => {
    const nameA = (a.name || a.displayName || "").toLowerCase();
    const nameB = (b.name || b.displayName || "").toLowerCase();
    return nameA.localeCompare(nameB);
  };
  officials.sort(sortByName);
  regularMembers.sort(sortByName);

  const totalCount = members.length;

  const html = `
    <div class="members-header">
      <h3><i class="fas fa-users"></i> Club Members</h3>
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
            <p class="hint">No officials yet. Promote members from below to help manage events.</p>
          </div>`
        : ""
    }
    
    ${
      regularMembers.length > 0
        ? renderRoleSection(
            "Members",
            regularMembers,
            clubData,
            canManageRoles,
            "member"
          )
        : `<div class="role-section">
          <div class="role-header">
            <span class="role-title"><i class="fas fa-user-friends"></i> Members</span>
            <span class="role-count">0</span>
          </div>
          <p class="hint">No members have joined yet.</p>
        </div>`
    }
  `;

  container.innerHTML = html;

  // Bind role management actions
  if (canManageRoles) {
    bindRoleActions(container, clubData.id, members, onMemberUpdated);
  }
}

/**
 * Check if current user is the club president
 */
function checkIsPresident(clubData) {
  const uid = currentUser?.uid;
  if (!uid) return false;

  // DevTest: devOwnerUid is treated as president
  if (clubData.devTest && clubData.devOwnerUid === uid) return true;

  // Production: presidentId
  if (clubData.presidentId === uid) return true;

  // CreatedBy as fallback
  if (clubData.createdBy === uid) return true;

  return false;
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
  const isPresident = uid === clubData.presidentId;
  const isCurrentUser = uid === currentUser?.uid;
  const showActions = canManageRoles && !isPresident && !isCurrentUser;

  // Role badge
  let roleBadge = "";
  if (isPresident) {
    roleBadge = `<span class="role-badge president-badge"><i class="fas fa-crown"></i> President</span>`;
  } else if (roleType === "official" || member.role === "official") {
    roleBadge = `<span class="role-badge official-badge"><i class="fas fa-star"></i> Official</span>`;
  }

  // Action buttons
  let actions = "";
  if (showActions) {
    if (roleType === "official" || member.role === "official") {
      actions = `
        <div class="member-actions">
          <button class="action-icon demote-btn" data-uid="${uid}" data-name="${encodedName}" title="Remove from officials">
            <i class="fas fa-arrow-down"></i>
          </button>
        </div>
      `;
    } else if (roleType === "member" || !member.role) {
      actions = `
        <div class="member-actions">
          <button class="action-icon promote-btn" data-uid="${uid}" data-name="${encodedName}" title="Make official">
            <i class="fas fa-arrow-up"></i>
          </button>
        </div>
      `;
    }
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
      await handlePromote(clubId, uid, name, onMemberUpdated);
    });
  });

  // Demote buttons
  container.querySelectorAll(".demote-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const name = decodeURIComponent(btn.dataset.name || "");
      await handleDemote(clubId, uid, name, onMemberUpdated);
    });
  });
}

/**
 * Promote a member to official
 */
async function handlePromote(clubId, memberUid, memberName, onMemberUpdated) {
  // Show confirmation
  if (
    !confirm(
      `Promote ${memberName} to Club Official?\n\nOfficials can create events (pending your approval).`
    )
  ) {
    return;
  }

  try {
    const { db } = await import("../../lib/firebase/firebase-config.js");
    const { doc, updateDoc, arrayUnion, arrayRemove, getDoc } = await import(
      "firebase/firestore"
    );

    const clubRef = doc(db, "clubs", clubId);
    const clubSnap = await getDoc(clubRef);

    if (!clubSnap.exists()) {
      throw new Error("Club not found");
    }

    const clubData = clubSnap.data();
    const membersList = clubData.members || [];

    // Find and update the member's role
    const updatedMembers = membersList.map((m) => {
      if (m.uid === memberUid) {
        return { ...m, role: "official" };
      }
      return m;
    });

    await updateDoc(clubRef, {
      members: updatedMembers,
      officialIds: arrayUnion(memberUid),
    });

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

/**
 * Demote an official to regular member
 */
async function handleDemote(clubId, memberUid, memberName, onMemberUpdated) {
  // Show confirmation
  if (
    !confirm(
      `Remove ${memberName} from Club Officials?\n\nThey will no longer be able to create events.`
    )
  ) {
    return;
  }

  try {
    const { db } = await import("../../lib/firebase/firebase-config.js");
    const { doc, updateDoc, arrayRemove, getDoc } = await import(
      "firebase/firestore"
    );

    const clubRef = doc(db, "clubs", clubId);
    const clubSnap = await getDoc(clubRef);

    if (!clubSnap.exists()) {
      throw new Error("Club not found");
    }

    const clubData = clubSnap.data();
    const membersList = clubData.members || [];

    // Find and update the member's role
    const updatedMembers = membersList.map((m) => {
      if (m.uid === memberUid) {
        return { ...m, role: "member" };
      }
      return m;
    });

    await updateDoc(clubRef, {
      members: updatedMembers,
      officialIds: arrayRemove(memberUid),
    });

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

// Helper functions
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
