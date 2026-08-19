import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const validSecrets = {
  TURNSTILE_SECRET: "private-turnstile-secret",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
  APPS_SCRIPT_HMAC_SECRET: "hmac-secret-with-at-least-32-characters",
  CSRF_SECRET: "csrf-secret-with-at-least-32-characters",
};

async function renderSecret(
  secrets: Record<string, string | undefined>,
  environment: "preview" | "production" = "preview",
) {
  const cwd = await mkdtemp(join(tmpdir(), "worker-secrets-"));
  return {
    cwd,
    result: spawnSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "render-worker-secrets.mjs"),
        environment,
      ],
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...secrets },
      },
    ),
  };
}

describe("ephemeral Worker secret renderer", () => {
  it("fails closed without the Turnstile secret", async () => {
    const { cwd, result } = await renderSecret({
      ...validSecrets,
      TURNSTILE_SECRET: undefined,
    });
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("missing_turnstile_secret");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("writes only the required secret without printing it", async () => {
    const { cwd, result } = await renderSecret(validSecrets);
    try {
      expect(result.status).toBe(0);
      const output = await readFile(
        join(cwd, ".wrangler.secrets.json"),
        "utf8",
      );
      expect(JSON.parse(output)).toEqual(validSecrets);
      for (const secret of Object.values(validSecrets)) {
        expect(result.stderr).not.toContain(secret);
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    [
      { ...validSecrets, APPS_SCRIPT_URL: "http://example.com/relay" },
      "invalid_apps_script_url",
    ],
    [
      { ...validSecrets, APPS_SCRIPT_HMAC_SECRET: "too-short" },
      "invalid_apps_script_hmac_secret",
    ],
    [{ ...validSecrets, CSRF_SECRET: "too-short" }, "invalid_csrf_secret"],
  ])("rejects malformed Google relay secrets", async (secrets, code) => {
    const { cwd, result } = await renderSecret(secrets);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(code);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects the official Turnstile test secret in production", async () => {
    const { cwd, result } = await renderSecret(
      {
        ...validSecrets,
        TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
      },
      "production",
    );
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("turnstile_test_secret_forbidden");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
