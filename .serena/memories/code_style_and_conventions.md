# CampXus - Code Style and Conventions

## JavaScript Style Guidelines

### ES6+ Patterns
- Use `const` and `let` consistently (no `var`)
- Arrow functions for callbacks and short functions
- Async/await for promises (avoid `.then()` chains)
- Template literals for string interpolation
- Destructuring for object/array assignments
- ES6 modules with clear imports/exports

### Code Organization
- **Service-based architecture** - Business logic in `src/js/services/`
- **Component pattern** - Reusable UI components in `src/js/components/`
- **Single Responsibility Principle** - Each function/class has one clear purpose
- **DRY principle** - Extract reusable logic into utilities
- **Clear separation of concerns** - UI, business logic, and data access in distinct layers

### Naming Conventions
- **camelCase** for variables, functions, and methods
- **PascalCase** for classes and constructors
- **UPPER_SNAKE_CASE** for constants
- **kebab-case** for CSS classes and file names
- Descriptive names that explain intent (avoid abbreviations)

### Documentation Standards
- **JSDoc comments** for public methods and complex functions
- Inline comments explaining "why" not "what"
- Method signatures with parameter types and return values
- File headers with purpose and phase information

### Error Handling
- Explicit try-catch blocks for async operations
- Custom error classes for different error types
- Centralized error logging via LogManager
- User-friendly error messages via NotificationService

## CSS Architecture

### Modular Structure
- **Variables.css** - Design system and CSS custom properties
- **Layout.css** - SPA structure and navigation
- **Components.css** - Reusable UI components
- **Feature-specific CSS** - schedule.css, friends-page.css, etc.

### Design Patterns
- **BEM methodology** for class naming
- **CSS custom properties** for theming
- **Mobile-first responsive design**
- **Glassmorphism effects** with backdrop blur
- **CSS Grid and Flexbox** for layouts

## File Structure Conventions
- Group related files in feature directories
- Index files for clean imports
- Consistent file naming (kebab-case)
- Clear separation between core, services, and components