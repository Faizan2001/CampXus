/**
 * University Campus Configuration
 *
 * This module defines campus boundaries and geographic configurations for universities.
 * Each campus is defined by polygon boundaries to accurately determine if a user is
 * physically present on campus grounds.
 *
 * Phase 1.2 - Campus Presence Implementation Plan
 *
 * @author MeetchuThere Development Team
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
      lng: 90.4276247252782,
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
      /*

      lat: 23.816244793626687, lng: 90.42697717677866
      lat: 23.81638220669206, lng: 90.42728294858429
      lat: 23.816455820774383, lng: 90.42756726271936
      lat: 23.816460728378388, lng: 90.42789449219556
      lat: 23.81642637514646, lng: 90.4282378149247
      lat: 23.81624970123868, lng: 90.42823245050705
      lat: 23.81587672219924, lng: 90.42822172167176
      lat: 23.815631340667796, lng: 90.42817880633062
      lat: 23.81532215927776, lng: 90.42825390817761
      lat: 23.81516020682289, lng: 90.42824854376603
      lat: 23.814885377965222, lng: 90.42817880633811
      lat: 23.814659625254016, lng: 90.42776038177063
      lat: 23.814669440597452, lng: 90.42742778788364
      lat: 23.814821578325766, lng: 90.42714347375446
      lat: 23.81501297715006, lng: 90.42703618540384
      lat: 23.81538595866356, lng: 90.42699863448111
      lat: 23.81560680247562, lng: 90.42692889705319
      lat: 23.81583255353963, lng: 90.42691816821814
      lat: 23.816136826091682, lng: 90.42693962588824

      */

      { lat: 23.816244793626687, lng: 90.42697717677866 },
      { lat: 23.81638220669206, lng: 90.42728294858429 },
      { lat: 23.816455820774383, lng: 90.42756726271936 },
      { lat: 23.816460728378388, lng: 90.42789449219556 },
      { lat: 23.81642637514646, lng: 90.4282378149247 },
      { lat: 23.81624970123868, lng: 90.42823245050705 },
      { lat: 23.81587672219924, lng: 90.42822172167176 },
      { lat: 23.815631340667796, lng: 90.42817880633062 },
      { lat: 23.81532215927776, lng: 90.42825390817761 },
      { lat: 23.81516020682289, lng: 90.42824854376603 },
      { lat: 23.814885377965222, lng: 90.42817880633811 },
      { lat: 23.814659625254016, lng: 90.42776038177063 },
      { lat: 23.814669440597452, lng: 90.42742778788364 },
      { lat: 23.814821578325766, lng: 90.42714347375446 },
      { lat: 23.81501297715006, lng: 90.42703618540384 },
      { lat: 23.81538595866356, lng: 90.42699863448111 },
      { lat: 23.81560680247562, lng: 90.42692889705319 },
      { lat: 23.81583255353963, lng: 90.42691816821814 },
      { lat: 23.816136826091682, lng: 90.42693962588824 },
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
      "Parking Areas",
    ],

    // NEW and IMPROVED: Network information for IP-based campus detection
    // Uses organization name detection instead of fragile IP ranges
    networkInfo: {
      organization: "Independent Univeristy, Bangladesh", // Legacy org match (kept for fallback)
      asname: "INDEPENDENT-AS-AP", // Legacy ASN name (kept for fallback)
      // New: authoritative AS domain for IPinfo Lite tier-1 detection
      asDomain: "iub.edu.bd",
      // Alternative organization names to check (for variations in spelling/formatting)
      alternativeNames: [
        "Independent University, Bangladesh",
        "Independent University Bangladesh",
        "IUB",
      ],
    },

    // REMOVED: Old ipRanges are no longer needed with organization-based detection
    // This new method is more reliable and scales better to other universities
  },
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
    console.warn("UniversityCampusConfig: No university code provided");
    return null;
  }
  const normalizedUniversity = university.toLowerCase();
  const config = campuses[normalizedUniversity];
  if (!config) {
    console.warn(
      `UniversityCampusConfig: No configuration found for university: ${university}`
    );
    return null;
  }
  // Loaded configuration for campus
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
  // Universities configured: count
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
  const requiredFields = ["name", "shortCode", "center", "boundary"];
  const hasAllFields = requiredFields.every(
    (field) => config[field] !== undefined
  );
  if (!hasAllFields) {
    console.error(
      `UniversityCampusConfig: Invalid configuration for ${university} - missing required fields`
    );
    return false;
  }
  // Validate center coordinates
  if (!config.center.lat || !config.center.lng) {
    console.error(
      `UniversityCampusConfig: Invalid center coordinates for ${university}`
    );
    return false;
  }
  // Validate boundary polygon
  if (!Array.isArray(config.boundary) || config.boundary.length < 3) {
    console.error(
      `UniversityCampusConfig: Invalid boundary polygon for ${university}`
    );
    return false;
  }
  // Configuration valid
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
  return config.boundary.map((point) => [point.lat, point.lng]);
}

// Export the campus configurations for direct access if needed
export { campuses };

// Log configuration loading
// Module loaded (suppress verbose banners)
