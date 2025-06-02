# 🛠️ Firebase Development Tools

This folder contains helper scripts for Firebase development setup. These files are automatically used by the npm scripts - you don't need to run them manually.

## Files Overview

### `generate-env-config.js`

**Purpose:** Converts your `.env.local` file to browser-compatible format
**Used by:** `npm run dev:config` and `npm run dev:serve`
**What it does:**

- Reads your Firebase keys from `.env.local`
- Creates `../env-config.js` that browsers can understand
- Ensures your real Firebase project is used in development

### `check-dev-setup.js`

**Purpose:** Validates your development environment
**Used by:** `npm run dev:check`
**What it does:**

- Checks if `.env.local` exists and has Firebase config
- Verifies the generated browser config exists
- Confirms all dependencies are installed
- Provides helpful error messages if something's wrong

### `env-loader.js`

**Purpose:** Browser-side environment loading helper
**Used by:** Currently not active (future enhancement)
**What it does:**

- Provides fallback loading for environment variables
- Could be used for advanced environment setups

## 🔧 How They Work Together

```
1. You run: npm run dev:serve
2. generate-env-config.js runs first
3. Reads your .env.local
4. Creates ../env-config.js for browsers
5. Firebase serve starts your app
6. Your app loads with real Firebase keys!
```

## 🚨 Important Notes

- **Don't edit these files** unless you know what you're doing
- These scripts run automatically through npm commands
- If you move these files, update the paths in `package.json`
- All paths are relative to the project root

## 🆘 Troubleshooting

If scripts aren't working:

1. Check that paths in `package.json` are correct
2. Ensure `.env.local` exists in project root
3. Run `npm run dev:check` to diagnose issues

---

**For Beginners:** You don't need to understand these files to use them! Just use `npm run dev:serve` and everything works! 🚀
