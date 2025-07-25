# Phase 0: Schedule Import System
**Foundation for Automated Schedule Processing**

## Overview
Create an intelligent schedule import system that can process university schedule images and text data, automatically extracting course codes, times, room numbers, and converting day codes (ST=Sunday/Tuesday, AR=Thursday/Saturday, MW=Monday/Wednesday) into structured data ready for Phase 1 storage.

## Technical Architecture

### 1. Import Processing Pipeline
```javascript
// Core schedule import workflow
const ScheduleImportManager = {
  // Main entry points
  processImageUpload(imageFile) → Promise<ParsedSchedule>
  processTextPaste(textData) → Promise<ParsedSchedule>
  
  // Processing pipeline
  extractTextFromImage(imageFile) → Promise<string>
  parseScheduleText(text) → ParsedCourses[]
  validateAndFormat(courses) → ValidatedSchedule
  previewSchedule(schedule) → SchedulePreview
}
```

### 2. Day Code Translation System
```javascript
// University day code mappings
const DAY_CODE_MAPPINGS = {
  'ST': ['Sunday', 'Tuesday'],
  'MW': ['Monday', 'Wednesday'], 
  'AR': ['Thursday', 'Saturday'], // Arabic naming (Arbibar/Thursday, Saturday)
  'TR': ['Tuesday', 'Thursday'],
  'MWF': ['Monday', 'Wednesday', 'Friday'],
  'MTWAF': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  
  // Single day codes
  'S': ['Sunday'],
  'M': ['Monday'],
  'T': ['Tuesday'],
  'W': ['Wednesday'],
  'A': ['Thursday'],
  'F': ['Friday'],
  'R': ['Saturday'] // Arabic Saturday
};
```

### 3. Text Parsing Engine
```javascript
// Course information extraction patterns
const PARSING_PATTERNS = {
  // Pattern: "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z"
  COURSE_PATTERN: /^([A-Z]{2,4}\d{3})\s+(.+?)\s+(\d+)\s+([A-Z]\d{4})\s+([A-Z]{1,5}):(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/,
  
  // Alternative patterns for different university formats
  SIMPLE_PATTERN: /([A-Z]{2,4}\d{3})\s+(.+?)\s+([A-Z]{1,5})\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/,
  TIME_PATTERN: /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/,
  DAY_PATTERN: /\b([A-Z]{1,5}):/,
  ROOM_PATTERN: /([A-Z]\d{3,4}|\d{3,4}[A-Z]?)/
};
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

### 5. Integration with Phase 1 Database Structure
```javascript
// Convert imported data to Phase 1 format
class ScheduleDataAdapter {
  adaptToPhase1Format(validatedCourses, userId) {
    return {
      userId,
      courses: validatedCourses.map(course => ({
        // Phase 1 compatible format
        courseId: this.generateCourseId(course),
        courseCode: course.courseCode,
        courseName: course.courseName,
        credits: course.credits,
        room: course.room,
        
        // Time slots for each day
        timeSlots: course.days.map(day => ({
          day: day.toLowerCase(),
          startTime: course.startTime.formatted,
          endTime: course.endTime.formatted,
          startMinutes: this.timeToMinutes(course.startTime),
          endMinutes: this.timeToMinutes(course.endTime)
        })),
        
        // Metadata
        semester: course.semester,
        importSource: 'automated_import',
        importedAt: new Date().toISOString(),
        originalData: course.originalString // For debugging
      })),
      
      // Schedule metadata
      metadata: {
        totalCourses: validatedCourses.length,
        importMethod: 'phase_0_import',
        lastUpdated: new Date().toISOString(),
        autoGenerated: true
      }
    };
  }
  
  generateCourseId(course) {
    // Create unique ID from course code + time + days
    const timeSignature = `${course.startTime.formatted}-${course.endTime.formatted}`;
    const daySignature = course.days.sort().join('');
    return `${course.courseCode}_${daySignature}_${timeSignature}`.toLowerCase();
  }
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

## Implementation Timeline

### Week 1-2: Foundation
- Set up OCR integration (Tesseract.js)
- Create text parsing engine
- Implement day code conversion system

### Week 3: User Interface
- Build upload/paste interface
- Create schedule preview system
- Add manual editing capabilities

### Week 4: Integration & Testing
- Connect to Phase 1 database format
- Test with various university schedule formats
- Optimize parsing accuracy

## Success Metrics
- **90%+ parsing accuracy** for standard university schedule formats
- **<3 seconds** processing time for typical schedule images
- **<5 manual corrections** needed per 20-course schedule
- **Support for 5+ university schedule formats**

## Future Enhancements
- AI-powered parsing improvements
- Batch processing for multiple schedules
- Integration with university registration systems
- Mobile app camera integration
- Schedule change detection and updates

This Phase 0 creates a robust foundation for automated schedule import that will seamlessly feed into Phase 1's storage system, making CampXus incredibly user-friendly for new students setting up their schedules.