import { test, expect } from "@playwright/test";
import {
  createNewJob,
  ensureFloorPdf,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
  setOffline,
  setOnline,
  uploadDummyPhotoFromPicker,
} from "./utils/offlineWorkflowHelpers";

test.describe("Pin photo sync across devices", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("keeps pin photo visible across devices for online and offline uploads", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const jobName = `E2E Photo Sync ${Date.now()}`;
    const pinName = "Sync Pin";

    try {
      // Device A creates the job and uploads a photo online.
      await loginIfNeeded(pageA);
      await createNewJob(pageA, jobName, "Sync Floor");
      await ensureFloorPdf(pageA);
      await placePinAndSelect(pageA, pinName);
      await uploadDummyPhotoFromPicker(pageA);
      await expect(pageA.getByText(/photo uploaded|photo saved/i)).toBeVisible({
        timeout: 20_000,
      });

      // Device B logs in and must see the same photo.
      await loginIfNeeded(pageB);
      await pageB.getByRole("button", { name: /select job/i }).click();
      await pageB.getByRole("button", { name: new RegExp(jobName, "i") }).first().click();
      await pageB.getByRole("button", { name: new RegExp(pinName, "i") }).first().click();
      await expect(pageB.locator('img[alt="Pin preview"]')).toBeVisible({
        timeout: 20_000,
      });

      // Device A goes offline, uploads again, then syncs back online.
      await setOffline(contextA, pageA);
      await uploadDummyPhotoFromPicker(pageA);
      await expect(pageA.locator('img[alt="Pin preview"]')).toBeVisible({
        timeout: 10_000,
      });
      await setOnline(contextA);
      await expect(pageA.getByText(/synced/i).first()).toBeVisible({
        timeout: 20_000,
      });

      // Device B refreshes and still sees the photo.
      await pageB.reload();
      await pageB.getByRole("button", { name: new RegExp(pinName, "i") }).first().click();
      await expect(pageB.locator('img[alt="Pin preview"]')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

