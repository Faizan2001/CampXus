# Phase 1: Schedule Storage Foundation 📅

## Mission Overview 🎯

Welcome to the first phase of transforming CampXus into an intuitive social scheduling platform! Before we can create that amazing Instagram-stories-style friends bar, we need to build a solid foundation by storing user schedules in the database.

**Duration**: 2-3 days  
**Difficulty**: Beginner-Intermediate 🔥🔥  
**Goal**: Store and manage user schedules in Firebase Firestore

## What We're Building 🚀

By the end of this phase, your CampXus will have:

- **📅 Schedule Storage**: User schedules saved in Firebase Firestore
- **🔄 Real-time Sync**: Schedules automatically sync across devices
- **💾 Auto-Save**: Changes save automatically as users edit
- **🔧 Migration System**: Convert existing local schedules to cloud storage
- **🛡️ Error Handling**: Graceful handling of network issues and empty schedules

## Architecture Overview 🏗️

```
📅 Schedule Storage System
├── 🗄️ Database Structure
│   ├── User Schedule Documents
│   ├── Schedule Validation
│   └── Sharing Permissions
├── 💾 Storage Management
│   ├── Auto-Save System
│   ├── Conflict Resolution
│   └── Local Backup
└── 📊 Schedule Operations
    ├── Create/Read/Update/Delete
    ├── Import/Export
    └── Sharing Preparation
```

---

## Mission 1: Database Structure Design 🗄️

### Setting Up the Schedule Collection

First, let's design how schedules will be stored in Firestore. We'll create a structure that's optimized for both individual use and social sharing.

#### Database Schema Design

```javascript
// Firestore Collection: "schedules"
// Document ID: userId
{
  // Owner information
  userId: "user-uid-123",
  
  // Schedule metadata
  metadata: {
    lastModified: timestamp,
    version: 1,
    isPublic: false,
    shareWithFriends: true,
    totalClasses: 12
  },
  
  // The actual schedule data
  scheduleData: [
    {
      id: "schedule-item-1",
      title: "Advanced Algorithms",
      courseCode: "CSE 401",
      instructor: "Dr. Smith",
      location: "Room 301",
      dayOfWeek: "monday",
      startTime: "09:00",
      endTime: "10:30",
      color: "#4f46e5",
      credits: 3,
      type: "lecture", // lecture, lab, tutorial
      notes: "Bring calculator"
    }
    // ... more schedule items
  ],
  
  // Schedule settings
  settings: {
    timeFormat: "12hour", // 12hour or 24hour
    startDay: "sunday", // first day of week
    notifications: true,
    shareWithFriends: true
  },
  
  // System timestamps
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## Mission 2: Schedule Storage Manager 💾

### Creating the Core Storage System

Let's build a comprehensive schedule storage system that handles all database operations.

#### File: `src/js/core/schedule-storage.js`

```javascript
// Schedule Storage Manager - The heart of schedule persistence
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config/firebase-config.js';
import { getCurrentUser } from './currentUser.js';

export class ScheduleStorage {
  constructor() {
    this.currentUser = null;
    this.saveTimeout = null;
    this.isOnline = navigator.onLine;
    this.localScheduleKey = 'campxus-local-schedule';
    
    // Initialize user state
    this.initializeUser();
    this.setupNetworkMonitoring();
  }
  
  // Initialize user authentication state
  initializeUser() {
    // Listen for auth state changes
    this.currentUser = getCurrentUser();
    console.log('📅 Schedule Storage initialized for:', this.currentUser?.email || 'No user');
  }
  
