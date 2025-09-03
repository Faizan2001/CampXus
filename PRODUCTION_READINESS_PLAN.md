# CampXus Production Readiness Plan

Status: v2 (launch‑focused) — Target: first public launch (3k students)

This plan turns the current JAMstack SPA (Vite + Firebase) into a production-ready deployment on Cloudflare Pages with a custom domain, strong privacy defaults, and clear operations steps.

----------------------------------------

## 0) Launch Week Priorities (Order)

1) Firestore privacy (blocker)
   - Restrict schedule/location to friends only. Best: split to `/schedules` + `/presence` (Appendix A). If not possible now, temporarily restrict `/users` reads to self/friends and set `socialInfo.searchable=false` by default.
   - Deploy rules + indexes and test with two non‑friend accounts.

2) CSP + headers (blocker)
   - Remove `unsafe-eval` from production CSP in `index.html`. Keep only Firebase, gstatic, ipinfo in `connect-src`.
   - Keep HSTS and security headers via `public/_headers` and Cloudflare.

3) Domains/Auth (blocker)
   - Add `campxus.pages.dev` + your custom domain to Firebase Auth “Authorized domains”.
   - Set email action URLs to your production domain.

4) Keys/quotas (blocker)
   - Restrict Google key by HTTP referrers; set daily quota alerts (Firebase + Google Cloud budgets).
   - Decide ipinfo token: remove (free limits), or accept exposure and lower call frequency (throttle in code), or proxy later via Cloudflare Worker.

5) Presence cost control (high priority)
   - Set polling to 60–90s (keep instant on login/tab return). Keep listeners page‑scoped (your code mostly does this).

6) Privacy policy (high priority)
   - Add `public/templates/privacy.html`; link from the consent banner.

7) Minimal monitoring (high priority)
   - Enable Cloudflare Web Analytics for traffic; set Firebase usage alerts; add simple user count and “online now” views (see Monitoring & Quick How‑Tos).

8) Quick hygiene (nice‑to‑have if time)
   - Sanitize user‑rendered text (bio/displayName) with `textContent` or DOMPurify.
   - Add Sentry with low sample rate (PII off) for JavaScript errors.

----------------------------------------

## 1) Architecture Decision

- Frontend: Static SPA (Vite). Good fit for Cloudflare Pages/CDN.
- Backend: Firebase (Auth + Firestore). No custom server needed.
- Realtime: Firestore listeners (centralized in `RealtimeService`).
- Privacy: Bilateral friendship controls already implemented in code; enforce in rules and data layout.

Conclusion: Stay JAMstack on Cloudflare Pages. No PaaS needed unless you add a custom Node server later.

----------------------------------------

## 2) Monitoring & Alerts (Launch + Ongoing)

What to turn on now
- Cloudflare Web Analytics: traffic, pages, devices (privacy‑friendly).
- Firebase Console Alerts: Firestore reads/writes, Authentication sign‑ups, billing budget alerts.
- Optional Sentry: JavaScript error capture (sample 0.1–1%, PII disabled).

What to check weekly
- Firebase Auth dashboard (new users, active users).
- Firestore usage graphs (reads/writes per day). If spikes → increase presence interval to 120s; ensure listeners only run on active pages.
- ipinfo/google usage dashboards; rotate token or raise cooldowns if hammered.

Simple KPIs to watch
- New users per week, MAU.
- “Online now” (active in last 5–10 minutes).
- Friend request volume and errors (optional).

How to see user counts quickly (no GA needed)
- Total users: run an aggregation count on `users` or check Firebase Auth “Users”.
- Online now: count `users` where `systemInfo.lastActive > now - 5m`.

----------------------------------------

## 3) Cloudflare Pages: Project, Domain, HTTPS

1) Create/confirm Pages project
   - Build command: see Section 4.
   - Output directory: `dist`.
   - Set “Production branch” to `main` (or your default branch).

2) Add custom domain
   - Pages → Your project → Custom domains → Add domain.
   - If using Cloudflare DNS: one-click setup; otherwise add the shown CNAME at your registrar.

3) Enforce HTTPS and HSTS
   - In Cloudflare dashboard → SSL/TLS → Edge Certificates:
     - Enable “Always Use HTTPS”.
     - Enable HSTS with `max-age=31536000; includeSubDomains; preload` (after confirming all subdomains are HTTPS).

4) SPA routing and headers
   - You already have `public/_redirects` → `/* /index.html 200` (required for SPA).
   - You already have `public/_headers` with security headers. Keep and extend via Cloudflare if needed.

