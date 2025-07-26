# Phase 5: Intuitive Schedule Comparison 🔄

## 🎓 Learning Path Selection
**Choose your learning journey based on your experience level:**

### 🌱 Complete Beginner Path (New to Complex Interactions)
- **Time Needed**: 6-7 days
- **Focus**: Understanding multi-selection patterns, visual feedback, and algorithm basics
- **Start Here**: Read "Why Comparison Features Matter" section, then follow guided tutorials

### 🌿 Foundation Level Path (Know UI + Data Integration)  
- **Time Needed**: 4-5 days
- **Focus**: Advanced interaction patterns, algorithm implementation, and performance
- **Start Here**: Review comparison algorithms, then implement step-by-step

### 🌳 Advanced Path (Know Complex UI Patterns)
- **Time Needed**: 3-4 days  
- **Focus**: Optimization, edge cases, and production-ready comparison algorithms
- **Start Here**: Study system architecture, then implement with full testing

---

## 🤔 Why Comparison Features Matter (Industry Reality)

**The Coordination Problem**: Most social scheduling apps fail because they can't answer "When are we all free?"

**Industry Examples of Comparison Done Right**:
- **Google Calendar**: "Find a time" feature for meetings with multiple people
- **Calendly**: Group polling for finding optimal meeting times
- **When2meet**: Simple grid showing everyone's availability overlaps
- **Doodle**: Poll-based scheduling with availability visualization
- **Microsoft Outlook**: "Scheduling Assistant" for enterprise teams

**What You're Really Learning**:
- **Algorithm Design** - How Google Calendar finds optimal meeting times for teams
- **Data Visualization** - How financial apps show market overlap analysis  
- **Multi-Selection UX** - How photo apps let you select multiple images
- **Performance Optimization** - How Spotify compares millions of playlists instantly
- **Complex State Management** - How Discord handles voice channel user states

**Career Growth**: Comparison and algorithm features are the hardest to build right. Companies pay $160k+ for engineers who can design intuitive interfaces for complex data analysis. Master this, and you can work on any data-heavy product.

---

## Mission Overview 🎯

Welcome to Phase 5! This is where we replace that clunky "Compare Schedules" button with something truly intuitive. We're implementing multi-friend selection in the Friends Bar, allowing students to see overlapping schedules and find perfect meeting times instantly.

**Goal**: Enable intuitive multi-friend schedule comparison through visual selection

## What We're Building 🚀

By the end of this phase, your CampXus will have:

- **🎯 Multi-Selection Mode**: Tap/click multiple friends to select them simultaneously
- **🔍 Smart Overlap Detection**: Instantly see when everyone is free or busy
- **🎨 Color-Coded Visualization**: Green for free times, red for conflicts, orange for partial
- **📱 Touch-Friendly Interface**: Long-press or toggle selection on mobile
- **⚡ Real-Time Analysis**: Instant feedback as friends are selected/deselected
- **🧠 Intelligent Suggestions**: Highlight best meeting times automatically

## User Experience Flow 🎭

```
Step 1: Student wants to find meeting time with friends
👤 [My Schedule] [Sarah] [Mike] [Alex] [Emma]

Step 2: Taps to select multiple friends (visual indication)
👤 [🟦My Schedule🟦] [🟦Sarah🟦] [🟦Mike🟦] [Alex] [Emma]

Step 3: Schedule shows comparison view instantly
📅 Comparison: Me, Sarah & Mike
┌─────────────────────────────────────┐
│ MON  │🟢 Free │🔴 All Busy│🟠 Mixed│ 
│ TUE  │🟢 Free │🟢 Free   │🔴 Busy │
│ WED  │🟠 Mixed│🟢 Free   │🟢 Free │
└─────────────────────────────────────┘

Step 4: Suggestions appear
💡 Best meeting times: Tuesday 2-4 PM, Wednesday 3-5 PM
```

## Architecture Overview 🏗️

```
🔄 Schedule Comparison System
├── 🎯 Multi-Selection Manager
│   ├── Friend Selection Tracking
│   ├── Visual State Management
│   └── Touch Interaction Handler
├── 📊 Comparison Engine
│   ├── Schedule Overlap Calculator
│   ├── Conflict Detection Algorithm
│   └── Free Time Finder
└── 🎨 Visualization System
    ├── Color-Coded Grid Renderer
    ├── Suggestion Display
    └── Interactive Legend
```

---

## Mission 1: Multi-Selection Manager 🎯

### Enabling Multiple Friend Selection in the Friends Bar

Let's enhance the Friends Bar to support selecting multiple friends for comparison.

#### File: `src/js/components/friends-bar/multi-selection-manager.js`

```javascript
// Multi-Selection Manager - Handles selecting multiple friends for comparison
export class MultiSelectionManager {
  constructor(friendsBarInstance) {
    this.friendsBar = friendsBarInstance;
    this.selectedFriends = new Set(); // Track selected friend IDs
    this.isMultiSelectMode = false;
    this.maxSelections = 10; // Increased limit for unlimited Quick Access system
    
    // Touch handling for mobile
    this.touchStartTime = 0;
    this.longPressThreshold = 500; // 500ms for long press
    this.longPressTimer = null;
    
    this.init();
  }
  
  init() {
    console.log('🎯 Initializing Multi-Selection Manager...');
    this.setupEventListeners();
    this.createSelectionUI();
  }
  
  // Set up event listeners for multi-selection
  setupEventListeners() {
    const itemsContainer = document.getElementById('friends-bar-items');
    if (!itemsContainer) return;
    
    // Override the default click handler to support multi-selection
    itemsContainer.addEventListener('click', (e) => {
      const friendItem = e.target.closest('.friend-item');
      if (!friendItem) return;
      
      const friendId = friendItem.dataset.friendId;
      
      // Check for multi-select modifiers (Ctrl/Cmd on desktop)
      if (e.ctrlKey || e.metaKey || this.isMultiSelectMode) {
        e.preventDefault();
        this.toggleFriendSelection(friendId);
      } else {
        // If in multi-select mode but no modifier, exit multi-select
        if (this.isMultiSelectMode && this.selectedFriends.size > 1) {
          this.exitMultiSelectMode();
        }
        // Default single selection behavior handled by parent
      }
    });
    
    // Long press support for mobile multi-selection
    itemsContainer.addEventListener('touchstart', (e) => {
      const friendItem = e.target.closest('.friend-item');
      if (!friendItem) return;
      
      this.touchStartTime = Date.now();
      const friendId = friendItem.dataset.friendId;
      
      // Set up long press timer
      this.longPressTimer = setTimeout(() => {
        this.enterMultiSelectMode(friendId);
        
        // Provide haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, this.longPressThreshold);
    });
    
    itemsContainer.addEventListener('touchend', (e) => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      
      // If it was a short tap and we're in multi-select mode
      if (Date.now() - this.touchStartTime < this.longPressThreshold && this.isMultiSelectMode) {
        const friendItem = e.target.closest('.friend-item');
        if (friendItem) {
          e.preventDefault();
          const friendId = friendItem.dataset.friendId;
          this.toggleFriendSelection(friendId);
        }
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.friendsBar.isVisible()) return;
      
      switch (e.key) {
        case 'Escape':
          if (this.isMultiSelectMode) {
            e.preventDefault();
            this.exitMultiSelectMode();
          }
          break;
        case 'c':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.enterMultiSelectMode();
          }
          break;
      }
    });
  }
  
  // Create UI elements for multi-selection
  createSelectionUI() {
    const header = document.querySelector('.friends-bar-header');
    if (!header) return;
    
    // Add multi-select toggle button
    const multiSelectBtn = document.createElement('button');
    multiSelectBtn.id = 'multi-select-toggle';
    multiSelectBtn.className = 'multi-select-btn';
    multiSelectBtn.innerHTML = `
      <span class="multi-select-icon">🎯</span>
      <span class="multi-select-text">Compare</span>
    `;
    multiSelectBtn.title = 'Select multiple friends to compare schedules';
    multiSelectBtn.addEventListener('click', () => {
      if (this.isMultiSelectMode) {
        this.exitMultiSelectMode();
      } else {
        this.enterMultiSelectMode();
      }
    });
    
    // Add to controls
    const controls = header.querySelector('.friends-bar-controls');
    if (controls) {
      controls.insertBefore(multiSelectBtn, controls.firstChild);
    }
    
    // Add selection counter
    const selectionCounter = document.createElement('div');
    selectionCounter.id = 'selection-counter';
    selectionCounter.className = 'selection-counter hidden';
    selectionCounter.innerHTML = `
      <span class="counter-text">0 selected</span>
      <button class="clear-selection-btn" title="Clear selection">✕</button>
    `;
    
    selectionCounter.querySelector('.clear-selection-btn').addEventListener('click', () => {
      this.clearSelection();
    });
    
    header.appendChild(selectionCounter);
    
    // Add instructions overlay
    this.createInstructionsOverlay();
  }
  
  // Enter multi-selection mode
  enterMultiSelectMode(initialFriendId = null) {
    if (this.isMultiSelectMode) return;
    
    console.log('🎯 Entering multi-selection mode');
    this.isMultiSelectMode = true;
    
    // Update UI state
    document.body.classList.add('multi-select-mode');
    const toggleBtn = document.getElementById('multi-select-toggle');
    if (toggleBtn) {
      toggleBtn.classList.add('active');
      toggleBtn.querySelector('.multi-select-text').textContent = 'Exit';
    }
    
    // Show instructions
    this.showInstructions();
    
    // If an initial friend was provided, select them
    if (initialFriendId) {
      this.toggleFriendSelection(initialFriendId);
    }
    
    // Show selection counter
    this.updateSelectionCounter();
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('multiSelectModeEntered'));
  }
  
  // Exit multi-selection mode
  exitMultiSelectMode() {
    if (!this.isMultiSelectMode) return;
    
    console.log('🎯 Exiting multi-selection mode');
    this.isMultiSelectMode = false;
    
    // Clear all selections
    this.clearSelection();
    
    // Update UI state
    document.body.classList.remove('multi-select-mode');
    const toggleBtn = document.getElementById('multi-select-toggle');
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
      toggleBtn.querySelector('.multi-select-text').textContent = 'Compare';
    }
    
    // Hide UI elements
    this.hideInstructions();
    this.hideSelectionCounter();
    
    // Return to single selection mode
    this.friendsBar.selectFriend('my-schedule');
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('multiSelectModeExited'));
  }
  
  // Toggle friend selection
  toggleFriendSelection(friendId) {
    if (this.selectedFriends.has(friendId)) {
      this.deselectFriend(friendId);
    } else {
      this.selectFriend(friendId);
    }
  }
  
  // Select a friend for comparison
  selectFriend(friendId) {
    // Check selection limit
    if (this.selectedFriends.size >= this.maxSelections) {
      this.showSelectionLimitMessage();
      return;
    }
    
    this.selectedFriends.add(friendId);
    
    // Update visual state
    const friendItem = document.querySelector(`[data-friend-id="${friendId}"]`);
    if (friendItem) {
      friendItem.classList.add('multi-selected');
      
      // Add selection indicator
      if (!friendItem.querySelector('.selection-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'selection-indicator';
        indicator.innerHTML = '✓';
        friendItem.appendChild(indicator);
      }
    }
    
    console.log(`🎯 Selected friend: ${friendId}`);
    this.updateSelectionCounter();
    this.triggerComparison();
  }
  
  // Deselect a friend
  deselectFriend(friendId) {
    this.selectedFriends.delete(friendId);
    
    // Update visual state
    const friendItem = document.querySelector(`[data-friend-id="${friendId}"]`);
    if (friendItem) {
      friendItem.classList.remove('multi-selected');
      
      // Remove selection indicator
      const indicator = friendItem.querySelector('.selection-indicator');
      if (indicator) {
        indicator.remove();
      }
    }
    
    console.log(`🎯 Deselected friend: ${friendId}`);
    this.updateSelectionCounter();
    this.triggerComparison();
  }
  
  // Clear all selections
  clearSelection() {
    const selectedIds = Array.from(this.selectedFriends);
    selectedIds.forEach(friendId => {
      this.deselectFriend(friendId);
    });
    
    this.selectedFriends.clear();
    this.updateSelectionCounter();
  }
  
  // Update selection counter display
  updateSelectionCounter() {
    const counter = document.getElementById('selection-counter');
    if (!counter) return;
    
    const count = this.selectedFriends.size;
    const counterText = counter.querySelector('.counter-text');
    
    if (count > 0) {
      counter.classList.remove('hidden');
      counterText.textContent = `${count} selected`;
      
      if (count === 1) {
        counterText.textContent = '1 selected';
      } else {
        counterText.textContent = `${count} selected`;
      }
    } else {
      counter.classList.add('hidden');
    }
  }
  
  // Show selection counter
  showSelectionCounter() {
    const counter = document.getElementById('selection-counter');
    if (counter && this.selectedFriends.size > 0) {
      counter.classList.remove('hidden');
    }
  }
  
  // Hide selection counter
  hideSelectionCounter() {
    const counter = document.getElementById('selection-counter');
    if (counter) {
      counter.classList.add('hidden');
    }
  }
  
  // Trigger schedule comparison
  triggerComparison() {
    if (this.selectedFriends.size >= 2) {
      // Dispatch comparison event
      document.dispatchEvent(new CustomEvent('friendsSelectedForComparison', {
        detail: {
          selectedFriends: Array.from(this.selectedFriends),
          friendsData: this.getSelectedFriendsData()
        }
      }));
    } else if (this.selectedFriends.size === 1) {
      // Single friend selected - show their schedule
      const friendId = Array.from(this.selectedFriends)[0];
      document.dispatchEvent(new CustomEvent('friendSelectedInBar', {
        detail: {
          friendId: friendId,
          friendData: this.friendsBar.friendsData.find(f => f.id === friendId)
        }
      }));
    } else {
      // No friends selected - show default
      document.dispatchEvent(new CustomEvent('friendSelectedInBar', {
        detail: {
          friendId: 'my-schedule',
          friendData: { id: 'my-schedule', type: 'self' }
        }
      }));
    }
  }
  
  // Get data for selected friends
  getSelectedFriendsData() {
    return Array.from(this.selectedFriends).map(friendId => {
      return this.friendsBar.friendsData.find(f => f.id === friendId);
    }).filter(Boolean);
  }
  
  // Create instructions overlay
  createInstructionsOverlay() {
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.id = 'multi-select-instructions';
    instructionsOverlay.className = 'multi-select-instructions hidden';
    instructionsOverlay.innerHTML = `
      <div class="instructions-content">
        <h4>Select Multiple Friends</h4>
        <ul>
          <li><strong>Desktop:</strong> Hold Ctrl/Cmd + click friends</li>
          <li><strong>Mobile:</strong> Long press to start, then tap friends</li>
          <li><strong>Keyboard:</strong> Press Escape to exit</li>
        </ul>
        <p>Select 2+ friends to compare schedules and find meeting times!</p>
      </div>
    `;
    
    document.body.appendChild(instructionsOverlay);
  }
  
  // Show instructions
  showInstructions() {
    const instructions = document.getElementById('multi-select-instructions');
    if (instructions) {
      instructions.classList.remove('hidden');
      
      // Auto-hide after 4 seconds
      setTimeout(() => {
        this.hideInstructions();
      }, 4000);
    }
  }
  
  // Hide instructions
  hideInstructions() {
    const instructions = document.getElementById('multi-select-instructions');
    if (instructions) {
      instructions.classList.add('hidden');
    }
  }
  
  // Show selection limit message (enhanced for unlimited system)
  showSelectionLimitMessage() {
    if (window.showNotification) {
      window.showNotification(
        `Maximum ${this.maxSelections} friends can be compared at once for optimal performance`,
        'warning'
      );
    } else {
      console.warn(`Selection limit reached: ${this.maxSelections}`);
    }
  }
  
  // Public API
  getSelectedFriends() {
    return Array.from(this.selectedFriends);
  }
  
  isInMultiSelectMode() {
    return this.isMultiSelectMode;
  }
  
  getSelectionCount() {
    return this.selectedFriends.size;
  }
  
  // Cleanup
  cleanup() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    this.clearSelection();
  }
}

// Export for use with Friends Bar
export default MultiSelectionManager;
```

