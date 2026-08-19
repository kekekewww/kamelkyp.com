import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const approvedSecretNames = [
  "TURNSTILE_SECRET",
  "APPS_SCRIPT_URL",
  "APPS_SCRIPT_HMAC_SECRET",
  "CSRF_SECRET",
];
const requiredEnvironment = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "APP_ORIGIN",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
  "ADMIN_EMAIL",
  "RATE_LIMIT_NAMESPACE_ID",
  "TURNSTILE_SITE_KEY",
  ...approvedSecretNames,
  "LEGAL_REVIEW_CONFIRMED",
];
const officialTurnstileTestKeys = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

function fail(code) {
  console.error(code);
  process.exit(1);
}

function requireHttpsUrl(value, code, hostname) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(code);
  }
  if (
    url.protocol !== "https:" ||
    (hostname && url.hostname !== hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    fail(code);
  }
  return url;
}

async function listBuildFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listBuildFiles(path)));
    else if (
      [".js", ".mjs", ".cjs", ".json", ".html", ".map"].includes(
        extname(entry.name),
      )
    ) {
      files.push(path);
    }
  }
  return files;
}

if (process.env.MODE !== "production") fail("production_mode_required");
for (const name of requiredEnvironment) {
  if (!process.env[name]) fail(`missing_${name.toLowerCase()}`);
}
if (process.env.APP_ORIGIN !== "https://kamelkyp.com") {
  fail("invalid_app_origin");
}
if (!/^[1-9][0-9]*$/.test(process.env.RATE_LIMIT_NAMESPACE_ID ?? "")) {
  fail("invalid_rate_limit_namespace_id");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL ?? "")) {
  fail("invalid_admin_email");
}
const accessDomain = requireHttpsUrl(
  process.env.ACCESS_TEAM_DOMAIN,
  "invalid_access_team_domain",
);
if (
  accessDomain.pathname !== "/" ||
  !accessDomain.hostname.endsWith(".cloudflareaccess.com")
) {
  fail("invalid_access_team_domain");
}
if (process.env.LEGAL_REVIEW_CONFIRMED !== "true") {
  fail("legal_review_required");
}
if (
  officialTurnstileTestKeys.has(process.env.TURNSTILE_SITE_KEY) ||
  officialTurnstileTestKeys.has(process.env.TURNSTILE_SECRET)
) {
  fail("turnstile_test_key_forbidden");
}
if ((process.env.APPS_SCRIPT_HMAC_SECRET?.length ?? 0) < 32) {
  fail("invalid_apps_script_hmac_secret");
}
if ((process.env.CSRF_SECRET?.length ?? 0) < 32) fail("invalid_csrf_secret");
const appsScriptUrl = requireHttpsUrl(
  process.env.APPS_SCRIPT_URL,
  "invalid_apps_script_url",
  "script.google.com",
);
if (!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(appsScriptUrl.pathname)) {
  fail("invalid_apps_script_url");
}

const configPath =
  process.env.WRANGLER_CONFIG ?? "build/server/.wrangler.generated.jsonc";
const secretsPath =
  process.env.WRANGLER_SECRETS_FILE ?? ".wrangler.secrets.json";
const buildDirectory = process.env.BUILD_DIRECTORY ?? "build";
let config;
let secrets;
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch {
  fail("production_config_unreadable");
}
try {
  secrets = JSON.parse(await readFile(secretsPath, "utf8"));
} catch {
  fail("production_secrets_unreadable");
}

if (
  config.name !== "kamelkyp-com" ||
  config.vars?.APP_ORIGIN !== process.env.APP_ORIGIN ||
  config.vars?.ACCESS_TEAM_DOMAIN !== process.env.ACCESS_TEAM_DOMAIN ||
  config.vars?.ACCESS_AUD !== process.env.ACCESS_AUD ||
  config.vars?.ADMIN_EMAIL !== process.env.ADMIN_EMAIL ||
  config.vars?.TURNSTILE_SITE_KEY !== process.env.TURNSTILE_SITE_KEY
) {
  fail("production_vars_mismatch");
}
if (
  !Array.isArray(config.routes) ||
  config.routes.length !== 1 ||
  config.routes[0]?.pattern !== "kamelkyp.com" ||
  config.routes[0]?.custom_domain !== true
) {
  fail("production_custom_domain_missing");
}
const databaseBindings = (config.d1_databases ?? []).filter(
  (binding) => binding.binding === "DB",
);
if (
  databaseBindings.length !== 1 ||
  databaseBindings[0].database_id !== process.env.D1_DATABASE_ID
) {
  fail("production_d1_mismatch");
}
const rateBindings = (config.ratelimits ?? []).filter(
  (binding) => binding.name === "SUBMISSION_RATE_LIMITER",
);
if (
  rateBindings.length !== 1 ||
  rateBindings[0].namespace_id !== process.env.RATE_LIMIT_NAMESPACE_ID ||
  rateBindings[0].simple?.limit !== 10 ||
  rateBindings[0].simple?.period !== 60
) {
  fail("production_rate_limit_mismatch");
}
if (
  JSON.stringify(config.secrets?.required) !==
  JSON.stringify(approvedSecretNames)
) {
  fail("production_secret_names_mismatch");
}
if (
  Object.keys(secrets).sort().join(",") !==
  [...approvedSecretNames].sort().join(",")
) {
  fail("production_secret_file_mismatch");
}
for (const name of approvedSecretNames) {
  if (secrets[name] !== process.env[name])
    fail("production_secret_file_mismatch");
}

let buildFiles;
try {
  buildFiles = await listBuildFiles(buildDirectory);
} catch {
  fail("production_build_unreadable");
}
for (const file of buildFiles) {
  const source = await readFile(file, "utf8");
  if (
    /TEST_ADMIN_BYPASS|TEST_JWT_(?:KEY|PRIVATE_KEY)|test-jwt-key/.test(source)
  ) {
    fail("test_bypass_in_production_build");
  }
}

console.log("production_config_verified");
