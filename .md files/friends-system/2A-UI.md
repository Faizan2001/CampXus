# 🎨 Friends Phase 2A: UI Structure & Layout

> **Building the Frontend Foundation - HTML Structure, CSS Layout, and Component Architecture**

---

## 📋 **Phase Overview**

This phase creates the foundational UI structure for the friends system, including the main friends page layout, component containers, and responsive design framework.

### **📅 Timeline**: 1-2 days

### **🎯 Learning Goals**: HTML semantics, CSS Grid/Flexbox, responsive design patterns

### **✅ Prerequisites**: Phase 1 (Backend) completed

---

## 🏗️ **File Structure Plan**

```
templates/friends.html          # Main friends page structure
css/friends-page.css           # Friends-specific styling
js/core/friends/friends-ui.js  # UI controller and DOM management
```

---

## 🎨 **UI Architecture Design**

### **Layout Sections**

```
┌─────────────────────────────────────────┐
│ 🔍 Search Bar & Filters                │
├─────────────────────────────────────────┤
│ 📊 Stats Bar (Friends Count, Pending)  │
├─────────────────────────────────────────┤
│ 🎛️  Tab Navigation                      │
│     [Friends] [Pending] [Search]        │
├─────────────────────────────────────────┤
│                                         │
│ 📱 Content Area                        │
│   (Dynamic based on active tab)        │
│                                         │
└─────────────────────────────────────────┘
```

### **Component Hierarchy**

- **FriendsPageController** (main coordinator)
  - **SearchComponent** (user search with filters)
  - **StatsComponent** (friend counts and status)
  - **TabNavigationComponent** (tab switching)
  - **ContentAreaComponent** (dynamic content)
    - **FriendsListComponent**
    - **PendingRequestsComponent**
    - **SearchResultsComponent**

---

## 📄 **Step 1: Create Friends Page Template**

### **File: `templates/friends.html`**

**🎓 Teaching Moment**: We'll use semantic HTML5 with proper ARIA labels for accessibility. Notice how we structure the page with clear sections and meaningful class names.

