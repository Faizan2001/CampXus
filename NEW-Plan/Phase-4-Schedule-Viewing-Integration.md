# Phase 4: Schedule Viewing Integration 📅

## Mission Overview 🎯

Welcome to Phase 4! This is where the Friends Bar comes alive with actual functionality. We're implementing the core feature that lets students view their friends' schedules instantly by clicking on their avatars in the horizontal bar.

**Duration**: 3-4 days  
**Difficulty**: Intermediate-Advanced 🔥🔥🔥🔥  
**Goal**: Make Friends Bar selections show actual schedules in the weekly grid

## What We're Building 🚀

By the end of this phase, your CampXus will have:

- **📅 Real Schedule Viewing**: Click friend avatars to see their actual schedules
- **🔄 Smooth Transitions**: Beautiful loading states and schedule switching
- **🛡️ Privacy Respect**: Handle private schedules and missing data gracefully
- **📱 Mobile Optimization**: Touch-friendly schedule viewing on all devices
- **⚡ Performance**: Fast schedule loading with smart caching
- **🎨 Visual Consistency**: Schedule grid updates maintain your glassmorphism design

## User Experience Flow 🎭

```
1. Student opens schedule page
   👤 [My Schedule] [Sarah] [Mike] [Alex] [Emma]
   
2. Clicks on Sarah's avatar
   👤 [My Schedule] [🟦Sarah🟦] [Mike] [Alex] [Emma]
   ⬇️ Loading animation appears
   
3. Sarah's schedule loads in grid below
   📅 Sarah's Weekly Schedule
   [Grid shows Sarah's classes with different colors]
   
4. Student can click any other friend for instant switch
   👤 [My Schedule] [Sarah] [🟦Mike🟦] [Alex] [Emma]
   📅 Mike's Weekly Schedule
   [Grid smoothly transitions to Mike's classes]
```

## Architecture Overview 🏗️

```
📅 Schedule Viewing System
├── 🗄️ Data Layer
│   ├── Friend Schedule Fetcher
│   ├── Schedule Cache Manager
│   └── Privacy & Permission Handler
├── 🎨 UI Layer  
│   ├── Schedule Grid Renderer
│   ├── Loading State Manager
│   └── Error State Handler
└── 🔄 Integration Layer
    ├── Friends Bar Connection
    ├── Transition Manager
    └── Performance Optimizer
```

---

## Mission 1: Friend Schedule Fetcher 📊

### Loading Friends' Schedules from Database

Let's create a system to fetch and manage friend schedules efficiently.

#### File: `src/js/core/schedule/friend-schedule-manager.js`

