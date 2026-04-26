import { useEffect, useRef, useCallback, useState } from "react";
import { X } from "lucide-react";
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
  const [heading, setHeading] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const dragStateRef = useRef<{ dragging: boolean; startX: number; startOffset: number }>({
    dragging: false,
    startX: 0,
    startOffset: 0,
  });
  const velocityRef = useRef(0);
  const lastMoveRef = useRef<{ x: number; t: number } | null>(null);
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
    };
    img.src = photoUrl;
  }, [photoUrl]);

  useEffect(() => {
    const update = () => setViewportWidth(viewportRef.current?.clientWidth ?? 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const maxScroll = Math.max(imageSize.width - viewportWidth, 0);
    if (maxScroll <= 0) {
      setHeading(0);
      return;
    }
    const progress = Math.min(Math.max(-offsetX / maxScroll, 0), 1);
    setHeading(Math.round(progress * 359));
  }, [offsetX, imageSize.width, viewportWidth]);

  const normalizeWrap = (value: number) => {
    const maxScroll = Math.max(imageSize.width - viewportWidth, 0);
    if (maxScroll <= 0) return 0;
    let n = value;
    while (n < -maxScroll) n += maxScroll;
    while (n > 0) n -= maxScroll;
    return n;
  };

  const startDrag = (clientX: number) => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
    velocityRef.current = 0;
    lastMoveRef.current = { x: clientX, t: performance.now() };
    dragStateRef.current = {
      dragging: true,
      startX: clientX,
      startOffset: offsetX,
    };
  };

  const moveDrag = (clientX: number) => {
    if (!dragStateRef.current.dragging) return;
    const delta = clientX - dragStateRef.current.startX;
    const now = performance.now();
    if (lastMoveRef.current) {
      const dt = Math.max(now - lastMoveRef.current.t, 1);
      const dx = clientX - lastMoveRef.current.x;
      velocityRef.current = dx / dt; // px/ms
    }
    lastMoveRef.current = { x: clientX, t: now };
    setOffsetX(normalizeWrap(dragStateRef.current.startOffset + delta));
  };

  const endDrag = () => {
    dragStateRef.current.dragging = false;
    const step = () => {
      velocityRef.current *= 0.94;
      if (Math.abs(velocityRef.current) < 0.01) {
        inertiaFrameRef.current = null;
        return;
      }
      setOffsetX((prev) => normalizeWrap(prev + velocityRef.current * 16));
      inertiaFrameRef.current = requestAnimationFrame(step);
    };
    if (Math.abs(velocityRef.current) >= 0.01) {
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
      <div
        ref={viewportRef}
        className="h-full w-full overflow-hidden touch-none"
        onPointerDown={(e) => {
          activePointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          startDrag(e.clientX);
        }}
        onPointerMove={(e) => {
          if (activePointerIdRef.current !== e.pointerId) return;
          moveDrag(e.clientX);
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
          className="h-full max-w-none select-none object-cover"
          draggable={false}
          style={{
            transform: `translate3d(${offsetX}px, 0, 0)`,
            width: imageSize.width > 0 ? `${imageSize.width}px` : "200vw",
          }}
        />
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
};

export default PanoramaViewer;
