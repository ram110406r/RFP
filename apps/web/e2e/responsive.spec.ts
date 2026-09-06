import { expect, test } from "@playwright/test";

const widths = [390, 414, 768, 1024, 1280, 1440] as const;
const staticRoutes = [
  "/",
  "/tenders",
  "/apply",
  "/requirements",
  "/responses",
  "/reviews",
  "/submissions",
  "/pipeline",
  "/analytics",
  "/knowledge",
  "/knowledge/library",
  "/knowledge/sources",
  "/knowledge/issues",
  "/workspace",
  "/organization",
  "/settings",
  "/settings/tender-sources",
  "/profile",
  "/access",
  "/audits",
  "/notifications",
  "/templates",
] as const;

test.describe("authenticated responsive route matrix", () => {
  const authenticated = Boolean(process.env.PLAYWRIGHT_E2E && process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST && process.env.PLAYWRIGHT_E2E_EMAIL && process.env.PLAYWRIGHT_E2E_PASSWORD);
  test.skip(!authenticated && process.env.PLAYWRIGHT_GUEST_AUDIT !== "1", "Set the Firebase emulator test environment, or use PLAYWRIGHT_GUEST_AUDIT=1 against a development-only guest server for geometry checks.");

  for (const width of widths) {
    for (const route of staticRoutes) {
      test(`${route} fits ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route)}(?:\\?|$)`));
        await assertNoPageOverflow(page);
      });
    }
  }

  for (const [name, envName, route] of [
    ["tender workspace", "PLAYWRIGHT_TENDER_ID", "/tenders/:id"],
    ["apply workspace", "PLAYWRIGHT_TENDER_ID", "/apply/:id"],
    ["requirement detail", "PLAYWRIGHT_REQUIREMENT_ID", "/tenders/:tenderId/requirements/:id"],
    ["knowledge detail", "PLAYWRIGHT_KNOWLEDGE_ID", "/knowledge/:id"],
  ] as const) {
    test(`${name} dynamic route fits mobile, tablet, and desktop`, async ({ page }) => {
      const id = process.env[envName];
      test.skip(!id, `Set ${envName} to exercise this seeded dynamic route.`);
      const tenderId = process.env.PLAYWRIGHT_TENDER_ID ?? id!;
      const resolved = route.replace(":tenderId", tenderId).replace(":id", id!);
      for (const width of [390, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(resolved, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await assertNoPageOverflow(page);
      }
    });
  }

  test("Tender Search controls and detail sheet remain viewport-safe", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tenders", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if (await filters.isVisible()) {
      await filters.click();
      await expect(filters).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("dialog", { name: /filters/i })).toBeVisible();
      await assertNoPageOverflow(page);
      await page.keyboard.press("Escape");
    }
  });

  test("key route screenshots", async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_SCREENSHOTS !== "1", "Set PLAYWRIGHT_SCREENSHOTS=1 to update visual review artifacts.");
    for (const [route, width] of [["/tenders", 390], ["/pipeline", 1024], ["/apply", 1440]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `test-results/responsive-${route.slice(1) || "dashboard"}-${width}.png`, fullPage: true });
    }
  });
});

async function assertNoPageOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(metrics.scrollWidth, `document width ${metrics.scrollWidth}px exceeds viewport ${metrics.innerWidth}px`).toBeLessThanOrEqual(metrics.innerWidth);

  const escaped = await page.locator("a:visible, button:visible, input:visible, select:visible, textarea:visible").evaluateAll((elements) => elements.filter((element) => {
    if (element.closest('[aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
  }).map((element) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 80), aria: element.getAttribute("aria-label") })));
  expect(escaped, `interactive controls outside viewport: ${JSON.stringify(escaped)}`).toEqual([]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
