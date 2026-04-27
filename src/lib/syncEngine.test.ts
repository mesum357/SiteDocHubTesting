import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "./db";

const dbMocks = vi.hoisted(() => ({
  getPendingQueueItems: vi.fn(),
  markQueueItemDone: vi.fn(),
  markQueueItemFailed: vi.fn(),
  updateQueueItem: vi.fn(),
  clearDoneQueueItems: vi.fn(),
  updatePinPhotoLocal: vi.fn(),
}));

const callOrder = vi.hoisted<string[]>(() => []);

const supabaseMock = vi.hoisted(() => {
  const storageUpload = vi.fn(async () => {
    callOrder.push("upload");
    return { error: null };
  });

  const insert = vi.fn(async () => {
    callOrder.push("insert");
    return { error: null };
  });

  const deleteFn = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }));

  const update = vi.fn((data: Record<string, unknown>) => {
    const query = {
      eq: vi.fn(() => {
        if (data.photo_path) {
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: "pin-1" }, error: null })),
            })),
          };
        }
        return Promise.resolve({ error: null });
      }),
    };
    return query;
  });

  const from = vi.fn((table: string) => {
    if (table === "pin-photos") {
      return { upload: storageUpload };
    }
    return {
      insert,
      update,
      delete: deleteFn,
    };
  });

  return {
    storageUpload,
    insert,
    update,
    deleteFn,
    supabase: {
      storage: {
        from,
      },
      from,
    },
  };
});

vi.mock("./db", () => dbMocks);
vi.mock("./supabaseClient", () => ({ supabase: supabaseMock.supabase }));

import { flushUploadQueue } from "./syncEngine";

function makeQueueItem(partial: Partial<QueueItem>): QueueItem {
  return {
    id: 1,
    type: "pin_create",
    status: "pending",
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    errorMessage: null,
    payload: {},
    ...partial,
  };
}

describe("flushUploadQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    dbMocks.clearDoneQueueItems.mockResolvedValue(undefined);
    dbMocks.markQueueItemDone.mockResolvedValue(undefined);
    dbMocks.markQueueItemFailed.mockResolvedValue(undefined);
    dbMocks.updateQueueItem.mockResolvedValue(undefined);
    dbMocks.updatePinPhotoLocal.mockResolvedValue(undefined);
  });

  it("prioritizes creates before photo uploads regardless of timestamp", async () => {
    const photoItem = makeQueueItem({
      id: 1,
      type: "photo_upload",
      createdAt: "2026-01-01T00:00:00.000Z",
      payload: {
        pinId: "pin-1",
        storagePath: "job/floor/pin-1.jpg",
        photoBlob: new Blob(["x"], { type: "image/jpeg" }),
        photoTakenAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const createItem = makeQueueItem({
      id: 2,
      type: "pin_create",
      createdAt: "2026-01-01T00:00:10.000Z",
      payload: { table: "pins", record: { id: "pin-1" } },
    });

    dbMocks.getPendingQueueItems
      .mockResolvedValueOnce([photoItem, createItem])
      .mockResolvedValueOnce([]);

    await flushUploadQueue();

    expect(callOrder).toEqual(["insert", "upload"]);
  });

  it("keeps draining when new pending items appear during sync", async () => {
    const createItem = makeQueueItem({
      id: 3,
      type: "pin_create",
      payload: { table: "pins", record: { id: "pin-2" } },
    });
    const photoItem = makeQueueItem({
      id: 4,
      type: "photo_upload",
      payload: {
        pinId: "pin-2",
        storagePath: "job/floor/pin-2.jpg",
        photoBlob: new Blob(["x"], { type: "image/jpeg" }),
        photoTakenAt: "2026-01-01T00:00:00.000Z",
      },
    });

    dbMocks.getPendingQueueItems
      .mockResolvedValueOnce([createItem])
      .mockResolvedValueOnce([photoItem])
      .mockResolvedValueOnce([]);

    await flushUploadQueue();

    expect(supabaseMock.insert).toHaveBeenCalled();
    expect(supabaseMock.storageUpload).toHaveBeenCalled();
    expect(dbMocks.getPendingQueueItems).toHaveBeenCalledTimes(3);
  });
});

