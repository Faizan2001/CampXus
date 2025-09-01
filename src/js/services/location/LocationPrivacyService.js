/**
 * LocationPrivacyService - Bilateral Location Sharing Privacy Management
 *
 * High-level orchestration service for campus presence and location sharing features.
 * Coordinates between CampusLocationService, FriendshipPrivacyService, and DataService
 * to provide a comprehensive location privacy management system.
 *
 * Key Features:
 * - Bilateral location sharing controls (each user controls their own visibility)
 * - Campus presence detection with privacy enforcement
 * - Real-time location updates with privacy-aware filtering
 * - Global location preferences management
 * - Privacy-aware friend location access
 *
 * Architecture:
 * - Orchestrates between multiple services (doesn't directly touch Firestore)
 * - Provides clean API for UI components
 * - Handles complex workflows with multiple service interactions
 * - Enterprise-grade error handling and performance optimization
 *
 * Campus Presence Implementation Plan - Phase 1.2
 */

import { campusLocationService } from './CampusLocationService.js';
import { friendshipPrivacyService } from '../friends/FriendshipPrivacyService.js';
import { dataManager } from '../data/DataService.js';
import { currentUser } from '../../store/userStore.js';
import { realTimeManager } from '../realtime/RealtimeService.js';

class LocationPrivacyService {
  constructor() {
    // Cache for location data and privacy states
    this.locationCache = new Map();
    this.privacyStateCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache expiry
    
    // Memory management
    this.maxLocationCacheSize = 50;
    this.maxPrivacyStateCacheSize = 100;
    
    // Circuit breaker for location operations
    this.pendingLocationOperations = new Set();
    this.maxConcurrentOperations = 10;
    this.operationTimeout = 30 * 1000; // 30 seconds
    
    // Global location preferences cache
    this.globalPreferencesCache = new Map();
    
    console.log('🌍 LocationPrivacyService initialized with privacy-aware location management');
  }

