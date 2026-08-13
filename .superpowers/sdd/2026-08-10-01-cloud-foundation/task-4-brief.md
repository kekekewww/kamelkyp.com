# Task 4 brief

Plan: docs/superpowers/plans/2026-08-10-01-cloud-foundation.md
Implementation branch: codex/01-cloud-foundation

### Task 4: Add cloud CI, generated Wrangler config and Preview deployment

**Files:**
- Create: scripts/render-wrangler-config.mjs
- Create: .github/workflows/ci.yml
- Create: .github/workflows/deploy-preview.yml
- Modify: tests/unit/config-contract.test.ts
- Modify: wrangler.base.jsonc

**Interfaces:**
- Consumes: package scripts, migrations, Worker build.
- Produces: cloud-only Preview URL and required-check names ci / quality, ci / worker, preview / deploy.

- [ ] **Step 1: Extend the failing config test for secret-safe deployment**

~~~ts
it("keeps resource ids out of the committed Wrangler base", async () => {
  const source = await readFile("wrangler.base.jsonc", "utf8");
  expect(source).not.toContain("database_id");
  expect(source).not.toContain("api_token");
  expect(source).not.toContain("hmac");
});
~~~

Cloud commit message: test: prohibit resource ids in committed config.

- [ ] **Step 2: Run the config test**

~~~bash
npm run test:unit -- tests/unit/config-contract.test.ts
~~~

Expected result: PASS for current base; deployment workflow is still absent, so the Task is incomplete by file review.

- [ ] **Step 3: Add deterministic CI configuration rendering**

~~~js
// scripts/render-wrangler-config.mjs
import { readFile, writeFile } from "node:fs/promises";

const environment = process.argv[2];
if (!["preview", "production"].includes(environment)) {
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
  if (!process.env[name]) throw new Error(`missing_${name.toLowerCase()}`);
}
if (
  environment === "preview" &&
  !/^[a-z0-9-]+$/.test(process.env.WORKERS_DEV_SUBDOMAIN ?? "")
) {
  throw new Error("invalid_workers_dev_subdomain");
}

const appOrigin =
  environment === "production"
    ? process.env.APP_ORIGIN
    : `https://kamelkyp-com-pr-${process.env.PR_NUMBER}.${process.env.WORKERS_DEV_SUBDOMAIN}.workers.dev`;

const base = JSON.parse(await readFile("wrangler.base.jsonc", "utf8"));
const config = {
  ...base,
  name:
    environment === "production"
      ? "kamelkyp-com"
      : `kamelkyp-com-pr-${process.env.PR_NUMBER}`,
  d1_databases: [
    {
      binding: "DB",
      database_name:
        environment === "production"
          ? "kamelkyp-production"
          : "kamelkyp-preview",
      database_id: process.env.D1_DATABASE_ID,
      migrations_dir: "./migrations",
    },
  ],
  vars: {
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    ACCESS_AUD: process.env.ACCESS_AUD,
    ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    FX_API_URL: "https://api.frankfurter.dev/v1/latest?base=TWD&symbols=USD",
    APP_ORIGIN: appOrigin,
  },
};

await writeFile(".wrangler.generated.jsonc", JSON.stringify(config, null, 2));
~~~

Plans 04–06 declare TURNSTILE_SECRET、APPS_SCRIPT_URL、APPS_SCRIPT_HMAC_SECRET、CSRF_SECRET through Wrangler `secrets.required` and provide their values only through an ephemeral GitHub Actions secrets file passed to `wrangler deploy --secrets-file`; neither values nor the generated secrets file enter the repository or workflow artifacts.

- [ ] **Step 4: Add CI and Preview workflows**

~~~yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run build

  worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run test:worker
~~~

~~~yaml
# .github/workflows/deploy-preview.yml
name: Deploy Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: preview
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - name: Apply preview migrations
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: d1 migrations apply kamelkyp-preview --remote
      - name: Build and deploy preview
        env:
          D1_DATABASE_ID: ${{ secrets.D1_DATABASE_ID }}
          TURNSTILE_SITE_KEY: ${{ vars.TURNSTILE_SITE_KEY }}
          ACCESS_AUD: ${{ vars.ACCESS_AUD }}
          ACCESS_TEAM_DOMAIN: ${{ vars.ACCESS_TEAM_DOMAIN }}
          ADMIN_EMAIL: ${{ vars.ADMIN_EMAIL }}
          WORKERS_DEV_SUBDOMAIN: ${{ vars.WORKERS_DEV_SUBDOMAIN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: npm run deploy:preview
~~~

The Preview GitHub Environment stores CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID、D1_DATABASE_ID as secrets and TURNSTILE_SITE_KEY、ACCESS_AUD、ACCESS_TEAM_DOMAIN、ADMIN_EMAIL、WORKERS_DEV_SUBDOMAIN as vars. config-contract tests cover missing PR_NUMBER, malformed subdomain and the exact derived APP_ORIGIN. The workflow fails closed when any value is missing.

- [ ] **Step 5: Run Preview, E2E smoke and merge gate**

After the workflow reports its workers.dev Preview URL, dispatch E2E with PREVIEW_URL set to that URL:

~~~bash
npx playwright install --with-deps chromium
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/smoke.spec.ts
~~~

Expected result:

- /health returns the exact JSON contract.
- Browser language zh-TW redirects / to /zh.
- No Secret or D1 ID appears in repository diff or Action logs.
- CI quality and worker jobs pass.

Cloud commit message: ci: add cloud-only checks and Worker preview deployment.

Create PR codex/01-cloud-foundation → main. Merge only after all checks and Preview smoke pass.
