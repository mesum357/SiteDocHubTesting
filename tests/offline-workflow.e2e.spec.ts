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

test.describe("Offline Workflow (Comprehensive)", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD to run offline E2E.");

  test("works offline and auto-syncs queued uploads when online", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    const detachDiagnostics = await attachBrowserDiagnostics(page, testInfo);

    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);

    // Prime app shell + SW + floor canvas while online.
    await waitForFloorPlanReady(page);
    await page.waitForTimeout(1200);

    // Validate SW registration; in dev the page may need one extra reload
    // before controller is attached.
    const swReady = async () =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return {
          hasRegistration: Boolean(reg),
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

    const firstStatus = await swReady();
    if (hasActiveWorker && !firstStatus.controlled) {
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

    // Go offline and assert app remains functional after refresh.
    await setOffline(context, page);
    if (hasActiveWorker) {
      await page.reload();
      await expect(page.locator("header")).toBeVisible();
    }
    await waitForFloorPlanReady(page);

    await placePinAndSelect(page, "Offline E2E Pin");
    await uploadDummyPhotoFromPicker(page);
    await expect(page.getByText(/photo uploaded|photo saved/i)).toBeVisible({ timeout: 8_000 });

    const offlineQueue = await getQueueCounts(page);
    await expect(
      offlineQueue.queued,
      "Expected at least one queued item after offline upload."
    ).toBeGreaterThan(0);

    // Reconnect and verify automatic queue flush.
    await setOnline(context);
    await expect
      .poll(async () => {
        const q = await getQueueCounts(page);
        return q.queued;
      }, { timeout: 20_000, intervals: [500, 1000, 1500] })
      .toBe(0);

    await expect(page.getByText(/synced/i).first()).toBeVisible({ timeout: 10_000 });

    const afterFlush = await getQueueCounts(page);
    await expect(afterFlush.failed).toBe(0);

    await detachDiagnostics();
  });
});
