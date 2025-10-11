# Notify Friends Feature - Complete Requirements

## **Feature Overview**

A real-time availability checking system where users can ask their starred friends "Are you free?" and receive instant responses (Available/Busy). The feature appears as a button in the header that opens an overlay with three segments showing starred friends, available responses, and busy responses.

---

## **1. UI/UX Requirements**

### **1.1 Button Placement**

- **Location**: Top-right corner of header (same level as 'MeetchuThere' logo on left)
- **Label**: "Notify Friends"
- **Badge Indicator**:
  - Colored dot (use existing notification badge color from bottom nav)
  - Appears when any friend responds (Available or Busy)
  - Disappears when user opens the overlay (marks as seen)

### **1.2 Overlay Design**

#### **Mobile (< 480px)**

- **Type**: Bottom sheet
- **Height**: Minimum 80% of screen
- **Scrollable**: Yes, if content exceeds height
- **Dismissible**:
  - Swipe down gesture
  - Tap dark overlay background
  - Close button (top-right of sheet)
- **Animation**: Slide up from bottom

#### **Desktop/Tablet**

- **Type**: Centered modal
- **Dismissible**:
  - Click dark overlay background
  - Close button (top-right of modal)
- **Animation**: Fade in with scale

#### **Overlay Structure**

- **Transparent/frosted glass UI** effect
- **Dark overlay background** behind the sheet/modal
- **Three vertical segments** (each with avatar-height rows):
  1. **Starred Friends** (selectable)
  2. **Available** (responses)
  3. **Busy** (responses)

---

## **2. Segment Details**

### **2.1 Segment 1: Starred Friends (Selectable)**

#### **Display**

- **Title**: "Starred Friends"
- **Layout**: Wrapping grid of avatars with names
- **Selection**: Checkboxes on each friend
- **Select All**: Checkbox/button to select all at once
- **Send Button**:
  - Positioned inside this segment
  - Disabled when no friends selected
  - Enabled when ≥1 friend selected

#### **Friend States**

- **Available to notify**: Normal appearance, selectable
- **Pending (notification sent)**:
  - Disabled/grayed out
  - Clock icon overlay
  - Yellow badge showing countdown: "15m", "10m", "5m", "4m", "3m", "2m", "1m"
  - Live countdown updates (gaps: 5-minute intervals until 5m mark, then 1-minute intervals)
  - Becomes available again after 15 minutes
- **Cooldown message**: "Can notify again in 12m" (shows when hovering/tapping pending friend)
  - Live countdown with same gap intervals as badge

#### **Empty State**

- Message: "Star friends first" (when user has no starred friends)
- Link/button to navigate to Friends page

#### **Actions**

- **Send Button Click**:
  - Sends notification to all selected friends immediately
  - No confirmation dialog
  - Checkboxes auto-uncheck after send
  - Sent friends become disabled for 15 minutes
  - Shows pending state with countdown

### **2.2 Segment 2: Available (Responses)**

#### **Display**

- **Title**: "Available"
- **Layout**: Wrapping grid of avatars with names
- **Visual Indicator**: Green glow or green checkmark symbol (match existing UI styles)
- **Default State**: "No responses yet" placeholder text

#### **Behavior**

- Shows friends who responded "Available" to your notification
- Responses appear here when friends click "Available" on their notification
- Responses persist for 15 minutes, then auto-clear
- After auto-clear, reverts to "No responses yet" placeholder

### **2.3 Segment 3: Busy (Responses)**

#### **Display**

- **Title**: "Busy"
- **Layout**: Wrapping grid of avatars with names
- **Visual Indicator**: Red ring around avatar and/or red X symbol (match existing UI styles)
- **Default State**: "No responses yet" placeholder text

#### **Behavior**

- Shows friends who responded "Busy" to your notification
- Responses appear here when friends click "Busy" on their notification
- Responses persist for 15 minutes, then auto-clear
- After auto-clear, reverts to "No responses yet" placeholder

---

## **3. Notification System**

### **3.1 Sending Notifications**

#### **Trigger**

- User selects ≥1 starred friends
- Clicks "Send" button
- All selected friends receive notification simultaneously

#### **Cooldown Rules (Per Friend)**

- Can send notification to Friend A once every 15 minutes
- Can send to Friend B independently (separate 15-min timer)
- Each friend has their own cooldown tracker

#### **Notification Content (Receivers)**

- **Message**: "@yourhandle is asking if you're free"
- **No avatar** in notification
- **No additional context** (no timestamp or other info)
- **Action**: Tapping notification opens app to Home/Schedule page
- **No inline buttons** in push notification (must open app to respond)

### **3.2 Auto-Expiration**

- **Sent notifications**: Auto-delete after 15 minutes if not responded to
- **Responses**: Auto-clear from segments after 15 minutes
- **Cooldown**: After 15 minutes, can send new notification to same friend

