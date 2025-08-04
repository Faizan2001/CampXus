# Task Completion Checklist for CampXus

## When a Development Task is Completed

### 1. Code Quality Checks
- **Test Suite**: Run `npm test` to ensure all tests pass
- **Security Audit**: Run `npm run security:audit` if dependencies were modified
- **Environment Check**: Run `npm run dev:check` to validate setup

### 2. Build Verification
- **Development Build**: Test with `npm run dev:serve` (recommended for Firebase integration)
- **Production Build**: Run `npm run build` to verify production build succeeds
- **Preview**: Test production build with `npm run preview`

### 3. Firebase Integration
- **Local Testing**: Use `npm run firebase:emulators` to test with local Firebase emulators
- **Security Rules**: Verify Firestore security rules in `firestore.rules` if database operations were modified
- **Real-time Features**: Test real-time listeners and cleanup to prevent memory leaks

### 4. Code Standards Compliance
- **ES6+ Patterns**: Ensure modern JavaScript patterns are used
- **Error Handling**: Verify proper try-catch blocks and error messages
- **Memory Management**: Check for proper cleanup of event listeners and real-time listeners
- **Console Logging**: Use descriptive console logs with emojis for debugging

### 5. SPA-Specific Checks
- **Navigation**: Test SPA routing with browser back/forward buttons
- **Template Loading**: Verify dynamic template loading works correctly
- **State Management**: Check that user state persists across navigation
- **Authentication**: Test auth state listeners and protected routes

### 6. UI/UX Verification
- **Responsive Design**: Test on different screen sizes
- **Accessibility**: Check keyboard navigation and screen reader compatibility
- **Glassmorphism**: Verify modern UI styling is consistent
- **Real-time Updates**: Test live notifications and data synchronization

### 7. Files to Check After Changes

#### If Authentication Logic Modified:
- `src/js/services/auth/AuthService.js`
- `src/js/services/auth/UniversityValidator.js`
- `firestore.rules`

#### If Database Operations Modified:
- `src/js/services/data/DataService.js`
- `firestore.rules`
- Test with Firebase emulators

#### If Friends System Modified:
- `src/js/services/friends/FriendsService.js`
- `src/js/services/realtime/RealtimeService.js`
- `src/js/pages/FriendsPage.js`

#### If Schedule Features Modified:
- `src/js/services/schedule/` directory
- `src/js/pages/HomePage.js`
- Schedule-related tests

#### If SPA Navigation Modified:
- `src/js/router/Router.js`
- `src/js/app.js`
- Template files in `/public/templates/`

### 8. Never Commit Until:
- All tests pass with `npm test`
- Build succeeds with `npm run build`
- Development server works with `npm run dev:serve`
- No security vulnerabilities reported by `npm run security:audit`

### 9. Environment-Specific Notes
- **Development**: Always use `npm run dev:serve` for full Firebase integration
- **Production**: Ensure `npm run build` produces clean output
- **Testing**: Run tests with `NODE_OPTIONS=--experimental-vm-modules jest`

### 10. Documentation Updates
- Update `CLAUDE.md` if new development patterns are established
- Update README.md if new features or commands are added
- Update memory files if architectural changes are made