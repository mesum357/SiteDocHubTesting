import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface Props {
  photoUrl: string;
  pinName: string;
  onClose: () => void;
}

const PanoramaViewer = ({ photoUrl, pinName, onClose }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically load Pannellum CSS + JS
    const loadPannellum = async () => {
      // Add CSS if not already present
      if (!document.getElementById("pannellum-css")) {
        const link = document.createElement("link");
        link.id = "pannellum-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
        document.head.appendChild(link);
      }

      // Load JS if not already present
      if (!(window as any).pannellum) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pannellum"));
          document.head.appendChild(script);
        });
      }

      // Initialize viewer
      if (containerRef.current && (window as any).pannellum) {
        viewerRef.current = (window as any).pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: photoUrl,
          autoLoad: true,
          autoRotate: -2,
          compass: false,
          showZoomCtrl: true,
          showFullscreenCtrl: false,
          mouseZoom: true,
          hfov: 110,
          minHfov: 30,
          maxHfov: 140,
        });
      }
    };

    loadPannellum();

    return () => {
      if (viewerRef.current?.destroy) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [photoUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-base/95 backdrop-blur-md animate-fade-up">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-surface/50">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="font-display text-sm text-ink">{pinName}</span>
          <span className="text-[10px] font-mono-data text-ink-secondary">360° View</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panorama viewer"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-elevated hover:text-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Panorama container */}
      <div ref={containerRef} className="flex-1 w-full" />

      {/* Footer hint */}
      <div className="flex items-center justify-center gap-4 py-2 border-t border-hairline bg-surface/50">
        <span className="text-[11px] text-ink-secondary">Drag to look around</span>
        <span className="text-[11px] text-ink-muted">•</span>
        <span className="text-[11px] text-ink-secondary">Scroll to zoom</span>
        <span className="text-[11px] text-ink-muted">•</span>
        <span className="text-[11px] text-ink-secondary">ESC to close</span>
      </div>
    </div>
  );
};

export default PanoramaViewer;
