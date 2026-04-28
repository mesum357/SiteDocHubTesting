import { useEffect, useMemo, useState } from "react";
import { cachePinPhoto, getCachedPinPhoto } from "@/lib/db";

function isHttpUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Local-first photo URL for pin photos:
 * - If IndexedDB has the blob, return an object URL (works offline)
 * - If not cached but online and remote URL exists, fetch once and cache
 */
export function useCachedPinPhotoUrl(pinId: string | undefined, remoteUrl: string | undefined) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const key = useMemo(() => `${pinId ?? ""}::${remoteUrl ?? ""}`, [pinId, remoteUrl]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function run() {
      if (!pinId) {
        setLocalUrl(null);
        return;
      }

      try {
        // If the caller already provided a local/blob URL (e.g. immediate preview
        // right after offline upload/capture), use it directly.
        if (remoteUrl && !isHttpUrl(remoteUrl)) {
          if (!cancelled) setLocalUrl(remoteUrl);
          return;
        }

        const cached = await getCachedPinPhoto(pinId);
        if (cached) {
          objectUrl = URL.createObjectURL(cached);
          if (!cancelled) setLocalUrl(objectUrl);
          return;
        }

        // If we're offline and have no cached blob, do NOT fall back to remote signed URLs.
        // This prevents noisy ERR_FAILED requests and allows UI to show a clean placeholder.
        if (!navigator.onLine) {
          if (!cancelled) setLocalUrl("");
          return;
        }

        if (!remoteUrl || !isHttpUrl(remoteUrl)) {
          if (!cancelled) setLocalUrl(null);
          return;
        }

        // Best-effort: hydrate cache for offline use later.
        const res = await fetch(remoteUrl);
        if (!res.ok) {
          if (!cancelled) setLocalUrl(null);
          return;
        }
        const blob = await res.blob();
        await cachePinPhoto(pinId, blob);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setLocalUrl(objectUrl);
      } catch {
        if (!cancelled) setLocalUrl(null);
      }
    }

    run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Prefer local object URL when available. If localUrl is "" we intentionally suppress remote.
  if (localUrl === "") return "";
  return localUrl ?? remoteUrl ?? "";
}

