import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

export const TEST_EMAIL = process.env.E2E_EMAIL;
export const TEST_PASSWORD = process.env.E2E_PASSWORD;

export function requireE2ECreds() {
  return Boolean(TEST_EMAIL && TEST_PASSWORD);
}

export async function loginIfNeeded(page: Page) {
  await page.goto("/");
  const emailInput = page.locator("#email");
  const appHeader = page.locator("header");

  // Auth bootstrap can briefly render a loading state; wait until either
  // the login form or app shell is visible.
  await expect
    .poll(
      async () =>
        (await emailInput.isVisible().catch(() => false)) ||
        (await appHeader.isVisible().catch(() => false)),
      { timeout: 20_000 }
    )
    .toBeTruthy();

  if (!(await emailInput.isVisible().catch(() => false))) return;

  await page.fill("#email", TEST_EMAIL!);
  await page.fill("#password", TEST_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator("header")).toBeVisible({ timeout: 20_000 });
}

export async function ensureJobSelected(page: Page, jobName: string) {
  const noJobsCta = page.getByRole("button", { name: /new job/i });
  if (await noJobsCta.isVisible().catch(() => false)) {
    await noJobsCta.click();
    await page.getByLabel("Job Name *").fill(jobName);
    await page.getByLabel("Description").fill("Offline SW test");
    await page.getByLabel("First Floor Label").fill("Floor 1");
    await page.getByRole("button", { name: "Create Job" }).click();
    await expect(page.getByRole("heading", { name: jobName })).toBeVisible();
    return;
  }

  const jobSelectorButton = page.getByRole("button", { name: /select job/i });
  if (await jobSelectorButton.isVisible().catch(() => false)) {
    await jobSelectorButton.click();
    const candidate = page.getByRole("button", { name: new RegExp(jobName, "i") });
    if (await candidate.first().isVisible().catch(() => false)) {
      await candidate.first().click();
    } else {
      await page.getByRole("button", { name: /new job/i }).click();
      await page.getByLabel("Job Name *").fill(jobName);
      await page.getByRole("button", { name: "Create Job" }).click();
    }
  }
}

/** Opens the new-job modal: empty sidebar shows "New Job"; otherwise it lives in the header job menu. */
export async function openNewJobModal(page: Page) {
  const sidebarNewJob = page.locator("aside").getByRole("button", { name: /new job/i });
  if (await sidebarNewJob.isVisible().catch(() => false)) {
    await sidebarNewJob.click();
    return;
  }
  await page.getByRole("button", { name: "Select job" }).click();
  const menuNewJob = page.getByRole("button", { name: /new job/i });
  await expect(menuNewJob).toBeVisible({ timeout: 10_000 });
  await menuNewJob.click();
}

export async function createNewJob(page: Page, jobName: string, firstFloor = "Floor 1") {
  await openNewJobModal(page);
  await page.getByLabel("Job Name *").fill(jobName);
  await page.getByLabel("Description").fill("E2E flow");
  await page.getByLabel("First Floor Label").fill(firstFloor);
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByRole("heading", { name: jobName })).toBeVisible({ timeout: 20_000 });
}

export async function addFloor(page: Page, floorName: string) {
  const addFloorBtn = page.getByRole("button", { name: /add floor/i });
  await addFloorBtn.click();
  const input = page.getByPlaceholder("Floor name");
  await expect(input).toBeVisible();
  await input.fill(floorName);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: new RegExp(floorName, "i") })).toBeVisible();
}

export async function ensureFloorPdf(page: Page) {
  await expect
    .poll(
      async () => {
        const upload = await page.getByText("Upload Floor Plan").first().isVisible().catch(() => false);
        const root = await page.locator("[data-testid='floor-plan-root']").isVisible().catch(() => false);
        const canvas = await page.locator("[data-testid='floor-plan-canvas']").isVisible().catch(() => false);
        return upload || root || canvas;
      },
      { timeout: 30_000 }
    )
    .toBeTruthy();

  const uploadLabel = page.getByText("Upload Floor Plan").first();
  if (!(await uploadLabel.isVisible().catch(() => false))) {
    await expect(page.locator("[data-testid='floor-plan-canvas']")).toBeVisible({ timeout: 20_000 });
    return;
  }

  const pdfBase64 =
    "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMDAgMTAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU4IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTg4CiUlRU9GCg==";
  const buffer = Buffer.from(pdfBase64, "base64");

  const chooserPromise = page.waitForEvent("filechooser");
  await uploadLabel.click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "offline-floorplan.pdf",
    mimeType: "application/pdf",
    buffer,
  });

  await expect(page.locator("[data-testid='floor-plan-canvas']")).toBeVisible({
    timeout: 20_000,
  });
}

