import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

const authFile = ".auth/user.json";
const email = process.env.PLAYWRIGHT_E2E_EMAIL;
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;

if (typeof Bun === "undefined") setup("authenticate with email and password", async ({ page, context }) => {
  setup.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 to run browser integration tests.");
  setup.skip(!email || !password, "Set PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD for a seeded test user.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email")).toHaveCount(0, { timeout: 30_000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  mkdirSync(".auth", { recursive: true });
  await context.storageState({ path: authFile, indexedDB: true });
});
