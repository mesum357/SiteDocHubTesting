import { useEffect, useRef, useCallback, useState } from "react";
import { Maximize, Minus, Plus, X } from "lucide-react";
import { createPortal } from "react-dom";

interface Props {
  photoUrl: string;
  pinName: string;
  onClose: () => void;
}

const PanoramaViewer = ({ photoUrl, pinName, onClose }: Props) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [heading, setHeading] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const dragStateRef = useRef<{ dragging: boolean; startX: number; startOffset: number }>({
    dragging: false,
    startX: 0,
    startOffset: 0,
  });
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

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
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setOffsetX(0);
      setOffsetY(0);
    };
    img.src = photoUrl;
  }, [photoUrl]);

  useEffect(() => {
    const update = () => {
      setViewportWidth(viewportRef.current?.clientWidth ?? 0);
      setViewportHeight(viewportRef.current?.clientHeight ?? 0);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const renderedHeight = viewportHeight > 0 ? Math.round(viewportHeight * 1.35 * zoom) : 0;

  const renderedWidth =
    renderedHeight > 0 && imageSize.width > 0 && imageSize.height > 0
      ? Math.round((renderedHeight * imageSize.width) / imageSize.height)
      : 0;

  useEffect(() => {
    if (viewportHeight <= 0 || imageSize.width <= 0 || imageSize.height <= 0) return;
    const maxScrollX = Math.max(renderedWidth - viewportWidth, 0);
    const maxScrollY = Math.max(renderedHeight - viewportHeight, 0);
    // Start centered on open so the view corresponds to roughly 180deg heading.
    setOffsetX(-maxScrollX / 2);
    // Start centered vertically so users can look both up (sky) and down (ground).
    setOffsetY(-maxScrollY / 2);
  }, [viewportHeight, viewportWidth, imageSize.width, imageSize.height, renderedHeight, renderedWidth]);

  useEffect(() => {
    const maxScroll = Math.max(renderedWidth - viewportWidth, 0);
    if (maxScroll <= 0) {
      setHeading(0);
      return;
    }
    const progress = Math.min(Math.max(-offsetX / maxScroll, 0), 1);
    setHeading(Math.round(progress * 359));
  }, [offsetX, renderedWidth, viewportWidth]);

  const clampOffsetX = (value: number) => {
    const maxScrollX = Math.max(renderedWidth - viewportWidth, 0);
    return Math.max(-maxScrollX, Math.min(0, value));
  };

  const clampOffsetY = (value: number) => {
    const maxScrollY = Math.max(renderedHeight - viewportHeight, 0);
    // hard bounds prevent exposing blank areas above/below the image
    return Math.max(-maxScrollY, Math.min(0, value));
  };

  const startDrag = (clientX: number, clientY: number) => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
    lastMoveRef.current = { x: clientX, y: clientY, t: performance.now() };
    dragStateRef.current = {
      dragging: true,
      startX: clientX,
      startOffset: offsetX,
    };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragStateRef.current.dragging) return;
    const deltaX = clientX - dragStateRef.current.startX;
    const deltaY = clientY - (lastMoveRef.current?.y ?? clientY);
    const now = performance.now();
    if (lastMoveRef.current) {
      const dt = Math.max(now - lastMoveRef.current.t, 1);
      const dx = clientX - lastMoveRef.current.x;
      const dy = clientY - lastMoveRef.current.y;
      velocityRef.current = { x: dx / dt, y: dy / dt }; // px/ms
    }
    lastMoveRef.current = { x: clientX, y: clientY, t: now };
    setOffsetX(clampOffsetX(dragStateRef.current.startOffset + deltaX));
    setOffsetY((prev) => clampOffsetY(prev + deltaY));
  };

  const endDrag = () => {
    dragStateRef.current.dragging = false;
    const step = () => {
      velocityRef.current = {
        x: velocityRef.current.x * 0.93,
        y: velocityRef.current.y * 0.93,
      };
      if (Math.abs(velocityRef.current.x) < 0.01 && Math.abs(velocityRef.current.y) < 0.01) {
        inertiaFrameRef.current = null;
        return;
      }
      setOffsetX((prev) => clampOffsetX(prev + velocityRef.current.x * 16));
      setOffsetY((prev) => clampOffsetY(prev + velocityRef.current.y * 16));
      inertiaFrameRef.current = requestAnimationFrame(step);
    };
    if (Math.abs(velocityRef.current.x) >= 0.01 || Math.abs(velocityRef.current.y) >= 0.01) {
      inertiaFrameRef.current = requestAnimationFrame(step);
    }
  };

  useEffect(() => {
    return () => {
      if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current);
    };
  }, []);

  const viewer = (
    <div className="fixed inset-0 z-[120] bg-black animate-fade-up">
      <button
        onClick={onClose}
        aria-label={`Close panorama viewer for ${pinName}`}
        className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-[160] grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="absolute left-4 top-[max(12px,env(safe-area-inset-top))] z-[130] rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur-sm">
        Drag left/right to pan
      </div>
      <div className="absolute right-16 top-[max(12px,env(safe-area-inset-top))] z-[130] rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur-sm">
        {heading}&deg;
      </div>
      <div className="absolute bottom-4 right-4 z-[130] flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 text-white backdrop-blur-sm">
        <button
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
          aria-label="Zoom out panorama"
          className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 font-mono-data text-[11px] tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))}
          aria-label="Zoom in panorama"
          className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom(1)}
          aria-label="Reset panorama zoom"
          className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={viewportRef}
        className="h-full w-full overflow-hidden touch-none"
        onPointerDown={(e) => {
          activePointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          startDrag(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointerIdRef.current !== e.pointerId) return;
          moveDrag(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (activePointerIdRef.current !== e.pointerId) return;
          activePointerIdRef.current = null;
          endDrag();
        }}
        onPointerCancel={(e) => {
          if (activePointerIdRef.current !== e.pointerId) return;
          activePointerIdRef.current = null;
          endDrag();
        }}
      >
        <img
          src={photoUrl}
          alt={`${pinName} panorama`}
          className="max-w-none select-none"
          draggable={false}
          style={{
            transform: `translate3d(${offsetX}px, ${offsetY}px, 0)`,
            height: renderedHeight > 0 ? `${renderedHeight}px` : "135vh",
            width: renderedWidth > 0 ? `${renderedWidth}px` : "200vw",
          }}
        />
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
};

export default PanoramaViewer;
