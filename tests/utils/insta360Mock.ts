import type { Page } from "@playwright/test";

export async function mockInsta360Api(page: Page) {
  const tinyJpeg = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  await page.route("**/api/camera/osc/info", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ manufacturer: "Insta360", model: "X2" }),
    });
  });

  await page.route("**/api/camera/osc/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: {
          batteryLevel: 78,
          storageFreeSpace: 2048,
        },
      }),
    });
  });

  await page.route("**/api/camera/osc/commands/execute", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: "done",
        results: {
          fileUrls: ["http://192.168.42.1/DCIM/100MEDIA/mock.jpg"],
        },
      }),
    });
  });

  await page.route("**/api/camera/DCIM/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      body: tinyJpeg,
    });
  });
}
