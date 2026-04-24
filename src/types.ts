// SyncStatus is now derived from the useSyncStatus hook (see src/hooks/useSyncStatus.ts)

export interface Pin {
  id: string;
  name: string;
  x: number; // 0..1 normalized in floor plan
  y: number;
  photoUrl?: string;
  notes?: string;
  capturedAt?: string; // ISO
}

export interface Floor {
  id: string;
  name: string;
  pdfUrl?: string; // Supabase Storage public URL of the floor plan PDF
  pins: Pin[];
}

export interface Job {
  id: string;
  name: string;
  description: string;
  createdAt: string; // ISO
  archived?: boolean;
  floors: Floor[];
}
