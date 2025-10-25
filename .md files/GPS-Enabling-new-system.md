# New System Cheat Sheet (Super Beginner Friendly)

> TL;DR: One banner handles GPS permission, the friends page no longer scrolls like a website, and the toggle just shows state. Everything else supports those wins.

---

## 1. The “Enable GPS” Banner

| Before | After |
|--------|-------|
| iOS users hunted for a nav button. Android/desktop users saw nothing. | Everyone sees a thin banner **only on the Home page** when the browser lacks GPS permission. |
| Friends page had its own “Campus Presence” card. | Friends page keeps just “Find Friends” + “Friends List.” The banner lives on Home, so UX is simpler. |

**What the banner does now**
1. Shows text: “Enable GPS accuracy…”
2. Has two actions — **Enable** (requests permission + restarts polling) and **×** (dismiss for this session).
3. Hides itself the moment GPS permission is granted.

**Files to peek at**
- Markup: `public/templates/home.html`
- Styles: `src/css/styles.css`
- Logic: `src/js/components/presence/LocationPermissionBanner.js`
- Hooked up in Home page controller: `src/js/pages/HomePage.js`

---

## 2. Location Sharing Toggle

| Before | After |
|--------|-------|
| Toggle rendered its own “Enable Location” helper CTA. | Toggle simply flips `ON/OFF`, sets `data-permission-state`, and lets the banner handle permission prompts. |
| Friends page rendered another header toggle + hints. | Duplicate toggle removed. Banner handles hints, so less UI noise. |

**File to read**
- `src/js/components/presence/LocationSharingToggle.js`

Look for how `data-permission-state` and `data-permission-missing` are set. CSS or analytics can use those if needed.

---

## 3. Home Page Layout

| Before | After |
|--------|-------|
| No banner; users relied on nav or nothing. | Banner sits neatly above the horizontal friends bar when needed. |
| Layout jumped a bit when the UI changed. | Smooth CSS transitions collapse the space once permission is granted or banner is dismissed. |

**Main change**: The banner is the only call-to-action. The rest of the page stays the same.

---

## 4. Friends Page Layout (Mobile-Friendly)

| Before | After |
|--------|-------|
| Three glass cards (“Find Friends”, “Friends List”, “Campus Presence”). | Two cards (“Find Friends”, “Friends List”). |
| Page scrolled underneath the top/bottom navs. | The page fills the viewport. Only the list scrolls inside its card. Feels like a native app. |

**Files to explore**
- `public/templates/friends.html`
- `src/css/friends-page.css`
- `src/js/pages/FriendsPage.js`

Key CSS idea: the page uses flexbox so the cards stretch between the nav bars. The friends list container gets `min-height: 0` and `overflow-y: auto`, so the outer page stays still.

---

## 5. Quick Reference Table

| Feature | Where to look | Why it changed |
|---------|---------------|----------------|
| Home banner UI | `public/templates/home.html` | Add one CTA that works on every platform. |
| Banner styles | `src/css/styles.css` | Give the banner a compact, animated look. |
| Banner logic | `src/js/components/presence/LocationPermissionBanner.js` | Central place to request permission + restart polling. |
| Toggle cleanup | `src/js/components/presence/LocationSharingToggle.js` | Remove inline CTA; rely on banner. |
| Friends layout | `public/templates/friends.html`, `src/css/friends-page.css`, `src/js/pages/FriendsPage.js` | Remove campus card, stretch cards to full height. |
| Home page controller | `src/js/pages/HomePage.js` | Initialize/destroy the banner when the Home page loads/unloads. |

---

## 6. Cool Extras (Optional reading)

1. Tier 1 (network/IP) polling never stops, even without GPS.
2. Tier 2 (GPS) restarts after permission is granted—no second tap needed.
3. Banner remembers a dismiss inside the session (uses `sessionStorage`).
4. Layout uses flexbox to keep mobile pages feeling like an app view.

---

## 7. Want the fastest recap?

- **One banner** does all the GPS permission work.
- **Friends page** is cleaner and fits neatly between nav bars.
- **Toggle** only shows state; it no longer triggers permission requests.
- Most of the heavy lifting lives in `LocationPermissionBanner.js`.

Happy building! 🎉
