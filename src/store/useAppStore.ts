import { create } from "zustand";
import type { Job, Pin } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { precacheJobPdfs } from "@/lib/registerSW";
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
}

const uid = (prefix = "id") => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const useAppStore = create<AppState>((set, get) => ({
  // ─── INITIAL STATE (empty) ──────────────────────────────────────────────────
  jobs: [],
  activeJobId: "",
  activeFloorId: "",
  selectedPinId: null,
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
  },
  setActiveFloor: (id) =>
    set({ activeFloorId: id, selectedPinId: null, placementMode: false }),
  selectPin: (id) => set({ selectedPinId: id, placementMode: false }),
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
      let jobRows: any[] = [];
      let floorRows: any[] = [];
      let pinRows: any[] = [];

      if (navigator.onLine) {
        // Fetch jobs from Supabase
        const { data: jobs, error: jobErr } = await supabase
          .from("jobs")
          .select("*")
          .eq("archived", false)
          .order("created_at", { ascending: false });

        if (jobErr) throw jobErr;
        jobRows = jobs ?? [];

        // Fetch all floors
        if (jobRows.length > 0) {
          const jobIds = jobRows.map((j) => j.id);
          const { data: floors, error: floorErr } = await supabase
            .from("floors")
            .select("*")
            .in("job_id", jobIds)
            .order("floor_order");
          if (floorErr) throw floorErr;
          floorRows = floors ?? [];
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
          pinRows = pins ?? [];
        }

        // Cache to IndexedDB
        await cacheJobs(jobRows as DBJob[]);
        await cacheFloors(floorRows as DBFloor[]);
        await cachePins(pinRows as DBPin[]);
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

        const photoPaths = pinRows.map((p) => p.photo_path).filter(Boolean);
        if (photoPaths.length > 0) {
          const { data: signedPhotos } = await supabase.storage.from("pin-photos").createSignedUrls(photoPaths, 3600);
          signedPhotos?.forEach((item) => {
            if (!item.error && item.signedUrl) photoUrlMap.set(item.path, item.signedUrl);
          });
        }
      }

      // Assemble structure
      const jobs: Job[] = jobRows.map((j) => ({
        id: j.id,
        name: j.name,
        description: j.description ?? "",
        createdAt: j.created_at,
        archived: j.archived,
        floors: floorRows
          .filter((f) => f.job_id === j.id)
          .map((f) => ({
            id: f.id,
            name: f.label,
            pdfUrl: f.pdf_path ? pdfUrlMap.get(f.pdf_path) : undefined,
            pins: pinRows
              .filter((p) => p.floor_id === f.id)
              .map((p) => ({
                id: p.id,
                name: p.name,
                x: p.x_pct,
                y: p.y_pct,
                photoUrl: p.photo_path ? photoUrlMap.get(p.photo_path) : undefined,
                notes: p.note ?? undefined,
                capturedAt: p.photo_taken_at ?? undefined,
              })),
          })),
      }));

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

      set({
        jobs: merged,
        activeJobId,
        activeFloorId,
        loaded: true,
      });
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
          assembledFloors.push({ id: f.id, name: f.label, pins: assembledPins });
        }
        jobs.push({ id: j.id, name: j.name, description: j.description ?? "", createdAt: j.created_at, archived: j.archived, floors: assembledFloors });
      }

      const prev = get();
      const { activeJobId, activeFloorId } = pickActiveAfterLoad(
        jobs,
        prev.activeJobId,
        prev.activeFloorId
      );
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
      .update({ photo_path: photoUrl, photo_taken_at: new Date().toISOString() })
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
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId ? f : { ...f, pdfUrl: signedUrl }
              ),
            }
      ),
    }));

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

        await supabase
          .from("pins")
          .update({ photo_path: filePath, photo_taken_at: now })
          .eq("id", pinId);
          
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
