import { create } from "zustand";
import { mockJobs } from "@/data/mockData";
import type { Job, Pin, SyncStatus } from "@/types";

interface AppState {
  jobs: Job[];
  activeJobId: string;
  activeFloorId: string;
  selectedPinId: string | null;
  placementMode: boolean;
  syncStatus: SyncStatus;
  queuedCount: number;
  cameraConnected: boolean;
  loaded: boolean;

  // setters
  setActiveJob: (id: string) => void;
  setActiveFloor: (id: string) => void;
  selectPin: (id: string | null) => void;
  togglePlacement: (on?: boolean) => void;
  cycleSyncStatus: () => void;
  setLoaded: (b: boolean) => void;

  // mutations
  createJob: (input: { name: string; description: string; firstFloorLabel: string }) => string;
  renameJob: (id: string, name: string) => void;
  updateJobDescription: (id: string, description: string) => void;
  addFloor: (jobId: string, name: string) => string;
  addPin: (jobId: string, floorId: string, pin: Omit<Pin, "id">) => string;
  renamePin: (jobId: string, floorId: string, pinId: string, name: string) => void;
  attachPhoto: (jobId: string, floorId: string, pinId: string, photoUrl: string) => void;
  updatePinNotes: (jobId: string, floorId: string, pinId: string, notes: string) => void;
}

const uid = (prefix = "id") => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const useAppStore = create<AppState>((set, get) => ({
  jobs: mockJobs,
  activeJobId: mockJobs[0].id,
  activeFloorId: mockJobs[0].floors[0].id,
  selectedPinId: null,
  placementMode: false,
  syncStatus: "synced",
  queuedCount: 0,
  cameraConnected: false,
  loaded: false,

  setActiveJob: (id) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;
    set({ activeJobId: id, activeFloorId: job.floors[0]?.id ?? "", selectedPinId: null, placementMode: false });
  },
  setActiveFloor: (id) => set({ activeFloorId: id, selectedPinId: null, placementMode: false }),
  selectPin: (id) => set({ selectedPinId: id, placementMode: false }),
  togglePlacement: (on) =>
    set((s) => ({ placementMode: typeof on === "boolean" ? on : !s.placementMode, selectedPinId: null })),
  cycleSyncStatus: () =>
    set((s) => {
      const next: SyncStatus = s.syncStatus === "synced" ? "syncing" : s.syncStatus === "syncing" ? "offline" : "synced";
      return { syncStatus: next, queuedCount: next === "offline" ? 2 : 0 };
    }),
  setLoaded: (b) => set({ loaded: b }),

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
    set((s) => ({ jobs: [job, ...s.jobs], activeJobId: id, activeFloorId: floorId, selectedPinId: null }));
    return id;
  },
  renameJob: (id, name) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, name } : j)) })),
  updateJobDescription: (id, description) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, description } : j)) })),
  addFloor: (jobId, name) => {
    const fid = uid("floor");
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, floors: [...j.floors, { id: fid, name, pins: [] }] } : j)),
      activeFloorId: fid,
    }));
    return fid;
  },
  addPin: (jobId, floorId, pin) => {
    const pid = uid("pin");
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              floors: j.floors.map((f) =>
                f.id !== floorId ? f : { ...f, pins: [...f.pins, { ...pin, id: pid }] },
              ),
            },
      ),
      selectedPinId: pid,
      placementMode: false,
    }));
    return pid;
  },
  renamePin: (jobId, floorId, pinId, name) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : { ...j, floors: j.floors.map((f) => (f.id !== floorId ? f : { ...f, pins: f.pins.map((p) => (p.id === pinId ? { ...p, name } : p)) })) },
      ),
    })),
  attachPhoto: (jobId, floorId, pinId, photoUrl) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : { ...j, floors: j.floors.map((f) => (f.id !== floorId ? f : { ...f, pins: f.pins.map((p) => (p.id === pinId ? { ...p, photoUrl, capturedAt: new Date().toISOString() } : p)) })) },
      ),
    })),
  updatePinNotes: (jobId, floorId, pinId, notes) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id !== jobId ? j : { ...j, floors: j.floors.map((f) => (f.id !== floorId ? f : { ...f, pins: f.pins.map((p) => (p.id === pinId ? { ...p, notes } : p)) })) },
      ),
    })),
}));

// Convenience selectors
export const useActiveJob = () => useAppStore((s) => s.jobs.find((j) => j.id === s.activeJobId)!);
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
