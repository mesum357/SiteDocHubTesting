import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  capturePhotoFromInsta360,
  getInsta360Status,
} from "@/lib/insta360Client";

const POLL_CONNECTED = 5000;
const POLL_DISCONNECTED = 15000;

export const useInsta360 = () => {
  const setCameraConnected = useAppStore((s) => s.setCameraConnected);
  const connected = useAppStore((s) => s.cameraConnected);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [storageFreeMb, setStorageFreeMb] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll connectivity with backoff when disconnected
  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      try {
        const status = await getInsta360Status();
        if (!cancelled) {
          setCameraConnected(status.connected);
          setBatteryPercent(status.batteryPercent);
          setStorageFreeMb(status.storageFreeMb);
        }
      } catch {
        if (!cancelled) {
          setCameraConnected(false);
          setBatteryPercent(null);
          setStorageFreeMb(null);
        }
      }

      if (!cancelled) {
        const delay = useAppStore.getState().cameraConnected ? POLL_CONNECTED : POLL_DISCONNECTED;
        pollRef.current = setTimeout(checkConnection, delay);
      }
    };

    checkConnection();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [setCameraConnected]);

  // Trigger capture and return the photo as a Blob
  const triggerCapture = useCallback(async (): Promise<Blob | null> => {
    setCapturing(true);
    setError(null);
    try {
      return await capturePhotoFromInsta360();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Camera error";
      setError(message);
      return null;
    } finally {
      setCapturing(false);
    }
  }, []);

  return {
    connected,
    capturing,
    error,
    batteryPercent,
    storageFreeMb,
    connectionHint:
      "Connect to INSTA360_XXXXXX WiFi in Settings, then return to this app.",
    triggerCapture,
  };
};
