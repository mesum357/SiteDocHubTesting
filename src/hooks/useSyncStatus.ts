import { useState, useEffect } from "react";
import { onSyncStatusChange, type EngineSyncStatus } from "../lib/syncEngine";
import { getQueueCount } from "../lib/db";

/**
 * Provides real-time sync status for the header badge.
 * Derives human-readable label and color from the sync engine state
 * and online/offline status.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<EngineSyncStatus>("idle");
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Load initial queue count
    getQueueCount().then(setQueueCount);

    // Listen for sync engine status changes
    const unsubscribe = onSyncStatusChange(
      (newStatus: EngineSyncStatus, count: number) => {
        setStatus(newStatus);
        setQueueCount(count);
      }
    );

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Derive human-readable label for the header badge
  const label = (() => {
    if (!isOnline && queueCount > 0)
      return `Offline — ${queueCount} queued`;
    if (!isOnline) return "Offline";
    if (status === "syncing")
      return `Syncing ${queueCount} photo${queueCount !== 1 ? "s" : ""}...`;
    if (status === "error") return "Sync error — tap to retry";
    return "Synced";
  })();

  // Derive color for the header badge dot
  const color = (() => {
    if (!isOnline || status === "error") return "amber" as const;
    if (status === "syncing") return "blue" as const;
    return "green" as const;
  })();

  return { status, queueCount, isOnline, label, color };
}
