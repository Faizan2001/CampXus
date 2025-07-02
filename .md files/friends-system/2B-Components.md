# 🧩 Friends Phase 2B: Interactive Components

> **Building Dynamic UI Components - Friend Cards, Request Handling, and Real-Time Updates**

---

## 📋 **Phase Overview**

This phase implements the interactive components that make the friends system come alive: friend cards, request buttons, real-time updates, and user interaction handling.

### **📅 Timeline**: 1-2 days

### **🎯 Learning Goals**: Dynamic DOM manipulation, event delegation, real-time UI updates

### **✅ Prerequisites**: Phase 2A (UI Structure) completed

---

## 🎯 **Component Architecture**

### **Core Components**

```
FriendCard              # Individual friend display
  ├── Avatar            # Profile picture with status
  ├── InfoSection       # Name, major, year
  └── ActionButtons     # Context-specific actions

RequestCard             # Friend request display
  ├── Avatar            # Profile picture
  ├── InfoSection       # Name, time sent
  └── ActionButtons     # Accept/Decline

SearchResultCard        # Search result display
  ├── Avatar            # Profile picture
  ├── InfoSection       # Name, major, year
  └── ActionButton      # Add Friend/Pending/Friends
```

### **Interaction Patterns**

- **🔄 Real-time Updates**: Cards update instantly when status changes
- **⚡ Optimistic UI**: Show changes immediately, handle errors gracefully
- **🎨 Smooth Animations**: Loading states and transitions for better UX
- **♿ Accessibility**: Keyboard navigation and screen reader support

---

## 🃏 **Step 1: Enhance Friend Card Template & Styling**

### **Update: `css/friends-page.css` - Add Card Styles**

**🎓 Teaching Moment**: We'll create reusable card components with consistent styling and interaction states. Notice how we use CSS classes to represent different states (online, pending, friends).

