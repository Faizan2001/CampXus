# 🕵️‍♂️ Memory Leak Detective - Complete Testing Guide

Welcome to the most comprehensive memory leak detection system for SPAs! This guide will teach you how to identify and fix memory leaks like a pro.

## 🚀 Quick Start

1. **Open your app in development mode**
2. **Open browser DevTools** (F12)
3. **Look for this message in console:**
   ```
   🕵️‍♂️ MEMORY LEAK DETECTIVE STARTING
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ✅ Memory Leak Detective is now monitoring your app!
   ```

4. **Available console commands:**
   ```javascript
   detective.report()           // Immediate report
   detective.testListeners()    // Add test listeners
   detective.testTimers()       // Create test timers
   detective.cleanup()          // Emergency cleanup
   detective.memoryProfile()    // Detailed memory analysis
   ```

## 📊 Understanding the Reports

### 🎧 Event Listeners Section
```
Active: 15 | Added: 45 | Removed: 30
```
- **Active**: Current active listeners (this should stay stable!)
- **Added/Removed**: Total count since monitoring started
- **🚨 RED FLAG**: If Active keeps growing, you have a memory leak!

### ⏲️ Timers Section
```
Active: 3 | Intervals: 2 | Timeouts: 1
```
- **Active**: Current running timers
- **🚨 RED FLAG**: If this number keeps growing, timers aren't being cleared!

### 🏗️ DOM Nodes Section
```
Net change: +25 | Created: 125 | Removed: 100
```
- **Net change**: Difference between created and removed nodes
- **🚨 RED FLAG**: Large positive net change indicates DOM memory leaks

### 🧠 Memory Usage Section
```
Current: 45.2MB | Growth: +2.1MB
Peak: 47.8MB | Limit: 2048.0MB
```
- **Growth**: Memory increase since start
- **🚨 RED FLAG**: Continuous growth over time indicates memory leaks

### 📈 Health Score
```
🟢 App Health Score: 85/100
```
- **🟢 90-100**: Excellent performance
- **🟡 70-89**: Good with minor issues
- **🔴 Below 70**: Problems detected - investigate!

## 🧪 Manual Testing Procedures

### Test 1: Basic Memory Leak Detection

**Objective**: Establish baseline and detect obvious leaks

```javascript
// 1. Get baseline
detective.report()

// 2. Navigate between pages 10 times
// Home → Friends → Home → Friends (repeat 5x)

// 3. Check for listener accumulation
detective.report()

// EXPECTED: Active listeners should NOT keep growing
// RED FLAG: If listeners go from 15 → 25 → 35, you have a leak!
```

### Test 2: Event Listener Stress Test

**Objective**: Simulate heavy listener usage

```javascript
// 1. Add test listeners
detective.testListeners(20)

// 2. Wait 10 seconds and check report
detective.report()

// 3. Clean up and verify
detective.cleanup()
setTimeout(() => detective.report(), 2000)

// EXPECTED: Listeners should decrease after cleanup
```

### Test 3: Timer Leak Detection

**Objective**: Find uncleaned timers

```javascript
// 1. Create test timers
detective.testTimers(5)

// 2. Check active count
detective.report()

// 3. Navigate between pages
// 4. Check if timers persist
detective.report()

// RED FLAG: If timers stay active after page changes
```

### Test 4: DOM Memory Leak Test

**Objective**: Detect DOM node accumulation

```javascript
// 1. Create test DOM nodes
detective.testDOMLeaks(50)

// 2. Check DOM growth
detective.report()

// 3. Navigate to different page and back
// 4. Check if nodes were cleaned up
detective.report()

// EXPECTED: Some cleanup should occur during navigation
```

### Test 5: Long Session Simulation

**Objective**: Detect gradual memory leaks

```javascript
// 1. Start monitoring
detective.memoryProfile()

// 2. Use app normally for 10-15 minutes:
//    - Navigate between pages
//    - Search for friends
//    - View schedules
//    - Interact with UI elements

// 3. Check final memory state
detective.memoryProfile()

// EXPECTED: Memory growth should be reasonable (<30MB)
// RED FLAG: Continuous upward memory trend
```

## 🚨 Common Memory Leak Patterns (What to Look For)

### Pattern 1: Event Listener Accumulation
```
Initial: Active: 12
After 5 navigations: Active: 22  ← RED FLAG!
After 10 navigations: Active: 32 ← MEMORY LEAK!
```

### Pattern 2: Timer Leaks
```
Initial: Active: 2
After using app: Active: 8     ← Investigate
After more usage: Active: 15   ← MEMORY LEAK!
```