### **3.3 Response Mechanism**

#### **For Receivers (Friends who got notified)**

- Notification appears in:
  - Push notification on device (if PWA installed & permission granted)
  - Notifications page in app
- **Response Options**:
  - "Available" button (green)
  - "Busy" button (red)
- **One-time action**: Once clicked, notification clears immediately
- **No change allowed**: Cannot switch from Available to Busy after responding

#### **For Senders (User who sent the request)**

- **Counter-notification on device** (status bar push):
  - Format: "@alice responded: Available" or "@alice responded: Busy"
  - Separate notification for each friend who responds
  - Stacked (multiple notifications if multiple friends respond)
- **Badge appears** on "Notify Friends" button
- **Segment updates**: Friend's avatar appears in Available or Busy segment

---

## **4. Edge Cases & Constraints**

### **4.1 Friendship Changes**

- **If sender unfriends receiver** while notification is active:
  - Notification is cleared/removed from receiver's notifications
  - Avatar removed from sender's segments if already responded
  - Friend removed from starred segment
- **If friend is unstarred** (but still friends):
  - Not shown in starred friends segment
  - If already notified and they respond, response still shows in Available/Busy segments

### **4.2 Multiple Senders**

- If Alice sends "Are you free?" to Bob
- Then Charlie also sends "Are you free?" to Bob (while Alice's is still active)
- Bob sees **2 separate notifications** (one from Alice, one from Charlie)
- Bob can respond to each independently

### **4.3 Connection Requirements**

- **Must be online** to send notifications (internet connection required)
- If offline, "Send" button should be disabled with tooltip/message

### **4.4 No Starred Friends**

- Segment 1 shows: "Star friends first" message
- Send button is disabled
- Empty segments 2 & 3 show: "No responses yet"

---

## **5. Technical Requirements**

### **5.1 Real-time Updates**

- **Live countdown**:
  - Pending friend badges update in real-time
  - "Can notify again in Xm" updates in real-time
  - Update intervals: 5-minute gaps until 5min mark, then 1-minute gaps
- **Response updates**:
  - When friend responds, sender's overlay updates immediately (if open)
  - Badge appears on button if overlay closed

### **5.2 Firebase Integration**

- **Firebase Functions**: Handle push notifications to receivers' devices
- **Database Structure**:
  - Store in optimal collection (see firestore_data.json for current structure)
  - Track 15-minute window for auto-expiration
  - Store per-friend cooldown timers
  - Track notification state (sent, responded, expired)
- **Push Notifications**:
  - Initial request: "@yourhandle is asking if you're free"
  - Counter-notification: "@alice responded: Available"
  - Use existing notification system (same as friend requests and location requests)

### **5.3 State Management**

- Track sent notifications per friend with timestamps
- Track responses with timestamps (for 15-min auto-clear)
- Track cooldown state per friend
- Update badge visibility based on response presence
- Clear badge when overlay opened

### **5.4 Data Cleanup**

- Auto-remove notifications after 15 minutes (if not responded)
- Auto-clear responses from segments after 15 minutes
- Reset cooldown timers after 15 minutes
- Clean up orphaned data if friendships end

---

## **6. UI Consistency**

### **6.1 Design System Adherence**

- Use existing color scheme and CSS variables
- Match current badge style (from bottom nav notifications)
- Match current avatar rendering (DiceBear integration)
- Use existing modal/overlay patterns
- Consistent with frosted glass / transparent UI effects
- Match existing button styles and states
- Use existing icon library (FontAwesome)

### **6.2 Responsive Behavior**

- Mobile-first design
- Bottom sheet on mobile (< 480px)
- Centered modal on desktop/tablet
- Touch-friendly tap targets
- Proper keyboard navigation for desktop

---

## **7. Accessibility**

- Close button clearly labeled
- Segment headings use proper semantic HTML
- Screen reader announcements for state changes
- Keyboard navigation support
- Focus management when overlay opens/closes
- ARIA labels for all interactive elements

---

## **8. Performance**

- Efficient real-time listeners (cleanup on overlay close)
- Debounced countdown updates to prevent excessive re-renders
- Lazy load friend avatars if needed
- Optimize Firebase queries (only fetch necessary data)
- Prevent memory leaks from timers/listeners

---

## **9. Success Metrics**

- User can successfully send "Are you free?" notifications
- Friends receive notifications within 5 seconds
- Responses appear in sender's segments within 5 seconds
- Cooldowns enforce 15-minute rule correctly
- Notifications auto-expire after 15 minutes
- No orphaned data or memory leaks
- Proper cleanup on friendship changes

---

## **10. Future Enhancements (Not in MVP)**

- Quick reply templates (e.g., "Free after 2pm")
- Integration with schedule comparison on response click
- Sound/haptic feedback for responses
- Notification history/analytics
- Group notifications (send to multiple friend groups at once)
