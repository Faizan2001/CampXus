# CampXus Development Commands

## Essential Development Commands

### Environment Setup
```bash
# Generate environment config from .env.local (REQUIRED before development)
npm run dev:config

# Check development setup status
npm run dev:check

# Start development server with Firebase integration (RECOMMENDED)
npm run dev:serve

# Start Vite development server (frontend-only, faster)
npm run dev
```

### Testing
```bash
# Run all tests with ESM support
npm test

# Run single test file
npm test src/js/tests/core/script.test.js

# Run tests in specific directory
npm test src/js/tests/firebase/
```

### Firebase Development
```bash
# Start Firebase emulators for local development
npm run firebase:emulators

# Serve app using Firebase hosting
npm run firebase:serve

# Deploy to Firebase hosting
npm run firebase:deploy
```

### Security & Auditing
```bash
# Run security audit
npm run security:audit

# Fix security vulnerabilities
npm run security:fix

# Check security with audit-ci
npm run security:check
```

### Build & Preview
```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Important Development Workflow

1. **Always run `npm run dev:config` after changing `.env.local`**
2. **Use `npm run dev:check` to verify development environment setup**
3. **Use `npm run dev:serve` for full Firebase integration testing (recommended)**
4. **Use `npm run dev` for faster frontend-only development**
5. **Run `npm test` before committing changes**

## System Commands (Linux)
- `ls` - List directory contents
- `cd` - Change directory
- `grep` or `rg` (ripgrep) - Search file contents
- `find` - Search for files and directories
- `git` - Version control operations