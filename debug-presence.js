// Debug script for presence dot issues
// Run this in browser console after page loads

function debugPresenceSystem() {
  console.log('🔍 PRESENCE DEBUG SYSTEM - Run in browser console');
  console.log('===============================================');
  
  // Check current user data
  if (typeof window.currentUser !== 'undefined') {
    const user = window.currentUser;
    console.log('👤 Current User Data:');
    console.log('  - UID:', user.uid);
    console.log('  - Display Name:', user.profile?.displayName);
    console.log('  - System Info:', user.systemInfo);
    console.log('  - Last Active:', user.systemInfo?.lastActive);
    console.log('  - Location Sharing:', user.systemInfo?.locationSharingEnabled);
    console.log('  - Last Known Location:', user.systemInfo?.lastKnownLocation);
    
    if (user.systemInfo?.lastKnownLocation) {
      console.log('  - Campus Status:', user.systemInfo.lastKnownLocation.campusStatus);
      console.log('  - Detected At:', user.systemInfo.lastKnownLocation.detectedAt);
      console.log('  - Last Updated:', user.systemInfo.lastKnownLocation.lastUpdated);
    }
  } else {
    console.log('❌ window.currentUser not available');
  }
  
  // Check location service
  if (typeof window.campusLocationService !== 'undefined') {
    console.log('\n📍 Campus Location Service:');
    console.log('  - Service available:', !!window.campusLocationService);
    console.log('  - Is online:', window.campusLocationService.isOnline);
    console.log('  - Location sharing enabled:', window.campusLocationService.locationSharingEnabled);
  }
  
  // Check database manager
  if (typeof window.dataManager !== 'undefined') {
    console.log('\n🔥 Database Manager:');
    console.log('  - Service available:', !!window.dataManager);
    console.log('  - Is online:', window.dataManager.isOnline);
  }
  
  // Test immediate location update
  console.log('\n🧪 TESTING: Manual location status update...');
  if (window.dataManager && window.currentUser) {
    window.dataManager.updateUserLocationStatus(
      window.currentUser.uid, 
      'off_campus', 
      { latitude: 23.8184155, longitude: 90.4279487 }
    ).then(result => {
      console.log('✅ Manual location update result:', result);
      
      // Wait 2 seconds then check if presence dot updated
      setTimeout(() => {
        console.log('🔍 Checking presence dot after manual update...');
        const userAvatar = document.querySelector('.user-avatar .presence-dot');
        if (userAvatar) {
          console.log('📍 User presence dot found:', userAvatar.outerHTML);
          console.log('📍 Dot class:', userAvatar.className);
          console.log('📍 Dot text:', userAvatar.textContent.trim());
        } else {
          console.log('❌ User presence dot not found in DOM');
        }
      }, 2000);
    }).catch(error => {
      console.error('❌ Manual location update failed:', error);
    });
  }
  
  console.log('\n💡 DEBUG COMMANDS:');
  console.log('  - debugPresenceSystem() - Run this function');
  console.log('  - window.currentUser - Check user data');
  console.log('  - window.campusLocationService - Check location service');
  console.log('  - window.dataManager - Check database service');
}

// Auto-run when script loads
debugPresenceSystem();

// Make function available globally
window.debugPresenceSystem = debugPresenceSystem;