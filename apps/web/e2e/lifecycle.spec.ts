import { expect, test } from "@playwright/test";

test.describe("lifecycle routing", () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with Firebase Emulator and a disposable API/database.");

  test("unauthenticated users are shown the sign-in screen", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
});
