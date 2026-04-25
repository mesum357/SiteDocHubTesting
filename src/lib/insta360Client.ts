const CAMERA_BASE = "/api/camera";

const oscHeaders = {
  "Content-Type": "application/json;charset=utf-8",
  Accept: "application/json",
  "X-XSRF-Protected": "1",
};

type OscCommandResponse = {
  state: "done" | "inProgress" | "error";
  id?: string;
  results?: { fileUrls?: string[]; options?: Record<string, unknown> };
  error?: { code?: string; message?: string };
};

type CameraSdkLike = {
  isConnected?: () => Promise<boolean> | boolean;
  takePicture?: () => Promise<void> | void;
  getLatestPhotoBlob?: () => Promise<Blob>;
  getStatus?: () => Promise<{ battery?: number; storageFreeMb?: number }>;
};

type CameraStatus = {
  connected: boolean;
  batteryPercent: number | null;
  storageFreeMb: number | null;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

function getSdk(): CameraSdkLike | null {
  if (typeof window === "undefined") return null;
  const sdk = (window as Window & { Insta360CameraSDK?: CameraSdkLike })
    .Insta360CameraSDK;
  return sdk ?? null;
}

async function captureViaSdk(sdk: CameraSdkLike): Promise<Blob> {
  if (!sdk.takePicture || !sdk.getLatestPhotoBlob) {
    throw new Error("Insta360 SDK is available but missing required methods.");
  }
  await sdk.takePicture();
  return sdk.getLatestPhotoBlob();
}

async function captureViaOsc(): Promise<Blob> {
  const execRes = await fetch(`${CAMERA_BASE}/osc/commands/execute`, {
    method: "POST",
    headers: oscHeaders,
    body: JSON.stringify({ name: "camera.takePicture" }),
  });
  const execData = (await execRes.json()) as OscCommandResponse;

  if (execData.state === "error") {
    throw new Error(execData.error?.message ?? "Capture failed");
  }

  let result = execData;
  if (result.state === "inProgress" && result.id) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await fetch(`${CAMERA_BASE}/osc/commands/status`, {
        method: "POST",
        headers: oscHeaders,
        body: JSON.stringify({ id: result.id }),
      });
      result = (await statusRes.json()) as OscCommandResponse;
      if (result.state === "done" || result.state === "error") break;
    }
  }

  if (result.state === "error") {
    throw new Error(result.error?.message ?? "Capture failed");
  }

  const fileUrl = result.results?.fileUrls?.[0];
  if (!fileUrl) throw new Error("No file URL returned from camera");

  const photoPath = fileUrl.replace(/^https?:\/\/[^/]+/, "");
  const photoRes = await fetch(`${CAMERA_BASE}${photoPath}`);
  if (!photoRes.ok) throw new Error("Failed to download photo from camera");
  return photoRes.blob();
}

export async function capturePhotoFromInsta360(): Promise<Blob> {
  const sdk = getSdk();
  if (sdk) {
    try {
      return await captureViaSdk(sdk);
    } catch {
      // Fall through to OSC proxy when SDK integration fails.
    }
  }
  return captureViaOsc();
}

export async function getInsta360Status(): Promise<CameraStatus> {
  const sdk = getSdk();
  if (sdk) {
    try {
      const connected = Boolean(await sdk.isConnected?.());
      const sdkStatus = (await sdk.getStatus?.()) ?? {};
      return {
        connected,
        batteryPercent: toNumberOrNull(sdkStatus.battery),
        storageFreeMb: toNumberOrNull(sdkStatus.storageFreeMb),
      };
    } catch {
      // Fall through to OSC proxy.
    }
  }

  try {
    const infoRes = await fetch(`${CAMERA_BASE}/osc/info`, {
      method: "GET",
      headers: oscHeaders,
      signal: AbortSignal.timeout(2500),
    });
    if (!infoRes.ok) {
      return { connected: false, batteryPercent: null, storageFreeMb: null };
    }

    const stateRes = await fetch(`${CAMERA_BASE}/osc/state`, {
      method: "POST",
      headers: oscHeaders,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(2500),
    });

    if (!stateRes.ok) {
      return { connected: true, batteryPercent: null, storageFreeMb: null };
    }

    const stateJson = (await stateRes.json()) as {
      state?: Record<string, unknown>;
    };
    const state = stateJson.state ?? {};

    return {
      connected: true,
      batteryPercent: toNumberOrNull(
        state.batteryLevel ?? state.batteryPercentage ?? state.battery
      ),
      storageFreeMb: toNumberOrNull(
        state.storageFreeSpace ?? state.storageFreeMb ?? state.remainingSpace
      ),
    };
  } catch {
    return { connected: false, batteryPercent: null, storageFreeMb: null };
  }
}