---

## Mission 2: Schedule Comparison Engine 📊

### Calculating Schedule Overlaps and Free Times

Now let's create the engine that analyzes multiple schedules to find conflicts and free times.

#### File: `src/js/core/schedule/comparison-engine.js`

```javascript
// Schedule Comparison Engine - Analyzes multiple schedules for overlaps and free times (Enhanced for Phase 1 integration)
import { enhancedDataManager } from '../../services/data/DataService.js'; // Phase 1 integration

export class ComparisonEngine {
  constructor() {
    this.timeSlotDuration = 30; // 30-minute time slots
    this.dayStartTime = '08:00'; // 8 AM
    this.dayEndTime = '22:00'; // 10 PM
    this.workingDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  }
  
  // Compare multiple schedules and generate analysis (enhanced for unlimited friends)
  async compareSchedules(friendsData, scheduleResults) {
    console.log(`📊 Comparing ${friendsData.length} schedules (unlimited Quick Access system)...`);
    
    try {
      // Validate inputs
      if (!friendsData || !scheduleResults || friendsData.length < 2) {
        throw new Error('At least 2 schedules required for comparison');
      }
      
      // Filter out failed schedule loads (respect privacy settings)
      const validScheduleResults = scheduleResults.filter(result => {
        if (!result.success) {
          console.warn(`Skipping ${result.friendId}: ${result.error}`);
          return false;
        }
        return true;
      });
      
      if (validScheduleResults.length < 2) {
        throw new Error('Not enough accessible schedules for comparison (check privacy settings)');
      }
      
      // Process schedules into time grids
      const scheduleGrids = this.processSchedulesToGrids(validScheduleResults);
      
      // Calculate overlaps and free times
      const comparison = this.calculateComparison(scheduleGrids, friendsData);
      
      // Find suggested meeting times
      const suggestions = this.findMeetingTimeSuggestions(comparison);
      
      // Generate comparison result
      const result = {
        success: true,
        friends: friendsData,
        validFriends: validScheduleResults.length,
        skippedFriends: friendsData.length - validScheduleResults.length,
        comparison: comparison,
        suggestions: suggestions,
        totalFriends: friendsData.length,
        analyzedAt: new Date().toISOString()
      };
      
      console.log(`✅ Schedule comparison complete: ${suggestions.length} suggestions found (${validScheduleResults.length}/${friendsData.length} friends accessible)`);
      return result;
      
    } catch (error) {
      console.error('❌ Schedule comparison failed:', error);
      return {
        success: false,
        error: error.message,
        friends: friendsData
      };
    }
  }
  
  // Process schedule data into time grids for easy comparison
  processSchedulesToGrids(scheduleResults) {
    const grids = {};
    
    scheduleResults.forEach((result, index) => {
      if (!result.success || !result.scheduleData) {
        console.warn(`Skipping invalid schedule for friend ${result.friendId}`);
        return;
      }
      
      const grid = this.createTimeGrid();
      
      // Mark busy times in the grid
      result.scheduleData.forEach(classItem => {
        this.markClassInGrid(grid, classItem);
      });
      
      grids[result.friendId] = {
        grid: grid,
        scheduleData: result.scheduleData,
        friendInfo: result.friendInfo
      };
    });
    
    return grids;
  }
  
  // Create empty time grid for a week
  createTimeGrid() {
    const grid = {};
    
    this.workingDays.forEach(day => {
      grid[day] = {};
      
      // Create 30-minute time slots from 8 AM to 10 PM
      const startMinutes = this.timeToMinutes(this.dayStartTime);
      const endMinutes = this.timeToMinutes(this.dayEndTime);
      
      for (let minutes = startMinutes; minutes < endMinutes; minutes += this.timeSlotDuration) {
        const timeSlot = this.minutesToTime(minutes);
        grid[day][timeSlot] = false; // false = free, true = busy
      }
    });
    
    return grid;
  }
  
  // Mark a class as busy in the time grid
  markClassInGrid(grid, classItem) {
    const day = classItem.dayOfWeek.toLowerCase();
    if (!grid[day]) return;
    
    const startMinutes = this.timeToMinutes(classItem.startTime);
    const endMinutes = this.timeToMinutes(classItem.endTime);
    
    // Mark all time slots during this class as busy
    for (let minutes = startMinutes; minutes < endMinutes; minutes += this.timeSlotDuration) {
      const timeSlot = this.minutesToTime(minutes);
      if (grid[day][timeSlot] !== undefined) {
        grid[day][timeSlot] = true; // Mark as busy
      }
    }
  }
  
  // Calculate comparison analysis
  calculateComparison(scheduleGrids, friendsData) {
    const comparison = {
      days: {},
      overalStats: {
        totalTimeSlots: 0,
        freeTimeSlots: 0,
        busyTimeSlots: 0,
        partialTimeSlots: 0
      }
    };
    
    const friendIds = Object.keys(scheduleGrids);
    const totalFriends = friendIds.length;
    
    // Analyze each day
    this.workingDays.forEach(day => {
      comparison.days[day] = {
        timeSlots: {},
        stats: {
          free: 0,
          busy: 0,
          partial: 0
        }
      };
      
      // Get all time slots for this day
      const firstFriendGrid = scheduleGrids[friendIds[0]];
      if (!firstFriendGrid || !firstFriendGrid.grid[day]) return;
      
      const timeSlots = Object.keys(firstFriendGrid.grid[day]);
      
      // Analyze each time slot
      timeSlots.forEach(timeSlot => {
        let busyCount = 0;
        let friendStatuses = {};
        
        // Count how many friends are busy at this time
        friendIds.forEach(friendId => {
          const friendGrid = scheduleGrids[friendId];
          const isBusy = friendGrid.grid[day][timeSlot];
          
          friendStatuses[friendId] = isBusy;
          if (isBusy) busyCount++;
        });
        
        // Determine the overall status for this time slot
        let status;
        if (busyCount === 0) {
          status = 'free'; // Everyone is free
          comparison.days[day].stats.free++;
          comparison.overalStats.freeTimeSlots++;
        } else if (busyCount === totalFriends) {
          status = 'busy'; // Everyone is busy
          comparison.days[day].stats.busy++;
          comparison.overalStats.busyTimeSlots++;
        } else {
          status = 'partial'; // Some free, some busy
          comparison.days[day].stats.partial++;
          comparison.overalStats.partialTimeSlots++;
        }
        
        comparison.days[day].timeSlots[timeSlot] = {
          status: status,
          busyCount: busyCount,
          freeCount: totalFriends - busyCount,
          friendStatuses: friendStatuses
        };
        
        comparison.overalStats.totalTimeSlots++;
      });
    });
    
    return comparison;
  }
  
  // Find suggested meeting times
  findMeetingTimeSuggestions(comparison) {
    const suggestions = [];
    
    // Look for consecutive free time slots
    this.workingDays.forEach(day => {
      const dayComparison = comparison.days[day];
      if (!dayComparison) return;
      
      const timeSlots = Object.keys(dayComparison.timeSlots).sort();
      let currentFreeBlock = null;
      
      timeSlots.forEach(timeSlot => {
        const slotInfo = dayComparison.timeSlots[timeSlot];
        
        if (slotInfo.status === 'free') {
          if (!currentFreeBlock) {
            // Start new free block
            currentFreeBlock = {
              day: day,
              startTime: timeSlot,
              endTime: this.addMinutesToTime(timeSlot, this.timeSlotDuration),
              duration: this.timeSlotDuration,
              participants: slotInfo.freeCount
            };
          } else {
            // Extend current free block
            currentFreeBlock.endTime = this.addMinutesToTime(timeSlot, this.timeSlotDuration);
            currentFreeBlock.duration += this.timeSlotDuration;
          }
        } else {
          // End current free block if it exists
          if (currentFreeBlock && currentFreeBlock.duration >= 60) { // At least 1 hour
            suggestions.push(currentFreeBlock);
          }
          currentFreeBlock = null;
        }
      });
      
      // Add final free block if it exists
      if (currentFreeBlock && currentFreeBlock.duration >= 60) {
        suggestions.push(currentFreeBlock);
      }
    });
    
    // Sort suggestions by duration (longest first) and then by day
    suggestions.sort((a, b) => {
      if (a.duration !== b.duration) {
        return b.duration - a.duration;
      }
      return this.workingDays.indexOf(a.day) - this.workingDays.indexOf(b.day);
    });
    
    // Limit to top 10 suggestions
    return suggestions.slice(0, 10);
  }
  
  // Utility functions
  timeToMinutes(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  addMinutesToTime(timeString, additionalMinutes) {
    const totalMinutes = this.timeToMinutes(timeString) + additionalMinutes;
    return this.minutesToTime(totalMinutes);
  }
  
  formatDayName(day) {
    const dayNames = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday'
    };
    return dayNames[day] || day;
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
  
  formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
      return `${remainingMinutes} min`;
    } else if (remainingMinutes === 0) {
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    } else {
      return `${hours}h ${remainingMinutes}m`;
    }
  }
}

// Create and export singleton
export const comparisonEngine = new ComparisonEngine();
```

