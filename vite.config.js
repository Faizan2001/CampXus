import { defineConfig } from "vite";

export default defineConfig({
  // Build configuration for proper SPA deployment
  build: {
    // Copy public folder contents (including _redirects) to dist
    copyPublicDir: true,
    // Generate source maps for debugging production issues
    sourcemap: true,
    // Split vendor code for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Firebase into its own chunk for better caching
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
        },
      },
    },
  },

  // Preview configuration for testing production builds locally
  preview: {
    host: true,
    port: 4173,
  },

  // Development server configuration
  server: {
    host: true,
    port: 5173,
  },
});
