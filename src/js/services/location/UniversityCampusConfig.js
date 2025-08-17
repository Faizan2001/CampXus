/**
 * University Campus Configuration
 * 
 * This module defines campus boundaries and geographic configurations for universities.
 * Each campus is defined by polygon boundaries to accurately determine if a user is
 * physically present on campus grounds.
 * 
 * Phase 1.2 - Campus Presence Implementation Plan
 * 
 * @author CampXus Development Team
 * @version 1.0.0
 */

/**
 * Campus configuration object containing boundary definitions for supported universities.
 * 
 * Structure:
 * - Each university is identified by its short code (e.g., 'iub')
 * - Campus boundaries are defined as polygon arrays of lat/lng coordinates
 * - Polygon points should be ordered clockwise or counter-clockwise consistently
 * - Include center point for campus-wide calculations
 * 
 * IMPORTANT: Current coordinates are PLACEHOLDERS
 * Real IUB campus coordinates will be provided and updated later
 */
const campuses = {
  /**
   * Independent University, Bangladesh (IUB)
   * Location: Bashundhara, Dhaka, Bangladesh
   * 
   * NOTE: These are PLACEHOLDER coordinates
   * Real IUB campus boundary coordinates will be provided later
   */
  iub: {
    name: "Independent University, Bangladesh",
    shortCode: "iub",
    
    // Campus center point (approximate middle of campus)
    // PLACEHOLDER: Will be replaced with actual IUB center coordinates
    center: {
      lat: 23.8103, // Placeholder latitude
      lng: 90.4125  // Placeholder longitude
    },
    
    /**
     * Campus boundary polygon definition
     * 
     * Array of lat/lng coordinate objects that define the campus perimeter.
     * Points should form a closed polygon that encompasses all campus buildings
     * and facilities where students would be considered "on campus".
     * 
     * PLACEHOLDER COORDINATES: These form a small rectangular boundary
     * for testing purposes. Real IUB campus boundary will be much more detailed
     * and accurately reflect the actual campus perimeter.
     */
    boundary: [
      { lat: 23.8120, lng: 90.4100 }, // Northwest corner (PLACEHOLDER)
      { lat: 23.8120, lng: 90.4150 }, // Northeast corner (PLACEHOLDER)
      { lat: 23.8086, lng: 90.4150 }, // Southeast corner (PLACEHOLDER)
      { lat: 23.8086, lng: 90.4100 }, // Southwest corner (PLACEHOLDER)
      { lat: 23.8120, lng: 90.4100 }  // Close polygon (PLACEHOLDER)
    ],
    
    // Campus metadata
    timezone: "Asia/Dhaka",
    country: "Bangladesh",
    city: "Dhaka",
    district: "Bashundhara",
    
    // Campus facilities for enhanced presence detection
    facilities: [
      "Main Academic Building",
      "Library",
      "Student Center",
      "Cafeteria",
      "Sports Complex",
      "Parking Areas"
    ]
  }
  
  // Additional universities can be added here following the same structure
  // Example structure for future expansion:
  // 
  // nsu: {
  //   name: "North South University",
  //   shortCode: "nsu",
  //   center: { lat: 23.xxxx, lng: 90.xxxx },
  //   boundary: [
  //     { lat: xx.xxxx, lng: xx.xxxx },
  //     // ... more boundary points
  //   ],
  //   timezone: "Asia/Dhaka",
  //   country: "Bangladesh"
  // }
};

/**
 * Retrieves campus configuration for a specific university
 * 
 * @param {string} university - University short code (e.g., 'iub', 'nsu')
 * @returns {Object|null} Campus configuration object or null if not found
 * 
 * @example
 * const iubConfig = getCampusConfig('iub');
 * console.log(iubConfig.center); // { lat: 23.8103, lng: 90.4125 }
 */
export function getCampusConfig(university) {
  if (!university) {
    console.warn('UniversityCampusConfig: No university code provided');
    return null;
  }
  
  const normalizedUniversity = university.toLowerCase();
  const config = campuses[normalizedUniversity];
  
  if (!config) {
    console.warn(`UniversityCampusConfig: No configuration found for university: ${university}`);
    return null;
  }
  
  console.log(`UniversityCampusConfig: Loaded configuration for ${config.name}`);
  return config;
}

/**
 * Gets all supported university codes
 * 
 * @returns {string[]} Array of supported university short codes
 * 
 * @example
 * const supported = getSupportedUniversities();
 * console.log(supported); // ['iub']
 */
export function getSupportedUniversities() {
  const universities = Object.keys(campuses);
  console.log(`UniversityCampusConfig: ${universities.length} universities configured:`, universities);
  return universities;
}

/**
 * Validates if a campus configuration has all required fields
 * 
 * @param {string} university - University short code to validate
 * @returns {boolean} True if configuration is valid, false otherwise
 */
export function validateCampusConfig(university) {
  const config = getCampusConfig(university);
  
  if (!config) {
    return false;
  }
  
  // Check required fields
  const requiredFields = ['name', 'shortCode', 'center', 'boundary'];
  const hasAllFields = requiredFields.every(field => config[field] !== undefined);
  
  if (!hasAllFields) {
    console.error(`UniversityCampusConfig: Invalid configuration for ${university} - missing required fields`);
    return false;
  }
  
  // Validate center coordinates
  if (!config.center.lat || !config.center.lng) {
    console.error(`UniversityCampusConfig: Invalid center coordinates for ${university}`);
    return false;
  }
  
  // Validate boundary polygon
  if (!Array.isArray(config.boundary) || config.boundary.length < 3) {
    console.error(`UniversityCampusConfig: Invalid boundary polygon for ${university}`);
    return false;
  }
  
  console.log(`UniversityCampusConfig: Configuration for ${university} is valid`);
  return true;
}

/**
 * Gets campus boundary as a simple array for mapping libraries
 * 
 * @param {string} university - University short code
 * @returns {Array|null} Array of [lat, lng] coordinate pairs or null if not found
 * 
 * @example
 * const boundary = getCampusBoundaryArray('iub');
 * // Returns: [[23.8120, 90.4100], [23.8120, 90.4150], ...]
 */
export function getCampusBoundaryArray(university) {
  const config = getCampusConfig(university);
  
  if (!config || !config.boundary) {
    return null;
  }
  
  return config.boundary.map(point => [point.lat, point.lng]);
}

// Export the campus configurations for direct access if needed
export { campuses };

// Log configuration loading
console.log('UniversityCampusConfig: Module loaded with campus configurations');
console.log(`UniversityCampusConfig: IMPORTANT - Current coordinates are PLACEHOLDERS for testing`);
console.log(`UniversityCampusConfig: Real IUB campus coordinates will be provided later`);