// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8002",
    actionTimeout: 10000,
    trace: "on-first-retry",
    video: "on",
    screenshot: "only-on-failure",
    headless: true,
    viewport: { width: 1280, height: 1200 },
    launchOptions: {
      slowMo: 100,
    },
  },
  outputDir: "../../test-results/playwright-output",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "cd ../../../openp41ge-tabs-demo && npx vite --port 8002 --strictPort",
    port: 8002,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