---

## Mission 3: Comparison Visualization 🎨

### Displaying Schedule Comparisons with Color-Coded Overlaps

Let's create a beautiful comparison renderer that shows overlaps visually.

#### File: `src/js/core/schedule/comparison-renderer.js`

```javascript
// Comparison Renderer - Visualizes schedule comparisons with color-coded overlaps (Enhanced)
import { comparisonEngine } from './comparison-engine.js';
import { friendScheduleManager } from './friend-schedule-manager.js'; // Phase 4 integration

export class ComparisonRenderer {
  constructor() {
    this.scheduleGrid = null;
    this.currentComparison = null;
    this.isRendering = false;
    
    // Color scheme for comparison states
    this.colors = {
      free: {
        background: 'rgba(34, 197, 94, 0.2)',
        border: 'rgba(34, 197, 94, 0.4)',
        text: 'rgba(255, 255, 255, 0.9)',
        indicator: '🟢'
      },
      busy: {
        background: 'rgba(239, 68, 68, 0.2)',
        border: 'rgba(239, 68, 68, 0.4)', 
        text: 'rgba(255, 255, 255, 0.9)',
        indicator: '🔴'
      },
      partial: {
        background: 'rgba(245, 158, 11, 0.2)',
        border: 'rgba(245, 158, 11, 0.4)',
        text: 'rgba(255, 255, 255, 0.9)',
        indicator: '🟠'
      }
    };
    
    this.init();
  }
  
  init() {
    this.scheduleGrid = document.querySelector('.schedule-grid, #schedule-grid, .weekly-schedule-grid');
    if (!this.scheduleGrid) {
      console.warn('Schedule grid not found for comparison rendering');
    }
  }
  
  // Render schedule comparison
  async renderComparison(comparisonResult) {
    if (this.isRendering) {
      console.log('⏳ Comparison render already in progress');
      return;
    }
    
    this.isRendering = true;
    
    try {
      console.log(`🎨 Rendering comparison for ${comparisonResult.friends.length} friends`);
      
      // Store current comparison
      this.currentComparison = comparisonResult;
      
      // Show loading state
      this.showLoadingState();
      
      if (!comparisonResult.success) {
        this.renderComparisonError(comparisonResult);
        return;
      }
      
      // Clear existing schedule
      this.clearScheduleGrid();
      
      // Render comparison grid
      await this.renderComparisonGrid(comparisonResult);
      
      // Update header
      this.updateComparisonHeader(comparisonResult);
      
      // Show suggestions
      this.renderSuggestions(comparisonResult.suggestions);
      
      // Add legend
      this.addComparisonLegend();
      
      console.log('✅ Comparison rendered successfully');
      
    } catch (error) {
      console.error('❌ Comparison rendering failed:', error);
      this.renderComparisonError({
        error: 'Failed to render comparison',
        friends: comparisonResult.friends
      });
    } finally {
      this.hideLoadingState();
      this.isRendering = false;
    }
  }
  
  // Render the comparison grid
  async renderComparisonGrid(comparisonResult) {
    const { comparison, friends } = comparisonResult;
    
    // Render each day's comparison
    Object.entries(comparison.days).forEach(([day, dayComparison]) => {
      this.renderDayComparison(day, dayComparison, friends);
    });
    
    // Add visual enhancements
    this.addComparisonEnhancements();
  }
  
  // Render comparison for a specific day
  renderDayComparison(day, dayComparison, friends) {
    const dayColumn = this.getDayColumn(day);
    if (!dayColumn) return;
    
    // Clear existing items
    const existingItems = dayColumn.querySelectorAll('.schedule-item, .comparison-slot');
    existingItems.forEach(item => item.remove());
    
    // Group consecutive time slots with same status
    const slotGroups = this.groupConsecutiveSlots(dayComparison.timeSlots);
    
    // Render each group
    slotGroups.forEach(group => {
      const comparisonElement = this.createComparisonElement(group, friends, day);
      dayColumn.appendChild(comparisonElement);
    });
  }
  
  // Group consecutive time slots with the same status
  groupConsecutiveSlots(timeSlots) {
    const sortedSlots = Object.entries(timeSlots).sort((a, b) => {
      return comparisonEngine.timeToMinutes(a[0]) - comparisonEngine.timeToMinutes(b[0]);
    });
    
    const groups = [];
    let currentGroup = null;
    
    sortedSlots.forEach(([timeSlot, slotInfo]) => {
      if (!currentGroup || currentGroup.status !== slotInfo.status) {
        // Start new group
        currentGroup = {
          status: slotInfo.status,
          startTime: timeSlot,
          endTime: comparisonEngine.addMinutesToTime(timeSlot, comparisonEngine.timeSlotDuration),
          slots: [{ time: timeSlot, info: slotInfo }],
          busyCount: slotInfo.busyCount,
          freeCount: slotInfo.freeCount
        };
        groups.push(currentGroup);
      } else {
        // Extend current group
        currentGroup.endTime = comparisonEngine.addMinutesToTime(timeSlot, comparisonEngine.timeSlotDuration);
        currentGroup.slots.push({ time: timeSlot, info: slotInfo });
      }
    });
    
    return groups;
  }
  
  // Create comparison element for a time slot group
  createComparisonElement(group, friends, day) {
    const element = document.createElement('div');
    element.className = `comparison-slot comparison-${group.status}`;
    element.dataset.day = day;
    element.dataset.status = group.status;
    
    // Calculate position and size
    const startMinutes = comparisonEngine.timeToMinutes(group.startTime);
    const endMinutes = comparisonEngine.timeToMinutes(group.endTime);
    const duration = endMinutes - startMinutes;
    
    const top = ((startMinutes - 480) / 60) * 60; // Assuming 8 AM start
    const height = (duration / 60) * 60;
    
    // Get color scheme for this status
    const colorScheme = this.colors[group.status];
    
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
      color: ${colorScheme.text};
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: all 0.2s ease;
      cursor: pointer;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
    `;
    
    // Content based on status
    const content = this.generateComparisonContent(group, friends);
    element.innerHTML = content;
    
    // Add hover effects
    element.addEventListener('mouseenter', () => {
      element.style.transform = 'scale(1.02)';
      element.style.zIndex = '10';
      this.showComparisonTooltip(element, group, friends);
    });
    
    element.addEventListener('mouseleave', () => {
      element.style.transform = 'scale(1)';
      element.style.zIndex = '1';
      this.hideComparisonTooltip();
    });
    
    // Click to show details
    element.addEventListener('click', () => {
      this.showComparisonDetails(group, friends, day);
    });
    
    return element;
  }
  
  // Generate content for comparison element
  generateComparisonContent(group, friends) {
    const { status, startTime, endTime, busyCount, freeCount } = group;
    const colorScheme = this.colors[status];
    const timeRange = comparisonEngine.formatTimeRange(startTime, endTime);
    
    let statusText = '';
    let description = '';
    
    switch (status) {
      case 'free':
        statusText = 'Everyone Free';
        description = 'Perfect meeting time!';
        break;
      case 'busy':
        statusText = 'Everyone Busy';
        description = 'No availability';
        break;
      case 'partial':
        statusText = `${freeCount} Available`;
        description = `${busyCount} busy`;
        break;
    }
    
    return `
      <div class="comparison-header">
        <span class="status-indicator">${colorScheme.indicator}</span>
        <span class="status-text">${statusText}</span>
      </div>
      <div class="time-range">${timeRange}</div>
      <div class="comparison-description">${description}</div>
    `;
  }
  
  // Show detailed tooltip on hover
  showComparisonTooltip(element, group, friends) {
    // Remove existing tooltip
    this.hideComparisonTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'comparison-tooltip';
    tooltip.innerHTML = this.generateTooltipContent(group, friends);
    
    // Position tooltip
    const rect = element.getBoundingClientRect();
    tooltip.style.cssText = `
      position: absolute;
      top: ${rect.top - 10}px;
      left: ${rect.right + 10}px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 1000;
      max-width: 200px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
    `;
    
    document.body.appendChild(tooltip);
  }
  
  // Generate tooltip content
  generateTooltipContent(group, friends) {
    const { slots, status } = group;
    const firstSlot = slots[0];
    
    let content = `<div class="tooltip-header"><strong>${comparisonEngine.formatTimeRange(group.startTime, group.endTime)}</strong></div>`;
    
    // Show friend statuses
    content += '<div class="friend-statuses">';
    friends.forEach(friend => {
      const friendId = friend.id;
      const isBusy = firstSlot.info.friendStatuses[friendId];
      const statusIcon = isBusy ? '🔴' : '🟢';
      const statusText = isBusy ? 'Busy' : 'Free';
      
      content += `
        <div class="friend-status">
          ${statusIcon} ${friend.displayName || friend.shortName}: ${statusText}
        </div>
      `;
    });
    content += '</div>';
    
    return content;
  }
  
  // Hide comparison tooltip
  hideComparisonTooltip() {
    const existingTooltip = document.querySelector('.comparison-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }
  }
  
  // Show detailed comparison modal
  showComparisonDetails(group, friends, day) {
    const modal = document.createElement('div');
    modal.className = 'comparison-details-modal';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>${comparisonEngine.formatDayName(day)} - ${comparisonEngine.formatTimeRange(group.startTime, group.endTime)}</h3>
          <button class="modal-close" onclick="this.closest('.comparison-details-modal').remove()">✕</button>
        </div>
        <div class="modal-body">
          ${this.generateDetailsContent(group, friends)}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
  
  // Generate details modal content
  generateDetailsContent(group, friends) {
    let content = '<div class="friends-availability">';
    
    friends.forEach(friend => {
      const friendId = friend.id;
      const isBusy = group.slots[0].info.friendStatuses[friendId];
      const statusClass = isBusy ? 'busy' : 'free';
      const statusText = isBusy ? 'Busy' : 'Available';
      const statusIcon = isBusy ? '🔴' : '🟢';
      
      content += `
        <div class="friend-availability ${statusClass}">
          <div class="friend-info">
            <span class="friend-name">${friend.displayName || friend.shortName}</span>
            <span class="friend-major">${friend.major || ''}</span>
          </div>
          <div class="availability-status">
            ${statusIcon} ${statusText}
          </div>
        </div>
      `;
    });
    
    content += '</div>';
    
    if (group.status === 'free') {
      content += `
        <div class="meeting-suggestion">
          <h4>💡 Perfect Meeting Time!</h4>
          <p>All ${friends.length} friends are available during this time. This would be ideal for:</p>
          <ul>
            <li>Group study sessions</li>
            <li>Project meetings</li>
            <li>Social hangouts</li>
          </ul>
        </div>
      `;
    }
    
    return content;
  }
  
  // Render meeting time suggestions
  renderSuggestions(suggestions) {
    // Find or create suggestions container
    let suggestionsContainer = document.getElementById('meeting-suggestions');
    
    if (!suggestionsContainer) {
      suggestionsContainer = document.createElement('div');
      suggestionsContainer.id = 'meeting-suggestions';
      suggestionsContainer.className = 'meeting-suggestions';
      
      // Insert after schedule grid
      const scheduleContainer = this.scheduleGrid.parentElement;
      scheduleContainer.appendChild(suggestionsContainer);
    }
    
    if (suggestions.length === 0) {
      suggestionsContainer.innerHTML = `
        <div class="no-suggestions">
          <h3>🤔 No Perfect Meeting Times Found</h3>
          <p>Try selecting different friends or look for partial availability times above.</p>
        </div>
      `;
      return;
    }
    
    // Render suggestions
    const suggestionsHTML = suggestions.map((suggestion, index) => `
      <div class="suggestion-item" data-suggestion-index="${index}">
        <div class="suggestion-header">
          <span class="suggestion-day">${comparisonEngine.formatDayName(suggestion.day)}</span>
          <span class="suggestion-time">${comparisonEngine.formatTimeRange(suggestion.startTime, suggestion.endTime)}</span>
          <span class="suggestion-duration">${comparisonEngine.formatDuration(suggestion.duration)}</span>
        </div>
        <div class="suggestion-details">
          <span class="participants-count">All ${suggestion.participants} friends available</span>
          <button class="highlight-btn" onclick="comparisonRenderer.highlightSuggestion(${index})">
            Show on Grid
          </button>
        </div>
      </div>
    `).join('');
    
    suggestionsContainer.innerHTML = `
      <div class="suggestions-header">
        <h3>💡 Best Meeting Times</h3>
        <p>Found ${suggestions.length} time${suggestions.length > 1 ? 's' : ''} when everyone is free:</p>
      </div>
      <div class="suggestions-list">
        ${suggestionsHTML}
      </div>
    `;
  }
  
  // Highlight a suggestion on the grid
  highlightSuggestion(suggestionIndex) {
    if (!this.currentComparison || !this.currentComparison.suggestions[suggestionIndex]) {
      return;
    }
    
    const suggestion = this.currentComparison.suggestions[suggestionIndex];
    
    // Remove existing highlights
    document.querySelectorAll('.comparison-slot.highlighted').forEach(slot => {
      slot.classList.remove('highlighted');
    });
    
    // Find and highlight the corresponding time slot
    const dayColumn = this.getDayColumn(suggestion.day);
    if (dayColumn) {
      const comparisonSlots = dayColumn.querySelectorAll('.comparison-slot');
      comparisonSlots.forEach(slot => {
        const slotDay = slot.dataset.day;
        // Simple check - could be improved with better time matching
        if (slotDay === suggestion.day) {
          slot.classList.add('highlighted');
          
          // Scroll into view
          slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }
  
  // Update comparison header (enhanced for unlimited system)
  updateComparisonHeader(comparisonResult) {
    const titleElement = document.querySelector('.schedule-title, .weekly-schedule h2, .schedule-header h3');
    if (titleElement) {
      const friendNames = comparisonResult.friends.map(f => f.displayName || f.shortName).join(', ');
      const skippedCount = comparisonResult.skippedFriends || 0;
      
      let titleText = `📊 Comparing: ${friendNames}`;
      if (skippedCount > 0) {
        titleText += ` (${skippedCount} private schedules excluded)`;
      }
      
      titleElement.textContent = titleText;
    }
    
    // Update stats
    const statsElement = document.querySelector('.schedule-stats');
    if (statsElement) {
      const stats = comparisonResult.comparison.overalStats;
      const totalSlots = stats.totalTimeSlots;
      const freePercentage = Math.round((stats.freeTimeSlots / totalSlots) * 100);
      const validFriends = comparisonResult.validFriends || comparisonResult.friends.length;
      
      statsElement.innerHTML = `
        <div class="stat-item">
          <span class="stat-number">${validFriends}</span>
          <span class="stat-label">Friends</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${stats.freeTimeSlots}</span>
          <span class="stat-label">Free Slots</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${freePercentage}%</span>
          <span class="stat-label">Availability</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${comparisonResult.suggestions.length}</span>
          <span class="stat-label">Suggestions</span>
        </div>
      `;
    }
  }
  
  // Add comparison legend
  addComparisonLegend() {
    // Remove existing legend
    const existingLegend = document.getElementById('comparison-legend');
    if (existingLegend) {
      existingLegend.remove();
    }
    
    const legend = document.createElement('div');
    legend.id = 'comparison-legend';
    legend.className = 'comparison-legend';
    legend.innerHTML = `
      <h4>Legend</h4>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-color free"></span>
          <span class="legend-text">🟢 Everyone Free</span>
        </div>
        <div class="legend-item">
          <span class="legend-color partial"></span>
          <span class="legend-text">🟠 Some Available</span>
        </div>
        <div class="legend-item">
          <span class="legend-color busy"></span>
          <span class="legend-text">🔴 Everyone Busy</span>
        </div>
      </div>
    `;
    
    // Insert after schedule grid
    const scheduleContainer = this.scheduleGrid.parentElement;
    scheduleContainer.appendChild(legend);
  }
  
  // Utility methods
  getDayColumn(day) {
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
  
  clearScheduleGrid() {
    if (!this.scheduleGrid) return;
    
    const items = this.scheduleGrid.querySelectorAll('.schedule-item, .comparison-slot');
    items.forEach(item => {
      item.style.opacity = '0';
      item.style.transform = 'scale(0.9)';
      setTimeout(() => item.remove(), 150);
    });
  }
  
  showLoadingState() {
    // Implementation similar to previous components
  }
  
  hideLoadingState() {
    // Implementation similar to previous components
  }
  
  renderComparisonError(comparisonResult) {
    // Implementation similar to previous error handling
  }
  
  addComparisonEnhancements() {
    if (this.scheduleGrid) {
      this.scheduleGrid.classList.add('showing-comparison');
    }
  }
}

// Create and export singleton
export const comparisonRenderer = new ComparisonRenderer();

// Make globally available for onclick handlers
window.comparisonRenderer = comparisonRenderer;
```

---

## 📚 Learning Objectives for Interns

By completing Phase 5, you will master:

### 🔧 Advanced JavaScript Concepts
- **Event-driven Architecture**: Complex event coordination between multiple components
- **Set Data Structures**: Efficient tracking of selected friends using JavaScript Sets
- **Advanced DOM Manipulation**: Dynamic element creation with complex positioning
- **Touch Event Handling**: Mobile-first interaction patterns with long-press detection
- **Algorithm Implementation**: Time slot grouping and overlap detection algorithms

### 🎨 Advanced UI/UX Patterns
- **Multi-Selection Interfaces**: Instagram-style selection with visual feedback
- **Color-Coded Data Visualization**: Using color psychology for intuitive status communication
- **Responsive Touch Interactions**: Cross-platform touch and click handling
- **Progressive Disclosure**: Revealing complexity through hover states and modal details
- **Performance-Conscious Rendering**: Efficient DOM updates for large datasets

### 🏗️ System Integration Skills
- **Component Communication**: Complex event-driven communication between 3+ components
- **Data Pipeline Architecture**: Multi-stage data processing (selection → comparison → visualization)
- **Cache Management**: Optimizing performance with intelligent data caching
- **Error Handling**: Graceful degradation when friends have private schedules
- **State Synchronization**: Keeping UI state consistent across multiple interface elements

---

## 🔗 Critical Codebase Integration Points

### Required Dependencies from Previous Phases
```javascript
// Phase 1: Data Layer (REQUIRED)
import { enhancedDataManager } from '../../services/data/DataService.js';

// Phase 4: Schedule Display Integration (REQUIRED)  
import { friendScheduleManager } from './friend-schedule-manager.js';

// Phase 3: Friends Bar Integration (REQUIRED)
import { HorizontalFriendsBar } from '../friends/HorizontalFriendsBar.js';

// CampXus Core: Existing Systems (REQUIRED)
import { avatarManager } from '../avatars.js';
import { notificationManager } from '../notification-manager.js';
```

### Integration with Existing CampXus Architecture
1. **SPA Router Integration**: Schedule comparison routes at `/home?compare=friend1,friend2`
2. **Real-time Data**: Leverages existing `realtime-manager.js` for live schedule updates
3. **Privacy System**: Respects existing privacy controls from `privacy-manager.js`
4. **Toast Notifications**: Uses existing notification system for user feedback
5. **Dom Elements**: Integrates with existing `domElements.js` caching system

---

## 💻 Development Environment Setup

### Prerequisites Checklist
- [ ] Phase 1 (Schedule Storage) completed and tested
- [ ] Phase 3 (Friends Bar UI) completed and functional
- [ ] Phase 4 (Schedule Viewing) completed and integrated
- [ ] Firebase emulators running for real-time testing
- [ ] Multiple test user accounts with diverse schedules
- [ ] Mobile device/emulator for touch interaction testing

### Required Test Data Setup
```bash
# Create test accounts with overlapping schedules for comparison testing
npm run dev:create-test-users
npm run dev:seed-schedules

# Start development with real-time Firebase
npm run dev:serve
```

### Development Tools Setup
```javascript
// Add to browser console for debugging
window.debugComparison = {
  logSelections: () => console.log(multiSelectionManager.getSelectedFriends()),
  testEngine: () => comparisonEngine.compareSchedules(testData),
  showRenderDebug: () => comparisonRenderer.debugMode = true
};
```

---

## 🛠️ Implementation Timeline

### Day 1: Multi-Selection Foundation (6-8 hours)
**Morning Session (3-4 hours)**
- [ ] Create `MultiSelectionManager` class structure
- [ ] Implement basic friend selection tracking with Sets
- [ ] Add visual selection indicators to friends bar
- [ ] Test single friend selection functionality

**Afternoon Session (3-4 hours)**  
- [ ] Implement desktop multi-selection (Ctrl+Click)
- [ ] Add mobile long-press detection
- [ ] Create selection counter UI component
- [ ] Test cross-platform selection interactions

**Success Criteria**: Friends can be selected/deselected with visual feedback on both desktop and mobile

### Day 2: Comparison Engine Core (6-8 hours)
**Morning Session (3-4 hours)**
- [ ] Create `ComparisonEngine` class with time grid system
- [ ] Implement schedule overlap detection algorithm
- [ ] Build time slot grouping for efficient visualization
- [ ] Test with 2-friend comparison scenarios

**Afternoon Session (3-4 hours)**
- [ ] Add meeting time suggestion algorithm
- [ ] Implement privacy-aware schedule filtering
- [ ] Test with multiple friends (3-5 friend groups)
- [ ] Handle edge cases (empty schedules, private schedules)

**Success Criteria**: Accurate overlap detection and meeting time suggestions for any number of friends

### Day 3: Visual Comparison System (6-8 hours)
**Morning Session (3-4 hours)**
- [ ] Create `ComparisonRenderer` class structure
- [ ] Implement color-coded schedule visualization
- [ ] Add comparison legend and header updates
- [ ] Test basic rendering with simple schedules

**Afternoon Session (3-4 hours)**
- [ ] Add interactive tooltips and hover effects
- [ ] Implement meeting time suggestions display
- [ ] Create comparison details modal
- [ ] Test with complex, overlapping schedules

**Success Criteria**: Beautiful, intuitive visual comparison with interactive elements

### Day 4: Integration & Polish (4-6 hours)
**Morning Session (2-3 hours)**
- [ ] Integrate all components with HomePage.js
- [ ] Test complete user flow from selection to comparison
- [ ] Fix cross-component communication issues
- [ ] Implement error handling and edge cases

**Afternoon Session (2-3 hours)**
- [ ] Add keyboard shortcuts and accessibility features  
- [ ] Performance testing with larger friend groups
- [ ] Mobile responsiveness testing and fixes
- [ ] User experience refinements and polish

**Success Criteria**: Seamless end-to-end comparison experience across all devices

---

## 🔨 Step-by-Step Implementation Guide

### Step 1: Set Up Component Structure
```bash
# Create the required directory structure
mkdir -p src/js/components/friends-bar
mkdir -p src/js/core/schedule  
mkdir -p src/css/schedule

# Create the main component files
touch src/js/components/friends-bar/multi-selection-manager.js
touch src/js/core/schedule/comparison-engine.js
touch src/js/core/schedule/comparison-renderer.js
touch src/css/schedule/comparison.css
```

### Step 2: Implement Multi-Selection Manager
Copy the `MultiSelectionManager` class provided above into `src/js/components/friends-bar/multi-selection-manager.js`.

**Key Implementation Notes:**
- Uses JavaScript `Set` for efficient friend ID tracking
- Implements both desktop (Ctrl+Click) and mobile (long-press) patterns
- Provides visual feedback through CSS classes and indicators
- Dispatches custom events for component communication

### Step 3: Build Comparison Engine
Copy the `ComparisonEngine` class provided above into `src/js/core/schedule/comparison-engine.js`.

**Algorithm Highlights:**
- Converts schedules to 30-minute time grids for easy comparison
- Groups consecutive time slots with same availability status
- Finds optimal meeting times with duration and participant filters
- Handles privacy settings and inaccessible schedules gracefully

### Step 4: Create Comparison Renderer
Copy the `ComparisonRenderer` class provided above into `src/js/core/schedule/comparison-renderer.js`.

**Visualization Features:**
- Color-coded schedule overlays (Green=Free, Orange=Partial, Red=Busy)
- Interactive tooltips showing individual friend availability
- Meeting time suggestions with highlight functionality
- Responsive design with glassmorphism aesthetics

### Step 5: Add CSS Styling
Create `src/css/schedule/comparison.css`:

```css
/* Multi-Selection UI Styles */
.multi-select-btn {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
  border: 2px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  color: white;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.multi-select-btn.active {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4));
  border-color: rgba(99, 102, 241, 0.6);
  transform: scale(1.05);
}

.friend-item.multi-selected {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(59, 130, 246, 0.3));
  border: 2px solid rgba(34, 197, 94, 0.5);
  transform: scale(1.05);
}

.selection-indicator {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #22c55e;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Comparison Visualization Styles */
.comparison-slot {
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.comparison-slot:hover {
  transform: scale(1.02);
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.comparison-slot.highlighted {
  animation: pulse 2s infinite;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.6);
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.6); }
  50% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.8); }
}

/* Meeting Suggestions Styles */
.meeting-suggestions {
  margin-top: 24px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  padding: 20px;
  backdrop-filter: blur(10px);
}

.suggestion-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.2s ease;
}

.suggestion-item:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

/* Responsive Design */
@media (max-width: 768px) {
  .multi-select-instructions {
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    z-index: 1000;
  }
  
  .comparison-tooltip {
    position: fixed !important;
    bottom: 100px !important;
    left: 20px !important;
    right: 20px !important;
    top: auto !important;
  }
}

/* Multi-select mode body styles */
body.multi-select-mode .friend-item {
  animation: selectModeGlow 2s infinite alternate;
}

@keyframes selectModeGlow {
  from { box-shadow: 0 0 5px rgba(99, 102, 241, 0.3); }
  to { box-shadow: 0 0 15px rgba(99, 102, 241, 0.6); }
}
```

### Step 6: HomePage Integration
Update `src/js/core/HomePage.js` to integrate the comparison system:

```javascript
// Add to HomePage imports
import { MultiSelectionManager } from '../components/friends-bar/multi-selection-manager.js';
import { comparisonEngine } from './schedule/comparison-engine.js';
import { comparisonRenderer } from './schedule/comparison-renderer.js';

// Add to HomePage class
class HomePage {
  constructor() {
    this.multiSelectionManager = null;
    this.comparisonMode = false;
    // ... existing code
  }
  
  init() {
    // ... existing initialization
    this.setupComparisonSystem();
  }
  
  setupComparisonSystem() {
    // Initialize multi-selection manager after friends bar is ready
    if (this.horizontalFriendsBar) {
      this.multiSelectionManager = new MultiSelectionManager(this.horizontalFriendsBar);
    }
    
    // Listen for comparison events
    document.addEventListener('friendsSelectedForComparison', async (event) => {
      await this.handleMultiFriendComparison(event.detail);
    });
    
    document.addEventListener('multiSelectModeEntered', () => {
      this.comparisonMode = true;
      this.updateUIForComparisonMode(true);
    });
    
    document.addEventListener('multiSelectModeExited', () => {
      this.comparisonMode = false;
      this.updateUIForComparisonMode(false);
    });
  }
  
  async handleMultiFriendComparison(detail) {
    const { selectedFriends, friendsData } = detail;
    
    try {
      // Show loading state
      this.showComparisonLoading();
      
      // Load schedules for all selected friends
      const scheduleResults = await Promise.all(
        selectedFriends.map(friendId => 
          this.friendScheduleManager.loadFriendSchedule(friendId)
        )
      );
      
      // Run comparison analysis
      const comparisonResult = await comparisonEngine.compareSchedules(
        friendsData, 
        scheduleResults
      );
      
      // Render comparison visualization
      await comparisonRenderer.renderComparison(comparisonResult);
      
      // Show success notification
      if (window.showNotification) {
        const validCount = comparisonResult.validFriends || friendsData.length;
        window.showNotification(
          `Schedule comparison complete for ${validCount} friends`,
          'success'
        );
      }
      
    } catch (error) {
      console.error('Comparison failed:', error);
      
      // Show error notification
      if (window.showNotification) {
        window.showNotification(
          'Failed to compare schedules. Please try again.',
          'error'
        );
      }
      
      // Render error state
      comparisonRenderer.renderComparisonError({
        error: error.message,
        friends: friendsData
      });
    } finally {
      this.hideComparisonLoading();
    }
  }
  
  updateUIForComparisonMode(isComparisonMode) {
    const scheduleContainer = document.querySelector('.schedule-container');
    if (scheduleContainer) {
      scheduleContainer.classList.toggle('comparison-mode', isComparisonMode);
    }
  }
  
  showComparisonLoading() {
    // Implementation similar to existing loading states
  }
  
  hideComparisonLoading() {
    // Implementation similar to existing loading states  
  }
}
```

---

## 🧪 Testing Strategy

### Unit Testing Focus
```javascript
// Test file: src/js/tests/schedule/comparison-engine.test.js
describe('ComparisonEngine', () => {
  test('correctly identifies free time slots', () => {
    const mockSchedules = [
      { friendId: 'friend1', scheduleData: [/* morning classes */] },
      { friendId: 'friend2', scheduleData: [/* afternoon classes */] }
    ];
    
    const result = comparisonEngine.compareSchedules(['friend1', 'friend2'], mockSchedules);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
  
  test('handles private schedules gracefully', () => {
    const resultsWithPrivate = [
      { success: true, friendId: 'friend1', scheduleData: [] },
      { success: false, friendId: 'friend2', error: 'Private schedule' }
    ];
    
    const result = comparisonEngine.compareSchedules(['friend1', 'friend2'], resultsWithPrivate);
    expect(result.validFriends).toBe(1);
    expect(result.skippedFriends).toBe(1);
  });
});
```

### Integration Testing Scenarios
1. **Desktop Multi-Selection**: Ctrl+Click multiple friends, verify comparison renders
2. **Mobile Long-Press**: Long-press friend, tap additional friends, verify selection
3. **Privacy Handling**: Select mix of public/private friends, verify graceful degradation
4. **Performance Testing**: Select 10+ friends, verify responsive rendering
5. **Error Recovery**: Network failures during schedule loading, verify error handling

### User Acceptance Testing
- [ ] Non-technical users can successfully find meeting times
- [ ] Interface is intuitive without instructions on mobile
- [ ] Comparison results are accurate and actionable
- [ ] Performance remains smooth with larger friend groups

---

## 🐛 Common Issues & Debugging

### Issue: Touch Events Not Working on Mobile
**Symptoms**: Long-press doesn't trigger multi-select mode
**Solution**: 
```javascript
// Add to multi-selection-manager.js
// Ensure touch events are properly bound
element.addEventListener('touchstart', handler, { passive: false });
element.addEventListener('touchend', handler, { passive: false });
```

### Issue: Comparison Rendering is Slow
**Symptoms**: UI freezes when selecting many friends
**Solution**:
```javascript
// Use requestAnimationFrame for smooth rendering
renderComparisonGrid(comparisonResult) {
  const renderNextDay = (dayIndex) => {
    if (dayIndex >= days.length) return;
    
    this.renderDayComparison(days[dayIndex], comparison.days[days[dayIndex]]);
    
    requestAnimationFrame(() => renderNextDay(dayIndex + 1));
  };
  
  requestAnimationFrame(() => renderNextDay(0));
}
```

### Issue: Memory Leaks with Event Listeners
**Symptoms**: Browser becomes sluggish after extended use
**Solution**:
```javascript
// Add cleanup method to all managers
cleanup() {
  // Remove all event listeners
  document.removeEventListener('friendsSelectedForComparison', this.handleComparison);
  
  // Clear timers
  if (this.longPressTimer) {
    clearTimeout(this.longPressTimer);
  }
  
  // Clear references
  this.selectedFriends.clear();
  this.currentComparison = null;
}
```

### Issue: Inaccurate Time Slot Calculations
**Symptoms**: Meeting suggestions don't match visual comparison
**Solution**:
```javascript
// Ensure consistent time parsing across all components
timeToMinutes(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  
  const [hours, minutes] = timeString.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  
  return (hours * 60) + minutes;
}
```

---

## ✅ Completion Checklist

### Core Functionality
- [ ] Multi-friend selection works on desktop (Ctrl+Click)
- [ ] Multi-friend selection works on mobile (long-press + tap)
- [ ] Schedule comparison analysis is accurate
- [ ] Color-coded visualization renders correctly  
- [ ] Meeting time suggestions are relevant and actionable

### Integration Requirements
- [ ] Integrates seamlessly with Phase 3 Friends Bar
- [ ] Uses Phase 4 schedule loading system
- [ ] Respects Phase 1 data privacy settings
- [ ] Works with existing HomePage.js structure
- [ ] Compatible with SPA routing system

### User Experience
- [ ] Interface is intuitive without documentation
- [ ] Touch interactions feel natural on mobile
- [ ] Hover states provide helpful information
- [ ] Error messages are clear and actionable
- [ ] Performance is smooth with 5+ friends

### Technical Excellence
- [ ] No memory leaks or performance issues
- [ ] Proper error handling and edge cases
- [ ] Clean separation between components
- [ ] Comprehensive event cleanup
- [ ] Mobile-responsive design

### Testing & Quality
- [ ] All unit tests pass
- [ ] Manual testing across devices completed
- [ ] No console errors in browser
- [ ] Lighthouse performance score > 90
- [ ] Accessibility features work properly

**🎉 Phase 5 Complete**: When all checkboxes are complete, you've successfully implemented an intuitive multi-friend schedule comparison system that transforms CampXus from a personal scheduling tool into a powerful social coordination platform!

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Create NEW-Plan directory structure", "status": "completed", "priority": "high"}, {"id": "2", "content": "Phase 1: Schedule Storage Foundation", "status": "completed", "priority": "high"}, {"id": "3", "content": "Phase 2: Quick Access Friends System", "status": "completed", "priority": "high"}, {"id": "4", "content": "Phase 3: Horizontal Friends Bar UI", "status": "completed", "priority": "high"}, {"id": "5", "content": "Phase 4: Schedule Viewing Integration", "status": "completed", "priority": "medium"}, {"id": "6", "content": "Phase 5: Intuitive Schedule Comparison", "status": "completed", "priority": "medium"}, {"id": "7", "content": "Phase 6: Performance & Polish", "status": "pending", "priority": "low"}]