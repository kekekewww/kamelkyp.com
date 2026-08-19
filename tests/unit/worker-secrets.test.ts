import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function renderSecret(secret: string | undefined) {
  const cwd = await mkdtemp(join(tmpdir(), "worker-secrets-"));
  return {
    cwd,
    result: spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts", "render-worker-secrets.mjs")],
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, TURNSTILE_SECRET: secret },
      },
    ),
  };
}

describe("ephemeral Worker secret renderer", () => {
  it("fails closed without the Turnstile secret", async () => {
    const { cwd, result } = await renderSecret(undefined);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("missing_turnstile_secret");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("writes only the required secret without printing it", async () => {
    const secret = "private-test-secret";
    const { cwd, result } = await renderSecret(secret);
    try {
      expect(result.status).toBe(0);
      const output = await readFile(
        join(cwd, ".wrangler.secrets.json"),
        "utf8",
      );
      expect(JSON.parse(output)).toEqual({ TURNSTILE_SECRET: secret });
      expect(result.stderr).not.toContain(secret);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
