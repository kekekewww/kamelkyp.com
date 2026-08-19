import { writeFile } from "node:fs/promises";

const names = [
  "TURNSTILE_SECRET",
  "APPS_SCRIPT_URL",
  "APPS_SCRIPT_HMAC_SECRET",
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

await writeFile(".wrangler.secrets.json", `${JSON.stringify(values)}\n`, {
  mode: 0o600,
});
