import { openDB, DBSchema, IDBPDatabase } from "idb";

// ─── TYPE DEFINITIONS ─────────────────────────────────────────────────────────

export interface DBJob {
  id: string;
  name: string;
  description: string;
  created_date: string;
  archived: boolean;
  created_at: string;
}

export interface DBFloor {
  id: string;
  job_id: string;
  label: string;
  floor_order: number;
  pdf_path: string | null;
  created_at: string;
}

export interface DBPin {
  id: string;
  floor_id: string;
  name: string;
  x_pct: number;
  y_pct: number;
  pin_order: number;
  photo_path: string | null;
  note: string | null;
  photo_taken_at: string | null;
  created_at: string;
}

export interface FloorPdf {
  floor_id: string;
  pdfBlob: Blob;
  cachedAt: string;
}

export interface QueueItem {
  id?: number;
  type:
    | "photo_upload"
    | "pin_update"
    | "job_create"
    | "floor_create"
    | "pin_create"
    | "pin_delete"
    | "floor_delete"
    | "job_delete";
  status: "pending" | "syncing" | "failed" | "done";
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
}

// ─── DB SCHEMA ────────────────────────────────────────────────────────────────

interface SiteDocHBDB extends DBSchema {
  jobs: {
    key: string;
    value: DBJob;
    indexes: { "by-archived": boolean; "by-created_at": string };
  };
  floors: {
    key: string;
    value: DBFloor;
    indexes: { "by-job_id": string; "by-floor_order": number };
  };
  pins: {
    key: string;
    value: DBPin;
    indexes: { "by-floor_id": string; "by-pin_order": number };
  };
  floor_pdfs: {
    key: string;
    value: FloorPdf;
  };
  pin_photos: {
    key: string;
    value: { pin_id: string; blob: Blob; cachedAt: string };
  };
  upload_queue: {
    key: number;
    value: QueueItem;
    indexes: { "by-status": string; "by-created_at": string };
  };
}

// ─── DATABASE INITIALIZATION ──────────────────────────────────────────────────

let dbInstance: IDBPDatabase<SiteDocHBDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SiteDocHBDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SiteDocHBDB>("SiteDocHB-db", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // jobs store
        const jobStore = db.createObjectStore("jobs", { keyPath: "id" });
        jobStore.createIndex("by-archived", "archived");
        jobStore.createIndex("by-created_at", "created_at");

        // floors store
        const floorStore = db.createObjectStore("floors", { keyPath: "id" });
        floorStore.createIndex("by-job_id", "job_id");
        floorStore.createIndex("by-floor_order", "floor_order");

        // pins store
        const pinStore = db.createObjectStore("pins", { keyPath: "id" });
        pinStore.createIndex("by-floor_id", "floor_id");
        pinStore.createIndex("by-pin_order", "pin_order");

        // floor_pdfs store
        db.createObjectStore("floor_pdfs", { keyPath: "floor_id" });

        // upload_queue store
        const queueStore = db.createObjectStore("upload_queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        queueStore.createIndex("by-status", "status");
        queueStore.createIndex("by-created_at", "createdAt");
      }

      if (oldVersion < 2) {
        // pin_photos store added in v2
        db.createObjectStore("pin_photos", { keyPath: "pin_id" });
      }
    },
  });

  return dbInstance;
}

// ─── JOBS ─────────────────────────────────────────────────────────────────────

export async function cacheJobs(jobs: DBJob[]) {
  const db = await getDB();
  const tx = db.transaction("jobs", "readwrite");
  await Promise.all(jobs.map((job) => tx.store.put(job)));
  await tx.done;
}

export async function getCachedJobs(): Promise<DBJob[]> {
  const db = await getDB();
  return db.getAll("jobs");
}

export async function getCachedJob(id: string): Promise<DBJob | undefined> {
  const db = await getDB();
  return db.get("jobs", id);
}

export async function upsertJob(job: DBJob) {
  const db = await getDB();
  await db.put("jobs", job);
}

export async function deleteJobLocal(id: string) {
  const db = await getDB();
  await db.delete("jobs", id);
}

// ─── FLOORS ───────────────────────────────────────────────────────────────────

export async function cacheFloors(floors: DBFloor[]) {
  const db = await getDB();
  const tx = db.transaction("floors", "readwrite");
  await Promise.all(floors.map((floor) => tx.store.put(floor)));
  await tx.done;
}

export async function getCachedFloorsByJob(jobId: string): Promise<DBFloor[]> {
  const db = await getDB();
  return db.getAllFromIndex("floors", "by-job_id", jobId);
}

