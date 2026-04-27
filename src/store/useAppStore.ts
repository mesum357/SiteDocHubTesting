import { create } from "zustand";
import type { Job, Pin } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { precacheJobPdfs } from "@/lib/registerSW";
import { normalizePinPhotoPath } from "@/lib/storagePaths";
import { 
  addToQueue, 
  getCachedJobs, 
  cacheJobs, 
  getCachedFloorsByJob, 
  cacheFloors, 
  getCachedPinsByFloor, 
  cachePins,
  upsertJob,
  deleteJobLocal,
  upsertFloor,
  deleteFloorLocal,
  upsertPin,
  deletePinLocal,
  updatePinPhotoLocal,
  cachePinPhoto,
  getCachedPinPhoto,
  getCachedFloorPdf,
  cacheFloorPdf,
} from "@/lib/db";
import type { DBJob, DBFloor, DBPin } from "@/lib/db";

/** After a remote reload, keep the user's current job/floor when they still exist; merge in local-only jobs not yet on the server. */
function pickActiveAfterLoad(
  mergedJobs: Job[],
  prevActiveJobId: string,
  prevActiveFloorId: string
): { activeJobId: string; activeFloorId: string } {
  const nextActiveId = mergedJobs.some((j) => j.id === prevActiveJobId)
    ? prevActiveJobId
    : mergedJobs[0]?.id ?? "";
  const job = mergedJobs.find((j) => j.id === nextActiveId);
  const nextFloorId =
    job && prevActiveFloorId && job.floors.some((f) => f.id === prevActiveFloorId)
      ? prevActiveFloorId
      : job?.floors[0]?.id ?? "";
  return { activeJobId: nextActiveId, activeFloorId: nextFloorId };
}

const LS_KEYS = {
  activeJobId: "SiteDocHB.activeJobId",
  activeFloorId: "SiteDocHB.activeFloorId",
  selectedPinId: "SiteDocHB.selectedPinId",
} as const;

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSet(key: string, value: string) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore (storage may be disabled)
  }
}

interface AppState {
  jobs: Job[];
  activeJobId: string;
  activeFloorId: string;
  selectedPinId: string | null;
  placementMode: boolean;
  cameraConnected: boolean;
  loaded: boolean;

  // setters
  setActiveJob: (id: string) => void;
  setActiveFloor: (id: string) => void;
  selectPin: (id: string | null) => void;
  togglePlacement: (on?: boolean) => void;
  setLoaded: (b: boolean) => void;
  setCameraConnected: (connected: boolean) => void;

  // async data loading
  loadJobs: () => Promise<void>;

  // mutations (update local state + write to Supabase)
  createJob: (input: { name: string; description: string; firstFloorLabel: string }) => string;
  renameJob: (id: string, name: string) => void;
  updateJobDescription: (id: string, description: string) => void;
  addFloor: (jobId: string, name: string) => string;
  addPin: (jobId: string, floorId: string, pin: Omit<Pin, "id">) => string;
  renamePin: (jobId: string, floorId: string, pinId: string, name: string) => void;
  attachPhoto: (jobId: string, floorId: string, pinId: string, photoUrl: string) => void;
  updatePinNotes: (jobId: string, floorId: string, pinId: string, notes: string) => void;
  uploadFloorPdf: (jobId: string, floorId: string, file: File) => Promise<void>;
  uploadPinPhoto: (jobId: string, floorId: string, pinId: string, file: File) => Promise<void>;
  removePin: (jobId: string, floorId: string, pinId: string) => void;
  removeFloor: (jobId: string, floorId: string) => void;
  removeJob: (jobId: string) => void;
  /** Hard-delete via edge function: removes DB rows + storage objects + shares. */
  hardDeleteJob: (jobId: string) => Promise<void>;
}

const uid = (prefix = "id") => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const isBlobObjectUrl = (url?: string) => typeof url === "string" && url.startsWith("blob:");

