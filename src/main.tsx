import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initServiceWorker } from "./lib/registerSW";
import { flushUploadQueue } from "./lib/syncEngine";

// Initialize service worker and background sync in production only.
if (import.meta.env.PROD) {
  initServiceWorker();
} else if ("serviceWorker" in navigator) {
  // Dev hygiene: remove previously-registered SWs so old Workbox routes
  // cannot keep intercepting localhost requests.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().catch(() => {});
    });
  });

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key.startsWith("siteviewpro-") || key.startsWith("workbox-")) {
          caches.delete(key).catch(() => {});
        }
      });
    });
  }
}

// Flush any pending uploads from a previous session on startup
if (navigator.onLine) {
  flushUploadQueue();
}

createRoot(document.getElementById("root")!).render(<App />);
