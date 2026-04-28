import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOscBases,
  getInsta360Status,
  resetInsta360OscBaseCache,
} from "./insta360Client";

describe("insta360Client", () => {
  beforeEach(() => {
    resetInsta360OscBaseCache();
    vi.stubGlobal("fetch", vi.fn());
    delete (window as unknown as { Insta360CameraSDK?: unknown }).Insta360CameraSDK;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("buildOscBases always includes same-origin proxy path", () => {
    expect(buildOscBases()).toContain("/api/camera");
  });

  it("falls through to OSC when Insta360CameraSDK.isConnected returns false", async () => {
    (window as unknown as { Insta360CameraSDK: { isConnected: () => Promise<boolean> } }).Insta360CameraSDK =
      {
        isConnected: async () => false,
      };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/osc/info")) {
        return new Response(JSON.stringify({ manufacturer: "Insta360", model: "X2" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/osc/state")) {
        return new Response(
          JSON.stringify({ state: { batteryLevel: 50, storageFreeSpace: 1024 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("", { status: 404 });
    });

    const status = await getInsta360Status();
    expect(status.connected).toBe(true);
    expect(status.batteryPercent).toBe(50);
    expect(status.storageFreeMb).toBe(1024);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("uses SDK path only when isConnected returns true", async () => {
    (window as unknown as { Insta360CameraSDK: { isConnected: () => Promise<boolean>; getStatus: () => Promise<{ battery: number }> } }).Insta360CameraSDK =
      {
        isConnected: async () => true,
        getStatus: async () => ({ battery: 99 }),
      };

    const mockFetch = vi.mocked(fetch);
    const status = await getInsta360Status();
    expect(status.connected).toBe(true);
    expect(status.batteryPercent).toBe(99);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