function revokeBlobUrlsFromJobs(jobs: Job[]) {
  for (const job of jobs) {
    for (const floor of job.floors) {
      if (isBlobObjectUrl(floor.pdfUrl)) {
        URL.revokeObjectURL(floor.pdfUrl);
      }
      for (const pin of floor.pins) {
        if (isBlobObjectUrl(pin.photoUrl)) {
          URL.revokeObjectURL(pin.photoUrl);
        }
      }
    }
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  // ─── INITIAL STATE (empty) ──────────────────────────────────────────────────
  jobs: [],
  activeJobId: safeGet(LS_KEYS.activeJobId),
  activeFloorId: safeGet(LS_KEYS.activeFloorId),
  selectedPinId: safeGet(LS_KEYS.selectedPinId) || null,
  placementMode: false,
  cameraConnected: false,
  loaded: false,

  // ─── SETTERS ────────────────────────────────────────────────────────────────
  setActiveJob: (id) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    const pdfUrls = job.floors
      .map((f) => f.pdfUrl)
      .filter((url): url is string => Boolean(url));
    if (pdfUrls.length > 0) {
      void precacheJobPdfs(pdfUrls);
    }

    set({
      activeJobId: id,
      activeFloorId: job.floors[0]?.id ?? "",
      selectedPinId: null,
      placementMode: false,
    });

    safeSet(LS_KEYS.activeJobId, id);
    safeSet(LS_KEYS.activeFloorId, job.floors[0]?.id ?? "");
    safeSet(LS_KEYS.selectedPinId, "");

    // Pre-cache all floor PDFs for this job so the blueprint renders offline later.
    const pdfPaths = job.floors
      .map((f) => f.pdfPath)
      .filter((p): p is string => Boolean(p));
    if (pdfPaths.length > 0) {
      (async () => {
        try {
          const { data } = await supabase.storage
            .from("floor-plans")
            .createSignedUrls(pdfPaths, 3600);
          const urlsByPath = new Map<string, string>();
          data?.forEach((item) => {
            if (!item.error && item.signedUrl) urlsByPath.set(item.path, item.signedUrl);
          });

          // Small concurrency to avoid spiky bandwidth.
          const floors = job.floors.filter((f) => f.pdfPath);
          for (const f of floors) {
            const signedUrl = f.pdfPath ? urlsByPath.get(f.pdfPath) : undefined;
            if (!signedUrl) continue;
            try {
              const res = await fetch(signedUrl);
              const blob = await res.blob();
              await cacheFloorPdf(f.id, blob);
            } catch {
              // ignore per-file errors; remaining PDFs still cache
            }
          }
        } catch {
          // ignore
        }
      })();
    }
  },
  setActiveFloor: (id) =>
    (set({ activeFloorId: id, selectedPinId: null, placementMode: false }),
    safeSet(LS_KEYS.activeFloorId, id),
    safeSet(LS_KEYS.selectedPinId, "")),
  selectPin: (id) => (
    set({ selectedPinId: id, placementMode: false }),
    safeSet(LS_KEYS.selectedPinId, id ?? "")
  ),
  togglePlacement: (on) => {
    // Gate: don't allow placement if the active floor has no PDF
    const state = get();
    const job = state.jobs.find((j) => j.id === state.activeJobId);
    const floor = job?.floors.find((f) => f.id === state.activeFloorId);
    if (!floor?.pdfUrl) return;
    set({
      placementMode: typeof on === "boolean" ? on : !state.placementMode,
      selectedPinId: null,
    });
  },
  setLoaded: (b) => set({ loaded: b }),
  setCameraConnected: (connected) => set({ cameraConnected: connected }),

  // ─── ASYNC DATA LOADING ─────────────────────────────────────────────────────
  loadJobs: async () => {
    try {
      let jobRows: DBJob[] = [];
      let floorRows: DBFloor[] = [];
      let pinRows: DBPin[] = [];

      if (navigator.onLine) {
        // Fetch jobs from Supabase
        const { data: jobs, error: jobErr } = await supabase
          .from("jobs")
          .select("*")
          .eq("archived", false)
          .order("created_at", { ascending: false });

        if (jobErr) throw jobErr;
        jobRows = (jobs ?? []) as DBJob[];

        // Fetch all floors
        if (jobRows.length > 0) {
          const jobIds = jobRows.map((j) => j.id);
          const { data: floors, error: floorErr } = await supabase
            .from("floors")
            .select("*")
            .in("job_id", jobIds)
            .order("floor_order");
          if (floorErr) throw floorErr;
          floorRows = (floors ?? []) as DBFloor[];
        }

        // Fetch all pins
        if (floorRows.length > 0) {
          const floorIds = floorRows.map((f) => f.id);
          const { data: pins, error: pinErr } = await supabase
            .from("pins")
            .select("*")
            .in("floor_id", floorIds)
            .order("pin_order");
          if (pinErr) throw pinErr;
          pinRows = (pins ?? []) as DBPin[];
        }

        // Cache to IndexedDB
        await cacheJobs(jobRows);
        await cacheFloors(floorRows);
        await cachePins(pinRows);
      } else {
        // Offline — load from IndexedDB
        jobRows = await getCachedJobs();
        jobRows = jobRows.filter(j => !j.archived).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        for (const j of jobRows) {
          const floors = await getCachedFloorsByJob(j.id);
          floorRows.push(...floors);
          for (const f of floors) {
            const pins = await getCachedPinsByFloor(f.id);
            pinRows.push(...pins);
          }
        }
      }

      // Generate signed URLs if online
      const pdfUrlMap = new Map<string, string>();
      const photoUrlMap = new Map<string, string>();

      if (navigator.onLine) {
        const pdfPaths = floorRows.map((f) => f.pdf_path).filter(Boolean);
        if (pdfPaths.length > 0) {
          const { data: signedPdfs } = await supabase.storage.from("floor-plans").createSignedUrls(pdfPaths, 3600);
          signedPdfs?.forEach((item) => {
            if (!item.error && item.signedUrl) pdfUrlMap.set(item.path, item.signedUrl);
          });
        }

        const photoPaths = pinRows
          .map((p) => normalizePinPhotoPath(p.photo_path))
          .filter((path): path is string => Boolean(path));
        if (photoPaths.length > 0) {
          const { data: signedPhotos } = await supabase.storage.from("pin-photos").createSignedUrls(photoPaths, 3600);
          signedPhotos?.forEach((item) => {
            if (!item.error && item.signedUrl) photoUrlMap.set(item.path, item.signedUrl);
          });
        }

        // Hydrate IndexedDB caches from signed URLs so viewed data remains usable offline.
        // Run as best-effort in background; do not block the initial UI render.
        const floorsToCache = floorRows
          .map((f) => ({ floorId: f.id, path: f.pdf_path }))
          .filter((x): x is { floorId: string; path: string } => Boolean(x.path));
        const pinsToCache = pinRows
          .map((p) => ({ pinId: p.id, path: p.photo_path }))
          .filter((x): x is { pinId: string; path: string } => Boolean(x.path));

        void (async () => {
          for (const floorEntry of floorsToCache) {
            const signed = pdfUrlMap.get(floorEntry.path);
            if (!signed) continue;
            try {
              const res = await fetch(signed);
              if (!res.ok) continue;
              const blob = await res.blob();
              await cacheFloorPdf(floorEntry.floorId, blob);
            } catch {
              // best-effort only
            }
          }

          for (const pinEntry of pinsToCache) {
            const signed = photoUrlMap.get(pinEntry.path);
            if (!signed) continue;
            try {
              const res = await fetch(signed);
              if (!res.ok) continue;
              const blob = await res.blob();
              await cachePinPhoto(pinEntry.pinId, blob);
            } catch {
              // best-effort only
            }
          }
        })();
      }

      // Assemble structure (local cached blobs first, then signed URL fallback)
      const jobs: Job[] = await Promise.all(
        jobRows.map(async (j) => ({
          id: j.id,
          name: j.name,
          description: j.description ?? "",
          createdAt: j.created_at,
          archived: j.archived,
          floors: await Promise.all(
            floorRows
              .filter((f) => f.job_id === j.id)
              .map(async (f) => {
                const cachedPdf = await getCachedFloorPdf(f.id);
                const localPdfUrl = cachedPdf ? URL.createObjectURL(cachedPdf) : undefined;
                const remotePdfUrl = f.pdf_path ? pdfUrlMap.get(f.pdf_path) : undefined;
                return {
                  id: f.id,
                  name: f.label,
                  pdfUrl: localPdfUrl ?? remotePdfUrl,
                  pdfPath: f.pdf_path ?? undefined,
                pins: await Promise.all(
                  pinRows
                    .filter((p) => p.floor_id === f.id)
                    .map(async (p) => {
                      const localBlob = await getCachedPinPhoto(p.id);
                      const normalizedPhotoPath = normalizePinPhotoPath(p.photo_path);
                      const remoteUrl = normalizedPhotoPath
                        ? photoUrlMap.get(normalizedPhotoPath)
                        : undefined;
                      return {
                        id: p.id,
                        name: p.name,
                        x: p.x_pct,
                        y: p.y_pct,
                        photoUrl: localBlob ? URL.createObjectURL(localBlob) : remoteUrl,
                        notes: p.note ?? undefined,
                        capturedAt: p.photo_taken_at ?? undefined,
                      };
                    })
                ),
                };
              })
          ),
        }))
      );

      // Cache photos locally if online (optional, maybe too heavy for bulk)
      // For now, only cache on capture/upload

      const prev = get();
      const serverIds = new Set(jobs.map((j) => j.id));
      const optimistic = prev.jobs.filter((j) => !serverIds.has(j.id));
      const merged = [...optimistic, ...jobs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const { activeJobId, activeFloorId } = pickActiveAfterLoad(
        merged,
        prev.activeJobId,
        prev.activeFloorId
      );

      // Prevent memory growth by revoking stale blob/object URLs created on prior loads.
      revokeBlobUrlsFromJobs(prev.jobs);

      set({
        jobs: merged,
        activeJobId,
        activeFloorId,
        loaded: true,
      });

      // Restore selected pin if it still exists under the restored job/floor.
      const savedPinId = safeGet(LS_KEYS.selectedPinId);
      if (savedPinId) {
        const restoredJob = merged.find((j) => j.id === activeJobId);
        const restoredFloor = restoredJob?.floors.find((f) => f.id === activeFloorId);
        const stillThere = restoredFloor?.pins.some((p) => p.id === savedPinId);
        if (stillThere) {
          set({ selectedPinId: savedPinId });
        } else {
          set({ selectedPinId: null });
          safeSet(LS_KEYS.selectedPinId, "");
        }
      }
    } catch (err) {
      console.error("[SiteDocHB] Failed to load jobs:", err);
      // Try local cache as absolute fallback
      const jobRows = await getCachedJobs();
      
      const jobs: Job[] = [];
      for (const j of jobRows) {
        const floors = await getCachedFloorsByJob(j.id);
        const assembledFloors = [];
        for (const f of floors) {
          const pins = await getCachedPinsByFloor(f.id);
          const assembledPins = [];
          for (const p of pins) {
            const blob = await getCachedPinPhoto(p.id);
            assembledPins.push({
              id: p.id,
              name: p.name,
              x: p.x_pct,
              y: p.y_pct,
              photoUrl: blob ? URL.createObjectURL(blob) : undefined,
              notes: p.note ?? undefined,
              capturedAt: p.photo_taken_at ?? undefined,
            });
          }
          const cachedPdf = await getCachedFloorPdf(f.id);
          assembledFloors.push({
            id: f.id,
            name: f.label,
            pdfPath: f.pdf_path ?? undefined,
            pdfUrl: cachedPdf ? URL.createObjectURL(cachedPdf) : undefined,
            pins: assembledPins,
          });
        }
        jobs.push({ id: j.id, name: j.name, description: j.description ?? "", createdAt: j.created_at, archived: j.archived, floors: assembledFloors });
      }

      const prev = get();
      const { activeJobId, activeFloorId } = pickActiveAfterLoad(
        jobs,
        prev.activeJobId,
        prev.activeFloorId
      );
      revokeBlobUrlsFromJobs(prev.jobs);
      set({ jobs, activeJobId, activeFloorId, loaded: true });
    }
  },

  // ─── MUTATIONS ──────────────────────────────────────────────────────────────
  createJob: ({ name, description, firstFloorLabel }) => {
    const id = uid("job");
    const floorId = uid("floor");
    const now = new Date().toISOString();
    const job: Job = {
      id,
      name,
      description,
      createdAt: now,
      floors: [{ id: floorId, name: firstFloorLabel, pins: [] }],
    };

    // 1. Update local state immediately
    set((s) => ({
      jobs: [job, ...s.jobs],
      activeJobId: id,
      activeFloorId: floorId,
      selectedPinId: null,
    }));

    // 2. Persist to IndexedDB
    upsertJob({ id, name, description, created_date: now, archived: false, created_at: now });
    upsertFloor({ id: floorId, job_id: id, label: firstFloorLabel, floor_order: 0, pdf_path: null, created_at: now });

    // 3. Write to Supabase or Queue
    const sync = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        const { error: jobErr } = await supabase.from("jobs").insert({ id, name, description, created_at: now });
        if (jobErr) throw jobErr;
        const { error: floorErr } = await supabase.from("floors").insert({ id: floorId, job_id: id, label: firstFloorLabel, floor_order: 0 });
        if (floorErr) throw floorErr;
      } catch {
        await addToQueue({ type: "job_create", maxRetries: 3, payload: { table: "jobs", record: { id, name, description, created_at: now } } });
        await addToQueue({ type: "floor_create", maxRetries: 3, payload: { table: "floors", record: { id: floorId, job_id: id, label: firstFloorLabel, floor_order: 0 } } });
      }
    };
    sync();

    return id;
  },

  renameJob: (id, name) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, name } : j)) }));
    
    const sync = async () => {
      const job = get().jobs.find(j => j.id === id);
      if (!job) return;
      await upsertJob({ id, name, description: job.description, created_date: job.createdAt, archived: job.archived, created_at: job.createdAt });
      
      try {
        if (!navigator.onLine) throw new Error("offline");
        await supabase.from("jobs").update({ name }).eq("id", id);
      } catch {
        // We need a job_update queue type or just reuse job_create with upsert logic in syncEngine
        // For simplicity here, we'll assume job renames are less critical or handled by a generic update queue
        await addToQueue({ type: "job_create", maxRetries: 3, payload: { table: "jobs", record: { id, name } } });
      }
    };
    sync();
  },

  updateJobDescription: (id, description) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, description } : j)) }));
    supabase.from("jobs").update({ description }).eq("id", id).then();
  },

  addFloor: (jobId, name) => {
    const fid = uid("floor");
    const now = new Date().toISOString();
    const job = get().jobs.find((j) => j.id === jobId);
    const floorOrder = job ? job.floors.length : 0;

    // 1. Local state
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, floors: [...j.floors, { id: fid, name, pins: [] }] }
          : j
      ),
      activeFloorId: fid,
    }));

    // 2. IndexedDB
    upsertFloor({ id: fid, job_id: jobId, label: name, floor_order: floorOrder, pdf_path: null, created_at: now });

    // 3. Supabase/Queue
    const sync = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        const { error } = await supabase.from("floors").insert({
          id: fid,
          job_id: jobId,
          label: name,
          floor_order: floorOrder,
        });
        if (error) throw error;
      } catch {
        await addToQueue({ type: "floor_create", maxRetries: 3, payload: { table: "floors", record: { id: fid, job_id: jobId, label: name, floor_order: floorOrder } } });
      }
    };
    sync();

    return fid;
  },

  addPin: (jobId, floorId, pin) => {
    const pid = uid("pin");
    const now = new Date().toISOString();
    const floor = get().jobs.find((j) => j.id === jobId)?.floors.find((f) => f.id === floorId);
    const pinOrder = floor ? floor.pins.length : 0;

    // 1. Local state
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId ? f : { ...f, pins: [...f.pins, { ...pin, id: pid }] }
              ),
            }
      ),
      selectedPinId: pid,
      placementMode: false,
    }));

    // 2. IndexedDB
    upsertPin({
      id: pid,
      floor_id: floorId,
      name: pin.name,
      x_pct: pin.x,
      y_pct: pin.y,
      pin_order: pinOrder,
      photo_path: null,
      note: pin.notes ?? null,
      photo_taken_at: null,
      created_at: now,
    });

    // 3. Supabase/Queue
    const sync = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        const { error } = await supabase.from("pins").insert({
          id: pid,
          floor_id: floorId,
          name: pin.name,
          x_pct: pin.x,
          y_pct: pin.y,
          pin_order: pinOrder,
          note: pin.notes ?? null,
        });
        if (error) throw error;
      } catch {
        await addToQueue({
          type: "pin_create",
          maxRetries: 3,
          payload: {
            table: "pins",
            record: {
              id: pid,
              floor_id: floorId,
              name: pin.name,
              x_pct: pin.x,
              y_pct: pin.y,
              pin_order: pinOrder,
              note: pin.notes ?? null,
            },
          },
        });
      }
    };
    sync();

    return pid;
  },

  renamePin: (jobId, floorId, pinId, name) => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId
                  ? f
                  : { ...f, pins: f.pins.map((p) => (p.id === pinId ? { ...p, name } : p)) }
              ),
            }
      ),
    }));

    const sync = async () => {
      const pin = get().jobs.find(j => j.id === jobId)?.floors.find(f => f.id === floorId)?.pins.find(p => p.id === pinId);
      if (!pin) return;

      await upsertPin({
        id: pinId,
        floor_id: floorId,
        name,
        x_pct: pin.x,
        y_pct: pin.y,
        pin_order: 0, // Simplified
        photo_path: pin.photoUrl ?? null,
        note: pin.notes ?? null,
        photo_taken_at: pin.capturedAt ?? null,
        created_at: new Date().toISOString(),
      });

      try {
        if (!navigator.onLine) throw new Error("offline");
        await supabase.from("pins").update({ name }).eq("id", pinId);
      } catch {
        await addToQueue({ type: "pin_update", maxRetries: 3, payload: { pinId, pinData: { name } } });
      }
    };
    sync();
  },

  attachPhoto: (jobId, floorId, pinId, photoUrl) => {
    const normalizedPath = normalizePinPhotoPath(photoUrl);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId
                  ? f
                  : {
                      ...f,
                      pins: f.pins.map((p) =>
                        p.id === pinId
                          ? { ...p, photoUrl, capturedAt: new Date().toISOString() }
                          : p
                      ),
                    }
              ),
            }
      ),
    }));
    supabase
      .from("pins")
      .update({ photo_path: normalizedPath, photo_taken_at: new Date().toISOString() })
      .eq("id", pinId)
      .then();
  },

  updatePinNotes: (jobId, floorId, pinId, notes) => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId
                  ? f
                  : { ...f, pins: f.pins.map((p) => (p.id === pinId ? { ...p, notes } : p)) }
              ),
            }
      ),
    }));

    const sync = async () => {
      const pin = get().jobs.find(j => j.id === jobId)?.floors.find(f => f.id === floorId)?.pins.find(p => p.id === pinId);
      if (!pin) return;

      await upsertPin({
        id: pinId,
        floor_id: floorId,
        name: pin.name,
        x_pct: pin.x,
        y_pct: pin.y,
        pin_order: 0,
        photo_path: pin.photoUrl ?? null,
        note: notes,
        photo_taken_at: pin.capturedAt ?? null,
        created_at: new Date().toISOString(),
      });

      try {
        if (!navigator.onLine) throw new Error("offline");
        await supabase.from("pins").update({ note: notes }).eq("id", pinId);
      } catch {
        await addToQueue({ type: "pin_update", maxRetries: 3, payload: { pinId, pinData: { note: notes } } });
      }
    };
    sync();
  },

  uploadFloorPdf: async (jobId, floorId, file) => {
    const filePath = `${jobId}/${floorId}/${Date.now()}-${file.name}`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from("floor-plans")
      .upload(filePath, file, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("[SiteDocHB] PDF upload failed:", uploadErr);
      throw uploadErr;
    }

    // Get signed URL (private bucket)
    const { data: signedData } = await supabase.storage
      .from("floor-plans")
      .createSignedUrl(filePath, 3600);

    const signedUrl = signedData?.signedUrl || "";

    // Update local state with signed URL for display
    const localUrl = URL.createObjectURL(file);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId ? f : { ...f, pdfUrl: localUrl, pdfPath: filePath }
              ),
            }
      ),
    }));

    // Cache PDF for offline use immediately.
    await cacheFloorPdf(floorId, file);

    // Store the STORAGE PATH in DB (not signed URL — URLs expire)
    await supabase.from("floors").update({ pdf_path: filePath }).eq("id", floorId);
  },

  uploadPinPhoto: async (jobId, floorId, pinId, file) => {
    const filePath = `${jobId}/${floorId}/${pinId}.jpg`;
    const now = new Date().toISOString();
    
    // 1. Immediate UI Update (using local blob URL)
    const previewUrl = URL.createObjectURL(file);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : {
          ...j,
          floors: j.floors.map((f) =>
            f.id !== floorId ? f : {
              ...f,
              pins: f.pins.map((p) =>
                p.id === pinId ? { ...p, photoUrl: previewUrl, capturedAt: now } : p
              ),
            }
          ),
        }
      ),
    }));

    // 2. Persist to local DB
    await updatePinPhotoLocal(pinId, filePath, now);
    await cachePinPhoto(pinId, file);

    // 3. Attempt Sync or Queue
    const sync = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        
        const { error: uploadErr } = await supabase.storage
          .from("pin-photos")
          .upload(filePath, file, { contentType: "image/jpeg", upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: updatedPin, error: updateErr } = await supabase
          .from("pins")
          .update({ photo_path: filePath, photo_taken_at: now })
          .eq("id", pinId)
          .select("id")
          .maybeSingle();

        if (updateErr) throw updateErr;
        if (!updatedPin) throw new Error("Pin row not found while updating photo metadata");
          
      } catch (err) {
        console.log("[SiteDocHB] Upload failed or offline, queuing...", err);
        await addToQueue({
          type: "photo_upload",
          maxRetries: 5,
          payload: { pinId, floorId, jobId, photoBlob: file, storagePath: filePath, photoTakenAt: now },
        });
      }
    };
    sync();
  },

  removePin: (jobId, floorId, pinId) => {
    const pin = get().jobs.find((j) => j.id === jobId)?.floors.find((f) => f.id === floorId)?.pins.find((p) => p.id === pinId);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : {
          ...j,
          floors: j.floors.map((f) =>
            f.id !== floorId ? f : { ...f, pins: f.pins.filter((p) => p.id !== pinId) }
          ),
        }
      ),
      selectedPinId: s.selectedPinId === pinId ? null : s.selectedPinId,
    }));

    // 2. Local DB
    deletePinLocal(pinId);
    if (get().selectedPinId === pinId) safeSet(LS_KEYS.selectedPinId, "");

    // 3. Supabase/Queue
    const deleteFromSupabase = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        await supabase.from("pins").delete().eq("id", pinId);
        if (pin?.photoUrl?.includes("pin-photos")) {
          const path = pin.photoUrl.split("/pin-photos/")[1];
          if (path) await supabase.storage.from("pin-photos").remove([path]);
        }
      } catch {
        await addToQueue({ type: "pin_delete", maxRetries: 3, payload: { table: "pins", id: pinId } });
      }
    };
    deleteFromSupabase();
  },

  removeFloor: (jobId, floorId) => {
    const state = get();
    const job = state.jobs.find((j) => j.id === jobId);
    const nextFloor = job?.floors.find((f) => f.id !== floorId);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : { ...j, floors: j.floors.filter((f) => f.id !== floorId) }
      ),
      activeFloorId: s.activeFloorId === floorId ? (nextFloor?.id ?? "") : s.activeFloorId,
      selectedPinId: null,
    }));

    // 2. Local DB
    deleteFloorLocal(floorId);
    if (get().activeFloorId === floorId) safeSet(LS_KEYS.activeFloorId, "");

    // 3. Supabase/Queue
    const deleteFromSupabase = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        await supabase.from("floors").delete().eq("id", floorId);
      } catch {
        await addToQueue({ type: "floor_delete", maxRetries: 3, payload: { table: "floors", id: floorId } });
      }
    };
    deleteFromSupabase();
  },

  removeJob: (jobId) => {
    const state = get();
    const remaining = state.jobs.filter((j) => j.id !== jobId);
    set({
      jobs: remaining,
      activeJobId: state.activeJobId === jobId ? (remaining[0]?.id ?? "") : state.activeJobId,
      activeFloorId: state.activeJobId === jobId ? (remaining[0]?.floors[0]?.id ?? "") : state.activeFloorId,
      selectedPinId: null,
    });

    // 2. Local DB
    deleteJobLocal(jobId);
    if (get().activeJobId === jobId) {
      safeSet(LS_KEYS.activeJobId, "");
      safeSet(LS_KEYS.activeFloorId, "");
      safeSet(LS_KEYS.selectedPinId, "");
    }

    // 3. Supabase/Queue
    const deleteFromSupabase = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        await supabase.from("jobs").delete().eq("id", jobId);
      } catch {
        await addToQueue({ type: "job_delete", maxRetries: 3, payload: { table: "jobs", id: jobId } });
      }
    };
    deleteFromSupabase();
  },

  hardDeleteJob: async (jobId) => {
    if (!navigator.onLine) throw new Error("You must be online to delete a job.");
    const job = get().jobs.find((j) => j.id === jobId);
    // Call edge function (service role) to delete DB + storage + shares.
    const { error } = await supabase.functions.invoke("delete-job", {
      body: { jobId },
    });
    if (error) throw error;

    // Remove from local state/IndexedDB immediately.
    set((s) => {
      const remaining = s.jobs.filter((j) => j.id !== jobId);
      const nextActiveJobId = s.activeJobId === jobId ? (remaining[0]?.id ?? "") : s.activeJobId;
      const nextJob = remaining.find((j) => j.id === nextActiveJobId);
      const nextActiveFloorId =
        s.activeJobId === jobId ? (nextJob?.floors[0]?.id ?? "") : s.activeFloorId;
      return {
        jobs: remaining,
        activeJobId: nextActiveJobId,
        activeFloorId: nextActiveFloorId,
        selectedPinId: null,
        placementMode: false,
      };
    });
    await deleteJobLocal(jobId);

    if (job && safeGet(LS_KEYS.activeJobId) === jobId) {
      safeSet(LS_KEYS.activeJobId, "");
      safeSet(LS_KEYS.activeFloorId, "");
      safeSet(LS_KEYS.selectedPinId, "");
    }
  },
}));

// ─── CONVENIENCE SELECTORS ────────────────────────────────────────────────────

export const useActiveJob = () =>
  useAppStore((s) => s.jobs.find((j) => j.id === s.activeJobId));

export const useActiveFloor = () => {
  const job = useActiveJob();
  const id = useAppStore((s) => s.activeFloorId);
  return job?.floors.find((f) => f.id === id) ?? job?.floors[0];
};

export const useSelectedPin = () => {
  const floor = useActiveFloor();
  const id = useAppStore((s) => s.selectedPinId);
  return floor?.pins.find((p) => p.id === id) ?? null;
};