----------------------------------------

## 4) Build & Environment Injection (Cloudflare Pages)

Goal: Generate `window.ENV` at build time; do not commit config.

Env vars to define in Cloudflare Pages (Project → Settings → Environment Variables):

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `GOOGLE_GEOLOCATION_API_KEY`
- `NODE_ENV=production`

Build command (uses your generator to create `src/js/lib/firebase/env-config.js`):

```
printf 'FIREBASE_API_KEY=%s\nFIREBASE_AUTH_DOMAIN=%s\nFIREBASE_PROJECT_ID=%s\nFIREBASE_STORAGE_BUCKET=%s\nFIREBASE_MESSAGING_SENDER_ID=%s\nFIREBASE_APP_ID=%s\nGOOGLE_GEOLOCATION_API_KEY=%s\nNODE_ENV=production\n' \
  "$FIREBASE_API_KEY" "$FIREBASE_AUTH_DOMAIN" "$FIREBASE_PROJECT_ID" \
  "$FIREBASE_STORAGE_BUCKET" "$FIREBASE_MESSAGING_SENDER_ID" "$FIREBASE_APP_ID" \
  "$GOOGLE_GEOLOCATION_API_KEY" > .env.local \
  && npm ci \
  && npm run dev:config \
  && npm run build
```

Notes
- Keep `src/js/lib/firebase/env-config.js` out of git (already in `.gitignore`).
- `firebase-config-production.js` is a fallback. Prefer environment injection above. If it contains real keys, replace with placeholders and rely on build-time env.

----------------------------------------

## 5) Firebase Project: Auth, Domains, Rules, Indexes

1) Auth
- Enable Email/Password in Firebase Console.
- Add both `campxus.pages.dev` and your custom domain to “Authorized domains”.
- Configure action URLs to your production domain in Auth templates.

2) Firestore rules and indexes
- Deploy your `firestore.rules` and `firestore.indexes.json` before launch:

```
firebase deploy --only firestore:rules,firestore:indexes
```

3) Budgets & monitoring
- Set spend/quota alerts for Firestore, Authentication, and Google APIs.
- Start on Blaze if you expect high realtime usage; otherwise watch free-tier closely week 1.

----------------------------------------

## 6) Data Model Hardening (Privacy-First)

Observed
- `/users/{uid}` holds user profile plus `scheduleData` and `systemInfo.lastKnownLocation` fields.
- Current rules allow reads when `socialInfo.searchable == true` for same-university users. This can expose schedule/location to non-friends.

Recommended (preferred)
- Split sensitive fields into separate collections with tighter rules:
  - `/publicProfiles/{uid}`: minimal public info for discovery (displayName, major, avatar, university). Read: authenticated, same-university.
  - `/schedules/{uid}`: schedule only. Read: owner or friend with bilateral `scheduleVisibility`.
  - `/presence/{uid}`: campus presence + lastKnownLocation. Read: owner or friend with bilateral `locationVisibility`.
  - Keep `/users/{uid}` as private/full profile: read only by owner or friend (if desired), otherwise not world-readable.

Fast fallback (if you cannot refactor now)
- Set `socialInfo.searchable` default to `false` for all users.
- Restrict `/users/{uid}` reads to self or friends only (remove same-university searchable clause) until you introduce `publicProfiles`.

Implementation steps
1) Create new collections and migrate reads/writes in `DataService`:
   - `getUserProfileMinimal` → read from `/publicProfiles/{uid}`.
   - `saveUserSchedule`/`getUserSchedule` → `/schedules/{uid}`.
   - `updateUserLocationStatus` → `/presence/{uid}`.
2) Update Firestore rules (see Appendix A for full example).
3) (Optional) Backfill existing data using a one-off script or manual migration.

----------------------------------------

## 7) CSP & Security Headers

Target CSP (production, strict — no `unsafe-eval`)

```
default-src 'self';
script-src 'self' https://www.gstatic.com https://apis.google.com;
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://use.fontawesome.com;
font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://use.fontawesome.com;
img-src 'self' data: blob: https://*.googleusercontent.com https://api.dicebear.com;
connect-src 'self' 
  https://securetoken.googleapis.com 
  https://identitytoolkit.googleapis.com 
  https://firestore.googleapis.com 
  https://*.googleapis.com 
  https://*.firebaseio.com 
  https://*.firebaseapp.com 
  https://ipinfo.io;
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
```

