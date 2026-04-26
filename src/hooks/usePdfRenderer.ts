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

type CachedRender = { url: string; dims: { width: number; height: number } };
const pdfRenderCache = new Map<string, CachedRender>();
const inFlightRenders = new Map<string, Promise<CachedRender>>();

async function renderPdfToDataUrl(pdfUrl: string): Promise<CachedRender> {
  const cached = pdfRenderCache.get(pdfUrl);
  if (cached) return cached;

  const existing = inFlightRenders.get(pdfUrl);
  if (existing) return existing;

  const task = (async () => {
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    // Rendering at 2x is expensive and delays first meaningful paint on mobile.
    // Use a lighter adaptive scale for faster LCP while keeping adequate clarity.
    const scale = Math.min(Math.max(window.devicePixelRatio, 1), 1.5);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Prefer async blob encoding to avoid blocking main thread with large base64 strings.
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to encode rendered PDF preview"));
      }, "image/webp", 0.88);
    });
    const objectUrl = URL.createObjectURL(blob);
    const result = {
      url: objectUrl,
      dims: { width: viewport.width / scale, height: viewport.height / scale },
    };
    pdfRenderCache.set(pdfUrl, result);
    return result;
  })();

  inFlightRenders.set(pdfUrl, task);
  try {
    return await task;
  } finally {
    inFlightRenders.delete(pdfUrl);
  }
}

export async function preloadPdfRender(pdfUrl: string | undefined) {
  if (!pdfUrl) return;
  try {
    await renderPdfToDataUrl(pdfUrl);
  } catch {
    // best-effort preloading only
  }
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
  const cacheRef = useRef<Map<string, CachedRender>>(new Map());

  useEffect(() => {
    if (!pdfUrl) {
      setImageUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Check hook-local cache first
    const cached = cacheRef.current.get(pdfUrl);
    if (cached) {
      setImageUrl(cached.url);
      setDimensions(cached.dims);
      setLoading(false);
      setError(null);
      return;
    }

    // Reuse global preloaded cache (used by preloadPdfRender) to avoid duplicate renders.
    const globalCached = pdfRenderCache.get(pdfUrl);
    if (globalCached) {
      cacheRef.current.set(pdfUrl, globalCached);
      setImageUrl(globalCached.url);
      setDimensions(globalCached.dims);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const render = async () => {
      try {
        const result = await renderPdfToDataUrl(pdfUrl);
        if (cancelled) return;

        cacheRef.current.set(pdfUrl, result);
        setImageUrl(result.url);
        setDimensions(result.dims);
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
