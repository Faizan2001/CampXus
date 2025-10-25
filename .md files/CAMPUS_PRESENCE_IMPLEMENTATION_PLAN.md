# Campus Presence Feature - Implementation Plan

## 🎯 **Feature Overview**

**Goal**: Add "last seen on campus" indicators to starred friends in HorizontalFriendsBar with bilateral location sharing consent.

**Core Behavior**: 
- Users see green/red/grey dots with timestamps (1m, 2m, 5m, etc.) next to starred friends' avatars
- Location sharing requires bilateral consent (both users must enable it with each other)
- Shows activity up to 12 hours, then switches to grey dot with no text
- Only tracks location when website is open (no background tracking)

---

## 🗄️ **Database Schema Changes**

### **Extend User Documents** (`users/` collection)

```javascript
// Add to existing systemInfo section
systemInfo: {
  // ... existing fields (lastActive, status, etc.)
  
  // NEW: Location tracking fields
  locationSharingEnabled: false,           // Global toggle for location features
  lastKnownLocation: {
    campusStatus: "unknown",               // "on_campus" | "off_campus" | "unknown"
    detectedAt: timestamp,                 // When this location was detected
    coordinates: {                         // Optional: for future features
      lat: number,
      lng: number
    }
  }
}

// Add to existing socialInfo section  
socialInfo: {
  // ... existing fields (friendsCount, privacy, etc.)
  
  // NEW: Location privacy defaults
  locationPrivacyLevel: "friends_only",    // "friends_only" | "nobody" (no "everyone" option)
  defaultLocationSharing: false           // Default setting for new friendships
}
```

### **Extend Friendship Documents** (`friendships/` collection)

```javascript
// Add to existing friendship structure
{
  // ... existing fields (users, user1Id, user2Id, etc.)
  
  // Extend existing scheduleVisibility pattern
  scheduleVisibility: {
    "user1-uid": true,
    "user2-uid": false  
  },
  
  // NEW: Bilateral location sharing consent
  locationVisibility: {
    "user1-uid": false,                    // User1 shares location with User2 (default: false)
    "user2-uid": false                     // User2 shares location with User1 (default: false)
  },
  
  // NEW: Location sharing metadata
  locationSharingMetadata: {
    lastLocationUpdate: timestamp,         // When either user last updated location settings
    locationUpdatedBy: "user-uid",         // Who made the last location privacy change
    mutualSharingEnabled: false            // Computed: true only if both users enable sharing
  }
}
```

### **New Notifications Collection** (`notifications/` collection)

```javascript
// New collection for notification system
{
  id: "notification-id",
  userId: "recipient-uid",                 // Who receives this notification
  type: "location_share_request",          // Notification type
  fromUserId: "sender-uid",               // Who initiated the request
  fromUserInfo: {                         // Cached sender info
    displayName: "John Doe",
    avatarConfig: { /* DiceBear config */ },
    major: "Computer Science"
  },
  
  // Location-specific notification data
  locationRequest: {
    friendshipId: "friendship-doc-id",     // Reference to friendship document
    currentStatus: "pending_both",         // "pending_both" | "pending_you" | "active" 
    requestedAt: timestamp
  },
  
  status: "pending",                       // "pending" | "accepted" | "dismissed"
  createdAt: timestamp,
  expiresAt: timestamp,                    // Auto-dismiss after 7 days
  actionButtons: ["accept", "dismiss"]     // UI buttons to show
}
```

---

## 🏗️ **File Structure & Implementation**

### **New Files to Create**

```
src/js/services/location/
├── CampusLocationService.js          # Main location detection service
├── LocationPrivacyService.js         # Bilateral location sharing logic
└── UniversityCampusConfig.js         # Campus boundary definitions

src/js/components/presence/
├── PresenceDot.js                    # Reusable presence indicator component
└── LocationSharingToggle.js          # UI component for location settings

src/js/pages/
└── NotificationsPage.js              # New page for all notifications

src/js/services/notifications/
└── NotificationService.js            # Enhanced notification system

public/templates/
└── notifications.html                # Template for notifications page

src/css/
├── presence.css                      # Styles for presence dots
└── notifications.css                 # Styles for notifications page
```

### **Existing Files to Modify**