```javascript
// Friend Schedule Manager - Handles loading friends' schedules (Enhanced for CampXus)
import { enhancedDataManager } from '../../services/data/DataService.js'; // Phase 1 integration
import { getCurrentUser } from '../../core/currentUser.js';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config/firebase-config.js';

export class FriendScheduleManager {
  constructor() {
    this.scheduleCache = new Map(); // Cache loaded schedules
    this.loadingSchedules = new Set(); // Track what's currently loading
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes cache
    this.maxCacheSize = 20; // Maximum cached schedules
  }
  
  // Load a friend's schedule (integrates with Phase 1 enhanced data manager)
  async loadFriendSchedule(friendId, friendInfo = null) {
    console.log(`📅 Loading schedule for friend: ${friendId}`);
    
    // Check cache first
    const cachedSchedule = this.getCachedSchedule(friendId);
    if (cachedSchedule) {
      console.log(`🎯 Using cached schedule for ${friendId}`);
      return cachedSchedule;
    }
    
    // Prevent duplicate requests
    if (this.loadingSchedules.has(friendId)) {
      console.log(`⏳ Schedule already loading for ${friendId}`);
      return this.waitForLoad(friendId);
    }
    
    this.loadingSchedules.add(friendId);
    
    try {
      // Use Phase 1 enhanced data manager to load friend's schedule
      const currentUser = getCurrentUser();
      const result = await enhancedDataManager.loadUserSchedule(friendId, currentUser?.uid);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to load schedule',
          friendId: friendId,
          isEmpty: result.error === 'No data to migrate' || result.error === 'No schedule data found',
          isPrivate: result.error === 'Schedule is private'
        };
      }
      
      // Convert Phase 1 schedule data to display format
      const scheduleDisplayData = this.convertToDisplayFormat(result.scheduleData);
      
      // Process and cache the schedule
      const processedSchedule = {
        success: true,
        friendId: friendId,
        friendInfo: friendInfo,
        scheduleData: scheduleDisplayData,
        metadata: result.scheduleData.metadata || {},
        loadedAt: Date.now(),
        isEmpty: !scheduleDisplayData || scheduleDisplayData.length === 0,
        source: result.source || 'firestore'
      };
      
      // Cache the result
      this.cacheSchedule(friendId, processedSchedule);
      
      console.log(`✅ Loaded schedule for ${friendId}: ${processedSchedule.scheduleData.length} classes`);
      return processedSchedule;
      
    } catch (error) {
      console.error(`❌ Failed to load schedule for ${friendId}:`, error);
      return {
        success: false,
        error: 'Failed to load schedule',
        friendId: friendId
      };
    } finally {
      this.loadingSchedules.delete(friendId);
    }
  }
  
  // Load user's own schedule (integrates with Phase 1 and current HomePage.js system)
  async loadMySchedule() {
    console.log('📅 Loading my own schedule');
    
    // Check cache first
    const cachedSchedule = this.getCachedSchedule('my-schedule');
    if (cachedSchedule) {
      console.log('🎯 Using cached personal schedule');
      return cachedSchedule;
    }
    
    try {
      const currentUser = getCurrentUser();
      
      // Try Phase 1 enhanced data manager first
      const result = await enhancedDataManager.loadUserSchedule(currentUser?.uid);
      
      let scheduleDisplayData = [];
      let metadata = {};
      
      if (result.success && result.scheduleData) {
        // Convert Phase 1 format to display format
        scheduleDisplayData = this.convertToDisplayFormat(result.scheduleData);
        metadata = result.scheduleData.metadata || {};
      } else {
        // Fallback: Try current HomePage.js system
        const homePageData = this.loadFromHomePage();
        if (homePageData) {
          scheduleDisplayData = homePageData.scheduleData;
          metadata = homePageData.metadata;
        }
      }
      
      const processedSchedule = {
        success: true,
        friendId: 'my-schedule',
        friendInfo: { displayName: 'My Schedule', type: 'self' },
        scheduleData: scheduleDisplayData,
        metadata: metadata,
        loadedAt: Date.now(),
        isEmpty: !scheduleDisplayData || scheduleDisplayData.length === 0,
        source: result.success ? 'firestore' : 'localStorage'
      };
      
      // Cache personal schedule
      this.cacheSchedule('my-schedule', processedSchedule);
      
      console.log(`✅ Loaded personal schedule: ${processedSchedule.scheduleData.length} classes`);
      return processedSchedule;
      
    } catch (error) {
      console.error('❌ Failed to load personal schedule:', error);
      return {
        success: false,
        error: 'Failed to load your schedule',
        friendId: 'my-schedule'
      };
    }
  }
  
  // Cache management
  cacheSchedule(friendId, scheduleData) {
    // Implement LRU cache
    if (this.scheduleCache.size >= this.maxCacheSize) {
      const oldestKey = this.scheduleCache.keys().next().value;
      this.scheduleCache.delete(oldestKey);
    }
    
    this.scheduleCache.set(friendId, {
      ...scheduleData,
      cachedAt: Date.now()
    });
  }
  
  getCachedSchedule(friendId) {
    const cached = this.scheduleCache.get(friendId);
    
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.cachedAt > this.cacheExpiry) {
      this.scheduleCache.delete(friendId);
      return null;
    }
    
    return cached;
  }
  
  // Wait for ongoing load to complete
  async waitForLoad(friendId) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.loadingSchedules.has(friendId)) {
          clearInterval(checkInterval);
          resolve(this.getCachedSchedule(friendId));
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({
          success: false,
          error: 'Load timeout',
          friendId: friendId
        });
      }, 10000);
    });
  }
  
  // Invalidate cache for a specific friend
  invalidateCache(friendId) {
    this.scheduleCache.delete(friendId);
    console.log(`🗑️ Invalidated cache for ${friendId}`);
  }
  
  // Clear all cache
  clearCache() {
    this.scheduleCache.clear();
    console.log('🗑️ Cleared all schedule cache');
  }
  
  // Convert Phase 1 schedule data to display format
  convertToDisplayFormat(scheduleData) {
    if (!scheduleData || !scheduleData.schedule || !scheduleData.slotInfo || !scheduleData.timeSlots) {
      return [];
    }
    
    const displayData = [];
    const { schedule, slotInfo, timeSlots } = scheduleData;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Convert matrix format to display format
    for (let dayIndex = 0; dayIndex < schedule.length; dayIndex++) {
      for (let slotIndex = 0; slotIndex < schedule[dayIndex].length; slotIndex++) {
        if (schedule[dayIndex][slotIndex] && slotInfo[dayIndex][slotIndex]) {
          const slotData = slotInfo[dayIndex][slotIndex];
          const timeSlot = timeSlots[slotIndex];
          
          if (slotData.courseCode) {
            displayData.push({
              id: `${dayIndex}-${slotIndex}`,
              title: slotData.courseCode,
              courseCode: slotData.courseCode,
              location: slotData.classroomNumber,
              dayOfWeek: days[dayIndex],
              startTime: timeSlot.start,
              endTime: timeSlot.end,
              dayIndex: dayIndex,
              slotIndex: slotIndex
            });
          }
        }
      }
    }
    
    return displayData;
  }
  
  // Load from current HomePage.js system (fallback)
  loadFromHomePage() {
    try {
      // This integrates with your existing HomePage.js system
      if (window.getState && typeof window.getState === 'function') {
        const state = window.getState();
        const currentUser = state.users[state.activeUserId];
        
        if (currentUser && currentUser.schedule) {
          return {
            scheduleData: this.convertHomePageFormat(currentUser),
            metadata: {
              totalClasses: this.countClasses(currentUser.schedule),
              isEmpty: this.isScheduleEmpty(currentUser.schedule),
              source: 'homePage'
            }
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to load from HomePage:', error);
      return null;
    }
  }
  
  // Convert HomePage.js format to display format
  convertHomePageFormat(userData) {
    const displayData = [];
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    if (userData.schedule && userData.slotInfo && userData.timeSlots) {
      for (let dayIndex = 0; dayIndex < userData.schedule.length; dayIndex++) {
        for (let slotIndex = 0; slotIndex < userData.schedule[dayIndex].length; slotIndex++) {
          if (userData.schedule[dayIndex][slotIndex] && userData.slotInfo[dayIndex][slotIndex]) {
            const slotData = userData.slotInfo[dayIndex][slotIndex];
            const timeSlot = userData.timeSlots[slotIndex];
            
            if (slotData.courseCode) {
              displayData.push({
                id: `${dayIndex}-${slotIndex}`,
                title: slotData.courseCode,
                courseCode: slotData.courseCode,
                location: slotData.classroomNumber,
                dayOfWeek: days[dayIndex],
                startTime: timeSlot.start,
                endTime: timeSlot.end,
                dayIndex: dayIndex,
                slotIndex: slotIndex
              });
            }
          }
        }
      }
    }
    
    return displayData;
  }
  
  // Helper methods
  countClasses(schedule) {
    return schedule.reduce((total, day) => 
      total + day.filter(slot => slot === true).length, 0
    );
  }
  
  isScheduleEmpty(schedule) {
    return schedule.every(day => day.every(slot => slot === false));
  }
  
  // Get cache statistics
  getCacheStats() {
    return {
      size: this.scheduleCache.size,
      maxSize: this.maxCacheSize,
      keys: Array.from(this.scheduleCache.keys()),
      loadingCount: this.loadingSchedules.size
    };
  }
  
  // Preload schedules for Quick Access friends
  async preloadQuickAccessSchedules(quickAccessFriends) {
    console.log(`🚀 Preloading ${quickAccessFriends.length} Quick Access schedules...`);
    
    const preloadPromises = quickAccessFriends.map(async (friend) => {
      try {
        await this.loadFriendSchedule(friend.friendId, friend.friendInfo);
      } catch (error) {
        console.warn(`Failed to preload schedule for ${friend.friendId}`);
      }
    });
    
    await Promise.allSettled(preloadPromises);
    console.log('✅ Quick Access schedule preloading complete');
  }
}

// Create and export singleton
export const friendScheduleManager = new FriendScheduleManager();
```

