import { defineConfig } from "vite";

// Optional: configure HMR to work over ngrok HTTPS
const NGROK_HOST =
  process.env.NGROK_HOST || process.env.NGROK_DOMAIN || null;

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  return {
    build: {
      copyPublicDir: true,
      sourcemap: true,
      // Drop console/debugger in production builds only
      esbuild: isProd ? { drop: ["console", "debugger"] } : undefined,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ["firebase/app", "firebase/auth", "firebase/firestore"]
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