```
src/js/services/data/DataService.js
├── Add location-related database methods
├── Extend updateUserLastActive with location context
└── Add notification CRUD operations

src/js/services/friends/FriendsService.js  
├── Add bilateral location sharing methods
├── Integrate location data in getFriendsList()
└── Add location sharing request methods

src/js/services/friends/FriendshipPrivacyService.js
├── Extend bilateral privacy system for location
└── Add location visibility checks

src/js/components/friends/HorizontalFriendsBar.js
├── Add presence dots to friend avatars
├── Integrate location permission requests
└── Handle location sharing UI

src/js/pages/FriendsPage.js
├── Add global location sharing toggle
├── Integrate notifications page navigation
└── Add location sharing options to friendsOptionsMenu

src/js/components/friends/FriendOptionsMenu.js
└── Add location sharing toggle option (like hide/show schedule)

src/js/router/Router.js
└── Add route for notifications page

src/js/app.js
└── Import and initialize new services

src/css/styles.css
└── Import new CSS files
```

---

## 🔧 **Detailed Implementation Steps**

### **Phase 1: Core Location Infrastructure**

#### **1.1 Campus Detection Service**
```javascript
// src/js/services/location/CampusLocationService.js
export class CampusLocationService {
  constructor() {
    this.currentLocation = null;
    this.campusConfig = UniversityCampusConfig;
    this.locationPermissionGranted = false;
  }

  // Request location permission (called when user enables location sharing)
  async requestLocationPermission() {
    if (!navigator.geolocation) {
      throw new Error("Geolocation not supported");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.locationPermissionGranted = true;
          resolve(position);
        },
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // Detect if user is on campus (polygon-based)
  async detectCampusPresence(university = "iub") {
    if (!this.locationPermissionGranted) {
      return "unknown";
    }

    try {
      const position = await this.getCurrentLocation();
      const isOnCampus = this.isLocationOnCampus(position, university);
      return isOnCampus ? "on_campus" : "off_campus";
    } catch (error) {
      console.error("Campus detection failed:", error);
      return "unknown";
    }
  }

  // Check if coordinates are within campus polygon
  isLocationOnCampus(position, university) {
    const config = this.campusConfig.getCampusConfig(university);
    if (!config || !config.boundary) return false;

    const point = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };

    return this.pointInPolygon(point, config.boundary);
  }

  // Point-in-polygon algorithm
  pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].lat > point.lat) !== (polygon[j].lat > point.lat)) &&
          (point.lng < (polygon[j].lng - polygon[i].lng) * 
           (point.lat - polygon[i].lat) / (polygon[j].lat - polygon[i].lat) + polygon[i].lng)) {
        inside = !inside;
      }
    }
    return inside;
  }
}
```

#### **1.2 Campus Configuration**
```javascript
// src/js/services/location/UniversityCampusConfig.js
export const UniversityCampusConfig = {
  campuses: {
    iub: {
      name: "Independent University, Bangladesh",
      center: { lat: 23.0000, lng: 90.0000 }, // PLACEHOLDER - user will provide real coordinates
      boundary: [
        // PLACEHOLDER - detailed polygon points for IUB campus
        { lat: 23.0000, lng: 90.0000 },
        { lat: 23.0000, lng: 90.0000 },
        { lat: 23.0000, lng: 90.0000 },
        { lat: 23.0000, lng: 90.0000 }
      ]
    }
  },

  getCampusConfig(university) {
    return this.campuses[university] || null;
  }
};
```

### **Phase 2: Database Integration**

#### **2.1 Extend DataService**
```javascript
// Add to src/js/services/data/DataService.js

// Extend FIELD_PATHS constant
FIELD_PATHS = {
  // ... existing fields
  LOCATION_SHARING_ENABLED: "systemInfo.locationSharingEnabled",
  LAST_KNOWN_LOCATION: "systemInfo.lastKnownLocation",
  LOCATION_PRIVACY_LEVEL: "socialInfo.locationPrivacyLevel"
};

// New method: Update user location with campus context
async updateUserLocationStatus(userId, campusStatus, coordinates = null) {
  try {
    const updateData = {
      "systemInfo.lastActive": serverTimestamp(),
      "systemInfo.lastKnownLocation": {
        campusStatus: campusStatus,
        detectedAt: serverTimestamp(),
        coordinates: coordinates
      }
    };

    await updateDoc(doc(db, "users", userId), updateData);
    return { success: true };
  } catch (error) {
    console.error("Error updating location status:", error);
    return { success: false, error: error.message };
  }
}

// New method: Enable/disable location sharing globally
async updateLocationSharingPreference(userId, enabled) {
  try {
    await updateDoc(doc(db, "users", userId), {
      "systemInfo.locationSharingEnabled": enabled
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// New method: Update bilateral location sharing
async updateBilateralLocationSharing(friendshipId, userId, enabled) {
  try {
    await updateDoc(doc(db, "friendships", friendshipId), {
      [`locationVisibility.${userId}`]: enabled,
      "locationSharingMetadata.lastLocationUpdate": serverTimestamp(),
      "locationSharingMetadata.locationUpdatedBy": userId
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

#### **2.2 Extend FriendsService**
```javascript
// Add to src/js/services/friends/FriendsService.js