---

## Mission 2: Schedule Grid Renderer 🎨

### Displaying Schedules in the Weekly Grid

Now let's create a system that renders different people's schedules in your existing grid.

#### File: `src/js/core/schedule/schedule-renderer.js`

```javascript
// Schedule Renderer - Displays schedules in the weekly grid
export class ScheduleRenderer {
  constructor() {
    this.currentSchedule = null;
    this.currentFriend = null;
    this.scheduleGrid = null;
    this.isRendering = false;
    
    // Color schemes for different people
    this.colorSchemes = {
      'my-schedule': {
        primary: '#4f46e5',
        secondary: '#7c3aed',
        background: 'rgba(79, 70, 229, 0.1)',
        border: 'rgba(79, 70, 229, 0.3)'
      },
      default: {
        primary: '#059669',
        secondary: '#0d9488', 
        background: 'rgba(5, 150, 105, 0.1)',
        border: 'rgba(5, 150, 105, 0.3)'
      }
    };
    
    this.init();
  }
  
  init() {
    this.scheduleGrid = document.querySelector('.schedule-grid, #schedule-grid, .weekly-schedule-grid');
    if (!this.scheduleGrid) {
      console.warn('Schedule grid not found');
    }
  }
  
  // Render a schedule in the grid
  async renderSchedule(scheduleResult, options = {}) {
    if (this.isRendering) {
      console.log('⏳ Render already in progress, skipping...');
      return;
    }
    
    this.isRendering = true;
    
    try {
      console.log(`🎨 Rendering schedule for: ${scheduleResult.friendId}`);
      
      // Update current schedule tracking
      this.currentSchedule = scheduleResult;
      this.currentFriend = scheduleResult.friendId;
      
      // Show loading state
      if (options.showLoading !== false) {
        this.showLoadingState();
      }
      
      // Handle different result states
      if (!scheduleResult.success) {
        this.renderError(scheduleResult);
        return;
      }
      
      if (scheduleResult.isEmpty) {
        this.renderEmptySchedule(scheduleResult);
        return;
      }
      
      // Render the actual schedule
      await this.renderScheduleGrid(scheduleResult);
      
      // Update title and metadata
      this.updateScheduleHeader(scheduleResult);
      
      console.log(`✅ Schedule rendered successfully for ${scheduleResult.friendId}`);
      
    } catch (error) {
      console.error('❌ Schedule rendering failed:', error);
      this.renderError({
        friendId: scheduleResult?.friendId || 'unknown',
        error: 'Failed to render schedule'
      });
    } finally {
      this.hideLoadingState();
      this.isRendering = false;
    }
  }
  
  // Render the actual schedule grid
  async renderScheduleGrid(scheduleResult) {
    if (!this.scheduleGrid) {
      console.error('Schedule grid not available');
      return;
    }
    
    const { scheduleData, friendId, friendInfo } = scheduleResult;
    
    // Get color scheme for this friend
    const colorScheme = this.getColorScheme(friendId);
    
    // Clear existing schedule items
    this.clearScheduleGrid();
    
    // Group schedule items by day
    const scheduleByDay = this.groupScheduleByDay(scheduleData);
    
    // Render each day's schedule
    Object.entries(scheduleByDay).forEach(([day, items]) => {
      this.renderDaySchedule(day, items, colorScheme);
    });
    
    // Add visual enhancements
    this.addScheduleEnhancements(friendId, colorScheme);
    
    // Trigger any necessary UI updates
    this.triggerUIUpdates();
  }
  
  // Group schedule items by day of week
  groupScheduleByDay(scheduleData) {
    const grouped = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    };
    
    scheduleData.forEach(item => {
      const day = item.dayOfWeek?.toLowerCase() || 'monday';
      if (grouped[day]) {
        grouped[day].push(item);
      }
    });
    
    return grouped;
  }
  
  // Render schedule for a specific day
  renderDaySchedule(day, items, colorScheme) {
    const dayColumn = this.getDayColumn(day);
    if (!dayColumn) return;
    
    // Clear existing items in this day
    const existingItems = dayColumn.querySelectorAll('.schedule-item');
    existingItems.forEach(item => item.remove());
    
    // Sort items by start time
    const sortedItems = items.sort((a, b) => {
      return this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime);
    });
    
    // Render each item
    sortedItems.forEach(item => {
      const scheduleElement = this.createScheduleElement(item, colorScheme);
      dayColumn.appendChild(scheduleElement);
    });
  }
  
  // Create individual schedule item element
  createScheduleElement(scheduleItem, colorScheme) {
    const element = document.createElement('div');
    element.className = 'schedule-item friend-schedule-item';
    element.dataset.scheduleId = scheduleItem.id;
    element.dataset.friendId = this.currentFriend;
    
    // Calculate position and size based on time
    const startMinutes = this.timeToMinutes(scheduleItem.startTime);
    const endMinutes = this.timeToMinutes(scheduleItem.endTime);
    const duration = endMinutes - startMinutes;
    
    // Position the element (adjust based on your grid structure)
    const top = ((startMinutes - 480) / 60) * 60; // Assuming 8 AM start (480 minutes)
    const height = (duration / 60) * 60; // Height in pixels
    
    element.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: 4px;
      right: 4px;
      height: ${height}px;
      background: ${colorScheme.background};
      border: 2px solid ${colorScheme.border};
      border-radius: 8px;
      padding: 8px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: all 0.2s ease;
      cursor: pointer;
      overflow: hidden;
    `;
    
    // Content
    element.innerHTML = `
      <div class="schedule-item-header">
        <div class="schedule-item-title">${scheduleItem.title || 'Untitled'}</div>
        ${scheduleItem.courseCode ? `<div class="schedule-item-code">${scheduleItem.courseCode}</div>` : ''}
      </div>
      <div class="schedule-item-details">
        <div class="schedule-item-time">${this.formatTimeRange(scheduleItem.startTime, scheduleItem.endTime)}</div>
        ${scheduleItem.location ? `<div class="schedule-item-location">📍 ${scheduleItem.location}</div>` : ''}
        ${scheduleItem.instructor ? `<div class="schedule-item-instructor">👤 ${scheduleItem.instructor}</div>` : ''}
      </div>
    `;
    
    // Add hover effects
    element.addEventListener('mouseenter', () => {
      element.style.transform = 'scale(1.02)';
      element.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
    });
    
    element.addEventListener('mouseleave', () => {
      element.style.transform = 'scale(1)';
      element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    });
    
    return element;
  }
  
  // Get day column element
  getDayColumn(day) {
    // This depends on your current schedule grid structure
    const daySelectors = {
      monday: '.monday-column, [data-day="monday"], .day-monday',
      tuesday: '.tuesday-column, [data-day="tuesday"], .day-tuesday',
      wednesday: '.wednesday-column, [data-day="wednesday"], .day-wednesday',
      thursday: '.thursday-column, [data-day="thursday"], .day-thursday',
      friday: '.friday-column, [data-day="friday"], .day-friday',
      saturday: '.saturday-column, [data-day="saturday"], .day-saturday',
      sunday: '.sunday-column, [data-day="sunday"], .day-sunday'
    };
    
    const selector = daySelectors[day];
    return selector ? document.querySelector(selector) : null;
  }
  
  // Get color scheme for a friend
  getColorScheme(friendId) {
    if (this.colorSchemes[friendId]) {
      return this.colorSchemes[friendId];
    }
    
    // Generate consistent color for friend based on their ID
    const colors = [
      { primary: '#059669', secondary: '#0d9488', background: 'rgba(5, 150, 105, 0.1)', border: 'rgba(5, 150, 105, 0.3)' },
      { primary: '#dc2626', secondary: '#ea580c', background: 'rgba(220, 38, 38, 0.1)', border: 'rgba(220, 38, 38, 0.3)' },
      { primary: '#7c2d12', secondary: '#92400e', background: 'rgba(124, 45, 18, 0.1)', border: 'rgba(124, 45, 18, 0.3)' },
      { primary: '#1e40af', secondary: '#1d4ed8', background: 'rgba(30, 64, 175, 0.1)', border: 'rgba(30, 64, 175, 0.3)' },
      { primary: '#7c3aed', secondary: '#8b5cf6', background: 'rgba(124, 58, 237, 0.1)', border: 'rgba(124, 58, 237, 0.3)' }
    ];
    
    const colorIndex = this.hashString(friendId) % colors.length;
    return colors[colorIndex];
  }
  
  // Simple hash function for consistent color assignment
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  // Time conversion utilities
  timeToMinutes(timeString) {
    if (!timeString) return 0;
    
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  formatTimeRange(startTime, endTime) {
    return `${this.formatTime(startTime)} - ${this.formatTime(endTime)}`;
  }
  
  formatTime(timeString) {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }
  
  // Clear schedule grid
  clearScheduleGrid() {
    if (!this.scheduleGrid) return;
    
    const scheduleItems = this.scheduleGrid.querySelectorAll('.schedule-item');
    scheduleItems.forEach(item => {
      item.style.opacity = '0';
      item.style.transform = 'scale(0.9)';
      setTimeout(() => item.remove(), 150);
    });
  }
  
  // Update schedule header/title
  updateScheduleHeader(scheduleResult) {
    const { friendInfo, scheduleData, friendId } = scheduleResult;
    
    // Update title
    const titleElement = document.querySelector('.schedule-title, .weekly-schedule h2, .schedule-header h3');
    if (titleElement) {
      if (friendId === 'my-schedule') {
        titleElement.textContent = '📅 My Weekly Schedule';
      } else {
        titleElement.textContent = `📅 ${friendInfo?.displayName || 'Friend'}'s Schedule`;
      }
    }
    
    // Update stats if element exists
    const statsElement = document.querySelector('.schedule-stats');
    if (statsElement) {
      const totalClasses = scheduleData.length;
      const totalCredits = scheduleData.reduce((sum, item) => sum + (item.credits || 0), 0);
      const uniqueDays = new Set(scheduleData.map(item => item.dayOfWeek)).size;
      
      statsElement.innerHTML = `
        <div class="stat-item">
          <span class="stat-number">${totalClasses}</span>
          <span class="stat-label">Classes</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${totalCredits}</span>
          <span class="stat-label">Credits</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${uniqueDays}</span>
          <span class="stat-label">Days</span>
        </div>
      `;
    }
  }
  
  // Show loading state
  showLoadingState() {
    if (!this.scheduleGrid) return;
    
    if (!document.getElementById('schedule-loading-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'schedule-loading-overlay';
      overlay.innerHTML = `
        <div class="schedule-loading-content">
          <div class="loading-spinner"></div>
          <p>Loading schedule...</p>
        </div>
      `;
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        z-index: 10;
        color: rgba(255, 255, 255, 0.8);
      `;
      
      this.scheduleGrid.style.position = 'relative';
      this.scheduleGrid.appendChild(overlay);
    }
  }
  
  // Hide loading state
  hideLoadingState() {
    const overlay = document.getElementById('schedule-loading-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    }
  }
  
  // Render error state
  renderError(scheduleResult) {
    if (!this.scheduleGrid) return;
    
    this.clearScheduleGrid();
    
    const errorElement = document.createElement('div');
    errorElement.className = 'schedule-error-state';
    errorElement.innerHTML = `
      <div class="error-icon">⚠️</div>
      <h3>Unable to Load Schedule</h3>
      <p>${scheduleResult.error}</p>
      <button onclick="location.reload()" class="retry-btn">Try Again</button>
    `;
    errorElement.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      color: rgba(255, 255, 255, 0.8);
      background: rgba(239, 68, 68, 0.1);
      border: 2px dashed rgba(239, 68, 68, 0.3);
      border-radius: 16px;
      margin: 20px;
    `;
    
    this.scheduleGrid.appendChild(errorElement);
  }
  
  // Render empty schedule state
  renderEmptySchedule(scheduleResult) {
    if (!this.scheduleGrid) return;
    
    this.clearScheduleGrid();
    
    const emptyElement = document.createElement('div');
    emptyElement.className = 'schedule-empty-state';
    
    const friendName = scheduleResult.friendInfo?.displayName || 'This person';
    const isMySchedule = scheduleResult.friendId === 'my-schedule';
    
    emptyElement.innerHTML = `
      <div class="empty-icon">📅</div>
      <h3>${isMySchedule ? 'No Classes Yet' : `${friendName} hasn't added classes yet`}</h3>
      <p>${isMySchedule ? 'Add your first class to get started!' : `${friendName} hasn't set up their schedule yet.`}</p>
      ${isMySchedule ? '<button onclick="openAddClassModal()" class="add-class-btn">Add Your First Class</button>' : ''}
    `;
    emptyElement.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      color: rgba(255, 255, 255, 0.7);
      background: rgba(255, 255, 255, 0.05);
      border: 2px dashed rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      margin: 20px;
    `;
    
    this.scheduleGrid.appendChild(emptyElement);
  }
  
  // Add visual enhancements
  addScheduleEnhancements(friendId, colorScheme) {
    // Add subtle background indication of whose schedule is showing
    if (this.scheduleGrid) {
      this.scheduleGrid.style.setProperty('--friend-primary-color', colorScheme.primary);
      this.scheduleGrid.style.setProperty('--friend-secondary-color', colorScheme.secondary);
      this.scheduleGrid.classList.add('showing-friend-schedule');
    }
  }
  
  // Trigger UI updates
  triggerUIUpdates() {
    // Dispatch event for other components to listen to
    document.dispatchEvent(new CustomEvent('scheduleRendered', {
      detail: {
        friendId: this.currentFriend,
        schedule: this.currentSchedule
      }
    }));
  }
  
  // Get current schedule info
  getCurrentScheduleInfo() {
    return {
      friendId: this.currentFriend,
      schedule: this.currentSchedule
    };
  }
}

// Create and export singleton
export const scheduleRenderer = new ScheduleRenderer();
```

---

## Mission 3: Integration Controller 🔄

### Connecting Friends Bar with Schedule Viewing

Now let's create the integration layer that connects friend selection to schedule viewing.

#### File: `src/js/core/schedule/schedule-view-controller.js`

```javascript
// Schedule View Controller - Coordinates Friends Bar and Schedule Display (Enhanced)
import { friendScheduleManager } from './friend-schedule-manager.js';
import { scheduleRenderer } from './schedule-renderer.js';
import { quickAccessManager } from '../../services/friends/QuickAccessService.js'; // Phase 2 unlimited system

export class ScheduleViewController {
  constructor() {
    this.currentlyViewingFriend = null;
    this.isInitialized = false;
    this.transitionInProgress = false;
    
    this.init();
  }
  
  async init() {
    if (this.isInitialized) return;
    
    console.log('🎮 Initializing Schedule View Controller...');
    
    try {
      // Set up event listeners
      this.setupEventListeners();
      
      // Preload Quick Access schedules for better performance
      await this.preloadQuickAccessSchedules();
      
      // Load initial schedule (user's own)
      await this.viewSchedule('my-schedule');
      
      this.isInitialized = true;
      console.log('✅ Schedule View Controller initialized');
      
    } catch (error) {
      console.error('❌ Schedule View Controller initialization failed:', error);
    }
  }
  
  // Set up event listeners
  setupEventListeners() {
    // Listen for friend selection from Friends Bar
    document.addEventListener('friendSelectedInBar', async (event) => {
      const { friendId, friendData } = event.detail;
      await this.viewSchedule(friendId, friendData);
    });
    
    // Listen for Quick Access changes to update preloaded schedules (unlimited system)
    quickAccessManager.addListener(async (event, data) => {
      if (event === 'friendAdded' || event === 'friendsReordered' || event === 'friendRemoved') {
        await this.preloadQuickAccessSchedules();
      }
    });
    
    // Listen for schedule updates (when user edits their own schedule)
    document.addEventListener('scheduleUpdated', (event) => {
      // Invalidate cache for my schedule
      friendScheduleManager.invalidateCache('my-schedule');
      
      // If currently viewing my schedule, refresh it
      if (this.currentlyViewingFriend === 'my-schedule') {
        this.viewSchedule('my-schedule');
      }
    });
  }
  
  // View a specific friend's schedule
  async viewSchedule(friendId, friendData = null) {
    if (this.transitionInProgress) {
      console.log('⏳ Transition in progress, skipping...');
      return;
    }
    
    if (this.currentlyViewingFriend === friendId) {
      console.log(`👀 Already viewing ${friendId}'s schedule`);
      return;
    }
    
    this.transitionInProgress = true;
    
    try {
      console.log(`👀 Viewing schedule for: ${friendId}`);
      
      // Update tracking
      this.currentlyViewingFriend = friendId;
      
      // Load the schedule
      let scheduleResult;
      
      if (friendId === 'my-schedule') {
        scheduleResult = await friendScheduleManager.loadMySchedule();
      } else {
        scheduleResult = await friendScheduleManager.loadFriendSchedule(friendId, friendData);
      }
      
      // Render the schedule
      await scheduleRenderer.renderSchedule(scheduleResult, {
        showLoading: true
      });
      
      // Update page metadata
      this.updatePageMetadata(scheduleResult);
      
      // Track usage analytics (optional)
      this.trackScheduleView(friendId, scheduleResult.success);
      
      console.log(`✅ Successfully viewing ${friendId}'s schedule`);
      
    } catch (error) {
      console.error(`❌ Failed to view schedule for ${friendId}:`, error);
      
      // Show error in the schedule grid
      await scheduleRenderer.renderSchedule({
        success: false,
        friendId: friendId,
        error: 'Failed to load schedule'
      });
      
    } finally {
      this.transitionInProgress = false;
    }
  }
  
  // Preload Quick Access schedules for better performance (unlimited system)
  async preloadQuickAccessSchedules() {
    try {
      const quickAccessFriends = await quickAccessManager.loadQuickAccessFriends();
      
      if (quickAccessFriends.length > 0) {
        console.log(`🚀 Preloading ${quickAccessFriends.length} Quick Access schedules (unlimited system)...`);
        await friendScheduleManager.preloadQuickAccessSchedules(quickAccessFriends);
      }
      
    } catch (error) {
      console.warn('⚠️ Failed to preload Quick Access schedules:', error);
    }
  }
  
  // Update page metadata
  updatePageMetadata(scheduleResult) {
    // Update page title
    if (scheduleResult.success && scheduleResult.friendInfo) {
      const friendName = scheduleResult.friendInfo.displayName || 'Friend';
      const isMySchedule = scheduleResult.friendId === 'my-schedule';
      
      document.title = isMySchedule 
        ? 'My Schedule - CampXus'
        : `${friendName}'s Schedule - CampXus`;
    }
    
    // Update meta description if it exists
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && scheduleResult.success) {
      const scheduleCount = scheduleResult.scheduleData?.length || 0;
      const friendName = scheduleResult.friendInfo?.displayName || 'Friend';
      const isMySchedule = scheduleResult.friendId === 'my-schedule';
      
      metaDescription.content = isMySchedule
        ? `My weekly class schedule with ${scheduleCount} classes`
        : `${friendName}'s weekly class schedule with ${scheduleCount} classes`;
    }
  }
  
  // Track schedule viewing for analytics (optional)
  trackScheduleView(friendId, success) {
    // This could integrate with your analytics system
    console.log(`📊 Schedule view: ${friendId}, success: ${success}`);
    
    // Example: Send to analytics service
    if (window.analytics && success) {
      window.analytics.track('Schedule Viewed', {
        friendId: friendId,
        isOwnSchedule: friendId === 'my-schedule',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Quick navigation methods
  async viewMySchedule() {
    await this.viewSchedule('my-schedule');
  }
  
  async viewFriendSchedule(friendId, friendData) {
    await this.viewSchedule(friendId, friendData);
  }
  
  // Get current viewing status
  getCurrentViewingInfo() {
    return {
      friendId: this.currentlyViewingFriend,
      isTransitioning: this.transitionInProgress,
      scheduleInfo: scheduleRenderer.getCurrentScheduleInfo()
    };
  }
  
  // Refresh current schedule
  async refreshCurrentSchedule() {
    if (!this.currentlyViewingFriend) return;
    
    // Invalidate cache
    friendScheduleManager.invalidateCache(this.currentlyViewingFriend);
    
    // Reload current schedule
    await this.viewSchedule(this.currentlyViewingFriend);
  }
  
  // Handle errors gracefully
  handleError(error, context = '') {
    console.error(`Schedule View Error ${context}:`, error);
    
    // Show user-friendly error message
    if (window.showNotification) {
      window.showNotification(
        'Unable to load schedule. Please try again.',
        'error'
      );
    }
  }
  
  // Performance monitoring
  getPerformanceStats() {
    return {
      cacheStats: friendScheduleManager.getCacheStats(),
      currentlyViewing: this.currentlyViewingFriend,
      isTransitioning: this.transitionInProgress,
      isInitialized: this.isInitialized
    };
  }
  
  // Cleanup method
  cleanup() {
    friendScheduleManager.clearCache();
    this.currentlyViewingFriend = null;
    this.isInitialized = false;
  }
}

// Create and export singleton
export const scheduleViewController = new ScheduleViewController();

// Auto-initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    scheduleViewController.init();
  });
} else {
  scheduleViewController.init();
}
```

---

## Mission 4: Enhanced CSS for Schedule Items 🎨

### Styling Friend Schedules with Visual Distinction

Let's add CSS to make friend schedules look beautiful and distinct from your own.

#### File: `src/css/friend-schedule-display.css`

```css
/* Friend Schedule Display Styles */

/* Enhanced schedule grid for friend viewing */
.schedule-grid.showing-friend-schedule {
  --friend-primary-color: #059669;
  --friend-secondary-color: #0d9488;
  position: relative;
}

.schedule-grid.showing-friend-schedule::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, 
    rgba(var(--friend-primary-color-rgb, 5, 150, 105), 0.02) 0%,
    rgba(var(--friend-secondary-color-rgb, 13, 148, 136), 0.02) 100%);
  border-radius: 16px;
  pointer-events: none;
  z-index: -1;
}

