import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const verifier = join(process.cwd(), "scripts", "verify-production-config.mjs");
const approvedSecretNames = [
  "TURNSTILE_SECRET",
  "APPS_SCRIPT_URL",
  "APPS_SCRIPT_HMAC_SECRET",
  "CSRF_SECRET",
];
const validEnvironment = {
  MODE: "production",
  CLOUDFLARE_API_TOKEN: "cloudflare-token-private-value",
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  D1_DATABASE_ID: "production-d1-id",
  APP_ORIGIN: "https://kamelkyp.com",
  ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  ACCESS_AUD: "access-audience",
  ADMIN_EMAIL: "admin@example.com",
  RATE_LIMIT_NAMESPACE_ID: "41005",
  TURNSTILE_SITE_KEY: "production-site-key",
  TURNSTILE_SECRET: "production-turnstile-secret",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/production/exec",
  APPS_SCRIPT_HMAC_SECRET: "production-hmac-secret-at-least-32-characters",
  CSRF_SECRET: "production-csrf-secret-at-least-32-characters",
  LEGAL_REVIEW_CONFIRMED: "true",
};

async function verify(overrides: Record<string, string | undefined> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "production-config-"));
  const configPath = join(directory, "wrangler.jsonc");
  const secretsPath = join(directory, ".wrangler.secrets.json");
  const buildDirectory = join(directory, "build");
  await mkdir(buildDirectory);
  await writeFile(
    configPath,
    JSON.stringify({
      name: "kamelkyp-com",
      routes: [{ pattern: "kamelkyp.com", custom_domain: true }],
      d1_databases: [
        {
          binding: "DB",
          database_id: "production-d1-id",
          database_name: "kamelkyp-production",
        },
      ],
      ratelimits: [
        {
          name: "SUBMISSION_RATE_LIMITER",
          namespace_id: "41005",
          simple: { limit: 10, period: 60 },
        },
      ],
      secrets: { required: approvedSecretNames },
      vars: {
        APP_ORIGIN: "https://kamelkyp.com",
        ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
        ACCESS_AUD: "access-audience",
        ADMIN_EMAIL: "admin@example.com",
        TURNSTILE_SITE_KEY: "production-site-key",
      },
    }),
  );
  await writeFile(
    secretsPath,
    JSON.stringify({
      TURNSTILE_SECRET: validEnvironment.TURNSTILE_SECRET,
      APPS_SCRIPT_URL: validEnvironment.APPS_SCRIPT_URL,
      APPS_SCRIPT_HMAC_SECRET: validEnvironment.APPS_SCRIPT_HMAC_SECRET,
      CSRF_SECRET: validEnvironment.CSRF_SECRET,
    }),
  );

  const result = spawnSync(process.execPath, [verifier], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...validEnvironment,
      ...overrides,
      WRANGLER_CONFIG: configPath,
      WRANGLER_SECRETS_FILE: secretsPath,
      BUILD_DIRECTORY: buildDirectory,
    },
  });
  return { directory, result };
}

describe("production deployment verifier", () => {
  it("accepts only the complete production contract", async () => {
    const { directory, result } = await verify();
    try {
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("production_config_verified");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    [{ MODE: "test" }, "production_mode_required"],
    [{ APP_ORIGIN: "https://example.com" }, "invalid_app_origin"],
    [{ RATE_LIMIT_NAMESPACE_ID: "rate-1" }, "invalid_rate_limit_namespace_id"],
    [
      { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" },
      "invalid_access_team_domain",
    ],
    [{ ADMIN_EMAIL: "not-an-email" }, "invalid_admin_email"],
    [{ LEGAL_REVIEW_CONFIRMED: "false" }, "legal_review_required"],
    [
      { TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
      "turnstile_test_key_forbidden",
    ],
    [
      { TURNSTILE_SECRET: "1x0000000000000000000000000000000AA" },
      "turnstile_test_key_forbidden",
    ],
    [{ APPS_SCRIPT_HMAC_SECRET: "short" }, "invalid_apps_script_hmac_secret"],
    [{ CSRF_SECRET: "short" }, "invalid_csrf_secret"],
  ])("rejects unsafe production inputs", async (overrides, code) => {
    const { directory, result } = await verify(overrides);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(code);
      expect(result.stderr).not.toContain(
        validEnvironment.CLOUDFLARE_API_TOKEN,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a build containing a test admin bypass", async () => {
    const { directory, result: initial } = await verify();
    try {
      expect(initial.status).toBe(0);
      const buildDirectory = join(directory, "build");
      await writeFile(join(buildDirectory, "index.js"), "TEST_ADMIN_BYPASS");
      const result = spawnSync(process.execPath, [verifier], {
        encoding: "utf8",
        env: {
          ...process.env,
          ...validEnvironment,
          WRANGLER_CONFIG: join(directory, "wrangler.jsonc"),
          WRANGLER_SECRETS_FILE: join(directory, ".wrangler.secrets.json"),
          BUILD_DIRECTORY: buildDirectory,
        },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("test_bypass_in_production_build");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
