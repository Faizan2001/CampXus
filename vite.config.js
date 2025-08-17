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
        // Ensure proper asset naming and types
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `assets/css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
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
    // Note: HTTPS needed for geolocation in production
    // For development testing, we'll use HTTP and implement graceful fallbacks
  },
});
