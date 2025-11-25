# 🎨 Clubs Feature - UI Specifications

This document defines the UI/UX patterns for the Clubs feature, aligned with MeetchuThere's existing design system.

---

## 🎯 Design Principles

1. **Consistency**: Match existing glassmorphism style from Groups
2. **Mobile-first**: Design for phone screens, enhance for desktop
3. **Zero clutter**: Only show what's needed
4. **Action-oriented**: Events are the star, not announcements
5. **Accessible**: ARIA labels, keyboard nav, contrast ratios

---

## 🎨 Color Palette for Clubs

Clubs can choose from 8 preset accent colors:

```css
:root {
  /* Club Accent Colors (Preset Palette) */
  --club-blue-primary: #667eea;
  --club-blue-secondary: #764ba2;

  --club-purple-primary: #9b67f8;
  --club-purple-secondary: #c471ed;

  --club-green-primary: #11998e;
  --club-green-secondary: #38ef7d;

  --club-orange-primary: #f2994a;
  --club-orange-secondary: #f2c94c;

  --club-red-primary: #eb5757;
  --club-red-secondary: #ff6b6b;

  --club-pink-primary: #ec4899;
  --club-pink-secondary: #f472b6;

  --club-teal-primary: #14b8a6;
  --club-teal-secondary: #2dd4bf;

  --club-indigo-primary: #6366f1;
  --club-indigo-secondary: #818cf8;
}
```

Each club card will have a CSS variable `--club-hue` set based on their chosen color, similar to how `--course-hue` works for class spaces.

---

## 📱 Groups Page - Tab Integration

### Tab Switcher

Reuse the existing `.group-tabs` pill-style pattern:

```html
<div class="groups-content-tabs">
  <button id="tab-classes" class="tab active">Classes</button>
  <button id="tab-clubs" class="tab">Clubs</button>
</div>
```

```css
/* Reuse existing .group-tabs styling */
.groups-content-tabs {
  display: flex;
  background: rgba(20, 10, 40, 0.3);
  margin: 0 1rem 1rem 1rem;
  border: 1px solid rgba(186, 141, 255, 0.2);
  border-radius: 999px;
  padding: 0.25rem;
  position: relative;
  backdrop-filter: blur(10px);
}

.groups-content-tabs .tab {
  flex: 1;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  padding: 0.6rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.2s ease;
}

.groups-content-tabs .tab.active {
  color: #fff;
  background: linear-gradient(
    120deg,
    rgba(143, 61, 255, 0.95),
    rgba(255, 108, 251, 0.85)
  );
}
```

---

## 📋 Clubs Tab Layout

```
┌─────────────────────────────────────────────┐
│ [Classes] [Clubs]                           │
├─────────────────────────────────────────────┤
│                                             │
│ 🔴 LIVE EVENTS                              │
│ ┌─────────────────────────────────────────┐ │
│ │ [Live Card 1] [Live Card 2]           → │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ─── Upcoming Events ──────────────────────  │
│ ┌─────────────────────────────────────────┐ │
│ │ [Upcoming 1] [Upcoming 2] [Upcoming 3]  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ALL CLUBS                                   │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │  Club   │ │  Club   │ │  Club   │        │
│ │  Card   │ │  Card   │ │  Card   │        │
│ └─────────┘ └─────────┘ └─────────┘        │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │  Club   │ │  Club   │ │  Club   │        │
│ │  Card   │ │  Card   │ │  Card   │        │
│ └─────────┘ └─────────┘ └─────────┘        │
└─────────────────────────────────────────────┘
```

---

## 🔴 Live Events Section

### Live Event Card

```css
.live-events-section {
  margin-bottom: 1.5rem;
}

.live-events-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding: 0 0.5rem;
}

.live-events-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.live-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  background: #ef4444;
  border-radius: 50%;
  animation: pulse-live 1.5s ease-in-out infinite;
}

@keyframes pulse-live {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

.live-events-scroll {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.25rem 0.5rem;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.live-events-scroll::-webkit-scrollbar {
  display: none;
}

.live-event-card {
  flex-shrink: 0;
  width: 280px;
  scroll-snap-align: start;
  background: var(--glass-bg);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 16px;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.live-event-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: #ef4444;
  animation: pulse-bar 1.5s ease-in-out infinite;
}

@keyframes pulse-bar {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.live-event-card:hover {
  transform: translateY(-2px);
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 8px 20px -6px rgba(239, 68, 68, 0.3);
}

.live-event-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.live-event-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
  flex: 1;
}

.live-event-club {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.live-event-club-logo {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.live-event-club-name {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.live-event-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.live-event-time {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.live-event-time i {
  font-size: 0.7rem;
}

.live-event-chat-preview {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--glass-border);
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

## 📅 Upcoming Events Section

```css
.upcoming-events-section {
  margin-bottom: 1.5rem;
  opacity: 0.7;
}

