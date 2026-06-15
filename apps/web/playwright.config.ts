import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @lp-guardian/server run dev",
      url: "http://localhost:3001/health",
      reuseExistingServer: true,
      timeout: 90_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @lp-guardian/web run dev",
      url: "http://localhost:3100",
      reuseExistingServer: true,
      timeout: 60_000,
      cwd: "../..",
    },
  ],
});
