# CampXus - Suggested Development Commands

## Essential Commands

### Environment Setup
```bash
npm run dev:config    # Generate environment configuration from .env.local (REQUIRED first)
npm run dev:check     # Validate development environment setup
```

### Development Servers
```bash
npm run dev:serve     # Firebase hosting server (RECOMMENDED - full integration)
npm run dev          # Vite development server (frontend-only, faster iteration)
```

### Testing
```bash
npm test             # Run all Jest tests with ESM support
npm test src/js/tests/core/script.test.js    # Run single test file
npm test src/js/tests/firebase/              # Run tests in specific directory
```

### Firebase Operations
```bash
npm run firebase:emulators  # Start local Firebase emulators
npm run firebase:serve      # Serve using Firebase hosting
npm run firebase:deploy     # Deploy to production
```

### Security & Maintenance
```bash
npm run security:audit      # Run security vulnerability scan
npm run security:fix        # Fix security vulnerabilities automatically
npm run security:check      # Check security with audit-ci
```

### Build & Production
```bash
npm run build       # Build for production
npm run preview     # Preview production build locally
```

## Development Workflow
1. Set up `.env.local` with Firebase credentials
2. Run `npm run dev:config` to generate browser-compatible config
3. Use `npm run dev:serve` for full Firebase integration (recommended)
4. Use `npm run dev` for faster frontend-only development
5. Run `npm test` to ensure all tests pass before committing

## Important Notes
- Always run `npm run dev:config` after changing `.env.local`
- Firebase API keys are safe in client code (protected by security rules)
- Use `npm run dev:check` to troubleshoot environment issues