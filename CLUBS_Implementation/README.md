# 🎓 Clubs Feature - Implementation Package

Welcome to the Clubs Feature implementation documentation for MeetchuThere!

## 📁 What's Inside

| Document                                           | Description                                  |
| -------------------------------------------------- | -------------------------------------------- |
| [PRD.md](./PRD.md)                                 | Complete Product Requirements Document       |
| [Data-Model.md](./Data-Model.md)                   | Firestore database schema & structure        |
| [Firestore-Rules.md](./Firestore-Rules.md)         | Security rules for clubs feature             |
| [Implementation-Plan.md](./Implementation-Plan.md) | Phased development roadmap                   |
| [UI-Specs.md](./UI-Specs.md)                       | UI/UX specifications & CSS patterns          |
| [Cloud-Functions.md](./Cloud-Functions.md)         | Backend functions for cleanup, notifications |
| [Admin-System.md](./Admin-System.md)               | Admin dashboard & role management            |

## 🚀 Quick Start

1. Read the **PRD.md** first for full feature understanding
2. Review **Data-Model.md** before touching Firestore
3. Follow **Implementation-Plan.md** phases in order
4. Test with the provided test scenarios

## 🎯 Key Decisions Summary

- **Location**: Clubs is a top-level navigation item (shown as "Clubs" in nav, routes via `#groups` or `#clubs`)
- **Focus**: Events only (no announcements) — keeping it action-oriented
- **Permissions**: Admin → SAF Moderators → Club Presidents → Officials → Students
- **Storage**: 90-day event retention, 1 hero image per event
- **Notifications**: New event, reminder, changes, event started, cancelled

---

## Super Admin Setup

To set up a super admin, create a document at `/admin/superAdmins` in Firestore with:

```javascript
{
  uids: ["your-firebase-uid-here"],
  pinHash: "sha256-hash-of-your-pin"
}
```

### Generate PIN Hash

Run this in your browser console to generate a SHA-256 hash of your 6-digit PIN:

```javascript
const pin = "123456"; // Replace with your chosen PIN
const encoder = new TextEncoder();
const data = encoder.encode(pin);
crypto.subtle.digest("SHA-256", data).then((hash) => {
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  console.log("PIN Hash:", hashHex);
});
```

Copy the output and paste it as the `pinHash` value in Firestore.

---

_Generated: November 26, 2025_
_Branch: public-profilexgroups_
