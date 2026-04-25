import { test, expect } from "@playwright/test";
import {
  ensureFloorPdf,
  loginIfNeeded,
  placePinAndSelect,
  requireE2ECreds,
  waitForFloorPlanReady,
} from "./utils/offlineWorkflowHelpers";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://wwqjpkskvqpbmuqmyspq.supabase.co";
const BASE_URL = process.env.BASE_URL || "https://siteview-pro.onrender.com";
const SHOULD_ASSERT_SHARE_MAP_UI = BASE_URL.includes("localhost");

test.describe("Prod Share + Delete Job", () => {
  test.skip(!requireE2ECreds(), "Set E2E_EMAIL and E2E_PASSWORD.");

  test("creates share link and deletes job with name confirmation", async ({ page, request }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await loginIfNeeded(page);

    // Ensure a deterministic test job exists
    await page.getByRole("button", { name: /select job/i }).click();
    const testJobName = `Prod E2E ${Date.now()}`;
    await page.getByRole("button", { name: /new job/i }).click();
    await page.getByLabel("Job Name *").fill(testJobName);
    await page.getByRole("button", { name: "Create Job" }).click();
    await expect(page.getByRole("heading", { name: testJobName })).toBeVisible({ timeout: 20_000 });
    await ensureFloorPdf(page);
    await waitForFloorPlanReady(page);
    await placePinAndSelect(page, "Share Map Pin");

    // Open share modal and verify tokenized link
    await page.getByRole("button", { name: /share/i }).first().click();
    const shareInput = page.locator("input[readonly]").first();
    await expect(shareInput).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => await shareInput.inputValue(), { timeout: 20_000 })
      .toMatch(/\/share\/[a-zA-Z0-9]+$/);
    const shareUrl = await shareInput.inputValue();
    await testInfo.attach("share-url.txt", {
      body: shareUrl,
      contentType: "text/plain",
    });
    await page.getByRole("button", { name: /done/i }).click();

    // Validate token through public share endpoint (anonymous path).
    const token = shareUrl.split("/").pop();
    expect(token).toBeTruthy();
    const shareRes = await request.get(`${SUPABASE_URL}/functions/v1/share/${token}`);
    const shareBodyText = await shareRes.text();
    await testInfo.attach("share-endpoint-response.txt", {
      body: `status=${shareRes.status()}\n${shareBodyText}`,
      contentType: "text/plain",
    });
    expect(shareRes.ok()).toBeTruthy();
    const sharePayload = JSON.parse(shareBodyText);
    expect(sharePayload?.job?.name).toBe(testJobName);
    const sharePins = Array.isArray(sharePayload?.pins) ? sharePayload.pins : [];
    expect(sharePins.length).toBeGreaterThan(0);

    // Verify shared read-only map interaction in local/dev build.
    if (SHOULD_ASSERT_SHARE_MAP_UI) {
      await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("share-floor-map")).toBeVisible({ timeout: 20_000 });
      const mapImage = page.getByTestId("share-floor-map").locator("img").first();
      await expect(mapImage).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => (await mapImage.getAttribute("src")) || "", { timeout: 20_000 })
        .toContain("data:image");

      const firstPinId = sharePins[0].id as string;
      const marker = page.getByTestId(`share-map-marker-${firstPinId}`);
      const card = page.getByTestId(`share-pin-card-${firstPinId}`);
      await expect(marker).toBeVisible({ timeout: 20_000 });
      await marker.click();
      await expect(card).toHaveAttribute("data-selected", "true", { timeout: 10_000 });

      // Return to authenticated app shell for delete flow.
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: /select job/i })).toBeVisible({
        timeout: 20_000,
      });
    }

    // Delete the test job via header dropdown with typed confirmation
    await page.getByRole("button", { name: /select job/i }).click();
    await page.getByRole("button", { name: /delete job/i }).click();
    await page.getByPlaceholder(testJobName).fill(testJobName);
    await page.getByRole("button", { name: /^delete job$/i }).click();

    await expect(page.getByText(new RegExp(`Job "${testJobName}" deleted`, "i"))).toBeVisible({
      timeout: 20_000,
    });
  });
});

