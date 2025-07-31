# Bilateral Privacy System Testing Guide

## Overview

This guide outlines the key test scenarios for the bilateral privacy system implemented in CampXus. The system has been migrated from flawed user-centric privacy storage to a secure friendship-centric bilateral privacy model.

## System Architecture Tested

### Database Structure
- **Friendship Documents**: `friendships/{friendshipId}` with bilateral `scheduleVisibility` controls
- **Canonical IDs**: Friendship IDs generated as sorted user IDs (`user1_user2`)
- **Bilateral Control**: Each user controls only their own schedule visibility
- **Security Rules**: Firestore rules enforce bilateral privacy validation

### Key Components
- **FriendshipPrivacyService**: Manages bilateral privacy operations
- **FriendOptionsMenu**: UI component with "Hide My Schedule" / "Show My Schedule"
- **FriendsPage**: Integration with bilateral privacy indicators
- **Enhanced CSS**: Fixed z-index and visibility issues

## Critical Test Scenarios

### 1. Basic Bilateral Privacy Operations

#### Test Case 1.1: Individual Privacy Toggle
**Scenario**: User A toggles their schedule visibility to User B

**Steps**:
1. User A opens friends page
2. User A clicks three-dots menu for User B
3. User A clicks "Hide My Schedule"

**Expected Results**:
- User A's schedule becomes hidden from User B
- User B's schedule visibility to User A remains unchanged
- Friend card shows "You hid your schedule" for User A
- Database: `scheduleVisibility[userA_uid] = false` in friendship document

#### Test Case 1.2: Reciprocal Independence
**Scenario**: Verify both users can control their own privacy independently

**Steps**:
1. User A hides schedule from User B
2. User B hides schedule from User A
3. Check both users' perspectives

**Expected Results**:
- User A sees: "You hid your schedule" + "Friend hid their schedule"
- User B sees: "You hid your schedule" + "Friend hid their schedule"
- Database: `scheduleVisibility[userA_uid] = false, scheduleVisibility[userB_uid] = false`

### 2. Security and Conflict Prevention

#### Test Case 2.1: No Privacy Override
**Scenario**: Verify users cannot override each other's privacy settings

**Steps**:
1. User A sets their schedule visible to User B
2. User B attempts to modify User A's visibility (should be impossible via UI)
3. Direct database manipulation attempt (should be blocked by security rules)

**Expected Results**:
- UI prevents User B from controlling User A's privacy
- Firestore security rules reject unauthorized privacy updates
- Only `scheduleVisibility[userB_uid]` can be modified by User B

#### Test Case 2.2: Canonical Friendship ID Consistency
**Scenario**: Verify friendship IDs are consistent regardless of operation order

**Steps**:
1. User A (uid: "alice123") updates privacy for User B (uid: "bob456")
2. User B (uid: "bob456") updates privacy for User A (uid: "alice123")
3. Check friendship document ID

**Expected Results**:
- Both operations target same document: `alice123_bob456`
- Single source of truth maintained
- No duplicate friendship documents created

### 3. UI/UX Validation

#### Test Case 3.1: Clear Labeling
**Scenario**: Verify UI clearly shows bilateral privacy states

**Steps**:
1. User A views friend card for User B with various privacy combinations
2. Check dropdown menu labels
3. Check friend card privacy indicators

**Expected Results**:
- Menu shows "Hide My Schedule" when User A's schedule is visible
- Menu shows "Show My Schedule" when User A's schedule is hidden
- Friend card shows distinct states:
  - "Your schedule is visible" (green)
  - "You hid your schedule" (red)
  - Tooltip shows both users' privacy states

#### Test Case 3.2: Dropdown Visibility
**Scenario**: Verify dropdown menus are fully visible and functional

**Steps**:
1. Test dropdown on friend cards at different screen positions
2. Test on mobile devices
3. Test with long friend names/content

**Expected Results**:
- Dropdown has z-index: 10001 (above other elements)
- All menu items visible and clickable
- "Unfriend" option always accessible
- No clipping by parent containers

### 4. Real-time Updates and Synchronization

#### Test Case 4.1: Cross-Device Sync
**Scenario**: Privacy changes sync across multiple browser tabs/devices

**Steps**:
1. User A opens friends page in two browser tabs
2. User A changes privacy setting in Tab 1
3. Check Tab 2 for updates

**Expected Results**:
- Privacy change reflects immediately in Tab 2
- Friend card indicators update in real-time
- Dropdown menu states update automatically

#### Test Case 4.2: Friend Perspective Updates
**Scenario**: When User A changes privacy, User B sees the change

**Steps**:
1. User B has friends page open
2. User A changes their schedule visibility to User B
3. Check User B's view updates

**Expected Results**:
- User B's friend card for User A updates to show new privacy state
- User B sees "Friend's schedule hidden from you" or "Friend's schedule visible to you"
- Updates happen without page refresh

