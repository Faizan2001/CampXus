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
     //23.815610813206195, 90.4276247252782 Center point (non-calculated)
     lat: 23.815610813206195,
     lng: 90.4276247252782
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
    
    // 23.816233615715767, 90.4267696486499
    // 23.816361213577995, 90.42748043403199
    // 23.81648390371185, 90.42788008317136
    // 23.816486357513334, 90.4284084783422
    // 23.816228708103175, 90.42838702067029
    // 23.816103563915057, 90.42817244395148
    // 23.815826283235, 90.42824486359416
    // 23.815679054314593, 90.42828241452003
    // 23.815308527444614, 90.42841920718035
    // 23.814825123261915, 90.42848089798771
    // 23.814677893206014, 90.42853185995848
    // 23.814712246900662, 90.42759308681234
    // 23.814937999525018, 90.42730072603254
    // 23.815014068255657, 90.4271129714033
    // 23.815507287014324, 90.42692521677338
    // 23.81585082135677, 90.427021776297
    // 23.816133009600808, 90.42693058119139

    { lat: 23.816233615715767, lng: 90.4267696486499 },
    { lat: 23.816361213577995, lng: 90.42748043403199 },
    { lat: 23.81648390371185, lng: 90.42788008317136 },
    { lat: 23.816486357513334, lng: 90.4284084783422 },
    { lat: 23.816228708103175, lng: 90.42838702067029 },
    { lat: 23.816103563915057, lng: 90.42817244395148 },
    { lat: 23.815826283235, lng: 90.42824486359416 },
    { lat: 23.815679054314593, lng: 90.42828241452003 },
    { lat: 23.815308527444614, lng: 90.42841920718035 },
    { lat: 23.814825123261915, lng: 90.42848089798771 },
    { lat: 23.814677893206014, lng: 90.42853185995848 },
    { lat: 23.814712246900662, lng: 90.42759308681234 },
    { lat: 23.814937999525018, lng: 90.42730072603254 },
    { lat: 23.815014068255657, lng: 90.4271129714033 },
    { lat: 23.815507287014324, lng: 90.42692521677338 },
    { lat: 23.81585082135677, lng: 90.427021776297 },
    { lat: 23.816133009600808, lng: 90.42693058119139 }
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
   ],
  
   // NEW and IMPROVED: Network information for IP-based campus detection
   // Uses organization name detection instead of fragile IP ranges
   networkInfo: {
     organization: "Independent Univeristy, Bangladesh", // From ip-api.com 'org' field
     asname: "INDEPENDENT-AS-AP", // From ip-api.com 'asname' field (fallback)
     // Alternative organization names to check (for variations in spelling/formatting)
     alternativeNames: [
       "Independent University, Bangladesh",
       "Independent University Bangladesh",
       "IUB"
     ]
   }
   
   // REMOVED: Old ipRanges are no longer needed with organization-based detection
   // This new method is more reliable and scales better to other universities
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


