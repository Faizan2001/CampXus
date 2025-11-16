#!/usr/bin/env node

/**
 * One-time migration:
 * - Backfills quickAccessData.starredFriendIds for all users
 * - Based on existing quickAccessData.starredFriends entries
 *
 * Usage (from repo root):
 *   cd functions
 *   node scripts/migrateQuickAccessStarredFriendIds.mjs
 *
 * Auth:
 *   - Locally: ensure GOOGLE_APPLICATION_CREDENTIALS is set to a service account JSON
 *   - In Cloud Shell / emulator: applicationDefault() usually works
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function migrateQuickAccessStarredFriendIds() {
  const BATCH_LIMIT = 400;
  console.log("🚀 Starting QuickAccess starredFriendIds migration...");

  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users to inspect`);

  let batch = db.batch();
  let pendingWrites = 0;
  let updatedUsers = 0;

  const flushBatch = async () => {
    if (pendingWrites === 0) return;
    await batch.commit();
    console.log(`✅ Committed batch with ${pendingWrites} user updates`);
    batch = db.batch();
    pendingWrites = 0;
  };

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() || {};
    const qa = data.quickAccessData || {};
    const starredFriends = Array.isArray(qa.starredFriends)
      ? qa.starredFriends
      : [];

    if (starredFriends.length === 0) continue;

    const existingIds = Array.isArray(qa.starredFriendIds)
      ? qa.starredFriendIds
      : [];

    const computedIds = Array.from(
      new Set(
        starredFriends
          .map((f) => f.friendId || f.userId)
          .filter((id) => typeof id === "string" && id.length > 0)
      )
    );

    // If nothing to compute, or already equal, skip
    if (computedIds.length === 0) continue;
    const same =
      existingIds.length === computedIds.length &&
      existingIds.every((id, idx) => id === computedIds[idx]);
    if (same) continue;

    batch.update(userDoc.ref, {
      "quickAccessData.starredFriendIds": computedIds,
      "quickAccessData.lastUpdated": FieldValue.serverTimestamp(),
    });
    pendingWrites += 1;
    updatedUsers += 1;

    if (pendingWrites >= BATCH_LIMIT) {
      await flushBatch();
    }
  }

  await flushBatch();
  console.log(
    `🎉 Migration complete. Updated ${updatedUsers} user document(s) with starredFriendIds`
  );
}

migrateQuickAccessStarredFriendIds()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });

