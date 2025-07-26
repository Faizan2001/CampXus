# Phase 0: Schedule Import System 📸
**Foundation for Automated Schedule Processing with CampXus Integration**

## 🎓 Learning Path Selection
**Choose your learning journey based on your experience level:**

### 🌱 Complete Beginner Path (New to Web Dev)
- **Time Needed**: 5-7 days
- **Focus**: Understanding service architecture, basic JavaScript patterns, and testing fundamentals
- **Start Here**: Read "Why This Phase Matters" section first, then follow Step-by-Step Guide

### 🌿 Foundation Level Path (Know HTML/CSS/JS Basics)  
- **Time Needed**: 3-4 days
- **Focus**: Service integration patterns and advanced text parsing
- **Start Here**: Review architecture overview, then jump to implementation

### 🌳 Advanced Path (Strong JS Foundation)
- **Time Needed**: 2-3 days  
- **Focus**: Architectural decisions and optimization techniques
- **Start Here**: Study integration points, then implement with testing

---

## 🤔 Why This Phase Matters (Industry Context)

**Real-World Problem**: Every university has different schedule formats. In my 10+ years as a senior engineer, I've seen apps fail because they couldn't handle data import elegantly. Major companies like Google Calendar, Outlook, and Canvas all solve this same problem.

**What You're Really Learning**: 
- **Service Architecture** - How Netflix organizes their microservices
- **Data Transformation** - How Spotify processes millions of music files
- **Error Handling** - How banks protect against data corruption
- **Testing Patterns** - How Google ensures code quality

**Career Growth**: This pattern will serve you when building APIs at Meta, processing user data at Amazon, or handling imports at any startup. Senior engineers are expected to design systems that gracefully handle messy, real-world data.

---

## 🏗️ Architecture Decisions Explained

### Why Service Classes? (Industry Standard Pattern)
```javascript
// ❌ Beginner Mistake: Putting everything in one file
function importSchedule() { /* 500 lines of mixed logic */ }

// ✅ Production Pattern: Separation of concerns
class ScheduleImportService {
  constructor(parserService, validatorService) { /* Clean dependencies */ }
  async importFromText() { /* Single responsibility */ }
}
```

**Why I chose this**: 
- **Testability**: Each service can be tested independently
- **Maintainability**: When (not if) requirements change, you only touch one file
- **Team Development**: Multiple developers can work on different services
- **Career Preparation**: This is how Senior Engineers structure code at FAANG companies

### Why Extend Existing Files Instead of Creating New Ones?
**Beginner Instinct**: "I'll create my own time utility!"
**Senior Engineer Reality**: "I'll extend the existing one because..."
- Consistency across the codebase
- Existing code is already tested
- Team members know where to find things
- Reduces bundle size (fewer imports)

---

## 📚 Learning Objectives by Experience Level

### 🌱 Complete Beginner Focus
**What you'll master:**
- **Service Pattern**: Understanding why we separate concerns (this will help you at every job)
- **Module Integration**: How to extend existing code without breaking it
- **Testing Mindset**: Why we write tests first (industry standard at good companies)
- **Error Handling**: How to fail gracefully (essential for user experience)

**Real-World Connection**: These patterns are used at every tech company. Master them here, use them everywhere.

### 🌿 Foundation Level Focus  
**What you'll master:**
- **Advanced Text Parsing**: Regular expressions and string manipulation
- **Data Transformation**: Converting messy input to clean output
- **Service Integration**: How different parts of an app communicate
- **Professional Testing**: Writing tests that actually catch bugs

### 🌳 Advanced Focus
**What you'll master:**
- **Architectural Decisions**: Why certain patterns are chosen over others
- **Performance Considerations**: Memory management and algorithm efficiency  
- **Error Recovery**: Building resilient systems that handle edge cases
- **Code Organization**: Structuring code for long-term maintainability

## 📁 Codebase Integration Points
**CRITICAL**: This phase integrates with existing CampXus architecture - don't create from scratch!

### 🌱 For Beginners: Understanding File Organization
**Why This Matters**: In professional development, code organization is crucial. Think of it like organizing a library - everything has its place.

**The CampXus Pattern**:
```
src/js/
├── services/     (Business logic - the "brain" of features)
├── utils/        (Helper functions - the "tools" everyone uses)  
├── pages/        (UI logic - the "face" users see)
└── tests/        (Quality assurance - the "safety net")
```

### Files You'll Extend (Study First, Then Modify)
**🎯 Beginner Strategy**: Always read existing code before changing it!

#### `src/js/utils/constants.js` - Add missing time slot
```javascript
// 🔍 What you'll find: Time slots array with 6 items
// 🎯 What you'll add: 7th time slot for evening classes
// 💡 Why: Universities often have evening classes we're missing
```

#### `src/js/utils/time/timeUtils.js` - Extend time parsing
```javascript  
// 🔍 What you'll find: Functions to format time
// 🎯 What you'll add: University-specific time parsing
// 💡 Why: Reuse existing, tested code instead of writing new
```

#### `src/js/utils/schedule/exportImport.js` - Add import functionality
```javascript
// 🔍 What you'll find: Export functionality already working
// 🎯 What you'll add: Mirror import functionality
// 💡 Why: Symmetrical API design (export/import pair)
```

#### `src/js/pages/HomePage.js` - Add import button
```javascript
// 🔍 What you'll find: Existing schedule UI logic
// 🎯 What you'll add: Import button and handler
// 💡 Why: Keep UI logic where users expect to find it
```

### New Files You'll Create
**🎯 Beginner Strategy**: Start with the main service, then build supporting files

#### `src/js/services/schedule/ScheduleImportService.js` - Main service
```javascript
// 🎯 Your main class - the "conductor" that orchestrates everything
// 💡 Design principle: Single Responsibility (only handles imports)
// 🚀 Career tip: This pattern is used at Google, Netflix, everywhere!
```

#### `src/js/services/schedule/UniversityParser.js` - University-specific logic
```javascript
// 🎯 Handles university-specific format differences  
// 💡 Design principle: Open/Closed (easy to add new universities)
// 🚀 Career tip: Extensible design = promotable engineer
```

#### `src/js/utils/schedule/scheduleValidator.js` - Validation utilities
```javascript
// 🎯 Ensures data quality before saving
// 💡 Design principle: Defense in Depth (validate everything)
// 🚀 Career tip: Senior engineers always validate user input
```

#### `src/js/tests/services/schedule-import.test.js` - Test suite
```javascript
// 🎯 Proves your code works correctly
// 💡 Design principle: Test-Driven Development
// 🚀 Career tip: Companies won't hire senior devs who don't test
```

### 📖 Essential Reading (Start Here!)
**🌱 For Beginners**: Read these in order, take notes!

1. **`.md files/SPA-All-that-you-need.md`** - How CampXus architecture works
   - 🎯 Focus: Understanding how pages connect to services
   - ⏰ Time: 30 minutes reading + 15 minutes experimenting

2. **`.md files/UI-Map.md`** - Where UI elements live in the DOM  
   - 🎯 Focus: Finding the right place for your import button
   - ⏰ Time: 20 minutes reading + testing in browser

3. **`src/js/dev-tools/firebase-dev-tools-README.md`** - Development workflow
   - 🎯 Focus: How to test and debug effectively
   - ⏰ Time: 15 minutes reading + trying the tools

---

## ⚠️ Common Pitfalls & How to Avoid Them

### 🚨 Mistake #1: Creating Duplicate Code
**What beginners do:**
```javascript
// ❌ BAD: Creating new time parsing function
function parseTime(timeStr) {
  // 50 lines of time parsing logic
}
```

**What senior engineers do:**
```javascript
// ✅ GOOD: Extending existing utility
import { timeUtils } from '../utils/time/timeUtils.js';
// Add to existing timeUtils instead of creating new
```

**Why this matters**: Code duplication is the #1 source of bugs in professional development.

### 🚨 Mistake #2: Not Understanding the Existing System
**What beginners do**: Start coding immediately without understanding current implementation
**What you should do**: Spend 2 hours studying existing schedule code before writing new code

**Career Insight**: Senior engineers spend 60% of their time reading code, 40% writing it.

### 🚨 Mistake #3: Ignoring Error Cases
**What beginners do:**
```javascript
// ❌ BAD: Assuming input is always perfect
function importSchedule(text) {
  const lines = text.split('\n');
  return lines.map(line => parseLine(line)); // What if parsing fails?
}
```

**What production code looks like:**
```javascript
// ✅ GOOD: Defensive programming
function importSchedule(text) {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: text must be a non-empty string');
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      try {
        return parseLine(line);
      } catch (error) {
        console.warn(`Failed to parse line ${index + 1}: ${line}`, error);
        return null; // Graceful degradation
      }
    }).filter(Boolean);
  } catch (error) {
    console.error('Schedule import failed:', error);
    throw new Error(`Import failed: ${error.message}`);
  }
}
```

**Why this matters**: Production apps handle millions of users with unpredictable input. Robust error handling is what separates junior from senior engineers.

### 🚨 Mistake #4: Not Testing Edge Cases
**What beginners test**: Happy path only
**What you should test**: 
- Empty input
- Malformed input  
- Extremely long input
- Special characters
- Different university formats

**Industry Reality**: Facebook tests thousands of edge cases. Netflix has entire teams dedicated to failure testing.

---

## 🎯 Success Criteria by Learning Level

### 🌱 Beginner Success Criteria
- [ ] Successfully imported one valid schedule text
- [ ] Handled one error case gracefully  
- [ ] Extended existing file without breaking it
- [ ] Wrote and ran one test that passes
- [ ] Can explain why you chose your approach

### 🌿 Foundation Success Criteria
- [ ] Imported schedules from 2+ different formats
- [ ] Implemented comprehensive error handling
- [ ] Added validation with clear error messages
- [ ] Wrote test suite covering edge cases
- [ ] Code passes review from advanced peer

### 🌳 Advanced Success Criteria  
- [ ] System handles all university format variations
- [ ] Performance optimized for large schedule imports
- [ ] Implemented extensible parser architecture
- [ ] Comprehensive test coverage including edge cases
- [ ] Documentation suitable for team onboarding
- [ ] Code ready for production deployment

## Integration with Current System
Your current schedule system uses:
- **DEFAULT_TIMESLOTS**: 6 predefined university time slots (missing 18:30-21:30)
- **User Schedule Matrix**: 7x6 boolean array for busy/free slots  
- **User SlotInfo Matrix**: 7x6 array with courseCode and classroomNumber
- **localStorage**: Currently stored locally, Phase 1 will migrate to Firestore

## 🚀 Development Setup & Tools
**CRITICAL**: Use existing development tools - don't reinvent the wheel!

### Before You Start Coding:
```bash
# 1. Set up development environment (MANDATORY)
npm run dev:config        # Generate Firebase config from .env.local
npm run dev               # Start development server

# 2. Run existing tests to understand patterns
npm test src/js/tests/core/script.test.js  # Study existing test patterns
npm test                  # Ensure nothing is broken

# 3. Use development debugging tools
# Open browser console and type:
debug.help()              # See available debug commands
debug.status()            # Check system status
```

### Key Development Files to Study:
```javascript
// 1. STUDY existing time utilities BEFORE creating new ones
import { timeUtils } from '../utils/time/timeUtils.js';

// 2. STUDY existing service patterns  
import { DataService } from '../services/data/DataService.js';

// 3. STUDY existing constants structure
import { DEFAULT_TIMESLOTS } from '../utils/constants.js';

// 4. STUDY existing DOM patterns
import { domElements } from '../utils/dom/domElements.js';
```

### Testing Your Code:
```bash
# Create test files following existing patterns:
# Look at: src/js/tests/core/script.test.js for examples
npm test src/js/tests/services/schedule-import.test.js
```

## Technical Architecture
**IMPORTANT**: Follow existing CampXus service architecture patterns!

### 1. Service Architecture (Following CampXus Patterns)
```javascript
// Create in: src/js/services/schedule/ScheduleImportService.js
// FOLLOW existing service patterns - study DataService.js first!

import { timeUtils } from '../../utils/time/timeUtils.js';
import { DataService } from '../data/DataService.js';
import { DEFAULT_TIMESLOTS } from '../../utils/constants.js';

class ScheduleImportService {
  constructor() {
    this.dataService = new DataService();
    this.parser = new UniversityParser();
    this.validator = new ScheduleValidator();
  }

  // Main entry points (follow existing async patterns)
  async processImageUpload(imageFile) {
    try {
      const extractedText = await this.extractTextFromImage(imageFile);
      return await this.processTextData(extractedText, 'image');
    } catch (error) {
      throw new ImportError('Image processing failed', error);
    }
  }

  async processTextPaste(textData) {
    return await this.processTextData(textData, 'text');
  }
  
  // PRIVATE methods (follow CampXus naming conventions)
  async _processTextData(text, source) { /* ... */ }
  async _extractTextFromImage(imageFile) { /* ... */ }
  _integrateWithCurrentSystem(validatedData) { /* ... */ }
}
```

### 2. Constants Extension (MODIFY existing constants.js)
```javascript
// STEP 1: Extend existing src/js/utils/constants.js file
// DO NOT create new constants - add to existing file!

// ADD this to your existing constants.js:
export const UNIVERSITY_DAY_CODES = {
  'ST': ['sunday', 'tuesday'],        // Sunday + Tuesday
  'MW': ['monday', 'wednesday'],      // Monday + Wednesday  
  'AR': ['thursday', 'saturday'],     // Thursday + Saturday
  'T': ['tuesday'],                   // Tuesday only (from your CSC425 example)
  'TR': ['tuesday', 'thursday'],      // Tuesday + Thursday
  'MWF': ['monday', 'wednesday', 'friday'],
  
  // Single day codes (if needed)
  'S': ['sunday'],
  'M': ['monday'],
  'W': ['wednesday'],
  'A': ['thursday'],
  'F': ['friday'],
  'R': ['saturday']
};

// STEP 2: MODIFY existing DEFAULT_TIMESLOTS to add missing slot
// REPLACE the existing DEFAULT_TIMESLOTS array with:
export const DEFAULT_TIMESLOTS = [
  { start: "08:00", end: "09:30", label: "08:00-09:30" },
  { start: "09:40", end: "11:10", label: "09:40-11:10" },
  { start: "11:20", end: "12:50", label: "11:20-12:50" },
  { start: "13:00", end: "14:30", label: "13:00-14:30" },
  { start: "14:40", end: "16:10", label: "14:40-16:10" },
  { start: "16:20", end: "17:50", label: "16:20-17:50" },
  { start: "18:30", end: "21:30", label: "18:30-21:30" }  // NEW: From your schedule image
];

// STEP 3: Add parsing patterns
export const SCHEDULE_PARSING_PATTERNS = {
  MAIN_PATTERN: /^([A-Z]{2,4}\d{3})\s+(.+?)\s+(\d+)\s+([A-Z]{1,2}\d{3,4}|GPLab)\s+([A-Z]{1,5}):(\d{1,2}:\d{1,2})-(\d{1,2}:\d{1,2})\s+(.+)$/,
  MULTILINE_PATTERN: /^([A-Z]{2,4}\d{3})\s+(.+?)\s+(\d+)\s+(GPLab|[A-Z]{1,2}\d{3,4})\s+([A-Z]{1,5}):(\d{1,2}:\d{1,2})-(\d{1,2}:\d{1,2})\s+(.+)$/,
  TIME_NORMALIZATION: /(\d{1,2}):?(\d{1,2}?)-(\d{1,2}):?(\d{1,2}?)/
};
```

### 3. University Parser (EXTEND existing utilities)
```javascript
// Create in: src/js/services/schedule/UniversityParser.js
// IMPORTANT: Use existing timeUtils instead of creating new time functions!

import { timeUtils } from '../../utils/time/timeUtils.js';
import { DEFAULT_TIMESLOTS, UNIVERSITY_DAY_CODES, SCHEDULE_PARSING_PATTERNS } from '../../utils/constants.js';

class UniversityParser {
  constructor() {
    // Use existing time utilities - DON'T reinvent!
    this.timeUtils = timeUtils;
  }

  parseScheduleText(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const courses = [];
    
    for (const line of lines) {
      const course = this._parseCourseLine(line);
      if (course) {
        courses.push(course);
      }
    }
    
    return courses;
  }

  // PRIVATE method following CampXus naming conventions
  _parseCourseLine(line) {
    const cleanLine = line.trim().replace(/\s+/g, ' ');
    
    // Try different patterns from constants
    let match = cleanLine.match(SCHEDULE_PARSING_PATTERNS.MAIN_PATTERN);
    if (!match) {
      match = cleanLine.match(SCHEDULE_PARSING_PATTERNS.MULTILINE_PATTERN);
    }
    
    if (!match) {
      console.warn('Could not parse line:', line);
      return null;
    }
    
    const [, courseCode, courseName, credits, room, dayCode, startTime, endTime, extra] = match;
    
    // USE existing timeUtils for time normalization
    const normalizedStart = this._normalizeTime(startTime);
    const normalizedEnd = this._normalizeTime(endTime);
    
    // Map to existing time slots
    const timeSlotIndex = this._findTimeSlotIndex(normalizedStart, normalizedEnd);
    
    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      credits: parseInt(credits),
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: UNIVERSITY_DAY_CODES[dayCode.trim()] || [],
      startTime: normalizedStart,
      endTime: normalizedEnd,
      timeSlotIndex: timeSlotIndex,
      section: extra.split(/\s+/)[0],
      originalLine: line,
      confidence: match ? 'high' : 'medium'
    };
  }
  
  // PRIVATE: Use existing patterns but handle OCR truncation
  _normalizeTime(timeStr) {
    // Handle OCR errors: "16:1" → "16:10", "17:5" → "17:50"
    const normalized = timeStr.replace(/^(\d{1,2}):(\d{1})$/, '$1:$20');
    
    // Use existing timeUtils for validation (study timeUtils.js first!)
    return this.timeUtils.validateTimeString(normalized) ? normalized : timeStr;
  }
  
  // PRIVATE: Find slot using existing DEFAULT_TIMESLOTS
  _findTimeSlotIndex(startTime, endTime) {
    return DEFAULT_TIMESLOTS.findIndex(slot => 
      slot.start === startTime && slot.end === endTime
    );
  }
}
```

## Implementation Components

### 1. OCR Integration (Image Processing)
```javascript
// Using Tesseract.js for client-side OCR
class ImageProcessor {
  async extractText(imageFile) {
    try {
      // Initialize Tesseract with optimized settings for schedule tables
      const worker = await createWorker({
        logger: m => console.log(m) // Optional: progress tracking
      });
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      
      // Configure for table/grid recognition
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:- ',
        tessedit_pageseg_mode: PSM.SPARSE_TEXT // Better for table layouts
      });
      
      const { data: { text } } = await worker.recognize(imageFile);
      await worker.terminate();
      
      return this.cleanExtractedText(text);
    } catch (error) {
      throw new ImportError('Failed to extract text from image', error);
    }
  }
  
  cleanExtractedText(rawText) {
    return rawText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  }
}
```

### 2. Text Parser (Core Logic)
```javascript
class ScheduleTextParser {
  parseScheduleText(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const courses = [];
    
    for (const line of lines) {
      const course = this.parseCourseString(line);
      if (course) {
        courses.push(course);
      }
    }
    
    return courses;
  }
  
  parseCourseString(courseString) {
    // Try different parsing patterns
    for (const pattern of Object.values(PARSING_PATTERNS)) {
      const match = courseString.match(pattern);
      if (match) {
        return this.extractCourseInfo(match, courseString);
      }
    }
    
    // Fallback: manual parsing for non-standard formats
    return this.fallbackParsing(courseString);
  }
  
  extractCourseInfo(match, originalString) {
    // Pattern: "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z"
    const [, courseCode, courseName, credits, room, dayCode, startTime, endTime, semester] = match;
    
    return {
      courseCode: courseCode.trim(),
      courseName: courseName.trim(),
      credits: parseInt(credits),
      room: room.trim(),
      dayCode: dayCode.trim(),
      days: this.convertDayCode(dayCode.trim()),
      startTime: this.formatTime(startTime),
      endTime: this.formatTime(endTime),
      semester: semester?.trim(),
      originalString, // Keep for debugging/verification
      confidence: 'high' // Indicates successful pattern match
    };
  }
  
  convertDayCode(dayCode) {
    const mapping = DAY_CODE_MAPPINGS[dayCode.toUpperCase()];
    if (!mapping) {
      console.warn(`Unknown day code: ${dayCode}`);
      return []; // Will be flagged for manual review
    }
    return mapping;
  }
  
  formatTime(timeString) {
    // Convert 24-hour format to standard format
    const [hours, minutes] = timeString.split(':');
    return {
      hours: parseInt(hours),
      minutes: parseInt(minutes),
      formatted: timeString, // Keep original for display
      display: this.to12HourFormat(hours, minutes)
    };
  }
  
  to12HourFormat(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }
}
```

### 3. Data Validation & Quality Control
```javascript
class ScheduleValidator {
  validateSchedule(courses) {
    const validatedCourses = [];
    const errors = [];
    const warnings = [];
    
    for (const course of courses) {
      const validation = this.validateCourse(course);
      
      if (validation.isValid) {
        validatedCourses.push({
          ...course,
          ...validation.correctedData
        });
      } else {
        errors.push({
          course: course.originalString,
          issues: validation.errors,
          suggestions: validation.suggestions
        });
      }
      
      if (validation.warnings.length > 0) {
        warnings.push({
          course: course.courseCode,
          warnings: validation.warnings
        });
      }
    }
    
    return {
      validatedCourses,
      errors,
      warnings,
      stats: {
        totalCourses: courses.length,
        validCourses: validatedCourses.length,
        errorCourses: errors.length,
        successRate: (validatedCourses.length / courses.length * 100).toFixed(1)
      }
    };
  }
  
  validateCourse(course) {
    const errors = [];
    const warnings = [];
    const correctedData = {};
    
    // Validate course code format
    if (!/^[A-Z]{2,4}\d{3}$/.test(course.courseCode)) {
      errors.push('Invalid course code format');
    }
    
    // Validate day codes
    if (course.days.length === 0) {
      errors.push(`Unknown day code: ${course.dayCode}`);
    }
    
    // Validate time format
    if (!this.isValidTime(course.startTime) || !this.isValidTime(course.endTime)) {
      errors.push('Invalid time format');
    }
    
    // Check for time conflicts (start time should be before end time)
    if (this.timeToMinutes(course.startTime) >= this.timeToMinutes(course.endTime)) {
      errors.push('Start time must be before end time');
    }
    
    // Validate room format
    if (course.room && !/^[A-Z]?\d{3,4}[A-Z]?$/.test(course.room)) {
      warnings.push('Unusual room format detected');
    }
    
    // Auto-correct common issues
    if (course.courseName.length > 50) {
      correctedData.courseName = course.courseName.substring(0, 50) + '...';
      warnings.push('Course name truncated to 50 characters');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedData
    };
  }
  
  isValidTime(timeObj) {
    return timeObj.hours >= 0 && timeObj.hours <= 23 && 
           timeObj.minutes >= 0 && timeObj.minutes <= 59;
  }
  
  timeToMinutes(timeObj) {
    return timeObj.hours * 60 + timeObj.minutes;
  }
}
```

### 4. User Interface Components
```javascript
// Import interface for schedule upload/paste
class ScheduleImportUI {
  initializeImportInterface() {
    return `
      <div id="schedule-import-container" class="import-container">
        <div class="import-header">
          <h2>Import Your Schedule</h2>
          <p>Upload an image of your schedule or paste schedule text</p>
        </div>
        
        <div class="import-methods">
          <!-- Image Upload -->
          <div class="import-method" id="image-upload-section">
            <div class="method-header">
              <svg>📷</svg>
              <h3>Upload Schedule Image</h3>
            </div>
            
            <div class="upload-area" id="image-upload-area">
              <div class="upload-prompt">
                <p>Click to upload or drag & drop your schedule image</p>
                <small>Supports JPG, PNG, PDF - Max 10MB</small>
              </div>
              <input type="file" id="schedule-image-input" accept="image/*,.pdf" hidden>
            </div>
          </div>
          
          <!-- Text Paste -->
          <div class="import-method" id="text-paste-section">
            <div class="method-header">
              <svg>📝</svg>
              <h3>Paste Schedule Text</h3>
            </div>
            
            <textarea 
              id="schedule-text-input" 
              placeholder="Paste your schedule text here...
