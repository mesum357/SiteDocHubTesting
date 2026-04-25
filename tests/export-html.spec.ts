import { test, expect } from "@playwright/test";
import {
  ensureFloorPdf,
  ensureJobSelected,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
  uploadDummyPhotoFromPicker,
} from "./utils/offlineWorkflowHelpers";

test.describe("Export HTML Report", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("exports an html report file", async ({ page }) => {
    test.setTimeout(120_000);

    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Export Job");
    await ensureFloorPdf(page);
    await placePinAndSelect(page, "Export Pin");
    await uploadDummyPhotoFromPicker(page);
    await expect(page.getByText(/photo uploaded|photo saved/i)).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    expect(filename.toLowerCase()).toContain(".html");
    await expect(page.getByText(/exported .*\.html/i)).toBeVisible({ timeout: 15_000 });
  });
});

