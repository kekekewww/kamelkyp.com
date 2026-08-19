import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const renderer = "scripts/render-wrangler-config.mjs";
const required = {
  D1_DATABASE_ID: "preview-d1-id",
  TURNSTILE_SITE_KEY: "site-key",
  RATE_LIMIT_NAMESPACE_ID: "41004",
  ACCESS_AUD: "access-audience",
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ADMIN_EMAIL: "admin@example.com",
};

async function render(
  environment: "preview" | "production",
  variables: Record<string, string | undefined>,
) {
  const directory = await mkdtemp(join(tmpdir(), "wrangler-render-"));
  const source = join(directory, "build", "server", "wrangler.json");
  const output = join(
    directory,
    "build",
    "server",
    ".wrangler.generated.jsonc",
  );

  await mkdir(join(directory, "build", "server"), { recursive: true });
  await writeFile(
    source,
    JSON.stringify({
      name: "framework-generated-worker",
      main: "./index.js",
      assets: { directory: "../client" },
      compatibility_date: "2026-08-10",
    }),
  );

  const result = spawnSync(process.execPath, [renderer, environment], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...variables,
      WRANGLER_SOURCE_CONFIG: source,
      WRANGLER_OUTPUT_CONFIG: output,
    },
  });

  return {
    ...result,
    directory,
    output,
    async readOutput() {
      return JSON.parse(await readFile(output, "utf8"));
    },
  };
}

