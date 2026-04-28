import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const cameraProxy = (cameraTarget: string) => ({
  "/api/camera": {
    target: cameraTarget,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/camera/, ""),
    timeout: 8000,
    configure: (proxy: { on: (e: string, fn: () => void) => void }) => {
      proxy.on("error", () => {});
    },
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cameraTarget =
    env.INSTA360_OSC_PROXY_TARGET?.trim() || "http://192.168.42.1";

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: cameraProxy(cameraTarget),
  },
  preview: {
    host: "::",
    port: 8080,
    proxy: cameraProxy(cameraTarget),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "Sitedochub",
        short_name: "Sitedochub",
        description:
          "360° job site photo documentation — walk, pin, capture.",
        theme_color: "#0f1117",
        background_color: "#0f1117",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        // Keep SW off in local dev to avoid dev-sw/workbox interception noise.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
};
});
