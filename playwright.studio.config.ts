import { defineConfig, devices } from "@playwright/test";
import {
  STUDIO_E2E_ORIGIN,
  STUDIO_E2E_PORT,
  studioDevEnvironment,
} from "./tests/e2e-studio/harness";

// Studio browser flows against the Vite dev server with a local dev owner
// (admin-architecture §3.6). Deployable builds are covered by the loopback
// suite in playwright.config.ts, which proves the Studio answers 403.
export default defineConfig({
  testDir: "./tests/e2e-studio",
  globalSetup: "./tests/e2e-studio/harness.ts",
  workers: 1,
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${STUDIO_E2E_PORT} --strictPort`,
    url: `${STUDIO_E2E_ORIGIN}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: studioDevEnvironment(),
  },
  use: {
    baseURL: STUDIO_E2E_ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [{ name: "studio-desktop", use: { ...devices["Desktop Chrome"] } }],
});
