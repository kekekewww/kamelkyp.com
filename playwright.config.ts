import { defineConfig, devices } from "@playwright/test";

const loopback = process.env.E2E_LOOPBACK === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 4,
  webServer: loopback
    ? {
        command: "npm run preview:ci",
        url: "http://127.0.0.1:8787/health",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
  use: {
    baseURL: loopback ? "http://127.0.0.1:8787" : process.env.PREVIEW_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
