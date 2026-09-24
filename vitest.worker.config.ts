import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.base.jsonc" },
      miniflare: {
        compatibilityDate: "2026-06-30",
        // LEGACY_DB: an empty second database the legacy-import tests migrate
        // in stages (0001–0004, legacy rows, then 0005–0008).
        d1Databases: ["DB", "LEGACY_DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./tests/helpers/apply-migrations.ts"],
  },
});