// New method: Request location sharing with friend
async requestLocationSharing(friendId, friendshipId) {
  const userProfile = await currentUser.waitForProfile();
  if (!userProfile) {
    return { success: false, message: "Please log in to share location." };
  }

  try {
    // 1. Enable location sharing from current user's side
    const result = await dataManager.updateBilateralLocationSharing(
      friendshipId, 
      currentUser.uid, 
      true
    );

    if (!result.success) {
      return { success: false, message: "Failed to enable location sharing." };
    }

    // 2. Create notification for the friend
    const notificationData = {
      userId: friendId,
      type: "location_share_request",
      fromUserId: currentUser.uid,
      fromUserInfo: {
        displayName: userProfile.profile.displayName,
        avatarConfig: userProfile.avatarConfig,
        major: userProfile.profile.major
      },
      locationRequest: {
        friendshipId: friendshipId,
        currentStatus: "pending_both",
        requestedAt: new Date()
      },
      status: "pending",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      actionButtons: ["accept", "dismiss"]
    };

    await dataManager.createNotification(notificationData);

    return {
      success: true,
      message: `Location sharing request sent to ${userProfile.profile.displayName}!`
    };
  } catch (error) {
    console.error("Error requesting location sharing:", error);
    return { success: false, message: "Something went wrong. Please try again." };
  }
}

// Enhanced method: Get friends with location context
async getFriendsListWithLocation() {
  const friendsList = await this.getFriendsList();
  
  // Add location sharing status to each friend
  return friendsList.map(friend => ({
    ...friend,
    hasLocationSharing: this.checkMutualLocationSharing(friend.friendshipId),
    canSeeLocation: this.canSeeLocation(friend.id),
    presenceDisplay: this.calculatePresenceDisplay(friend)
  }));
}

// Helper: Check if both users enabled location sharing
checkMutualLocationSharing(friendshipId) {
  // Query friendship document and check if both locationVisibility values are true
  // Implementation depends on how you cache friendship data
}
```

### **Phase 3: UI Components**

#### **3.1 Presence Dot Component**
```javascript
// src/js/components/presence/PresenceDot.js
export class PresenceDot {
  static getTimeText(minutesAgo) {
    if (minutesAgo < 1) return "1m";
    if (minutesAgo < 2) return "2m";
    if (minutesAgo < 5) return "5m";
    if (minutesAgo < 10) return "10m";
    if (minutesAgo < 15) return "15m";
    if (minutesAgo < 20) return "20m";
    if (minutesAgo < 30) return "30m";
    if (minutesAgo < 45) return "45m";
    if (minutesAgo < 60) return "1h";
    if (minutesAgo < 120) return "2h";
    if (minutesAgo < 180) return "3h";
    if (minutesAgo < 240) return "4h";
    if (minutesAgo < 300) return "5h";
    if (minutesAgo < 360) return "6h";
    return Math.floor(minutesAgo / 60) + "h"; // 7h, 8h, 9h, 10h, 11h, 12h
  }

  static create(lastActive, lastKnownLocation, hasLocationSharing = false) {
    if (!hasLocationSharing || !lastActive || !lastKnownLocation) {
      return '<div class="presence-dot grey"></div>';
    }

    const now = Date.now();
    const lastActiveTime = lastActive?.toDate?.() || new Date(lastActive);
    const minutesAgo = Math.floor((now - lastActiveTime) / (1000 * 60));

    // Don't show presence if >12 hours
    if (minutesAgo > 12 * 60) {
      return '<div class="presence-dot grey"></div>';
    }

    const timeText = this.getTimeText(minutesAgo);
    const campusStatus = lastKnownLocation.campusStatus;
    
    let dotClass = "grey";
    if (campusStatus === "on_campus") dotClass = "green";
    else if (campusStatus === "off_campus") dotClass = "red";

    if (dotClass === "grey") {
      return '<div class="presence-dot grey"></div>';
    }

    return `
      <div class="presence-dot ${dotClass}" 
           title="${this.getTooltip(lastActive, lastKnownLocation)}">
        <span class="dot-text">${timeText}</span>
      </div>
    `;
  }