### Pattern 3: DOM Growth
```
Initial: Net change: 0
After usage: Net change: +150  ← Investigate
After more usage: Net change: +300 ← MEMORY LEAK!
```

### Pattern 4: Memory Growth
```
Initial: 25MB
10 min later: 45MB   ← OK
20 min later: 85MB   ← WARNING
30 min later: 125MB  ← MEMORY LEAK!
```

## 🔧 Debugging Memory Leaks

### Step 1: Identify the Source
```javascript
// Check which listeners are accumulating
detective.report()

// Look for patterns like:
// "Most common types: [["click", 25], ["mouseover", 18]]"
```

### Step 2: Use Browser DevTools
```javascript
// Get DevTools recommendations
detective.report() // Look for Chrome DevTools suggestions

// Common tools:
// 1. Memory tab → Heap snapshots
// 2. Performance tab → Record timeline
// 3. Elements tab → Event Listeners panel
```

### Step 3: Fix Common Issues

**Router Event Listeners:**
```javascript
// ❌ BAD: Never cleaned up
document.addEventListener('click', handler)

// ✅ GOOD: Use AbortController
const controller = new AbortController()
document.addEventListener('click', handler, { signal: controller.signal })

// Later...
controller.abort() // Removes ALL listeners with this signal
```

**Page Event Listeners:**
```javascript
// ❌ BAD: Added every page load, never removed
function setupPage() {
  button.addEventListener('click', handler)
}

// ✅ GOOD: Cleanup on page unload
document.addEventListener('spa:page:unload', (event) => {
  if (event.detail.route === 'mypage') {
    cleanup() // Remove all listeners
  }
})
```

**Timer Cleanup:**
```javascript
// ❌ BAD: Timer keeps running forever
const interval = setInterval(() => {
  updateData()
}, 1000)

// ✅ GOOD: Clear timer when leaving page
document.addEventListener('spa:page:unload', () => {
  clearInterval(interval)
})
```

## 💡 Pro Tips for Beginners

### Tip 1: Watch the Console
The detective logs color-coded messages:
- 🟢 **Green**: Everything is good
- 🟡 **Yellow**: Warning - keep an eye on this
- 🔴 **Red**: Critical - fix immediately!

### Tip 2: Use the Health Score
A dropping health score means performance is degrading:
- Start: 100/100
- After 10 min: 95/100 (normal)
- After 20 min: 70/100 (investigate)
- After 30 min: 40/100 (memory leak likely!)

### Tip 3: Test Real User Behavior
Don't just click randomly - simulate real usage:
- Search for friends
- Navigate between pages normally
- View different schedules
- Use mobile interactions (touch events)

### Tip 4: Compare Before/After
Always get a baseline:
```javascript
// Before changes
detective.report()

// Make your changes...

// After changes
detective.report()

// Compare the numbers!
```

## 🎯 Success Criteria

### ✅ Healthy App Signs
- Event listeners stay stable (±5 variance)
- Timer count doesn't grow continuously  
- Memory growth is gradual (<2MB per hour)
- Health score stays above 70
- DOM net change resets during navigation

### 🚨 Memory Leak Signs
- Event listeners growing linearly with usage
- Timer count increasing every page visit
- Memory growing >5MB per 10 minutes
- Health score dropping below 50
- DOM nodes accumulating without cleanup

## 🆘 Emergency Cleanup

If you detect a severe memory leak:

```javascript
// 1. Emergency cleanup
detective.cleanup()

// 2. Force garbage collection (Chrome only)
if (window.gc) window.gc()

// 3. Get immediate report
detective.report()

// 4. If still bad, reload the page
if (detective.stats.memory.current?.used > 200) {
  console.warn('Memory usage too high, consider page reload')
}
```

## 📱 Testing on Mobile

Memory leaks are more critical on mobile devices:

1. **Open Chrome DevTools**
2. **Toggle Device Toolbar** (mobile simulation)
3. **Run the same tests**
4. **Watch for:**
   - Faster memory growth
   - Lower performance scores
   - More aggressive garbage collection

## 🎓 Learning Objectives

After using this system, you should understand:

1. **What are memory leaks** and why they matter
2. **How to identify** different types of leaks
3. **Browser tools** for memory debugging
4. **Prevention patterns** for clean code
5. **Monitoring techniques** for production apps

## 📞 Getting Help

If you're seeing concerning patterns:

1. **Run detective.memoryProfile()** for detailed analysis
2. **Take Chrome heap snapshots** for deep inspection
3. **Check console for specific leak types** (listeners, timers, DOM)
4. **Look for patterns** in the timing of issues

Remember: Some memory growth is normal! The key is identifying **continuous, unbounded growth** patterns.

---

**🚀 Happy debugging! Your SPA performance will thank you!** 🚀