Actions
- Remove `unsafe-eval` from `index.html` CSP (keep it only in dev if absolutely needed).
- Your `privacyManager` uses inline `onclick` handlers. To drop `script-src 'unsafe-inline'`, refactor to addEventListener-based binding. If not refactoring now, keep `unsafe-inline` for `style-src` and scripts.
- Keep HSTS and other headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) — already present in `public/_headers`.

----------------------------------------

## 8) Privacy & Compliance

1) Privacy Policy page
- Add `public/templates/privacy.html` and link from the banner.
- Include: what data you collect (email, profile, schedule, presence), how it’s used, how to delete (contact or in-app), and Firebase as processor.

2) Consent
- Your banner stores consent in `localStorage`. Only enable optional analytics/3rd-party features when consented.

3) Account deletion
- Provide a simple flow: “Delete account” → sign user out + show how to request deletion. If you later add Cloud Functions, you can automate delete across collections.

4) Fix banner link
- Update `privacyManager` link from `/pages/privacy.html` to `/templates/privacy.html` (matches your public folder path conventions).

----------------------------------------

## 9) Location & Presence: Cost and Safety

- Presence polling: start with 60–90s interval (you call 20s now). Keep immediate triggers on login/tab return.
- Google Geolocation API: set HTTP referrer restrictions to your domains and define daily quota alerts.
- ipinfo.io token (client-side): anyone can see it. Safer options:
  1) Remove token and use free unauthenticated limits; or
  2) Proxy via a Cloudflare Worker (stores secret server-side); or
  3) Continue with token + rotate if abused; set call frequency low.

----------------------------------------

## 10) Performance & DX

- Vite build already splits vendor chunks; hashed assets are cached well.
- Keep images/fonts from CDNs; consider self-hosting if stability needed.
- Turn off verbose logs in production (your log profile defaults to critical — good).

----------------------------------------

## 11) Preventing Abuse (Practical, No Backend)

1) Friend requests
- Firestore rules: prevent duplicate requests; only involved users may update (already covered).
- Client cooldown: 10–30s delay per user; cap visible “pending” count.

2) API keys/tokens
- Google Geolocation: restrict by HTTP referrers; daily quotas/alerts.
- ipinfo: remove token or throttle to 1 call per 3–5 minutes per user; rotate or proxy later if abused.

3) App resource abuse
- Presence interval 60–90s; stop listeners on navigation; don’t run when tab hidden.

4) Optional CAPTCHA
- Cloudflare Turnstile on forms if bot activity appears; email verification already blocks most.

Playbook for spikes
- Raise presence interval + redeploy.
- Disable ipinfo via a quick ENV flag + redeploy.
- Reduce listeners to only the current visible page.

----------------------------------------

## Quick How‑Tos

Count total users
```js
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '/src/js/lib/firebase/firebase-config.js';
const snap = await getCountFromServer(collection(db, 'users'));
console.log('Total users:', snap.data().count);
```

Count “online now” (active in last 5 minutes)
```js
import { collection, query, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { db } from '/src/js/lib/firebase/firebase-config.js';
const fiveMinAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
const q = query(collection(db, 'users'), where('systemInfo.lastActive', '>', fiveMinAgo));
const snap = await getCountFromServer(q);
console.log('Online now:', snap.data().count);
```

Throttle ipinfo calls
```js
const last = Number(localStorage.getItem('ipinfo:last')) || 0;
if (Date.now() - last > 3 * 60 * 1000) {
  // call ipinfo
  localStorage.setItem('ipinfo:last', String(Date.now()));
}
```

Sentry minimal setup (optional)
```js
import * as Sentry from '@sentry/browser';
Sentry.init({ dsn: 'YOUR_DSN', tracesSampleRate: 0.1, defaultIntegrations: true });
```

----------------------------------------

## 12) Pre-Launch Test Plan

Functional
- New user signup/login with production domain; email verification flow.
- Two test users from same university; send/accept friend request.
- Schedule import and compare across friends (friend/not-friend cases).
- Location sharing toggles; verify presence dots only visible to allowed friends.

Security/Privacy
- Attempt to read a non-friend’s schedule/presence via direct Firestore calls (should be denied by rules).
- Check CSP violations in browser console; ensure no blocked core scripts.

Load sanity
- Open 10–20 concurrent sessions; verify Firestore usage doesn’t spike unexpectedly and UI remains responsive.

----------------------------------------

## 13) Launch Steps (Production)

