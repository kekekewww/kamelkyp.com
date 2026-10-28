import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/*
 * The e2e database fixtures: the one list that both the loopback runner
 * (scripts/run-loopback-e2e.mjs, a local D1) and the preview workflow
 * (.github/workflows/deploy-preview.yml, the remote preview D1) apply.
 *
 * The preview D1 is shared by every pull request's preview run and is never
 * reset. Each seed therefore first removes what an interrupted run left
 * behind, so seeding again is always safe. It only writes rows it owns
 * (`e2e-*` ids), or it saves the rows it replaces so that its cleanup can
 * put them back (terms-e2e.sql). The workflow runs one preview at a time.
 */
export const E2E_DATABASE = "kamelkyp-preview";

/** Applied in this order; the first failure stops the seeding. */
export const SEED_FILES = [
  "tests/fixtures/media-e2e.sql",
  "tests/fixtures/cms-e2e.sql",
  "tests/fixtures/fx-e2e.sql",
  "tests/fixtures/terms-e2e.sql",
];

/** All are applied, even after one fails. */
export const CLEANUP_FILES = [
  "tests/fixtures/cms-e2e-cleanup.sql",
  "tests/fixtures/media-e2e-cleanup.sql",
  "tests/fixtures/fx-e2e-cleanup.sql",
  "tests/fixtures/terms-e2e-cleanup.sql",
];

const wranglerCli = "node_modules/wrangler/bin/wrangler.js";

/**
 * `wrangler d1 execute` for one fixture file. `target` is `["--remote"]` or
 * `["--local", "--config", <generated config>]`.
 */
export function executeFixture(file, target, env = process.env) {
  const result = spawnSync(
    process.execPath,
    [wranglerCli, "d1", "execute", E2E_DATABASE, ...target, "--file", file],
    { cwd: process.cwd(), env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`e2e_fixture_failed ${file}`);
}

export function seedFixtures(target, env) {
  for (const file of SEED_FILES) executeFixture(file, target, env);
}

/** Returns the cleanup files that failed. */
export function cleanupFixtures(target, env) {
  const failed = [];
  for (const file of CLEANUP_FILES) {
    try {
      executeFixture(file, target, env);
    } catch {
      failed.push(file);
    }
  }
  return failed;
}

// CLI for the preview workflow: node scripts/e2e-fixtures.mjs <seed|cleanup> --remote
// Wrangler defaults to the local D1, so the target is always explicit.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, ...target] = process.argv.slice(2);
  if (
    !["seed", "cleanup"].includes(command) ||
    !(target.includes("--remote") || target.includes("--local"))
  ) {
    console.error(
      "usage: node scripts/e2e-fixtures.mjs <seed|cleanup> <--remote | --local --config <file>>",
    );
    process.exit(2);
  }
  if (command === "seed") {
    seedFixtures(target);
  } else {
    const failed = cleanupFixtures(target);
    if (failed.length > 0) {
      // The next seed removes these leftovers, but the failure stays visible.
      console.error(`e2e fixture cleanup failed: ${failed.join(", ")}`);
      process.exit(1);
    }
  }
}
