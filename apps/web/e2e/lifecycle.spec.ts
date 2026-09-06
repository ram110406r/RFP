import { expect, test } from "@playwright/test";

test.describe("lifecycle routing", () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with Firebase Emulator and a disposable API/database.");

  for (const width of [390, 414, 768, 1024, 1280, 1440]) {
    test(`public auth and onboarding routes fit ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/login", "/signup", "/join", "/onboarding"]) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("body")).toBeVisible();
        const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
      }
    });
  }
});
