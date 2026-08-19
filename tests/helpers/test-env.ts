import type { Env } from "../../app/lib/env.server";

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    ACCESS_AUD: "test-audience",
    ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    ADMIN_EMAIL: "admin@example.com",
    APP_ORIGIN: "https://kamelkyp.com",
    APPS_SCRIPT_HMAC_SECRET: "a".repeat(32),
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
    CSRF_SECRET: "c".repeat(32),
    FX_API_URL: "https://example.com/fx",
    TURNSTILE_SECRET: "turnstile-secret",
    TURNSTILE_SITE_KEY: "turnstile-site-key",
    ...overrides,
  } as Env;
}
