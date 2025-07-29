/**
 * =============================================================================
 *                        SCHEDULE STORAGE SERVICE
 *                    Phase-1 Schedule Storage Foundation
 * =============================================================================
 * 
 * This service handles the dual storage strategy for user schedules:
 * - Firestore as primary storage with real-time sync
 * - localStorage as cache for instant UI updates
 * - Cross-device synchronization with conflict resolution
 * 
 * Features:
 * - Dual storage (Firestore + localStorage)
 * - Real-time sync across devices
 * - Last-modified-wins conflict resolution
 * - Background sync with notifications
 * - Offline detection and queuing
 * 
 * Architecture follows project patterns:
 * - Service-oriented design (like DataService.js, AuthService.js)
 * - Proper separation of concerns from HomePage.js
 * - Integration with existing notification system
 * 
 * =============================================================================
 */

import { DataService } from '../data/DataService.js';
import { notificationManager } from '../realtime/NotificationService.js';
import { realTimeManager, REALTIME_EVENTS } from '../realtime/RealtimeService.js';
import { currentUser } from '../../store/userStore.js';

/**
 * Phase-1 Schedule Storage Service
 * Handles dual storage strategy with real-time sync
 */
export class ScheduleStorageService {
  constructor() {
    this.dataService = new DataService();
    this.isOnline = navigator.onLine;
    this.pendingSync = new Set(); // Track offline operations
    this.realtimeListener = null;
    this.isLoading = false;
    this.lastError = null;
    
    // Setup online/offline detection
    this.setupOfflineDetection();
  }