/** Wait until the interactive PDF canvas is mounted (not loading / upload zone). */
export async function waitForFloorPlanReady(page: Page) {
  await expect
    .poll(
      async () =>
        await page
          .evaluate(() => {
            const root = document.querySelector("[data-testid='floor-plan-root']") as HTMLElement | null;
            if (!root) return "missing";
            return root.dataset.floorPlanState ?? "unknown";
          })
          .catch(() => "missing"),
      { timeout: 45_000 }
    )
    .toBe("ready");

  await expect(page.locator("[data-testid='floor-plan-canvas']")).toBeVisible({ timeout: 15_000 });
}

export async function placePinAndSelect(page: Page, pinName: string) {
  const placeButton = page.getByRole("button", { name: /place new pin/i });
  await expect(placeButton).toBeEnabled();
  await placeButton.click();
  await expect(page.getByText(/placement mode/i)).toBeVisible({ timeout: 5_000 });
  await waitForFloorPlanReady(page);
  const canvas = page.locator("[data-testid='floor-plan-canvas']");
  if (await canvas.isVisible().catch(() => false)) {
    await canvas.click({ position: { x: 240, y: 240 }, force: true });
  } else {
    // Fallback for render-loading/failed-render view where test id may be absent.
    await page.locator("main").click({ position: { x: 240, y: 240 }, force: true });
  }

  const draftNameInput = page.getByPlaceholder(/pin name/i);
  if (!(await draftNameInput.isVisible().catch(() => false))) {
    // Retry several points in case one lands on existing pin hotspot.
    const retryPoints = [
      { x: 320, y: 220 },
      { x: 180, y: 300 },
      { x: 420, y: 340 },
    ];
    for (const point of retryPoints) {
      if (await draftNameInput.isVisible().catch(() => false)) break;
      if (await canvas.isVisible().catch(() => false)) {
        await canvas.click({ position: point, force: true });
      } else {
        await page.locator("main").click({ position: point, force: true });
      }
    }
  }
  await expect(draftNameInput).toBeVisible({ timeout: 8_000 });
  await draftNameInput.fill(pinName);
  await draftNameInput.press("Enter");

  // Expected behavior: new pin appears in sidebar and can be selected.
  const pinInList = page
    .locator("aside")
    .first()
    .getByRole("button", { name: new RegExp(pinName, "i") })
    .first();
  await expect(
    pinInList,
    "Pin creation failed: likely regression in floor-plan placement flow."
  ).toBeVisible({ timeout: 8_000 });
  await pinInList.click();
}

export async function uploadDummyPhotoFromPicker(page: Page) {
  const imageBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /browse/i }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "offline-photo.jpg",
    mimeType: "image/jpeg",
    buffer: imageBuffer,
  });
}

export async function setOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await page.waitForTimeout(800);
}

export async function setOnline(context: BrowserContext) {
  await context.setOffline(false);
}

export async function getQueueCounts(page: Page) {
  return page.evaluate(async () => {
    const openDb = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("SiteDocHB-db");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

    const db = await openDb();
    const tx = db.transaction("upload_queue", "readonly");
    const store = tx.objectStore("upload_queue");
    const allReq = store.getAll();

    const all = await new Promise<any[]>((resolve, reject) => {
      allReq.onerror = () => reject(allReq.error);
      allReq.onsuccess = () => resolve((allReq.result ?? []) as any[]);
    });

    const queued = all.filter((i) => i.status === "pending" || i.status === "syncing").length;
    const failed = all.filter((i) => i.status === "failed").length;
    return { queued, failed, total: all.length };
  });
}

export async function attachBrowserDiagnostics(page: Page, testInfo: TestInfo) {
  const errors: string[] = [];
  const requestFailures: string[] = [];

  page.on("pageerror", (err) => {
    errors.push(String(err));
  });
  page.on("requestfailed", (req) => {
    requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "failed"}`);
  });

  testInfo.attach("browser-diagnostics-hooks", {
    body: "Attached pageerror/requestfailed capture for offline workflow diagnostics.",
    contentType: "text/plain",
  });

  return async () => {
    await testInfo.attach("page-errors.log", {
      body: errors.join("\n") || "none",
      contentType: "text/plain",
    });
    await testInfo.attach("request-failures.log", {
      body: requestFailures.join("\n") || "none",
      contentType: "text/plain",
    });
  };
}
