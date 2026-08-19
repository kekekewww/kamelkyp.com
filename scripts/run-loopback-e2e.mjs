import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";

const wranglerCli = "node_modules/wrangler/bin/wrangler.js";
const playwrightCli = "node_modules/@playwright/test/cli.js";
const generatedConfig = "build/server/.wrangler.generated.jsonc";
const loopbackVarsFile = "build/server/.dev.vars";
const testEnvironment = {
  ...process.env,
  D1_DATABASE_ID: "00000000-0000-0000-0000-000000000001",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  RATE_LIMIT_NAMESPACE_ID: "1001",
  ACCESS_AUD: "loopback-access-audience",
  ACCESS_TEAM_DOMAIN: "https://loopback.cloudflareaccess.com",
  ADMIN_EMAIL: "loopback-admin@example.com",
  PR_NUMBER: "1",
  WORKERS_DEV_SUBDOMAIN: "loopback",
};

function run(command, args, env = testEnvironment) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`loopback_command_failed_${args[0]}`);
}

const databaseArgs = [wranglerCli, "d1"];
const fixtureFiles = [
  "tests/fixtures/media-e2e.sql",
  "tests/fixtures/fx-e2e.sql",
  "tests/fixtures/terms-e2e.sql",
];
const cleanupFiles = [
  "tests/fixtures/media-e2e-cleanup.sql",
  "tests/fixtures/fx-e2e-cleanup.sql",
  "tests/fixtures/terms-e2e-cleanup.sql",
];

try {
  run(process.execPath, ["scripts/render-wrangler-config.mjs", "preview"]);
  const loopbackConfig = JSON.parse(await readFile(generatedConfig, "utf8"));
  loopbackConfig.compatibility_date = "2026-06-30";
  await writeFile(
    generatedConfig,
    `${JSON.stringify(loopbackConfig, null, 2)}\n`,
  );
  await writeFile(
    loopbackVarsFile,
    [
      "TURNSTILE_SECRET=1x0000000000000000000000000000000AA",
      "APPS_SCRIPT_URL=https://script.google.com/macros/s/loopback/exec",
      "APPS_SCRIPT_HMAC_SECRET=loopback-hmac-secret-at-least-32-characters",
      "CSRF_SECRET=loopback-csrf-secret-at-least-32-characters",
      "MODE=test",
      "TEST_ADMIN_BYPASS=true",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  run(process.execPath, [
    ...databaseArgs,
    "migrations",
    "apply",
    "kamelkyp-preview",
    "--local",
    "--config",
    generatedConfig,
  ]);
  for (const file of fixtureFiles) {
    run(process.execPath, [
      ...databaseArgs,
      "execute",
      "kamelkyp-preview",
      "--local",
      "--config",
      generatedConfig,
      "--file",
      file,
    ]);
  }
  run(
    process.execPath,
    [
      playwrightCli,
      "test",
      "--project=chromium-desktop",
      "--project=chromium-mobile",
    ],
    { ...testEnvironment, E2E_LOOPBACK: "1" },
  );
} finally {
  for (const file of cleanupFiles) {
    try {
      run(process.execPath, [
        ...databaseArgs,
        "execute",
        "kamelkyp-preview",
        "--local",
        "--config",
        generatedConfig,
        "--file",
        file,
      ]);
    } catch {
      // The runner is ephemeral; a failed cleanup must not mask the test failure.
    }
  }
  await Promise.all([
    rm(generatedConfig, { force: true }),
    rm(loopbackVarsFile, { force: true }),
  ]);
}
