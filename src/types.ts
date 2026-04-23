export type SyncStatus = "synced" | "syncing" | "offline";

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
