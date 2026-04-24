import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedJobs,
  cacheJobs,
  getCachedFloorsByJob,
  cacheFloors,
  getCachedPinsByFloor,
  cachePins,
  getCachedFloorPdf,
  cacheFloorPdf,
  addToQueue,
  upsertPin,
} from "../lib/db";
import type { DBJob, DBFloor, DBPin } from "../lib/db";
import { precacheJobPdfs } from "../lib/registerSW";

// ─── JOBS ─────────────────────────────────────────────────────────────────────

export function useJobs() {
  const [jobs, setJobs] = useState<DBJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (navigator.onLine) {
        const { data, error: supaErr } = await supabase
          .from("jobs")
          .select("*")
          .eq("archived", false)
          .order("created_at", { ascending: false });

        if (supaErr) throw supaErr;
        const fetched = (data ?? []) as DBJob[];
        await cacheJobs(fetched);
        setJobs(fetched);
      } else {
        // Offline — serve from IndexedDB
        const cached = await getCachedJobs();
        setJobs(cached.filter((j) => !j.archived));
      }
    } catch {
      // Try cache as fallback
      const cached = await getCachedJobs();
      if (cached.length > 0) {
        setJobs(cached.filter((j) => !j.archived));
      } else {
        setError("Unable to load jobs. Check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}

// ─── FLOORS ───────────────────────────────────────────────────────────────────

export function useFloors(jobId: string | null) {
  const [floors, setFloors] = useState<DBFloor[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFloors = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("floors")
          .select("*")
          .eq("job_id", jobId)
          .order("floor_order");

        if (error) throw error;
        const fetched = (data ?? []) as DBFloor[];
        await cacheFloors(fetched);
        setFloors(fetched);

        // Pre-cache PDFs for this job in the service worker
        const pdfUrls = fetched
          .filter((f) => f.pdf_path)
          .map((f) => {
            const { data: urlData } = supabase.storage
              .from("floor-plans")
              .getPublicUrl(f.pdf_path!);
            return urlData.publicUrl;
          });
        if (pdfUrls.length > 0) await precacheJobPdfs(pdfUrls);
      } else {
        const cached = await getCachedFloorsByJob(jobId);
        setFloors(cached.sort((a, b) => a.floor_order - b.floor_order));
      }
    } catch {
      const cached = await getCachedFloorsByJob(jobId);
      setFloors(cached.sort((a, b) => a.floor_order - b.floor_order));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchFloors();
  }, [fetchFloors]);

  return { floors, loading, refetch: fetchFloors };
}

// ─── PINS ─────────────────────────────────────────────────────────────────────

export function usePins(floorId: string | null) {
  const [pins, setPins] = useState<DBPin[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPins = useCallback(async () => {
    if (!floorId) return;
    setLoading(true);
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("pins")
          .select("*")
          .eq("floor_id", floorId)
          .order("pin_order");

        if (error) throw error;
        const fetched = (data ?? []) as DBPin[];
        await cachePins(fetched);
        setPins(fetched);
      } else {
        const cached = await getCachedPinsByFloor(floorId);
        setPins(cached.sort((a, b) => a.pin_order - b.pin_order));
      }
    } catch {
      const cached = await getCachedPinsByFloor(floorId);
      setPins(cached.sort((a, b) => a.pin_order - b.pin_order));
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  return { pins, loading, refetch: fetchPins };
}

// ─── FLOOR PDF ────────────────────────────────────────────────────────────────

export function useFloorPdf(floor: DBFloor | null) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!floor?.pdf_path) {
      setPdfUrl(null);
      return;
    }

    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      try {
        if (navigator.onLine) {
          const { data } = await supabase.storage
            .from("floor-plans")
            .createSignedUrl(floor.pdf_path!, 3600);

          if (data?.signedUrl) {
            // Fetch the PDF and cache it in IndexedDB
            const res = await fetch(data.signedUrl);
            const blob = await res.blob();
            await cacheFloorPdf(floor.id, blob);
            objectUrl = URL.createObjectURL(blob);
            setPdfUrl(objectUrl);
          }
        } else {
          // Offline — serve from IndexedDB
          const blob = await getCachedFloorPdf(floor.id);
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setPdfUrl(objectUrl);
          } else {
            setPdfUrl(null);
          }
        }
      } catch {
        // Try IndexedDB fallback
        const blob = await getCachedFloorPdf(floor.id);
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setPdfUrl(objectUrl);
        }
      } finally {
        setLoading(false);
      }
    };

    load();

    // Cleanup object URL on unmount
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [floor?.id, floor?.pdf_path]);

  return { pdfUrl, loading };
}

// ─── PHOTO UPLOAD ─────────────────────────────────────────────────────────────

export async function uploadPhotoToPin(
  jobId: string,
  floorId: string,
  pinId: string,
  photoBlob: Blob
): Promise<{ success: boolean; queued: boolean }> {
  const storagePath = `${jobId}/${floorId}/${pinId}.jpg`;
  const photoTakenAt = new Date().toISOString();

  // Always update IndexedDB immediately so UI reflects the photo
  await upsertPin({
    id: pinId,
    floor_id: floorId,
    name: "",
    x_pct: 0,
    y_pct: 0,
    pin_order: 0,
    photo_path: storagePath,
    note: null,
    photo_taken_at: photoTakenAt,
    created_at: new Date().toISOString(),
  });

  if (navigator.onLine) {
    try {
      // Try direct upload
      const { error: uploadError } = await supabase.storage
        .from("site-photos")
        .upload(storagePath, photoBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      await supabase
        .from("pins")
        .update({ photo_path: storagePath, photo_taken_at: photoTakenAt })
        .eq("id", pinId);

      return { success: true, queued: false };
    } catch {
      // Upload failed — fall through to queue
    }
  }

  // Offline or upload failed — add to queue
  await addToQueue({
    type: "photo_upload",
    maxRetries: 3,
    payload: { pinId, floorId, jobId, photoBlob, storagePath, photoTakenAt },
  });

  return { success: true, queued: true };
}