Example: CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z"
              rows="6">
            </textarea>
            
            <button id="parse-text-btn" class="parse-btn">Parse Schedule Text</button>
          </div>
        </div>
        
        <!-- Processing Status -->
        <div id="processing-status" class="processing-status hidden">
          <div class="status-content">
            <div class="spinner"></div>
            <p id="status-text">Processing your schedule...</p>
          </div>
        </div>
        
        <!-- Schedule Preview -->
        <div id="schedule-preview" class="schedule-preview hidden">
          <div class="preview-header">
            <h3>Schedule Preview</h3>
            <div class="preview-stats">
              <span id="courses-found">0 courses found</span>
              <span id="success-rate">0% success rate</span>
            </div>
          </div>
          
          <div id="preview-content">
            <!-- Generated preview content -->
          </div>
          
          <div class="preview-actions">
            <button id="edit-schedule-btn" class="secondary-btn">Edit Courses</button>
            <button id="save-schedule-btn" class="primary-btn">Save Schedule</button>
          </div>
        </div>
        
        <!-- Error Display -->
        <div id="import-errors" class="error-display hidden">
          <h4>Import Issues</h4>
          <div id="error-list">
            <!-- Generated error content -->
          </div>
        </div>
      </div>
    `;
  }
  
  generatePreview(validationResult) {
    const { validatedCourses, errors, warnings, stats } = validationResult;
    
    return `
      <div class="courses-grid">
        ${validatedCourses.map(course => `
          <div class="course-card ${course.confidence || 'medium'}">
            <div class="course-header">
              <span class="course-code">${course.courseCode}</span>
              <span class="course-credits">${course.credits} cr</span>
            </div>
            <h4 class="course-name">${course.courseName}</h4>
            <div class="course-details">
              <div class="time-info">
                <span class="days">${course.days.join(', ')}</span>
                <span class="time">${course.startTime.display} - ${course.endTime.display}</span>
              </div>
              <div class="location-info">
                <span class="room">Room: ${course.room}</span>
              </div>
            </div>
            <button class="edit-course-btn" data-course="${course.courseCode}">Edit</button>
          </div>
        `).join('')}
      </div>
      
      ${errors.length > 0 ? `
        <div class="import-issues">
          <h4>Courses needing attention (${errors.length})</h4>
          ${errors.map(error => `
            <div class="error-item">
              <span class="error-text">${error.course}</span>
              <ul class="error-reasons">
                ${error.issues.map(issue => `<li>${issue}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }
}
```

### 5. Integration with Current CampXus Schedule System
```javascript
// Convert imported data to your EXACT current format
class CampXusScheduleAdapter {
  adaptToCurrentFormat(validatedCourses, currentUser) {
    // Update the DEFAULT_TIMESLOTS to include the missing slot
    const updatedTimeSlots = [
      ...ENHANCED_TIMESLOTS
    ];
    
    // Create schedule matrices (7 days x 7 slots) 
    const schedule = Array(7).fill(null).map(() => Array(7).fill(false));
    const slotInfo = Array(7).fill(null).map(() => 
      Array(7).fill(null).map(() => ({ courseCode: "", classroomNumber: "" }))
    );
    
    // Populate schedule from imported courses
    validatedCourses.forEach(course => {
      if (course.timeSlotIndex >= 0 && course.days.length > 0) {
        course.days.forEach(dayName => {
          const dayIndex = this.getDayIndex(dayName);
          if (dayIndex >= 0) {
            // Mark slot as busy
            schedule[dayIndex][course.timeSlotIndex] = true;
            
            // Add course information
            slotInfo[dayIndex][course.timeSlotIndex] = {
              courseCode: course.courseCode,
              classroomNumber: course.room
            };
          }
        });
      }
    });
    
    // Return in EXACT format your current system expects
    return {
      // Your existing user object structure
      id: currentUser.id,
      name: currentUser.name,
      timeSlots: updatedTimeSlots,  // Enhanced with 7th slot
      schedule: schedule,           // 7x7 boolean matrix
      pinnedSlots: Array(7).fill(null).map(() => Array(7).fill(false)), // 7x7 boolean matrix
      slotInfo: slotInfo,          // 7x7 course info matrix
      
      // Import metadata (for debugging/tracking)
      importMetadata: {
        importedAt: new Date().toISOString(),
        totalCoursesImported: validatedCourses.length,
        importMethod: 'phase_0_automated',
        successfullyMapped: validatedCourses.filter(c => c.timeSlotIndex >= 0).length
      }
    };
  }
  
  getDayIndex(dayName) {
    const dayMap = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };
    return dayMap[dayName.toLowerCase()] ?? -1;
  }
  
  // Integration with your existing HomePage.js
  integrateWithCurrentSystem(adaptedData) {
    // This will replace the current user creation logic in HomePage.js
    // Instead of createUser() with empty schedule, we'll use imported data
    
    // Update DEFAULT_TIMESLOTS in constants.js
    this.updateDefaultTimeslots();
    
    // Return user object that can be directly added to state.users
    return adaptedData;
  }
  
  updateDefaultTimeslots() {
    // Phase 0.1: Update your constants.js to include 7th slot
    console.log('📅 Updating DEFAULT_TIMESLOTS to include 18:30-21:30 slot');
    
    // This will be done as part of Phase 0 implementation
    // You'll add: { start: "18:30", end: "21:30", label: "18:30-21:30" }
    // to your constants.js file
  }
}

// Direct Integration Function for HomePage.js
function importScheduleToCurrentUser(importedData, activeUserId, state) {
  if (!state.users[activeUserId]) {
    console.error('No active user found for import');
    return false;
  }
  
  const adapter = new CampXusScheduleAdapter();
  const adaptedData = adapter.adaptToCurrentFormat(importedData, state.users[activeUserId]);
  
  // Update the existing user object
  state.users[activeUserId].timeSlots = adaptedData.timeSlots;
  state.users[activeUserId].schedule = adaptedData.schedule;
  state.users[activeUserId].slotInfo = adaptedData.slotInfo;
  
  // Save to localStorage (your current storage method)
  saveStateToStorage();
  
  // Re-render schedule
  renderScheduleGrid();
  
  console.log('✅ Schedule imported successfully for:', state.users[activeUserId].name);
  return true;
}
```

## Error Handling & User Experience

### 1. Progressive Processing
```javascript
// Handle different quality levels of input
const PROCESSING_STRATEGIES = {
  HIGH_QUALITY: 'Perfect OCR extraction with standard format',
  MEDIUM_QUALITY: 'Partial extraction requiring user verification', 
  LOW_QUALITY: 'Manual entry with guided assistance',
  FALLBACK: 'Traditional manual schedule entry'
};
```

### 2. Smart Suggestions
```javascript
// Help users fix common issues
class ImportAssistant {
  suggestCorrections(errors) {
    return errors.map(error => ({
      ...error,
      suggestions: this.generateSuggestions(error.course, error.issues)
    }));
  }
  
  generateSuggestions(courseString, issues) {
    const suggestions = [];
    
    if (issues.includes('Invalid course code format')) {
      const possibleCodes = this.extractPossibleCourseCodes(courseString);
      suggestions.push(`Possible course codes: ${possibleCodes.join(', ')}`);
    }
    
    if (issues.includes('Unknown day code')) {
      suggestions.push('Common day codes: ST (Sun/Tue), MW (Mon/Wed), AR (Thu/Sat)');
    }
    
    return suggestions;
  }
}
```

### 3. Manual Editing Interface
```javascript
// Allow users to correct detected courses
class CourseEditModal {
  showEditModal(course) {
    return `
      <div class="edit-modal">
        <h3>Edit Course: ${course.courseCode}</h3>
        <form id="course-edit-form">
          <input type="text" name="courseCode" value="${course.courseCode}" placeholder="Course Code">
          <input type="text" name="courseName" value="${course.courseName}" placeholder="Course Name">
          
          <div class="time-inputs">
            <label>Days:</label>
            <div class="day-checkboxes">
              ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => `
                <label>
                  <input type="checkbox" name="days" value="${day}" 
                         ${course.days.includes(day) ? 'checked' : ''}>
                  ${day}
                </label>
              `).join('')}
            </div>
            
            <div class="time-row">
              <input type="time" name="startTime" value="${course.startTime.formatted}">
              <span>to</span>
              <input type="time" name="endTime" value="${course.endTime.formatted}">
            </div>
          </div>
          
          <input type="text" name="room" value="${course.room}" placeholder="Room">
          <input type="number" name="credits" value="${course.credits}" placeholder="Credits">
          
          <div class="modal-actions">
            <button type="button" class="cancel-btn">Cancel</button>
            <button type="submit" class="save-btn">Save Changes</button>
          </div>
        </form>
      </div>
    `;
  }
}
```

## 📅 Step-by-Step Implementation Guide (10 Days)

### **Day 1: Environment Setup & Constants** 
```bash
# MANDATORY setup steps:
npm run dev:config              # Generate Firebase config
npm test                        # Ensure all tests pass before changes

# Study existing code patterns:
cat src/js/utils/constants.js   # Study current constants structure
cat src/js/utils/time/timeUtils.js  # Study time utilities
cat src/js/pages/HomePage.js    # Study schedule rendering
```

**Tasks:**
1. **Update `src/js/utils/constants.js`**: Add UNIVERSITY_DAY_CODES and update DEFAULT_TIMESLOTS
2. **Test schedule matrices**: Change HomePage.js to use 7x7 instead of 7x6 matrices
3. **Run tests**: `npm test` to ensure nothing broke

**Success Criteria:** ✅ Schedule grid shows 7 time slots instead of 6

### **Day 2: Service Architecture Foundation**
```bash
# Create new service directory:
mkdir -p src/js/services/schedule

# Study existing service patterns:
cat src/js/services/data/DataService.js     # Study service architecture
cat src/js/services/auth/AuthService.js     # Study error handling patterns
```

**Tasks:**
1. **Create `src/js/services/schedule/ScheduleImportService.js`**: Main service class
2. **Create `src/js/services/schedule/UniversityParser.js`**: Parser class
3. **Test service instantiation**: Simple console.log tests
4. **Study error handling**: Review how other services handle errors

**Success Criteria:** ✅ Services can be imported and instantiated without errors

### **Day 3: Text Parsing Implementation**
```bash
# Test with real data from your schedule:
echo "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z" > test-schedule.txt
```

**Tasks:**
1. **Implement UniversityParser._parseCourseLine()**: Core parsing logic
2. **Test with provided text samples**: CMN205, CSC311, CSC425 examples
3. **Add debug logging**: Console.log parsed results
4. **Create basic validation**: Check required fields are present

**Success Criteria:** ✅ Can parse university course strings into structured objects

### **Day 4: Time Integration & Validation**
```bash
# Study existing time utilities:
cat src/js/utils/time/timeUtils.js          # Learn existing time functions
```

**Tasks:**
1. **Integrate with existing timeUtils**: Use existing time validation
2. **Implement time normalization**: Handle "16:1" → "16:10" OCR errors
3. **Add day code mapping**: ST → ['sunday', 'tuesday']
4. **Create validation utilities**: Check parsed data integrity

**Success Criteria:** ✅ Correctly maps course times to DEFAULT_TIMESLOTS indices

### **Day 5: Integration with Current System**
```bash
# Study current schedule system:
cat src/js/pages/HomePage.js | grep -A 20 "schedule.*Matrix"  # Study matrices
```

**Tasks:**
1. **Create CampXusScheduleAdapter**: Convert parsed data to current format
2. **Test matrix population**: Ensure 7x7 boolean and slotInfo matrices work
3. **Integration function**: Connect to existing HomePage.js logic
4. **Test rendering**: Ensure schedule grid displays imported data

**Success Criteria:** ✅ Parsed courses appear in the schedule grid correctly

### **Day 6: User Interface Components**
```bash
# Study existing UI patterns:
cat public/templates/home.html               # Study template structure
cat src/js/components/modals/Modal.js        # Study modal patterns
```

**Tasks:**
1. **Add import button to home.html**: Follow existing button patterns
2. **Create import modal UI**: Text paste and file upload sections
3. **Style with existing CSS**: Use components.css classes
4. **Add event listeners**: Connect buttons to service functions

**Success Criteria:** ✅ Import modal opens and accepts text input

### **Day 7: Text Processing Integration**
```bash
# Test complete text parsing flow:
npm test src/js/tests/services/schedule-import.test.js
```

**Tasks:**
1. **Connect UI to UniversityParser**: Process textarea input
2. **Show parsing results**: Display parsed courses in preview
3. **Add error handling**: Show friendly error messages
4. **Add loading states**: Show processing indicators

**Success Criteria:** ✅ Can paste schedule text and see parsed course list

### **Day 8: Schedule Integration & Save**
```bash
# Test complete integration:
# 1. Paste schedule text
# 2. See parsed courses  
# 3. Save to current system
# 4. See updated schedule grid
```

**Tasks:**
1. **Connect to existing localStorage**: Use existing save patterns from HomePage.js
2. **Update schedule matrices**: Populate user schedule with imported data
3. **Trigger re-render**: Call existing renderScheduleGrid() function
4. **Add success feedback**: Show import success message

**Success Criteria:** ✅ Complete flow from text paste to schedule display works

### **Day 9: Testing & Edge Cases**
```bash
# Create comprehensive test suite:
npm test src/js/tests/services/schedule-import.test.js  # Run your tests
```

**Tasks:**
1. **Write test suite**: Following existing test patterns in `src/js/tests/`
2. **Test edge cases**: Empty input, malformed courses, unknown day codes
3. **Test error handling**: Network errors, parsing failures
4. **Add data validation**: Prevent corrupt schedule data

**Success Criteria:** ✅ All tests pass, handles edge cases gracefully

### **Day 10: OCR Integration (Optional)** 
```bash
# Only if basic text parsing is solid:
npm install tesseract.js  # Add OCR capability
```

**Tasks:**
1. **Add Tesseract.js**: Client-side image OCR
2. **Create image upload handler**: Process schedule screenshots
3. **OCR preprocessing**: Optimize image for text extraction
4. **Fallback handling**: If OCR fails, show manual text input

**Success Criteria:** ✅ Can upload schedule image and extract text automatically

## 🧪 Testing Strategy (Following CampXus Patterns)

### Study Existing Tests First:
```bash
# Look at existing test patterns:
cat src/js/tests/core/script.test.js        # Study test structure
npm test src/js/tests/firebase/             # Study Firebase test patterns
```

### Create Your Test Files:
```javascript
// src/js/tests/services/schedule-import.test.js
import { ScheduleImportService } from '../../services/schedule/ScheduleImportService.js';
import { UniversityParser } from '../../services/schedule/UniversityParser.js';

// Follow existing test patterns - use describe/it/expect
describe('Schedule Import System', () => {
  let importService;
  
  beforeEach(() => {
    importService = new ScheduleImportService();
  });
  
  it('should parse university course string correctly', () => {
    const testCourse = "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z";
    const parsed = importService.parser.parseCourseLine(testCourse);
    
    expect(parsed.courseCode).toBe('CMN205');
    expect(parsed.days).toEqual(['sunday', 'tuesday']);
    expect(parsed.timeSlotIndex).toBeGreaterThanOrEqual(0);
  });
  
  // Add more tests...
});
```

## 🐛 Common Debugging Issues & Solutions

### Issue 1: "Cannot find module timeUtils"
```bash
# Solution: Check your import paths
ls src/js/utils/time/timeUtils.js  # Verify file exists
# Fix: Use correct relative path: '../../utils/time/timeUtils.js'
```

### Issue 2: "Schedule grid not updating"
```bash
# Solution: Check if you're calling existing render function
# Study: src/js/pages/HomePage.js - look for renderScheduleGrid()
# Fix: Call renderScheduleGrid() after updating schedule matrices
```

### Issue 3: "Time slot index -1 (not found)"
```bash
# Solution: Check time format matching
console.log(DEFAULT_TIMESLOTS);  # See available time slots
console.log(parsedCourse.startTime, parsedCourse.endTime);  # Check parsed times
# Fix: Ensure parsed times exactly match slot start/end times
```

### Issue 4: "Day codes not mapping correctly" 
```bash
# Solution: Check constants and case sensitivity
console.log(UNIVERSITY_DAY_CODES);  # See available day codes
console.log(parsedCourse.dayCode);  # Check extracted day code
# Fix: Ensure day codes are uppercase and exist in constants
```

## 🎯 Debug Tools (Use Existing CampXus Tools)
```bash
# In browser console:
debug.help()                    # See available debug commands
debug.status()                  # Check system status
debug.testNotification('Import successful!')  # Test notification system

# Check your import service:
console.log(window.scheduleImportService);  # If you add it to window for debugging
```

## Success Metrics ✅
- **95%+ parsing accuracy** for your university's text format
- **<2 seconds** processing time for text parsing
- **<5 seconds** processing time for image OCR
- **100% integration** with your current schedule system
- **Zero breaking changes** to existing functionality

## Future Enhancements
- AI-powered parsing improvements
- Batch processing for multiple schedules
- Integration with university registration systems
- Mobile app camera integration
- Schedule change detection and updates

This Phase 0 creates a robust foundation for automated schedule import that will seamlessly feed into Phase 1's storage system, making CampXus incredibly user-friendly for new students setting up their schedules.