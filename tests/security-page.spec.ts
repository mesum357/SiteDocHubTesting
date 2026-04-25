import { expect, test } from "@playwright/test";
import { loginIfNeeded, requireE2ECreds } from "./utils/offlineWorkflowHelpers";

test.describe("Security page", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("opens from profile menu and validates password-gated actions", async ({ page }) => {
    await page.goto("/");
    await loginIfNeeded(page);

    // Open account menu and navigate to security page
    await page.getByRole("button", { name: /account/i }).click();
    await page.getByRole("button", { name: /security/i }).click();

    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible();

    // Name update requires current password
    await page.getByRole("button", { name: /update name/i }).click();
    await expect(page.getByText(/enter your password to change name/i)).toBeVisible();

    // Email update requires current password
    await page.getByRole("button", { name: /update email/i }).click();
    await expect(page.getByText(/enter your current password to change email/i)).toBeVisible();

    // Password update validates mismatch before submitting to backend
    await page.getByLabel("Current password").nth(2).fill("dummy-current-password");
    await page.getByLabel("New password").fill("new-pass-123");
    await page.getByLabel("Confirm new password").fill("new-pass-456");
    await page.getByRole("button", { name: /update password/i }).click();
    await expect(page.getByText(/new passwords do not match/i)).toBeVisible();
  });
});

