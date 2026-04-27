export function normalizePinPhotoPath(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Expected canonical format: "<jobId>/<floorId>/<pinId>.jpg"
  if (!trimmed.includes("://") && !trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // Legacy or accidental URL/blob persistence fallback.
  if (trimmed.startsWith("blob:")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const marker = "/pin-photos/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    const rawPath = parsed.pathname.slice(idx + marker.length);
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

