/**
 * roleUtils.js
 *
 * Shared utility functions for checking club roles (president, official, member).
 * Used across ClubDetailPage, MembersTab, ModerateTab, CreateEventModal, etc.
 */

import { currentUser } from "../../store/userStore.js";

/**
 * @typedef {Object} ClubData
 * @property {string} id - Club document ID
 * @property {string} [presidentId] - UID of the current president
 * @property {string} [createdBy] - UID of the club creator (fallback president)
 * @property {boolean} [devTest] - Whether this is a dev/test club
 * @property {string} [devOwnerUid] - UID of the dev owner (acts as president for devTest clubs)
 * @property {string[]} [officialIds] - Array of official UIDs
 * @property {Array<{uid: string, role: string}>} [members] - Array of member objects
 */

/**
 * @typedef {Object} ClubMember
 * @property {string} uid - Member's user ID
 * @property {string} [role] - Member's role: 'president', 'official', or 'member'
 * @property {string} [name] - Display name
 * @property {string} [displayName] - Alternative display name field
 */

/**
 * Check if a user is the club president.
 * Presidents have full control over the club.
 *
 * @param {ClubData} clubData - The club document data
 * @param {string} [uid] - User ID to check (defaults to current user)
 * @returns {boolean} - True if user is president
 */
export function isClubPresident(clubData, uid = currentUser?.uid) {
  if (!uid || !clubData) return false;

  // DevTest clubs: devOwnerUid acts as president
  if (clubData.devTest && clubData.devOwnerUid === uid) return true;

  // Production: presidentId is the primary check
  if (clubData.presidentId === uid) return true;

  // Fallback: createdBy (for legacy clubs without presidentId)
  if (clubData.createdBy === uid) return true;

  return false;
}

/**
 * Check if a user is a club official (but not president).
 * Officials can create events (pending approval) and view moderation queue.
 *
 * @param {ClubData} clubData - The club document data
 * @param {ClubMember[]} [members] - Array of club members
 * @param {string} [uid] - User ID to check (defaults to current user)
 * @returns {boolean} - True if user is an official
 */
export function isClubOfficial(clubData, members = [], uid = currentUser?.uid) {
  if (!uid || !clubData) return false;

  // Check officialIds array (denormalized on club doc)
  if (
    Array.isArray(clubData.officialIds) &&
    clubData.officialIds.includes(uid)
  ) {
    return true;
  }

  // Check members array for role
  if (Array.isArray(members)) {
    return members.some((m) => m.uid === uid && m.role === "official");
  }

  return false;
}

/**
 * Check if a user can moderate the club (president OR official).
 * Moderators can view all events and access the moderation queue.
 *
 * @param {ClubData} clubData - The club document data
 * @param {ClubMember[]} [members] - Array of club members
 * @param {string} [uid] - User ID to check (defaults to current user)
 * @returns {boolean} - True if user can moderate
 */
export function canModerateClub(
  clubData,
  members = [],
  uid = currentUser?.uid
) {
  return (
    isClubPresident(clubData, uid) || isClubOfficial(clubData, members, uid)
  );
}

/**
 * Check if a user can manage roles (only presidents can do this).
 * Role management includes: promote, demote, transfer presidency, kick.
 *
 * @param {ClubData} clubData - The club document data
 * @param {string} [uid] - User ID to check (defaults to current user)
 * @returns {boolean} - True if user can manage roles
 */
export function canManageClubRoles(clubData, uid = currentUser?.uid) {
  return isClubPresident(clubData, uid);
}

/**
 * Check if a user can create events in the club.
 * Both presidents and officials can create events.
 *
 * @param {ClubData} clubData - The club document data
 * @param {ClubMember[]} [members] - Array of club members
 * @param {string} [uid] - User ID to check (defaults to current user)
 * @returns {boolean} - True if user can create events
 */
export function canCreateClubEvents(
  clubData,
  members = [],
  uid = currentUser?.uid
) {
  return canModerateClub(clubData, members, uid);
}

/**
 * Get the role of a user in a club.
 *
 * @param {ClubData} clubData - The club document data
 * @param {ClubMember[]} [members] - Array of club members
 * @param {string} [uid] - User ID to check (defaults to current user)
 * @returns {'president' | 'official' | 'member' | null} - The user's role or null if not a member
 */
export function getClubRole(clubData, members = [], uid = currentUser?.uid) {
  if (!uid || !clubData) return null;

  if (isClubPresident(clubData, uid)) return "president";
  if (isClubOfficial(clubData, members, uid)) return "official";

  // Check if user is a regular member
  if (Array.isArray(members) && members.some((m) => m.uid === uid)) {
    return "member";
  }

  return null;
}
