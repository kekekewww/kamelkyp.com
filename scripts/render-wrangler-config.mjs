import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const environment = process.argv[2];
if (environment !== "preview" && environment !== "production") {
  throw new Error("environment_must_be_preview_or_production");
}

const commonRequired = [
  "D1_DATABASE_ID",
  "TURNSTILE_SITE_KEY",
  "ACCESS_AUD",
  "ACCESS_TEAM_DOMAIN",
  "ADMIN_EMAIL",
];
const environmentRequired =
  environment === "production"
    ? ["APP_ORIGIN"]
    : ["PR_NUMBER", "WORKERS_DEV_SUBDOMAIN"];

for (const name of [...commonRequired, ...environmentRequired]) {
  if (!process.env[name]) {
    throw new Error(\`missing_\${name.toLowerCase()}\`);
  }
}

if (
  environment === "preview" &&
  !/^[a-z0-9-]+$/.test(process.env.WORKERS_DEV_SUBDOMAIN ?? "")
) {
  throw new Error("invalid_workers_dev_subdomain");
}

if (
  environment === "preview" &&
  !/^[1-9][0-9]*$/.test(process.env.PR_NUMBER ?? "")
) {
  throw new Error("invalid_pr_number");
}

const sourceConfig =
  process.env.WRANGLER_SOURCE_CONFIG ?? "build/server/wrangler.json";
const outputConfig =
  process.env.WRANGLER_OUTPUT_CONFIG ??
  "build/server/.wrangler.generated.jsonc";
const appOrigin =
  environment === "production"
    ? process.env.APP_ORIGIN
    : \`https://kamelkyp-com-pr-\${process.env.PR_NUMBER}.\${process.env.WORKERS_DEV_SUBDOMAIN}.workers.dev\`;

const generated = JSON.parse(await readFile(sourceConfig, "utf8"));
const config = {
  ...generated,
  name:
    environment === "production"
      ? "kamelkyp-com"
      : \`kamelkyp-com-pr-\${process.env.PR_NUMBER}\`,
  d1_databases: [
    {
      binding: "DB",
      database_name:
        environment === "production"
          ? "kamelkyp-production"
          : "kamelkyp-preview",
      database_id: process.env.D1_DATABASE_ID,
      migrations_dir: "../../migrations",
    },
  ],
  vars: {
    ...generated.vars,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    ACCESS_AUD: process.env.ACCESS_AUD,
    ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    FX_API_URL: "https://api.frankfurter.dev/v1/latest?base=TWD&symbols=USD",
    APP_ORIGIN: appOrigin,
  },
};

await mkdir(dirname(outputConfig), { recursive: true });
await writeFile(outputConfig, \`\${JSON.stringify(config, null, 2)}\n\`);
