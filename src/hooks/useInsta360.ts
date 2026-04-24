import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";

const POLL_CONNECTED = 5000;
const POLL_DISCONNECTED = 15000;
const CAMERA_BASE = "/api/camera";

interface OscCommandResponse {
  name: string;
  state: "done" | "inProgress" | "error";
  id?: string;
  results?: { fileUrls?: string[] };
  error?: { code: string; message: string };
}

const oscHeaders = {
  "Content-Type": "application/json;charset=utf-8",
  Accept: "application/json",
  "X-XSRF-Protected": "1",
};

export const useInsta360 = () => {
  const setCameraConnected = useAppStore((s) => s.setCameraConnected);
  const connected = useAppStore((s) => s.cameraConnected);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll connectivity with backoff when disconnected
  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      try {
        const res = await fetch(`${CAMERA_BASE}/osc/info`, {
          method: "GET",
          headers: oscHeaders,
          signal: AbortSignal.timeout(2500),
        });
        if (!cancelled) setCameraConnected(res.ok);
      } catch {
        if (!cancelled) setCameraConnected(false);
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
      // 1. Take picture
      const execRes = await fetch(`${CAMERA_BASE}/osc/commands/execute`, {
        method: "POST",
        headers: oscHeaders,
        body: JSON.stringify({ name: "camera.takePicture" }),
      });
      const execData: OscCommandResponse = await execRes.json();

      if (execData.state === "error") {
        throw new Error(execData.error?.message ?? "Capture failed");
      }

      // 2. Poll for completion if inProgress
      let result = execData;
      if (result.state === "inProgress" && result.id) {
        const commandId = result.id;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const statusRes = await fetch(`${CAMERA_BASE}/osc/commands/status`, {
            method: "POST",
            headers: oscHeaders,
            body: JSON.stringify({ id: commandId }),
          });
          result = await statusRes.json();
          if (result.state === "done" || result.state === "error") break;
        }
      }

      if (result.state === "error") {
        throw new Error(result.error?.message ?? "Capture failed");
      }

      // 3. Download the photo
      const fileUrl = result.results?.fileUrls?.[0];
      if (!fileUrl) throw new Error("No file URL returned from camera");

      // The fileUrl from OSC is a camera-local URL — proxy it
      const photoPath = fileUrl.replace(/^https?:\/\/[^/]+/, "");
      const photoRes = await fetch(`${CAMERA_BASE}${photoPath}`);
      if (!photoRes.ok) throw new Error("Failed to download photo from camera");

      return await photoRes.blob();
    } catch (err: any) {
      setError(err.message ?? "Camera error");
      return null;
    } finally {
      setCapturing(false);
    }
  }, []);

  return { connected, capturing, error, triggerCapture };
};
