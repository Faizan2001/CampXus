# Firestore Rules & Storage — MVP

These are minimum viable rules to support the v1 features. Tighten as needed.

## Firestore (outline)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }

    // Users
    match /users/{uid} {
      allow read: if isSignedIn();
      allow update, create: if isSelf(uid);
      allow delete: if false;
    }

    // Class spaces (metadata)
    match /classSpaces/{spaceId} {
      allow read: if isSignedIn();
      // Writes managed by Cloud Functions; deny direct client writes
      allow write: if false;

      // Members subcollection (optional)
      match /members/{memberId} {
        allow read: if isSignedIn();
        allow write: if false; // CF only
      }

      // Messages
      match /messages/{msgId} {
        allow read: if isSignedIn();
        allow create, update, delete: if false; // CF only (sendGroupMessage)
      }
    }

    // Moderation reports
    match /moderationReports/{id} {
      allow create: if isSignedIn();
      allow read, update, delete: if false; // Admin UI only (separate rules)
    }
  }
}
```

Notes:
- App-level gating enforces full profile visibility to same‑university users. You can later precompute allowlists or use custom claims to tighten.
- Messages, memberships, and spaces are write-only via Cloud Functions to centralize rate limiting and validation.

## Storage rules (outline)
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /profilePhotos/{uid}/{file} {
      allow read: if request.auth != null; // or restrict further if needed
      allow write: if request.auth != null && request.auth.uid == uid
                   && request.resource.size < 400 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