.upcoming-events-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding: 0 0.5rem;
}

.upcoming-events-header::before {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--glass-border));
}

.upcoming-events-header h3 {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.upcoming-events-header::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--glass-border), transparent);
}

.upcoming-event-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.upcoming-event-card:hover {
  background: var(--glass-hover);
  opacity: 1;
}

.upcoming-event-date {
  text-align: center;
  min-width: 45px;
}

.upcoming-event-date-day {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.upcoming-event-date-month {
  font-size: 0.65rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.upcoming-event-info {
  flex: 1;
  min-width: 0;
}

.upcoming-event-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.upcoming-event-club {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.upcoming-event-time {
  font-size: 0.7rem;
  color: var(--text-tertiary);
}
```

---

## 🎴 Club Card

```css
.clubs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  padding: 0 0.5rem;
}

@media (min-width: 600px) {
  .clubs-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 900px) {
  .clubs-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.club-card {
  position: relative;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  overflow: hidden;
}

.club-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(
    90deg,
    var(--club-primary, #667eea),
    var(--club-secondary, #764ba2)
  );
  opacity: 0.8;
}

.club-card:hover {
  transform: translateY(-4px) scale(1.02);
  background: var(--glass-hover);
  border-color: var(--glass-border-strong);
  box-shadow: var(--glass-shadow-strong);
}

.club-card-logo {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--glass-border);
  margin-bottom: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
}

.club-card-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
  line-height: 1.2;
  /* Two line clamp */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.club-card-stats {
  display: flex;
  gap: 0.75rem;
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

.club-card-stat {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.club-card-stat i {
  font-size: 0.65rem;
  opacity: 0.7;
}

.club-card-next-event {
  margin-top: 0.5rem;
  font-size: 0.65rem;
  color: var(--club-primary, #667eea);
  background: rgba(102, 126, 234, 0.1);
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
}
```

---

## 📄 Individual Club Page

### Header

```css
.club-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.club-page-header {
  position: relative;
  flex-shrink: 0;
}

.club-banner {
  width: 100%;
  height: 120px;
  object-fit: cover;
  background: linear-gradient(
    135deg,
    var(--club-primary),
    var(--club-secondary)
  );
}

.club-header-content {
  padding: 0 1rem;
  margin-top: -30px;
  position: relative;
}

.club-header-top {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}

.club-logo-large {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  object-fit: cover;
  border: 3px solid var(--bg-color);
  background: var(--glass-bg);
  flex-shrink: 0;
}

.club-header-info {
  flex: 1;
  padding-bottom: 0.5rem;
}

.club-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.25rem 0;
  line-height: 1.2;
}

.club-follower-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.club-follow-btn {
  padding: 0.5rem 1rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.club-follow-btn:not(.following) {
  background: linear-gradient(
    135deg,
    var(--club-primary),
    var(--club-secondary)
  );
  border: none;
  color: #fff;
}

.club-follow-btn.following {
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--text-secondary);
}

.club-follow-btn:hover:not(.following) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.club-description {
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Reuse group-tabs style */
.club-tabs {
  display: flex;
  background: rgba(20, 10, 40, 0.3);
  margin: 0.5rem 1rem;
  border: 1px solid rgba(186, 141, 255, 0.2);
  border-radius: 999px;
  padding: 0.25rem;
  backdrop-filter: blur(10px);
}

.club-tabs .tab {
  flex: 1;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  padding: 0.5rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.club-tabs .tab.active {
  color: #fff;
  background: linear-gradient(
    120deg,
    rgba(143, 61, 255, 0.95),
    rgba(255, 108, 251, 0.85)
  );
}

.club-tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1rem 1rem;
}
```

---

## 💬 Live Event Chat

```css
.live-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.live-chat-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--glass-border);
  gap: 0.75rem;
}

.live-chat-back {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.1rem;
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 50%;
}

.live-chat-back:hover {
  background: rgba(255, 255, 255, 0.1);
}

.live-chat-info {
  flex: 1;
}

.live-chat-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.live-chat-status {
  font-size: 0.75rem;
  color: #ef4444;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.live-chat-status::before {
  content: "";
  width: 6px;
  height: 6px;
  background: #ef4444;
  border-radius: 50%;
  animation: pulse-live 1.5s ease-in-out infinite;
}

.live-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Event Started Message (Special) */
.chat-event-started {
  background: linear-gradient(
    135deg,
    rgba(239, 68, 68, 0.15),
    rgba(239, 68, 68, 0.05)
  );
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  text-align: center;
  margin-bottom: 0.5rem;
}

.chat-event-started-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.chat-event-started-by {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

/* Regular Chat Message */
.chat-message {
  display: flex;
  gap: 0.6rem;
}

.chat-message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.chat-message-content {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
}

.chat-message-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}

.chat-message-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-message-role {
  font-size: 0.65rem;
  background: rgba(143, 61, 255, 0.2);
  color: #c471ed;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  font-weight: 500;
}

.chat-message-time {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  margin-left: auto;
}

.chat-message-text {
  font-size: 0.85rem;
  color: var(--text-primary);
  line-height: 1.4;
}

/* Chat Input (Officials Only) */
.live-chat-input-container {
  padding: 0.75rem 1rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  background: var(--bg-color);
  border-top: 1px solid var(--glass-border);
  display: flex;
  gap: 0.5rem;
}

.live-chat-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
  color: #fff;
  font-size: 0.9rem;
}

.live-chat-input:focus {
  outline: none;
  border-color: rgba(143, 61, 255, 0.5);
}

.live-chat-send {
  background: linear-gradient(135deg, #6c63ff, #9b67f8);
  border: none;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.live-chat-send:hover {
  transform: scale(1.05);
}

.live-chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Read-Only Notice (Students) */
.live-chat-readonly {
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-top: 1px solid var(--glass-border);
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-tertiary);
}

.live-chat-readonly i {
  margin-right: 0.3rem;
}
```

---

## 👥 Members Tab

```css
.members-section {
  margin-bottom: 1.5rem;
}

.members-section-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  padding-left: 0.25rem;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.5rem;
  border-radius: 12px;
  transition: background 0.15s ease;
}

.member-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid transparent;
}

/* President avatar has special border */
.member-item.president .member-avatar {
  border-color: #fbbf24;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.member-handle {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* Role Badge */
.member-role-badge {
  font-size: 0.65rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.member-role-badge.president {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.member-role-badge.official {
  background: rgba(143, 61, 255, 0.2);
  color: #c471ed;
}

/* Crown for President */
.president-crown {
  color: #fbbf24;
  font-size: 0.8rem;
}
```

---

## ⚙️ Moderate Tab

```css
.moderate-tab {
  padding: 0.5rem 0;
}

.pending-section {
  margin-bottom: 1.5rem;
}

.pending-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  margin-left: 0.5rem;
}

.pending-event-card {
  background: var(--glass-bg);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 12px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.pending-event-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.pending-event-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.pending-event-status {
  font-size: 0.65rem;
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.pending-event-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.pending-event-submitted {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  margin-bottom: 0.75rem;
}

.pending-event-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-approve {
  flex: 1;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
  padding: 0.5rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-approve:hover {
  background: rgba(16, 185, 129, 0.25);
}

.btn-reject {
  flex: 1;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 0.5rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-reject:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* Rejection Comment Modal */
.rejection-modal {
  /* Use existing modal styles */
}

.rejection-textarea {
  width: 100%;
  min-height: 100px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 0.75rem;
  color: #fff;
  font-size: 0.9rem;
  resize: vertical;
}

.rejection-textarea:focus {
  outline: none;
  border-color: rgba(239, 68, 68, 0.5);
}
```

---

## 📱 Responsive Breakpoints

```css
/* Mobile first - base styles are for mobile */

/* Tablet (600px+) */
@media (min-width: 600px) {
  .clubs-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .live-event-card {
    width: 320px;
  }

  .club-banner {
    height: 160px;
  }
}

/* Desktop (900px+) */
@media (min-width: 900px) {
  .clubs-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .live-event-card {
    width: 350px;
  }

  .club-banner {
    height: 200px;
  }

  .club-page {
    max-width: 800px;
    margin: 0 auto;
  }
}
```

---

## 🌗 Light Mode Adjustments

```css
body:not(.dark-mode) {
  /* Club Card */
  .club-card {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(0, 0, 0, 0.08);
  }

  .club-card:hover {
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }

  /* Live Event Card */
  .live-event-card {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(239, 68, 68, 0.2);
  }

  /* Chat Messages */
  .chat-message-content {
    background: rgba(0, 0, 0, 0.03);
    border-color: rgba(0, 0, 0, 0.08);
  }
}
```

---

## 🔗 Related Documents

- [PRD.md](./PRD.md) — Feature requirements
- [Implementation-Plan.md](./Implementation-Plan.md) — Build phases
- Existing: `src/css/groups.css` — Reference for glass styles

---

_End of UI Specifications_