```html
<!-- Friends Page Template -->
<div class="page-container friends-page">
  <!-- Page Header -->
  <header class="friends-header">
    <div class="header-content">
      <h1 class="page-title">
        <span class="icon">👥</span>
        My Friends
      </h1>
      <p class="page-subtitle">Connect with your university classmates</p>
    </div>
  </header>

  <!-- Search Section -->
  <section class="search-section" aria-label="Student Search">
    <div class="search-container">
      <div class="search-input-group">
        <input
          type="text"
          id="student-search"
          class="search-input"
          placeholder="Search students by name..."
          aria-label="Search for students"
          autocomplete="off"
        />
        <button class="search-btn" type="button" aria-label="Search">
          <span class="icon">🔍</span>
        </button>
      </div>

      <!-- Search Filters -->
      <div class="search-filters">
        <button class="filter-btn active" data-filter="all">
          All Students
        </button>
        <button class="filter-btn" data-filter="major">Same Major</button>
        <button class="filter-btn" data-filter="year">Same Year</button>
      </div>
    </div>
  </section>

  <!-- Stats Bar -->
  <section class="stats-bar" aria-label="Friends Statistics">
    <div class="stat-item">
      <span class="stat-number" id="friends-count">0</span>
      <span class="stat-label">Friends</span>
    </div>
    <div class="stat-item">
      <span class="stat-number" id="pending-sent-count">0</span>
      <span class="stat-label">Sent</span>
    </div>
    <div class="stat-item">
      <span class="stat-number" id="pending-received-count">0</span>
      <span class="stat-label">Pending</span>
    </div>
  </section>

  <!-- Tab Navigation -->
  <nav class="tab-navigation" role="tablist" aria-label="Friends sections">
    <button
      class="tab-btn active"
      role="tab"
      aria-selected="true"
      aria-controls="friends-panel"
      data-tab="friends"
    >
      <span class="icon">👥</span>
      Friends
    </button>
    <button
      class="tab-btn"
      role="tab"
      aria-selected="false"
      aria-controls="pending-panel"
      data-tab="pending"
    >
      <span class="icon">⏳</span>
      Pending
    </button>
    <button
      class="tab-btn"
      role="tab"
      aria-selected="false"
      aria-controls="search-panel"
      data-tab="search"
    >
      <span class="icon">🔍</span>
      Discover
    </button>
  </nav>

  <!-- Content Area -->
  <main class="content-area">
    <!-- Friends List Panel -->
    <div
      id="friends-panel"
      class="content-panel active"
      role="tabpanel"
      aria-labelledby="friends-tab"
    >
      <div class="friends-list-container">
        <div class="list-header">
          <h2>Your Friends</h2>
          <p class="list-description">Students you're connected with</p>
        </div>
        <div id="friends-list" class="friends-list">
          <!-- Friends will be dynamically loaded here -->
          <div class="empty-state" id="friends-empty">
            <span class="empty-icon">👋</span>
            <h3>No friends yet</h3>
            <p>Start by searching for your classmates!</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending Requests Panel -->
    <div
      id="pending-panel"
      class="content-panel"
      role="tabpanel"
      aria-labelledby="pending-tab"
    >
      <div class="pending-container">
        <!-- Received Requests -->
        <div class="pending-section">
          <div class="section-header">
            <h2>Friend Requests</h2>
            <p class="section-description">
              People who want to connect with you
            </p>
          </div>
          <div id="pending-received-list" class="pending-list">
            <div class="empty-state" id="pending-received-empty">
              <span class="empty-icon">📥</span>
              <h3>No pending requests</h3>
              <p>No one has sent you a friend request yet.</p>
            </div>
          </div>
        </div>

        <!-- Sent Requests -->
        <div class="pending-section">
          <div class="section-header">
            <h2>Sent Requests</h2>
            <p class="section-description">
              People you've requested to connect with
            </p>
          </div>
          <div id="pending-sent-list" class="pending-list">
            <div class="empty-state" id="pending-sent-empty">
              <span class="empty-icon">📤</span>
              <h3>No sent requests</h3>
              <p>You haven't sent any friend requests yet.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Search/Discover Panel -->
    <div
      id="search-panel"
      class="content-panel"
      role="tabpanel"
      aria-labelledby="search-tab"
    >
      <div class="search-results-container">
        <div class="search-header">
          <h2>Discover Classmates</h2>
          <p class="search-description">
            Find and connect with students at your university
          </p>
        </div>
        <div id="search-results" class="search-results">
          <div class="search-prompt" id="search-prompt">
            <span class="prompt-icon">🎓</span>
            <h3>Start searching above</h3>
            <p>Type a name to find your classmates</p>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Loading Overlay -->
  <div class="loading-overlay" id="friends-loading">
    <div class="loading-spinner"></div>
    <p>Loading friends...</p>
  </div>
</div>

<!-- Friend Card Template (Hidden) -->
<template id="friend-card-template">
  <div class="friend-card">
    <div class="friend-avatar">
      <img src="" alt="" class="avatar-image" />
      <div class="status-indicator"></div>
    </div>
    <div class="friend-info">
      <h3 class="friend-name"></h3>
      <p class="friend-details"></p>
      <p class="friend-major"></p>
    </div>
    <div class="friend-actions">
      <!-- Actions will vary based on relationship status -->
    </div>
  </div>
</template>

<!-- Request Card Template (Hidden) -->
<template id="request-card-template">
  <div class="request-card">
    <div class="request-avatar">
      <img src="" alt="" class="avatar-image" />
    </div>
    <div class="request-info">
      <h3 class="request-name"></h3>
      <p class="request-details"></p>
      <p class="request-time"></p>
    </div>
    <div class="request-actions">
      <button class="btn btn-primary accept-btn">Accept</button>
      <button class="btn btn-secondary decline-btn">Decline</button>
    </div>
  </div>
</template>
```

---

## 🎨 **Step 2: Basic CSS Layout Foundation**

### **File: `css/friends-page.css`**

**🎓 Teaching Moment**: We'll use CSS Grid for the main layout and Flexbox for component alignment. Modern CSS custom properties help us maintain consistent spacing and colors.

