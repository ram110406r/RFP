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

if (typeof Bun === "undefined") test.describe("authenticated responsive route matrix", () => {
  const authenticated = Boolean(process.env.PLAYWRIGHT_E2E && process.env.PLAYWRIGHT_E2E_EMAIL && process.env.PLAYWRIGHT_E2E_PASSWORD);
  test.skip(!authenticated && process.env.PLAYWRIGHT_GUEST_AUDIT !== "1", "Set PLAYWRIGHT_E2E with a seeded test user, or use PLAYWRIGHT_GUEST_AUDIT=1 against a development-only guest server for geometry checks.");

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

  test("production sidebar desktop dimensions and expanded nested active state", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tendyy.sidebar-collapsed", "false"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/requirements", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    const sidebar = page.locator("[data-sidebar-state='expanded']");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveJSProperty("offsetWidth", 224);
    await expect(page.locator("[data-sidebar-parent='Apply']")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-sidebar-child='Requirements']")).toHaveAttribute("aria-current", "page");

    await expectAppShellOffset(page, 224);
    await assertNoPageOverflow(page);
  });

  test("production sidebar collapsed rail, tooltip, flyout, and Escape behavior", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tendyy.sidebar-collapsed", "true"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/apply", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    const sidebar = page.locator("[data-sidebar-state='collapsed']");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveJSProperty("offsetWidth", 64);

    await page.locator("[data-sidebar-link='Tender Search']").hover();
    await expect(page.getByRole("tooltip", { name: "Tender Search" })).toBeVisible();

    await page.locator("[data-sidebar-parent='Apply']").hover();
    const applyFlyout = page.locator("[data-sidebar-flyout='Apply']");
    await expect(applyFlyout).toBeVisible();
    await applyFlyout.getByRole("link", { name: "Responses" }).hover();
    await expect(applyFlyout).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(applyFlyout).toBeHidden();

    await page.locator("[data-sidebar-parent='Apply']").hover();
    await applyFlyout.getByRole("link", { name: "Responses" }).click();
    await expect(page).toHaveURL(/\/responses(?:\?|$)/);
    await expect(applyFlyout).toBeHidden();

    await page.locator("[data-sidebar-parent='Knowledge Brain']").hover();
    const knowledgeFlyout = page.locator("[data-sidebar-flyout='Knowledge Brain']");
    await expect(knowledgeFlyout).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(knowledgeFlyout).toBeHidden();

    await expectAppShellOffset(page, 64);
    await assertNoPageOverflow(page);
  });

  test("production mobile drawer opens, traps focus, and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tenders", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Main navigation" });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
    await assertNoPageOverflow(page);
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

async function expectAppShellOffset(page: import("@playwright/test").Page, expected: number) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const shellContent = document.querySelector<HTMLElement>("[data-app-shell-content]");
        return shellContent ? Number.parseFloat(window.getComputedStyle(shellContent).marginLeft) : 0;
      }),
    )
    .toBe(expected);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
