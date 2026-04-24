import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Use the local worker file via Vite's ?url import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfRenderResult {
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  dimensions: { width: number; height: number };
}

/**
 * Renders the first page of a PDF to a data URL image.
 * Uses pdfjs-dist and an offscreen canvas.
 * Caches the result per URL to avoid re-rendering.
 */
export function usePdfRenderer(pdfUrl: string | undefined): PdfRenderResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 });
  const cacheRef = useRef<Map<string, { url: string; dims: { width: number; height: number } }>>(new Map());

  useEffect(() => {
    if (!pdfUrl) {
      setImageUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Check cache first
    const cached = cacheRef.current.get(pdfUrl);
    if (cached) {
      setImageUrl(cached.url);
      setDimensions(cached.dims);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const render = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // Render at 2x scale for retina displays
        const scale = 2;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (cancelled) return;

        const dataUrl = canvas.toDataURL("image/png");
        const dims = { width: viewport.width / scale, height: viewport.height / scale };

        // Cache it
        cacheRef.current.set(pdfUrl, { url: dataUrl, dims });

        setImageUrl(dataUrl);
        setDimensions(dims);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[SiteDocHB] PDF render failed:", err);
        setError("Failed to render PDF");
        setLoading(false);
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  return { imageUrl, loading, error, dimensions };
}