```css
/* ========================================
   Friends Page - Core Layout & Structure
   ======================================== */

/* CSS Custom Properties for Friends Page */
:root {
  --friends-primary-color: #4f46e5;
  --friends-secondary-color: #f3f4f6;
  --friends-success-color: #10b981;
  --friends-warning-color: #f59e0b;
  --friends-danger-color: #ef4444;

  --friends-border-radius: 12px;
  --friends-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --friends-transition: all 0.2s ease;

  --friends-spacing-xs: 0.5rem;
  --friends-spacing-sm: 0.75rem;
  --friends-spacing-md: 1rem;
  --friends-spacing-lg: 1.5rem;
  --friends-spacing-xl: 2rem;
}

/* ========================================
   Main Page Container
   ======================================== */

.friends-page {
  display: grid;
  grid-template-rows: auto auto auto auto 1fr;
  grid-template-areas:
    "header"
    "search"
    "stats"
    "tabs"
    "content";
  min-height: 100vh;
  background: var(--background-color);
  gap: var(--friends-spacing-md);
  padding: var(--friends-spacing-md);
}

/* ========================================
   Header Section
   ======================================== */

.friends-header {
  grid-area: header;
  text-align: center;
  padding: var(--friends-spacing-lg) 0;
}

.header-content {
  max-width: 600px;
  margin: 0 auto;
}

.page-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--friends-spacing-sm);
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--friends-spacing-sm);
}

.page-title .icon {
  font-size: 2.5rem;
}

.page-subtitle {
  color: var(--text-secondary);
  font-size: 1.1rem;
  margin: 0;
}

/* ========================================
   Search Section
   ======================================== */

.search-section {
  grid-area: search;
}

.search-container {
  max-width: 800px;
  margin: 0 auto;
}

.search-input-group {
  display: flex;
  gap: var(--friends-spacing-sm);
  margin-bottom: var(--friends-spacing-md);
}

.search-input {
  flex: 1;
  padding: var(--friends-spacing-md);
  border: 2px solid var(--border-color);
  border-radius: var(--friends-border-radius);
  font-size: 1rem;
  background: var(--surface-color);
  color: var(--text-primary);
  transition: var(--friends-transition);
}

.search-input:focus {
  outline: none;
  border-color: var(--friends-primary-color);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.search-btn {
  padding: var(--friends-spacing-md);
  background: var(--friends-primary-color);
  color: white;
  border: none;
  border-radius: var(--friends-border-radius);
  cursor: pointer;
  transition: var(--friends-transition);
  min-width: 50px;
}

.search-btn:hover {
  background: #3730a3;
  transform: translateY(-1px);
}

.search-filters {
  display: flex;
  gap: var(--friends-spacing-sm);
  justify-content: center;
  flex-wrap: wrap;
}

.filter-btn {
  padding: var(--friends-spacing-sm) var(--friends-spacing-md);
  border: 2px solid var(--border-color);
  background: var(--surface-color);
  color: var(--text-secondary);
  border-radius: 25px;
  cursor: pointer;
  transition: var(--friends-transition);
  font-size: 0.9rem;
}

.filter-btn.active,
.filter-btn:hover {
  border-color: var(--friends-primary-color);
  background: var(--friends-primary-color);
  color: white;
}

/* ========================================
   Stats Bar
   ======================================== */

.stats-bar {
  grid-area: stats;
  display: flex;
  justify-content: center;
  gap: var(--friends-spacing-xl);
  padding: var(--friends-spacing-lg);
  background: var(--surface-color);
  border-radius: var(--friends-border-radius);
  box-shadow: var(--friends-shadow);
}

.stat-item {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 2rem;
  font-weight: 700;
  color: var(--friends-primary-color);
  line-height: 1;
}

.stat-label {
  display: block;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-top: var(--friends-spacing-xs);
}

/* ========================================
   Tab Navigation
   ======================================== */

.tab-navigation {
  grid-area: tabs;
  display: flex;
  justify-content: center;
  gap: var(--friends-spacing-sm);
  padding: 0 var(--friends-spacing-md);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: var(--friends-spacing-sm);
  padding: var(--friends-spacing-md) var(--friends-spacing-lg);
  border: none;
  background: var(--surface-color);
  color: var(--text-secondary);
  border-radius: var(--friends-border-radius);
  cursor: pointer;
  transition: var(--friends-transition);
  font-weight: 500;
  border: 2px solid transparent;
}

.tab-btn.active {
  background: var(--friends-primary-color);
  color: white;
  border-color: var(--friends-primary-color);
}

.tab-btn:hover:not(.active) {
  background: var(--friends-secondary-color);
  color: var(--text-primary);
}

/* ========================================
   Content Area
   ======================================== */

.content-area {
  grid-area: content;
  position: relative;
  min-height: 400px;
}

.content-panel {
  display: none;
  animation: fadeIn 0.3s ease;
}

.content-panel.active {
  display: block;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ========================================
   List Containers
   ======================================== */

.friends-list-container,
.pending-container,
.search-results-container {
  max-width: 1000px;
  margin: 0 auto;
}

.list-header,
.search-header {
  text-align: center;
  margin-bottom: var(--friends-spacing-xl);
}

.list-header h2,
.search-header h2 {
  font-size: 1.8rem;
  color: var(--text-primary);
  margin-bottom: var(--friends-spacing-sm);
}

.list-description,
.search-description {
  color: var(--text-secondary);
  font-size: 1.1rem;
  margin: 0;
}

/* ========================================
   Friends & Results Lists
   ======================================== */

.friends-list,
.search-results,
.pending-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--friends-spacing-lg);
  padding: var(--friends-spacing-md) 0;
}

/* ========================================
   Empty States
   ======================================== */

.empty-state,
.search-prompt {
  grid-column: 1 / -1;
  text-align: center;
  padding: var(--friends-spacing-xl);
  color: var(--text-secondary);
}

.empty-icon,
.prompt-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--friends-spacing-md);
}

.empty-state h3,
.search-prompt h3 {
  font-size: 1.3rem;
  color: var(--text-primary);
  margin-bottom: var(--friends-spacing-sm);
}

/* ========================================
   Loading Overlay
   ======================================== */

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: none;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border-radius: var(--friends-border-radius);
}

.loading-overlay.active {
  display: flex;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--friends-secondary-color);
  border-top: 4px solid var(--friends-primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--friends-spacing-md);
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* ========================================
   Pending Requests Sections
   ======================================== */

.pending-section {
  margin-bottom: var(--friends-spacing-xl);
}

.section-header {
  text-align: left;
  margin-bottom: var(--friends-spacing-lg);
  padding-left: var(--friends-spacing-md);
}

.section-header h2 {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: var(--friends-spacing-xs);
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

/* ========================================
   Responsive Design
   ======================================== */

/* Tablet Layout */
@media (max-width: 768px) {
  .friends-page {
    padding: var(--friends-spacing-sm);
    gap: var(--friends-spacing-sm);
  }

  .page-title {
    font-size: 2rem;
  }

  .stats-bar {
    gap: var(--friends-spacing-lg);
    padding: var(--friends-spacing-md);
  }

  .stat-number {
    font-size: 1.5rem;
  }

  .tab-navigation {
    flex-wrap: wrap;
    justify-content: space-around;
  }

  .friends-list,
  .search-results,
  .pending-list {
    grid-template-columns: 1fr;
  }
}

/* Mobile Layout */
@media (max-width: 480px) {
  .search-input-group {
    flex-direction: column;
  }

  .search-filters {
    justify-content: flex-start;
  }

  .stats-bar {
    flex-direction: column;
    gap: var(--friends-spacing-md);
    text-align: center;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-number {
    font-size: 1.2rem;
  }

  .tab-btn {
    flex: 1;
    justify-content: center;
  }
}

/* ========================================
   Hidden Template Elements
   ======================================== */

template {
  display: none;
}
```

