# Development Guide

## 🚀 Quick Start (Daily Workflow)

### Terminal 1: Start Emulators

```bash
npm run firebase:emulators:persist
```

This starts all Firebase emulators and **persists data** between restarts.

### Terminal 2: Start Dev Server

```bash
npm run dev
```

### Open in Browser

- **App**: http://localhost:5173
- **Emulator UI**: http://localhost:4000

---

## 🔥 Firebase Emulators

### What are Emulators?

Local versions of Firebase services that run on your machine:

- **Auth** (port 9099): Test authentication without real emails
- **Firestore** (port 8080): Local database, isolated from production
- **Storage** (port 9199): Local file storage
- **Functions** (port 5001): Cloud functions testing

### Why Use Emulators?

✅ **Free** - No Firebase costs  
✅ **Fast** - No network latency  
✅ **Safe** - Can't break production  
✅ **Offline** - Works without internet  
✅ **Reset** - Fresh start anytime

### Emulator Commands

```bash
# Basic (data lost on exit)
npm run firebase:emulators

# With persistence (recommended - saves data on exit, restores on start)
npm run firebase:emulators:persist

# Export current data manually
npm run firebase:emulators:export
```

### Accessing Emulator UI

Open http://localhost:4000 to:

- View Firestore data
- See authenticated users
- Browse uploaded files
- Monitor cloud functions
- Manually add test data

---

## 🧪 Testing with Fake Data

### Creating Test Users

Emulators **don't require real emails**. Use anything:

- `test@test.com`
- `user1@fake.com`
- `admin@example.com`

**No email verification needed!** Just sign up and you're in.

### Adding Test Users via UI

1. Go to http://localhost:4000/auth
2. Click "Add User"
3. Enter any email/password
4. Done!

### Quick Console Trick

In browser DevTools console:

```javascript
// Create test user
import("firebase/auth").then(({ createUserWithEmailAndPassword }) => {
  createUserWithEmailAndPassword(
    window.__fireTest.auth,
    "test@test.com",
    "password123"
  );
});
```

---

## 📊 How Localhost Detection Works

Your app automatically detects the environment:

```javascript
// In firebase-config.js
if (window.location.hostname === "localhost") {
  // 🔧 Connect to EMULATORS
} else {
  // 🌐 Connect to PRODUCTION
}
```

**Result:**

- `localhost:5173` or `localhost:5174` → Uses emulators
- `yourdomain.com` → Uses production

---

## 💾 Data Persistence

### Default Behavior (No Persistence)

When you stop emulators, **all data is deleted**.

### With Persistence (Recommended)

```bash
npm run firebase:emulators:persist
```

- **Exports** data when you stop emulators (Ctrl+C)
- **Imports** data when you restart
- Data saved to `.emulator-data/` (gitignored)

### Import Production Data (Optional)

```bash
# One-time: Export from production
firebase firestore:export ./production-snapshot

# Use production data in emulators
firebase emulators:start --import=./production-snapshot
```

---

## 🐛 Common Issues

### "CORS Error" when uploading files

**Cause:** Emulators not running  
**Fix:** Start emulators before `npm run dev`

### "User not found" after restart

**Cause:** Using non-persistent emulators  
**Fix:** Use `npm run firebase:emulators:persist` instead

### Changes not appearing in Firestore

**Cause:** Looking at production instead of emulator  
**Fix:** Check http://localhost:4000/firestore (emulator UI)

### "Connection refused" errors

**Cause:** Emulators stopped  
**Fix:** Restart emulators in Terminal 1

---

## 🎯 Development vs Production

| Feature       | Development (Emulators) | Production        |
| ------------- | ----------------------- | ----------------- |
| **URL**       | `localhost:5173`        | Your domain       |
| **Auth**      | Fake emails OK          | Real emails only  |
| **Firestore** | Local, isolated         | Cloud database    |
| **Storage**   | Local files             | Cloud storage     |
| **Cost**      | Free                    | Pay-as-you-go     |
| **Speed**     | Instant                 | Network latency   |
| **Safety**    | Can't break prod        | Real consequences |

---

## 📝 Best Practices

### ✅ DO:

- Always run emulators during development
- Use fake emails for testing
- Export emulator data before major changes
- Check Emulator UI to debug issues
- Keep emulators running while coding

### ❌ DON'T:

- Test directly on production
- Use real user data in emulators
- Commit `.emulator-data/` to git
- Rely on emulator data being permanent (without persistence)

---

## 🔄 Typical Development Session

```bash
# Morning - Start work
npm run firebase:emulators:persist  # Terminal 1 - restores yesterday's data
npm run dev                          # Terminal 2

# Work all day...
# Create test users, add data, test features

# Evening - End work
# Press Ctrl+C in Terminal 1 - emulator exports data automatically
# Press Ctrl+C in Terminal 2 - stop dev server

# Next day - data is still there!
```

---

## 🆘 Need Help?

- **Emulator UI**: http://localhost:4000
- **Firebase Docs**: https://firebase.google.com/docs/emulator-suite
- **Console logs**: Check for "🔧 EMULATOR MODE" message in browser console