  // Monitor network status for offline handling
  setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📶 Back online - syncing schedules...');
      this.syncLocalSchedule();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📱 Offline mode - saving locally');
    });
  }
  
  // Save user's schedule to database
  async saveSchedule(scheduleData) {
    if (!this.currentUser) {
      console.warn('⚠️ Cannot save schedule: User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }
    
    // Always save locally first for immediate feedback
    this.saveToLocalStorage(scheduleData);
    
    // If offline, just save locally
    if (!this.isOnline) {
      console.log('💾 Saved schedule locally (offline mode)');
      return { success: true, offline: true };
    }
    
    try {
      const scheduleDoc = {
        userId: this.currentUser.uid,
        metadata: {
          lastModified: serverTimestamp(),
          version: Date.now(),
          isPublic: false,
          shareWithFriends: true,
          totalClasses: scheduleData.length
        },
        scheduleData: this.processScheduleData(scheduleData),
        settings: {
          timeFormat: '12hour',
          startDay: 'sunday',
          notifications: true,
          shareWithFriends: true
        },
        updatedAt: serverTimestamp()
      };
      
      // Check if document exists to decide between create or update
      const docRef = doc(db, 'schedules', this.currentUser.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        // Update existing schedule
        await updateDoc(docRef, {
          ...scheduleDoc,
          updatedAt: serverTimestamp()
        });
        console.log('✅ Schedule updated in database');
      } else {
        // Create new schedule document
        await setDoc(docRef, {
          ...scheduleDoc,
          createdAt: serverTimestamp()
        });
        console.log('✅ New schedule created in database');
      }
      
      // Clear local storage after successful save
      this.clearLocalStorage();
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to save schedule:', error);
      // Keep local copy if cloud save fails
      return { success: false, error: error.message };
    }
  }
  
  // Load user's schedule from database
  async loadSchedule() {
    if (!this.currentUser) {
      console.warn('⚠️ Cannot load schedule: User not authenticated');
      return null;
    }
    
    try {
      const docRef = doc(db, 'schedules', this.currentUser.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const scheduleDoc = docSnap.data();
        console.log('📥 Schedule loaded from database');
        return {
          scheduleData: scheduleDoc.scheduleData || [],
          metadata: scheduleDoc.metadata || {},
          settings: scheduleDoc.settings || {}
        };
      } else {
        console.log('📭 No schedule found in database');
        
        // Try to load from local storage
        const localSchedule = this.loadFromLocalStorage();
        if (localSchedule && localSchedule.length > 0) {
          console.log('💾 Loaded schedule from local storage');
          // Auto-save local schedule to database
          await this.saveSchedule(localSchedule);
          return { scheduleData: localSchedule, metadata: {}, settings: {} };
        }
        
        return null;
      }
      
    } catch (error) {
      console.error('❌ Failed to load schedule:', error);
      
      // Fallback to local storage
      const localSchedule = this.loadFromLocalStorage();
      if (localSchedule) {
        console.log('💾 Loaded schedule from local backup');
        return { scheduleData: localSchedule, metadata: {}, settings: {} };
      }
      
      return null;
    }
  }
  
  // Load a friend's schedule (for viewing/comparison)
  async loadFriendSchedule(friendUserId) {
    try {
      const docRef = doc(db, 'schedules', friendUserId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const scheduleDoc = docSnap.data();
        
        // Check if schedule is shareable
        if (scheduleDoc.settings?.shareWithFriends === false) {
          return { error: 'Schedule is private' };
        }
        
        console.log(`📥 Loaded ${friendUserId}'s schedule`);
        return {
          scheduleData: scheduleDoc.scheduleData || [],
          metadata: scheduleDoc.metadata || {},
          owner: friendUserId
        };
      } else {
        return { error: 'Friend has no schedule set up yet' };
      }
      
    } catch (error) {
      console.error(`❌ Failed to load friend's schedule:`, error);
      return { error: 'Failed to load schedule' };
    }
  }
  
  // Auto-save with debouncing
  autoSave(scheduleData) {
    // Clear previous timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Save after 3 seconds of inactivity
    this.saveTimeout = setTimeout(() => {
      this.saveSchedule(scheduleData);
    }, 3000);
  }
  
  // Process and validate schedule data before saving
  processScheduleData(scheduleData) {
    return scheduleData.map(item => ({
      id: item.id || this.generateId(),
      title: item.title || 'Untitled Class',
      courseCode: item.courseCode || '',
      instructor: item.instructor || '',
      location: item.location || '',
      dayOfWeek: item.dayOfWeek || 'monday',
      startTime: item.startTime || '09:00',
      endTime: item.endTime || '10:00',
      color: item.color || '#4f46e5',
      credits: item.credits || 3,
      type: item.type || 'lecture',
      notes: item.notes || ''
    }));
  }
  
  // Generate unique ID for schedule items
  generateId() {
    return 'schedule-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
  
  // Local storage operations
  saveToLocalStorage(scheduleData) {
    try {
      const dataToSave = {
        scheduleData,
        savedAt: new Date().toISOString(),
        userId: this.currentUser?.uid
      };
      localStorage.setItem(this.localScheduleKey, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Failed to save to local storage:', error);
    }
  }
  
  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem(this.localScheduleKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Verify it belongs to current user
        if (parsed.userId === this.currentUser?.uid) {
          return parsed.scheduleData;
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to load from local storage:', error);
      return null;
    }
  }
  
  clearLocalStorage() {
    localStorage.removeItem(this.localScheduleKey);
  }
  
  // Sync local schedule to database when coming back online
  async syncLocalSchedule() {
    const localSchedule = this.loadFromLocalStorage();
    if (localSchedule && localSchedule.length > 0) {
      console.log('🔄 Syncing local schedule to database...');
      await this.saveSchedule(localSchedule);
    }
  }
  
  // Get schedule statistics
  getScheduleStats(scheduleData) {
    if (!scheduleData || scheduleData.length === 0) {
      return {
        totalClasses: 0,
        totalCredits: 0,
        daysWithClasses: 0,
        averageClassesPerDay: 0
      };
    }
    
    const totalClasses = scheduleData.length;
    const totalCredits = scheduleData.reduce((sum, item) => sum + (item.credits || 0), 0);
    const uniqueDays = new Set(scheduleData.map(item => item.dayOfWeek));
    const daysWithClasses = uniqueDays.size;
    const averageClassesPerDay = Math.round((totalClasses / daysWithClasses) * 10) / 10;
    
    return {
      totalClasses,
      totalCredits,
      daysWithClasses,
      averageClassesPerDay
    };
  }
}

// Create and export singleton instance
export const scheduleStorage = new ScheduleStorage();
```

---

## Mission 3: Integration with Existing Schedule System 🔧

### Updating Your Current Schedule App

Now let's integrate the storage system with your existing schedule functionality.

#### File: `src/js/core/schedule-integration.js`

```javascript
// Integration layer for existing schedule system
import { scheduleStorage } from './schedule-storage.js';

export class ScheduleIntegration {
  constructor() {
    this.scheduleData = [];
    this.isLoading = false;
    this.hasUnsavedChanges = false;
    
    // Initialize integration
    this.init();
  }
  
  async init() {
    console.log('🔧 Initializing schedule integration...');
    
    // Load existing schedule
    await this.loadUserSchedule();
    
    // Set up auto-save
    this.setupAutoSave();
    
    // Handle page visibility changes
    this.setupVisibilityHandler();
    
    console.log('✅ Schedule integration ready');
  }
  
  // Load user's schedule on app start
  async loadUserSchedule() {
    this.setLoading(true);
    
    try {
      const result = await scheduleStorage.loadSchedule();
      
      if (result && result.scheduleData) {
        this.scheduleData = result.scheduleData;
        console.log(`📅 Loaded ${this.scheduleData.length} schedule items`);
        
        // Update your existing UI
        this.renderSchedule();
        this.updateScheduleStats(result.metadata);
      } else {
        // No schedule found - initialize empty
        this.scheduleData = [];
        console.log('📅 Starting with empty schedule');
        this.renderEmptyState();
      }
      
    } catch (error) {
      console.error('Failed to load schedule:', error);
      this.showError('Failed to load your schedule. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }
  
  // Save schedule (triggered by user actions)
  async saveSchedule() {
    if (this.scheduleData.length === 0) {
      console.log('📅 No schedule data to save');
      return;
    }
    
    try {
      const result = await scheduleStorage.saveSchedule(this.scheduleData);
      
      if (result.success) {
        this.hasUnsavedChanges = false;
        this.showSuccess(result.offline ? 'Saved locally (offline)' : 'Schedule saved!');
        console.log('✅ Schedule saved successfully');
      } else {
        this.showError('Failed to save schedule: ' + result.error);
      }
      
    } catch (error) {
      console.error('Save failed:', error);
      this.showError('Failed to save schedule. Changes saved locally.');
    }
  }
  
  // Add new schedule item
  async addScheduleItem(newItem) {
    // Add to local array
    this.scheduleData.push(newItem);
    
    // Mark as changed
    this.hasUnsavedChanges = true;
    
    // Update UI
    this.renderSchedule();
    
    // Trigger auto-save
    this.triggerAutoSave();
    
    console.log('➕ Added new schedule item:', newItem.title);
  }
  
  // Update existing schedule item
  async updateScheduleItem(itemId, updatedItem) {
    const index = this.scheduleData.findIndex(item => item.id === itemId);
    
    if (index !== -1) {
      this.scheduleData[index] = { ...this.scheduleData[index], ...updatedItem };
      this.hasUnsavedChanges = true;
      this.renderSchedule();
      this.triggerAutoSave();
      
      console.log('✏️ Updated schedule item:', updatedItem.title);
    }
  }
  
  // Delete schedule item
  async deleteScheduleItem(itemId) {
    const initialLength = this.scheduleData.length;
    this.scheduleData = this.scheduleData.filter(item => item.id !== itemId);
    
    if (this.scheduleData.length < initialLength) {
      this.hasUnsavedChanges = true;
      this.renderSchedule();
      this.triggerAutoSave();
      
      console.log('🗑️ Deleted schedule item');
    }
  }
  
  // Set up auto-save functionality
  setupAutoSave() {
    // Auto-save every 30 seconds if there are unsaved changes
    setInterval(() => {
      if (this.hasUnsavedChanges && this.scheduleData.length > 0) {
        console.log('⏰ Auto-saving schedule...');
        this.saveSchedule();
      }
    }, 30000);
  }
  
  // Trigger auto-save with debouncing
  triggerAutoSave() {
    scheduleStorage.autoSave(this.scheduleData);
  }
  
  // Handle page visibility changes (save when user leaves)
  setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.hasUnsavedChanges) {
        // Page is hidden, save immediately
        this.saveSchedule();
      }
    });
    
    // Save before page unload
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges) {
        // Trigger immediate save
        this.saveSchedule();
        
        // Show warning to user
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    });
  }
  
  // Get current schedule data (for other components)
  getScheduleData() {
    return this.scheduleData;
  }
  
  // Get schedule statistics
  getStats() {
    return scheduleStorage.getScheduleStats(this.scheduleData);
  }
  
  // UI update methods (integrate with your existing UI)
  renderSchedule() {
    // This should call your existing schedule rendering function
    if (window.renderScheduleGrid) {
      window.renderScheduleGrid(this.scheduleData);
    }
    
    // Update stats display
    const stats = this.getStats();
    this.updateStatsDisplay(stats);
  }
  
  renderEmptyState() {
    // Show empty state message
    const scheduleContainer = document.getElementById('schedule-grid');
    if (scheduleContainer) {
      scheduleContainer.innerHTML = `
        <div class="empty-schedule-state">
          <h3>📅 Ready to build your schedule?</h3>
          <p>Add your first class to get started!</p>
          <button onclick="openAddClassModal()" class="btn-primary">
            ➕ Add Your First Class
          </button>
        </div>
      `;
    }
  }
  
  updateStatsDisplay(stats) {
    const statsEl = document.getElementById('schedule-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-number">${stats.totalClasses}</span>
            <span class="stat-label">Classes</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">${stats.totalCredits}</span>
            <span class="stat-label">Credits</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">${stats.daysWithClasses}</span>
            <span class="stat-label">Days</span>
          </div>
        </div>
      `;
    }
  }
  
  // Loading state management
  setLoading(isLoading) {
    this.isLoading = isLoading;
    const loadingEl = document.getElementById('schedule-loading');
    if (loadingEl) {
      loadingEl.style.display = isLoading ? 'block' : 'none';
    }
  }
  
  // User feedback methods
  showSuccess(message) {
    this.showToast(message, 'success');
  }
  
  showError(message) {
    this.showToast(message, 'error');
  }
  
  showToast(message, type) {
    // Use your existing notification system
    if (window.showNotification) {
      window.showNotification(message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${message}`);
    }
  }
}