---

## 🧩 **Step 3: Create UI Controller Foundation**

### **File: `js/core/friends/friends-ui.js`**

**🎓 Teaching Moment**: This controller follows the Model-View-Controller pattern. It manages DOM elements, handles user interactions, and coordinates with our backend friends-manager.js.

```javascript
/**
 * 🎨 Friends UI Controller
 * Manages the friends page interface, user interactions, and real-time updates
 *
 * @author CampXus Development Team
 * @created Phase 2A - UI Structure
 */

import { friendsManager } from "./friends-manager.js";
import { showToast } from "../modal.js";

class FriendsUIController {
  constructor() {
    // 🎯 DOM element references
    this.elements = {
      // Main containers
      page: null,
      searchInput: null,
      searchBtn: null,

      // Filter buttons
      filterBtns: null,
      activeFilter: "all",

      // Stats elements
      friendsCount: null,
      pendingSentCount: null,
      pendingReceivedCount: null,

      // Tab navigation
      tabBtns: null,
      activeTab: "friends",

      // Content panels
      friendsPanel: null,
      pendingPanel: null,
      searchPanel: null,

      // Lists
      friendsList: null,
      pendingReceivedList: null,
      pendingSentList: null,
      searchResults: null,

      // Empty states
      friendsEmpty: null,
      pendingReceivedEmpty: null,
      pendingSentEmpty: null,
      searchPrompt: null,

      // Loading
      loadingOverlay: null,

      // Templates
      friendCardTemplate: null,
      requestCardTemplate: null,
    };

    // 🏠 Component state
    this.state = {
      isLoading: false,
      lastSearchQuery: "",
      searchTimeout: null,
      currentFriends: new Map(),
      currentRequests: new Map(),
      searchResults: new Map(),
    };

    // 🎛️ Configuration
    this.config = {
      searchDelay: 500, // ms to wait before searching
      maxSearchResults: 50,
      refreshInterval: 30000, // 30 seconds
    };

    // 🎯 Initialize when DOM is ready
    this.init();
  }

  /**
   * 🚀 Initialize the Friends UI Controller
   */
  async init() {
    try {
      console.log("🎨 Initializing Friends UI Controller...");

      // Wait for DOM to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.setupUI());
      } else {
        this.setupUI();
      }
    } catch (error) {
      console.error("❌ Failed to initialize Friends UI:", error);
      this.showError("Failed to load friends page");
    }
  }

  /**
   * 🏗️ Set up the user interface
   */
  setupUI() {
    try {
      // Get DOM references
      this.cacheDOMElements();

      // Set up event listeners
      this.setupEventListeners();

      // Set up templates
      this.setupTemplates();

      // Load initial data
      this.loadInitialData();

      console.log("✅ Friends UI setup complete");
    } catch (error) {
      console.error("❌ Failed to setup Friends UI:", error);
      this.showError("Failed to setup friends interface");
    }
  }

  /**
   * 📋 Cache DOM element references for performance
   */
  cacheDOMElements() {
    const elements = this.elements;

    // Main page container
    elements.page = document.querySelector(".friends-page");
    if (!elements.page) {
      throw new Error("Friends page container not found");
    }

    // Search elements
    elements.searchInput = document.getElementById("student-search");
    elements.searchBtn = document.querySelector(".search-btn");
    elements.filterBtns = document.querySelectorAll(".filter-btn");

    // Stats elements
    elements.friendsCount = document.getElementById("friends-count");
    elements.pendingSentCount = document.getElementById("pending-sent-count");
    elements.pendingReceivedCount = document.getElementById(
      "pending-received-count"
    );

    // Tab navigation
    elements.tabBtns = document.querySelectorAll(".tab-btn");

    // Content panels
    elements.friendsPanel = document.getElementById("friends-panel");
    elements.pendingPanel = document.getElementById("pending-panel");
    elements.searchPanel = document.getElementById("search-panel");

    // Lists
    elements.friendsList = document.getElementById("friends-list");
    elements.pendingReceivedList = document.getElementById(
      "pending-received-list"
    );
    elements.pendingSentList = document.getElementById("pending-sent-list");
    elements.searchResults = document.getElementById("search-results");

    // Empty states
    elements.friendsEmpty = document.getElementById("friends-empty");
    elements.pendingReceivedEmpty = document.getElementById(
      "pending-received-empty"
    );
    elements.pendingSentEmpty = document.getElementById("pending-sent-empty");
    elements.searchPrompt = document.getElementById("search-prompt");

    // Loading overlay
    elements.loadingOverlay = document.getElementById("friends-loading");

    // Templates
    elements.friendCardTemplate = document.getElementById(
      "friend-card-template"
    );
    elements.requestCardTemplate = document.getElementById(
      "request-card-template"
    );

    console.log("📋 DOM elements cached successfully");
  }

  /**
   * 🎧 Set up event listeners
   */
  setupEventListeners() {
    const { elements } = this;

    // 🔍 Search functionality
    if (elements.searchInput) {
      elements.searchInput.addEventListener("input", (e) => {
        this.handleSearchInput(e.target.value);
      });

      elements.searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.performSearch(e.target.value);
        }
      });
    }

    if (elements.searchBtn) {
      elements.searchBtn.addEventListener("click", () => {
        this.performSearch(elements.searchInput.value);
      });
    }

    // 🎛️ Filter buttons
    elements.filterBtns?.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.handleFilterChange(e.target.dataset.filter);
      });
    });

    // 📑 Tab navigation
    elements.tabBtns?.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.handleTabChange(e.target.dataset.tab);
      });
    });

    console.log("🎧 Event listeners set up successfully");
  }

  /**
   * 📋 Set up card templates for dynamic content
   */
  setupTemplates() {
    // Validate templates exist
    if (
      !this.elements.friendCardTemplate ||
      !this.elements.requestCardTemplate
    ) {
      console.warn(
        "⚠️ Card templates not found - dynamic content may not work"
      );
    } else {
      console.log("📋 Templates ready for dynamic content");
    }
  }

  /**
   * 📊 Load initial data and populate the interface
   */
  async loadInitialData() {
    this.showLoading(true);

    try {
      // Load friends count and stats
      await this.refreshStats();

      // Load initial friends list if on friends tab
      if (this.elements.activeTab === "friends") {
        await this.loadFriendsList();
      }

      console.log("📊 Initial data loaded successfully");
    } catch (error) {
      console.error("❌ Failed to load initial data:", error);
      this.showError("Failed to load friends data");
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * 🔍 Handle search input with debouncing
   */
  handleSearchInput(query) {
    // Clear previous timeout
    if (this.state.searchTimeout) {
      clearTimeout(this.state.searchTimeout);
    }

    // Set new timeout for debounced search
    this.state.searchTimeout = setTimeout(() => {
      if (query.trim() && query !== this.state.lastSearchQuery) {
        this.performSearch(query.trim());
      }
    }, this.config.searchDelay);
  }

  /**
   * 🔍 Perform student search
   */
  async performSearch(query) {
    if (!query.trim()) {
      this.clearSearchResults();
      return;
    }

    try {
      this.state.lastSearchQuery = query;
      this.showLoading(true);

      // Switch to search tab if not already there
      if (this.elements.activeTab !== "search") {
        this.handleTabChange("search");
      }

      // Perform the search
      const results = await friendsManager.searchStudents(query, {
        filter: this.elements.activeFilter,
        limit: this.config.maxSearchResults,
      });

      // Display results
      this.displaySearchResults(results);

      console.log(
        `🔍 Search completed: ${results.length} results for "${query}"`
      );
    } catch (error) {
      console.error("❌ Search failed:", error);
      this.showError("Search failed. Please try again.");
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * 🎛️ Handle filter button changes
   */
  handleFilterChange(filter) {
    // Update active filter button
    this.elements.filterBtns?.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.filter === filter);
    });

    this.elements.activeFilter = filter;

    // Re-search if there's an active query
    if (this.state.lastSearchQuery) {
      this.performSearch(this.state.lastSearchQuery);
    }

    console.log(`🎛️ Filter changed to: ${filter}`);
  }

  /**
   * 📑 Handle tab navigation
   */
  async handleTabChange(tabName) {
    // Update tab buttons
    this.elements.tabBtns?.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive);
    });

    // Update content panels
    document.querySelectorAll(".content-panel").forEach((panel) => {
      panel.classList.remove("active");
    });

    const targetPanel = document.getElementById(`${tabName}-panel`);
    if (targetPanel) {
      targetPanel.classList.add("active");
    }

    this.elements.activeTab = tabName;

    // Load data for the active tab
    await this.loadTabData(tabName);

    console.log(`📑 Switched to tab: ${tabName}`);
  }

  /**
   * 📊 Load data for a specific tab
   */
  async loadTabData(tabName) {
    try {
      this.showLoading(true);

      switch (tabName) {
        case "friends":
          await this.loadFriendsList();
          break;
        case "pending":
          await this.loadPendingRequests();
          break;
        case "search":
          // Search tab loads on demand
          break;
      }
    } catch (error) {
      console.error(`❌ Failed to load ${tabName} data:`, error);
      this.showError(`Failed to load ${tabName} data`);
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * 👥 Load and display friends list
   */
  async loadFriendsList() {
    // Placeholder - will be implemented in Phase 2B
    console.log("👥 Loading friends list...");

    // For now, just hide empty state
    if (this.elements.friendsEmpty) {
      this.elements.friendsEmpty.style.display = "block";
    }
  }

  /**
   * ⏳ Load and display pending requests
   */
  async loadPendingRequests() {
    // Placeholder - will be implemented in Phase 2B
    console.log("⏳ Loading pending requests...");
  }

  /**
   * 🔍 Display search results
   */
  displaySearchResults(results) {
    // Placeholder - will be implemented in Phase 2B
    console.log(`🔍 Displaying ${results.length} search results`);

    // Hide search prompt
    if (this.elements.searchPrompt) {
      this.elements.searchPrompt.style.display = "none";
    }
  }

  /**
   * 🧹 Clear search results
   */
  clearSearchResults() {
    if (this.elements.searchResults) {
      this.elements.searchResults.innerHTML = "";
    }

    if (this.elements.searchPrompt) {
      this.elements.searchPrompt.style.display = "block";
    }

    this.state.lastSearchQuery = "";
    this.state.searchResults.clear();
  }

  /**
   * 📊 Refresh statistics counters
   */
  async refreshStats() {
    try {
      // Placeholder - will get real data in Phase 2B
      const stats = {
        friendsCount: 0,
        pendingSent: 0,
        pendingReceived: 0,
      };

      // Update UI
      if (this.elements.friendsCount) {
        this.elements.friendsCount.textContent = stats.friendsCount;
      }
      if (this.elements.pendingSentCount) {
        this.elements.pendingSentCount.textContent = stats.pendingSent;
      }
      if (this.elements.pendingReceivedCount) {
        this.elements.pendingReceivedCount.textContent = stats.pendingReceived;
      }

      console.log("📊 Stats refreshed");
    } catch (error) {
      console.error("❌ Failed to refresh stats:", error);
    }
  }

  /**
   * ⏳ Show/hide loading state
   */
  showLoading(show) {
    this.state.isLoading = show;

    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.toggle("active", show);
    }
  }

  /**
   * 🚨 Show error message to user
   */
  showError(message) {
    if (typeof showToast === "function") {
      showToast(message, "error");
    } else {
      console.error("Error:", message);
      alert(message); // Fallback
    }
  }

  /**
   * ✅ Show success message to user
   */
  showSuccess(message) {
    if (typeof showToast === "function") {
      showToast(message, "success");
    } else {
      console.log("Success:", message);
    }
  }
}

// 🚀 Create and export the controller instance
export const friendsUI = new FriendsUIController();

// 🎯 Make it available globally for debugging
if (typeof window !== "undefined") {
  window.friendsUI = friendsUI;
}
```

