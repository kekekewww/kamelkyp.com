import { writeFile } from "node:fs/promises";

const names = ["TURNSTILE_SECRET"];
const values = Object.fromEntries(
  names.map((name) => {
    const value = process.env[name];
    if (!value) throw new Error(`missing_${name.toLowerCase()}`);
    return [name, value];
  }),
);

await writeFile(".wrangler.secrets.json", `${JSON.stringify(values)}\n`, {
  mode: 0o600,
});