// Create and export singleton
export const scheduleIntegration = new ScheduleIntegration();
```

---

## Mission 4: Database Security Rules 🛡️

### Setting Up Firestore Security

We need to ensure only users can access their own schedules and friends can view shared schedules.

#### File: `firestore.rules` (Update your existing rules)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can read/write their own schedule
    match /schedules/{userId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == userId;
    }
    
    // Friends can read schedules if sharing is enabled
    match /schedules/{userId} {
      allow read: if request.auth != null
        && request.auth.uid != userId
        && isFriend(request.auth.uid, userId)
        && resource.data.settings.shareWithFriends == true;
    }
    
    // Helper function to check friendship
    function isFriend(currentUserId, targetUserId) {
      return exists(/databases/$(database)/documents/friendships/$(currentUserId + '_' + targetUserId))
        || exists(/databases/$(database)/documents/friendships/$(targetUserId + '_' + currentUserId));
    }
    
    // Existing rules for users, friendships, etc.
    match /users/{userId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == userId;
    }
    
    match /friendships/{friendshipId} {
      allow read, write: if request.auth != null
        && (resource.data.user1Id == request.auth.uid 
            || resource.data.user2Id == request.auth.uid);
    }
  }
}
```

---

## Mission 5: Testing Your Schedule Storage 🧾