---

## ✅ **Phase 2A Checklist**

### **Completed Tasks**

- [x] 📄 Created semantic HTML structure for friends page
- [x] 🎨 Implemented responsive CSS layout with Grid/Flexbox
- [x] 🧩 Built UI controller foundation with proper architecture
- [x] 🎧 Set up event handling for user interactions
- [x] 📱 Added mobile-responsive design patterns
- [x] ♿ Included accessibility features (ARIA labels, semantic HTML)
- [x] 🎨 Created consistent design system with CSS custom properties

### **Next Phase**: [Phase 2B - Interactive Components](./Friends-Phase-2B-Components.md)

---

## 🎓 **Learning Summary**

In this phase, you learned:

1. **🏗️ HTML Structure**: How to create semantic, accessible page layouts
2. **🎨 CSS Layout**: Modern Grid/Flexbox techniques for responsive design
3. **📱 Mobile-First**: Progressive enhancement for different screen sizes
4. **🧩 JavaScript Architecture**: MVC pattern for UI controllers
5. **⚡ Performance**: DOM caching and debounced user interactions
6. **♿ Accessibility**: ARIA labels and keyboard navigation support

**🎯 Key Takeaway**: A well-structured foundation makes complex features easier to build and maintain. The separation of concerns (HTML structure, CSS presentation, JS behavior) keeps code organized and scalable.
