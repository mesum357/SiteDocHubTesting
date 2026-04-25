import { test, expect } from "@playwright/test";
import {
  attachBrowserDiagnostics,
  ensureFloorPdf,
  ensureJobSelected,
  getQueueCounts,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
  setOffline,
  setOnline,
  uploadDummyPhotoFromPicker,
  waitForFloorPlanReady,
} from "./utils/offlineWorkflowHelpers";

test.describe("Offline Workflow (Granular)", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD to run offline E2E.");
  test.describe.configure({ mode: "serial" });

  test("service worker controls app and app shell loads offline", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    const detachDiagnostics = await attachBrowserDiagnostics(page, testInfo);
    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);
    await waitForFloorPlanReady(page);

    const swReady = async () =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return {
          hasActiveWorker: Boolean(reg?.active),
          controlled: Boolean(navigator.serviceWorker.controller),
        };
      });

    const hasActiveWorker = await expect
      .poll(async () => (await swReady()).hasActiveWorker, { timeout: 20_000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!hasActiveWorker) {
      await testInfo.attach("sw-diagnostic.txt", {
        body: "No active service worker found after waiting 20s in dev mode.",
        contentType: "text/plain",
      });
    }

    if (hasActiveWorker && !(await swReady()).controlled) {
      await page.reload();
      const controlled = await expect
        .poll(async () => (await swReady()).controlled, { timeout: 20_000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (!controlled) {
        await testInfo.attach("sw-control-warning.txt", {
          body: "Service worker registered but page never became controlled.",
          contentType: "text/plain",
        });
      }
    }

    await setOffline(context, page);
    if (hasActiveWorker) {
      await page.reload();
    }
    await expect(page.locator("header")).toBeVisible();
    await waitForFloorPlanReady(page);
    await detachDiagnostics();
  });

  test("offline upload writes queue entries in IndexedDB", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    const detachDiagnostics = await attachBrowserDiagnostics(page, testInfo);
    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);
    await setOffline(context, page);

    await placePinAndSelect(page, "Offline Queue Pin");
    await uploadDummyPhotoFromPicker(page);

    const q = await getQueueCounts(page);
    await expect(q.queued).toBeGreaterThan(0);
    await detachDiagnostics();
  });

  test("queued uploads flush after reconnect", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    const detachDiagnostics = await attachBrowserDiagnostics(page, testInfo);
    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);

    await setOffline(context, page);
    await placePinAndSelect(page, "Offline Flush Pin");
    await uploadDummyPhotoFromPicker(page);

    const before = await getQueueCounts(page);
    await expect(before.queued).toBeGreaterThan(0);

    await setOnline(context);
    await expect
      .poll(async () => (await getQueueCounts(page)).queued, {
        timeout: 45_000,
        intervals: [500, 1000, 1500, 2000, 2500],
      })
      .toBe(0);

    await expect((await getQueueCounts(page)).failed).toBe(0);
    await detachDiagnostics();
  });

  test("offline keeps floor/pdf + pin photo and mobile 360 close works", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    const detachDiagnostics = await attachBrowserDiagnostics(page, testInfo);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);
    await waitForFloorPlanReady(page);

    const pinName = `Offline View Pin ${Date.now()}`;
    await placePinAndSelect(page, pinName);
    await uploadDummyPhotoFromPicker(page);
    await expect(page.locator(`img[alt="${pinName}"]`)).toBeVisible({ timeout: 20_000 });

    await setOffline(context, page);
    await page.reload();
    await expect(page.locator("header")).toBeVisible({ timeout: 20_000 });
    await waitForFloorPlanReady(page);

    const marker = page.locator("[data-testid^='floor-map-marker-']").first();
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    const pinPhoto = page.locator(`img[alt="${pinName}"]`).first();
    await expect(pinPhoto).toBeVisible({ timeout: 20_000 });

    await pinPhoto.hover({ force: true });
    const view360Btn = page.getByRole("button", { name: /view full 360/i });
    await expect(view360Btn).toBeVisible({ timeout: 10_000 });
    await view360Btn.click();

    const closeViewerBtn = page.getByRole("button", { name: new RegExp(`Close panorama viewer for ${pinName}`, "i") });
    await expect(closeViewerBtn).toBeVisible({ timeout: 10_000 });
    await closeViewerBtn.click();
    await expect(closeViewerBtn).toBeHidden({ timeout: 10_000 });

    await detachDiagnostics();
  });
});