  static getTooltip(lastActive, lastKnownLocation) {
    const status = lastKnownLocation?.campusStatus;
    const timeStr = new Date(lastActive).toLocaleTimeString();
    
    if (status === "on_campus") return `On campus - ${timeStr}`;
    if (status === "off_campus") return `Off campus - ${timeStr}`;
    return `Last seen - ${timeStr}`;
  }
}
```

#### **3.2 HorizontalFriendsBar Integration**
```javascript
// Modify src/js/components/friends/HorizontalFriendsBar.js

// Import the new component
import { PresenceDot } from '../../components/presence/PresenceDot.js';

// Modify renderFriendsAvatars method
renderFriendsAvatars() {
  return this.starredFriends.map(friend => {
    const avatar = avatarManager.generateAvatarUrl(friend.avatarConfig);
    
    // Add presence dot based on location sharing status
    const presenceDot = PresenceDot.create(
      friend.lastActive,
      friend.lastKnownLocation,
      friend.hasLocationSharing
    );
    
    return `
      <div class="friend-avatar-container ${friend.isSelected ? 'selected' : ''}" 
           data-friend-id="${friend.id}">
        <div class="avatar-wrapper">
          <img src="${avatar}" 
               alt="${friend.displayName}" 
               class="friend-avatar ${friend.isRestricted ? 'restricted' : ''}">
          ${presenceDot}
        </div>
        <span class="friend-name">${friend.displayName}</span>
      </div>
    `;
  }).join('');
}
```

### **Phase 4: Notifications System**

#### **4.1 Notifications Page**
```javascript
// src/js/pages/NotificationsPage.js
export class NotificationsPage {
  constructor() {
    this.notifications = [];
    this.unsubscribers = [];
  }

  async init() {
    await this.loadNotifications();
    this.setupRealtimeListeners();
    this.render();
  }

