import { defineConfig, devices } from "@playwright/test";
import { z } from "zod";

const baseURL = z.url().parse(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    reducedMotion: "reduce",
    // Traces include HTTP headers; never upload a Vercel bypass credential.
    trace: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  // npm run e2e provisions a disposable database only when no explicit URL is supplied.
  // Explicit targets are used as-is: no local server, mocks or production credentials.
  webServer: process.env.PLAYWRIGHT_LOCAL_SERVER === "1" ? {
    command: "npm run build && npm run start -- --hostname localhost --port 3000",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  } : undefined,
});