export async function upsertFloor(floor: DBFloor) {
  const db = await getDB();
  await db.put("floors", floor);
}

export async function deleteFloorLocal(id: string) {
  const db = await getDB();
  await db.delete("floors", id);
}

// ─── PINS ─────────────────────────────────────────────────────────────────────

export async function cachePins(pins: DBPin[]) {
  const db = await getDB();
  const tx = db.transaction("pins", "readwrite");
  await Promise.all(pins.map((pin) => tx.store.put(pin)));
  await tx.done;
}

export async function getCachedPinsByFloor(floorId: string): Promise<DBPin[]> {
  const db = await getDB();
  return db.getAllFromIndex("pins", "by-floor_id", floorId);
}

export async function upsertPin(pin: DBPin) {
  const db = await getDB();
  await db.put("pins", pin);
}

export async function deletePinLocal(id: string) {
  const db = await getDB();
  await db.delete("pins", id);
}

export async function updatePinPhotoLocal(
  pinId: string,
  photoPath: string,
  photoTakenAt: string
) {
  const db = await getDB();
  const pin = await db.get("pins", pinId);
  if (!pin) return;
  await db.put("pins", {
    ...pin,
    photo_path: photoPath,
    photo_taken_at: photoTakenAt,
  });
}

// ─── FLOOR PDFs ───────────────────────────────────────────────────────────────

export async function cacheFloorPdf(floorId: string, pdfBlob: Blob) {
  const db = await getDB();
  await db.put("floor_pdfs", {
    floor_id: floorId,
    pdfBlob,
    cachedAt: new Date().toISOString(),
  });
}

export async function getCachedFloorPdf(
  floorId: string
): Promise<Blob | null> {
  const db = await getDB();
  const record = await db.get("floor_pdfs", floorId);
  return record?.pdfBlob ?? null;
}

// ─── PIN PHOTOS ───────────────────────────────────────────────────────────────

export async function cachePinPhoto(pinId: string, blob: Blob) {
  const db = await getDB();
  await db.put("pin_photos", {
    pin_id: pinId,
    blob,
    cachedAt: new Date().toISOString(),
  });
}

export async function getCachedPinPhoto(pinId: string): Promise<Blob | null> {
  const db = await getDB();
  const record = await db.get("pin_photos", pinId);
  return record?.blob ?? null;
}

// ─── UPLOAD QUEUE ─────────────────────────────────────────────────────────────

export async function addToQueue(
  item: Omit<
    QueueItem,
    "id" | "status" | "retryCount" | "lastAttemptAt" | "errorMessage" | "createdAt"
  >
): Promise<number> {
  const db = await getDB();
  return db.add("upload_queue", {
    ...item,
    status: "pending",
    retryCount: 0,
    maxRetries: item.maxRetries ?? 3,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    errorMessage: null,
  } as QueueItem);
}

export async function getPendingQueueItems(): Promise<QueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex("upload_queue", "by-status", "pending");
}

export async function getFailedQueueItems(): Promise<QueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex("upload_queue", "by-status", "failed");
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  const pending = await db.getAllFromIndex(
    "upload_queue",
    "by-status",
    "pending"
  );
  const syncing = await db.getAllFromIndex(
    "upload_queue",
    "by-status",
    "syncing"
  );
  return pending.length + syncing.length;
}

export async function updateQueueItem(
  id: number,
  updates: Partial<QueueItem>
) {
  const db = await getDB();
  const existing = await db.get("upload_queue", id);
  if (!existing) return;
  await db.put("upload_queue", { ...existing, ...updates });
}

export async function markQueueItemDone(id: number) {
  await updateQueueItem(id, { status: "done" });
}

export async function markQueueItemFailed(id: number, errorMessage: string) {
  const db = await getDB();
  const item = await db.get("upload_queue", id);
  if (!item) return;
  await db.put("upload_queue", {
    ...item,
    status: item.retryCount >= item.maxRetries - 1 ? "failed" : "pending",
    retryCount: item.retryCount + 1,
    lastAttemptAt: new Date().toISOString(),
    errorMessage,
  });
}

export async function clearDoneQueueItems() {
  const db = await getDB();
  const all = await db.getAll("upload_queue");
  const tx = db.transaction("upload_queue", "readwrite");
  await Promise.all(
    all.filter((i) => i.status === "done").map((i) => tx.store.delete(i.id!))
  );
  await tx.done;
}
