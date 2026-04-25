import { expect, test } from "@playwright/test";
import {
  createNewJob,
  ensureFloorPdf,
  loginIfNeeded,
  requireE2ECreds,
  waitForFloorPlanReady,
} from "./utils/offlineWorkflowHelpers";

type PointSample = {
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
  markerCx: number;
  markerCy: number;
  normalizedX: number;
  normalizedY: number;
};

test.describe("Pin placement consistency", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("mobile placement stays aligned on desktop", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await loginIfNeeded(page);

    const jobName = `Pin Placement ${Date.now()}`;
    await createNewJob(page, jobName, "Floor 1");
    await ensureFloorPdf(page);
    await waitForFloorPlanReady(page);

    await page.getByRole("button", { name: /quick actions/i }).click();
    await page.getByRole("button", { name: /place pin/i }).click();
    await expect(page.getByText(/placement mode/i)).toBeVisible({ timeout: 10_000 });

    const targetPoint = await page.evaluate(() => {
      const canvas = document.querySelector("[data-testid='floor-plan-canvas']") as HTMLDivElement | null;
      if (!canvas) return null;
      const img = canvas.querySelector("img") as HTMLImageElement | null;
      if (!img) return null;
      const r = img.getBoundingClientRect();
      const targetX = r.left + r.width * 0.62;
      const targetY = r.top + r.height * 0.38;
      return { x: targetX, y: targetY };
    });
    expect(targetPoint).toBeTruthy();
    await page.mouse.click(targetPoint!.x, targetPoint!.y);

    const pinName = `Cross Device Pin ${Date.now()}`;
    const draftNameInput = page.getByPlaceholder(/pin name/i);
    await expect(draftNameInput).toBeVisible({ timeout: 8_000 });
    await draftNameInput.fill(pinName);
    await draftNameInput.press("Enter");

    await expect(page.getByRole("button", { name: new RegExp(pinName, "i") }).first()).toBeVisible({
      timeout: 10_000,
    });

    const getMarkerSample = async (): Promise<PointSample> =>
      page.evaluate(() => {
        const canvas = document.querySelector("[data-testid='floor-plan-canvas']") as HTMLDivElement | null;
        if (!canvas) throw new Error("floor-plan-canvas not found");
        const img = canvas.querySelector("img") as HTMLImageElement | null;
        if (!img) throw new Error("floor image not found");
        const marker = canvas.querySelector("[data-testid^='floor-map-marker-']") as SVGGElement | null;
        if (!marker) throw new Error("floor marker not found");

        const imageRect = img.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        const markerCx = markerRect.left + markerRect.width / 2;
        const markerCy = markerRect.top + markerRect.height / 2;

        return {
          imageLeft: imageRect.left,
          imageTop: imageRect.top,
          imageWidth: imageRect.width,
          imageHeight: imageRect.height,
          markerCx,
          markerCy,
          normalizedX: (markerCx - imageRect.left) / imageRect.width,
          normalizedY: (markerCy - imageRect.top) / imageRect.height,
        };
      });

    const mobileSample = await getMarkerSample();
    expect(mobileSample.normalizedX).toBeGreaterThan(0);
    expect(mobileSample.normalizedX).toBeLessThan(1);
    expect(mobileSample.normalizedY).toBeGreaterThan(0);
    expect(mobileSample.normalizedY).toBeLessThan(1);

    await page.setViewportSize({ width: 1366, height: 900 });
    await waitForFloorPlanReady(page);
    const desktopSample = await getMarkerSample();

    expect(Math.abs(desktopSample.normalizedX - mobileSample.normalizedX)).toBeLessThan(0.03);
    expect(Math.abs(desktopSample.normalizedY - mobileSample.normalizedY)).toBeLessThan(0.03);
  });
});

