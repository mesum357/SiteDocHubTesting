/**
 * Insta360 connection & capture
 *
 * OSC path is used when window.Insta360CameraSDK exists but isConnected() is false — a real bug
 * class on some WebViews. SSID name does not matter; only OSC reachability counts.
 *
 * Field hardware steps: see test.describe.skip("Field checklist") body (un-skip locally to track in CI grep).
 */
import { test, expect } from "@playwright/test";
import {
  ensureFloorPdf,
  ensureJobSelected,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
} from "./utils/offlineWorkflowHelpers";
import { mockInsta360Api } from "./utils/insta360Mock";

test.describe("Insta360 OSC fallback when SDK reports disconnected", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("capture works when Insta360CameraSDK.isConnected is false but OSC is up", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      (window as unknown as { Insta360CameraSDK: { isConnected: () => Promise<boolean> } }).Insta360CameraSDK =
        {
          isConnected: async () => false,
        };
    });

    await mockInsta360Api(page);
    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);

    const pinInList = page.locator("aside").first().locator("ul").getByRole("button").first();
    if (await pinInList.isVisible().catch(() => false)) {
      await pinInList.click();
    } else {
      await placePinAndSelect(page, "Insta360 SDK False Pin");
    }
    await expect(page.getByText(/select a pin to view/i)).toBeHidden({ timeout: 5_000 });

    await expect(page.getByText(/^connected$/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /capture with insta360/i }).click();
    await expect(page.getByText(/photo saved to|photo uploaded/i)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe.skip("Field checklist — un-skip locally for hardware validation", () => {
  test("Insta360 X2 + phone + Vite proxy", async () => {
    // A. Camera
    //   - Power on X2; join its Wi‑Fi from the test PC (SSID may be custom — not required to contain "INSTA360").
    //   - From PC: curl -sS --max-time 3 http://192.168.42.1/osc/info | head -c 200  → expect JSON.
    //   - If that fails, try http://192.168.43.1/osc/info; if that works, set in .env:
    //       INSTA360_OSC_PROXY_TARGET=http://192.168.43.1
    // B. Dev server (proxy only runs here, not on static https hosting)
    //   - npm run dev -- --host 0.0.0.0 --port 8080
    //   - PC must stay on camera Wi‑Fi so Node can reach the camera IP above.
    // C. Phone browser
    //   - Join same camera Wi‑Fi; open http://<PC_LAN_IP>:8080/site (http URL).
    //   - Open a pin: status should show Connected; Capture with Insta360 should upload.
    // D. If Connected stays red
    //   - Confirm URL is http (not https) unless you only rely on /api/camera same-origin to dev host.
    //   - DevTools → Network: /api/camera/osc/info should be 200 from your machine, not 404 from a remote CDN.
    expect(true).toBe(true);
  });
});
