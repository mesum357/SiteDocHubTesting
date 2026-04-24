import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/camera": {
        target: "http://192.168.42.1",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/camera/, ""),
        timeout: 3000,
        configure: (proxy) => {
          // Suppress expected timeout errors when camera is not connected
          proxy.on("error", () => {});
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        runtimeCaching: [
          {
            // Supabase REST API — NetworkFirst with 8s timeout
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase.co") &&
              url.pathname.startsWith("/rest/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "siteviewpro-api-v1",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // Floor plan PDFs — CacheFirst (large, rarely change)
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase.co") &&
              url.pathname.includes("floor-plans"),
            handler: "CacheFirst",
            options: {
              cacheName: "siteviewpro-pdfs-v1",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            // Site photos — StaleWhileRevalidate
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase.co") &&
              url.pathname.includes("site-photos"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "siteviewpro-photos-v1",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 3 * 24 * 60 * 60,
              },
            },
          },
        ],
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
        enabled: true,
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
}));