/* Friend schedule items */
.schedule-item.friend-schedule-item {
  position: relative;
  overflow: hidden;
}

.schedule-item.friend-schedule-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--friend-primary-color, #059669);
  border-radius: 0 2px 2px 0;
}

.schedule-item.friend-schedule-item:hover {
  transform: scale(1.02);
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

/* Schedule item content styling */
.schedule-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.schedule-item-title {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 2px;
}

.schedule-item-code {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.schedule-item-details {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.3;
}

.schedule-item-time {
  font-weight: 500;
  margin-bottom: 2px;
}

.schedule-item-location,
.schedule-item-instructor {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 1px;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Empty schedule state */
.schedule-empty-state {
  animation: fadeInUp 0.6s ease-out;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.7;
}

.schedule-empty-state h3 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.9);
}

.schedule-empty-state p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 20px;
  max-width: 400px;
  line-height: 1.5;
}

.add-class-btn {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

.add-class-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

/* Error state */
.schedule-error-state {
  animation: fadeInUp 0.6s ease-out;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
  color: #ef4444;
}

.schedule-error-state h3 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.9);
}

.schedule-error-state p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 20px;
  max-width: 400px;
}

.retry-btn {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  transform: translateY(-1px);
}

/* Loading overlay */
#schedule-loading-overlay {
  animation: fadeIn 0.3s ease-out;
}