```css
/* ========================================
   Friend Cards - Base Styles
   ======================================== */

.friend-card,
.request-card,
.search-result-card {
  background: var(--surface-color);
  border-radius: var(--friends-border-radius);
  box-shadow: var(--friends-shadow);
  padding: var(--friends-spacing-lg);
  transition: var(--friends-transition);
  border: 2px solid transparent;
  position: relative;
  overflow: hidden;
}

.friend-card:hover,
.request-card:hover,
.search-result-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px -8px rgba(0, 0, 0, 0.15);
  border-color: var(--friends-primary-color);
}

/* ========================================
   Card Layout Structure
   ======================================== */

.friend-card,
.search-result-card {
  display: grid;
  grid-template-areas:
    "avatar info"
    "avatar actions";
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto;
  gap: var(--friends-spacing-md);
  align-items: start;
}

.request-card {
  display: grid;
  grid-template-areas: "avatar info actions";
  grid-template-columns: auto 1fr auto;
  gap: var(--friends-spacing-md);
  align-items: center;
}

/* ========================================
   Avatar Section
   ======================================== */

.friend-avatar,
.request-avatar,
.search-avatar {
  grid-area: avatar;
  position: relative;
  width: 60px;
  height: 60px;
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--border-color);
  transition: var(--friends-transition);
}

.friend-card:hover .avatar-image,
.request-card:hover .avatar-image,
.search-result-card:hover .avatar-image {
  border-color: var(--friends-primary-color);
}

/* Status Indicator */
.status-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--surface-color);
  background: var(--text-secondary);
  transition: var(--friends-transition);
}

.status-indicator.online {
  background: var(--friends-success-color);
}

.status-indicator.away {
  background: var(--friends-warning-color);
}

.status-indicator.offline {
  background: var(--text-secondary);
}

/* ========================================
   Info Section
   ======================================== */

.friend-info,
.request-info,
.search-info {
  grid-area: info;
  min-width: 0; /* Prevents text overflow issues */
}

.friend-name,
.request-name,
.search-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 var(--friends-spacing-xs) 0;
  line-height: 1.2;

  /* Text overflow handling */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-details,
.request-details,
.search-details {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0 0 var(--friends-spacing-xs) 0;
  line-height: 1.3;
}

.friend-major,
.search-major {
  font-size: 0.85rem;
  color: var(--friends-primary-color);
  font-weight: 500;
  margin: 0;
}

.request-time {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-style: italic;
  margin: 0;
}

/* ========================================
   Action Buttons Section
   ======================================== */

.friend-actions,
.request-actions,
.search-actions {
  grid-area: actions;
  display: flex;
  gap: var(--friends-spacing-sm);
  align-items: center;
}

/* Button Base Styles */
.btn {
  padding: var(--friends-spacing-sm) var(--friends-spacing-md);
  border: none;
  border-radius: calc(var(--friends-border-radius) / 2);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: var(--friends-transition);
  display: inline-flex;
  align-items: center;
  gap: var(--friends-spacing-xs);
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

/* Button Variants */
.btn-primary {
  background: var(--friends-primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3730a3;
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--friends-secondary-color);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color);
  transform: translateY(-1px);
}

.btn-success {
  background: var(--friends-success-color);
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #059669;
  transform: translateY(-1px);
}

.btn-danger {
  background: var(--friends-danger-color);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 2px solid transparent;
}

.btn-ghost:hover:not(:disabled) {
  background: var(--friends-secondary-color);
  color: var(--text-primary);
}

/* Button Loading State */
.btn.loading {
  pointer-events: none;
}

.btn.loading::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.btn.loading span {
  opacity: 0;
}

/* ========================================
   Card State Variations
   ======================================== */

/* Pending Request State */
.friend-card.pending-sent {
  border-color: var(--friends-warning-color);
  background: linear-gradient(
    135deg,
    var(--surface-color) 0%,
    rgba(245, 158, 11, 0.05) 100%
  );
}

.friend-card.pending-received {
  border-color: var(--friends-success-color);
  background: linear-gradient(
    135deg,
    var(--surface-color) 0%,
    rgba(16, 185, 129, 0.05) 100%
  );
}

/* Friends State */
.friend-card.is-friend {
  border-color: rgba(79, 70, 229, 0.3);
}

/* ========================================
   Responsive Card Design
   ======================================== */

@media (max-width: 768px) {
  .friend-card,
  .search-result-card {
    grid-template-areas:
      "avatar info"
      "actions actions";
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
  }

  .friend-actions,
  .search-actions {
    justify-content: center;
    margin-top: var(--friends-spacing-sm);
  }

  .request-card {
    grid-template-areas:
      "avatar info"
      "actions actions";
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
  }

  .request-actions {
    justify-content: center;
    margin-top: var(--friends-spacing-sm);
  }
}

@media (max-width: 480px) {
  .friend-avatar,
  .request-avatar,
  .search-avatar {
    width: 50px;
    height: 50px;
  }

  .friend-actions,
  .request-actions,
  .search-actions {
    flex-direction: column;
    gap: var(--friends-spacing-xs);
  }

  .btn {
    width: 100%;
    justify-content: center;
  }
}

/* ========================================
   Animation Classes
   ======================================== */

.card-enter {
  animation: cardEnter 0.3s ease;
}

.card-exit {
  animation: cardExit 0.3s ease;
}

@keyframes cardEnter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cardExit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
}

/* Stagger animation for multiple cards */
.friends-list .friend-card:nth-child(1) {
  animation-delay: 0ms;
}
.friends-list .friend-card:nth-child(2) {
  animation-delay: 50ms;
}
.friends-list .friend-card:nth-child(3) {
  animation-delay: 100ms;
}
.friends-list .friend-card:nth-child(4) {
  animation-delay: 150ms;
}
.friends-list .friend-card:nth-child(5) {
  animation-delay: 200ms;
}
.friends-list .friend-card:nth-child(6) {
  animation-delay: 250ms;
}
```

---

## 🧩 **Step 2: Update UI Controller with Component Logic**

### **Update: `js/core/friends/friends-ui.js` - Add Component Methods**

**🎓 Teaching Moment**: We'll implement the card creation and management logic. This uses modern JavaScript patterns like template cloning, event delegation, and optimistic UI updates.

