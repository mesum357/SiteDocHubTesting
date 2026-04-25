import { supabase } from "./supabaseClient";
import {
  getPendingQueueItems,
  markQueueItemDone,
  markQueueItemFailed,
  updateQueueItem,
  clearDoneQueueItems,
  updatePinPhotoLocal,
} from "./db";
import type { QueueItem } from "./db";

// ─── SYNC STATUS ──────────────────────────────────────────────────────────────

export type EngineSyncStatus = "idle" | "syncing" | "error";

type SyncStatusCallback = (
  status: EngineSyncStatus,
  queueCount: number
) => void;

let syncStatusListeners: SyncStatusCallback[] = [];

export function onSyncStatusChange(cb: SyncStatusCallback) {
  syncStatusListeners.push(cb);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== cb);
  };
}

function notifyListeners(status: EngineSyncStatus, queueCount: number) {
  syncStatusListeners.forEach((cb) => cb(status, queueCount));
}

// ─── QUEUE PROCESSOR ──────────────────────────────────────────────────────────

let isSyncing = false;
let listenersRegistered = false;

export async function flushUploadQueue(): Promise<void> {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  try {
    const pending = await getPendingQueueItems();
    if (pending.length === 0) {
      notifyListeners("idle", 0);
      return;
    }

    isSyncing = true;
    notifyListeners("syncing", pending.length);

    let remaining = pending.length;

    for (const item of pending) {
      try {
        await updateQueueItem(item.id!, {
          status: "syncing",
          lastAttemptAt: new Date().toISOString(),
        });

        switch (item.type) {
          case "photo_upload":
            await processPhotoUpload(item);
            break;
          case "pin_update":
            await processPinUpdate(item);
            break;
          case "job_create":
          case "floor_create":
          case "pin_create":
            await processRecordCreate(item);
            break;
          case "pin_delete":
          case "floor_delete":
          case "job_delete":
            await processRecordDelete(item);
            break;
          default:
            throw new Error(`Unknown queue item type: ${item.type}`);
        }

        await markQueueItemDone(item.id!);
        remaining--;
        notifyListeners("syncing", remaining);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        await markQueueItemFailed(item.id!, message);
        notifyListeners("error", remaining);
      }
    }

    await clearDoneQueueItems();
    notifyListeners(remaining === 0 ? "idle" : "error", remaining);
  } finally {
    isSyncing = false;
  }
}

// ─── QUEUE ITEM PROCESSORS ───────────────────────────────────────────────────

async function processPhotoUpload(item: QueueItem) {
  const { pinId, storagePath, photoBlob, photoTakenAt } = item.payload as {
    pinId: string;
    storagePath: string;
    photoBlob: Blob;
    photoTakenAt?: string;
  };

  if (!photoBlob || !storagePath) {
    throw new Error("Missing photo blob or storage path");
  }

  // Upload photo to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("pin-photos")
    .upload(storagePath, photoBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const takenAt = (photoTakenAt as string) ?? new Date().toISOString();

  // Update pin record in Supabase with the photo_path
  const { error: updateError } = await supabase
    .from("pins")
    .update({
      photo_path: storagePath,
      photo_taken_at: takenAt,
    })
    .eq("id", pinId);

  if (updateError) throw updateError;

  // Update local IndexedDB to reflect synced state
  await updatePinPhotoLocal(pinId, storagePath, takenAt);
}

async function processPinUpdate(item: QueueItem) {
  const { pinId, pinData } = item.payload as {
    pinId: string;
    pinData: Record<string, unknown>;
  };

  const { error } = await supabase
    .from("pins")
    .update(pinData)
    .eq("id", pinId);

  if (error) throw error;
}

async function processRecordDelete(item: QueueItem) {
  const { table, id } = item.payload as {
    table: string;
    id: string;
  };

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

async function processRecordCreate(item: QueueItem) {
  const { table, record } = item.payload as {
    table: string;
    record: Record<string, unknown>;
  };

  const { error } = await supabase.from(table).insert(record);
  if (error) throw error;
}

// ─── AUTO-FLUSH LISTENERS ─────────────────────────────────────────────────────

export function registerOnlineListener() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  window.addEventListener("online", () => {
    console.log("[SiteDocHB] Back online — flushing upload queue...");
    flushUploadQueue();
  });

  // Also flush on tab focus (handles cases where tab was backgrounded)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      flushUploadQueue();
    }
  });
}
