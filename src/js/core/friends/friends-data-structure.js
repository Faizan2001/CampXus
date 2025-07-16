/**
 * 🎯 CampXus Friends Database Structure & Utilities
 * 
 * This file defines the optimal database structure for the friends functionality
 * that integrates perfectly with your existing organized database architecture.
 */

// 🎯 **Updated User Document Structure (with Social Info)**
export const USER_DOCUMENT_STRUCTURE = {
  // 🔑 Core Identity (unchanged)
  uid: "abc123",

  // 👤 Personal Profile (unchanged)
  profile: {
    firstName: "John",
    lastName: "Doe", 
    bio: "Love coding and building awesome apps!",
    major: "CSE",
    startingYear: "2022",
    email: "student@iub.edu.bd",
    displayName: "John Doe"
  },

  // 🏫 University info (unchanged)
  universityInfo: {
    university: "iub",
    universityName: "Independent University, Bangladesh", 
    studentId: "2230001"
  },

  // 🎨 Avatar config (unchanged)
  avatarConfig: {
    style: "miniavs",
    seed: "abc123",
    options: { mood: "happy", backgroundColor: "b6e3f4" }
  },

  // ⚙️ System info (unchanged)
  systemInfo: {
    profileSetupComplete: true,
    status: "online",
    lastActive: "timestamp",
    createdAt: "timestamp", 
    lastUpdated: "timestamp"
  },

  // 🆕 **NEW: Social Info (friends-related metadata)**
  socialInfo: {
    friendsCount: 0,                    // Total number of friends
    pendingRequestsCount: 0,            // Incoming pending requests
    privacy: "university",              // "university" | "public" (future: "friends")
    searchable: true,                   // Can others find this user in search?
    lastFriendActivity: "timestamp"     // When last friend action happened
  }
};

// 📩 **Friend Request Document Structure**
export const FRIEND_REQUEST_STRUCTURE = {
  // 🔑 Core request data
  fromUserId: "user123",
  toUserId: "user456", 
  status: "pending",                    // "pending" | "accepted" | "rejected"
  createdAt: "timestamp",
  respondedAt: "timestamp",             // When accepted/rejected (null if pending)

  // 👤 Cached user info for quick display (prevents extra user queries)
  fromUserInfo: {
    displayName: "John Doe",
    major: "Computer Science",
    university: "iub",
    avatar: {
      style: "miniavs",
      seed: "abc123"
    }
  },

  toUserInfo: {
    displayName: "Jane Smith", 
    major: "Business Administration",
    university: "iub"
  },

  // 📊 Metadata
  requestType: "direct",                // "direct" | "suggestion" (future feature)
  message: ""                           // Optional message (future feature)
};

// 🤝 **Friendship Document Structure**
export const FRIENDSHIP_STRUCTURE = {
  // 🔑 Core friendship data
  users: ["user123", "user456"],       // Array for easy "array-contains" queries
  user1Id: "user123",                   // For compatibility with existing queries
  user2Id: "user456", 
  createdAt: "timestamp",
  mutualFriends: 0,                     // Count of mutual friends
  lastInteraction: "timestamp",         // For future features (last message, etc.)

  // 👥 Cached user info for quick friend list display
  user1Info: {
    displayName: "John Doe",
    major: "CSE",
    avatar: {
      style: "miniavs", 
      seed: "abc123"
    }
  },

  user2Info: {
    displayName: "Jane Smith",
    major: "BBA", 
    avatar: {
      style: "adventurer",
      seed: "xyz789"
    }
  }
};

// 🎯 **Optimized Query Patterns for CampXus**