### Comprehensive Testing Checklist

#### Test Scenario 1: Basic Schedule Operations

```javascript
// Test script you can run in browser console
async function testScheduleStorage() {
  console.log('🧪 Testing Schedule Storage...');
  
  // Test data
  const testSchedule = [
    {
      id: 'test-1',
      title: 'Advanced Algorithms',
      courseCode: 'CSE 401',
      dayOfWeek: 'monday',
      startTime: '09:00',
      endTime: '10:30',
      location: 'Room 301'
    },
    {
      id: 'test-2',
      title: 'Database Systems',
      courseCode: 'CSE 403',
      dayOfWeek: 'wednesday',
      startTime: '11:00',
      endTime: '12:30',
      location: 'Lab 201'
    }
  ];
  
  // Test save
  console.log('Testing save...');
  const saveResult = await scheduleStorage.saveSchedule(testSchedule);
  console.log('Save result:', saveResult);
  
  // Test load
  console.log('Testing load...');
  const loadResult = await scheduleStorage.loadSchedule();
  console.log('Load result:', loadResult);
  
  // Verify data matches
  if (loadResult && loadResult.scheduleData.length === testSchedule.length) {
    console.log('✅ Basic save/load test passed!');
  } else {
    console.log('❌ Basic save/load test failed!');
  }
}

// Run the test
testScheduleStorage();
```

