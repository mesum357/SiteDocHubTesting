import { useEffect, useRef, useState } from "react";
import { Check, FileUp, Minus, Plus, Maximize2, Loader2 } from "lucide-react";
import { useActiveFloor, useActiveJob, useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { canPerform } from "@/lib/permissions";
import { preloadPdfRender, usePdfRenderer } from "@/hooks/usePdfRenderer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── PDF UPLOAD ZONE ────────────────────────────────────────────────────────
interface UploadZoneProps {
  jobId: string;
  floorId: string;
  floorName: string;
}

const PdfUploadZone = ({ jobId, floorId, floorName }: UploadZoneProps) => {
  const uploadFloorPdf = useAppStore((s) => s.uploadFloorPdf);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50MB)");
      return;
    }

    setUploading(true);
    setProgress(0);

    // Simulate progress (actual upload is single-shot)
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 15, 85));
    }, 200);

    try {
      await uploadFloorPdf(jobId, floorId, file);
      clearInterval(interval);
      setProgress(100);
      toast.success(`Floor plan uploaded for ${floorName}`);
    } catch (err) {
      clearInterval(interval);
      console.error("[SiteDocHB] Upload failed:", err);
      toast.error("Upload failed — please try again");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div
      data-testid="floor-plan-root"
      data-floor-plan-state="upload-pdf"
      className="relative h-full w-full blueprint-grid grid place-items-center"
    >
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => !uploading && fileRef.current?.click()}
        className={cn(
          "group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-all cursor-pointer",
          "w-[min(90%,480px)] aspect-[4/3]",
          uploading
            ? "border-accent bg-accent-soft/30 cursor-wait"
            : dragOver
              ? "border-accent bg-accent-soft/40 shadow-[0_0_40px_-8px_hsl(var(--accent)/0.4)] scale-[1.02]"
              : "border-hairline hover:border-accent hover:bg-elevated/50 hover:shadow-lg",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-10 w-10 text-accent animate-spin" />
            <div className="text-center">
              <p className="font-display text-sm text-ink">Uploading floor plan…</p>
              <div className="mt-3 mx-auto w-48 h-1.5 rounded-full bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 font-mono-data text-[11px] text-ink-secondary">{progress}%</p>
            </div>
          </>
        ) : (
          <>
            <div className={cn(
              "grid h-16 w-16 place-items-center rounded-2xl border transition-all",
              dragOver
                ? "border-accent bg-accent-soft text-accent shadow-[0_0_24px_-4px_hsl(var(--accent)/0.5)]"
                : "border-hairline bg-elevated text-ink-secondary group-hover:border-accent group-hover:text-accent",
            )}>
              <FileUp className="h-7 w-7" />
            </div>
            <div className="text-center">
              <p className="font-display text-sm text-ink">
                Upload Floor Plan
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                Drag & drop a PDF here, or click to browse
              </p>
              <p className="mt-2 font-mono-data text-[10px] text-ink-muted">
                PDF up to 50MB • First page will be used as the blueprint
              </p>
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = ""; // reset so same file can be re-selected
          }}
        />
      </div>

      {/* Floor badge */}
      <div className="absolute left-4 bottom-4 rounded-md border border-hairline bg-elevated/80 backdrop-blur px-3 py-1.5">
        <div className="font-display text-xs text-ink">{floorName}</div>
        <div className="font-mono-data text-[10px] text-ink-secondary">No blueprint uploaded</div>
      </div>
    </div>
  );
};

// ─── FLOOR PLAN CANVAS ─────────────────────────────────────────────────────────