1) Cloudflare Pages
   - Set env vars, build command, output `dist`.
   - Add custom domain, enable HTTPS/HSTS.

2) Firebase
   - Add authorized domains.
   - Deploy rules + indexes.
   - Configure Auth email templates.

3) App
   - Update CSP in `index.html` (drop `unsafe-eval`).
   - Add `public/templates/privacy.html` and verify banner link.
   - Ensure presence polling = 60–90s initially.

4) Announce soft launch → monitor → full launch.

----------------------------------------

## 14) Post-Launch & Rollback

- If errors spike: rollback by re-deploying previous Pages build (one click) and revert rules to last working version.
- If Firestore reads surge: increase polling interval, reduce realtime listeners in non-critical pages, review caching.
- If IP detection is abused: temporarily disable ipinfo calls or move to Worker proxy.

----------------------------------------

## Appendix A — Firestore Rules (Recommended Split)

Use this as a starting point if you split collections. Adapt names to your code.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Minimal public profile for discovery
    match /publicProfiles/{userId} {
      allow read: if request.auth != null &&
        get(/databases/$(database)/documents/publicProfiles/$(userId)).data.university ==
        get(/databases/$(database)/documents/publicProfiles/$(request.auth.uid)).data.university;
      allow create, update, delete: if request.auth.uid == userId;
    }

    // Full user doc (private-ish). Prefer: self or friend-only reads
    match /users/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || isFriend(request.auth.uid, userId)
      );
      allow create, update, delete: if request.auth.uid == userId;
    }

    // Schedules gated by bilateral friendship schedule visibility
    match /schedules/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || canViewFriendSchedule(request.auth.uid, userId)
      );
      allow create, update, delete: if request.auth.uid == userId;
    }

    // Presence/location gated by bilateral location visibility
    match /presence/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || canViewFriendLocation(request.auth.uid, userId)
      );
      allow create, update, delete: if request.auth.uid == userId;
    }

    // Friendships (your app already uses bilateral privacy here)
    match /friendships/{friendshipId} {
      allow read: if request.auth != null && (
        (friendshipId.split('_')[0] == request.auth.uid || friendshipId.split('_')[1] == request.auth.uid)
        || (resource != null && request.auth.uid in resource.data.users)
      );
      allow create: if request.auth != null && request.auth.uid in request.resource.data.users;
      allow update, delete: if request.auth != null && request.auth.uid in resource.data.users;
    }

    function isFriend(a, b) {
      return exists(/databases/$(database)/documents/friendships/$(a < b ? a + '_' + b : b + '_' + a));
    }

    function canViewFriendSchedule(viewer, owner) {
      return exists(/databases/$(database)/documents/friendships/$(viewer < owner ? viewer + '_' + owner : owner + '_' + viewer))
        && get(/databases/$(database)/documents/friendships/$(viewer < owner ? viewer + '_' + owner : owner + '_' + viewer)).data.scheduleVisibility[owner] == true;
    }

    function canViewFriendLocation(viewer, owner) {
      return exists(/databases/$(database)/documents/friendships/$(viewer < owner ? viewer + '_' + owner : owner + '_' + viewer))
        && get(/databases/$(database)/documents/friendships/$(viewer < owner ? viewer + '_' + owner : owner + '_' + viewer)).data.locationVisibility[owner] == true;
    }
  }
}
```

If you cannot split collections immediately, tighten `/users/{uid}` reads to self or friends and set `socialInfo.searchable=false` by default until `publicProfiles` exists.

----------------------------------------

## Appendix B — CSP Meta Tag (Drop unsafe-eval)

Replace the `meta http-equiv="Content-Security-Policy"` in `index.html` with the policy in Section 7.

----------------------------------------

## Appendix C — Cloudflare Pages: Env Vars

Add these as plain env vars (Firebase web keys are public by design; still, don’t hardcode):

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
GOOGLE_GEOLOCATION_API_KEY
NODE_ENV=production
```

Use the build command in Section 4 to generate `env-config.js` before `vite build`.

----------------------------------------

## Appendix D — Operational Defaults (Week 1)

- Presence polling: 60–90s.
- Debug logs: profile `critical` (default); enable `?logs=debug` only when investigating.
- Watch Firestore reads for the friends page; keep listeners active only while page is open.

----------------------------------------

## Appendix E — What To Defer (Not Launch Blockers)

- ESLint/Prettier/Husky + CI/CD pipeline.
- Web‑Vitals/Lighthouse CI.
- Full component/state refactor and advanced caching.