#schedule-loading-overlay .schedule-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* Friend indicator badge on schedule */
.schedule-friend-indicator {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 8px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 5;
}

.schedule-friend-indicator .friend-avatar-mini {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Schedule transition effects */
.schedule-item {
  animation: scheduleItemAppear 0.4s ease-out forwards;
  opacity: 0;
}

.schedule-item:nth-child(1) { animation-delay: 0.1s; }
.schedule-item:nth-child(2) { animation-delay: 0.15s; }
.schedule-item:nth-child(3) { animation-delay: 0.2s; }
.schedule-item:nth-child(4) { animation-delay: 0.25s; }
.schedule-item:nth-child(5) { animation-delay: 0.3s; }

@keyframes scheduleItemAppear {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .schedule-item.friend-schedule-item {
    padding: 6px;
  }
  
  .schedule-item-title {
    font-size: 12px;
  }
  
  .schedule-item-code {
    font-size: 9px;
  }
  
  .schedule-item-details {
    font-size: 10px;
  }
  
  .schedule-empty-state,
  .schedule-error-state {
    margin: 10px;
    padding: 30px 15px;
  }
  
  .empty-icon,
  .error-icon {
    font-size: 36px;
  }
  
  .schedule-empty-state h3,
  .schedule-error-state h3 {
    font-size: 18px;
  }
}

/* Dark theme support */
.dark-theme .schedule-item.friend-schedule-item {
  background: rgba(31, 41, 55, 0.4);
  border-color: rgba(75, 85, 99, 0.5);
}

.dark-theme .schedule-empty-state,
.dark-theme .schedule-error-state {
  background: rgba(31, 41, 55, 0.2);
  border-color: rgba(75, 85, 99, 0.3);
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .schedule-item.friend-schedule-item {
    border-width: 3px;
    background: rgba(0, 0, 0, 0.3);
  }
  
  .schedule-item-title {
    color: #ffffff;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .schedule-item.friend-schedule-item,
  #schedule-loading-overlay,
  .schedule-empty-state,
  .schedule-error-state {
    animation: none;
  }
  
  .schedule-item.friend-schedule-item:hover {
    transform: none;
  }
}
```

---

## Mission 5: Testing Schedule Viewing 🧪

### Comprehensive Testing for Schedule Integration

#### Test Scenario 1: Basic Schedule Viewing

```javascript
// Test script for browser console
async function testScheduleViewing() {
  console.log('🧪 Testing Schedule Viewing Integration...');
  
  try {
    // Test 1: View my own schedule
    console.log('Test 1: Loading my schedule...');
    await scheduleViewController.viewMySchedule();
    
    // Test 2: Get Quick Access friends and try to view their schedules
    console.log('Test 2: Testing friend schedule viewing...');
    const quickAccessFriends = quickAccessManager.getQuickAccessFriends();
    
    if (quickAccessFriends.length > 0) {
      const firstFriend = quickAccessFriends[0];
      await scheduleViewController.viewFriendSchedule(
        firstFriend.friendId, 
        firstFriend.friendInfo
      );
      console.log('✅ Friend schedule viewing test passed');
    } else {
      console.log('⚠️ No Quick Access friends to test with');
    }
    
    // Test 3: Performance stats
    console.log('Test 3: Performance stats...');
    const stats = scheduleViewController.getPerformanceStats();
    console.log('Performance stats:', stats);
    
    // Test 4: Cache functionality
    console.log('Test 4: Testing cache...');
    const cacheStats = friendScheduleManager.getCacheStats();
    console.log('Cache stats:', cacheStats);
    
    console.log('✅ All schedule viewing tests completed');
    
  } catch (error) {
    console.error('❌ Schedule viewing tests failed:', error);
  }
}

// Run the test
testScheduleViewing();
```

#### Testing Checklist

**Core Functionality:**
- [ ] Clicking "My Schedule" shows user's own schedule (integrates with HomePage.js)
- [ ] Clicking friend avatars loads their schedules (unlimited Quick Access friends)
- [ ] **Phase 1 integration**: Loads schedules from Firestore with privacy controls
- [ ] **Privacy respect**: Shows "Schedule is private" for private schedules
- [ ] Schedule title updates to show selected friend
- [ ] Loading states appear during schedule transitions
- [ ] Empty schedules show appropriate messages
- [ ] Error states display helpful information

**Visual & UX:**
- [ ] Schedule items have distinct colors for different friends
- [ ] Smooth transitions between different schedules
- [ ] Mobile-responsive schedule viewing
- [ ] Touch interactions work on mobile devices
- [ ] Glassmorphism effects maintain consistency

**Performance:**
- [ ] Schedule caching reduces database calls
- [ ] **Unlimited Quick Access**: Preloads all starred friends' schedules
- [ ] **Phase 1 fallback**: Uses localStorage when Firestore unavailable
- [ ] No memory leaks during repeated viewing
- [ ] Smooth performance with unlimited friends

**Edge Cases:**
- [ ] Handles friends with no schedules gracefully
- [ ] Shows error when friend's schedule is private
- [ ] Works when offline (shows cached schedules)
- [ ] Handles network timeouts appropriately

---

## ✅ Phase 4 Completion Criteria

You've successfully completed Phase 4 when:

- [ ] Friends Bar selections actually load and display schedules
- [ ] "My Schedule" shows user's own classes correctly (HomePage.js integration)
- [ ] **Phase 1 integration**: Loads from Firestore with fallback to localStorage
- [ ] **Unlimited friends**: Can view any number of starred friends' schedules
- [ ] **Privacy controls**: Respects Phase 1 privacy settings (friends/no-one/public)
- [ ] Friend schedules display with distinct visual styling
- [ ] Loading states provide smooth user feedback
- [ ] Empty and error states are handled gracefully
- [ ] Schedule caching improves performance noticeably
- [ ] Mobile devices handle schedule viewing smoothly
- [ ] Schedule titles and metadata update correctly
- [ ] Multiple friend schedule switches work seamlessly

## 🎉 Incredible Achievement! 

Outstanding work! You've successfully implemented the core functionality that transforms CampXus from a static schedule app into a dynamic social platform. Students can now instantly view their friends' schedules with beautiful visual feedback!

**What You've Learned:**
- ✅ Advanced database integration with caching strategies
- ✅ Dynamic UI rendering with smooth state transitions
- ✅ Performance optimization with smart preloading
- ✅ Error handling and graceful degradation
- ✅ Mobile-first responsive schedule viewing
- ✅ Privacy-aware social feature implementation

## ⏭️ Ready for Phase 5: Intuitive Schedule Comparison! 🚀

Now let's implement the final piece - the ability to compare multiple friends' schedules simultaneously to find perfect meeting times. This replaces the old "Compare Schedules" button with something much more intuitive!

---

**Time Required**: 3-4 days  
**Difficulty**: Intermediate-Advanced 🔥🔥🔥🔥  
**Skills Learned**: Data integration, performance optimization, social features