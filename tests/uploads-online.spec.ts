import { test, expect } from "@playwright/test";
import {
  createNewJob,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
  uploadDummyPhotoFromPicker,
} from "./utils/offlineWorkflowHelpers";

test.describe("Uploads (Online)", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("uploads floor PDF and pin photo online", async ({ page }) => {
    test.setTimeout(120_000);
    const jobName = `E2E Uploads ${Date.now()}`;
    await loginIfNeeded(page);
    await createNewJob(page, jobName, "PDF Floor");

    // Floor PDF upload
    const pdfBase64 =
      "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMDAgMTAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU4IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTg4CiUlRU9GCg==";
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Upload Floor Plan").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "e2e-floor.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await expect(page.getByText(/Rendering floor plan/i)).toBeVisible({ timeout: 15_000 });

    await placePinAndSelect(page, "Online Upload Pin");
    await uploadDummyPhotoFromPicker(page);
    await expect(page.getByText(/photo uploaded|photo saved/i)).toBeVisible();
  });
});
