import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Maximize2 } from "lucide-react";
import { useActiveFloor, useActiveJob, useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FloorPlanSVG = () => (
  // Mock floor plan rendered as SVG (PDF.js-ready: replace with <canvas> later)
  <svg viewBox="0 0 1000 700" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--border-color))" strokeWidth="1" />
      </pattern>
    </defs>
    {/* outer walls */}
    <rect x="60" y="60" width="880" height="580" fill="hsl(var(--bg-surface) / 0.4)" stroke="hsl(var(--text-secondary) / 0.7)" strokeWidth="3" />
    {/* interior walls */}
    <line x1="60" y1="280" x2="500" y2="280" stroke="hsl(var(--text-secondary) / 0.5)" strokeWidth="2" />
    <line x1="500" y1="60" x2="500" y2="420" stroke="hsl(var(--text-secondary) / 0.5)" strokeWidth="2" />
    <line x1="500" y1="420" x2="940" y2="420" stroke="hsl(var(--text-secondary) / 0.5)" strokeWidth="2" />
    <line x1="240" y1="280" x2="240" y2="640" stroke="hsl(var(--text-secondary) / 0.5)" strokeWidth="2" />
    <line x1="720" y1="60" x2="720" y2="420" stroke="hsl(var(--text-secondary) / 0.5)" strokeWidth="2" />
    {/* hatched stairwell */}
    <rect x="460" y="60" width="80" height="140" fill="url(#hatch)" stroke="hsl(var(--text-secondary) / 0.5)" />
    {/* room labels */}
    <g fill="hsl(var(--text-muted))" fontFamily="DM Mono, monospace" fontSize="11" textAnchor="middle">
      <text x="280" y="180">UNIT 1A</text>
      <text x="610" y="240">UNIT 1B</text>
      <text x="380" y="500">CORRIDOR</text>
      <text x="830" y="540">MECH</text>
      <text x="150" y="500">LOBBY</text>
    </g>
  </svg>
);

const FloorPlanCanvas = () => {
  const job = useActiveJob();
  const floor = useActiveFloor();
  const selectedPinId = useAppStore((s) => s.selectedPinId);
  const selectPin = useAppStore((s) => s.selectPin);
  const placementMode = useAppStore((s) => s.placementMode);
  const togglePlacement = useAppStore((s) => s.togglePlacement);
  const addPin = useAppStore((s) => s.addPin);
  const renamePin = useAppStore((s) => s.renamePin);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draftName, setDraftName] = useState("");

  useEffect(() => { setDraftPin(null); }, [floor?.id, job.id]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!placementMode || !floor) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const id = addPin(job.id, floor.id, { name: `Pin ${floor.pins.length + 1}`, x, y });
    setDraftPin({ id, x, y });
    setDraftName(`Pin ${floor.pins.length + 1}`);
  };

  return (
    <div className="relative h-full w-full blueprint-grid">
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className={cn(
          "relative mx-auto h-full w-full transition-all",
          placementMode && "cursor-crosshair shadow-[inset_0_0_0_2px_hsl(var(--accent))]",
        )}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
      >
        <FloorPlanSVG />

        {/* Pin overlay */}
        <svg viewBox="0 0 1000 700" className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="xMidYMid meet">
          {floor?.pins.map((p) => {
            const cx = p.x * 1000;
            const cy = p.y * 700;
            const filled = !!p.photoUrl;
            const selected = p.id === selectedPinId;
            return (
              <g
                key={p.id}
                transform={`translate(${cx} ${cy})`}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
                onClick={(e) => { e.stopPropagation(); selectPin(p.id); }}
                style={{ transition: "transform 180ms cubic-bezier(0.4,0,0.2,1)", transform: `translate(${cx}px, ${cy}px) scale(${selected ? 1.3 : hover === p.id ? 1.15 : 1})` }}
              >
                {filled ? (
                  <>
                    <circle r="11" fill="hsl(var(--green))" stroke={selected ? "hsl(var(--accent))" : "hsl(var(--bg-base))"} strokeWidth={selected ? 3 : 2} />
                    <path d="M -4 0 L -1 3 L 4 -3" fill="none" stroke="hsl(var(--bg-base))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ) : (
                  <>
                    <circle r="11" fill="hsl(var(--bg-base))" stroke="hsl(var(--accent))" strokeWidth={selected ? 3 : 2} className={!selected ? "" : ""} />
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
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hover && floor && (() => {
          const p = floor.pins.find((x) => x.id === hover);
          if (!p) return null;
          return (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[140%] rounded-md border border-hairline bg-elevated px-2.5 py-1 text-xs text-ink shadow-lg animate-fade-up"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
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
            style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (floor) renamePin(job.id, floor.id, draftPin.id, draftName.trim() || "New Pin");
                  toast.success(`Pin "${draftName}" placed`);
                  setDraftPin(null);
                }
                if (e.key === "Escape") setDraftPin(null);
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
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full border border-hairline glass px-1.5 py-1 shadow-xl">
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
      <div className="absolute left-4 bottom-4 rounded-md border border-hairline bg-elevated/80 backdrop-blur px-3 py-1.5">
        <div className="font-display text-xs text-ink">{floor?.name}</div>
        <div className="font-mono-data text-[10px] text-ink-secondary">{floor?.pins.filter(p => p.photoUrl).length}/{floor?.pins.length} captured</div>
      </div>
    </div>
  );
};

export default FloorPlanCanvas;
