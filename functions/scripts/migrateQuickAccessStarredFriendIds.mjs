#!/usr/bin/env node

/**
 * One-time migration:
 * - Backfills quickAccessData.starredFriendIds for all users
 * - Based on existing quickAccessData.starredFriends entries
 *
 * Usage (from repo root):
 *   cd functions
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrateQuickAccessStarredFriendIds.mjs  # For emulator
 *   OR
 *   node scripts/migrateQuickAccessStarredFriendIds.mjs  # For production (needs auth)
 *
 * Auth:
 *   - Locally: ensure GOOGLE_APPLICATION_CREDENTIALS is set to a service account JSON
 *   - In Cloud Shell / emulator: applicationDefault() usually works
 *   - With Firebase CLI: Use FIRESTORE_EMULATOR_HOST for emulator or service account for prod
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if running against emulator
const isEmulator = process.env.FIRESTORE_EMULATOR_HOST;

let app;
if (isEmulator) {
  console.log(`🧪 Running against emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  app = initializeApp({
    projectId: "meetchuthere-00",
  });
} else {
  // Try to load service account from environment variable or default location
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                             join(__dirname, '../../service-account-key.json');
  
  try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    console.log(`🔐 Using service account: ${serviceAccount.client_email}`);
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  } catch (error) {
    console.error(`❌ Could not load service account from: ${serviceAccountPath}`);
    console.error(`\nTo fix this, either:`);
    console.error(`1. Download service account JSON from Firebase Console > Project Settings > Service Accounts`);
    console.error(`   and save it as: ${join(__dirname, '../../service-account-key.json')}`);
    console.error(`2. Or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`);
    console.error(`3. Or run against emulator: FIRESTORE_EMULATOR_HOST=localhost:8080 node ${process.argv[1]}\n`);
    process.exit(1);
  }
}

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

