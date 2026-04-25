import { test, expect } from "@playwright/test";
import {
  createNewJob,
  getQueueCounts,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
  setOffline,
  setOnline,
  uploadDummyPhotoFromPicker,
} from "./utils/offlineWorkflowHelpers";
import { mockInsta360Api } from "./utils/insta360Mock";

test.describe("Full App Smoke (Online + Offline + Sync)", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("runs full journey end-to-end", async ({ page, context }) => {
    test.setTimeout(180_000);
    const jobName = `Full Smoke ${Date.now()}`;

    await mockInsta360Api(page);
    await loginIfNeeded(page);
    await createNewJob(page, jobName, "Smoke Floor");

    // Upload floor plan
    const pdfBase64 =
      "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMDAgMTAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU4IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTg4CiUlRU9GCg==";
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Upload Floor Plan").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "smoke-floor.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBase64, "base64"),
    });

    // Place pin + capture mocked Insta photo (online)
    await placePinAndSelect(page, "Smoke Pin");
    await page.getByRole("button", { name: /capture with insta360/i }).click();
    await expect(page.getByText(/photo saved to|photo uploaded/i)).toBeVisible({ timeout: 15_000 });

    // Go offline and upload another pin photo to queue
    await setOffline(context, page);
    await placePinAndSelect(page, "Offline Smoke Pin");
    await uploadDummyPhotoFromPicker(page);
    await expect((await getQueueCounts(page)).queued).toBeGreaterThan(0);

    // Reconnect and ensure queue flushes
    await setOnline(context);
    await expect
      .poll(async () => (await getQueueCounts(page)).queued, {
        timeout: 30_000,
        intervals: [500, 1000, 1500, 2000],
      })
      .toBe(0);

    await expect(page.getByText(/synced/i).first()).toBeVisible();
  });
});
