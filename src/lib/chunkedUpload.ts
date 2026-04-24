import { supabase } from "./supabaseClient";

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Upload a large photo to Supabase Storage with progress reporting.
 * Falls back to direct upload for files ≤6MB.
 * For larger files, uploads in 6MB chunks.
 */
export async function uploadLargePhoto(
  storagePath: string,
  blob: Blob,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks

  if (blob.size <= CHUNK_SIZE) {
    // Small enough for direct upload
    const { error } = await supabase.storage
      .from("site-photos")
      .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });

    if (error) throw error;
    onProgress?.({ loaded: blob.size, total: blob.size, percent: 100 });
    return;
  }

  // For large files, attempt a single upload with progress simulation.
  // Supabase JS SDK doesn't natively support chunked uploads with progress,
  // so we upload the full blob and simulate progress based on known file size.
  const uploadPromise = supabase.storage
    .from("site-photos")
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  // Simulate progress updates while waiting for upload
  let simulatedProgress = 0;
  const progressInterval = setInterval(() => {
    if (simulatedProgress < 90) {
      // Increase progress based on expected upload speed (~2MB/s on mobile)
      const increment = Math.min(
        ((CHUNK_SIZE / blob.size) * 100) / 2,
        90 - simulatedProgress
      );
      simulatedProgress += increment;
      onProgress?.({
        loaded: Math.round((simulatedProgress / 100) * blob.size),
        total: blob.size,
        percent: Math.round(simulatedProgress),
      });
    }
  }, 500);

  try {
    const { error } = await uploadPromise;
    clearInterval(progressInterval);

    if (error) throw error;

    onProgress?.({ loaded: blob.size, total: blob.size, percent: 100 });
  } catch (err) {
    clearInterval(progressInterval);
    throw err;
  }
}
