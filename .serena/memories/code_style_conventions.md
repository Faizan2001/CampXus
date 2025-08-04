# CampXus Code Style & Conventions

## JavaScript Conventions

### Modern ES6+ Patterns
- Use ES6+ features consistently (`const`/`let`, arrow functions, `async`/`await`)
- Modular architecture with clear `import`/`export` statements
- Prefer `const` over `let`, avoid `var`
- Use template literals for string interpolation
- Use destructuring for object/array operations

### Code Organization
- **Services**: Business logic in `src/js/services/` (auth, data, friends, schedule, realtime)
- **Components**: Reusable UI components in `src/js/components/`
- **Pages**: Page-specific handlers in `src/js/pages/`
- **Utils**: Helper functions in `src/js/utils/`
- **Store**: State management in `src/js/store/`

### Function Style
```javascript
// Prefer async/await over Promises
async function initializeSPA() {
  try {
    await authManager.authReady;
    console.log("✅ Authentication ready!");
  } catch (error) {
    console.warn("⚠️ Authentication timeout:", error.message);
  }
}

// Use descriptive function names
function setupProfileCompletionFlow() { /* ... */ }
function updateGlobalUIForPage() { /* ... */ }
```

### Naming Conventions
- **Functions**: camelCase with descriptive names (`initializeSPA`, `setupProfileCompletionFlow`)
- **Variables**: camelCase (`mainContent`, `authTimeout`)
- **Constants**: UPPER_SNAKE_CASE for module-level constants
- **Classes**: PascalCase (`SPARouter`, `AuthService`)
- **Files**: PascalCase for classes, camelCase for utilities

### Error Handling
- Use explicit try-catch blocks for async operations
- Custom error classes: `AuthError`, `ValidationError`
- Comprehensive error logging with user-friendly messages
- Always handle Promise rejections

### Comments & Documentation
- Include JSDoc comments for complex functions
- Use descriptive comments for learning purposes (marked with "🎯 LEARNING:")
- Group console logs with `console.groupCollapsed()` for debugging
- Use emojis in console logs for visual clarity (✅, ⚠️, 🔍, 🎯)

## CSS Conventions

### Architecture
- **Modular CSS**: All styles imported through `src/css/styles.css`
- **CSS Custom Properties**: Consistent theming with CSS variables
- **BEM Methodology**: For class naming when needed
- **Mobile-First**: Responsive design approach

### File Organization
```
src/css/
├── variables.css     # Design system & CSS variables
├── layout.css        # App layout & navigation
├── components.css    # UI components & cards
├── schedule.css      # Schedule grid & interactions
├── friends-page.css  # Friends system styling
├── modal.css         # Modal dialogs
├── auth.css          # Authentication styling
└── animations.css    # Transitions & effects
```

### Design System
- Use CSS custom properties for colors, spacing, and typography
- Glassmorphism design with backdrop blur effects
- Consistent border radius and shadow patterns
- Responsive breakpoints with mobile-first approach

## HTML Conventions

### Semantic Structure
- Use semantic HTML5 elements (`<main>`, `<section>`, `<article>`)
- Include accessibility attributes (ARIA labels, alt text)
- Progressive enhancement principles
- SPA-specific attributes: `data-spa-route="route-name"` for navigation

### Template System
- Templates stored in `/public/templates/`
- Dynamic loading through SPA router
- Proper cleanup of event listeners

## Security Best Practices

### Environment Management
- Never commit `.env.local` or auto-generated config files
- Firebase API keys are safe in client code (protected by security rules)
- Use HTTPS in production (enforced by hosting config)

### Data Protection
- University email validation prevents unauthorized access
- Firestore security rules enforce authentication and privacy
- Input validation for all user-provided data
- Privacy controls for user data visibility

## Performance Considerations

### Memory Management
- Proper cleanup of real-time listeners to prevent memory leaks
- Smart caching for search results and friend data (5-minute TTL)
- DOM element caching in `src/js/utils/dom/domElements.js`

### Build Optimization
- CSS and JS code splitting through Vite configuration
- Firebase modules split into separate chunks for better caching
- Optimized asset naming and organization