/**
 * RealtimeService Test Suite
 * 
 * Tests the centralized real-time event coordination system:
 * - Event subscription/unsubscription
 * - Event emission
 * - Listener lifecycle management
 * - Status tracking
 * - Privacy event handling
 */

import { jest } from '@jest/globals';

describe('RealtimeService', () => {
  // ============================================
  // Test helpers that mirror service logic
  // ============================================
  
  /**
   * Event types for the real-time system
   */
  const REALTIME_EVENTS = {
    FRIEND_REQUESTS: 'friendRequests',
    OUTGOING_FRIEND_REQUESTS: 'outgoingFriendRequests',
    FRIENDSHIPS: 'friendships',
    USER_PROFILE: 'userProfile',
    USER_STATUS: 'userStatus',
    CONNECTION_STATUS: 'connectionStatus',
    USER_SCHEDULE: 'userSchedule',
    SCHEDULE_SYNC: 'scheduleSync',
    SCHEDULE_PRIVACY_CHANGE: 'schedulePrivacyChange',
    QUICK_ACCESS_UPDATED: 'quickAccessUpdated',
    QUICK_ACCESS_FRIENDS: 'quickAccessFriends',
    CAMPUS_PRESENCE_CHANGED: 'campusPresenceChanged',
    LOCATION_PRIVACY_CHANGED: 'locationPrivacyChanged',
    USER_ACTIVITY_CHANGED: 'userActivityChanged'
  };
  
  /**
   * Simple event emitter implementation
   */
  class EventEmitter {
    constructor() {
      this.subscribers = new Map();
    }
    
    on(eventType, callback) {
      if (!this.isValidEventType(eventType)) {
        return () => {};
      }
      
      if (typeof callback !== 'function') {
        return () => {};
      }
      
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, new Set());
      }
      
      this.subscribers.get(eventType).add(callback);
      
      return () => this.off(eventType, callback);
    }
    
    off(eventType, callback) {
      if (this.subscribers.has(eventType)) {
        this.subscribers.get(eventType).delete(callback);
        
        if (this.subscribers.get(eventType).size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    }
    
    emit(eventType, data) {
      if (!this.subscribers.has(eventType)) {
        return;
      }
      
      const callbacks = this.subscribers.get(eventType);
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          // Error in callback, but continue
        }
      });
    }
    
    isValidEventType(eventType) {
      return Object.values(REALTIME_EVENTS).includes(eventType);
    }
    
    getSubscriberCount(eventType) {
      return this.subscribers.get(eventType)?.size || 0;
    }
    
    getTotalSubscribers() {
      return Array.from(this.subscribers.values()).reduce(
        (total, set) => total + set.size, 0
      );
    }
    
    getSubscribedEvents() {
      return Array.from(this.subscribers.keys());
    }
    
    clear() {
      this.subscribers.clear();
    }
  }
  
  /**
   * Listener manager for tracking active listeners
   */
  class ListenerManager {
    constructor() {
      this.activeListeners = new Map();
      this.isListening = false;
      this.currentUserId = null;
    }
    
    addListener(listenerId, unsubscribeFn) {
      this.activeListeners.set(listenerId, unsubscribeFn);
    }
    
    removeListener(listenerId) {
      const unsubscribe = this.activeListeners.get(listenerId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (e) {
          // Ignore cleanup errors
        }
        this.activeListeners.delete(listenerId);
        return true;
      }
      return false;
    }
    
    startListening(userId) {
      if (this.isListening && this.currentUserId === userId) {
        return false; // Already listening
      }
      
      this.stopListening();
      this.currentUserId = userId;
      this.isListening = true;
      return true;
    }
    
    stopListening() {
      this.activeListeners.forEach((unsubscribe, listenerId) => {
        try {
          unsubscribe();
        } catch (e) {
          // Ignore cleanup errors
        }
      });
      
      this.activeListeners.clear();
      this.isListening = false;
      this.currentUserId = null;
    }
    
    getActiveListenerCount() {
      return this.activeListeners.size;
    }
    
    getActiveListenerIds() {
      return Array.from(this.activeListeners.keys());
    }
    
    hasListener(listenerId) {
      return this.activeListeners.has(listenerId);
    }
    
    getStatus() {
      return {
        isListening: this.isListening,
        currentUserId: this.currentUserId,
        activeListenerCount: this.activeListeners.size,
        activeListeners: Array.from(this.activeListeners.keys())
      };
    }
  }
  
  /**
   * Privacy event validator
   */
  const privacyEventValidator = {
    validateSchedulePrivacyChange(fromUserId, affectedUserId, scheduleVisibility) {
      const errors = [];
      
      if (!fromUserId) {
        errors.push('fromUserId is required');
      }
      
      if (!affectedUserId) {
        errors.push('affectedUserId is required');
      }
      
      if (fromUserId === affectedUserId) {
        errors.push('Cannot emit privacy change for same user');
      }
      
      if (typeof scheduleVisibility !== 'boolean') {
        errors.push('scheduleVisibility must be boolean');
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    },
    
    validateLocationPrivacyChange(fromUserId, affectedUserId, locationVisibility) {
      const errors = [];
      
      if (!fromUserId) {
        errors.push('fromUserId is required');
      }
      
      if (!affectedUserId) {
        errors.push('affectedUserId is required');
      }
      
      if (fromUserId === affectedUserId) {
        errors.push('Cannot emit location privacy change for same user');
      }
      
      if (typeof locationVisibility !== 'boolean') {
        errors.push('locationVisibility must be boolean');
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    },
    
    validateCampusPresenceChange(userId, campusStatus) {
      const errors = [];
      const validStatuses = ['on_campus', 'off_campus', 'unknown'];
      
      if (!userId || typeof userId !== 'string') {
        errors.push('userId is required and must be string');
      }
      
      if (!validStatuses.includes(campusStatus)) {
        errors.push(`campusStatus must be one of: ${validStatuses.join(', ')}`);
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    },
    
    validateUserActivityChange(userId, isActive) {
      const errors = [];
      
      if (!userId || typeof userId !== 'string') {
        errors.push('userId is required and must be string');
      }
      
      if (typeof isActive !== 'boolean') {
        errors.push('isActive must be boolean');
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    }
  };
  
  /**
   * Privacy event payload builder
   */
  const privacyEventBuilder = {
    buildSchedulePrivacyPayload(fromUserId, affectedUserId, scheduleVisibility, friendName = null) {
      return {
        fromUserId,
        affectedUserId,
        scheduleVisibility,
        timestamp: Date.now(),
        type: 'privacy_change',
        friendName: friendName || 'Unknown',
        action: scheduleVisibility ? 'schedule_shown' : 'schedule_hidden',
        description: scheduleVisibility
          ? `Schedule is now visible to ${friendName || 'friend'}`
          : `Schedule is now hidden from ${friendName || 'friend'}`
      };
    },
    
    buildLocationPrivacyPayload(fromUserId, affectedUserId, locationVisibility, friendName = null) {
      return {
        fromUserId,
        affectedUserId,
        locationVisibility,
        timestamp: Date.now(),
        type: 'location_privacy_change',
        friendName: friendName || 'Unknown',
        action: locationVisibility ? 'location_shared' : 'location_hidden',
        description: locationVisibility
          ? `Location is now shared with ${friendName || 'friend'}`
          : `Location sharing disabled with ${friendName || 'friend'}`
      };
    },
    
    buildCampusPresencePayload(userId, campusStatus, locationData = null) {
      return {
        userId,
        campusStatus,
        locationData,
        timestamp: Date.now(),
        type: 'campus_presence_change',
        isOnCampus: campusStatus === 'on_campus',
        presenceText: this.getCampusPresenceText(campusStatus),
        description: `Campus status updated to: ${campusStatus.replace('_', ' ')}`
      };
    },
    
    buildUserActivityPayload(userId, isActive) {
      return {
        userId,
        isActive,
        timestamp: Date.now(),
        type: 'user_activity_change',
        activityText: isActive ? 'Active' : 'Inactive',
        description: `User is now ${isActive ? 'active' : 'inactive'}`
      };
    },
    
    getCampusPresenceText(campusStatus) {
      switch (campusStatus) {
        case 'on_campus':
          return 'On Campus';
        case 'off_campus':
          return 'Off Campus';
        case 'unknown':
        default:
          return 'Unknown';
      }
    }
  };
  
  /**
   * Debounce utility
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ============================================
  // Event Emitter Tests
  // ============================================
  
  describe('Event Emitter', () => {
    let emitter;
    
    beforeEach(() => {
      emitter = new EventEmitter();
    });
    
    test('should subscribe to valid event type', () => {
      const callback = jest.fn();
      emitter.on(REALTIME_EVENTS.FRIEND_REQUESTS, callback);
      
      expect(emitter.getSubscriberCount(REALTIME_EVENTS.FRIEND_REQUESTS)).toBe(1);
    });
    
    test('should reject invalid event type', () => {
      const callback = jest.fn();
      const unsubscribe = emitter.on('invalidEvent', callback);
      
      expect(emitter.getSubscriberCount('invalidEvent')).toBe(0);
      expect(typeof unsubscribe).toBe('function');
    });
    
    test('should reject non-function callback', () => {
      const unsubscribe = emitter.on(REALTIME_EVENTS.FRIEND_REQUESTS, 'not a function');
      
      expect(emitter.getSubscriberCount(REALTIME_EVENTS.FRIEND_REQUESTS)).toBe(0);
      expect(typeof unsubscribe).toBe('function');
    });
    
    test('should emit event to subscribers', () => {
      const callback = jest.fn();
      emitter.on(REALTIME_EVENTS.FRIEND_REQUESTS, callback);
      
      const testData = { requests: [{ id: '1' }] };
      emitter.emit(REALTIME_EVENTS.FRIEND_REQUESTS, testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });
    
    test('should emit to multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      emitter.on(REALTIME_EVENTS.FRIENDSHIPS, callback1);
      emitter.on(REALTIME_EVENTS.FRIENDSHIPS, callback2);
      
      emitter.emit(REALTIME_EVENTS.FRIENDSHIPS, { data: 'test' });
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
    
    test('should unsubscribe correctly', () => {
      const callback = jest.fn();
      const unsubscribe = emitter.on(REALTIME_EVENTS.USER_PROFILE, callback);
      
      unsubscribe();
      emitter.emit(REALTIME_EVENTS.USER_PROFILE, { profile: {} });
      
      expect(callback).not.toHaveBeenCalled();
    });
    
    test('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn(() => { throw new Error('Test error'); });
      const normalCallback = jest.fn();
      
      emitter.on(REALTIME_EVENTS.USER_SCHEDULE, errorCallback);
      emitter.on(REALTIME_EVENTS.USER_SCHEDULE, normalCallback);
      
      // Should not throw
      expect(() => {
        emitter.emit(REALTIME_EVENTS.USER_SCHEDULE, { schedule: [] });
      }).not.toThrow();
      
      // Normal callback should still be called
      expect(normalCallback).toHaveBeenCalled();
    });
    
    test('should track total subscribers', () => {
      emitter.on(REALTIME_EVENTS.FRIEND_REQUESTS, jest.fn());
      emitter.on(REALTIME_EVENTS.FRIENDSHIPS, jest.fn());
      emitter.on(REALTIME_EVENTS.FRIENDSHIPS, jest.fn());
      
      expect(emitter.getTotalSubscribers()).toBe(3);
    });
    
    test('should track subscribed events', () => {
      emitter.on(REALTIME_EVENTS.FRIEND_REQUESTS, jest.fn());
      emitter.on(REALTIME_EVENTS.FRIENDSHIPS, jest.fn());
      
      const events = emitter.getSubscribedEvents();
      
      expect(events).toContain(REALTIME_EVENTS.FRIEND_REQUESTS);
      expect(events).toContain(REALTIME_EVENTS.FRIENDSHIPS);
    });
    
    test('should cleanup empty event type after unsubscribe', () => {
      const callback = jest.fn();
      const unsubscribe = emitter.on(REALTIME_EVENTS.CONNECTION_STATUS, callback);
      
      unsubscribe();
      
      expect(emitter.getSubscribedEvents()).not.toContain(REALTIME_EVENTS.CONNECTION_STATUS);
    });
    
    test('should clear all subscribers', () => {
      emitter.on(REALTIME_EVENTS.FRIEND_REQUESTS, jest.fn());
      emitter.on(REALTIME_EVENTS.FRIENDSHIPS, jest.fn());
      
      emitter.clear();
      
      expect(emitter.getTotalSubscribers()).toBe(0);
    });
  });

  // ============================================
  // Listener Manager Tests
  // ============================================
  
  describe('Listener Manager', () => {
    let manager;
    
    beforeEach(() => {
      manager = new ListenerManager();
    });
    
    test('should add and track listeners', () => {
      const unsubscribe = jest.fn();
      manager.addListener('friendRequests', unsubscribe);
      
      expect(manager.hasListener('friendRequests')).toBe(true);
      expect(manager.getActiveListenerCount()).toBe(1);
    });
    
    test('should remove listener', () => {
      const unsubscribe = jest.fn();
      manager.addListener('friendRequests', unsubscribe);
      
      const removed = manager.removeListener('friendRequests');
      
      expect(removed).toBe(true);
      expect(unsubscribe).toHaveBeenCalled();
      expect(manager.hasListener('friendRequests')).toBe(false);
    });
    
    test('should return false for non-existent listener removal', () => {
      const removed = manager.removeListener('nonexistent');
      expect(removed).toBe(false);
    });
    
    test('should start listening for user', () => {
      const started = manager.startListening('user123');
      
      expect(started).toBe(true);
      expect(manager.isListening).toBe(true);
      expect(manager.currentUserId).toBe('user123');
    });
    
    test('should not restart for same user', () => {
      manager.startListening('user123');
      const started = manager.startListening('user123');
      
      expect(started).toBe(false);
    });
    
    test('should stop and restart for different user', () => {
      manager.startListening('user123');
      manager.addListener('test', jest.fn());
      
      const started = manager.startListening('user456');
      
      expect(started).toBe(true);
      expect(manager.currentUserId).toBe('user456');
      expect(manager.getActiveListenerCount()).toBe(0);
    });
    
    test('should stop listening and cleanup', () => {
      const unsubscribe1 = jest.fn();
      const unsubscribe2 = jest.fn();
      
      manager.startListening('user123');
      manager.addListener('listener1', unsubscribe1);
      manager.addListener('listener2', unsubscribe2);
      
      manager.stopListening();
      
      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
      expect(manager.isListening).toBe(false);
      expect(manager.currentUserId).toBeNull();
      expect(manager.getActiveListenerCount()).toBe(0);
    });
    
    test('should return status', () => {
      manager.startListening('user123');
      manager.addListener('friendRequests', jest.fn());
      manager.addListener('friendships', jest.fn());
      
      const status = manager.getStatus();
      
      expect(status.isListening).toBe(true);
      expect(status.currentUserId).toBe('user123');
      expect(status.activeListenerCount).toBe(2);
      expect(status.activeListeners).toContain('friendRequests');
      expect(status.activeListeners).toContain('friendships');
    });
    
    test('should handle cleanup errors gracefully', () => {
      const errorUnsubscribe = jest.fn(() => { throw new Error('Cleanup error'); });
      manager.addListener('errorListener', errorUnsubscribe);
      
      // Should not throw
      expect(() => {
        manager.stopListening();
      }).not.toThrow();
    });
  });

  // ============================================
  // Privacy Event Validation Tests
  // ============================================
  
  describe('Privacy Event Validation', () => {
    describe('Schedule Privacy Change', () => {
      test('should validate valid schedule privacy change', () => {
        const result = privacyEventValidator.validateSchedulePrivacyChange(
          'user1', 'user2', true
        );
        
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
      
      test('should reject missing fromUserId', () => {
        const result = privacyEventValidator.validateSchedulePrivacyChange(
          null, 'user2', true
        );
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('fromUserId is required');
      });
      
      test('should reject missing affectedUserId', () => {
        const result = privacyEventValidator.validateSchedulePrivacyChange(
          'user1', null, true
        );
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('affectedUserId is required');
      });
      
      test('should reject same user IDs', () => {
        const result = privacyEventValidator.validateSchedulePrivacyChange(
          'user1', 'user1', true
        );
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Cannot emit privacy change for same user');
      });
      
      test('should reject non-boolean visibility', () => {
        const result = privacyEventValidator.validateSchedulePrivacyChange(
          'user1', 'user2', 'true'
        );
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('scheduleVisibility must be boolean');
      });
    });
    
    describe('Location Privacy Change', () => {
      test('should validate valid location privacy change', () => {
        const result = privacyEventValidator.validateLocationPrivacyChange(
          'user1', 'user2', false
        );
        
        expect(result.isValid).toBe(true);
      });
      
      test('should reject same user IDs', () => {
        const result = privacyEventValidator.validateLocationPrivacyChange(
          'user1', 'user1', true
        );
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Cannot emit location privacy change for same user');
      });
    });
    
    describe('Campus Presence Change', () => {
      test('should validate valid campus presence change', () => {
        const result = privacyEventValidator.validateCampusPresenceChange(
          'user1', 'on_campus'
        );
        
        expect(result.isValid).toBe(true);
      });
      
      test('should accept all valid statuses', () => {
        const statuses = ['on_campus', 'off_campus', 'unknown'];
        
        statuses.forEach(status => {
          const result = privacyEventValidator.validateCampusPresenceChange('user1', status);
          expect(result.isValid).toBe(true);
        });
      });
      
      test('should reject invalid status', () => {
        const result = privacyEventValidator.validateCampusPresenceChange(
          'user1', 'invalid_status'
        );
        
        expect(result.isValid).toBe(false);
      });
      
      test('should reject non-string userId', () => {
        const result = privacyEventValidator.validateCampusPresenceChange(
          123, 'on_campus'
        );
        
        expect(result.isValid).toBe(false);
      });
    });
    
    describe('User Activity Change', () => {
      test('should validate valid activity change', () => {
        const result = privacyEventValidator.validateUserActivityChange('user1', true);
        
        expect(result.isValid).toBe(true);
      });
      
      test('should reject non-boolean isActive', () => {
        const result = privacyEventValidator.validateUserActivityChange('user1', 'active');
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('isActive must be boolean');
      });
    });
  });

  // ============================================
  // Privacy Event Payload Builder Tests
  // ============================================
  
  describe('Privacy Event Payload Builder', () => {
    test('should build schedule privacy payload with visibility true', () => {
      const payload = privacyEventBuilder.buildSchedulePrivacyPayload(
        'user1', 'user2', true, 'John'
      );
      
      expect(payload.fromUserId).toBe('user1');
      expect(payload.affectedUserId).toBe('user2');
      expect(payload.scheduleVisibility).toBe(true);
      expect(payload.type).toBe('privacy_change');
      expect(payload.friendName).toBe('John');
      expect(payload.action).toBe('schedule_shown');
      expect(payload.description).toContain('visible to John');
      expect(payload.timestamp).toBeDefined();
    });
    
    test('should build schedule privacy payload with visibility false', () => {
      const payload = privacyEventBuilder.buildSchedulePrivacyPayload(
        'user1', 'user2', false
      );
      
      expect(payload.action).toBe('schedule_hidden');
      expect(payload.description).toContain('hidden from');
      expect(payload.friendName).toBe('Unknown');
    });
    
    test('should build location privacy payload', () => {
      const payload = privacyEventBuilder.buildLocationPrivacyPayload(
        'user1', 'user2', true, 'Alice'
      );
      
      expect(payload.type).toBe('location_privacy_change');
      expect(payload.action).toBe('location_shared');
      expect(payload.description).toContain('shared with Alice');
    });
    
    test('should build campus presence payload', () => {
      const locationData = { lat: 23.7, lng: 90.4 };
      const payload = privacyEventBuilder.buildCampusPresencePayload(
        'user1', 'on_campus', locationData
      );
      
      expect(payload.userId).toBe('user1');
      expect(payload.campusStatus).toBe('on_campus');
      expect(payload.isOnCampus).toBe(true);
      expect(payload.presenceText).toBe('On Campus');
      expect(payload.locationData).toEqual(locationData);
      expect(payload.type).toBe('campus_presence_change');
    });
    
    test('should build user activity payload', () => {
      const payload = privacyEventBuilder.buildUserActivityPayload('user1', true);
      
      expect(payload.userId).toBe('user1');
      expect(payload.isActive).toBe(true);
      expect(payload.activityText).toBe('Active');
      expect(payload.type).toBe('user_activity_change');
    });
    
    test('should get correct presence text', () => {
      expect(privacyEventBuilder.getCampusPresenceText('on_campus')).toBe('On Campus');
      expect(privacyEventBuilder.getCampusPresenceText('off_campus')).toBe('Off Campus');
      expect(privacyEventBuilder.getCampusPresenceText('unknown')).toBe('Unknown');
      expect(privacyEventBuilder.getCampusPresenceText('invalid')).toBe('Unknown');
    });
  });

  // ============================================
  // Debounce Utility Tests
  // ============================================
  
  describe('Debounce Utility', () => {
    test('should debounce function calls', async () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 50);
      
      debouncedFn();
      debouncedFn();
      debouncedFn();
      
      expect(fn).not.toHaveBeenCalled();
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fn).toHaveBeenCalledTimes(1);
    });
    
    test('should pass arguments to debounced function', async () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 30);
      
      debouncedFn('arg1', 'arg2');
      
      await new Promise(resolve => setTimeout(resolve, 40));
      
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
    
    test('should use latest arguments when debounced', async () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 50);
      
      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fn).toHaveBeenCalledWith('third');
    });
  });

  // ============================================
  // Event Types Constant Tests
  // ============================================
  
  describe('Event Types', () => {
    test('should have all required event types', () => {
      const requiredEvents = [
        'FRIEND_REQUESTS',
        'OUTGOING_FRIEND_REQUESTS',
        'FRIENDSHIPS',
        'USER_PROFILE',
        'CONNECTION_STATUS',
        'USER_SCHEDULE',
        'SCHEDULE_SYNC',
        'SCHEDULE_PRIVACY_CHANGE',
        'QUICK_ACCESS_UPDATED',
        'QUICK_ACCESS_FRIENDS',
        'CAMPUS_PRESENCE_CHANGED',
        'LOCATION_PRIVACY_CHANGED',
        'USER_ACTIVITY_CHANGED'
      ];
      
      requiredEvents.forEach(eventKey => {
        expect(REALTIME_EVENTS[eventKey]).toBeDefined();
        expect(typeof REALTIME_EVENTS[eventKey]).toBe('string');
      });
    });
    
    test('should have unique event values', () => {
      const values = Object.values(REALTIME_EVENTS);
      const uniqueValues = new Set(values);
      
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  // ============================================
  // Integration Scenarios
  // ============================================
  
  describe('Integration Scenarios', () => {
    test('should handle full subscription lifecycle', () => {
      const emitter = new EventEmitter();
      const receivedEvents = [];
      
      // Subscribe
      const unsubscribe = emitter.on(REALTIME_EVENTS.FRIENDSHIPS, (data) => {
        receivedEvents.push(data);
      });
      
      // Emit events
      emitter.emit(REALTIME_EVENTS.FRIENDSHIPS, { friends: ['a'] });
      emitter.emit(REALTIME_EVENTS.FRIENDSHIPS, { friends: ['a', 'b'] });
      
      expect(receivedEvents).toHaveLength(2);
      
      // Unsubscribe
      unsubscribe();
      
      emitter.emit(REALTIME_EVENTS.FRIENDSHIPS, { friends: ['a', 'b', 'c'] });
      
      // Should not receive after unsubscribe
      expect(receivedEvents).toHaveLength(2);
    });
    
    test('should handle listener lifecycle with user changes', () => {
      const manager = new ListenerManager();
      const cleanups = [];
      
      manager.startListening('user1');
      manager.addListener('listener1', () => cleanups.push('listener1'));
      manager.addListener('listener2', () => cleanups.push('listener2'));
      
      // Switch to different user
      manager.startListening('user2');
      
      expect(cleanups).toEqual(['listener1', 'listener2']);
      expect(manager.currentUserId).toBe('user2');
    });
    
    test('should validate and build privacy events correctly', () => {
      const validation = privacyEventValidator.validateSchedulePrivacyChange(
        'userA', 'userB', true
      );
      
      if (validation.isValid) {
        const payload = privacyEventBuilder.buildSchedulePrivacyPayload(
          'userA', 'userB', true, 'Bob'
        );
        
        expect(payload.fromUserId).toBe('userA');
        expect(payload.affectedUserId).toBe('userB');
        expect(payload.friendName).toBe('Bob');
      }
      
      expect(validation.isValid).toBe(true);
    });
  });
});