  async loadNotifications() {
    try {
      this.notifications = await dataManager.getUserNotifications(currentUser.uid);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  }

  render() {
    const template = `
      <div class="notifications-page">
        <header class="notifications-header">
          <h1>Notifications</h1>
          <button class="mark-all-read">Mark All Read</button>
        </header>
        
        <div class="notifications-list">
          ${this.renderNotifications()}
        </div>
      </div>
    `;
    
    document.querySelector('.page-content').innerHTML = template;
    this.setupEventHandlers();
  }

  renderNotifications() {
    if (this.notifications.length === 0) {
      return '<div class="no-notifications">No notifications yet</div>';
    }

    return this.notifications.map(notification => {
      if (notification.type === "location_share_request") {
        return this.renderLocationShareRequest(notification);
      } else if (notification.type === "friend_request") {
        return this.renderFriendRequest(notification);
      }
      // Add other notification types...
    }).join('');
  }

  renderLocationShareRequest(notification) {
    return `
      <div class="notification-item location-request" data-notification-id="${notification.id}">
        <div class="notification-avatar">
          <img src="${avatarManager.generateAvatarUrl(notification.fromUserInfo.avatarConfig)}" 
               alt="${notification.fromUserInfo.displayName}">
        </div>
        
        <div class="notification-content">
          <div class="notification-text">
            <strong>${notification.fromUserInfo.displayName}</strong> wants to share campus locations with you
          </div>
          <div class="notification-time">${this.formatTime(notification.createdAt)}</div>
        </div>
        
        <div class="notification-actions">
          <button class="accept-location-btn" data-friendship-id="${notification.locationRequest.friendshipId}">
            Share Location
          </button>
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  setupEventHandlers() {
    // Handle location sharing acceptance
    document.querySelectorAll('.accept-location-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const friendshipId = e.target.dataset.friendshipId;
        await this.acceptLocationSharing(friendshipId);
      });
    });

    // Handle dismissal
    document.querySelectorAll('.dismiss-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const notificationId = e.target.dataset.notificationId;
        await this.dismissNotification(notificationId);
      });
    });
  }

  async acceptLocationSharing(friendshipId) {
    try {
      // Enable location sharing from current user's side
      const result = await dataManager.updateBilateralLocationSharing(
        friendshipId,
        currentUser.uid,
        true
      );

      if (result.success) {
        // Request location permission if not already granted
        if (!campusLocationService.locationPermissionGranted) {
          await campusLocationService.requestLocationPermission();
        }

        // Start tracking location
        await this.startLocationTracking();

        notificationManager.showSuccessNotification("Location sharing enabled!");
        this.loadNotifications(); // Refresh notifications
      }
    } catch (error) {
      console.error("Error accepting location sharing:", error);
      notificationManager.showErrorNotification("Failed to enable location sharing");
    }
  }
}
```

### **Phase 5: CSS Styling**

#### **5.1 Presence Dot Styles**
```css
/* src/css/presence.css */
.presence-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

/* Consistent background colors with bright white text */
.presence-dot.green {
  background: #00C851;  /* Consistent green */
  color: white;         /* Bright white text */
}

.presence-dot.red {
  background: #FF3547;  /* Consistent red */
  color: white;         /* Bright white text */
}

.presence-dot.grey {
  background: #95A5A6;  /* Grey */
  /* No text content for grey dots */
}

.dot-text {
  line-height: 1;
  text-shadow: 0 1px 1px rgba(0,0,0,0.3);
}

/* Avatar container positioning */
.friend-avatar-container .avatar-wrapper {
  position: relative;
  display: inline-block;
}
```

---

## 🔄 **Integration with Existing Systems**

### **Reuse Existing Architecture**

#### **Privacy System Integration**
- Extend `FriendshipPrivacyService.js` to handle location visibility
- Reuse bilateral privacy pattern from schedule visibility
- Use same privacy change notification system

#### **Real-time System Integration**
- Add `CAMPUS_PRESENCE_CHANGED` event to `REALTIME_EVENTS`
- Integrate with existing `RealtimeService.js` listeners
- Reuse notification delivery system

#### **Friends System Integration**
- Extend existing `getFriendsList()` method with location data
- Reuse `HorizontalFriendsBar` component architecture
- Integrate with existing friend options menu

#### **Database Integration**
- Extend existing user document structure (no new collections for user data)
- Reuse existing `updateUserLastActive()` pattern
- Follow existing bilateral privacy database pattern

---

## 🚀 **Implementation Timeline**

### **Week 1: Core Infrastructure**
- [ ] Create campus location detection service
- [ ] Extend database schema and DataService methods
- [ ] Implement basic presence dot component
- [ ] Add location data to user tracking

### **Week 2: UI Integration**
- [ ] Integrate presence dots into HorizontalFriendsBar
- [ ] Add location sharing toggle to FriendsPage
- [ ] Implement bilateral location sharing logic
- [ ] Create notifications page structure

### **Week 3: Notifications & Polish**
- [ ] Complete notifications system
- [ ] Add location sharing request notifications
- [ ] Implement permission handling
- [ ] Add CSS styling and animations

### **Week 4: Testing & Refinement**
- [ ] Test bilateral consent flow
- [ ] Verify 12-hour presence window
- [ ] Test campus boundary detection
- [ ] Performance optimization

---

## 🎯 **Success Criteria**

### **Core Functionality**
- ✅ Users can enable/disable location sharing globally
- ✅ Users can enable location sharing with individual friends (bilateral consent required)
- ✅ Presence dots show correctly: green (on campus), red (off campus), grey (no data/disabled)
- ✅ Time stamps show in dots: 1m, 2m, 5m, 10m, 15m, 20m, 30m, 45m, 1h, 2h, 3h, 4h, 5h, 6h, up to 12h
- ✅ Presence dots only appear for starred friends in HorizontalFriendsBar
- ✅ Location permission requested only when user enables sharing

### **Notifications System**
- ✅ Location sharing requests appear in notifications page
- ✅ Users can accept/dismiss location sharing requests
- ✅ Notifications integrate with existing friend request system
- ✅ Real-time notification updates work correctly

### **Privacy & Consent**
- ✅ Location sharing is off by default for all friendships
- ✅ Both users must enable sharing for locations to be visible
- ✅ Location data integrates with existing bilateral privacy system
- ✅ Users can disable location sharing at any time

### **Performance**
- ✅ Location only detected when website is open
- ✅ No background tracking or battery drain
- ✅ Efficient campus boundary detection
- ✅ Minimal database writes for location updates

---

This implementation plan leverages your existing solid architecture while adding the campus presence feature in a clean, privacy-focused way. The bilateral consent model ensures user comfort, and the "last seen" approach provides social utility without invasive tracking.