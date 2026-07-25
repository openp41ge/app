/**
 * Playwright config for git repository demo E2E tests.
 *
 * Starts the Vite dev server on port 6181, serves the demo HTML,
 * runs tests in headless Chromium.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:6181",
    headless: true,
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "cd ../../../openp41ge-git-repository-demo && npx vite --port 6181 --strictPort",
    port: 6181,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
