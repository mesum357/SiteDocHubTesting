import { test, expect } from "@playwright/test";
import {
  ensureFloorPdf,
  ensureJobSelected,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
} from "./utils/offlineWorkflowHelpers";
import { mockInsta360Api } from "./utils/insta360Mock";

test.describe("Insta360 (Mocked)", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("captures from mocked camera and assigns to pin", async ({ page }) => {
    test.setTimeout(120_000);
    await mockInsta360Api(page);
    await loginIfNeeded(page);
    await ensureJobSelected(page, "E2E Offline Workflow Job");
    await ensureFloorPdf(page);

    const pinInList = page.locator("aside").first().locator("ul").getByRole("button").first();
    if (await pinInList.isVisible().catch(() => false)) {
      await pinInList.click();
    } else {
      await placePinAndSelect(page, "Insta360 Mock Pin");
    }
    await expect(page.getByText(/select a pin to view/i)).toBeHidden({ timeout: 5_000 });

    await page.getByRole("button", { name: /capture with insta360/i }).click();
    await expect(page.getByText(/photo saved to|photo uploaded/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/photo captured/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