const FloorPlanCanvas = () => {
  const job = useActiveJob();
  const floor = useActiveFloor();
  const selectedPinId = useAppStore((s) => s.selectedPinId);
  const selectPin = useAppStore((s) => s.selectPin);
  const placementMode = useAppStore((s) => s.placementMode);
  const togglePlacement = useAppStore((s) => s.togglePlacement);
  const addPin = useAppStore((s) => s.addPin);
  const role = useAuthStore((s) => s.role);
  const isMobile = useIsMobile();

  const {
    imageUrl: pdfImageUrl,
    loading: pdfLoading,
    error: pdfError,
    dimensions: pdfDimensions,
  } = usePdfRenderer(floor?.pdfUrl);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [imageRect, setImageRect] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [baseImageRect, setBaseImageRect] = useState({ left: 0, top: 0, width: 1, height: 1 });

  useEffect(() => { setDraftPin(null); }, [floor?.id, job?.id]);
  useEffect(() => { setHover(null); }, [floor?.id]);
  useEffect(() => {
    if (!job) return;
    void Promise.all(job.floors.map((f) => preloadPdfRender(f.pdfUrl)));
  }, [job]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const computeContainedRect = () => {
      const bounds = el.getBoundingClientRect();
      const cw = Math.max(bounds.width, 1);
      const ch = Math.max(bounds.height, 1);
      const iw = Math.max(pdfDimensions.width, 1);
      const ih = Math.max(pdfDimensions.height, 1);

      const containerAspect = cw / ch;
      const imageAspect = iw / ih;

      let width = cw;
      let height = ch;
      let left = 0;
      let top = 0;

      if (imageAspect > containerAspect) {
        width = cw;
        height = cw / imageAspect;
        top = (ch - height) / 2;
      } else {
        height = ch;
        width = ch * imageAspect;
        left = (cw - width) / 2;
      }

      const baseRect = {
        left,
        top,
        width: Math.max(width, 1),
        height: Math.max(height, 1),
      };
      setBaseImageRect(baseRect);
      setImageRect({
        left: baseRect.left * zoom,
        top: baseRect.top * zoom,
        width: baseRect.width * zoom,
        height: baseRect.height * zoom,
      });
    };

    computeContainedRect();
    const ro = new ResizeObserver(() => computeContainedRect());
    ro.observe(el);

    return () => ro.disconnect();
  }, [pdfDimensions.width, pdfDimensions.height, zoom]);

  // Empty state — no job selected
  if (!job || !floor) {
    return (
      <div
        data-testid="floor-plan-root"
        data-floor-plan-state="empty"
        className="relative h-full w-full blueprint-grid grid place-items-center"
      >
        <div className="text-center px-6">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full border border-dashed border-hairline text-ink-muted">
            <Maximize2 className="h-6 w-6" />
          </div>
          <p className="font-display text-sm text-ink">No floor plan loaded</p>
          <p className="mt-1 text-xs text-ink-secondary">Create a job and select a floor to begin.</p>
        </div>
      </div>
    );
  }

  // No PDF uploaded — show upload zone or empty state
  if (!floor.pdfUrl) {
    if (canPerform(role, "CREATE_FLOOR")) {
      return <PdfUploadZone jobId={job.id} floorId={floor.id} floorName={floor.name} />;
    }
    return (
      <div
        data-testid="floor-plan-root"
        data-floor-plan-state="no-pdf"
        className="relative h-full w-full blueprint-grid grid place-items-center"
      >
        <div className="text-center px-6">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full border border-dashed border-hairline text-ink-muted">
            <Maximize2 className="h-6 w-6" />
          </div>
          <p className="font-display text-sm text-ink">No floor plan uploaded</p>
          <p className="mt-1 text-xs text-ink-secondary">An Office Worker needs to upload the blueprint first.</p>
        </div>
      </div>
    );
  }

  // PDF is loading and no already-rendered frame is available yet.
  if (pdfLoading && !pdfImageUrl) {
    return (
      <div
        data-testid="floor-plan-root"
        data-floor-plan-state="loading"
        className="relative h-full w-full blueprint-grid grid place-items-center"
      >
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 text-accent animate-spin" />
          <p className="mt-3 font-display text-sm text-ink">Rendering floor plan…</p>
        </div>
      </div>
    );
  }

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!placementMode || !floor) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // Map click against the actual visible PDF area (object-contain), not full container.
    const px = localX - imageRect.left;
    const py = localY - imageRect.top;
    if (px < 0 || py < 0 || px > imageRect.width || py > imageRect.height) {
      return;
    }

    // Normalize against unscaled image space so pin coordinates remain stable across zoom.
    const x = (px / Math.max(zoom, 0.001)) / baseImageRect.width;
    const y = (py / Math.max(zoom, 0.001)) / baseImageRect.height;

    setDraftPin({ x, y });
  };

  return (
    <div
      data-testid="floor-plan-root"
      data-floor-plan-state="ready"
      className={cn(
        "relative h-full w-full blueprint-grid",
        isMobile && "pb-20"
      )}
    >
      <div
        key={floor.id}
        ref={containerRef}
        onClick={handleCanvasClick}
        className={cn(
          "relative mx-auto h-full w-full transition-all",
          placementMode && "cursor-crosshair shadow-[inset_0_0_0_2px_hsl(var(--accent))]",
        )}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
        data-testid="floor-plan-canvas"
      >
        {/* Rendered PDF as background image */}
        {pdfImageUrl && !pdfError ? (
          <img
            src={pdfImageUrl}
            alt="Floor plan"
            className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        ) : pdfError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/20 pointer-events-none">
            <p className="font-display font-medium text-ink">Failed to render floor plan</p>
            <p className="mt-1 text-xs text-ink-secondary">{pdfError}</p>
            <p className="mt-2 text-xs text-ink-muted">You can still tap anywhere to place a pin.</p>
          </div>
        ) : null}

        {/* Pin overlay aligned to the actual rendered PDF rectangle */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${imageRect.left}px`,
            top: `${imageRect.top}px`,
            width: `${imageRect.width}px`,
            height: `${imageRect.height}px`,
          }}
        >
          <svg
            key={floor.id}
            viewBox={`0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
            className="h-full w-full"
            preserveAspectRatio="none"
          >
          {floor?.pins.map((p) => {
            const cx = p.x * pdfDimensions.width;
            const cy = p.y * pdfDimensions.height;
            const filled = !!p.photoUrl;
            const selected = p.id === selectedPinId;
            return (
              <g
                key={p.id}
                data-testid={`floor-map-marker-${p.id}`}
                transform={`translate(${cx} ${cy})`}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
                onClick={(e) => { e.stopPropagation(); selectPin(p.id); }}
                style={{ transition: "transform 180ms cubic-bezier(0.4,0,0.2,1)" }}
              >
                <g transform={`scale(${selected ? 1.3 : hover === p.id ? 1.15 : 1})`}>
                  {filled ? (
                    <>
                      <circle r="11" fill="hsl(var(--green))" stroke={selected ? "hsl(var(--accent))" : "hsl(var(--bg-base))"} strokeWidth={selected ? 3 : 2} />
                      <path d="M -4 0 L -1 3 L 4 -3" fill="none" stroke="hsl(var(--bg-base))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  ) : (
                    <>
                      <circle r="11" fill="hsl(var(--bg-base))" stroke="hsl(var(--accent))" strokeWidth={selected ? 3 : 2} />
                      <circle r="3" fill="hsl(var(--accent))" />
                      {!selected && (
                        <circle r="11" fill="none" stroke="hsl(var(--accent))" strokeWidth="2" opacity="0.4">
                          <animate attributeName="r" from="11" to="22" dur="1.6s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.5" to="0" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </>
                  )}
                </g>
              </g>
            );
          })}
          </svg>
        </div>

        {pdfLoading && (
          <div className="absolute inset-0 grid place-items-center bg-base/25 backdrop-blur-[1px] pointer-events-none">
            <div className="flex items-center gap-2 rounded-full border border-hairline bg-elevated/90 px-3 py-1.5 text-xs text-ink-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Rendering floor...
            </div>
          </div>
        )}

        {/* Hover tooltip */}
        {hover && floor && (() => {
          const p = floor.pins.find((x) => x.id === hover);
          if (!p) return null;
          return (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[140%] rounded-md border border-hairline bg-elevated px-2.5 py-1 text-xs text-ink shadow-lg animate-fade-up"
              style={{
                left: `${imageRect.left + p.x * imageRect.width}px`,
                top: `${imageRect.top + p.y * imageRect.height}px`,
              }}
            >
              <div className="font-display">{p.name}</div>
              <div className="font-mono-data text-[10px] text-ink-secondary">{p.photoUrl ? "1 photo" : "no photo"}</div>
            </div>
          );
        })()}

        {/* Inline draft pin name popover */}
        {draftPin && (
          <div
            className="absolute z-20 -translate-x-1/2 translate-y-3 rounded-lg border border-accent bg-elevated p-2 shadow-2xl animate-scale-in"
            style={{
              left: `${imageRect.left + draftPin.x * imageRect.width}px`,
              top: `${imageRect.top + draftPin.y * imageRect.height}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (floor) {
                    const finalName = draftName.trim() || "New Pin";
                    addPin(job.id, floor.id, {
                      name: finalName,
                      x: draftPin.x,
                      y: draftPin.y,
                    });
                    toast.success(`Pin "${finalName}" placed`);
                  }
                  setDraftPin(null);
                  setDraftName("");
                }
                if (e.key === "Escape") {
                  setDraftPin(null);
                  setDraftName("");
                }
              }}
              placeholder="Pin name…"
              className="w-44 rounded bg-base px-2 py-1 text-sm text-ink outline-none"
            />
          </div>
        )}
      </div>

      {/* Cancel placement hint */}
      {placementMode && !draftPin && (
        <button
          onClick={() => togglePlacement(false)}
          className="absolute left-4 top-4 rounded-md border border-hairline bg-elevated px-3 py-1.5 text-xs text-ink-secondary hover:border-accent hover:text-accent"
        >
          Cancel placement
        </button>
      )}

      {/* Zoom controls */}
      <div
        className={cn(
          "absolute right-4 z-10 flex items-center gap-1 rounded-full border border-hairline glass px-1.5 py-1 shadow-xl",
          isMobile ? "bottom-16" : "bottom-4"
        )}
      >
        <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-elevated hover:text-accent">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 font-mono-data text-[11px] text-ink-secondary tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))} aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-elevated hover:text-accent">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setZoom(1)} aria-label="Reset zoom" className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-elevated hover:text-accent">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Floor badge */}
      <div className={cn("absolute left-4 rounded-md border border-hairline bg-elevated/80 backdrop-blur px-3 py-1.5", isMobile ? "bottom-16" : "bottom-4")}>
        <div className="font-display text-xs text-ink">{floor?.name}</div>
        <div className="font-mono-data text-[10px] text-ink-secondary">{floor?.pins.filter(p => p.photoUrl).length}/{floor?.pins.length} captured</div>
      </div>
    </div>
  );
};

export default FloorPlanCanvas;
