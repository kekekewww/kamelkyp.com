import { availableParallelism } from "node:os";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Each pool worker is a workerd process. On many-core Windows machines (32
// threads → Vitest's default of 31 workers) the pool drops connections
// (ECONNRESET, "[vitest-pool]: Failed to start … worker"). Wall time is flat
// above 4 workers (2026-10-13: 31 → 91.4 s, 8 → 90.8 s, 4 → 90.7 s), so cap at
// 8 and otherwise keep Vitest's own default (cores − 1): CI (2–4 vCPU) runs
// exactly as before. VITEST_MAX_WORKERS or --maxWorkers still override.
const WORKER_CAP = 8;
const maxWorkers = Math.max(
  1,
  Math.min(WORKER_CAP, availableParallelism() - 1),
);

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
    maxWorkers,
    setupFiles: ["./tests/helpers/apply-migrations.ts"],
  },
});
