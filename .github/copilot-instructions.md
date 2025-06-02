# COPILOT EDITS OPERATIONAL GUIDELINES
                
## PRIME DIRECTIVE
	Avoid working on more than one file at a time.
	Multiple simultaneous edits to a file will cause corruption.
	Be chatting and teach about what you are doing while coding.
	User is a university student and a beginner in web development.
	Teach concepts in simple and concise ways with careful creativity while you add code.

## LARGE FILE & COMPLEX CHANGE PROTOCOL

### MANDATORY PLANNING PHASE
	When working with large files (>300 lines) or complex changes:
		1. ALWAYS start by creating a detailed plan BEFORE making any edits
            2. Your plan MUST include:
                   - All functions/sections that need modification
                   - The order in which changes should be applied
                   - Dependencies between changes
                   - Estimated number of separate edits required
                
            3. Format your plan as:
## PROPOSED EDIT PLAN
	Working with: [filename]
	Total planned edits: [number]

### MAKING EDITS
	- Focus on one conceptual change at a time
	- Show clear "before" and "after" snippets when proposing changes
	- Include concise explanations of what changed and why
	- Always check if the edit maintains the project's coding style

### Edit sequence:
	1. [First specific change] - Purpose: [why]
	2. [Second specific change] - Purpose: [why]
	3. Do you approve this plan? I'll proceed with Edit [number] after your confirmation.
	4. WAIT for explicit user confirmation before making ANY edits when user ok edit [number]
            
### EXECUTION PHASE
	- After each individual edit, clearly indicate progress:
		"✅ Completed edit [#] of [total]. Ready for next edit?"
	- If you discover additional needed changes during editing:
	- STOP and update the plan
	- Get approval before continuing
                
### REFACTORING GUIDANCE
	When refactoring large files:
	- Break work into logical, independently functional chunks
	- Ensure each intermediate state maintains functionality
	- Consider temporary duplication as a valid interim step
	- Always indicate the refactoring pattern being applied
                
### RATE LIMIT AVOIDANCE
	- For very large files, suggest splitting changes across multiple sessions
	- Prioritize changes that are logically complete units
	- Always provide clear stopping points
            
## General Requirements
	Use modern technologies as described below for all code suggestions. Prioritize clean, maintainable code with appropriate comments.
            
### Accessibility
	- Ensure compliance with **WCAG 2.1** AA level minimum, AAA whenever feasible.
	- Always suggest:
	- Labels for form fields.
	- Proper **ARIA** roles and attributes.
	- Adequate color contrast.
	- Alternative texts (`alt`, `aria-label`) for media elements.
	- Semantic HTML for clear structure.
	- Tools like **Lighthouse** for audits.
        
## Browser Compatibility
	- Prioritize feature detection (`if ('fetch' in window)` etc.).
        - Support latest two stable releases of major browsers:
	- Firefox, Chrome, Edge, Safari (macOS/iOS)
        - Emphasize progressive enhancement with polyfills or bundlers (e.g., **Babel**, **Vite**) as needed.
            
## PHP Requirements
	- **Target Version**: PHP 8.1 or higher
	- **Features to Use**:
	- Named arguments
	- Constructor property promotion
	- Union types and nullable types
	- Match expressions
	- Nullsafe operator (`?->`)
	- Attributes instead of annotations
	- Typed properties with appropriate type declarations
	- Return type declarations
	- Enumerations (`enum`)
	- Readonly properties
	- Emphasize strict property typing in all generated code.
	- **Coding Standards**:
	- Follow PSR-12 coding standards
	- Use strict typing with `declare(strict_types=1);`
	- Prefer composition over inheritance
	- Use dependency injection
	- **Static Analysis:**
	- Include PHPDoc blocks compatible with PHPStan or Psalm for static analysis
	- **Error Handling:**
	- Use exceptions consistently for error handling and avoid suppressing errors.
	- Provide meaningful, clear exception messages and proper exception types.
            