### 5. Error Handling and Edge Cases

#### Test Case 5.1: Network Failure Handling
**Scenario**: Privacy update fails due to network issues

**Steps**:
1. Disconnect from internet
2. User A attempts to change privacy setting
3. Reconnect to internet

**Expected Results**:
- Optimistic UI update shows immediate change
- Error notification on failure: "Failed to update schedule privacy"
- UI reverts to previous state on failure
- Change is retried when connection restored

#### Test Case 5.2: Friendship Deletion During Privacy Update
**Scenario**: Friendship is deleted while privacy update is in progress

**Steps**:
1. User A starts privacy update for User B
2. User B unfriends User A during the update
3. Check system behavior

**Expected Results**:
- Privacy update gracefully fails
- No orphaned privacy settings created
- User A receives appropriate error message
- System remains in consistent state

#### Test Case 5.3: Invalid Friendship Data
**Scenario**: System handles corrupted or invalid friendship documents

**Steps**:
1. Simulate friendship document with missing scheduleVisibility
2. User attempts to view/modify privacy settings
3. Check fallback behavior

**Expected Results**:
- System defaults to visible (backward compatibility)
- Privacy operations create missing fields
- No system crashes or errors
- User sees default privacy state

### 6. Performance and Scalability

#### Test Case 6.1: Large Friends List Performance
**Scenario**: Test privacy updates with 100+ friends

**Steps**:
1. User with large friends list (100+ friends)
2. Open friends page (tests bilateral privacy status loading)
3. Update individual privacy settings
4. Measure load times and responsiveness

**Expected Results**:
- Friends page loads within 3 seconds
- Individual privacy updates complete within 1 second
- UI remains responsive during batch operations
- Caching reduces redundant database queries

#### Test Case 6.2: Concurrent Privacy Updates
**Scenario**: Multiple users update privacy simultaneously

**Steps**:
1. User A and User B simultaneously update their privacy settings for each other
2. Check for race conditions or conflicts
3. Verify final state consistency

**Expected Results**:
- Firestore transactions prevent conflicts
- Both updates succeed independently
- Final database state is consistent
- No data corruption or loss

### 7. Integration with Existing Features

#### Test Case 7.1: Friend Request to Friendship Privacy Flow
**Scenario**: New friendship gets proper privacy defaults

**Steps**:
1. User A sends friend request to User B
2. User B accepts friend request
3. Check initial privacy state in friendship document

**Expected Results**:
- Friendship document created with both users' schedules visible by default
- `scheduleVisibility[userA_uid] = true, scheduleVisibility[userB_uid] = true`
- Both users can immediately see each other's schedules
- Privacy can be individually modified afterward

#### Test Case 7.2: Schedule Viewing Integration (Future)
**Scenario**: Privacy settings properly control schedule access

**Steps**:
1. User A hides schedule from User B
2. User B attempts to view User A's schedule
3. Check access control

**Expected Results**:
- User B cannot access User A's schedule data
- Firestore security rules block unauthorized access
- UI shows appropriate "Schedule not available" message
- canViewFriendSchedule() function returns false

## Automated Testing Recommendations

### Unit Tests
- FriendshipPrivacyService methods
- Canonical friendship ID generation
- Privacy status calculation logic
- Error handling scenarios

### Integration Tests  
- FriendOptionsMenu component with real privacy service
- FriendsPage rendering with various privacy states
- Real-time updates between components
- Database rule validation

### End-to-End Tests
- Complete privacy toggle workflow
- Cross-device synchronization
- Friend request to privacy management flow
- Error recovery scenarios

## Performance Benchmarks

### Acceptable Performance Metrics
- **Privacy Status Load**: < 500ms for 50 friends
- **Individual Privacy Toggle**: < 1s completion
- **Real-time Update Propagation**: < 2s across devices
- **Friends Page Load**: < 3s with 100+ friends
- **Dropdown Interaction**: < 100ms response time

### Memory Usage
- **FriendshipPrivacyService Cache**: Max 50 cached friendship documents
- **Cache Expiry**: 5 minutes automatic cleanup
- **Memory Leak Prevention**: Proper cleanup on component destroy

## Security Validation

### Firestore Security Rules Testing
- User can only update own privacy settings
- Canonical friendship ID validation
- Proper bilateral privacy validation
- Protection against privacy override attacks

### Client-Side Security
- No sensitive data in client logs
- Proper error message sanitization  
- Cache expiration and cleanup
- Protection against XSS in privacy messages

## Conclusion

This bilateral privacy system provides a secure, scalable, and user-friendly solution for schedule privacy management. The testing scenarios above ensure the system works correctly under normal conditions, handles edge cases gracefully, and maintains security and performance standards.

The migration from user-centric to friendship-centric bilateral privacy eliminates the critical database design flaws while providing a superior user experience with clear privacy controls and real-time updates.