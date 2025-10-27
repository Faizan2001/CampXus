# Public Profile & Class Spaces - Product Requirements Document (PRD)

**Project:** CampXus (MeetchuThere)  
**Feature:** Enhanced Public Profiles + Automatic Class Spaces  
**Version:** 1.0  
**Date:** October 26, 2025  
**Status:** Planning

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature Overview](#feature-overview)
3. [User Stories](#user-stories)
4. [Detailed Requirements](#detailed-requirements)
5. [Database Structure](#database-structure)
6. [Firestore Free Tier Analysis](#firestore-free-tier-analysis)
7. [NSFW Content Protection](#nsfw-content-protection)
8. [Migration Strategy](#migration-strategy)
9. [UI/UX Specifications](#uiux-specifications)
10. [Technical Implementation](#technical-implementation)
11. [Security & Privacy](#security--privacy)
12. [Timeline & Milestones](#timeline--milestones)

---

## 🎯 Executive Summary

This PRD outlines the development of two major interconnected features for MeetchuThere:

1. **Enhanced Public Profiles**: Rich, customizable user profiles with photos/avatars, interests, and Q&A prompts
2. **Automatic Class Spaces**: Group chats automatically created for students sharing the same course sections

These features will transform MeetchuThere from a schedule-sharing app into a comprehensive campus social platform while remaining within Firestore's free tier limits.

---

## 🌟 Feature Overview

### 1. Public Profiles

**Current State:**

- Step 2 of profile setup: Choose avatar + add bio
- Minimal public information (handle, major, avatar only)

**New State:**

- Replace Step 2 with comprehensive public profile customization
- Profile picture upload OR avatar selection (avatar by default)
- NSFW content protection on uploaded images
- Rich profile data: interests, social handles, Q&A responses
- Viewable by classmates and friends

### 2. Class Spaces

**New Feature:**

- Automatically create group chat "spaces" when ≥3 students share:
  - Same course code (e.g., CSC101)
  - Same section number (e.g., Section 02)
  - Same classroom (e.g., NAC 902)
  - Same day/time (e.g., MW 11:20-12:50)
- Each space includes:
  - Group chat for class discussions
  - Member roster with profile links
  - Quick profile preview on tap

---

## 👥 User Stories

### Public Profiles

**As a student, I want to:**

1. Upload a profile picture so I'm easily recognizable to classmates
2. Choose custom avatar if I prefer not to upload a photo
3. Specify my interests/hobbies so I can find like-minded people
4. Answer fun Q&A prompts to showcase my personality
5. View classmates' profiles to learn more about them before connecting
6. See mutual friends and common courses when viewing someone's profile

### Class Spaces

**As a student, I want to:**

1. Automatically join group chats for my classes without manual setup
2. See who else is in my section so I can form study groups
3. Communicate with classmates about assignments and exam prep
4. View profiles of classmates to find potential study partners
5. Get notified when a new class space is created for my courses

---

## 📝 Detailed Requirements

### Public Profile Components

#### 1. Profile Photo/Avatar (Step 2 Replacement)

**Current:** `setup-bio` textarea + avatar selector  
**New:** Profile customization section with:

- **Profile Picture Upload**

  - Circular image preview (150x150px displayed, 512x512px stored)
  - Supported formats: JPEG, PNG, WebP (max 2MB)
  - **NSFW protection** via Cloud Vision API (see [NSFW Protection](#nsfw-content-protection))
  - Automatic cropping/resizing to square
  - Fallback to avatar if upload fails or is rejected

- **Avatar Selection** (Default)
  - Keep existing DiceBear integration
  - Avatar is default option (pre-selected)
  - "Use Avatar Instead" button to switch from photo

#### 2. Basic Info (Enhanced)

**Display on Profile:**

- First Name + Last Name (from existing profile data)
- Unique @handle (from existing profile data)
- Starting Year (e.g., "Class of 2025")
- Major (primary) + Minor (optional, new field)
- University (from existing universityInfo)
- Friends count + mutual friends (when viewing others)

**New Fields:**

- `profile.minor` (string, optional) - e.g., "Mathematics"

#### 3. Social Network Display

**Purpose:** Show user's social connections on CampXus  
**Data Structure:**

```javascript
// This is auto-generated from friendships collection, not manually entered
// No new fields needed - calculated on-the-fly when viewing profile
```

**Display on Profile:**

- **Friends Count:** "42 friends" (from existing `socialInfo.friendsCount`)
- **Mutual Friends:** "8 mutual friends" (calculated when viewing someone else's profile)
  - Shows avatars of up to 3 mutual friends with @handles
  - "and 5 others" if more than 3
  - Clickable to see full mutual friends list
- **Common Courses:** Highlighted chips showing shared classes (e.g., "CSC101", "MAT105")
  - Only shown when viewing someone else's profile
  - Pulls from both users' schedules
  - Click course chip → View class space for that course

#### 4. Interests & Hobbies (Chips)

**Purpose:** Tag-based interest system for discovery  
**Data Structure:**

```javascript
profile.interests: [
  "coding",
  "photography",
  "gaming",
  "music",
  "sports",
  "reading"
  // ... up to 10 tags
]
```

**Implementation:**

- Predefined tags + custom tags (lowercase, 3-20 chars)
- Max 10 interests per user
- Searchable via Firestore array-contains queries
- Display as colorful chips on profile

**Predefined Interest Categories:**

- **Academics:** coding, math, research, writing, languages
- **Creative:** art, music, photography, design, video editing
- **Physical:** sports, gym, hiking, yoga, running
- **Social:** volunteering, clubs, debate, theater
- **Hobbies:** gaming, cooking, reading, travel, anime

#### 5. Profile Q&A Prompts

**Purpose:** Personality showcase through question responses  
**Data Structure:**

```javascript
profile.qnaResponses: [
  {
    questionId: "fav_movie",
    question: "Favorite movie of all time?",
    answer: "Inception - it blew my mind!",
    answeredAt: timestamp
  },
  {
    questionId: "superpower",
    question: "If you could have any superpower?",
    answer: "Time travel to fix my coding bugs",
    answeredAt: timestamp
  }
  // ... up to 5 Q&A pairs
]
```

**Question Bank:** (Stored in Firestore `prompts/questions` collection)

```javascript
{
  id: "fav_movie",
  question: "Favorite movie of all time?",
  category: "fun",
  order: 1
},
{
  id: "superpower",
  question: "If you could have any superpower?",
  category: "fun",
  order: 2
},
{
  id: "study_spot",
  question: "Your go-to study spot on campus?",
  category: "campus",
  order: 3
},
// ... 30-50 questions total
```

**Constraints:**

- Users select which questions to answer (max 5 active)
- Answers: 5-200 characters
- Questions categorized: fun, serious, campus, academic
- Bank updated via Firestore, no code deployment needed

#### 6. Bio Enhancement

**Keep existing bio field** but enhance visibility:

- Display bio prominently at top of public profile (first thing visitors see)
- Character limit: 150 chars (current) → 250 chars (new)
- Optional field

---

### Class Spaces (Automatic Group Chats)

#### 1. Space Creation Logic

**Trigger:** When a user adds/updates their schedule  
**Conditions for Space Creation:**

```javascript
// Create space if ≥3 users share ALL of:
{
  courseCode: "CSC101",           // Same course
  section: "02",                  // Same section
  classroom: "NAC 902",           // Same classroom
  dayPattern: "MW",               // Same days (Mon/Wed)
  timeSlot: "11:20-12:50"        // Same time
}
```

**Space Identifier (Document ID):**

```javascript
// Format: {university}_{courseCode}_{section}_{dayPattern}_{timeSlot}_{classroom}
// Example: iub_CSC101_02_MW_1120-1250_NAC902
const spaceId = `${university}_${courseCode}_${section}_${dayPattern}_${timeStart}-${timeEnd}_${classroom}`;
```

#### 2. Database Structure for Class Spaces

**Collection:** `classSpaces/{spaceId}`

```javascript
{
  // Space Metadata
  spaceId: "iub_CSC101_02_MW_1120-1250_NAC902",
  university: "iub",

  // Course Details
  courseCode: "CSC101",
  courseName: "Introduction to Computer Science", // Optional, from course catalog
  section: "02",

  // Schedule Details
  classroom: "NAC 902",
  dayPattern: "MW",              // M, T, W, R, F, S, MW, TR, etc.
  timeSlot: "11:20-12:50",
  timeStart: "11:20",
  timeEnd: "12:50",

  // Members
  memberIds: ["uid1", "uid2", "uid3", ...],     // Array of user IDs
  memberCount: 15,                               // Denormalized for quick access
  memberInfo: {                                  // Cached member data for roster
    "uid1": {
      handle: "johndoe",
      firstName: "John",
      lastName: "Doe",
      avatarConfig: {...},
      profilePhotoUrl: null,                    // or Storage URL if uploaded
      major: "CSC"
    },
    // ... other members
  },

  // Space Status
  active: true,                                  // false if <3 members
  createdAt: timestamp,
  lastActivity: timestamp,                       // Last message sent
  lastMemberUpdate: timestamp,                   // Last member join/leave

  // Privacy
  visibility: "university",                      // Only students from same university

  // Analytics
  messageCount: 142,                            // Total messages
  activeMembers: 12                             // Members who've sent ≥1 message
}
```

**Subcollection:** `classSpaces/{spaceId}/messages/{messageId}`

```javascript
{
  messageId: "auto-generated",
  senderId: "uid1",
  senderInfo: {                                 // Cached for display
    handle: "johndoe",
    firstName: "John",
    avatarConfig: {...}
  },
  content: "Hey everyone! Study group at library tomorrow?",

  // Message Metadata
  createdAt: timestamp,
  edited: false,
  editedAt: null,

  // Reactions (optional for v2)
  reactions: {
    "👍": ["uid2", "uid3"],
    "❤️": ["uid5"]
  },

  // Status
  deleted: false
}
```

#### 3. Space Management Rules

**Creation:**

- Automatically create when 3rd member joins (via Cloud Function trigger)
- Send notification to all 3 members: "Class space created for CSC101 Section 02!"

**Member Updates:**

- Add member when they add matching course to schedule
- Remove member when they remove course OR change section/time
- If members drop below 3, mark space as `active: false` (don't delete, preserve messages)

**Space Lifecycle:**

- Archive spaces at end of semester (based on university calendar)
- Archived spaces remain viewable but read-only
- Delete spaces after 1 year of inactivity (optional cleanup)

#### 4. UI for Class Spaces

**Home Page Integration:**

- New section: "Class Spaces" below schedule
- Card-based layout (Google Classroom style)
- Each card shows:
  - Course code + section (e.g., "CSC101 - Section 02")
  - Classroom + time (e.g., "NAC 902 • MW 11:20-12:50")
  - Member count (e.g., "15 classmates")
  - Last message preview + timestamp
  - Unread message count badge

**Space Detail View (Tap on Card):**

- **Tab 1: Group Chat** (Default)
  - Real-time message list
  - Text input at bottom
  - Sender avatar + name + timestamp
  - Auto-scroll to newest message
- **Tab 2: Members** (Swipe/Switch)
  - List of all members with avatars
  - Tap member → View their public profile
  - "Send Friend Request" button if not already friends
  - Filter/search members

**Profile Access:**

- Profile icon on each member card
- Opens full public profile modal/page
- Shows bio, interests, Q&A, social handles
- "Send Friend Request" button prominent

---

## 🗄️ Database Structure

### Updated User Document

**Path:** `users/{userId}`

```javascript
{
  // ========== EXISTING FIELDS (UNCHANGED) ==========
  uid: "userId123",

  profile: {
    // Existing
    firstName: "John",
    firstName_lower: "john",
    lastName: "Doe",
    lastName_lower: "doe",
    email: "john@iub.edu.bd",
    major: "CSC",
    major_lower: "csc",
    startingYear: "2022",
    handle: "johndoe",
    bio: "Love coding and building apps!",
    studentId: "2230001",

    // ========== NEW FIELDS ==========
    minor: "Mathematics",                       // Optional
    profilePhotoUrl: null,                      // Firebase Storage URL or null
    useAvatar: true,                           // true = avatar, false = uploaded photo

    interests: [
      "coding",
      "photography",
      "gaming",
      "music",
      "hiking"
    ],

    qnaResponses: [
      {
        questionId: "fav_movie",
        question: "Favorite movie of all time?",
        answer: "Inception - mind-blowing!",
        answeredAt: timestamp
      },
      {
        questionId: "study_spot",
        question: "Your go-to study spot on campus?",
        answer: "Library 3rd floor, quiet zone",
        answeredAt: timestamp
      }
    ]
  },

  universityInfo: {
    // Unchanged
    university: "iub",
    universityName: "Independent University, Bangladesh",
    studentId: "2230001"
  },

  avatarConfig: {
    // Unchanged - existing DiceBear config
    style: "notionists",
    seed: "y0chkk73swg",
    options: {...}
  },

  // ========== NEW FIELDS (ROOT LEVEL) ==========
  classSpaces: {
    // Denormalized data for quick access
    memberOf: [
      "iub_CSC101_02_MW_1120-1250_NAC902",
      "iub_MAT105_01_TR_0940-1110_NAC701"
    ],
    lastSpaceUpdate: timestamp
  },

  // Existing system fields
  systemInfo: {
    profileSetupComplete: true,
    status: "online",
    createdAt: timestamp,
    lastUpdated: timestamp,
    // ... other existing fields
  },

  socialInfo: {
    // Existing friends data
    friendsCount: 42,
    // ... other existing fields
  },

  // Existing schedule data (unchanged)
  schedule: {...}
}
```

### New Collection: Class Spaces

**Path:** `classSpaces/{spaceId}`

See [Class Spaces Structure](#2-database-structure-for-class-spaces) above.

### New Collection: Q&A Prompts

**Path:** `prompts/questions`

```javascript
{
  questions: [
    {
      id: "fav_movie",
      question: "Favorite movie of all time?",
      category: "fun",
      order: 1,
      active: true
    },
    // ... 30-50 questions
  ],
  lastUpdated: timestamp
}
```

### Firebase Storage Structure

**Path:** `profilePhotos/{userId}/{photoId}.jpg`

```
profilePhotos/
├── userId1/
│   └── profile_1635273600000.jpg  (timestamped for versioning)
├── userId2/
│   └── profile_1635274800000.jpg
└── ...
```

**Storage Rules:**

- Max file size: 2MB
- Allowed types: image/jpeg, image/png, image/webp
- Only user can upload to their own folder
- Public read access (for profile viewing)

---

## 💰 Firestore Free Tier Analysis

### Current Free Tier Limits (2025)

| Resource             | Free Tier Limit | Daily Reset |
| -------------------- | --------------- | ----------- |
| **Document Reads**   | 50,000/day      | Yes         |
| **Document Writes**  | 20,000/day      | Yes         |
| **Document Deletes** | 20,000/day      | Yes         |
| **Storage**          | 1 GB total      | No          |
| **Network Egress**   | 10 GB/month     | Monthly     |

### Feature Impact Analysis

#### Scenario: 5,000 Active Users

**Profile Enhancement:**

- One-time migration: 5,000 writes (profile updates) ✅ Within limit
- Daily profile views: ~10,000 reads (2 reads/user/day average) ✅ Well within 50K limit
- Daily profile updates: ~100 writes (2% of users update daily) ✅ Minimal impact

**Profile Photos (Firebase Storage):**

- Avg photo size: 100KB (after compression)
- 5,000 users × 50% upload rate = 2,500 photos
- Storage needed: 2,500 × 100KB = **250 MB** ✅ Well within 1GB limit
- Monthly bandwidth: 2,500 photos × 100KB × 20 views/photo = **5 GB/month** ✅ Within 10GB limit

**Class Spaces:**

Assumptions:

- 5,000 students
- Average 5 courses per student = 25,000 course enrollments
- Average section size: 30 students
- Courses with ≥3 students in same section: ~500 class spaces

**Daily Read Operations:**

```
Space List Loading:
- 5,000 users × 1 read (user's spaces list) = 5,000 reads

Space Detail Views:
- 2,000 active users/day × 3 space views/user × 1 read = 6,000 reads

Message Loading (Initial):
- 2,000 active users/day × 2 spaces/user × 50 messages = 200,000 reads ⚠️ OVER LIMIT
```

**🚨 Problem: Message reads exceed free tier!**

**Solution: Optimize Message Loading**

1. **Pagination:** Load only last 20 messages initially (not 50)
   - Reduces to: 2,000 × 2 × 20 = **80,000 reads** ⚠️ Still over
2. **Further Optimization: Load only active spaces**
   - Users only open 1-2 spaces/day (not all)
   - 2,000 users × 1.5 spaces × 20 messages = **60,000 reads** ⚠️ Still over
3. **Best Solution: Real-time Listeners + Local Caching**
   - Set up listener once per space (1 read per user per space)
   - Cache messages locally (browser storage)
   - Only new messages trigger reads
   - Estimated: 2,000 users × 2 spaces × 5 new messages = **20,000 reads** ✅ Within limit!

**Daily Write Operations:**

```
Message Sending:
- 2,000 active users/day × 3 messages/user = 6,000 writes

Space Membership Updates:
- 100 schedule changes/day × 2 space updates = 200 writes

Profile Updates:
- 100 users update profiles/day = 100 writes

TOTAL: ~6,300 writes/day ✅ Well within 20,000 limit
```

**Storage:**

```
Class Spaces Documents:
- 500 spaces × 2KB/space = 1 MB

Messages:
- 500 spaces × 200 messages × 500 bytes = 50 MB

Profile Updates:
- 5,000 users × 3KB extra/user = 15 MB

TOTAL: ~66 MB ✅ Minimal impact on 1GB limit
```

### Scaling Beyond 5,000 Users

**10,000 Users:**

- Reads: ~40,000/day ✅ Still within limit
- Writes: ~12,000/day ✅ Safe
- Storage: ~130 MB ✅ Safe

**15,000 Users:**

- Reads: ~60,000/day ⚠️ Approaching limit
- Need to implement:
  - Aggressive local caching
  - Message pagination (load on scroll)
  - Rate limiting on profile views

**20,000+ Users:**

- **Must upgrade to Blaze (Pay-as-you-go) plan**
- Estimated cost at 25,000 users:
  - Reads: ~100,000/day → 50,000 extra × $0.06/100K = **$0.30/day** = $9/month
  - Writes: ~25,000/day → 5,000 extra × $0.18/100K = **$0.90/day** = $27/month
  - **Total: ~$36/month** (very affordable)

### Recommendation

✅ **Free tier is sufficient for up to 10,000-12,000 users** with proper optimizations:

1. Implement real-time listeners with local caching
2. Paginate messages (load 20 at a time)
3. Cache profile data client-side (1 hour TTL)
4. Lazy load class spaces (only when user opens tab)

⚠️ **Beyond 15,000 users: Plan to upgrade to Blaze plan** (~$30-50/month, scales linearly)

---

## 🛡️ NSFW Content Protection

### Problem Statement

Users uploading profile pictures could upload inappropriate content (NSFW images), which violates community standards and creates a poor experience.

### Solution: Google Cloud Vision API

**Service:** [Cloud Vision API - Safe Search Detection](https://cloud.google.com/vision/docs/detecting-safe-search)

**Free Tier:** 1,000 image analyses/month (sufficient for MVP)

**How It Works:**

1. User selects image file in profile setup
2. **Before upload to Storage:** Send image to Cloud Vision API
3. API returns SafeSearch scores:
   ```javascript
   {
     adult: "VERY_UNLIKELY",      // Adult content
     spoof: "UNLIKELY",            // Fake/spoofed
     medical: "POSSIBLE",          // Medical imagery
     violence: "VERY_UNLIKELY",    // Violent content
     racy: "UNLIKELY"              // Suggestive content
   }
   ```
4. **Reject if:**
   - `adult` ≥ POSSIBLE
   - `violence` ≥ LIKELY
   - `racy` ≥ LIKELY
5. Show user-friendly error: "Image not allowed. Please choose a different photo or use an avatar."
6. **If approved:** Upload to Firebase Storage

### Implementation

**Cloud Function:** `functions/src/validateProfilePhoto.js`

```javascript
const vision = require("@google-cloud/vision");
const client = new vision.ImageAnnotatorClient();

exports.validateProfilePhoto = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const { imageBase64 } = data; // Base64 encoded image from client

  try {
    // Run SafeSearch detection
    const [result] = await client.safeSearchDetection({
      image: { content: imageBase64 },
    });

    const safeSearch = result.safeSearchAnnotation;

    // Define rejection criteria
    const isAdult = ["POSSIBLE", "LIKELY", "VERY_LIKELY"].includes(
      safeSearch.adult
    );
    const isViolent = ["LIKELY", "VERY_LIKELY"].includes(safeSearch.violence);
    const isRacy = ["LIKELY", "VERY_LIKELY"].includes(safeSearch.racy);

    if (isAdult || isViolent || isRacy) {
      return {
        approved: false,
        reason: "Image contains inappropriate content",
      };
    }

    return {
      approved: true,
      safeSearch: safeSearch, // Return scores for logging
    };
  } catch (error) {
    console.error("Vision API error:", error);
    throw new functions.https.HttpsError("internal", "Image validation failed");
  }
});
```

**Client-side Integration:**

```javascript
// In ProfileSetup.js
async handleProfilePhotoUpload(file) {
  // 1. Validate file size/type
  if (file.size > 2 * 1024 * 1024) {
    this.showError('Image too large (max 2MB)');
    return;
  }

  // 2. Convert to base64
  const base64 = await this.fileToBase64(file);

  // 3. Validate with Cloud Vision
  this.showLoading('Validating image...');
  const validateFn = httpsCallable(functions, 'validateProfilePhoto');
  const result = await validateFn({ imageBase64: base64 });

  if (!result.data.approved) {
    this.showError('Image not allowed. Please choose a different photo or use an avatar.');
    return;
  }

  // 4. Upload to Firebase Storage
  this.showLoading('Uploading...');
  const photoUrl = await this.uploadToStorage(file);

  // 5. Update profile
  this.profileData.profilePhotoUrl = photoUrl;
  this.profileData.useAvatar = false;

  this.showSuccess('Profile photo updated!');
}
```

### Fallback Strategy

If Cloud Vision API fails or quota is exceeded:

1. **Allow upload** (don't block user)
2. **Flag for manual review** (admin dashboard)
3. Log warning to Cloud Logging
4. Send alert to admin email

This prevents user frustration while maintaining safety.

### Cost Analysis

**Free Tier:** 1,000 validations/month  
**Pricing beyond:** $1.50 per 1,000 images

**Scenario:**

- 5,000 users, 50% upload photos = 2,500 uploads
- First 1,000 free
- Remaining 1,500 × $1.50/1,000 = **$2.25 one-time cost**

✅ **Very affordable** and critical for safety.

---

## 🔄 Migration Strategy

### Phase 1: Database Schema Updates (No User Impact)

**Goal:** Add new fields to existing user documents without breaking current functionality.

**Approach: Additive Migration** (safest)

```javascript
// Migration script: scripts/migrate-public-profiles.js

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function migrateUserProfiles() {
  const batch = db.batch();
  const usersSnapshot = await db.collection('users').get();

  let count = 0;

  usersSnapshot.forEach((doc) => {
    const userData = doc.data();

    // Only add NEW fields, don't modify existing ones
    const updates = {
      'profile.minor': userData.profile?.minor || null,
      'profile.profilePhotoUrl': userData.profile?.profilePhotoUrl || null,
      'profile.useAvatar': userData.profile?.useAvatar ?? true, // Default to avatar
      'profile.socialHandles': userData.profile?.socialHandles || {
        instagram: null,
        twitter: null,
        linkedin: null,
        snapchat: null,
        discord: null
      },
      'profile.interests': userData.profile?.interests || [],
      'profile.qnaResponses': userData.profile?.qnaResponses || [],
      'classSpaces': userData.classSpaces || {
        memberOf: [],
        lastSpaceUpdate: admin.firestore.FieldValue.serverTimestamp()
      }
    };

    batch.update(doc.ref, updates);
    count++;

    // Firestore batch limit is 500
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Migrated ${count} users...`);
    }
  });

  await batch.commit();
  console.log(`✅ Migration complete! Total users: ${count}`);
}

migrateUserProfiles().catch(console.error);
```

**Execution:**

```bash
# Run migration script
node scripts/migrate-public-profiles.js

# Verify migration
firebase firestore:query users --limit 5
```

**Safety Checks:**

- ✅ No existing data is modified
- ✅ Only adds null/empty values for new fields
- ✅ Existing users won't see changes until they update profile
- ✅ Can roll back by removing new fields (no data loss)

### Phase 2: Create Q&A Prompts Collection

**Goal:** Seed question bank for Q&A feature.

```javascript
// scripts/seed-qa-prompts.js

const prompts = {
  questions: [
    {
      id: "fav_movie",
      question: "Favorite movie of all time?",
      category: "fun",
      order: 1,
      active: true,
    },
    {
      id: "superpower",
      question: "If you could have any superpower?",
      category: "fun",
      order: 2,
      active: true,
    },
    {
      id: "study_spot",
      question: "Your go-to study spot on campus?",
      category: "campus",
      order: 3,
      active: true,
    },
    {
      id: "weekend_activity",
      question: "Perfect weekend activity?",
      category: "fun",
      order: 4,
      active: true,
    },
    {
      id: "career_goal",
      question: "Dream job after graduation?",
      category: "serious",
      order: 5,
      active: true,
    },
    {
      id: "hidden_talent",
      question: "Hidden talent nobody knows about?",
      category: "fun",
      order: 6,
      active: true,
    },
    {
      id: "time_travel",
      question: "Past or future - where would you go?",
      category: "fun",
      order: 7,
      active: true,
    },
    {
      id: "study_music",
      question: "Study playlist vibe?",
      category: "campus",
      order: 8,
      active: true,
    },
    {
      id: "campus_food",
      question: "Best food spot near campus?",
      category: "campus",
      order: 9,
      active: true,
    },
    {
      id: "advice_freshman",
      question: "One advice for freshmen?",
      category: "serious",
      order: 10,
      active: true,
    },
    // Add 20-40 more...
  ],
  lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
};

await db.collection("prompts").doc("questions").set(prompts);
console.log("✅ Q&A prompts seeded!");
```

### Phase 3: Update Profile Setup UI

**Goal:** Replace Step 2 with new profile customization.

**Changes to `public/templates/profile.html`:**

```html
<!-- Step 1: Avatar & Bio → BECOMES Step 1: Public Profile -->
<div class="setup-step" data-step="1">
  <div class="step-header">
    <h2 class="step-title">Public Profile</h2>
    <p class="step-description">
      Customize your profile to help classmates connect with you.
    </p>
  </div>

  <!-- Profile Photo / Avatar Section -->
  <div class="profile-image-section">
    <h3 class="section-subtitle">Profile Picture</h3>

    <!-- Choice Toggle -->
    <div class="image-choice-toggle">
      <button type="button" class="choice-btn active" data-choice="avatar">
        <i class="fas fa-palette"></i> Use Avatar
      </button>
      <button type="button" class="choice-btn" data-choice="photo">
        <i class="fas fa-camera"></i> Upload Photo
      </button>
    </div>

    <!-- Avatar Section (Shown by default) -->
    <div class="avatar-section" id="avatar-section" style="display: block;">
      <div class="avatar-preview-display" id="avatar-preview-display">🎨</div>
      <button type="button" id="avatar-edit-btn" class="button secondary">
        <i class="fas fa-palette"></i> Customize Avatar
      </button>
      <p class="form-hint">Safe, customizable avatars</p>
    </div>

    <!-- Photo Upload Section (Hidden by default) -->
    <div class="photo-upload-section" id="photo-section" style="display: none;">
      <div class="photo-preview-container">
        <div class="photo-preview-circle" id="photo-preview">
          <i class="fas fa-user photo-placeholder"></i>
        </div>
      </div>
      <input
        type="file"
        id="photo-input"
        accept="image/*"
        style="display: none;"
      />
      <button type="button" id="photo-upload-btn" class="button secondary">
        <i class="fas fa-upload"></i> Choose Photo
      </button>
      <p class="form-hint">Max 2MB • JPG, PNG, WebP • Square crop applied</p>
      <div class="nsfw-notice" style="display: none;">
        <i class="fas fa-shield-alt"></i>
        <span>Photos are automatically checked for inappropriate content</span>
      </div>
    </div>
  </div>

  <!-- Bio Section (Enhanced) -->
  <div class="form-group">
    <label class="form-label" for="setup-bio">
      Bio
      <span class="optional-note"
        >(Optional - appears at top of your profile)</span
      >
    </label>
    <textarea
      id="setup-bio"
      name="setup-bio"
      class="form-textarea"
      placeholder="Tell people a bit about yourself..."
      rows="3"
      maxlength="250"
    ></textarea>
    <div class="char-counter"><span id="bio-count">0</span> / 250</div>
  </div>

  <!-- NEW: Minor Field -->
  <div class="form-group">
    <label class="form-label" for="setup-minor">
      Minor <span class="optional-note">(Optional)</span>
    </label>
    <input
      type="text"
      id="setup-minor"
      class="form-input"
      placeholder="e.g., Mathematics"
    />
  </div>

  <!-- NEW: Interests -->
  <div class="interests-section">
    <h3 class="section-subtitle">
      Interests & Hobbies <span class="optional-note">(Max 10)</span>
    </h3>
    <div class="interest-chips-container" id="selected-interests">
      <!-- Dynamically added chips -->
    </div>
    <div class="interest-picker">
      <input
        type="text"
        id="interest-input"
        placeholder="Type to add or search interests..."
        maxlength="20"
      />
      <div class="suggested-interests" id="suggested-interests">
        <!-- Predefined interest buttons -->
      </div>
    </div>
  </div>

  <!-- NEW: Q&A Prompts -->
  <div class="qna-section">
    <h3 class="section-subtitle">
      Profile Questions <span class="optional-note">(Answer up to 5)</span>
    </h3>
    <p class="section-description">
      Choose questions to answer and showcase your personality!
    </p>
    <div class="qna-list" id="qna-list">
      <!-- Dynamically loaded from Firestore prompts/questions -->
    </div>
  </div>
</div>
```

**JavaScript Updates in `ProfileSetup.js`:**

Add handlers for:

- Photo/Avatar toggle
- Photo upload with NSFW validation
- Interest chip management
- Q&A question selection/answering
- Social handle validation
- Save all data to new profile fields

### Phase 4: Class Spaces Implementation

**Step 1: Cloud Function for Space Creation**

```javascript
// functions/src/classSpaces.js

exports.updateClassSpaces = functions.firestore
  .document("users/{userId}/schedule")
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const newSchedule = change.after.exists ? change.after.data() : null;
    const oldSchedule = change.before.exists ? change.before.data() : null;

    // Extract courses from schedule
    const newCourses = extractCourses(newSchedule);
    const oldCourses = extractCourses(oldSchedule);

    // Find added and removed courses
    const added = newCourses.filter((c) => !oldCourses.includes(c));
    const removed = oldCourses.filter((c) => !newCourses.includes(c));

    // Update class spaces
    for (const course of added) {
      await addUserToSpace(userId, course);
    }

    for (const course of removed) {
      await removeUserFromSpace(userId, course);
    }
  });

async function addUserToSpace(userId, course) {
  const spaceId = generateSpaceId(course); // Format: iub_CSC101_02_MW_1120-1250_NAC902
  const spaceRef = db.collection("classSpaces").doc(spaceId);

  await db.runTransaction(async (transaction) => {
    const spaceDoc = await transaction.get(spaceRef);

    if (!spaceDoc.exists) {
      // Create new space
      transaction.set(spaceRef, {
        ...course,
        memberIds: [userId],
        memberCount: 1,
        active: false, // Not active until 3 members
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Add user to existing space
      const members = spaceDoc.data().memberIds;
      if (!members.includes(userId)) {
        members.push(userId);
        const active = members.length >= 3;

        transaction.update(spaceRef, {
          memberIds: members,
          memberCount: members.length,
          active: active,
          lastMemberUpdate: admin.firestore.FieldValue.serverTimestamp(),
        });

        // If space just became active (3rd member), send notifications
        if (active && members.length === 3) {
          await sendSpaceCreatedNotifications(spaceId, members);
        }
      }
    }
  });
}
```

**Step 2: Frontend UI Components**

Create new components:

- `src/js/components/classSpaces/ClassSpaceCard.js` - Card for space list
- `src/js/components/classSpaces/ClassSpaceChat.js` - Chat interface
- `src/js/components/classSpaces/ClassSpaceMembers.js` - Member roster
- `src/js/pages/ClassSpacePage.js` - Full space detail view

**Step 3: Firestore Security Rules**

```javascript
// firestore.rules - Add class spaces rules

match /classSpaces/{spaceId} {
  // Read: Only members of the space
  allow read: if request.auth != null &&
    request.auth.uid in resource.data.memberIds;

  // Write: Only Cloud Functions (server-side)
  allow write: if false;

  // Messages subcollection
  match /messages/{messageId} {
    // Read: Space members only
    allow read: if request.auth != null &&
      request.auth.uid in get(/databases/$(database)/documents/classSpaces/$(spaceId)).data.memberIds;

    // Create: Space members only, must set correct senderId
    allow create: if request.auth != null &&
      request.auth.uid in get(/databases/$(database)/documents/classSpaces/$(spaceId)).data.memberIds &&
      request.resource.data.senderId == request.auth.uid;

    // Update/Delete: Only message sender
    allow update, delete: if request.auth != null &&
      request.auth.uid == resource.data.senderId;
  }
}
```

### Phase 5: Public Profile Viewing

**Create Profile View Component:**

```javascript
// src/js/components/profile/PublicProfileView.js

export class PublicProfileView {
  constructor(userId) {
    this.userId = userId;
    this.profileData = null;
  }

  async render(container) {
    // Fetch user profile
    this.profileData = await this.fetchProfile();

    // Build profile UI
    container.innerHTML = `
      <div class="public-profile">
        <!-- Header with photo/avatar -->
        <div class="profile-header">
          <div class="profile-photo">
            ${this.renderProfileImage()}
          </div>
          <div class="profile-info">
            <h1 class="profile-name">${this.profileData.firstName} ${
      this.profileData.lastName
    }</h1>
            <p class="profile-handle">@${this.profileData.handle}</p>
            <div class="profile-meta">
              <span class="meta-item">${this.profileData.major}</span>
              ${
                this.profileData.minor
                  ? `<span class="meta-item">${this.profileData.minor}</span>`
                  : ""
              }
              <span class="meta-item">Class of ${
                this.profileData.startingYear
              }</span>
            </div>
          </div>
          ${this.renderFriendButton()}
        </div>
        
        <!-- Bio Section -->
        ${
          this.profileData.bio
            ? `
          <div class="profile-bio">
            <p>${this.profileData.bio}</p>
          </div>
        `
            : ""
        }
        
        <!-- Common Classes (if any) -->
        ${this.renderCommonClasses()}
        
        <!-- Interests -->
        ${this.renderInterests()}
        
        <!-- Q&A Responses -->
        ${this.renderQnAResponses()}
        
        <!-- Mutual Friends & Connection Info (Only when viewing another user) -->
        ${this.userId !== currentUser.uid ? this.renderConnectionInfo() : ""}
      </div>
    `;
  }

  renderConnectionInfo() {
    const friendsCount = this.profileData.socialInfo?.friendsCount || 0;
    const mutualFriends = this.getMutualFriendsData(); // Returns array of mutual friend objects

    return `
      <div class="connection-info-section">
        <div class="friends-stats">
          <span class="stat"><i class="fas fa-users"></i> ${friendsCount} friends</span>
          ${
            mutualFriends.length > 0
              ? `
            <span class="stat mutual"><i class="fas fa-user-friends"></i> ${
              mutualFriends.length
            } mutual friend${mutualFriends.length > 1 ? "s" : ""}</span>
          `
              : ""
          }
        </div>
        
        ${
          mutualFriends.length > 0
            ? `
          <div class="mutual-friends-preview">
            <h4>Mutual Friends</h4>
            <div class="mutual-friends-list">
              ${mutualFriends
                .slice(0, 3)
                .map(
                  (friend) => `
                <div class="mutual-friend-item" data-user-id="${friend.userId}">
                  <img src="${getAvatarUrl(friend.avatarConfig)}" alt="${
                    friend.handle
                  }" class="friend-avatar" />
                  <span class="friend-handle">@${friend.handle}</span>
                </div>
              `
                )
                .join("")}
              ${
                mutualFriends.length > 3
                  ? `
                <button class="show-more-mutual">and ${
                  mutualFriends.length - 3
                } more</button>
              `
                  : ""
              }
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  renderProfileImage() {
    if (this.profileData.useAvatar) {
      return `<img src="${getAvatarUrl(
        this.profileData.avatarConfig
      )}" alt="Avatar" />`;
    } else {
      return `<img src="${this.profileData.profilePhotoUrl}" alt="Profile Photo" />`;
    }
  }

  renderCommonClasses() {
    const commonClasses = this.findCommonClasses();
    if (commonClasses.length === 0) return "";

    return `
      <div class="common-classes-section">
        <h3>Classes Together <i class="fas fa-book"></i></h3>
        <div class="class-chips">
          ${commonClasses
            .map(
              (c) => `
            <span class="chip class-chip">${c.courseCode}</span>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // ... other render methods
}
```

**Integration Points:**

- Friend cards: Add profile icon that opens `PublicProfileView`
- Friend search results: Each result has profile preview
- Class space members: Tap member → View profile
- Notification feed: Profile links in friend request notifications

---

## 🎨 UI/UX Specifications

### Profile Setup (Step 2 Redesign)

**Layout:**

- Vertical scroll layout (mobile-first)
- Sections clearly separated with headings
- Progressive disclosure (optional fields collapsible)

**Visual Hierarchy:**

1. **Profile Image** (top, most prominent)

   - Large circular preview (150px)
   - Toggle buttons for Avatar/Photo
   - Upload button with icon

2. **Bio** (second, below image)

   - Larger textarea (3 rows min)
   - Character counter visible
   - Placeholder text engaging

3. **Basic Info Enhancement**

   - Minor field with autocomplete suggestions
   - Inline help text

4. **Social Handles** (collapsible section)

   - Icon-driven inputs
   - Validation on blur
   - "Connect with me on..." heading

5. **Interests** (interactive chips)

   - Colorful chips (gradient backgrounds)
   - Add/remove with smooth animations
   - Suggested interests grid
   - Search/filter capability

6. **Q&A Prompts** (most engaging)
   - Card-based question layout
   - Expand to answer
   - Character limit per answer (200 chars)
   - Save as you type (debounced)

**Colors & Styling:**

- Interest chips: Use color palette (blues, greens, purples)
- Q&A cards: Subtle shadow, hover effect
- Validation: Green checkmarks, red errors
- Buttons: Primary (Save), Secondary (Skip for now)

### Class Spaces UI

**Space List (Home Page):**

- Google Classroom-inspired cards
- Each card shows:
  - Course badge (colored by department)
  - Course code + section (bold)
  - Classroom + time (gray text)
  - Member avatars (stacked, max 5 shown + count)
  - Last message preview (truncated)
  - Unread badge (red circle with count)

**Space Detail View:**

- **Header:**
  - Course name + section
  - Member count
  - Close/back button
- **Tab Switcher:**

  - Tab 1: Chat (speech bubble icon)
  - Tab 2: Members (people icon)
  - Smooth slide transition

- **Chat Tab:**

  - Message bubbles (sender on right, others on left)
  - Avatar + name + timestamp
  - Auto-scroll to bottom
  - Input bar sticky at bottom
  - "Send" button or Enter to send

- **Members Tab:**
  - Grid/list of member cards
  - Each card: Avatar, name, major
  - Profile icon button (opens PublicProfileView)
  - "Send Friend Request" if not friends

**Public Profile View:**

- **Modal/Overlay** (slides up from bottom on mobile)
- Sections:
  1. Header (photo/avatar + name + handle + friend button)
  2. Bio (if present, highlighted box)
  3. Common Classes (if viewing another user, show shared courses with clickable chips)
  4. Interests (chip grid)
  5. Q&A Responses (accordion-style cards)
  6. Connection Info (friends count, mutual friends preview with avatars - only when viewing another user)

**Accessibility:**

- ARIA labels on all interactive elements
- Keyboard navigation (Tab, Enter, Esc)
- Focus indicators
- Screen reader announcements

---

## 🔐 Security & Privacy

### Profile Privacy Settings

**Visibility Options:**

```javascript
profile.privacy: {
  visibility: "university",     // "university" | "friends" | "public"
  showBio: true,
  showInterests: true,
  showQnA: true,
  showFriendsCount: true,       // Show friends count and mutual friends
  showMinor: true
}
```

**Default:** University (only students at same university can view full profile)

**Enforcement in Firestore Rules:**

```javascript
match /users/{userId} {
  function canViewProfile(viewerId, profileUserId) {
    let profile = get(/databases/$(database)/documents/users/$(profileUserId));
    let viewer = get(/databases/$(database)/documents/users/$(viewerId));

    // Always allow self
    if (viewerId == profileUserId) return true;

    let visibility = profile.data.profile.privacy.visibility;

    // Public: anyone
    if (visibility == 'public') return true;

    // Friends: must be friends
    if (visibility == 'friends') {
      let friendshipId1 = viewerId + '_' + profileUserId;
      let friendshipId2 = profileUserId + '_' + viewerId;
      return exists(/databases/$(database)/documents/friendships/$(friendshipId1)) ||
             exists(/databases/$(database)/documents/friendships/$(friendshipId2));
    }

    // University: same university
    if (visibility == 'university') {
      return viewer.data.universityInfo.university == profile.data.universityInfo.university;
    }

    return false;
  }

  allow read: if request.auth != null && canViewProfile(request.auth.uid, userId);
}
```

### Class Space Privacy

**Rules:**

- Only members can view/send messages
- Spaces auto-deactivate if <3 members (no new messages allowed)
- Members can't invite others (membership auto-managed by schedule)
- Can't create manual spaces (all automatic)

### Data Protection

**Profile Photos:**

- Stored in user-specific folders (no cross-access)
- Auto-deleted when user deletes account
- NSFW validation before storage

**Message Data:**

- No message forwarding (keep within space)
- Message edit history tracked (prevent abuse)
- Spam/abuse reporting (manual review)

---

## 📅 Timeline & Milestones

### Phase 1: Foundation (Week 1-2)

- [ ] Database migration script
- [ ] Run migration on dev/staging Firestore
- [ ] Create Q&A prompts collection
- [ ] Update Firestore security rules
- [ ] Set up Cloud Vision API project

**Deliverable:** Updated database schema, no user-facing changes yet

### Phase 2: Profile Enhancement UI (Week 3-4)

- [ ] Update `public/templates/profile.html` (Step 2 redesign)
- [ ] Implement photo upload with NSFW validation
- [ ] Build interest chip selector
- [ ] Build Q&A prompt selector
- [ ] Update `ProfileSetup.js` save logic
- [ ] Write unit tests for new components

**Deliverable:** New profile setup flow (Step 2 complete)

### Phase 3: Public Profile Viewing (Week 5)

- [ ] Create `PublicProfileView.js` component
- [ ] Add profile icon to friend cards
- [ ] Add profile preview in friend search
- [ ] Implement profile modal/page
- [ ] Add "Common Classes" section logic (compare schedules, show shared courses)
- [ ] Add "Mutual Friends" calculation and display (show up to 3 avatars + count)
- [ ] Style profile view (responsive)

**Deliverable:** Clickable profiles across app with common classes and mutual friends

### Phase 4: Class Spaces Backend (Week 6-7)

- [ ] Write Cloud Function for space creation/updates
- [ ] Write Cloud Function for member management
- [ ] Create `classSpaces` collection indexes
- [ ] Set up real-time listeners for messages
- [ ] Implement message pagination
- [ ] Add security rules for spaces/messages

**Deliverable:** Backend logic for auto-spaces (no UI yet)

### Phase 5: Class Spaces Frontend (Week 8-9)

- [ ] Create `ClassSpaceCard.js` component
- [ ] Create `ClassSpaceChat.js` component
- [ ] Create `ClassSpaceMembers.js` component
- [ ] Add "Class Spaces" section to Home Page
- [ ] Implement chat UI with real-time updates
- [ ] Add member roster with profile links
- [ ] Implement notifications for new spaces/messages

**Deliverable:** Full class spaces feature live

### Phase 6: Testing & Polish (Week 10)

- [ ] End-to-end testing (profile setup → class spaces)
- [ ] Performance optimization (caching, pagination)
- [ ] Load testing (simulate 5,000 users)
- [ ] Bug fixes and edge cases
- [ ] UI polish (animations, loading states)
- [ ] Write user documentation

**Deliverable:** Production-ready features

### Phase 7: Deployment (Week 11)

- [ ] Deploy Cloud Functions
- [ ] Deploy Firestore rules
- [ ] Run production database migration
- [ ] Deploy frontend updates
- [ ] Monitor error logs
- [ ] Collect user feedback

**Deliverable:** Live in production! 🚀

---

## 🚧 Open Questions & Decisions Needed

1. **Q&A Question Bank Size:**

   - Start with 20 questions or 50?
   - Allow user-submitted questions (moderated)?

2. **Class Space Archiving:**

   - Archive at semester end automatically?
   - Let users manually leave spaces?

3. **Profile Photo Storage:**

   - Use Firebase Storage or external CDN (Cloudinary)?
   - Allow users to delete old photos or auto-delete on upload?

4. **Message Notifications:**

   - Push notification for every message or batch/digest?
   - Allow users to mute specific spaces?

5. **Search/Discovery:**

   - Add "Find Classmates" search by interests?
   - Show "Suggested Friends" based on common classes and mutual friends?

6. **Analytics:**
   - Track which interests are most popular?
   - Track class space engagement metrics?

---

## 🎯 Success Metrics

**Profile Enhancement:**

- % of users who upload profile photos vs. use avatars
- % of users who add ≥3 interests
- % of users who answer ≥1 Q&A prompt
- Profile completion rate (all optional fields filled)

**Class Spaces:**

- # of active class spaces created
- Average messages per space per week
- % of users who send ≥1 message
- Friend requests sent from class space profiles

**Technical:**

- Firestore read/write usage (stay within free tier)
- NSFW rejection rate (should be <5%)
- Cloud Vision API quota usage
- Average profile load time (<1s)

---

## 🔗 References & Resources

**Firebase Documentation:**

- [Firestore Data Structure](https://firebase.google.com/docs/firestore/manage-data/structure-data)
- [Cloud Vision Safe Search](https://cloud.google.com/vision/docs/detecting-safe-search)
- [Firebase Storage Security](https://firebase.google.com/docs/storage/security)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

**Design Inspiration:**

- Google Classroom (class spaces cards)
- Instagram (profile layout)
- Discord (chat interface)
- LinkedIn (professional profile structure)

**Libraries/Tools:**

- DiceBear (existing avatar system)
- Cloud Vision API (NSFW detection)
- Firestore SDK (database)
- Firebase Storage (photo hosting)

---

## ✅ Conclusion

This PRD outlines a comprehensive plan to transform CampXus into a rich social platform with:

- **Enhanced profiles** that help students connect meaningfully
- **Automatic class spaces** that foster academic collaboration
- **NSFW protection** ensuring a safe community
- **Free tier optimization** keeping costs near zero
- **Smooth migration** preserving existing user data

**Next Steps:**

1. Review this PRD with team
2. Approve timeline and milestones
3. Set up development environment (Cloud Vision API, staging Firestore)
4. Begin Phase 1: Database migration

**Questions?** Reach out to the dev team or open a GitHub discussion!

---

**Document Version:** 1.0  
**Last Updated:** October 26, 2025  
**Author:** CampXus Development Team
