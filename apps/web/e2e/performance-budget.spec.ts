import { expect, test } from "@playwright/test";

const queueRoutes = ["/apply", "/requirements", "/responses", "/reviews", "/submissions"] as const;
const apiRequestBudget = 8;

if (typeof Bun === "undefined") test.describe("queue performance budgets", () => {
  const authenticated = Boolean(process.env.PLAYWRIGHT_E2E && process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST && process.env.PLAYWRIGHT_E2E_EMAIL && process.env.PLAYWRIGHT_E2E_PASSWORD);
  test.skip(!authenticated && process.env.PLAYWRIGHT_GUEST_AUDIT !== "1", "Set the Firebase emulator test environment, or use PLAYWRIGHT_GUEST_AUDIT=1 against a development-only guest server.");

  for (const route of queueRoutes) {
    test(`${route} stays within initial API request budget`, async ({ page }) => {
      const apiRequests: string[] = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/v1/")) apiRequests.push(url);
      });

      await page.goto(route, { waitUntil: "networkidle" });

      expect(apiRequests.length, `${route} issued too many initial API requests:\n${apiRequests.join("\n")}`).toBeLessThanOrEqual(apiRequestBudget);
    });
  }
});
