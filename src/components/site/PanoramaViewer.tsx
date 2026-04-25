import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface Props {
  photoUrl: string;
  pinName: string;
  onClose: () => void;
}

type PannellumViewer = { destroy?: () => void } | null;

declare global {
  interface Window {
    pannellum?: {
      viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumViewer;
    };
  }
}

const PanoramaViewer = ({ photoUrl, pinName, onClose }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PannellumViewer>(null);

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
      if (!window.pannellum) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pannellum"));
          document.head.appendChild(script);
        });
      }

      // Initialize viewer
      if (containerRef.current && window.pannellum) {
        viewerRef.current = window.pannellum.viewer(containerRef.current, {
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
    <div className="fixed inset-0 z-50 bg-black animate-fade-up">
      <button
        onClick={onClose}
        aria-label={`Close panorama viewer for ${pinName}`}
        className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Panorama container (immersive full-screen) */}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default PanoramaViewer;
