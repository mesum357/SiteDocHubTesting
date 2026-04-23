import { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, Maximize, Pencil, Upload, Wifi, X } from "lucide-react";
import { useActiveFloor, useActiveJob, useAppStore, useSelectedPin } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  tabletOverlay?: boolean;
}

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(",", "");
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const PinDetailPanel = ({ tabletOverlay = false }: Props) => {
  const job = useActiveJob();
  const floor = useActiveFloor();
  const pin = useSelectedPin();
  const renamePin = useAppStore((s) => s.renamePin);
  const attachPhoto = useAppStore((s) => s.attachPhoto);
  const updatePinNotes = useAppStore((s) => s.updatePinNotes);
  const selectPin = useAppStore((s) => s.selectPin);
  const cameraConnected = useAppStore((s) => s.cameraConnected);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesFocused, setNotesFocused] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(pin?.name ?? "");
    setNotesDraft(pin?.notes ?? "");
    setEditingName(false);
  }, [pin?.id]);

  // Tablet overlay: only render when a pin is selected and viewport is md..lg-1
  const showTablet = tabletOverlay && pin;

  if (tabletOverlay && !pin) return null;

  const filename = pin && floor
    ? `${new Date(pin.capturedAt ?? Date.now()).toISOString().slice(2,10).replace(/-/g, "-")}-${slugify(job.name)}-${slugify(pin.name)}.insp`
    : "";

  const triggerCapture = () => {
    if (!pin || !floor) return;
    setCapturing(true);
    setTimeout(() => {
      attachPhoto(job.id, floor.id, pin.id, `https://picsum.photos/seed/${pin.id}-${Date.now()}/600/400`);
      setCapturing(false);
      toast.success(`Photo saved to ${pin.name}`);
    }, 1100);
  };

  const handleFile = (file: File) => {
    if (!pin || !floor) return;
    const url = URL.createObjectURL(file);
    attachPhoto(job.id, floor.id, pin.id, url);
    toast.success(`Photo saved to ${pin.name}`);
  };

  const empty = !pin;

  const content = (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-hairline p-4">
        {empty ? (
          <div>
            <div className="font-display text-sm text-ink">Pin Details</div>
            <div className="mt-1 text-xs text-ink-secondary">Select a pin to view its photo and notes.</div>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => { renamePin(job.id, floor!.id, pin!.id, nameDraft.trim() || pin!.name); setEditingName(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full rounded-md border border-accent bg-elevated px-2 py-1 font-display text-base text-ink outline-none"
                />
              ) : (
                <button onClick={() => setEditingName(true)} className="group flex items-center gap-2 text-left">
                  <span className="font-display text-base text-ink">{pin!.name}</span>
                  <Pencil className="h-3.5 w-3.5 text-ink-secondary opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
              <div className="mt-2">
                {pin!.photoUrl ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">
                    <Check className="h-3 w-3" /> Photo Captured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent px-2 py-0.5 text-[10px] font-medium text-accent">
                    No Photo
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => selectPin(null)} aria-label="Close panel" className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-elevated hover:text-accent">
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {!empty && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Photo zone */}
          {pin!.photoUrl ? (
            <div className="group relative overflow-hidden rounded-lg border border-hairline">
              <img src={pin!.photoUrl} alt={pin!.name} className="h-48 w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center bg-base/70 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-xs font-display text-accent-foreground" onClick={() => toast.info("360° viewer coming soon")}>
                  <Maximize className="h-3.5 w-3.5" /> View Full 360°
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-base to-transparent p-2">
                <div className="font-mono-data text-[10px] text-ink-secondary">Taken: {formatTime(pin!.capturedAt)}</div>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className={cn(
                "grid h-44 place-items-center rounded-lg border-2 border-dashed transition-all",
                dragOver ? "border-accent bg-accent-soft shadow-[inset_0_0_0_1px_hsl(var(--accent))]" : "border-hairline hover:border-accent",
              )}
            >
              <div className="text-center">
                <Camera className="mx-auto h-8 w-8 text-accent" />
                <div className="mt-2 text-xs text-ink-secondary">{dragOver ? "Drop photo here" : "No photo yet"}</div>
              </div>
            </div>
          )}

          {/* Camera CTA */}
          <button
            onClick={triggerCapture}
            disabled={capturing}
            className={cn(
              "lift-on-hover flex h-12 w-full items-center justify-center gap-2 rounded-md font-display text-sm transition-all active:scale-[0.98]",
              cameraConnected
                ? "bg-accent text-accent-foreground"
                : "border border-accent bg-transparent text-accent hover:bg-accent-soft",
              capturing && "opacity-80",
            )}
            title={cameraConnected ? "" : "Connect to INSTA360_XXXXXX WiFi first"}
          >
            {capturing ? (
              <><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Triggering shutter…</>
            ) : (
              <>📷 Capture with Insta360</>
            )}
          </button>

          {/* Camera status */}
          <div className="flex items-center justify-between rounded-md border border-hairline bg-elevated px-3 py-2 text-[11px]">
            <div className="flex items-center gap-2">
              <Wifi className={cn("h-3.5 w-3.5", cameraConnected ? "text-ok" : "text-accent")} />
              <span className="text-ink-secondary">
                {cameraConnected ? "Camera connected" : "Connect to camera WiFi in Settings"}
              </span>
            </div>
            <button onClick={() => fileRef.current?.click()} className="font-medium text-accent hover:underline">
              <Upload className="mr-1 inline h-3 w-3" /> Upload
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block font-display text-[11px] uppercase tracking-wider text-ink-secondary">Notes</label>
            <div className="relative">
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onFocus={() => setNotesFocused(true)}
                onBlur={() => { setNotesFocused(false); updatePinNotes(job.id, floor!.id, pin!.id, notesDraft); }}
                rows={4}
                placeholder="Field notes…"
                className={cn(
                  "w-full resize-none rounded-md border bg-elevated px-3 py-2 text-sm text-ink outline-none transition-all",
                  notesFocused ? "border-accent shadow-[0_0_0_3px_hsl(var(--accent)/0.18)]" : "border-hairline",
                )}
              />
              {notesFocused && (
                <span className="pointer-events-none absolute bottom-2 right-3 font-mono-data text-[10px] text-ink-secondary">
                  {notesDraft.length}
                </span>
              )}
            </div>
          </div>

          {/* Filename */}
          <div className="rounded-md border border-hairline bg-elevated p-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate font-mono-data text-[11px] text-ink-secondary">{filename}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(filename); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                aria-label="Copy filename"
                className="grid h-6 w-6 place-items-center rounded text-ink-secondary hover:text-accent"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (tabletOverlay) {
    // Only show on md..lg (768..1023) — hidden on lg+ (desktop has fixed column) and on mobile (uses bottom sheet)
    return (
      <div className="fixed inset-0 z-30 hidden md:flex lg:hidden bg-base/60 backdrop-blur-sm" onClick={() => selectPin(null)}>
        <div
          className="ml-auto flex h-full w-[360px] max-w-[90vw] flex-col border-l border-hairline bg-surface animate-slide-in-right"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return <div className="flex h-full w-full">{content}</div>;
};

export default PinDetailPanel;
