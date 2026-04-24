import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, Loader2, AlertTriangle, Maximize } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import PanoramaViewer from "@/components/site/PanoramaViewer";

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
  const [viewerPin, setViewerPin] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("No share token provided"); return; }

    const fetchData = async () => {
      try {
        const res = await supabase.functions.invoke("share", {
          body: null,
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        // The share function reads token from URL path, so we call it differently
        // Use a direct fetch to the function URL with the token
        const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
        const funcUrl = `${supabaseUrl}/functions/v1/share/${token}`;
        const response = await fetch(funcUrl);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 410) { setStatus("expired"); return; }
          throw new Error(data.error || "Failed to load shared job");
        }

        setJob(data.job);
        setFloors(data.floors || []);
        setPins(data.pins || []);
        setActiveFloorId(data.floors?.[0]?.id || "");
        setStatus("ready");
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "Something went wrong");
      }
    };

    fetchData();
  }, [token]);

  const activeFloor = floors.find((f) => f.id === activeFloorId);
  const floorPins = pins.filter((p) => p.floor_id === activeFloorId);
  const totalFilled = pins.filter((p) => p.photoUrl).length;

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
          <div className="grid h-7 w-7 place-items-center rounded-md bg-accent shadow-[0_4px_16px_-4px_hsl(var(--accent)/0.6)]">
            <div className="h-3 w-3 rounded-sm bg-base" />
          </div>
          <span className="font-display text-sm font-medium text-ink">SiteDocHB</span>
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

      {/* Pin grid */}
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {floorPins.length === 0 ? (
          <div className="py-16 text-center text-sm text-ink-secondary">No pins on this floor.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {floorPins.map((pin) => (
              <div key={pin.id} className="group overflow-hidden rounded-lg border border-hairline bg-surface transition-shadow hover:shadow-lg">
                {pin.photoUrl ? (
                  <div className="relative">
                    <img src={pin.photoUrl} alt={pin.name} className="h-48 w-full object-cover" />
                    <div className="absolute inset-0 grid place-items-center bg-base/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setViewerPin({ name: pin.name, url: pin.photoUrl! })}
                        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-display text-accent-foreground"
                      >
                        <Maximize className="h-3.5 w-3.5" /> View 360°
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid h-32 place-items-center bg-elevated">
                    <Camera className="h-6 w-6 text-ink-muted" />
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
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-hairline py-4 text-center text-[11px] text-ink-muted">
        SiteDocHB — Halsell Builders — Read-only view
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
