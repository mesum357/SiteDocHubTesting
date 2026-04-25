/// <reference lib="webworker" />

import "./sw-env";
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

/** Supabase signed URLs embed a short-lived JWT; they must not use cache-first SW strategies. */
function isSignedObjectUrl(url: URL): boolean {
  return url.pathname.includes("/storage/v1/object/sign/");
}

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ url }) =>
    url.hostname.includes("supabase.co") && url.pathname.startsWith("/rest/"),
  new NetworkFirst({
    cacheName: "siteviewpro-api-v1",
    networkTimeoutSeconds: 8,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60,
      }),
    ],
  })
);

registerRoute(
  ({ url }) =>
    url.hostname.includes("supabase.co") &&
    url.pathname.includes("floor-plans") &&
    !isSignedObjectUrl(url),
  new CacheFirst({
    cacheName: "siteviewpro-pdfs-v1",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

registerRoute(
  ({ url }) =>
    url.hostname.includes("supabase.co") &&
    url.pathname.includes("pin-photos") &&
    !isSignedObjectUrl(url),
  new StaleWhileRevalidate({
    cacheName: "siteviewpro-photos-v1",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 3 * 24 * 60 * 60,
      }),
    ],
  })
);

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; pdfUrls?: string[] } | undefined;
  if (data?.type !== "PRECACHE_JOB_PDFS" || !Array.isArray(data.pdfUrls)) return;

  event.waitUntil(
    caches.open("siteviewpro-pdfs-v1").then(async (cache) => {
      for (const pdfUrl of data.pdfUrls) {
        if (isSignedObjectUrl(new URL(pdfUrl))) continue;
        try {
          await cache.add(pdfUrl);
        } catch {
          // Ignore per-file fetch/cache failures so remaining PDFs still cache.
        }
      }
    })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "SiteDocHB-upload-sync") return;

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: "BACKGROUND_SYNC_TRIGGERED" });
      });
    })
  );
});

export {};
