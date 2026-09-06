import { defineConfig, devices } from "@playwright/test";

const hasAuthenticatedEnvironment = Boolean(
  process.env.PLAYWRIGHT_E2E &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST &&
  process.env.PLAYWRIGHT_E2E_EMAIL &&
  process.env.PLAYWRIGHT_E2E_PASSWORD,
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public-chromium",
      testMatch: /lifecycle\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated-chromium",
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: hasAuthenticatedEnvironment ? ".auth/user.json" : undefined,
      },
    },
  ],
});
