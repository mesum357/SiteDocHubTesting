import { registerSW } from "virtual:pwa-register";
import { flushUploadQueue, registerOnlineListener } from "./syncEngine";

/**
 * Initialize the service worker, background sync relay, and online listeners.
 * Call once at app startup (main.tsx).
 */
export function initServiceWorker() {
  // Register SW via vite-plugin-pwa
  const updateSW = registerSW({
    onNeedRefresh() {
      console.log("[SiteDocHB] New version available. Reload to update.");
    },
    onOfflineReady() {
      console.log("[SiteDocHB] App is ready for offline use.");
    },
    onRegisteredSW(_swScriptUrl, registration) {
      // Request background sync when SW is registered
      if (registration && "sync" in registration) {
        (registration as any).sync
          .register("SiteDocHB-upload-sync")
          .catch(() => {
            // Background Sync API not available — fall back to online listener
          });
      }
    },
  });

  // Listen for messages from the service worker (background sync trigger)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "BACKGROUND_SYNC_TRIGGERED") {
        console.log(
          "[SiteDocHB] Background sync triggered by service worker"
        );
        flushUploadQueue();
      }
    });
  }

  // Register online/visibility listeners as fallback sync mechanism
  registerOnlineListener();

  return updateSW;
}

/**
 * Pre-cache a job's floor plan PDFs in the service worker cache.
 * Call when a job is selected so PDFs are available offline.
 */
export async function precacheJobPdfs(pdfUrls: string[]) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: "PRECACHE_JOB_PDFS",
    pdfUrls,
  });
}
