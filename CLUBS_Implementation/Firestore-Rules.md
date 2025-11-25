# 🔒 Clubs Feature - Firestore Security Rules

This document contains the Firestore security rules for the Clubs feature.

---

## 📋 Rules Overview

```
clubs/{clubId}                    → University-scoped read, role-based write
clubs/{clubId}/events/{eventId}   → Club-scoped read, official+ write
clubs/{clubId}/events/{eventId}/liveChat/{msgId} → Event-scoped read, official+ write
clubs/{clubId}/members/{userId}   → Club-scoped read, president+ write
admin/*                           → Super admin only
```

---

## 🔐 Security Rules

Add these rules to your `firestore.rules` file:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

    // Check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Check if user is verified (email verified)
    function isVerified() {
      return request.auth != null && request.auth.token.email_verified == true;
    }

    // Get user document
    function getUserDoc(userId) {
      return get(/databases/$(database)/documents/users/$(userId)).data;
    }

    // Get current user's document
    function getCurrentUserDoc() {
      return getUserDoc(request.auth.uid);
    }

    // Check if user is super admin
    function isSuperAdmin() {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/admin/superAdmins) &&
        request.auth.uid in get(/databases/$(database)/documents/admin/superAdmins).data.uids;
    }

    // Check if user is SAF moderator for a university
    function isSafModeratorFor(university) {
      return isAuthenticated() && (
        isSuperAdmin() ||
        (
          exists(/databases/$(database)/documents/admin/safModerators) &&
          university in get(/databases/$(database)/documents/admin/safModerators).data &&
          request.auth.uid in get(/databases/$(database)/documents/admin/safModerators).data[university].moderators[*].uid
        )
      );
    }

    // Check if user is SAF moderator (based on user doc)
    function isSafModerator() {
      let userDoc = getCurrentUserDoc();
      return userDoc != null &&
        'safModeratorFor' in userDoc &&
        userDoc.safModeratorFor.size() > 0;
    }

    // Get club document
    function getClubDoc(clubId) {
      return get(/databases/$(database)/documents/clubs/$(clubId)).data;
    }

    // Check if user is president of a club
    function isClubPresident(clubId) {
      let club = getClubDoc(clubId);
      return isAuthenticated() && club.presidentId == request.auth.uid;
    }

    // Check if user is official (or higher) of a club
    function isClubOfficial(clubId) {
      let userDoc = getCurrentUserDoc();
      return isAuthenticated() && (
        isSuperAdmin() ||
        isSafModeratorFor(getClubDoc(clubId).university) ||
        isClubPresident(clubId) ||
        (
          'clubRoles' in userDoc &&
          clubId in userDoc.clubRoles &&
          userDoc.clubRoles[clubId].role in ['official', 'president']
        )
      );
    }

    // Check if user belongs to same university as club
    function isSameUniversity(clubUniversity) {
      let userDoc = getCurrentUserDoc();
      return userDoc != null &&
        'universityInfo' in userDoc &&
        userDoc.universityInfo.university == clubUniversity;
    }

    // =========================================================================
    // CLUBS COLLECTION
    // =========================================================================

    match /clubs/{clubId} {
      // READ: Authenticated users from same university can read clubs
      allow read: if isAuthenticated() && (
        isSuperAdmin() ||
        isSameUniversity(resource.data.university)
      );

      // CREATE: Only SAF moderators and super admin can create clubs
      allow create: if isAuthenticated() && (
        isSuperAdmin() ||
        isSafModeratorFor(request.resource.data.university)
      ) && (
        // Required fields validation
        request.resource.data.name is string &&
        request.resource.data.name.size() > 0 &&
        request.resource.data.name.size() <= 100 &&
        request.resource.data.university is string &&
        request.resource.data.isActive == true &&
        request.resource.data.createdAt == request.time &&
        request.resource.data.followerCount == 0 &&
        request.resource.data.memberCount == 0
      );

      // UPDATE: SAF/Admin can update anything, President can update limited fields
      allow update: if isAuthenticated() && (
        // Super admin or SAF can update anything
        isSuperAdmin() ||
        isSafModeratorFor(resource.data.university) ||
        // President can only update specific fields
        (
          isClubPresident(clubId) &&
          // Cannot change: university, presidentId, isActive, createdAt
          request.resource.data.university == resource.data.university &&
          request.resource.data.presidentId == resource.data.presidentId &&
          request.resource.data.createdAt == resource.data.createdAt &&
          // Can change: description, settings, stats (via increment)
          request.resource.data.diff(resource.data).affectedKeys()
            .hasOnly(['description', 'requireSafApproval', 'followerCount', 'memberCount',
                      'eventsThisWeek', 'nextEventDate', 'lastEventAt', 'updatedAt',
                      'logoUrl', 'bannerUrl', 'accentColor'])
        )
      );

      // DELETE: Only super admin can delete clubs
      allow delete: if isSuperAdmin();

      // ----- EVENTS SUBCOLLECTION -----
      match /events/{eventId} {
        // READ: Same university users can read approved events, officials can read all
        allow read: if isAuthenticated() && (
          isSuperAdmin() ||
          isSafModeratorFor(getClubDoc(clubId).university) ||
          isClubOfficial(clubId) ||
          (
            isSameUniversity(getClubDoc(clubId).university) &&
            resource.data.status == 'approved'
          )
        );

        // CREATE: Officials and above can create events
        allow create: if isAuthenticated() && (
          isClubOfficial(clubId) &&
          // Required fields
          request.resource.data.clubId == clubId &&
          request.resource.data.title is string &&
          request.resource.data.title.size() > 0 &&
          request.resource.data.title.size() <= 100 &&
          request.resource.data.timeSlots is list &&
          request.resource.data.timeSlots.size() > 0 &&
          request.resource.data.createdBy == request.auth.uid &&
          request.resource.data.createdAt == request.time &&
          // Initial status must be pending (unless SAF/Admin)
          (
            request.resource.data.status == 'pending_president' ||
            (isSuperAdmin() || isSafModeratorFor(getClubDoc(clubId).university)) &&
              request.resource.data.status == 'approved'
          )
        );

        // UPDATE: Complex rules based on role and what's being updated
        allow update: if isAuthenticated() && (
          // Super admin can do anything
          isSuperAdmin() ||
          // SAF can approve, reject, edit
          isSafModeratorFor(getClubDoc(clubId).university) ||
          // President can approve, reject, edit
          isClubPresident(clubId) ||
          // Original creator (official) can edit their own pending events
          (
            isClubOfficial(clubId) &&
            resource.data.createdBy == request.auth.uid &&
            resource.data.status in ['draft', 'pending_president', 'rejected'] &&
            // Cannot self-approve
            request.resource.data.status in ['draft', 'pending_president']
          ) ||
          // Officials can mark event as started (during valid time window)
          (
            isClubOfficial(clubId) &&
            resource.data.status == 'approved' &&
            request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['isLive', 'startedAt', 'startedBy', 'startedByInfo', 'updatedAt'])
          )
        );

        // DELETE: President, SAF, Admin only
        allow delete: if isAuthenticated() && (
          isSuperAdmin() ||
          isSafModeratorFor(getClubDoc(clubId).university) ||
          isClubPresident(clubId)
        );

        // ----- LIVE CHAT SUBCOLLECTION -----
        match /liveChat/{messageId} {
          // READ: Same university users can read
          allow read: if isAuthenticated() && (
            isSuperAdmin() ||
            isSameUniversity(getClubDoc(clubId).university)
          );

          // CREATE: Only officials can post in live chat
          allow create: if isAuthenticated() && (
            isClubOfficial(clubId) &&
            request.resource.data.senderId == request.auth.uid &&
            request.resource.data.content is string &&
            request.resource.data.content.size() > 0 &&
            request.resource.data.content.size() <= 500 &&
            request.resource.data.createdAt == request.time
          );

          // UPDATE: Not allowed (messages are immutable)
          allow update: if false;

          // DELETE: Only via Cloud Function (TTL cleanup)
          allow delete: if false;
        }
      }

      // ----- MEMBERS SUBCOLLECTION -----
      match /members/{memberId} {
        // READ: Same university users can read members
        allow read: if isAuthenticated() && (
          isSuperAdmin() ||
          isSameUniversity(getClubDoc(clubId).university)
        );

        // CREATE/UPDATE: President, SAF, Admin can manage members
        allow create, update: if isAuthenticated() && (
          isSuperAdmin() ||
          isSafModeratorFor(getClubDoc(clubId).university) ||
          isClubPresident(clubId)
        );

        // DELETE: Same as create/update
        allow delete: if isAuthenticated() && (
          isSuperAdmin() ||
          isSafModeratorFor(getClubDoc(clubId).university) ||
          isClubPresident(clubId)
        );
      }
    }

    // =========================================================================
    // ADMIN COLLECTION
    // =========================================================================

    match /admin/{docId} {
      // Only super admin can read/write admin docs
      allow read: if isSuperAdmin();
      allow write: if isSuperAdmin();
    }

    // =========================================================================
    // USER DOCUMENT ADDITIONS (club fields)
    // =========================================================================

    // These rules extend existing /users/{userId} rules
    // The existing rules should allow users to update their own document
    // We just need to ensure clubRoles can only be modified by authorized users

    // Note: Add this validation to existing user update rules:
    // - followedClubs: user can modify their own
    // - followedClubsCount: user can modify their own
    // - clubRoles: ONLY modifiable by President/SAF/Admin (use Cloud Function)
    // - safModeratorFor: ONLY modifiable by Super Admin (use Cloud Function)
    // - isSuperAdmin: NEVER modifiable by client (server-only field)

    // =========================================================================
    // NOTIFICATIONS (club types)
    // =========================================================================

    // Extend existing /notifications rules to handle club notification types
    // The existing rules should already allow:
    // - Users to read their own notifications
    // - Users to update (mark read) their own notifications
    // - System (Cloud Functions) to create notifications

  }
}
```

---

## 🔑 Key Security Decisions

### 1. University Isolation

- Students can ONLY see clubs from their own university
- Enforced at the document read level
- `isSameUniversity()` helper checks user's `universityInfo.university`

### 2. Role Hierarchy

```
Super Admin > SAF Moderator > Club President > Official > Student
```

Each level inherits permissions from levels below.

### 3. Event Approval Flow

- Officials create events with `status: 'pending_president'`
- Only President/SAF/Admin can change status to `approved`
- Editing an approved event requires re-approval

### 4. Live Chat Protection

- Only officials can CREATE messages
- Messages cannot be updated (immutable)
- Messages cannot be deleted by clients (TTL cleanup via Cloud Function)

### 5. Role Assignment Protection

- `clubRoles` field in user document can ONLY be modified via Cloud Function
- This prevents users from self-promoting to official/president
- Cloud Function validates caller has permission before modifying

---

## ⚠️ Important Notes

### Cloud Function Requirements

These operations MUST go through Cloud Functions (not direct client writes):

1. **Promoting user to official/president**

   - Updates target user's `clubRoles`
   - Creates member document
   - Validates caller is president/SAF/admin

2. **Demoting/removing official**

   - Updates target user's `clubRoles`
   - Updates member document
   - Validates caller has permission

3. **Assigning SAF moderator**

   - Updates `/admin/safModerators`
   - Updates user's `safModeratorFor`
   - Only super admin can call

4. **Following/unfollowing club**

   - Updates user's `followedClubs`
   - Increments/decrements club's `followerCount`
   - Must be atomic (batch write)

5. **Deleting expired live chat messages**
   - Scheduled function
   - Queries `expiresAt < now`
   - Batch deletes

---

## 🧪 Testing Checklist

### Student Tests

- [ ] Can read clubs from own university
- [ ] Cannot read clubs from other universities
- [ ] Cannot create clubs
- [ ] Cannot create events
- [ ] Can read approved events
- [ ] Cannot read pending events
- [ ] Cannot post in live chat

### Official Tests

- [ ] Can create events (status: pending_president)
- [ ] Cannot self-approve events
- [ ] Can edit own pending events
- [ ] Can post in live chat
- [ ] Can mark event as started

### President Tests

- [ ] Can approve/reject events
- [ ] Can edit any event in club
- [ ] Can delete events
- [ ] Can promote users to officials (via Cloud Function)

### SAF Tests

- [ ] Can create clubs
- [ ] Can assign presidents
- [ ] Can approve events (when required)
- [ ] Can delete any event

### Admin Tests

- [ ] Can access /admin documents
- [ ] Can delete clubs
- [ ] Can assign SAF moderators

---

## 🔗 Related Documents

- [Data-Model.md](./Data-Model.md) — Schema definitions
- [Cloud-Functions.md](./Cloud-Functions.md) — Protected operations
- [Admin-System.md](./Admin-System.md) — Admin dashboard

---

_End of Firestore Rules_
