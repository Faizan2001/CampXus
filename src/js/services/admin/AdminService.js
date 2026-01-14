/**
 * AdminService.js - Super Admin Backend Operations
 *
 * 🎯 Handles all admin-level operations:
 *   - Super admin verification
 *   - SAF moderator management
 *   - Club CRUD operations
 *   - University management
 *   - Maintenance tasks
 */

import { db } from "../../lib/firebase/firebase-config.js";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  collection,
  addDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { logManager } from "../../utils/debug/LogManager.js";
import { currentUser } from "../../store/userStore.js";
import { callFunction } from "../../utils/firebase/functionsHelper.js";

/**
 * Internal helper: log an admin activity event to Firestore so the
 * dashboard Overview / SAF tabs can render a recent activity feed.
 *
 * This is intentionally lightweight and only callable by super admins
 * (enforced by Firestore rules on /adminActivity).
 *
 * @param {string} type - Activity type, e.g. 'club_created'
 * @param {Object} details - Additional context to store
 */
async function logAdminActivity(type, details = {}) {
  try {
    const actorUid =
      details.actorUid ||
      currentUser?.profile?.uid ||
      currentUser?.user?.uid ||
      null;

    const payload = {
      type,
      actorUid,
      ...details,
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "adminActivity"), payload);
  } catch (error) {
    // This should never block the main operation; log and continue.
    logManager.warn("Failed to log admin activity", {
      type,
      message: error?.message,
    });
  }
}

/**
 * Check if a user is a super admin
 * @param {string} uid - User ID to check
 * @returns {Promise<boolean>}
 */
export async function isSuperAdmin(uid) {
  if (!uid) return false;

  try {
    const adminDoc = await getDoc(doc(db, "admin", "superAdmins"));
    if (!adminDoc.exists()) return false;

    const superAdmins = adminDoc.data()?.uids || [];
    return superAdmins.includes(uid);
  } catch (error) {
    logManager.error("Error checking super admin status", error);
    return false;
  }
}

/**
 * Verify admin PIN against stored hash
 * @param {string} pin - 6-digit PIN
 * @returns {Promise<boolean>}
 */
export async function verifyAdminPin(pin) {
  try {
    // Hash the PIN using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const pinHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const adminDoc = await getDoc(doc(db, "admin", "superAdmins"));
    if (!adminDoc.exists()) return false;

    return pinHash === adminDoc.data().pinHash;
  } catch (error) {
    logManager.error("PIN verification error", error);
    return false;
  }
}

// ==========================================
// UNIVERSITIES
// ==========================================

/**
 * Get all universities
 * @returns {Promise<Array>}
 */
