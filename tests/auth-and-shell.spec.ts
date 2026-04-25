import { test, expect } from "@playwright/test";
import { loginIfNeeded, requireE2ECreds } from "./utils/offlineWorkflowHelpers";

test.describe("Auth and Shell", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("logs in and loads app shell", async ({ page }) => {
    await loginIfNeeded(page);
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("button", { name: /sync status/i })).toBeVisible();
  });
});