describe("cloud project configuration", () => {
  it("keeps SSR enabled and the Worker entry explicit", async () => {
    const routerConfig = await readFile("react-router.config.ts", "utf8");
    const wranglerConfig = JSON.parse(
      await readFile("wrangler.base.jsonc", "utf8"),
    );

    expect(routerConfig).toContain("ssr: true");
    expect(wranglerConfig.main).toBe("./workers/app.ts");
    expect(wranglerConfig.compatibility_flags).toContain("nodejs_compat");
  });

  it("keeps resource identifiers and secrets out of the committed base config", async () => {
    const source = await readFile("wrangler.base.jsonc", "utf8");

    expect(source).not.toContain("database_id");
    expect(source.toLowerCase()).not.toContain("api_token");
    expect(source.toLowerCase()).not.toContain("hmac");
    expect(source.toLowerCase()).not.toContain("secret");
  });

  it("renders preview configuration from the generated SSR Worker artifact", async () => {
    const result = await render("preview", {
      ...required,
      PR_NUMBER: "42",
      WORKERS_DEV_SUBDOMAIN: "example-workers",
    });

    try {
      expect(result.status).toBe(0);
      const config = await result.readOutput();
      expect(config).toMatchObject({
        name: "kamelkyp-com-pr-42",
        main: "./index.js",
        assets: { directory: "../client" },
        vars: {
          APP_ORIGIN: "https://kamelkyp-com-pr-42.example-workers.workers.dev",
        },
      });
      expect(config.d1_databases).toEqual([
        expect.objectContaining({
          binding: "DB",
          database_name: "kamelkyp-preview",
          database_id: "preview-d1-id",
          migrations_dir: "../../migrations",
        }),
      ]);
      expect(config.ratelimits).toEqual([
        {
          name: "SUBMISSION_RATE_LIMITER",
          namespace_id: "41004",
          simple: { limit: 10, period: 60 },
        },
      ]);
      expect(config.secrets).toEqual({
        required: [
          "TURNSTILE_SECRET",
          "APPS_SCRIPT_URL",
          "APPS_SCRIPT_HMAC_SECRET",
          "CSRF_SECRET",
        ],
      });
      expect(JSON.stringify(config)).not.toContain("private-hmac");

      const source = await readFile(renderer, "utf8");
      expect(source).toContain("build/server/wrangler.json");
      expect(source).not.toContain("workers/app.ts");
    } finally {
      await rm(result.directory, { recursive: true, force: true });
    }
  });

  it("renders the production Worker name and origin exactly", async () => {
    const result = await render("production", {
      ...required,
      APP_ORIGIN: "https://kamelkyp.com",
    });

    try {
      expect(result.status).toBe(0);
      const config = await result.readOutput();
      expect(config.name).toBe("kamelkyp-com");
      expect(config.vars.APP_ORIGIN).toBe("https://kamelkyp.com");
      expect(config.d1_databases[0]).toMatchObject({
        database_name: "kamelkyp-production",
        migrations_dir: "../../migrations",
      });
    } finally {
      await rm(result.directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the preview PR number is missing", async () => {
    const result = await render("preview", {
      ...required,
      PR_NUMBER: undefined,
      WORKERS_DEV_SUBDOMAIN: "example-workers",
    });

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("missing_pr_number");
    } finally {
      await rm(result.directory, { recursive: true, force: true });
    }
  });

  it("rejects an invalid preview subdomain", async () => {
    const result = await render("preview", {
      ...required,
      PR_NUMBER: "42",
      WORKERS_DEV_SUBDOMAIN: "invalid.example",
    });

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("invalid_workers_dev_subdomain");
    } finally {
      await rm(result.directory, { recursive: true, force: true });
    }
  });

  it("fails closed for a missing or invalid Rate Limiting namespace", async () => {
    for (const namespaceId of [undefined, "not-a-number"]) {
      const result = await render("preview", {
        ...required,
        RATE_LIMIT_NAMESPACE_ID: namespaceId,
        PR_NUMBER: "42",
        WORKERS_DEV_SUBDOMAIN: "example-workers",
      });

      try {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(
          /missing_rate_limit_namespace_id|invalid_rate_limit_namespace_id/,
        );
      } finally {
        await rm(result.directory, { recursive: true, force: true });
      }
    }
  });

  it("keeps the generated deployment config ignored and untracked", async () => {
    const gitignore = await readFile(".gitignore", "utf8");
    const tracked = spawnSync(
      "git",
      ["ls-files", "--error-unmatch", "build/server/.wrangler.generated.jsonc"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(gitignore).toContain("build/");
    expect(gitignore).toContain(".wrangler.secrets.json");
    expect(tracked.status).not.toBe(0);
  });

  it("keeps deployment expressions executable and check names stable", async () => {
    const ci = await readFile(".github/workflows/ci.yml", "utf8");
    const preview = await readFile(
      ".github/workflows/deploy-preview.yml",
      "utf8",
    );

    expect(ci).toContain("name: ci");
    expect(ci).toMatch(/jobs:\s*\n\s+quality:/);
    expect(ci).toMatch(/\n\s+worker:/);
    expect(preview).toContain("name: preview");
    expect(preview).toMatch(/jobs:\s*\n\s+deploy:/);
    expect(preview).not.toContain("\\${");
    expect(preview).not.toMatch(/^ {4}env:\r?\n {6}CLOUDFLARE_API_TOKEN:/m);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: verifies literal GitHub expression syntax
    expect(preview).toContain("${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(preview).toContain('"$CLOUDFLARE_API_TOKEN"');
    expect(preview).toContain("$PR_NUMBER.$WORKERS_DEV_SUBDOMAIN");
    expect(preview).toMatch(
      /name: Apply preview migrations[\s\S]*?env:\r?\n\s+CLOUDFLARE_API_TOKEN:/,
    );
    expect(preview).toMatch(
      /name: Deploy preview Worker[\s\S]*?env:\r?\n\s+CLOUDFLARE_API_TOKEN:/,
    );
    expect(ci).toContain("scripts/render-wrangler-config.mjs preview");
    expect(ci).toContain("--config build/server/.wrangler.generated.jsonc");
  });

  it("normalizes repository text files to LF for cross-platform checks", async () => {
    const attributes = await readFile(".gitattributes", "utf8");

    expect(attributes).toContain("* text=auto eol=lf");
  });
});
