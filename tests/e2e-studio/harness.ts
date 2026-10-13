/**
 * Dev-server Studio e2e harness (admin-architecture §3.6).
 *
 * `npm run test:e2e:studio` starts `react-router dev` (Vite) with a local dev
 * owner, so Studio flows run without Cloudflare Access. The dev-owner branch
 * in `requireOwner` is guarded by `import.meta.env.DEV` and is dead code in
 * every build; this harness never touches the loopback or deployed Workers.
 *
 * Worker variables come from this process (`CLOUDFLARE_INCLUDE_PROCESS_ENV`),
 * which the Cloudflare Vite plugin only honours when the project root has no
 * `.dev.vars` / `.env`. With your own `.dev.vars`, it must define the same
 * owner values (ADMIN_EMAIL = STUDIO_DEV_OWNER_EMAIL, CSRF_SECRET, APP_ORIGIN).
 *
 * Packages add `tests/e2e-studio/<package>.spec.ts` and import `test`,
 * `expect` and the helpers below.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

export const STUDIO_E2E_PORT = 5173;
export const STUDIO_E2E_ORIGIN = `http://127.0.0.1:${STUDIO_E2E_PORT}`;
export const STUDIO_E2E_OWNER = "studio-e2e-owner@example.com";

/** Worker variables for the dev server (local, non-secret test values). */
export function studioDevEnvironment(): Record<string, string> {
  return {
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    ADMIN_EMAIL: STUDIO_E2E_OWNER,
    STUDIO_DEV_OWNER_EMAIL: STUDIO_E2E_OWNER,
    APP_ORIGIN: STUDIO_E2E_ORIGIN,
    CSRF_SECRET: "studio-e2e-csrf-secret-at-least-32-characters",
    ACCESS_AUD: "studio-e2e-access-audience",
    ACCESS_TEAM_DOMAIN: "https://studio-e2e.cloudflareaccess.com",
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/studio-e2e/exec",
    APPS_SCRIPT_HMAC_SECRET: "studio-e2e-hmac-secret-at-least-32-characters",
    FX_API_URL: "https://open.er-api.com/v6/latest/TWD",
    MODE: "test",
  };
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

function ownerDefined(source: string): boolean {
  const value = (key: string) =>
    new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?`, "m").exec(source)?.[1];
  const owner = value("STUDIO_DEV_OWNER_EMAIL");
  return Boolean(owner) && owner === value("ADMIN_EMAIL");
}

/** Playwright global setup: fail early on a misconfigured owner, then migrate local D1. */
export default async function globalSetup(): Promise<void> {
  for (const file of [".dev.vars", ".env"]) {
    const source = await readOptional(file);
    if (source !== null && !ownerDefined(source)) {
      throw new Error(
        `${file} exists, so the dev server ignores the harness variables. ` +
          "Add STUDIO_DEV_OWNER_EMAIL equal to ADMIN_EMAIL (plus CSRF_SECRET and " +
          `APP_ORIGIN=${STUDIO_E2E_ORIGIN}) or move the file aside.`,
      );
    }
  }
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "migrations",
      "apply",
      "kamelkyp-com",
      "--local",
      "--config",
      "wrangler.base.jsonc",
    ],
    { encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  if (result.status !== 0) {
    throw new Error(
      `studio_e2e_migrations_failed\n${result.stdout}\n${result.stderr}`,
    );
  }
}

/**
 * Opens a Studio page and waits for the shell (the dev owner is signed in)
 * and for hydration: the server HTML is visible before React attaches its
 * handlers, so an early click on a client-only control (a dialog trigger, a
 * fetcher button) would do nothing. React marks hydrated nodes with a
 * `__reactFiber$…` key.
 */
export async function openStudio(page: Page, path = "/studio"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("#studio-main")).toBeVisible();
  await page.waitForFunction(() => {
    const main = document.querySelector("#studio-main");
    return (
      main !== null &&
      Object.keys(main).some((key) => key.startsWith("__reactFiber$"))
    );
  });
}

export { expect, test };