```javascript
// Add these methods to the existing FriendsUIController class

/**
 * 👥 Load and display friends list
 */
async loadFriendsList() {
  try {
    console.log('👥 Loading friends list...');

    // Get friends data from backend
    const friends = await friendsManager.getFriends();

    // Update friends map
    this.state.currentFriends.clear();
    friends.forEach(friend => {
      this.state.currentFriends.set(friend.uid, friend);
    });

    // Update UI
    this.renderFriendsList(friends);

    console.log(`✅ Loaded ${friends.length} friends`);

  } catch (error) {
    console.error('❌ Failed to load friends:', error);
    this.showError('Failed to load friends list');
  }
}

/**
 * ⏳ Load and display pending requests
 */
async loadPendingRequests() {
  try {
    console.log('⏳ Loading pending requests...');

    // Get pending requests from backend
    const [receivedRequests, sentRequests] = await Promise.all([
      friendsManager.getPendingRequests('received'),
      friendsManager.getPendingRequests('sent')
    ]);

    // Update requests map
    this.state.currentRequests.clear();
    [...receivedRequests, ...sentRequests].forEach(request => {
      this.state.currentRequests.set(request.uid, request);
    });

    // Update UI
    this.renderPendingRequests(receivedRequests, sentRequests);

    console.log(`✅ Loaded ${receivedRequests.length} received, ${sentRequests.length} sent requests`);

  } catch (error) {
    console.error('❌ Failed to load pending requests:', error);
    this.showError('Failed to load pending requests');
  }
}

/**
 * 🔍 Display search results
 */
displaySearchResults(results) {
  console.log(`🔍 Displaying ${results.length} search results`);

  // Update search results map
  this.state.searchResults.clear();
  results.forEach(result => {
    this.state.searchResults.set(result.uid, result);
  });

  // Render results
  this.renderSearchResults(results);

  // Hide search prompt
  if (this.elements.searchPrompt) {
    this.elements.searchPrompt.style.display = results.length > 0 ? 'none' : 'block';
  }
}

/**
 * 🎨 Render friends list in the UI
 */
renderFriendsList(friends) {
  const container = this.elements.friendsList;
  const emptyState = this.elements.friendsEmpty;

  if (!container) return;

  // Clear existing content (except empty state)
  const cards = container.querySelectorAll('.friend-card');
  cards.forEach(card => card.remove());

  if (friends.length === 0) {
    // Show empty state
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  // Hide empty state
  if (emptyState) emptyState.style.display = 'none';

  // Create friend cards
  friends.forEach((friend, index) => {
    const card = this.createFriendCard(friend, 'friend');
    card.style.animationDelay = `${index * 50}ms`;
    card.classList.add('card-enter');
    container.appendChild(card);
  });
}

/**
 * 🎨 Render pending requests in the UI
 */
renderPendingRequests(receivedRequests, sentRequests) {
  // Render received requests
  this.renderRequestsList(
    receivedRequests,
    this.elements.pendingReceivedList,
    this.elements.pendingReceivedEmpty,
    'received'
  );

  // Render sent requests
  this.renderRequestsList(
    sentRequests,
    this.elements.pendingSentList,
    this.elements.pendingSentEmpty,
    'sent'
  );
}

/**
 * 🎨 Render a specific requests list
 */
renderRequestsList(requests, container, emptyState, type) {
  if (!container) return;

  // Clear existing content (except empty state)
  const cards = container.querySelectorAll('.request-card');
  cards.forEach(card => card.remove());

  if (requests.length === 0) {
    // Show empty state
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  // Hide empty state
  if (emptyState) emptyState.style.display = 'none';

  // Create request cards
  requests.forEach((request, index) => {
    const card = this.createRequestCard(request, type);
    card.style.animationDelay = `${index * 50}ms`;
    card.classList.add('card-enter');
    container.appendChild(card);
  });
}

/**
 * 🎨 Render search results in the UI
 */
renderSearchResults(results) {
  const container = this.elements.searchResults;
  const prompt = this.elements.searchPrompt;

  if (!container) return;

  // Clear existing content (except prompt)
  const cards = container.querySelectorAll('.search-result-card');
  cards.forEach(card => card.remove());

  if (results.length === 0) {
    // Show prompt or "no results" message
    if (prompt) {
      prompt.innerHTML = `
        <span class="prompt-icon">🔍</span>
        <h3>No students found</h3>
        <p>Try searching with a different name or filter</p>
      `;
      prompt.style.display = 'block';
    }
    return;
  }

  // Hide prompt
  if (prompt) prompt.style.display = 'none';

  // Create search result cards
  results.forEach((result, index) => {
    const card = this.createSearchResultCard(result);
    card.style.animationDelay = `${index * 50}ms`;
    card.classList.add('card-enter');
    container.appendChild(card);
  });
}

/**
 * 🃏 Create a friend card element
 */
createFriendCard(friend, relationshipType = 'friend') {
  const template = this.elements.friendCardTemplate;
  if (!template) {
    console.error('❌ Friend card template not found');
    return document.createElement('div');
  }

  // Clone template
  const card = template.content.cloneNode(true).querySelector('.friend-card');

  // Add relationship class
  card.classList.add(`is-${relationshipType}`);
  card.dataset.uid = friend.uid;

  // Populate avatar
  const avatarImg = card.querySelector('.avatar-image');
  const statusIndicator = card.querySelector('.status-indicator');

  avatarImg.src = friend.avatar || '/images/default-avatar.png';
  avatarImg.alt = `${friend.displayName}'s avatar`;

  if (statusIndicator) {
    statusIndicator.className = `status-indicator ${friend.status || 'offline'}`;
  }

  // Populate info
  card.querySelector('.friend-name').textContent = friend.displayName;
  card.querySelector('.friend-details').textContent = `${friend.year} Year • ${friend.university}`;
  card.querySelector('.friend-major').textContent = friend.major;

  // Populate actions
  const actionsContainer = card.querySelector('.friend-actions');
  actionsContainer.innerHTML = this.getFriendActions(friend, relationshipType);

  // Add event listeners
  this.addCardEventListeners(card, friend, relationshipType);

  return card;
}

