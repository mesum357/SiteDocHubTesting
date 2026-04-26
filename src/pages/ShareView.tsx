import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, Loader2, AlertTriangle, Maximize, Minus, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import PanoramaViewer from "@/components/site/PanoramaViewer";
import { getCachedPinPhoto } from "@/lib/db";
import { usePdfRenderer } from "@/hooks/usePdfRenderer";

interface SharePin {
  id: string;
  floor_id: string;
  name: string;
  x_pct: number;
  y_pct: number;
  pin_order: number;
  photo_path: string | null;
  note: string | null;
  photo_taken_at: string | null;
  photoUrl: string | null;
}

interface ShareFloor {
  id: string;
  label: string;
  floor_order: number;
  pdf_path: string | null;
  pdfUrl: string | null;
}

interface ShareJob {
  id: string;
  name: string;
  description: string;
  created_date: string;
}

type Status = "loading" | "ready" | "error" | "expired";

const formatTime = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
};

const ShareView = () => {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [job, setJob] = useState<ShareJob | null>(null);
  const [floors, setFloors] = useState<ShareFloor[]>([]);
  const [pins, setPins] = useState<SharePin[]>([]);
  const [activeFloorId, setActiveFloorId] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [viewerPin, setViewerPin] = useState<{ name: string; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pinCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{ dragging: boolean; startX: number; startY: number; startPanX: number; startPanY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });
  const activePanPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("No share token provided"); return; }

    let mounted = true;
    const localObjectUrls: string[] = [];

    const fetchData = async () => {
      try {
        // The share function reads token from URL path; call it directly.
        const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const supa = supabase as unknown as { supabaseUrl?: string };
        const supabaseUrl = supa.supabaseUrl || envUrl;
        const funcUrl = `${supabaseUrl}/functions/v1/share/${token}`;
        const response = await fetch(funcUrl);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 410) { setStatus("expired"); return; }
          throw new Error(data.error || "Failed to load shared job");
        }

        const rawPins: SharePin[] = data.pins || [];
        const pinsWithLocalFirst = await Promise.all(
          rawPins.map(async (pin) => {
            const localBlob = await getCachedPinPhoto(pin.id);
            if (localBlob) {
              const localUrl = URL.createObjectURL(localBlob);
              localObjectUrls.push(localUrl);
              return { ...pin, photoUrl: localUrl };
            }
            return pin;
          })
        );

        if (!mounted) return;
        setJob(data.job);
        setFloors(data.floors || []);
        setPins(pinsWithLocalFirst);
        setActiveFloorId(data.floors?.[0]?.id || "");
        setSelectedPinId(null);
        setStatus("ready");
      } catch (err: unknown) {
        if (!mounted) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      }
    };

    fetchData();

    return () => {
      mounted = false;
      localObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [token]);

  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const floorPins = pins.filter((p) => p.floor_id === activeFloorId);
  const totalFilled = pins.filter((p) => p.photoUrl).length;
  const {
    imageUrl: floorMapImageUrl,
    loading: floorMapLoading,
    error: floorMapError,
  } = usePdfRenderer(activeFloor?.pdfUrl || undefined);

  useEffect(() => {
    if (!floorPins.length) {
      setSelectedPinId(null);
      return;
    }
    setSelectedPinId((current) => {
      if (current && floorPins.some((p) => p.id === current)) return current;
      return floorPins[0].id;
    });
  }, [activeFloorId, floorPins]);

  useEffect(() => {
    if (!selectedPinId) return;
    const node = pinCardRefs.current[selectedPinId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedPinId]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activeFloorId]);

  const handleShareMapWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    // Prefer pinch/trackpad-style zoom (ctrlKey on many browsers), but also support
    // deliberate mouse-wheel zoom while cursor is over the map.
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    setZoom((z) => {
      const next = z - delta * 0.08;
      return Math.min(2.5, Math.max(0.5, +next.toFixed(2)));
    });
  };

  const clampPan = (valueX: number, valueY: number) => {
    const el = mapViewportRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const maxX = Math.max((rect.width * (zoom - 1)) / 2, 0);
    const maxY = Math.max((rect.height * (zoom - 1)) / 2, 0);
    return {
      x: Math.max(-maxX, Math.min(maxX, valueX)),
      y: Math.max(-maxY, Math.min(maxY, valueY)),
    };
  };

  const handleMapPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    activePanPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    panStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleMapPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePanPointerIdRef.current !== e.pointerId || !panStateRef.current.dragging) return;
    const dx = e.clientX - panStateRef.current.startX;
    const dy = e.clientY - panStateRef.current.startY;
    setPan(clampPan(panStateRef.current.startPanX + dx, panStateRef.current.startPanY + dy));
  };

  const handleMapPanEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePanPointerIdRef.current !== e.pointerId) return;
    activePanPointerIdRef.current = null;
    panStateRef.current.dragging = false;
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base text-ink">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="mt-4 font-display text-sm text-ink-secondary">Loading shared job…</p>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base text-ink">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <h1 className="mt-4 font-display text-xl">Link Expired</h1>
        <p className="mt-2 text-sm text-ink-secondary">This share link has expired. Ask the sender for a new one.</p>
      </div>
    );
  }

  if (status === "error" || !job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base text-ink">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <h1 className="mt-4 font-display text-xl">Link Not Found</h1>
        <p className="mt-2 text-sm text-ink-secondary">{errorMsg || "This share link is invalid."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-surface/80 backdrop-blur-md px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent shadow-[0_4px_16px_-4px_hsl(var(--accent)/0.6)]">
            <Camera size={14} className="text-white" />
          </div>
          <span className="font-display text-sm font-semibold tracking-tight !text-white">Sitedochub</span>
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-secondary">Read-only</span>
        </div>
        <div className="text-xs text-ink-secondary font-mono-data">
          {totalFilled}/{pins.length} pins captured
        </div>
      </header>

      {/* Job info */}
      <div className="border-b border-hairline bg-surface px-4 py-4 md:px-6">
        <h1 className="font-display text-xl font-medium text-ink">{job.name}</h1>
        {job.description && <p className="mt-1 text-sm text-ink-secondary">{job.description}</p>}
        <p className="mt-1 font-mono-data text-[11px] text-ink-muted">Created {job.created_date}</p>
      </div>

      {/* Floor tabs */}
      <div className="border-b border-hairline bg-surface px-4 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFloorId(f.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                f.id === activeFloorId ? "bg-accent-soft text-accent" : "text-ink-secondary hover:bg-elevated",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floor map + pin list */}
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
          <div className="rounded-lg border border-hairline bg-surface p-3">
            {!activeFloor?.pdfUrl ? (
              <div className="grid h-[420px] place-items-center rounded-md bg-elevated text-center text-sm text-ink-secondary">
                <div>
                  <p className="font-display text-ink">No floor map available</p>
                  <p className="mt-1 text-xs text-ink-secondary">This floor has no uploaded blueprint.</p>
                </div>
              </div>
            ) : floorMapLoading ? (
              <div className="grid h-[420px] place-items-center rounded-md bg-elevated text-center text-sm text-ink-secondary">
                <div>
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent" />
                  <p className="mt-2 font-display text-ink">Rendering floor map…</p>
                </div>
              </div>
            ) : floorMapError || !floorMapImageUrl ? (
              <div className="grid h-[420px] place-items-center rounded-md bg-elevated text-center text-sm text-ink-secondary">
                <div>
                  <p className="font-display text-ink">Failed to render floor map</p>
                  <p className="mt-1 text-xs text-ink-secondary">{floorMapError ?? "Try again later."}</p>
                </div>
              </div>
            ) : (
              <div
                ref={mapViewportRef}
                className="relative h-[420px] overflow-hidden rounded-md bg-elevated"
                data-testid="share-floor-map"
                onWheel={handleShareMapWheel}
                onPointerDown={handleMapPanStart}
                onPointerMove={handleMapPanMove}
                onPointerUp={handleMapPanEnd}
                onPointerCancel={handleMapPanEnd}
              >
                <div
                  className={cn("relative h-full w-full", zoom > 1 && "cursor-grab active:cursor-grabbing touch-none")}
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
                >
                  <img
                    src={floorMapImageUrl}
                    alt={`${activeFloor.label} map`}
                    className="absolute inset-0 h-full w-full object-contain"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                  />

                  <svg viewBox="0 0 1000 700" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
                    {floorPins.map((pin) => {
                      const cx = pin.x_pct * 1000;
                      const cy = pin.y_pct * 700;
                      const selected = pin.id === selectedPinId;
                      return (
                        <g
                          key={pin.id}
                          transform={`translate(${cx} ${cy})`}
                          className="cursor-pointer"
                          data-testid={`share-map-marker-${pin.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPinId(pin.id);
                          }}
                          style={{ transition: "transform 180ms cubic-bezier(0.4,0,0.2,1)" }}
                        >
                          <g transform={`scale(${selected ? 1.25 : 1})`}>
                            <circle
                              r="11"
                              fill={pin.photoUrl ? "hsl(var(--green))" : "hsl(var(--bg-base))"}
                              stroke={selected ? "hsl(var(--accent))" : "hsl(var(--hairline))"}
                              strokeWidth={selected ? 3 : 2}
                            />
                            {pin.photoUrl ? (
                              <path
                                d="M -4 0 L -1 3 L 4 -3"
                                fill="none"
                                stroke="hsl(var(--bg-base))"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ) : (
                              <circle r="3" fill="hsl(var(--accent))" />
                            )}
                          </g>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border border-hairline bg-elevated/90 px-1.5 py-1 shadow-xl">
                  <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-elevated hover:text-accent">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 font-mono-data text-[11px] text-ink-secondary tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))} aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-elevated hover:text-accent">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setZoom(1)} aria-label="Reset zoom" className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-elevated hover:text-accent">
                    <Maximize className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-hairline bg-surface">
            <div className="border-b border-hairline px-3 py-2">
              <p className="font-display text-sm text-ink">Pins on {activeFloor?.label ?? "floor"}</p>
            </div>
            {floorPins.length === 0 ? (
              <div className="py-16 text-center text-sm text-ink-secondary">No pins on this floor.</div>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                {floorPins.map((pin) => {
                  const selected = pin.id === selectedPinId;
                  return (
                    <div
                      key={pin.id}
                      data-testid={`share-pin-card-${pin.id}`}
                      data-pin-id={pin.id}
                      data-selected={selected ? "true" : "false"}
                      ref={(node) => {
                        pinCardRefs.current[pin.id] = node;
                      }}
                      onClick={() => setSelectedPinId(pin.id)}
                      className={cn(
                        "group cursor-pointer overflow-hidden rounded-lg border border-hairline bg-surface transition-shadow hover:shadow-lg",
                        selected && "border-accent shadow-[0_0_0_1px_hsl(var(--accent))]"
                      )}
                    >
                      {pin.photoUrl ? (
                        <div className="relative">
                          <img src={pin.photoUrl} alt={pin.name} className="h-36 w-full object-cover" />
                          <div className="absolute inset-0 grid place-items-center bg-base/60 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewerPin({ name: pin.name, url: pin.photoUrl! });
                              }}
                              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-display text-accent-foreground"
                            >
                              <Maximize className="h-3.5 w-3.5" /> View 360°
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid h-28 place-items-center bg-elevated">
                          <div className="text-center">
                            <Camera className="mx-auto h-6 w-6 text-ink-muted" />
                            <p className="mt-2 text-[11px] text-ink-secondary">No preview available yet</p>
                          </div>
                        </div>
                      )}
                      <div className="p-3">
                        <div className="font-display text-sm font-medium text-ink">{pin.name}</div>
                        <div className="mt-1 font-mono-data text-[10px] text-ink-secondary">{formatTime(pin.photo_taken_at)}</div>
                        {pin.note && (
                          <div className="mt-2 rounded-md bg-elevated p-2 text-xs text-ink-secondary whitespace-pre-wrap">{pin.note}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-hairline py-4 text-center text-[11px] text-ink-muted">
        Sitedochub — Halsell Builders — Read-only view
      </footer>

      {/* 360° viewer */}
      {viewerPin && (
        <PanoramaViewer
          photoUrl={viewerPin.url}
          pinName={viewerPin.name}
          onClose={() => setViewerPin(null)}
        />
      )}
    </div>
  );
};

export default ShareView;