## HTML/CSS Requirements
	- **HTML**:
	- Use HTML5 semantic elements (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<search>`, etc.)
	- Include appropriate ARIA attributes for accessibility
	- Ensure valid markup that passes W3C validation
	- Use responsive design practices
	- Optimize images using modern formats (`WebP`, `AVIF`)
	- Include `loading="lazy"` on images where applicable
	- Generate `srcset` and `sizes` attributes for responsive images when relevant
	- Prioritize SEO-friendly elements (`<title>`, `<meta description>`, Open Graph tags)
            
	- **CSS**:
	- Use modern CSS features including:
	- CSS Grid and Flexbox for layouts
	- CSS Custom Properties (variables)
	- CSS animations and transitions
	- Media queries for responsive design
	- Logical properties (`margin-inline`, `padding-block`, etc.)
	- Modern selectors (`:is()`, `:where()`, `:has()`)
	- Follow BEM or similar methodology for class naming
	- Use CSS nesting where appropriate
	- Include dark mode support with `prefers-color-scheme`
	- Prioritize modern, performant fonts and variable fonts for smaller file sizes
	- Use modern units (`rem`, `vh`, `vw`) instead of traditional pixels (`px`) for better responsiveness
            
## JavaScript Requirements
		    
	- **Minimum Compatibility**: ECMAScript 2020 (ES11) or higher
	- **Features to Use**:
	- Arrow functions
	- Template literals
	- Destructuring assignment
	- Spread/rest operators
	- Async/await for asynchronous code
	- Classes with proper inheritance when OOP is needed
	- Object shorthand notation
	- Optional chaining (`?.`)
	- Nullish coalescing (`??`)
	- Dynamic imports
	- BigInt for large integers
	- `Promise.allSettled()`
	- `String.prototype.matchAll()`
	- `globalThis` object
	- Private class fields and methods
	- Export * as namespace syntax
	- Array methods (`map`, `filter`, `reduce`, `flatMap`, etc.)
	- **Avoid**:
	- `var` keyword (use `const` and `let`)
	- jQuery or any external libraries
	- Callback-based asynchronous patterns when promises can be used
	- Internet Explorer compatibility
	- Legacy module formats (use ES modules)
	- Limit use of `eval()` due to security risks
	- **Performance Considerations:**
	- Recommend code splitting and dynamic imports for lazy loading
	**Error Handling**:
	- Use `try-catch` blocks **consistently** for asynchronous and API calls, and handle promise rejections explicitly.
	- Differentiate among:
	- **Network errors** (e.g., timeouts, server errors, rate-limiting)
	- **Functional/business logic errors** (logical missteps, invalid user input, validation failures)
	- **Runtime exceptions** (unexpected errors such as null references)
	- Provide **user-friendly** error messages (e.g., “Something went wrong. Please try again shortly.”) and log more technical details to dev/ops (e.g., via a logging service).
	- Consider a central error handler function or global event (e.g., `window.addEventListener('unhandledrejection')`) to consolidate reporting.
	- Carefully handle and validate JSON responses, incorrect HTTP status codes, etc.
            


## Documentation Requirements
	- Include JSDoc comments for JavaScript/TypeScript.
	- Document complex functions with clear examples.
	- Maintain concise Markdown documentation.
	- Minimum docblock info: `param`, `return`, `throws`, `author`
    
## Database Requirements (SQLite 3.46+)
	- Leverage JSON columns, generated columns, strict mode, foreign keys, check constraints, and transactions.
    
## Security Considerations
	- Sanitize all user inputs thoroughly.
	- Parameterize database queries.
	- Enforce strong Content Security Policies (CSP).
	- Use CSRF protection where applicable.
	- Ensure secure cookies (`HttpOnly`, `Secure`, `SameSite=Strict`).
	- Limit privileges and enforce role-based access control.
	- Implement detailed internal logging and monitoring.

## # Copilot Instructions for Web Development

## General Coding Principles

### Code Quality Standards
- Always write clean, readable code with meaningful variable and function names
- Use consistent indentation (2 spaces for HTML/CSS/JS, 4 spaces for Python)
- Add comments to explain complex logic or business rules
- Follow the DRY principle (Don't Repeat Yourself)
- Prefer explicit code over clever/cryptic solutions

### Error Prevention
- Always include error handling for async operations, API calls, and file operations
- Validate user inputs before processing
- Use try-catch blocks for operations that might fail
- Check for null/undefined values before accessing object properties
- Include fallback values for optional parameters

## HTML Guidelines

### Structure and Semantics
- Always use semantic HTML5 elements (`<header>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<footer>`)
- Include proper DOCTYPE declaration: `<!DOCTYPE html>`
- Always include `<html lang="en">` attribute
- Use proper heading hierarchy (h1 → h2 → h3, don't skip levels)
- Include alt attributes for all images

### Accessibility Requirements
- Every form input must have an associated label
- Use ARIA labels when native semantics aren't sufficient
- Ensure proper color contrast ratios
- Make all interactive elements keyboard accessible
- Include skip links for navigation

### Meta Tags (Always Include)
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Brief page description">
<title>Descriptive Page Title</title>
```

## CSS Guidelines

### Modern CSS Practices
- Use CSS Grid for 2D layouts, Flexbox for 1D layouts
- Prefer CSS custom properties (variables) for repeated values
- Use relative units (rem, em, %) instead of px when appropriate
- Write mobile-first responsive design with min-width media queries
- Use logical properties when supported (margin-inline, padding-block)

### Organization
- Order CSS properties: positioning → box model → typography → visual → misc
- Use meaningful class names following BEM methodology when appropriate
- Group related styles together
- Include comments for complex calculations or browser-specific hacks

### Performance
- Avoid deep nesting (max 3 levels)
- Minimize use of expensive properties (box-shadow, gradients, transforms)
- Use shorthand properties when possible
- Avoid !important unless absolutely necessary

## JavaScript Guidelines

### Modern JavaScript (ES6+)
- Use `const` by default, `let` when reassignment is needed, never `var`
- Prefer arrow functions for callbacks and short functions
- Use template literals instead of string concatenation
- Use destructuring for object and array extraction
- Prefer async/await over .then() for promises

### Function Guidelines
- Keep functions small and focused (single responsibility)
- Use descriptive function names that explain what they do
- Prefer pure functions when possible (no side effects)
- Always return something, even if it's undefined explicitly

### DOM Manipulation
- Cache DOM queries in variables when used multiple times
- Use event delegation for dynamic content
- Always check if elements exist before manipulating them
- Prefer `addEventListener` over inline event handlers

### API Integration
```javascript
// Always include proper error handling for API calls
async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error; // Re-throw to allow caller to handle
  }
}
```

## Framework-Specific Guidelines

### React
- Use functional components with hooks
- Always include dependency arrays in useEffect
- Use TypeScript prop types or PropTypes for type checking
- Follow hooks rules (only at top level, only in React functions)
- Use meaningful component and prop names

### Vue.js
- Use Composition API for new projects
- Define props with proper types and default values
- Use computed properties for derived state
- Follow single-file component structure

### Node.js/Express
- Always validate and sanitize user inputs
- Use environment variables for configuration
- Include proper error middleware
- Use async/await consistently
- Include request logging and error logging

## Security Best Practices

### Input Validation
- Never trust user input - always validate and sanitize
- Use parameterized queries for database operations
- Escape output when rendering user content
- Implement rate limiting for APIs

### Authentication & Authorization
- Never store passwords in plain text
- Use HTTPS for all authentication flows
- Implement proper session management
- Follow principle of least privilege

## Development Environment

### File Structure
- Use consistent file naming conventions (kebab-case for files, PascalCase for components)
- Organize files by feature/page rather than by file type
- Keep configuration files in project root
- Use meaningful folder names

### Version Control
- Write clear, descriptive commit messages
- Make small, focused commits
- Include .gitignore appropriate for the project type
- Never commit sensitive information (API keys, passwords)

## Performance Guidelines

### Loading Performance
- Optimize images (use appropriate formats, compress, lazy load)
- Minimize HTTP requests
- Use CDNs for external libraries
- Implement caching strategies

### Runtime Performance
- Avoid memory leaks (clean up event listeners, clear timeouts)
- Use efficient algorithms and data structures
- Debounce expensive operations (search, resize handlers)
- Profile and measure performance before optimizing

## Testing Guidelines

### Always Include Tests For
- Core business logic functions
- API endpoints
- User interactions
- Edge cases and error conditions

### Testing Structure
```javascript
// Use descriptive test names
describe('User authentication', () => {
  it('should return error for invalid credentials', () => {
    // Test implementation
  });
});
```

## Documentation Requirements

### Code Documentation
- Document all public APIs and complex functions
- Include examples in documentation
- Keep documentation up-to-date with code changes
- Use JSDoc format for JavaScript functions

### README Requirements
- Clear project description and purpose
- Installation and setup instructions
- Usage examples
- Contributing guidelines
- License information

## Common Patterns to Follow

### Error Handling Pattern
```javascript
function processData(data) {
  if (!data) {
    throw new Error('Data is required');
  }
  
  try {
    // Process data
    return result;
  } catch (error) {
    console.error('Processing failed:', error);
    throw new Error('Failed to process data');
  }
}
```

### Async Operation Pattern
```javascript
async function handleUserAction() {
  try {
    showLoadingState();
    const result = await performAsyncOperation();
    handleSuccess(result);
  } catch (error) {
    handleError(error);
  } finally {
    hideLoadingState();
  }
}
```

## What NOT to Do

### Avoid These Practices
- Don't use global variables unless absolutely necessary
- Don't write inline styles or scripts in HTML
- Don't ignore browser console errors or warnings
- Don't use deprecated APIs or methods
- Don't skip input validation
- Don't hardcode sensitive information
- Don't create deeply nested callbacks (callback hell)
- Don't mutate props or state directly in React
- Don't ignore accessibility requirements

### Code Smells to Avoid
- Functions longer than 20-30 lines
- Deeply nested if statements (use early returns)
- Magic numbers (use named constants)
- Commented-out code (delete it)
- Inconsistent naming conventions

## Response Format Preferences

When providing code suggestions:
1. Include brief comments explaining complex parts
2. Show complete, working examples rather than fragments
3. Include error handling when relevant
4. Suggest improvements to existing code when applicable
5. Provide alternative approaches when beneficial
6. Always consider accessibility and performance implications

## Project-Specific Context

- Target audience: Web development beginners
- Focus on learning best practices from the start
- Prioritize code clarity over brevity
- Include educational comments when helpful
- Suggest modern approaches over legacy methods
