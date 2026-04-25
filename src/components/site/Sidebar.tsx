import { useState } from "react";
import { Pencil, Plus, Camera, Check, FileUp, Trash2 } from "lucide-react";
import { useActiveFloor, useActiveJob, useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { canPerform } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props { onNewJob: () => void }

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const Sidebar = ({ onNewJob }: Props) => {
  const job = useActiveJob();
  const floor = useActiveFloor();
  const renameJob = useAppStore((s) => s.renameJob);
  const updateJobDescription = useAppStore((s) => s.updateJobDescription);
  const setActiveFloor = useAppStore((s) => s.setActiveFloor);
  const addFloor = useAppStore((s) => s.addFloor);
  const selectPin = useAppStore((s) => s.selectPin);
  const selectedPinId = useAppStore((s) => s.selectedPinId);
  const togglePlacement = useAppStore((s) => s.togglePlacement);
  const placementMode = useAppStore((s) => s.placementMode);
  const removeFloor = useAppStore((s) => s.removeFloor);
  const role = useAuthStore((s) => s.role);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(job?.name ?? "");
  const [descDraft, setDescDraft] = useState(job?.description ?? "");
  const [addingFloor, setAddingFloor] = useState(false);
  const [floorDraft, setFloorDraft] = useState("");

  // Empty state — no jobs loaded yet
  if (!job) {
    return (
      <div className="flex w-full flex-col items-center justify-center p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-dashed border-hairline text-ink-muted">
          <Plus className="h-5 w-5" />
        </div>
        <p className="text-sm font-display text-ink">No jobs yet</p>
        <p className="mt-1 text-xs text-ink-secondary">Create your first photo-walk job to get started.</p>
        {canPerform(role, "CREATE_JOB") && (
          <button
            onClick={onNewJob}
            className="mt-4 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-display text-accent-foreground lift-on-hover"
          >
            <Plus className="h-4 w-4" /> New Job
          </button>
        )}
      </div>
    );
  }

  const filled = floor?.pins.filter((p) => p.photoUrl).length ?? 0;
  const total = floor?.pins.length ?? 0;
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);

  const handleDeleteFloor = (floorId: string, floorName: string) => {
    removeFloor(job.id, floorId);
    toast.success(`Floor "${floorName}" deleted`);
  };

  // Job deletion moved to the header job selector (with name-typing gate).

  return (
    <div className="flex w-full flex-col">
      {/* Job meta card */}
      <div className="border-b border-hairline p-4">
        <div className="flex items-start justify-between gap-2">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { renameJob(job.id, nameDraft.trim() || job.name); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full rounded-md border border-accent bg-elevated px-2 py-1 font-display text-base text-ink outline-none"
            />
          ) : (
            <h2 className="font-display text-base font-medium leading-tight text-ink">{job.name}</h2>
          )}
          {canPerform(role, "EDIT_JOB") && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditingName((v) => !v)}
                aria-label="Edit job name"
                className="grid h-6 w-6 place-items-center rounded text-ink-secondary transition-colors hover:text-accent"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 font-mono-data text-[11px] text-ink-secondary">
          Created {new Date(job.createdAt).toLocaleDateString()}
        </div>
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => updateJobDescription(job.id, descDraft.trim())}
          readOnly={!canPerform(role, "EDIT_JOB")}
          rows={2}
          className="mt-3 w-full resize-none rounded-md border border-hairline bg-elevated px-2 py-1.5 text-xs text-ink-secondary outline-none transition-colors focus:border-accent disabled:opacity-50"
        />

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono-data text-ink-secondary">{filled}/{total} pins</span>
            <span className="font-display text-accent">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full origin-left rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Floor tabs */}
      <div className="border-b border-hairline px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {job.floors.map((f) => (
            <div key={f.id} className="group relative flex items-center">
              <button
                onClick={() => setActiveFloor(f.id)}
                className={cn(
                  "relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  f.id === floor?.id
                    ? "bg-accent-soft text-accent"
                    : "text-ink-secondary hover:bg-elevated hover:text-ink",
                )}
              >
                {f.name}
                {f.pdfUrl ? (
                  <Check className="h-3 w-3 text-ok" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="No floor plan uploaded" />
                )}
                {f.id === floor?.id && <span className="absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full bg-accent" />}
              </button>
              {/* Delete floor button — visible on hover, only if more than 1 floor */}
              {job.floors.length > 1 && canPerform(role, "DELETE_FLOOR") && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      aria-label={`Delete floor ${f.name}`}
                      className="ml-0.5 grid h-5 w-5 place-items-center rounded-full text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete floor "{f.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this floor and its {f.pins.length} pin(s). This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteFloor(f.id, f.name)} className="bg-red-600 hover:bg-red-700">
                        Delete Floor
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
          {canPerform(role, "CREATE_FLOOR") && (
            addingFloor ? (
              <input
                autoFocus
                value={floorDraft}
                onChange={(e) => setFloorDraft(e.target.value)}
                onBlur={() => { if (floorDraft.trim()) addFloor(job.id, floorDraft.trim()); setAddingFloor(false); setFloorDraft(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="Floor name"
                className="w-24 rounded-full border border-accent bg-elevated px-2 py-1 text-xs outline-none"
              />
            ) : (
              <button
                onClick={() => setAddingFloor(true)}
                aria-label="Add floor"
                className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary transition-colors hover:bg-elevated hover:text-accent"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Pin list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {floor && floor.pins.length === 0 && (
          <div className="px-4 py-10 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full border border-dashed border-hairline text-ink-muted">
              {floor.pdfUrl ? <Plus className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
            </div>
            <p className="text-xs text-ink-secondary">
              {floor.pdfUrl
                ? "No pins yet — click the floor plan to place your first pin."
                : "Upload a floor plan PDF first, then you can place pins."}
            </p>
          </div>
        )}
        <ul className="space-y-0.5">
          {floor?.pins.map((p) => {
            const selected = p.id === selectedPinId;
            return (
              <li key={p.id}>
                <button
                  onClick={() => selectPin(p.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-accent-soft" : "hover:bg-elevated",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-1 left-0 w-[3px] rounded-full bg-accent transition-opacity",
                      selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                  />
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-5 w-5 flex-shrink-0 rounded-full object-cover ring-1 ring-ok" />
                  ) : (
                    <span className="grid h-5 w-5 flex-shrink-0 place-items-center">
                      <span className="h-2.5 w-2.5 rounded-full border border-accent bg-base pin-pulse" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{p.name}</span>
                    <span className="block font-mono-data text-[10px] text-ink-secondary">{formatTime(p.capturedAt)}</span>
                  </span>
                  <Camera className="h-3.5 w-3.5 text-ink-secondary opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Add Pin CTA */}
      {canPerform(role, "PLACE_PIN") && (
        <div className="border-t border-hairline p-3">
          <button
            onClick={() => togglePlacement(true)}
            disabled={!floor?.pdfUrl}
            title={!floor?.pdfUrl ? "Upload a floor plan first" : undefined}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2.5 text-sm font-medium transition-all",
              !floor?.pdfUrl
                ? "border-hairline text-ink-muted cursor-not-allowed opacity-50"
                : placementMode
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-hairline text-accent hover:border-solid hover:border-accent hover:bg-accent-soft",
            )}
          >
            <Plus className="h-4 w-4" /> Place New Pin
          </button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