  /**
   * Check if a viewer can access a target user's location based on privacy settings
   * @param {string} viewerUid - User who wants to view the location
   * @param {string} targetUid - User whose location is being accessed
   * @returns {Promise<boolean>} True if location access is allowed
   */
  async canAccessLocation(viewerUid, targetUid) {
    // Input validation
    if (!viewerUid || !targetUid) {
      console.error(
        '❌ LocationPrivacyService.canAccessLocation: Invalid user IDs:',
        { viewerUid, targetUid }
      );
      return false;
    }

    if (viewerUid === targetUid) {
      // Users can always access their own location
      return true;
    }

    try {
      console.log(`🔐 Checking location access: ${viewerUid} → ${targetUid}`);
      
      // Check cache first
      const cacheKey = `${viewerUid}_${targetUid}_access`;
      const cached = this.privacyStateCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log(`📋 Location access from cache: ${viewerUid} → ${targetUid} = ${cached.data}`);
        return cached.data;
      }

      // Use FriendshipPrivacyService to check location visibility
      const canAccess = await friendshipPrivacyService.isLocationVisible(targetUid, viewerUid);
      
      // Cache the result with size limit
      if (this.privacyStateCache.size >= this.maxPrivacyStateCacheSize) {
        const oldestKey = this.privacyStateCache.keys().next().value;
        this.privacyStateCache.delete(oldestKey);
      }
      this.privacyStateCache.set(cacheKey, {
        data: canAccess,
        timestamp: Date.now(),
      });

      console.log(`✅ Location access result: ${viewerUid} → ${targetUid} = ${canAccess}`);
      return canAccess;
    } catch (error) {
      console.error('❌ Error checking location access:', error);
      // Default to no access on error for security
      return false;
    }
  }

  /**
   * Enable location sharing with a specific friend
   * @param {string} userUid - User enabling location sharing
   * @param {string} friendUid - Friend to share location with
   * @returns {Promise<boolean>} Success status
   */
  async enableLocationSharingWith(userUid, friendUid) {
    // Input validation
    if (!userUid || !friendUid) {
      console.error(
        '❌ LocationPrivacyService.enableLocationSharingWith: Invalid user IDs:',
        { userUid, friendUid }
      );
      return false;
    }

    if (userUid === friendUid) {
      console.error(
        '❌ LocationPrivacyService.enableLocationSharingWith: Cannot share location with same user:',
        userUid
      );
      return false;
    }

    try {
      console.log(`🌍 Enabling location sharing: ${userUid} → ${friendUid}`);
      
      // Use FriendshipPrivacyService to update location visibility
      const success = await friendshipPrivacyService.updateLocationVisibility(
        userUid,
        friendUid,
        true
      );

      if (success) {
        // Clear relevant caches
        this.clearLocationAccessCache(userUid, friendUid);
        
        console.log(`✅ Location sharing enabled: ${userUid} → ${friendUid}`);
        return true;
      } else {
        console.error(`❌ Failed to enable location sharing: ${userUid} → ${friendUid}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error enabling location sharing:', error);
      return false;
    }
  }

  /**
   * Disable location sharing with a specific friend
   * @param {string} userUid - User disabling location sharing
   * @param {string} friendUid - Friend to stop sharing location with
   * @returns {Promise<boolean>} Success status
   */
  async disableLocationSharingWith(userUid, friendUid) {
    // Input validation
    if (!userUid || !friendUid) {
      console.error(
        '❌ LocationPrivacyService.disableLocationSharingWith: Invalid user IDs:',
        { userUid, friendUid }
      );
      return false;
    }

    if (userUid === friendUid) {
      console.error(
        '❌ LocationPrivacyService.disableLocationSharingWith: Cannot disable sharing with same user:',
        userUid
      );
      return false;
    }

    try {
      console.log(`🌍 Disabling location sharing: ${userUid} → ${friendUid}`);
      
      // Use FriendshipPrivacyService to update location visibility
      const success = await friendshipPrivacyService.updateLocationVisibility(
        userUid,
        friendUid,
        false
      );

      if (success) {
        // Clear relevant caches
        this.clearLocationAccessCache(userUid, friendUid);
        
        console.log(`✅ Location sharing disabled: ${userUid} → ${friendUid}`);
        return true;
      } else {
        console.error(`❌ Failed to disable location sharing: ${userUid} → ${friendUid}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error disabling location sharing:', error);
      return false;
    }
  }

  /**
   * Get locations for all friends that user can see, with privacy filtering
   * @param {string} userUid - User requesting friend locations
   * @returns {Promise<Array>} Array of friend location objects with privacy filtering
   */
  async getVisibleFriendsLocations(userUid) {
    // Input validation
    if (!userUid) {
      console.error(
        '❌ LocationPrivacyService.getVisibleFriendsLocations: Invalid user ID:',
        userUid
      );
      return [];
    }

    try {
      console.log(`🌍 Getting visible friends locations for: ${userUid}`);
      
      // Check circuit breaker
      if (this.pendingLocationOperations.size >= this.maxConcurrentOperations) {
        console.warn('⚠️ Location operations circuit breaker triggered - too many concurrent operations');
        return [];
      }

      const operationKey = `visible_locations_${userUid}`;
      if (this.pendingLocationOperations.has(operationKey)) {
        console.warn('⚠️ Location fetch already in progress for user:', userUid);
        return [];
      }

      this.pendingLocationOperations.add(operationKey);
      
      // Set timeout for operation
      const timeoutId = setTimeout(() => {
        this.pendingLocationOperations.delete(operationKey);
      }, this.operationTimeout);

      try {
        // Get user's friends list from DataService
        const friends = await dataManager.friendships.getMyFriends(userUid);
        
        if (!friends || friends.length === 0) {
          console.log(`📭 No friends found for user: ${userUid}`);
          return [];
        }

        console.log(`👥 Found ${friends.length} friends, checking location permissions...`);
        
        // Filter friends by location privacy and get their locations
        const visibleLocations = [];
        
        for (const friend of friends) {
          try {
            // Check if friend's location is visible to current user
            const canAccess = await this.canAccessLocation(userUid, friend.uid);
            
            if (canAccess) {
              // Get friend's current location if available
              const friendLocation = await this.getFriendLocation(friend.uid);
              
              if (friendLocation) {
                visibleLocations.push({
                  friendUid: friend.uid,
                  friendInfo: {
                    displayName: friend.displayName,
                    major: friend.major,
                    avatarConfig: friend.avatarConfig,
                  },
                  location: friendLocation,
                  lastUpdated: friendLocation.timestamp,
                  campusPresence: friendLocation.campusPresence || null,
                });
              }
            } else {
              console.log(`🔒 Location access restricted for friend: ${friend.uid}`);
            }
          } catch (friendError) {
            console.error(`❌ Error processing friend location for ${friend.uid}:`, friendError);
            // Continue processing other friends
          }
        }

        console.log(`✅ Retrieved ${visibleLocations.length} visible friend locations`);
        return visibleLocations;
        
      } finally {
        this.pendingLocationOperations.delete(operationKey);
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error('❌ Error getting visible friends locations:', error);
      return [];
    }
  }

  /**
   * Update user's location with privacy-aware filtering and campus detection
   * @param {string} userUid - User updating their location
   * @param {object} locationData - Location data to update
   * @returns {Promise<boolean>} Success status
   */
  async updateUserLocationWithPrivacy(userUid, locationData) {
    // Input validation
    if (!userUid || !locationData) {
      console.error(
        '❌ LocationPrivacyService.updateUserLocationWithPrivacy: Invalid parameters:',
        { userUid, locationData }
      );
      return false;
    }

    try {
      console.log(`🌍 Updating location with privacy for user: ${userUid}`);
      
      // Get user's university for campus detection
      const userProfile = await currentUser.waitForProfile();
      if (!userProfile || !userProfile.universityInfo?.university) {
        console.error('❌ Cannot update location - user profile or university not found');
        return false;
      }

      const university = userProfile.universityInfo.university;
      
      // Detect campus presence using CampusLocationService
      let campusPresence = null;
      try {
        campusPresence = await campusLocationService.detectCampusPresence(university);
        console.log(`🏫 Campus presence detected:`, campusPresence);
      } catch (campusError) {
        console.warn('⚠️ Campus presence detection failed:', campusError);
        // Continue without campus presence data
      }

      // Prepare location update with campus presence and privacy metadata
      const locationUpdate = {
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy || null,
          timestamp: Date.now(),
        },
        campusPresence: campusPresence,
        lastLocationUpdate: Date.now(),
        locationPrivacyVersion: 1, // For future privacy schema migrations
      };

      // Update location in user's profile using DataService
      const success = await dataManager.updateUserProfile(userUid, {
        'systemInfo.currentLocation': locationUpdate.location,
        'systemInfo.campusPresence': locationUpdate.campusPresence,
        'systemInfo.lastLocationUpdate': locationUpdate.lastLocationUpdate,
      });

      if (success) {
        // Clear location cache for this user
        this.clearUserLocationCache(userUid);
        
        // Emit real-time location update event for friends who can see this user's location
        try {
          await this.emitLocationUpdateEvent(userUid, locationUpdate);
        } catch (eventError) {
          console.error('❌ Failed to emit location update event:', eventError);
          // Don't fail the location update if event emission fails
        }
        
        console.log(`✅ Location updated with privacy for user: ${userUid}`);
        return true;
      } else {
        console.error(`❌ Failed to update location for user: ${userUid}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error updating user location with privacy:', error);
      return false;
    }
  }

  /**
   * Get user's global location sharing preferences
   * @param {string} userUid - User ID
   * @returns {Promise<object|null>} Global location preferences or null
   */
  async getGlobalLocationPreferences(userUid) {
    // Input validation
    if (!userUid) {
      console.error(
        '❌ LocationPrivacyService.getGlobalLocationPreferences: Invalid user ID:',
        userUid
      );
      return null;
    }

    try {
      console.log(`⚙️ Getting global location preferences for: ${userUid}`);
      
      // Check cache first
      const cached = this.globalPreferencesCache.get(userUid);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log(`📋 Global location preferences from cache: ${userUid}`);
        return cached.data;
      }

      // Get user profile to access global location preferences
      const userProfile = await dataManager.getUserProfile(userUid);
      
      if (!userProfile) {
        console.error(`❌ User profile not found for: ${userUid}`);
        return null;
      }

      // Extract location preferences with defaults
      const preferences = {
        // New canonical field (system-level) reflected as `enabled`
        enabled: userProfile.systemInfo?.locationSharingEnabled ?? false,

        // Legacy/extended preferences preserved for compatibility
        globalLocationSharingEnabled:
          userProfile.socialInfo?.globalLocationSharingEnabled || false,
        campusPresenceVisible:
          userProfile.socialInfo?.campusPresenceVisible !== false, // Default true
        locationSharingRadius:
          userProfile.socialInfo?.locationSharingRadius || 100, // Default 100m
        autoEnableCampusSharing:
          userProfile.socialInfo?.autoEnableCampusSharing || false,
        locationSharingSchedule:
          userProfile.socialInfo?.locationSharingSchedule || {
            enabled: false,
            startTime: '09:00',
            endTime: '17:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          },
        lastPreferencesUpdate:
          userProfile.socialInfo?.lastLocationPreferencesUpdate ||
          userProfile.systemInfo?.createdAt,
      };

      // Cache the preferences
      this.globalPreferencesCache.set(userUid, {
        data: preferences,
        timestamp: Date.now(),
      });

      console.log(`✅ Global location preferences retrieved:`, preferences);
      return preferences;
    } catch (error) {
      console.error('❌ Error getting global location preferences:', error);
      return null;
    }
  }

  /**
   * Update user's global location sharing preferences
   * @param {string} userUid - User ID
   * @param {object} preferences - New preference settings
   * @returns {Promise<boolean>} Success status
   */
  async setGlobalLocationPreferences(userUid, preferences) {
    // Input validation
    if (!userUid || !preferences || typeof preferences !== 'object') {
      console.error(
        '❌ LocationPrivacyService.setGlobalLocationPreferences: Invalid parameters:',
        { userUid, preferences }
      );
      return false;
    }

    try {
      console.log(`⚙️ Setting global location preferences for: ${userUid}`, preferences);
      
      // 1) Update canonical system-level flag if provided (preferences.enabled)
      let systemUpdateOk = true;
      if (typeof preferences.enabled === 'boolean') {
        const res = await dataManager.updateLocationSharingPreference(
          userUid,
          preferences.enabled
        );
        systemUpdateOk = !!res?.success;
      }

      // 2) Back-compat and extended preferences under socialInfo
      const updateData = {
        'socialInfo.lastLocationPreferencesUpdate': Date.now(),
      };

      if (typeof preferences.globalLocationSharingEnabled === 'boolean') {
        updateData['socialInfo.globalLocationSharingEnabled'] =
          preferences.globalLocationSharingEnabled;
      }

      if (typeof preferences.campusPresenceVisible === 'boolean') {
        updateData['socialInfo.campusPresenceVisible'] =
          preferences.campusPresenceVisible;
      }

      if (
        typeof preferences.locationSharingRadius === 'number' &&
        preferences.locationSharingRadius > 0
      ) {
        updateData['socialInfo.locationSharingRadius'] = Math.min(
          preferences.locationSharingRadius,
          1000
        ); // Max 1km
      }

      if (typeof preferences.autoEnableCampusSharing === 'boolean') {
        updateData['socialInfo.autoEnableCampusSharing'] =
          preferences.autoEnableCampusSharing;
      }

      if (
        preferences.locationSharingSchedule &&
        typeof preferences.locationSharingSchedule === 'object'
      ) {
        updateData['socialInfo.locationSharingSchedule'] =
          preferences.locationSharingSchedule;
      }

      // Update profile with extended preferences
      const profileUpdated = await dataManager.updateUserProfile(
        userUid,
        updateData
      );

      if (systemUpdateOk && profileUpdated) {
        // Clear preferences cache
        this.globalPreferencesCache.delete(userUid);
        console.log(`✅ Global location preferences updated for: ${userUid}`);
        return true;
      }

      console.error(
        `❌ Failed to update global location preferences for: ${userUid}`
      );
      return false;
    } catch (error) {
      console.error('❌ Error setting global location preferences:', error);
      return false;
    }
  }

  /**
   * Get friends with mutual location sharing enabled
   * @param {string} userUid - User ID
   * @returns {Promise<Array>} Array of friends with mutual location sharing
   */
  async getMutualLocationFriends(userUid) {
    // Input validation
    if (!userUid) {
      console.error(
        '❌ LocationPrivacyService.getMutualLocationFriends: Invalid user ID:',
        userUid
      );
      return [];
    }

    try {
      console.log(`🤝 Getting mutual location friends for: ${userUid}`);
      
      // Get user's friends list
      const friends = await dataManager.friendships.getMyFriends(userUid);
      
      if (!friends || friends.length === 0) {
        console.log(`📭 No friends found for user: ${userUid}`);
        return [];
      }

      const mutualLocationFriends = [];
      
      for (const friend of friends) {
        try {
          // Check if both users can see each other's locations
          const userCanSeeFriend = await this.canAccessLocation(userUid, friend.uid);
          const friendCanSeeUser = await this.canAccessLocation(friend.uid, userUid);
          
          if (userCanSeeFriend && friendCanSeeUser) {
            // Get detailed location visibility status
            const locationStatus = await friendshipPrivacyService.getLocationVisibilityStatus(
              userUid,
              friend.uid
            );
            
            if (locationStatus && locationStatus.mutualSharingEnabled) {
              mutualLocationFriends.push({
                friendUid: friend.uid,
                friendInfo: {
                  displayName: friend.displayName,
                  major: friend.major,
                  avatarConfig: friend.avatarConfig,
                },
                locationStatus: locationStatus,
                mutualSharingEnabled: true,
                lastStatusUpdate: locationStatus.lastUpdated,
              });
            }
          }
        } catch (friendError) {
          console.error(`❌ Error checking mutual location sharing for ${friend.uid}:`, friendError);
          // Continue processing other friends
        }
      }

      console.log(`✅ Found ${mutualLocationFriends.length} mutual location friends`);
      return mutualLocationFriends;
    } catch (error) {
      console.error('❌ Error getting mutual location friends:', error);
      return [];
    }
  }

  // Helper Methods

  /**
   * Get a friend's current location if available
   * @param {string} friendUid - Friend's user ID
   * @returns {Promise<object|null>} Friend's location data or null
   */
  async getFriendLocation(friendUid) {
    try {
      // Check cache first
      const cached = this.locationCache.get(friendUid);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }

      // Get friend's profile for location data
      const friendProfile = await dataManager.getUserProfile(friendUid);
      
      if (!friendProfile || !friendProfile.systemInfo?.currentLocation) {
        return null;
      }

      const locationData = {
        ...friendProfile.systemInfo.currentLocation,
        campusPresence: friendProfile.systemInfo.campusPresence || null,
      };

      // Cache the location with size limit
      if (this.locationCache.size >= this.maxLocationCacheSize) {
        const oldestKey = this.locationCache.keys().next().value;
        this.locationCache.delete(oldestKey);
      }
      this.locationCache.set(friendUid, {
        data: locationData,
        timestamp: Date.now(),
      });

      return locationData;
    } catch (error) {
      console.error(`❌ Error getting friend location for ${friendUid}:`, error);
      return null;
    }
  }

  /**
   * Emit location update event for privacy-aware real-time updates
   * @param {string} userUid - User who updated their location
   * @param {object} locationUpdate - Location update data
   */
  async emitLocationUpdateEvent(userUid, locationUpdate) {
    try {
      // Get friends who can see this user's location
      const friends = await dataManager.friendships.getMyFriends(userUid);
      
      for (const friend of friends) {
        try {
          const canAccess = await this.canAccessLocation(friend.uid, userUid);
          
          if (canAccess) {
            // Emit location update event to this friend
            realTimeManager.emitLocationUpdate(
              userUid, // User who updated location
              friend.uid, // Friend who can see the update
              locationUpdate // Location data
            );
          }
        } catch (friendError) {
          console.error(`❌ Error emitting location update for friend ${friend.uid}:`, friendError);
          // Continue with other friends
        }
      }
      
      console.log(`📡 Location update events emitted for user: ${userUid}`);
    } catch (error) {
      console.error('❌ Error emitting location update events:', error);
    }
  }

  /**
   * Clear location access cache for specific user pair
   * @param {string} userUid1 - First user ID
   * @param {string} userUid2 - Second user ID
   */
  clearLocationAccessCache(userUid1, userUid2) {
    const cacheKey1 = `${userUid1}_${userUid2}_access`;
    const cacheKey2 = `${userUid2}_${userUid1}_access`;
    
    this.privacyStateCache.delete(cacheKey1);
    this.privacyStateCache.delete(cacheKey2);
    
    console.log(`🧹 Cleared location access cache for: ${userUid1} ↔ ${userUid2}`);
  }

  /**
   * Clear location cache for specific user
   * @param {string} userUid - User ID
   */
  clearUserLocationCache(userUid) {
    this.locationCache.delete(userUid);
    this.globalPreferencesCache.delete(userUid);
    
    console.log(`🧹 Cleared location cache for user: ${userUid}`);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    const locationCacheSize = this.locationCache.size;
    const privacyStateCacheSize = this.privacyStateCache.size;
    const globalPreferencesCacheSize = this.globalPreferencesCache.size;
    
    this.locationCache.clear();
    this.privacyStateCache.clear();
    this.globalPreferencesCache.clear();
    
    console.log(
      `🧹 All location privacy caches cleared: ${locationCacheSize} location + ${privacyStateCacheSize} privacy state + ${globalPreferencesCacheSize} global preferences entries`
    );
  }

  /**
   * Get cache statistics for monitoring
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    return {
      locationCache: {
        size: this.locationCache.size,
        maxSize: this.maxLocationCacheSize,
        entries: Array.from(this.locationCache.keys()),
      },
      privacyStateCache: {
        size: this.privacyStateCache.size,
        maxSize: this.maxPrivacyStateCacheSize,
        entries: Array.from(this.privacyStateCache.keys()),
      },
      globalPreferencesCache: {
        size: this.globalPreferencesCache.size,
        entries: Array.from(this.globalPreferencesCache.keys()),
      },
      pendingOperations: {
        count: this.pendingLocationOperations.size,
        maxConcurrent: this.maxConcurrentOperations,
        operations: Array.from(this.pendingLocationOperations),
      },
      cacheExpiry: this.cacheExpiry,
    };
  }

  /**
   * Cleanup method for memory management
   */
  cleanup() {
    // Clear all caches
    this.clearAllCaches();
    
    // Clear pending operations
    const pendingOpsCount = this.pendingLocationOperations.size;
    this.pendingLocationOperations.clear();
    
    console.log(`🧹 LocationPrivacyService cleanup completed`);
    console.log(`   Cleared ${pendingOpsCount} pending operations`);
  }
}

// Create and export singleton instance
export const locationPrivacyService = new LocationPrivacyService();

// Export class for testing
export { LocationPrivacyService };
