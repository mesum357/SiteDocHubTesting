const OSC_PATH_PREFIX = "/osc";

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

export type CameraStatus = {
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

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  globalThis.setTimeout(() => c.abort(), ms);
  return c.signal;
}

function getSdk(): CameraSdkLike | null {
  if (typeof window === "undefined") return null;
  const sdk = (window as Window & { Insta360CameraSDK?: CameraSdkLike })
    .Insta360CameraSDK;
  return sdk ?? null;
}

/** Clears cached OSC base (e.g. after capture errors or in tests). */
export function resetInsta360OscBaseCache(): void {
  cachedOscBase = null;
}

let cachedOscBase: string | null = null;

const DEFAULT_DIRECT_BASES = ["http://192.168.42.1", "http://192.168.43.1"];

/**
 * OSC API bases to try, in order.
 * - VITE_CAMERA_OSC_BASE: override (e.g. http://192.168.42.1 for HTTP dev on camera WiFi)
 * - /api/camera: Vite dev/preview proxy to the camera (same-origin, avoids CORS)
 * - Direct camera IPs: only on http:// pages (mixed content blocks these on https://)
 */
export function buildOscBases(): string[] {
  const bases: string[] = [];
  const env = (import.meta.env.VITE_CAMERA_OSC_BASE as string | undefined)?.trim();
  if (env) bases.push(env.replace(/\/$/, ""));
  bases.push("/api/camera");
  if (typeof window !== "undefined" && window.location.protocol === "http:") {
    for (const h of DEFAULT_DIRECT_BASES) {
      if (!bases.includes(h)) bases.push(h);
    }
  }
  return bases;
}

async function fetchOscInfo(base: string): Promise<Response> {
  return fetch(`${base}${OSC_PATH_PREFIX}/info`, {
    method: "GET",
    headers: oscHeaders,
    signal: abortAfter(3500),
  });
}

async function resolveWorkingOscBase(): Promise<string | null> {
  if (cachedOscBase) {
    try {
      const r = await fetchOscInfo(cachedOscBase);
      if (r.ok) return cachedOscBase;
    } catch {
      /* stale cache */
    }
    cachedOscBase = null;
  }

  for (const base of buildOscBases()) {
    try {
      const r = await fetchOscInfo(base);
      if (r.ok) {
        cachedOscBase = base;
        return base;
      }
    } catch {
      /* try next base */
    }
  }
  return null;
}

async function trySdkStatus(sdk: CameraSdkLike): Promise<CameraStatus | null> {
  if (typeof sdk.isConnected !== "function") {
    return null;
  }
  try {
    const connected = Boolean(await sdk.isConnected());
    if (!connected) return null;
    const sdkStatus = (await sdk.getStatus?.()) ?? {};
    return {
      connected: true,
      batteryPercent: toNumberOrNull(sdkStatus.battery),
      storageFreeMb: toNumberOrNull(sdkStatus.storageFreeMb),
    };
  } catch {
    return null;
  }
}

async function captureViaSdk(sdk: CameraSdkLike): Promise<Blob> {
  if (!sdk.takePicture || !sdk.getLatestPhotoBlob) {
    throw new Error("Insta360 SDK is available but missing required methods.");
  }
  await sdk.takePicture();
  return sdk.getLatestPhotoBlob();
}

async function sdkUsableForCapture(sdk: CameraSdkLike): Promise<boolean> {
  if (!sdk.takePicture || !sdk.getLatestPhotoBlob) return false;
  if (typeof sdk.isConnected !== "function") return true;
  return Boolean(await sdk.isConnected());
}

async function captureViaOsc(base: string): Promise<Blob> {
  const execRes = await fetch(`${base}${OSC_PATH_PREFIX}/commands/execute`, {
    method: "POST",
    headers: oscHeaders,
    body: JSON.stringify({ name: "camera.takePicture" }),
    signal: abortAfter(15000),
  });
  const execData = (await execRes.json()) as OscCommandResponse;

  if (execData.state === "error") {
    throw new Error(execData.error?.message ?? "Capture failed");
  }

  let result = execData;
  if (result.state === "inProgress" && result.id) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await fetch(`${base}${OSC_PATH_PREFIX}/commands/status`, {
        method: "POST",
        headers: oscHeaders,
        body: JSON.stringify({ id: result.id }),
        signal: abortAfter(8000),
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
  const photoRes = await fetch(`${base}${photoPath}`, { signal: abortAfter(20000) });
  if (!photoRes.ok) throw new Error("Failed to download photo from camera");
  return photoRes.blob();
}

export async function capturePhotoFromInsta360(): Promise<Blob> {
  const sdk = getSdk();
  if (sdk && (await sdkUsableForCapture(sdk))) {
    try {
      return await captureViaSdk(sdk);
    } catch {
      resetInsta360OscBaseCache();
    }
  }

  const base = await resolveWorkingOscBase();
  if (!base) {
    throw new Error("Could not reach Insta360 camera OSC API.");
  }
  try {
    return await captureViaOsc(base);
  } catch (err) {
    resetInsta360OscBaseCache();
    throw err;
  }
}

async function statusViaOsc(base: string): Promise<CameraStatus> {
  const infoRes = await fetchOscInfo(base);
  if (!infoRes.ok) {
    return { connected: false, batteryPercent: null, storageFreeMb: null };
  }

  const stateRes = await fetch(`${base}${OSC_PATH_PREFIX}/state`, {
    method: "POST",
    headers: oscHeaders,
    body: JSON.stringify({}),
    signal: abortAfter(3500),
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
}

export async function getInsta360Status(): Promise<CameraStatus> {
  const sdk = getSdk();
  if (sdk) {
    const fromSdk = await trySdkStatus(sdk);
    if (fromSdk) return fromSdk;
  }

  try {
    const base = await resolveWorkingOscBase();
    if (!base) {
      return { connected: false, batteryPercent: null, storageFreeMb: null };
    }
    return await statusViaOsc(base);
  } catch {
    return { connected: false, batteryPercent: null, storageFreeMb: null };
  }
}
