# CampXus - Task Completion Guidelines

## Required Steps When Task is Complete

### 1. Testing
```bash
npm test                    # Run all tests to ensure nothing is broken
npm run dev:check          # Verify environment setup is still valid
```

### 2. Code Quality Checks
```bash
npm run security:audit     # Check for security vulnerabilities
npm run security:fix       # Fix any auto-fixable security issues
```

### 3. Development Verification
```bash
npm run dev:config         # Regenerate config if .env.local changed
npm run dev:serve          # Test with full Firebase integration
# OR
npm run dev               # Test with Vite dev server for quick verification
```

### 4. Git Workflow
```bash
git add .                 # Stage changes
git commit -m "feat: descriptive commit message"  # Commit with clear message
git push origin branch-name  # Push to remote branch
```

### 5. Documentation Updates
- Update relevant README sections if architecture changes
- Add/update JSDoc comments for new public methods
- Update CLAUDE.md if new development patterns are introduced

## Quality Standards Before Completion

### Code Standards
- All functions have clear, descriptive names
- No console.log statements (use LogManager instead)  
- Proper error handling with try-catch blocks
- Memory leaks prevented (cleanup event listeners, timeouts)

### Performance Standards
- Real-time listeners are properly cleaned up
- Circuit breaker patterns used for intensive operations
- Debouncing implemented for frequent operations
- Efficient database queries with proper indexing

### Security Standards
- Input validation on all user data
- Proper Firebase security rules enforcement
- No secrets hardcoded in source code
- University email validation maintained

## Specific to CampXus Features

### Location Services
- Verify 3-tier system works correctly (Network → GPS → Google API)
- Test accuracy thresholds and cost optimization
- Ensure proper user privacy controls

### Friends System
- Test bilateral privacy controls
- Verify real-time updates work correctly
- Check memory cleanup in real-time listeners

### Schedule Features
- Verify OCR processing works with test images
- Test dual storage (Firestore + localStorage)
- Ensure cross-device synchronization works