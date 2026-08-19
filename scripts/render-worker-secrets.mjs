import { writeFile } from "node:fs/promises";

const environment = process.argv[2];
if (environment !== "preview" && environment !== "production") {
  throw new Error("environment_must_be_preview_or_production");
}

const names = [
  "TURNSTILE_SECRET",
  "APPS_SCRIPT_URL",
  "APPS_SCRIPT_HMAC_SECRET",
  "CSRF_SECRET",
];
const values = Object.fromEntries(
  names.map((name) => {
    const value = process.env[name];
    if (!value) throw new Error(`missing_${name.toLowerCase()}`);
    return [name, value];
  }),
);

let appsScriptUrl;
try {
  appsScriptUrl = new URL(values.APPS_SCRIPT_URL);
} catch {
  throw new Error("invalid_apps_script_url");
}
if (
  appsScriptUrl.protocol !== "https:" ||
  appsScriptUrl.hostname !== "script.google.com" ||
  !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(appsScriptUrl.pathname) ||
  appsScriptUrl.search ||
  appsScriptUrl.hash
) {
  throw new Error("invalid_apps_script_url");
}
if (values.APPS_SCRIPT_HMAC_SECRET.length < 32) {
  throw new Error("invalid_apps_script_hmac_secret");
}
if (values.CSRF_SECRET.length < 32) {
  throw new Error("invalid_csrf_secret");
}
if (
  environment === "production" &&
  values.TURNSTILE_SECRET === "1x0000000000000000000000000000000AA"
) {
  throw new Error("turnstile_test_secret_forbidden");
}

await writeFile(".wrangler.secrets.json", `${JSON.stringify(values)}\n`, {
  mode: 0o600,
});