#### Test Checklist

- [ ] **Save Schedule**: Can save schedule to database
- [ ] **Load Schedule**: Can load schedule from database
- [ ] **Auto-Save**: Changes auto-save after 3 seconds
- [ ] **Offline Mode**: Saves locally when offline
- [ ] **Online Sync**: Syncs local data when back online
- [ ] **Empty Schedule**: Handles users with no schedule gracefully
- [ ] **Error Handling**: Shows appropriate error messages
- [ ] **Stats Calculation**: Schedule statistics display correctly

---

## ✅ Phase 1 Completion Criteria

You've successfully completed Phase 1 when:

- [ ] Schedules save automatically to Firebase Firestore
- [ ] Schedules load correctly when the app starts
- [ ] Auto-save works after making changes
- [ ] Offline mode saves locally and syncs when online
- [ ] Empty schedules are handled gracefully
- [ ] Users can only access their own schedules
- [ ] Error messages are helpful and informative
- [ ] Schedule statistics display correctly

## 🎉 Celebration & Next Steps!

Fantastic work! You've built a solid foundation for social scheduling. Your schedules now live in the cloud and are ready for the exciting social features coming next.

**What You've Learned:**
- ✅ Firebase Firestore document structure design
- ✅ Real-time data synchronization
- ✅ Offline-first architecture with local backups
- ✅ Auto-save systems with debouncing
- ✅ Database security rules for privacy
- ✅ Error handling and user feedback

## ⏭️ Ready for Phase 2: Quick Access Friends System! 🚀

Now that schedules are safely stored in the database, we can build the "Quick Access" feature that lets users star their favorite friends for easy schedule viewing!

---

**Time Required**: 2-3 days  
**Difficulty**: Beginner-Intermediate 🔥🔥  
**Skills Learned**: Database design, real-time sync, offline handling