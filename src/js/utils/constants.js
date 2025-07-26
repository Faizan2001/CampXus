export const DEFAULT_TIMESLOTS = [
  { start: "08:00", end: "09:30", label: "08:00-09:30" },
  { start: "09:40", end: "11:10", label: "09:40-11:10" },
  { start: "11:20", end: "12:50", label: "11:20-12:50" },
  { start: "13:00", end: "14:30", label: "13:00-14:30" },
  { start: "14:40", end: "16:10", label: "14:40-16:10" },
  { start: "16:20", end: "17:50", label: "16:20-17:50" },
  { start: "18:30", end: "21:30", label: "18:30-21:30" }, // Evening classes
];

export const LOCAL_STORAGE_KEY = "scheduleUsers";

// University day codes mapping (from Phase-0 plan)
export const UNIVERSITY_DAY_CODES = {
  'ST': ['sunday', 'tuesday'],        // Sunday + Tuesday
  'MW': ['monday', 'wednesday'],      // Monday + Wednesday  
  'AR': ['thursday', 'saturday'],     // Thursday + Saturday
  'T': ['tuesday'],                   // Tuesday only
  'TR': ['tuesday', 'thursday'],      // Tuesday + Thursday
  'MWF': ['monday', 'wednesday', 'friday'], // Monday + Wednesday + Friday
  
  // Single day codes (if needed)
  'S': ['sunday'],
  'M': ['monday'],
  'W': ['wednesday'],
  'A': ['thursday'],    // 'A' represents Thursday in university system
  'F': ['friday'],
  'R': ['saturday']     // 'R' represents Saturday in university system
};

// Schedule parsing patterns for text import
export const SCHEDULE_PARSING_PATTERNS = {
  // Main pattern: "CMN205 Introduction to Interactive Media 2 C2002 ST:14:40-16:10 12/14 Z"
  MAIN_PATTERN: /^([A-Z]{2,4}\d{3})\s+(.+?)\s+(\d+)\s+([A-Z]{1,2}\d{3,4}|GPLab)\s+([A-Z]{1,5}):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(.+)$/,
  
  // Alternative pattern for multiline or different formats  
  MULTILINE_PATTERN: /^([A-Z]{2,4}\d{3})\s+(.+?)\s+(\d+)\s+(GPLab|[A-Z]{1,2}\d{3,4})\s+([A-Z]{1,5}):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(.+)$/,
  
  // Course info pattern (for when course info and schedule are on separate lines)
  COURSE_INFO_PATTERN: /^([A-Z]{2,4}\d{3})\s+(.+?)\s+(\d+)\s+([A-Z]{1,2}\d{3,4}|GPLab)$/,
  
  // Schedule line pattern (for when schedule is on separate line)
  SCHEDULE_LINE_PATTERN: /^([A-Z]{1,5}):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(.+)$/,
  
  // Time normalization pattern (handles OCR errors like "16:1" → "16:10")
  TIME_NORMALIZATION: /(\d{1,2}):?(\d{1,2}?)-(\d{1,2}):?(\d{1,2}?)/
};
