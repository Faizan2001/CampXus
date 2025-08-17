/**
 * CampusLocationService.js
 * 
 * Service for detecting campus presence using geolocation and polygon-based boundary detection.
 * Implements point-in-polygon algorithm to determine if user is physically on campus.
 * 
 * Phase 1.1 - Campus Presence Implementation
 */

// Import campus boundary configurations
import { getCampusConfig, validateCampusConfig } from './UniversityCampusConfig.js';

/**
 * Service class for campus location detection and presence management
 */
export class CampusLocationService {
    constructor() {
        this.isLocationSupported = 'geolocation' in navigator;
        this.currentPosition = null;
        this.permissionStatus = null;
        
        console.log('[CampusLocationService] Service initialized', {
            geolocationSupported: this.isLocationSupported,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Request geolocation permission from the browser
     * @returns {Promise<boolean>} True if permission granted, false otherwise
     */
    async requestLocationPermission() {
        console.log('[CampusLocationService] Requesting location permission...');
        
        if (!this.isLocationSupported) {
            console.error('[CampusLocationService] Geolocation not supported by browser');
            return false;
        }

        try {
            // Check if permissions API is available
            if ('permissions' in navigator) {
                const permission = await navigator.permissions.query({ name: 'geolocation' });
                this.permissionStatus = permission.state;
                
                console.log('[CampusLocationService] Permission status:', permission.state);
                
                // Listen for permission changes
                permission.addEventListener('change', () => {
                    this.permissionStatus = permission.state;
                    console.log('[CampusLocationService] Permission changed to:', permission.state);
                });
                
                return permission.state === 'granted';
            } else {
                // Fallback: Try to get position to test permission
                console.log('[CampusLocationService] Permissions API not available, testing with getCurrentPosition');
                
                return new Promise((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            console.log('[CampusLocationService] Location permission granted (via test)');
                            this.permissionStatus = 'granted';
                            resolve(true);
                        },
                        (error) => {
                            console.log('[CampusLocationService] Location permission denied or error:', error.message);
                            this.permissionStatus = error.code === 1 ? 'denied' : 'prompt';
                            resolve(false);
                        },
                        { timeout: 5000 }
                    );
                });
            }
        } catch (error) {
            console.error('[CampusLocationService] Error requesting location permission:', error);
            this.permissionStatus = 'denied';
            return false;
        }
    }

    /**
     * Get current location from browser geolocation API
     * @returns {Promise<GeolocationPosition|null>} Current position or null if failed
     */
    async getCurrentLocation() {
        console.log('[CampusLocationService] Getting current location...');
        
        if (!this.isLocationSupported) {
            console.error('[CampusLocationService] Geolocation not supported');
            return null;
        }

        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes cache
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = position;
                    console.log('[CampusLocationService] Location obtained:', {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date(position.timestamp).toISOString()
                    });
                    resolve(position);
                },
                (error) => {
                    console.error('[CampusLocationService] Error getting location:', {
                        code: error.code,
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Log specific error types
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            console.error('[CampusLocationService] Location access denied by user');
                            break;
                        case error.POSITION_UNAVAILABLE:
                            console.error('[CampusLocationService] Location information unavailable');
                            break;
                        case error.TIMEOUT:
                            console.error('[CampusLocationService] Location request timeout');
                            break;
                        default:
                            console.error('[CampusLocationService] Unknown location error');
                            break;
                    }
                    
                    resolve(null);
                },
                options
            );
        });
    }

    /**
     * Detect if user is currently on campus for a specific university
     * @param {string} university - University code (e.g., 'iub', 'du')
     * @returns {Promise<{onCampus: boolean, confidence: number, location?: object}>}
     */
    async detectCampusPresence(university) {
        console.log('[CampusLocationService] Detecting campus presence for:', university);
        
        try {
            // Get current location
            const position = await this.getCurrentLocation();
            if (!position) {
                console.warn('[CampusLocationService] Cannot detect campus presence - location unavailable');
                return {
                    onCampus: false,
                    confidence: 0,
                    error: 'Location unavailable'
                };
            }

            // Check if on campus using polygon detection
            const result = this.isLocationOnCampus(position, university);
            
            console.log('[CampusLocationService] Campus presence detection result:', {
                university,
                onCampus: result.onCampus,
                confidence: result.confidence,
                location: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                },
                timestamp: new Date().toISOString()
            });

            return {
                ...result,
                location: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                }
            };

        } catch (error) {
            console.error('[CampusLocationService] Error detecting campus presence:', error);
            return {
                onCampus: false,
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Check if a given location is within campus boundaries
     * @param {GeolocationPosition} position - User's current position
     * @param {string} university - University code
     * @returns {{onCampus: boolean, confidence: number, distanceFromCenter?: number}}
     */
    isLocationOnCampus(position, university) {
        console.log('[CampusLocationService] Checking if location is on campus:', {
            university,
            lat: position.coords.latitude,
            lng: position.coords.longitude
        });

        // Get campus configuration for the university
        const campusConfig = getCampusConfig(university);
        if (!campusConfig) {
            console.error('[CampusLocationService] No campus configuration found for:', university);
            return {
                onCampus: false,
                confidence: 0,
                error: 'Campus configuration not found'
            };
        }

        const userPoint = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        // Check against campus boundary polygon
        const isInside = this.pointInPolygon(userPoint, campusConfig.boundary);
        
        // Calculate distance from campus center for confidence scoring
        const distanceFromCenter = this.calculateDistance(
            userPoint,
            campusConfig.center
        );

        // Calculate confidence based on accuracy and distance from center
        let confidence = 0;
        if (isInside) {
            // High confidence if inside boundary and good GPS accuracy
            const accuracyFactor = Math.max(0, 1 - (position.coords.accuracy / 100));
            const distanceFactor = Math.max(0, 1 - (distanceFromCenter / campusConfig.radius));
            confidence = Math.min(1, (accuracyFactor * 0.6) + (distanceFactor * 0.4));
        }

        console.log('[CampusLocationService] Campus boundary check result:', {
            university,
            isInside,
            confidence: Math.round(confidence * 100),
            distanceFromCenter: Math.round(distanceFromCenter),
            gpsAccuracy: position.coords.accuracy,
            campusRadius: campusConfig.radius
        });

        return {
            onCampus: isInside,
            confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
            distanceFromCenter: Math.round(distanceFromCenter)
        };
    }

    /**
     * Point-in-polygon algorithm implementation (Ray Casting)
     * @param {object} point - Point to test {lat, lng}
     * @param {Array} polygon - Array of points defining the polygon boundary
     * @returns {boolean} True if point is inside polygon
     */
    pointInPolygon(point, polygon) {
        console.log('[CampusLocationService] Running point-in-polygon check for:', {
            point,
            polygonVertices: polygon.length
        });

        if (!polygon || polygon.length < 3) {
            console.error('[CampusLocationService] Invalid polygon - need at least 3 vertices');
            return false;
        }

        let isInside = false;
        const x = point.lng;
        const y = point.lat;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng;
            const yi = polygon[i].lat;
            const xj = polygon[j].lng;
            const yj = polygon[j].lat;

            // Ray casting algorithm
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                isInside = !isInside;
            }
        }

        console.log('[CampusLocationService] Point-in-polygon result:', {
            point,
            isInside,
            algorithm: 'ray-casting'
        });

        return isInside;
    }

    /**
     * Calculate distance between two geographic points using Haversine formula
     * @param {object} point1 - First point {lat, lng}
     * @param {object} point2 - Second point {lat, lng}
     * @returns {number} Distance in meters
     */
    calculateDistance(point1, point2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = point1.lat * Math.PI / 180;
        const φ2 = point2.lat * Math.PI / 180;
        const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
        const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        const distance = R * c;
        
        console.log('[CampusLocationService] Distance calculated:', {
            from: point1,
            to: point2,
            distance: Math.round(distance),
            unit: 'meters'
        });

        return distance;
    }

    /**
     * Get current permission status
     * @returns {string|null} Permission status: 'granted', 'denied', 'prompt', or null
     */
    getPermissionStatus() {
        return this.permissionStatus;
    }

    /**
     * Check if geolocation is supported by the browser
     * @returns {boolean} True if supported
     */
    isGeolocationSupported() {
        return this.isLocationSupported;
    }

    /**
     * Get the last known position
     * @returns {GeolocationPosition|null} Last known position or null
     */
    getLastKnownPosition() {
        return this.currentPosition;
    }

    /**
     * Start watching position changes (for future real-time tracking)
     * @param {Function} callback - Callback function for position updates
     * @returns {number|null} Watch ID for stopping the watch
     */
    watchPosition(callback) {
        console.log('[CampusLocationService] Starting position watch...');
        
        if (!this.isLocationSupported) {
            console.error('[CampusLocationService] Cannot watch position - geolocation not supported');
            return null;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000 // 30 seconds cache for watch
        };

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                this.currentPosition = position;
                console.log('[CampusLocationService] Position update received:', {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date(position.timestamp).toISOString()
                });
                callback(position);
            },
            (error) => {
                console.error('[CampusLocationService] Position watch error:', error);
                callback(null, error);
            },
            options
        );

        console.log('[CampusLocationService] Position watch started with ID:', watchId);
        return watchId;
    }

    /**
     * Stop watching position changes
     * @param {number} watchId - Watch ID returned from watchPosition
     */
    clearWatch(watchId) {
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
            console.log('[CampusLocationService] Position watch stopped for ID:', watchId);
        }
    }
}

// Export singleton instance
export const campusLocationService = new CampusLocationService();