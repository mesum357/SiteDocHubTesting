import { test, expect } from "@playwright/test";

// ============================================================================
// TEST SETUP: Provide your test user credentials here
// This user needs to have the "field_worker" or "admin" role and be approved.
// ============================================================================
const TEST_EMAIL = "admin@sitedochb.com"; // UPDATE THIS
const TEST_PASSWORD = "AdminPassword123!"; // UPDATE THIS

test.describe("Offline Synchronization Workflow", () => {
  // We need to run tests in a single browser context sequentially
  test.describe.configure({ mode: "serial" });

  test("should capture photo offline and sync when online", async ({ page, context }) => {
    // 1. Navigate and Login (Online)
    await page.goto("/");

    // Check if we are on the login page
    if (await page.locator('input[type="email"]').isVisible()) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for navigation to dashboard
      await expect(page.getByRole('button', { name: /account/i })).toBeVisible({ timeout: 10000 });
    }

    // Ensure we have at least one job and one floor to test with
    const noJobsMessage = page.locator("text=No jobs yet");
    if (await noJobsMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("No jobs found, creating a temporary job and floor...");
      await page.getByRole('button', { name: "New Job" }).click();
      await page.fill('input[name="name"]', "Offline Test Job");
      await page.click('button:has-text("Create Job")');
      await expect(page.locator("text=Offline Test Job")).toBeVisible();
    } else {
      // If jobs exist but not selected, select the first one
      const selectJobBtn = page.getByRole('button', { name: "Select a job" });
      if (await selectJobBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectJobBtn.click();
        await page.locator('[role="option"]').first().click();
      }
    }

    // Ensure a floor is selected or create one
    const noFloorMessage = page.locator("text=No floor plan loaded");
    if (await noFloorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
      const addFloorBtn = page.getByRole('button', { name: /add floor/i });
      if (await addFloorBtn.isVisible()) {
        await addFloorBtn.click();
        await page.fill('input[name="name"]', "Test Floor");
        await page.click('button:has-text("Add Floor")');
        // Wait for it to appear in the sidebar
        await expect(page.locator('button').filter({ hasText: 'Test Floor' })).toBeVisible();
      } else {
        // Floor already exists in sidebar, just click the first one
        await page.locator('button').filter({ hasText: /Floor/ }).first().click();
      }
    }

    // Now check if the selected floor needs a blueprint PDF uploaded
    const uploadFloorPlanText = page.locator('text=Upload Floor Plan');
    if (await uploadFloorPlanText.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("Uploading dummy PDF blueprint...");
      // A minimal valid uncompressed PDF file base64 string
      const pdfBase64 = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMDAgMTAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU4IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTg4CiUlRU9GCg==";
      const buffer = Buffer.from(pdfBase64, "base64");
      
      const fileChooserPromise = page.waitForEvent('filechooser');
      await uploadFloorPlanText.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({ name: 'blueprint.pdf', mimeType: 'application/pdf', buffer });
      
      // Wait for the upload to complete and the canvas to appear (whether img renders or falls back to error overlay)
      await expect(page.locator('[data-testid="floor-plan-canvas"]')).toBeVisible({ timeout: 15000 });
    }

    // Ensure the Place New Pin button is enabled
    await expect(page.getByRole('button', { name: 'Place New Pin' })).toBeEnabled({ timeout: 10000 });

    // 2. Go Offline
    console.log("Disconnecting network...");
    await context.setOffline(true);

    // Wait a moment for the application to detect the offline state
    await page.waitForTimeout(1000);

    // Verify the UI shows Offline status
    await expect(page.locator('text=Offline')).toBeVisible();

    // 3. Create a Pin (Offline)
    console.log("Creating a pin offline...");
    await page.getByRole('button', { name: 'Place New Pin' }).click();

    // Click on the floor plan canvas to place the pin
    // We click the main canvas container so it works even if the PDF worker failed
    await page.locator('[data-testid="floor-plan-canvas"]').click({
      position: { x: 10, y: 10 }
    });
    
    // Wait for the draft pin input and submit it
    const draftInput = page.locator('input[placeholder^="Pin name"]');
    await expect(draftInput).toBeVisible({ timeout: 5000 });
    await draftInput.fill('Offline Pin 1');
    await draftInput.press('Enter');
    
    // Select the newly created pin from the sidebar
    await page.getByRole('button', { name: /Offline Pin 1/ }).click();

    // 4. Capture/Upload Photo (Offline)
    console.log("Uploading photo offline...");
    // Simulate uploading a file by attaching it to the hidden input
    // We create a dummy image buffer
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    // Setup file chooser intercept
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text=Upload Image').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'test-offline.jpg',
      mimeType: 'image/jpeg',
      buffer: buffer
    });

    // Verify UI updates instantly (even though we are offline)
    // The image preview should be visible
    await expect(page.locator('img[alt="Pin preview"]')).toBeVisible({ timeout: 5000 });

    // The sync status should show queued items
    await expect(page.locator('text=Queued')).toBeVisible();

    // 5. Go Online
    console.log("Reconnecting network...");
    await context.setOffline(false);

    // 6. Verify Synchronization
    // The background sync engine should detect the online event and process the queue
    console.log("Waiting for background sync to complete...");

    // The "Queued" badge should eventually change to "Synced" or disappear, and "Online" / "Synced" should show
    await expect(page.locator('text=Synced').first()).toBeVisible({ timeout: 15000 });

    console.log("Test completed successfully!");
  });
});