export async function getUniversities() {
  try {
    const snap = await getDocs(collection(db, "universities"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    logManager.error("Error fetching universities", error);
    return [];
  }
}

/**
 * Create a new university
 * @param {Object} data - University data
 * @returns {Promise<string>} - Created university ID
 */
export async function createUniversity(data) {
  const { code, name, domain } = data;
  if (!code || !name) throw new Error("Code and name are required");

  await setDoc(doc(db, "universities", code), {
    name,
    domain: domain || null,
    code,
    createdAt: serverTimestamp(),
    clubCount: 0,
    safCount: 0,
  });

  logManager.info("University created", { code, name });
  await logAdminActivity("university_created", { code, name, domain });
  return code;
}

/**
 * Update a university
 * @param {string} id - University ID
 * @param {Object} data - Fields to update
 */
export async function updateUniversity(id, data) {
  await updateDoc(doc(db, "universities", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
  logManager.info("University updated", { id });
  await logAdminActivity("university_updated", { id, ...data });
}

/**
 * Delete a university
 * @param {string} id - University ID
 */
export async function deleteUniversity(id) {
  await deleteDoc(doc(db, "universities", id));
  logManager.info("University deleted", { id });
  await logAdminActivity("university_deleted", { id });
}

// ==========================================
// SAF MODERATORS
// ==========================================

/**
 * Get all SAF moderators
 * @returns {Promise<Array>}
 */
export async function getSafModerators() {
  try {
    const snap = await getDocs(collection(db, "safModerators"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    logManager.error("Error fetching SAF moderators", error);
    return [];
  }
}

/**
 * Add a new SAF moderator
 * @param {Object} data - Moderator data
 * @returns {Promise<string>} - Created moderator ID (UID)
 */
export async function addSafModerator(data) {
  const { uid, displayName, universityId, addedBy } = data;
  if (!uid) throw new Error("User UID is required");

  await setDoc(doc(db, "safModerators", uid), {
    uid,
    displayName: displayName || null,
    universityId: universityId || null,
    addedAt: serverTimestamp(),
    addedBy: addedBy || null,
  });

  // Increment SAF count for university if specified
  if (universityId) {
    try {
      const uniRef = doc(db, "universities", universityId);
      const uniDoc = await getDoc(uniRef);
      if (uniDoc.exists()) {
        await updateDoc(uniRef, {
          safCount: (uniDoc.data().safCount || 0) + 1,
        });
      }
    } catch (e) {
      logManager.warn("Could not update university SAF count", e);
    }
  }

  logManager.info("SAF moderator added", { uid, universityId });
  await logAdminActivity("saf_added", {
    moderatorUid: uid,
    universityId,
    addedBy,
  });
  return uid;
}

/**
 * Remove a SAF moderator
 * @param {string} uid - Moderator's user ID
 */
export async function removeSafModerator(uid) {
  const modDoc = await getDoc(doc(db, "safModerators", uid));
  const universityId = modDoc.exists() ? modDoc.data().universityId : null;

  await deleteDoc(doc(db, "safModerators", uid));

  // Decrement SAF count for university if applicable
  if (universityId) {
    try {
      const uniRef = doc(db, "universities", universityId);
      const uniDoc = await getDoc(uniRef);
      if (uniDoc.exists() && uniDoc.data().safCount > 0) {
        await updateDoc(uniRef, {
          safCount: uniDoc.data().safCount - 1,
        });
      }
    } catch (e) {
      logManager.warn("Could not update university SAF count", e);
    }
  }

  logManager.info("SAF moderator removed", { uid });
  await logAdminActivity("saf_removed", {
    moderatorUid: uid,
    universityId,
  });
}

// ==========================================
// CLUBS
// ==========================================

/**
 * Get all clubs
 * @param {Object} filters - Optional filters { universityId, search }
 * @returns {Promise<Array>}
 */
export async function getClubs(filters = {}) {
  try {
    let q = collection(db, "clubs");

    if (filters.universityId) {
      q = query(q, where("universityId", "==", filters.universityId));
    }

    const snap = await getDocs(q);
    let clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (filters.search) {
      const term = filters.search.toLowerCase();
      clubs = clubs.filter((c) => c.name?.toLowerCase().includes(term));
    }

    return clubs;
  } catch (error) {
    logManager.error("Error fetching clubs", error);
    return [];
  }
}

/**
 * Create a new club
 * @param {Object} data - Club data
 * @param {string} data.name
 * @param {string} [data.description]
 * @param {string} [data.universityId] - University code (e.g., 'iub')
 * @param {string} [data.universityName] - Human-readable university name
 * @param {string} [data.category]
 * @param {string} [data.createdBy]
 * @returns {Promise<string>} - Created club ID
 */
export async function createClub(data) {
  const {
    name,
    description,
    universityId,
    universityName,
    category,
    createdBy,
    clubId: explicitClubId,
    accentColor,
    requireSafApproval,
    logoUrl,
    bannerUrl,
  } = data;
  if (!name) throw new Error("Club name is required");

  // Generate club ID from name
  const clubId =
    explicitClubId ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 30) +
      "-" +
      Date.now().toString(36);

  await setDoc(doc(db, "clubs", clubId), {
    clubId,
    name,
    description: description || "",
    universityId: universityId || null,
    // Align with existing clubs data model used by ClubsPage/ClubDetailPage
    university: universityName || universityId || null,
    universityCode: universityId || null,
    category: category || "other",
    accentColor: accentColor || "blue",
    logoUrl: logoUrl || null,
    bannerUrl: bannerUrl || null,
    // DEPRECATED: requireSafApproval is always true now (SAF approval is mandatory for ALL events)
    // Keeping field for backward compatibility with existing clubs
    requireSafApproval: true,
    createdAt: serverTimestamp(),
    createdBy: createdBy || null,
    memberCount: 0,
    followerCount: 0,
    isActive: true,
    presidentUid: null,
    presidentId: null,
  });

  // Increment club count for university
  if (universityId) {
    try {
      const uniRef = doc(db, "universities", universityId);
      const uniDoc = await getDoc(uniRef);
      if (uniDoc.exists()) {
        await updateDoc(uniRef, {
          clubCount: (uniDoc.data().clubCount || 0) + 1,
        });
      }
    } catch (e) {
      logManager.warn("Could not update university club count", e);
    }
  }

  logManager.info("Club created", { clubId, name });
  await logAdminActivity("club_created", {
    clubId,
    name,
    universityId,
  });
  return clubId;
}

/**
 * Update a club
 * @param {string} clubId - Club ID
 * @param {Object} data - Fields to update
 */
export async function updateClub(clubId, data) {
  await updateDoc(doc(db, "clubs", clubId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
  logManager.info("Club updated", { clubId });
  await logAdminActivity("club_updated", {
    clubId,
    ...data,
  });
}

/**
 * Delete a club and its subcollections, including all associated images from Storage
 * @param {string} clubId - Club ID
 */
export async function deleteClub(clubId) {
  const clubDoc = await getDoc(doc(db, "clubs", clubId));
  const clubData = clubDoc.exists() ? clubDoc.data() : {};
  const universityId = clubData.universityId || null;

  // Collect image URLs to delete from Storage
  const imageUrlsToDelete = [];

  // Add club logo and banner if present
  if (clubData.logoUrl) imageUrlsToDelete.push(clubData.logoUrl);
  if (clubData.bannerUrl) imageUrlsToDelete.push(clubData.bannerUrl);

  // Delete members subcollection
  const membersSnap = await getDocs(collection(db, "clubs", clubId, "members"));
  const eventsSnap = await getDocs(collection(db, "clubs", clubId, "events"));

  // Collect event image URLs and delete event announcements
  for (const eventDoc of eventsSnap.docs) {
    const eventData = eventDoc.data();
    if (eventData.imageUrl) {
      imageUrlsToDelete.push(eventData.imageUrl);
    }

    // Delete announcements subcollection for each event
    try {
      const announcementsSnap = await getDocs(
        collection(db, "clubs", clubId, "events", eventDoc.id, "announcements")
      );
      if (!announcementsSnap.empty) {
        const announcementBatch = writeBatch(db);
        announcementsSnap.docs.forEach((d) => announcementBatch.delete(d.ref));
        await announcementBatch.commit();
      }
    } catch (e) {
      logManager.warn("Could not delete event announcements", e);
    }
  }

  const docsToDelete = [
    ...membersSnap.docs.map((d) => d.ref),
    ...eventsSnap.docs.map((d) => d.ref),
    doc(db, "clubs", clubId),
  ];

  if (docsToDelete.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < docsToDelete.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = docsToDelete.slice(i, i + batchSize);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  // Delete images from Firebase Storage
  if (imageUrlsToDelete.length > 0) {
    const { getStorage, ref, deleteObject } = await import("firebase/storage");
    const storage = getStorage();

    for (const imageUrl of imageUrlsToDelete) {
      try {
        // Extract storage path from URL (handles gs:// and https:// URLs)
        let storagePath = imageUrl;
        if (imageUrl.startsWith("gs://")) {
          // gs://bucket/path/to/file → path/to/file
          storagePath = imageUrl.replace(/^gs:\/\/[^/]+\//, "");
        } else if (imageUrl.includes("firebasestorage.googleapis.com")) {
          // https://firebasestorage.googleapis.com/.../o/path%2Fto%2Ffile?... → path/to/file
          const match = imageUrl.match(/\/o\/([^?]+)/);
          if (match) {
            storagePath = decodeURIComponent(match[1]);
          }
        }

        const imageRef = ref(storage, storagePath);
        await deleteObject(imageRef);
        logManager.info("Deleted image from storage", { storagePath });
      } catch (e) {
        // Image might already be deleted or path is invalid - log and continue
        logManager.warn("Could not delete image from storage", {
          imageUrl,
          error: e.message,
        });
      }
    }
  }

  // Decrement club count for university
  if (universityId) {
    try {
      const uniRef = doc(db, "universities", universityId);
      const uniDoc = await getDoc(uniRef);
      if (uniDoc.exists() && uniDoc.data().clubCount > 0) {
        await updateDoc(uniRef, {
          clubCount: uniDoc.data().clubCount - 1,
        });
      }
    } catch (e) {
      logManager.warn("Could not update university club count", e);
    }
  }

  // Clean up user.clubRoles for president and officials (Bug fix: stale roles)
  const userIdsToCleanup = new Set();
  if (clubData.presidentId) {
    userIdsToCleanup.add(clubData.presidentId);
  }
  if (Array.isArray(clubData.officialIds)) {
    clubData.officialIds.forEach((uid) => userIdsToCleanup.add(uid));
  }
  // Also check the members array in case it has additional entries
  if (Array.isArray(clubData.members)) {
    clubData.members
      .filter((m) => m.role === "president" || m.role === "official")
      .forEach((m) => {
        if (m.uid) userIdsToCleanup.add(m.uid);
      });
  }

  // Clear clubRoles[clubId] for each affected user
  for (const userId of userIdsToCleanup) {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        [`clubRoles.${clubId}`]: deleteField(),
      });
      logManager.debug("Cleared clubRoles entry for user", { userId, clubId });
    } catch (e) {
      // User might not exist or have the field - log and continue
      logManager.warn("Could not clear clubRoles for user", {
        userId,
        clubId,
        error: e.message,
      });
    }
  }

  logManager.info("Club deleted with all images", {
    clubId,
    imagesDeleted: imageUrlsToDelete.length,
  });
  await logAdminActivity("club_deleted", {
    clubId,
    universityId,
    imagesDeleted: imageUrlsToDelete.length,
  });
}

/**
 * Assign a president to a club.
 *
 * This calls the Cloud Function `assignClubPresident` which properly:
 * - Updates presidentId/presidentUid on the club doc
 * - Updates members array (removes old president, adds new one)
 * - Updates officialIds array if needed
 * - Creates/updates the /clubs/{clubId}/members/{uid} doc
 * - Updates the new president's user.clubRoles
 * - Clears the old president's clubRoles entry for this club
 * - Recalculates memberCount correctly
 *
 * @param {string} clubId - Club ID
 * @param {string} uid - User ID of new president
 */
export async function assignPresident(clubId, uid) {
  const { callFunction } = await import(
    "../../utils/firebase/functionsHelper.js"
  );

  const result = await callFunction("assignClubPresident", {
    clubId,
    userId: uid,
  });

  if (!result?.data?.success) {
    throw new Error(result?.data?.error || "Failed to assign president");
  }

  logManager.info("President assigned via Cloud Function", { clubId, uid });
  await logAdminActivity("club_president_assigned", { clubId, uid });
}

// ==========================================
// MAINTENANCE TASKS
// ==========================================

/**
 * Rebuild all club statistics (member counts, event counts)
 * @param {Function} log - Logging callback
 */
export async function rebuildClubStats(log = console.log) {
  log("Fetching all clubs...");
  const clubsSnap = await getDocs(collection(db, "clubs"));

  let batch = writeBatch(db);
  let updated = 0;
  let operationsInBatch = 0;
  const batchSize = 500;

  for (const clubDoc of clubsSnap.docs) {
    const clubId = clubDoc.id;

    // Count members (only president + officials per data model)
    const membersSnap = await getDocs(
      collection(db, "clubs", clubId, "members")
    );
    let memberCount = 0;
    membersSnap.docs.forEach((memberDoc) => {
      const role = memberDoc.data()?.role;
      if (role === "president" || role === "official") {
        memberCount++;
      }
    });

    // Count events in subcollection
    const eventsSubSnap = await getDocs(
      collection(db, "clubs", clubId, "events")
    );
    const eventCount = eventsSubSnap.size;

    batch.update(doc(db, "clubs", clubId), {
      memberCount,
      eventCount,
      statsUpdatedAt: serverTimestamp(),
    });

    operationsInBatch++;
    updated++;
    log(
      `Updated ${
        clubDoc.data().name
      }: ${memberCount} members (officials+president), ${eventCount} events`
    );
    if (operationsInBatch === batchSize) {
      await batch.commit();
      batch = writeBatch(db);
      operationsInBatch = 0;
    }
  }

  if (operationsInBatch > 0) {
    await batch.commit();
  }
  log(`Rebuilt stats for ${updated} clubs`);
  await logAdminActivity("maintenance_rebuild_stats", {
    clubsUpdated: updated,
  });
  return updated;
}

/**
 * Clean up old events (older than specified days)
 * @param {number} daysOld - Number of days old to consider for cleanup
 * @param {Function} log - Logging callback
 */
export async function cleanupOldEvents(daysOld = 30, log = console.log) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  log(`Finding events older than ${daysOld} days...`);

  // Get events from the global clubEvents collection
  const eventsSnap = await getDocs(collection(db, "clubEvents"));
  const oldEvents = eventsSnap.docs.filter((d) => {
    const endTime = d.data().endTime?.toDate?.();
    return endTime && endTime < cutoffDate;
  });

  log(`Found ${oldEvents.length} old events to clean up`);

  if (oldEvents.length === 0) return 0;

  const batchSize = 500;
  for (let i = 0; i < oldEvents.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = oldEvents.slice(i, i + batchSize);
    chunk.forEach((event) => {
      batch.delete(event.ref);
    });
    await batch.commit();
  }

  log(`Deleted ${oldEvents.length} old events`);
  await logAdminActivity("maintenance_cleanup_events", {
    daysOld,
    deleted: oldEvents.length,
  });
  return oldEvents.length;
}

/**
 * Verify data integrity across collections
 * @param {Function} log - Logging callback
 */
export async function verifyDataIntegrity(log = console.log) {
  log("Checking club data integrity...");

  const clubsSnap = await getDocs(collection(db, "clubs"));
  let issues = 0;

  for (const clubDoc of clubsSnap.docs) {
    const data = clubDoc.data();

    // Check for missing required fields
    if (!data.name) {
      log(`⚠ Club ${clubDoc.id} missing name`, "error");
      issues++;
    }

    // Check president exists in members if set
    const presidentUid = data.presidentUid || data.presidentId;
    if (presidentUid) {
      const memberDoc = await getDoc(
        doc(db, "clubs", clubDoc.id, "members", presidentUid)
      );
      if (!memberDoc.exists()) {
        log(`⚠ Club ${data.name}: President not in members list`);
        issues++;
      } else if (memberDoc.data().role !== "president") {
        log(`⚠ Club ${data.name}: President member has wrong role`);
        issues++;
      }
    }

    // Check member count accuracy
    const membersSnap = await getDocs(
      collection(db, "clubs", clubDoc.id, "members")
    );
    if (data.memberCount !== membersSnap.size) {
      log(
        `⚠ Club ${data.name}: Member count mismatch (${data.memberCount} vs ${membersSnap.size})`
      );
      issues++;
    }
  }

  log(`Verification complete. Found ${issues} issues.`);
  await logAdminActivity("maintenance_verify_data", { issues });
  return issues;
}

/**
 * Clean up old read notifications
 * @param {number} daysOld - Number of days old
 * @param {Function} log - Logging callback
 */
export async function cleanupOldNotifications(daysOld = 7, log = console.log) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  log(`Finding read notifications older than ${daysOld} days...`);

  const notifSnap = await getDocs(
    query(collection(db, "notifications"), where("read", "==", true))
  );

  const oldNotifs = notifSnap.docs.filter((d) => {
    const createdAt = d.data().createdAt?.toDate?.();
    return createdAt && createdAt < cutoffDate;
  });

  log(`Found ${oldNotifs.length} old notifications to clean up`);

  if (oldNotifs.length === 0) return 0;

  // Batch delete (max 500 per batch)
  let deleted = 0;
  const batchSize = 500;

  for (let i = 0; i < oldNotifs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = oldNotifs.slice(i, i + batchSize);
    chunk.forEach((n) => batch.delete(n.ref));
    await batch.commit();
    deleted += chunk.length;
    log(`Deleted batch: ${deleted}/${oldNotifs.length}`);
  }

  log(`Deleted ${deleted} old notifications`);
  await logAdminActivity("maintenance_cleanup_notifications", {
    daysOld,
    deleted,
  });
  return deleted;
}

/**
 * Run a privileged server-side automation job (Cloud Function).
 * Only super admins can call this; the server enforces authorization.
 * @param {string} job - Job name (server whitelist)
 * @returns {Promise<Object|null>}
 */
export async function runAutomationJob(job) {
  if (!job) throw new Error("job is required");
  const res = await callFunction("runAdminAutomationJob", { job });
  return res?.data || null;
}

// Export all functions as a service object
export const AdminService = {
  isSuperAdmin,
  verifyAdminPin,
  // Universities
  getUniversities,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  // SAF Moderators
  getSafModerators,
  addSafModerator,
  removeSafModerator,
  // Clubs
  getClubs,
  createClub,
  updateClub,
  deleteClub,
  assignPresident,
  // Maintenance
  rebuildClubStats,
  cleanupOldEvents,
  verifyDataIntegrity,
  cleanupOldNotifications,
  runAutomationJob,
};

export default AdminService;