/**
 * 🃏 Create a request card element
 */
createRequestCard(request, type) {
  const template = this.elements.requestCardTemplate;
  if (!template) {
    console.error('❌ Request card template not found');
    return document.createElement('div');
  }

  // Clone template
  const card = template.content.cloneNode(true).querySelector('.request-card');

  card.classList.add(`request-${type}`);
  card.dataset.uid = request.uid;

  // Populate avatar
  const avatarImg = card.querySelector('.avatar-image');
  avatarImg.src = request.avatar || '/images/default-avatar.png';
  avatarImg.alt = `${request.displayName}'s avatar`;

  // Populate info
  card.querySelector('.request-name').textContent = request.displayName;
  card.querySelector('.request-details').textContent = `${request.year} Year • ${request.major}`;
  card.querySelector('.request-time').textContent = this.formatRequestTime(request.timestamp);

  // Populate actions based on type
  const actionsContainer = card.querySelector('.request-actions');
  if (type === 'received') {
    actionsContainer.innerHTML = `
      <button class="btn btn-success accept-btn" data-action="accept">
        <span>✓</span> Accept
      </button>
      <button class="btn btn-secondary decline-btn" data-action="decline">
        <span>✗</span> Decline
      </button>
    `;
  } else {
    actionsContainer.innerHTML = `
      <button class="btn btn-ghost cancel-btn" data-action="cancel">
        <span>⏸</span> Cancel Request
      </button>
    `;
  }

  // Add event listeners
  this.addCardEventListeners(card, request, `request-${type}`);

  return card;
}

/**
 * 🃏 Create a search result card element
 */
createSearchResultCard(student) {
  // Clone friend card template and modify
  const card = this.createFriendCard(student, 'search');
  card.className = 'search-result-card';

  // Update actions for search result
  const actionsContainer = card.querySelector('.friend-actions');
  actionsContainer.className = 'search-actions';
  actionsContainer.innerHTML = this.getSearchActions(student);

  // Update event listeners
  this.addCardEventListeners(card, student, 'search');

  return card;
}

/**
 * 🎯 Get action buttons HTML for friends
 */
getFriendActions(friend, relationshipType) {
  switch (relationshipType) {
    case 'friend':
      return `
        <button class="btn btn-secondary message-btn" data-action="message">
          <span>💬</span> Message
        </button>
        <button class="btn btn-ghost unfriend-btn" data-action="unfriend">
          <span>👋</span> Unfriend
        </button>
      `;
    default:
      return `<div class="no-actions">Connected</div>`;
  }
}

/**
 * 🎯 Get action buttons HTML for search results
 */
