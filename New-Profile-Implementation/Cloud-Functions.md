# Cloud Functions — Schedules, Messaging, Moderation

Time zone: Asia/Dhaka

## scheduleDailyClassSpaces (Pub/Sub, 06:00 daily)
- Query all users with non-empty `courses[]`.
- Bucket courses by canonical key (see Normalization-Spec.md).
- For each bucket with count ≥4:
  - Upsert `classSpaces/{spaceId}` with normalized fields and denorms (memberIds, memberCount, memberInfo, lastMemberUpdate).
  - Use deterministic `spaceId` and a transaction to prevent duplicates.
- For buckets with count <4 that previously existed, set `active=false` (preserve history).
- Labs are distinct spaces; single-day classes included.
- No instant joins on paste; membership only updated in this job.

Pseudo:
```ts
exports.scheduleDailyClassSpaces = pubsub
  .schedule('0 6 * * *')
  .timeZone('Asia/Dhaka')
  .onRun(async () => {
    const users = await db.collection('users').get();
    const buckets = new Map();
    for (const doc of users.docs) {
      const data = doc.data();
      const uni = data.universityInfo?.university;
      const courses = data.courses || [];
      for (const c of courses) {
        const key = buildSpaceKey({ ...c, university: uni });
        if (!key) continue;
        if (!buckets.has(key)) buckets.set(key, new Set());
        buckets.get(key).add(doc.id);
      }
    }
    for (const [key, memberSet] of buckets) {
      const members = Array.from(memberSet);
      await upsertSpaceAndMembers(key, members); // only if members.length >= 4
    }
    return null;
  });
```

## sendGroupMessage (Callable/HTTPS)
- Auth + membership check (`classSpaces/{spaceId}` contains `request.auth.uid` in `memberIds`).
- Rate limit: 1 message / 3 seconds per user per space (transaction with `rateLimits/{spaceId}_{uid}`).
- Create message with serverTimestamp; update `lastActivity` + `lastMessagePreview`.

## trimSpaceMessages (Pub/Sub, nightly)
- For each active space, keep only latest 2,000 messages.
- Delete older in batches to avoid write limits.

## onFriendshipWriteUpdateFriendIds (Firestore trigger)
- On friendship create/delete, update both users’ `socialInfo.friendIds` arrays and `friendsCount`.
- Enables efficient mutual friends preview on profile view.