  /**
   * Load user's schedule with dual strategy
   * Flow: Firestore (primary) → localStorage (cache) → return
   * @param {string} userId - User ID to load schedule for
   * @returns {Promise<Object|null>} Schedule data or null
   */
  async loadUserSchedule(userId) {
    this.isLoading = true;
    this.lastError = null;

    try {
      let scheduleData = null;

      // Try Firestore first (if online)
      if (this.isOnline) {
        try {
          scheduleData = await this.dataService.getUserSchedule(userId);
          
          if (scheduleData) {
            // Cache successful Firestore load
            this.cacheScheduleData(userId, scheduleData);
            console.log('✅ Schedule loaded from Firestore and cached');
          }
        } catch (error) {
          console.warn('⚠️ Firestore load failed, trying cache:', error.message);
          
          // Categorize error types for better handling
          if (error.code === 'permission-denied') {
            this.lastError = 'Access denied. Please check your authentication.';
            notificationManager.showSystemNotification('Schedule access denied', 'error', 'Authentication Error');
          } else if (error.code === 'unavailable') {
            this.lastError = 'Firestore temporarily unavailable. Using cached data.';
            notificationManager.showSystemNotification('Using offline schedule data', 'warning', 'Connection Issue');
          } else {
            this.lastError = `Firestore error: ${error.message}`;
          }
        }
      }

      // Fallback to localStorage cache
      if (!scheduleData) {
        scheduleData = this.getCachedScheduleData(userId);
        if (scheduleData) {
          console.log('📱 Schedule loaded from localStorage cache');
        }
      }

      return scheduleData;
    } catch (error) {
      console.error('❌ Failed to load schedule:', error);
      this.lastError = error.message;
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Save user's schedule with dual strategy
   * Flow: localStorage (instant) → Firestore (background) → notification
   * @param {string} userId - User ID
   * @param {Object} scheduleData - Schedule data in HomePage format
   * @returns {Promise<boolean>} Success status
   */
  async saveUserSchedule(userId, scheduleData) {
    try {
      // 1. Instant localStorage update for immediate UI response
      this.cacheScheduleData(userId, scheduleData);
      console.log('💾 Schedule saved to localStorage cache');

      // 2. Background Firestore sync
      if (this.isOnline) {
        try {
          await this.dataService.saveUserSchedule(userId, scheduleData, currentUser.uid);
          console.log('☁️ Schedule synced to Firestore');
          
          // Show sync notification
          notificationManager.showSystemNotification('Schedule synced across devices', 'success', 'Sync Complete');
        } catch (error) {
          console.error('⚠️ Firestore sync failed:', error);
          // Queue for offline sync
          this.pendingSync.add({ userId, scheduleData, timestamp: Date.now() });
        }
      } else {
        // Queue for when back online
        this.pendingSync.add({ userId, scheduleData, timestamp: Date.now() });
        console.log('📱 Schedule queued for sync when online');
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to save schedule:', error);
      this.lastError = error.message;
      return false;
    }
  }

  /**
   * Setup real-time sync listener for cross-device updates
   * Uses centralized RealtimeService for proper event coordination
   * @param {string} userId - User ID to listen for
   * @param {Function} callback - Called when schedule updates
   * @returns {Function} Unsubscribe function
   */
  setupRealtimeSync(userId, callback) {
    // Clean up existing listener
    if (this.realtimeListener) {
      this.realtimeListener();
      this.realtimeListener = null;
    }

    // Subscribe to centralized real-time events (senior developer pattern)
    this.realtimeListener = realTimeManager.on(REALTIME_EVENTS.USER_SCHEDULE, (scheduleData) => {
      // Update cache with real-time data
      this.cacheScheduleData(userId, scheduleData);
      
      // Notify UI of update
      if (callback) {
        callback(scheduleData);
      }

      console.log('🔄 Real-time schedule update received via RealtimeService');
    });

    // Ensure RealtimeService is listening for this user
    if (!realTimeManager.isListening || realTimeManager.currentUserId !== userId) {
      console.log('🚀 Starting RealtimeService for schedule sync');
      realTimeManager.startListening(userId);
    }

    return this.realtimeListener;
  }

  /**
   * Convert HomePage schedule format to Firestore format
   * @param {Object} homePageData - Data from HomePage.js
   * @returns {Object} Firestore-compatible format
   */
  convertToFirestoreFormat(homePageData) {
    const currentUserId = currentUser.uid;
    const userData = homePageData.users[currentUserId];
    
    if (!userData) {
      console.warn('No user data found for current user');
      return null;
    }

    return {
      schedule: userData.schedule || [],
      slotInfo: userData.slotInfo || [],
      timeSlots: userData.timeSlots || [],
      pinnedSlots: userData.pinnedSlots || [],
      timeBasedPins: userData.timeBasedPins || {}
    };
  }

  /**
   * Convert Firestore format to HomePage format
   * @param {Object} firestoreData - Data from Firestore
   * @param {string} userId - User ID
   * @returns {Object} HomePage-compatible format
   */
  convertToHomePageFormat(firestoreData, userId) {
    const user = currentUser.getCurrentUser();
    const studentId = user?.email?.split('@')[0] || 'Unknown';
    
    return {
      users: {
        [userId]: {
          id: userId,
          name: userId === currentUser.uid ? `Me (${studentId})` : 'Friend',
          schedule: firestoreData.schedule || [],
          slotInfo: firestoreData.slotInfo || [],
          timeSlots: firestoreData.timeSlots || [],
          pinnedSlots: firestoreData.pinnedSlots || [],
          timeBasedPins: firestoreData.timeBasedPins || {}
        }
      },
      savedAt: new Date().toISOString()
    };
  }

  /**
   * Cache schedule data in localStorage
   * @param {string} userId - User ID
   * @param {Object} scheduleData - Schedule data to cache
   */
  cacheScheduleData(userId, scheduleData) {
    try {
      const cacheKey = `schedule_${userId}`;
      const cacheData = {
        data: scheduleData,
        cachedAt: Date.now(),
        userId: userId
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache schedule data:', error);
    }
  }

  /**
   * Get cached schedule data from localStorage
   * @param {string} userId - User ID
   * @returns {Object|null} Cached schedule data or null
   */
  getCachedScheduleData(userId) {
    try {
      const cacheKey = `schedule_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const cacheData = JSON.parse(cached);
        return cacheData.data;
      }
    } catch (error) {
      console.warn('Failed to get cached schedule data:', error);
    }
    return null;
  }

  /**
   * Setup online/offline detection and sync handling
   */
  setupOfflineDetection() {
    // Track online status
    window.addEventListener('online', () => {
      console.log('🌐 Back online - syncing pending changes');
      this.isOnline = true;
      this.syncPendingOperations();
    });

    window.addEventListener('offline', () => {
      console.log('📱 Gone offline - queueing changes');
      this.isOnline = false;
    });
  }

  /**
   * Sync pending operations when back online
   */
  async syncPendingOperations() {
    if (this.pendingSync.size === 0) return;

    console.log(`📤 Syncing ${this.pendingSync.size} pending operations`);

    for (const operation of this.pendingSync) {
      try {
        await this.dataService.saveUserSchedule(
          operation.userId, 
          operation.scheduleData, 
          currentUser.uid
        );
        
        // Remove from pending after successful sync
        this.pendingSync.delete(operation);
        
        console.log('✅ Synced pending operation for user:', operation.userId);
      } catch (error) {
        console.error('❌ Failed to sync pending operation:', error);
        // Keep in pending set for retry
      }
    }

    if (this.pendingSync.size === 0) {
      notificationManager.showSystemNotification('All offline changes synced', 'success', 'Sync Complete');
    }
  }

  /**
   * Get current service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      isLoading: this.isLoading,
      lastError: this.lastError,
      pendingOperations: this.pendingSync.size,
      hasRealtimeListener: !!this.realtimeListener
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.realtimeListener) {
      this.realtimeListener();
      this.realtimeListener = null;
    }
    
    this.pendingSync.clear();
    console.log('🧹 ScheduleStorageService cleaned up');
  }
}

// Export singleton instance for use across the app
export const scheduleStorageService = new ScheduleStorageService();
export default scheduleStorageService;