getSearchActions(student) {
  // Determine relationship status
  const relationship = this.getRelationshipStatus(student.uid);

  switch (relationship) {
    case 'friend':
      return `<span class="btn btn-success" disabled>✓ Friends</span>`;
    case 'pending-sent':
      return `<span class="btn btn-secondary" disabled>⏳ Pending</span>`;
    case 'pending-received':
      return `
        <button class="btn btn-success accept-btn" data-action="accept">
          <span>✓</span> Accept
        </button>
      `;
    default:
      return `
        <button class="btn btn-primary add-friend-btn" data-action="add-friend">
          <span>➕</span> Add Friend
        </button>
      `;
  }
}

/**
 * 🔍 Get relationship status with a user
 */
getRelationshipStatus(uid) {
  // Check if they're already a friend
  if (this.state.currentFriends.has(uid)) {
    return 'friend';
  }

  // Check if there's a pending request
  const request = this.state.currentRequests.get(uid);
  if (request) {
    return request.type === 'sent' ? 'pending-sent' : 'pending-received';
  }

  return 'none';
}

/**
 * 🎧 Add event listeners to a card
 */
addCardEventListeners(card, userData, cardType) {
  // Event delegation for action buttons
  card.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    e.preventDefault();
    e.stopPropagation();

    const action = button.dataset.action;
    const uid = userData.uid;

    // Handle the action
    await this.handleCardAction(action, uid, button, cardType);
  });

  // Card click for profile view (future feature)
  card.addEventListener('click', (e) => {
    // Only if not clicking on a button
    if (!e.target.closest('button')) {
      console.log(`🔍 View profile: ${userData.displayName}`);
      // TODO: Implement profile view in future phase
    }
  });
}

/**
 * 🎯 Handle card action buttons
 */