export const FRIENDS_QUERY_PATTERNS = {
  
  // 🔍 **Search for classmates (your main use case)**
  searchClassmates: {
    collection: "users",
    filters: [
      ["universityInfo.university", "==", "userUniversity"],
      ["socialInfo.searchable", "==", true],
      ["systemInfo.profileSetupComplete", "==", true]
    ],
    orderBy: ["profile.firstName"],
    limit: 20
  },

  // 📩 **Get pending friend requests** 
  pendingRequests: {
    collection: "friendRequests",
    filters: [
      ["toUserId", "==", "currentUserId"],
      ["status", "==", "pending"]
    ],
    orderBy: [["createdAt", "desc"]]
  },

  // 👥 **Get user's friends list**
  friendsList: {
    collection: "friendships", 
    filters: [
      ["users", "array-contains", "currentUserId"],
      ["isActive", "==", true]
    ],
    orderBy: [["createdAt", "desc"]]
  },

  // 🔍 **Search friends by name/major**
  searchFriends: {
    collection: "friendships",
    filters: [
      ["users", "array-contains", "currentUserId"]
    ],
    // Client-side filtering by name/major after fetch
  },

  // 🏫 **University-wide friend suggestions**
  friendSuggestions: {
    collection: "users",
    filters: [
      ["universityInfo.university", "==", "userUniversity"],
      ["profile.major", "==", "userMajor"],
      ["socialInfo.searchable", "==", true]
    ],
    // Exclude current user and existing friends/requests client-side
  }
};

// 🛡️ **Security Rules Suggestions**
export const SECURITY_RULES_TEMPLATE = `
// Users collection (updated to include socialInfo)
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
  allow read: if request.auth != null && 
              resource.data.systemInfo.profileSetupComplete == true &&
              resource.data.socialInfo.searchable == true;
}

// Friend requests
match /friendRequests/{requestId} {
  allow read, write: if request.auth != null && 
                     (request.auth.uid == resource.data.fromUserId ||
                      request.auth.uid == resource.data.toUserId);
  allow create: if request.auth != null && 
                request.auth.uid == request.resource.data.fromUserId;
}

// Friendships  
match /friendships/{friendshipId} {
  allow read, write: if request.auth != null &&
                     request.auth.uid in resource.data.users;
  allow create: if request.auth != null &&
                request.auth.uid in request.resource.data.users;
}
`;

// 🎯 **Implementation Helpers**

/**
 * Initialize social info for existing users
 */
export const initializeSocialInfo = () => ({
  friendsCount: 0,
  pendingRequestsCount: 0, 
  privacy: "university",
  searchable: true,
  lastFriendActivity: null
});

/**
 * Create friend request data structure
 */
export const createFriendRequestData = (fromUser, toUser) => ({
  fromUserId: fromUser.uid,
  toUserId: toUser.uid,
  status: "pending",
  createdAt: new Date(),
  respondedAt: null,
  
  fromUserInfo: {
    displayName: fromUser.profile.displayName,
    major: fromUser.profile.major,
    university: fromUser.universityInfo.university,
    avatar: fromUser.avatarConfig
  },
  
  toUserInfo: {
    displayName: toUser.profile.displayName, 
    major: toUser.profile.major,
    university: toUser.universityInfo.university
  },
  
  requestType: "direct",
  message: ""
});

/**
 * Create friendship data structure
 */
export const createFriendshipData = (user1, user2) => ({
  users: [user1.uid, user2.uid],
  user1Id: user1.uid,
  user2Id: user2.uid,
  createdAt: new Date(),
  mutualFriends: 0,
  lastInteraction: new Date(),
  
  user1Info: {
    displayName: user1.profile.displayName,
    major: user1.profile.major,
    avatar: user1.avatarConfig
  },
  
  user2Info: {
    displayName: user2.profile.displayName,
    major: user2.profile.major, 
    avatar: user2.avatarConfig
  }
});

// 📚 **Best Practices Summary**

export const FRIENDS_BEST_PRACTICES = {
  
  // ✅ **DO THIS:**
  dos: [
    "Cache user info in friendship documents for quick display",
    "Use 'users' array field for efficient friendship queries", 
    "Keep socialInfo metadata in user documents",
    "Implement university-focused privacy by default",
    "Use batch writes when accepting friend requests",
    "Update counters (friendsCount) when friendships change"
  ],

  // ❌ **DON'T DO THIS:**
  donts: [
    "Don't query user documents for every friend list display",
    "Don't create separate collections per university", 
    "Don't store friendship data in user documents (nested arrays)",
    "Don't allow cross-university friend requests by default",
    "Don't skip validation of user university matching"
  ],

  // 🔍 **Query Optimization:**
  queryTips: [
    "Use 'array-contains' for friendship queries (very efficient)",
    "Cache friend list data in local storage for offline viewing",
    "Implement pagination for large friend lists", 
    "Use composite indexes for university + major searches",
    "Consider client-side filtering for name searches within results"
  ]
};

console.log("🎯 CampXus Friends Database Structure loaded! Ready for implementation!");
