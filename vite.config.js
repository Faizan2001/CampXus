import { defineConfig } from "vite";

// Optional: configure HMR to work over ngrok HTTPS
const NGROK_HOST = process.env.NGROK_HOST || process.env.NGROK_DOMAIN || null;

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  return {
    // Strip verbose logging from production bundles. This is a TOP-LEVEL Vite
    // option; nested under `build` it is silently ignored. console.warn/error
    // are kept on purpose so real failures stay visible in the field.
    esbuild: isProd
      ? {
          drop: ["debugger"],
          pure: ["console.log", "console.debug", "console.info"],
        }
      : undefined,

    build: {
      copyPublicDir: true,
      // Source maps are for local debugging; don't publish them with the site.
      sourcemap: !isProd,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          },
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split(".");
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            }
            if (/css/i.test(ext)) {
              return `assets/css/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          },
          chunkFileNames: "assets/js/[name]-[hash].js",
          entryFileNames: "assets/js/[name]-[hash].js",
        },
      },
    },

    preview: {
      host: true,
      port: 4173,
    },

    server: {
      host: true,
      port: 5173,
      // Hot reload over ngrok
      hmr: NGROK_HOST
        ? {
            protocol: "wss",
            host: NGROK_HOST,
            clientPort: 443,
          }
        : undefined,

      // Ignore large folders that don't need watching
      watch: {
        ignored: [
          "**/node_modules/**",
          "**/.venv/**",
          "**/.git/**",
          "**/firebase-export-*/**",
        ],
      },

      // For dev server on other devices visit: https://preburlesque-hypertropical-karlene.ngrok-free.app/
      // ngrok http 5173 --url=preburlesque-hypertropical-karlene.ngrok-free.app
      // Allow ngrok + future production domains
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "preburlesque-hypertropical-karlene.ngrok-free.app",
        "meetchuthere.com",
        "www.meetchuthere.com",
      ],
    },
  };
});