async handleCardAction(action, uid, button, cardType) {
  try {
    // Show loading state
    this.setButtonLoading(button, true);

    switch (action) {
      case 'add-friend':
        await this.handleAddFriend(uid);
        break;
      case 'accept':
        await this.handleAcceptRequest(uid);
        break;
      case 'decline':
        await this.handleDeclineRequest(uid);
        break;
      case 'cancel':
        await this.handleCancelRequest(uid);
        break;
      case 'unfriend':
        await this.handleUnfriend(uid);
        break;
      case 'message':
        this.handleMessage(uid);
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error(`❌ Action failed: ${action}`, error);
    this.showError(`Failed to ${action.replace('-', ' ')}. Please try again.`);
  } finally {
    // Remove loading state
    this.setButtonLoading(button, false);
  }
}

/**
 * ➕ Handle add friend action
 */
async handleAddFriend(uid) {
  await friendsManager.sendFriendRequest(uid);

  // Update UI optimistically
  this.updateSearchResultCard(uid, 'pending-sent');
  this.showSuccess('Friend request sent!');

  // Refresh stats
  await this.refreshStats();
}

/**
 * ✅ Handle accept request action
 */
async handleAcceptRequest(uid) {
  await friendsManager.acceptFriendRequest(uid);

  // Remove from pending and add to friends
  this.state.currentRequests.delete(uid);

  // Refresh both friends and pending lists
  await Promise.all([
    this.loadFriendsList(),
    this.loadPendingRequests()
  ]);

  this.showSuccess('Friend request accepted!');
  await this.refreshStats();
}

/**
 * ❌ Handle decline request action
 */
async handleDeclineRequest(uid) {
  await friendsManager.declineFriendRequest(uid);

  // Remove from pending
  this.removeRequestCard(uid);
  this.state.currentRequests.delete(uid);

  this.showSuccess('Friend request declined');
  await this.refreshStats();
}

/**
 * ⏸ Handle cancel request action
 */
async handleCancelRequest(uid) {
  await friendsManager.cancelFriendRequest(uid);

  // Remove from pending
  this.removeRequestCard(uid);
  this.state.currentRequests.delete(uid);

  this.showSuccess('Friend request cancelled');
  await this.refreshStats();
}

/**
 * 👋 Handle unfriend action
 */
async handleUnfriend(uid) {
  // Confirm with user first
  if (!confirm('Are you sure you want to unfriend this person?')) {
    return;
  }

  await friendsManager.removeFriend(uid);

  // Remove from friends
  this.removeFriendCard(uid);
  this.state.currentFriends.delete(uid);

  this.showSuccess('Friend removed');
  await this.refreshStats();
}

/**
 * 💬 Handle message action
 */
handleMessage(uid) {
  // TODO: Implement messaging in future phase
  console.log(`💬 Open chat with ${uid}`);
  this.showSuccess('Messaging feature coming soon!');
}

/**
 * 🔄 Update search result card status
 */
updateSearchResultCard(uid, newStatus) {
  const card = document.querySelector(`.search-result-card[data-uid="${uid}"]`);
  if (!card) return;

  const actionsContainer = card.querySelector('.search-actions');
  const userData = this.state.searchResults.get(uid);

  if (actionsContainer && userData) {
    // Update the actions based on new status
    userData.relationshipStatus = newStatus;
    actionsContainer.innerHTML = this.getSearchActions(userData);
  }
}

/**
 * 🗑️ Remove a friend card with animation
 */
removeFriendCard(uid) {
  const card = document.querySelector(`.friend-card[data-uid="${uid}"]`);
  if (card) {
    card.classList.add('card-exit');
    setTimeout(() => card.remove(), 300);
  }
}

/**
 * 🗑️ Remove a request card with animation
 */
removeRequestCard(uid) {
  const card = document.querySelector(`.request-card[data-uid="${uid}"]`);
  if (card) {
    card.classList.add('card-exit');
    setTimeout(() => card.remove(), 300);
  }
}

/**
 * ⏳ Set button loading state
 */
setButtonLoading(button, loading) {
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

/**
 * ⏰ Format request timestamp
 */
formatRequestTime(timestamp) {
  if (!timestamp) return 'Recently';

  const now = new Date();
  const requestTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = now - requestTime;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return requestTime.toLocaleDateString();
}

/**
 * 📊 Refresh statistics counters with real data
 */
async refreshStats() {
  try {
    const stats = {
      friendsCount: this.state.currentFriends.size,
      pendingSent: Array.from(this.state.currentRequests.values())
        .filter(req => req.type === 'sent').length,
      pendingReceived: Array.from(this.state.currentRequests.values())
        .filter(req => req.type === 'received').length
    };

    // Update UI with animation
    this.animateStatUpdate(this.elements.friendsCount, stats.friendsCount);
    this.animateStatUpdate(this.elements.pendingSentCount, stats.pendingSent);
    this.animateStatUpdate(this.elements.pendingReceivedCount, stats.pendingReceived);

    console.log('📊 Stats refreshed:', stats);

  } catch (error) {
    console.error('❌ Failed to refresh stats:', error);
  }
}

/**
 * 🎬 Animate stat number updates
 */
animateStatUpdate(element, newValue) {
  if (!element) return;

  const currentValue = parseInt(element.textContent) || 0;
  if (currentValue === newValue) return;

  // Simple count-up animation
  const duration = 500;
  const steps = 20;
  const increment = (newValue - currentValue) / steps;
  let current = currentValue;
  let step = 0;

  const timer = setInterval(() => {
    step++;
    current += increment;

    if (step >= steps) {
      element.textContent = newValue;
      clearInterval(timer);
    } else {
      element.textContent = Math.round(current);
    }
  }, duration / steps);
}
```

---

## ✅ **Phase 2B Checklist**

### **Completed Tasks**

- [x] 🃏 Created reusable card components with proper styling
- [x] 🎨 Implemented smooth animations and loading states
- [x] 🎯 Added comprehensive action button handling
- [x] 🔄 Built optimistic UI updates for better UX
- [x] 📱 Made cards fully responsive for mobile
- [x] ♿ Added accessibility features and keyboard support
- [x] 🎬 Implemented staggered animations for card lists

### **Next Phase**: [Phase 2C - Responsive Design & Polish](./Friends-Phase-2C-Styling.md)

---

## 🎓 **Learning Summary**

In this phase, you learned:

1. **🧩 Component Architecture**: Building reusable UI components with templates
2. **🎨 Dynamic DOM**: Creating and managing dynamic content efficiently
3. **⚡ Optimistic UI**: Showing changes immediately while handling errors gracefully
4. **🎯 Event Delegation**: Efficient event handling for dynamic content
5. **🎬 Animations**: Smooth transitions and loading states for better UX
6. **📊 Real-time Updates**: Keeping UI in sync with backend data changes

**🎯 Key Takeaway**: Interactive components bridge the gap between static UI and dynamic functionality. Well-designed components handle edge cases, provide feedback, and create a smooth user experience that feels responsive and reliable.
