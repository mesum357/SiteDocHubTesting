import { create } from "zustand";
import type { Job, Pin } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { addToQueue } from "@/lib/db";

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
      // Fetch jobs
      const { data: jobRows, error: jobErr } = await supabase
        .from("jobs")
        .select("*")
        .eq("archived", false)
        .order("created_at", { ascending: false });

      if (jobErr) throw jobErr;
      if (!jobRows || jobRows.length === 0) {
        set({ jobs: [], loaded: true });
        return;
      }

      // Fetch all floors for these jobs
      const jobIds = jobRows.map((j: any) => j.id);
      const { data: floorRows, error: floorErr } = await supabase
        .from("floors")
        .select("*")
        .in("job_id", jobIds)
        .order("floor_order");

      if (floorErr) throw floorErr;

      // Fetch all pins for these floors
      const floorIds = (floorRows ?? []).map((f: any) => f.id);
      let pinRows: any[] = [];
      if (floorIds.length > 0) {
        const { data, error: pinErr } = await supabase
          .from("pins")
          .select("*")
          .in("floor_id", floorIds)
          .order("pin_order");

        if (pinErr) throw pinErr;
        pinRows = data ?? [];
      }

      // Bulk generate signed URLs for PDFs
      const pdfPaths = floorRows.map((f: any) => f.pdf_path).filter(Boolean);
      const pdfUrlMap = new Map<string, string>();
      if (pdfPaths.length > 0) {
        const { data: signedPdfs } = await supabase.storage.from("floor-plans").createSignedUrls(pdfPaths, 3600);
        signedPdfs?.forEach((item) => {
          if (!item.error && item.signedUrl) pdfUrlMap.set(item.path, item.signedUrl);
        });
      }

      // Bulk generate signed URLs for Pin Photos
      const photoPaths = pinRows.map((p: any) => p.photo_path).filter(Boolean);
      const photoUrlMap = new Map<string, string>();
      if (photoPaths.length > 0) {
        const { data: signedPhotos } = await supabase.storage.from("pin-photos").createSignedUrls(photoPaths, 3600);
        signedPhotos?.forEach((item) => {
          if (!item.error && item.signedUrl) photoUrlMap.set(item.path, item.signedUrl);
        });
      }

      // Assemble nested structure: Job > Floor > Pin
      const jobs: Job[] = jobRows.map((j: any) => ({
        id: j.id,
        name: j.name,
        description: j.description ?? "",
        createdAt: j.created_at,
        archived: j.archived,
        floors: (floorRows ?? [])
          .filter((f: any) => f.job_id === j.id)
          .map((f: any) => ({
            id: f.id,
            name: f.label,
            pdfUrl: f.pdf_path ? pdfUrlMap.get(f.pdf_path) : undefined,
            pins: pinRows
              .filter((p: any) => p.floor_id === f.id)
              .map((p: any) => ({
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

      set({
        jobs,
        activeJobId: jobs[0]?.id ?? "",
        activeFloorId: jobs[0]?.floors[0]?.id ?? "",
        loaded: true,
      });
    } catch (err) {
      console.error("[SiteDocHB] Failed to load jobs:", err);
      // Still mark as loaded so the UI doesn't hang on skeleton
      set({ loaded: true });
    }
  },

  // ─── MUTATIONS ──────────────────────────────────────────────────────────────
  createJob: ({ name, description, firstFloorLabel }) => {
    const id = uid("job");
    const floorId = uid("floor");
    const job: Job = {
      id,
      name,
      description,
      createdAt: new Date().toISOString(),
      floors: [{ id: floorId, name: firstFloorLabel, pins: [] }],
    };

    // Update local state immediately
    set((s) => ({
      jobs: [job, ...s.jobs],
      activeJobId: id,
      activeFloorId: floorId,
      selectedPinId: null,
    }));

    // Write to Supabase (fire-and-forget with queue fallback)
    const writeToSupabase = async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");

        const { error: jobErr } = await supabase.from("jobs").insert({
          id,
          name,
          description,
          created_at: new Date().toISOString(),
          archived: false,
        });
        if (jobErr) throw jobErr;

        const { error: floorErr } = await supabase.from("floors").insert({
          id: floorId,
          job_id: id,
          label: firstFloorLabel,
          floor_order: 0,
        });
        if (floorErr) throw floorErr;
      } catch {
        await addToQueue({ type: "job_create", maxRetries: 3, payload: { table: "jobs", record: { id, name, description, created_at: new Date().toISOString(), archived: false } } });
        await addToQueue({ type: "floor_create", maxRetries: 3, payload: { table: "floors", record: { id: floorId, job_id: id, label: firstFloorLabel, floor_order: 0 } } });
      }
    };
    writeToSupabase();

    return id;
  },

  renameJob: (id, name) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, name } : j)) }));
    supabase.from("jobs").update({ name }).eq("id", id).then();
  },

  updateJobDescription: (id, description) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, description } : j)) }));
    supabase.from("jobs").update({ description }).eq("id", id).then();
  },

  addFloor: (jobId, name) => {
    const fid = uid("floor");
    const job = get().jobs.find((j) => j.id === jobId);
    const floorOrder = job ? job.floors.length : 0;

    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, floors: [...j.floors, { id: fid, name, pins: [] }] }
          : j
      ),
      activeFloorId: fid,
    }));

    const writeToSupabase = async () => {
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
    writeToSupabase();

    return fid;
  },

  addPin: (jobId, floorId, pin) => {
    const pid = uid("pin");
    const floor = get().jobs.find((j) => j.id === jobId)?.floors.find((f) => f.id === floorId);
    const pinOrder = floor ? floor.pins.length : 0;

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

    const writeToSupabase = async () => {
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
    writeToSupabase();

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
    supabase.from("pins").update({ name }).eq("id", pinId).then();
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
    supabase.from("pins").update({ note: notes }).eq("id", pinId).then();
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
    const filePath = `${jobId}/${floorId}/${pinId}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("pin-photos")
      .upload(filePath, file, { contentType: file.type, upsert: true });
    if (uploadErr) {
      console.error("[SiteDocHB] Pin photo upload failed:", uploadErr);
      throw uploadErr;
    }
    // Get signed URL (private bucket)
    const { data: signedData } = await supabase.storage
      .from("pin-photos")
      .createSignedUrl(filePath, 3600);
    const signedUrl = signedData?.signedUrl || "";
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : {
          ...j,
          floors: j.floors.map((f) =>
            f.id !== floorId ? f : {
              ...f,
              pins: f.pins.map((p) =>
                p.id === pinId ? { ...p, photoUrl: signedUrl, capturedAt: new Date().toISOString() } : p
              ),
            }
          ),
        }
      ),
    }));
    // Store the STORAGE PATH in DB (not signed URL)
    await supabase.from("pins").update({ photo_path: filePath, photo_taken_at: new Date().toISOString() }).eq("id", pinId);
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
