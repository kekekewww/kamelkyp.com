# Kamel Cloud Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可由 GitHub Actions 全程測試與部署 Preview 的 React Router 8、Cloudflare Workers 與 D1 專案骨架。

**Architecture:** React Router 8 使用 SSR，由 workers/app.ts 將 Request 交給 Framework Handler；公開頁面、API 與管理頁面共用單一 Worker。D1 migration 在 Workers Vitest Pool 中驗證，Cloudflare Preview 的資源 ID 由 GitHub Secrets 注入 CI 暫存設定，不把真實 ID 或 Secret 寫入 repository。

**Tech Stack:** Node.js 24.x、React 19.2.8、React Router 8.3.0、TypeScript 7.0.2、Vite 8.1.5、Cloudflare Vite Plugin 1.48.0、Wrangler 4.114.0、Vitest 4.1.10、Workers Vitest Pool 0.16.19、Playwright 1.61.1、Biome 2.5.6、Zod 4.4.3。

## Global Constraints

- 前置文件：docs/superpowers/plans/2026-08-10-00-kamelkyp-cloud-roadmap.md。
- Branch：codex/01-cloud-foundation。
- 不使用本機 checkout、localhost 或本機 D1；測試與 lockfile 都由 GitHub Actions 執行。
- main 只接受通過 CI、Cloudflare Preview 與人工檢查的 PR。
- 自訂 CSS，不加入 Bootstrap CSS 或 Tailwind。
- Env、Locale、ServiceId、MediaItem、QuoteBreakdown、PermanentCaseRecord 名稱依總覽固定。
- 所有依賴使用本計畫列出的精確版本；package-lock.json 由 lockfile workflow 在雲端產生。
- Secrets 與 Cloudflare Resource IDs 只存在 GitHub Environments／Secrets 和 Cloudflare 設定。

---

## File Map

### Create

- .node-version
- .gitignore
- package.json
- package-lock.json（由 GitHub Actions 產生）
- biome.json
- tsconfig.json
- react-router.config.ts
- vite.config.ts
- vitest.config.ts
- vitest.worker.config.ts
- playwright.config.ts
- wrangler.base.jsonc
- app/root.tsx
- app/routes.ts
- app/routes/health.ts
- app/routes/language-redirect.tsx
- app/lib/env.server.ts
- app/lib/services/service-id.ts
- app/lib/db/content-repository.server.ts
- tests/helpers/apply-migrations.ts
- app/styles/tokens.css
- app/styles/global.css
- workers/app.ts
- migrations/0001_core.sql
- tests/unit/service-id.test.ts
- tests/unit/config-contract.test.ts
- tests/worker/migrations.test.ts
- tests/worker/content-repository.test.ts
- tests/e2e/smoke.spec.ts
- .github/workflows/lockfile.yml
- .github/workflows/ci.yml
- .github/workflows/deploy-preview.yml
- scripts/render-wrangler-config.mjs

### Produced Interfaces

~~~ts
export type Locale = "zh" | "en";

export const SERVICE_IDS = [
  "full_mix",
  "vocal_mix",
  "simple_transition",
  "edit_transition",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export interface Env {
  DB: D1Database;
  SUBMISSION_RATE_LIMITER: RateLimit;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  CSRF_SECRET: string;
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ADMIN_EMAIL: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_HMAC_SECRET: string;
  FX_API_URL: string;
  APP_ORIGIN: string;
}
~~~

---

### Task 1: Pin the toolchain and create the cloud-generated lockfile

**Files:**
- Create: package.json
- Create: .node-version
- Create: .gitignore
- Create: biome.json
- Create: tsconfig.json
- Create: react-router.config.ts
- Create: vite.config.ts
- Create: app/lib/services/service-id.ts
- Create: tests/unit/service-id.test.ts
- Create: .github/workflows/lockfile.yml

**Interfaces:**
- Consumes: none.
- Produces: SERVICE_IDS and ServiceId; npm scripts used by every later task.

- [ ] **Step 1: Commit the failing ServiceId contract test**

~~~ts
// tests/unit/service-id.test.ts
import { describe, expect, it } from "vitest";
import { SERVICE_IDS, isServiceId } from "../../app/lib/services/service-id";

describe("ServiceId contract", () => {
  it("contains exactly the four approved services", () => {
    expect(SERVICE_IDS).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
  });

  it("rejects values outside the stable service identifiers", () => {
    expect(isServiceId("full_mix")).toBe(true);
    expect(isServiceId("mastering_only")).toBe(false);
  });
});
~~~

Cloud commit:

~~~text
Branch: codex/01-cloud-foundation
Message: test: define stable service identifiers
Paths: tests/unit/service-id.test.ts
~~~

- [ ] **Step 2: Run the GitHub Actions unit job and verify the expected failure**

GitHub Actions command:

~~~bash
npm run test:unit -- tests/unit/service-id.test.ts
~~~

Expected result: FAIL because app/lib/services/service-id.ts does not exist.

- [ ] **Step 3: Create the pinned package and TypeScript configuration**

~~~json
{
  "name": "kamelkyp-com",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24 <25"
  },
  "scripts": {
    "build": "react-router build",
    "check": "npm run format:check && npm run typecheck && npm run test:unit && npm run test:worker && npm run build",
    "cf:typegen": "wrangler types --config wrangler.base.jsonc",
    "format": "biome check --write .",
    "format:check": "biome ci .",
    "typegen": "react-router typegen",
    "typecheck": "npm run typegen && tsc -b",
    "test:unit": "vitest run --config vitest.config.ts tests/unit",
    "test:worker": "vitest run --config vitest.worker.config.ts tests/worker",
    "test:e2e": "playwright test",
    "deploy:preview": "node scripts/render-wrangler-config.mjs preview && wrangler deploy --config .wrangler.generated.jsonc",
    "deploy:production": "node scripts/render-wrangler-config.mjs production && wrangler deploy --config .wrangler.generated.jsonc"
  },
  "dependencies": {
    "isbot": "5.2.1",
    "jose": "6.2.3",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "react-router": "8.3.0",
    "wavesurfer.js": "7.12.11",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.12.1",
    "@biomejs/biome": "2.5.6",
    "@cloudflare/vite-plugin": "1.48.0",
    "@cloudflare/vitest-pool-workers": "0.16.19",
    "@playwright/test": "1.61.1",
    "@react-router/dev": "8.3.0",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10",
    "wrangler": "4.114.0"
  }
}
~~~

~~~ts
// app/lib/services/service-id.ts
export const SERVICE_IDS = [
  "full_mix",
  "vocal_mix",
  "simple_transition",
  "edit_transition",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export function isServiceId(value: string): value is ServiceId {
  return (SERVICE_IDS as readonly string[]).includes(value);
}
~~~

~~~ts
// react-router.config.ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
~~~

~~~ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare({ configPath: "./wrangler.base.jsonc" }), reactRouter()],
});
~~~

Create .node-version with exactly:

~~~text
24
~~~

Create .gitignore with:

~~~text
node_modules/
build/
playwright-report/
test-results/
.wrangler/
.wrangler.generated.jsonc
.dev.vars
.env
.env.*
!.env.example
~~~

Biome must reject unused imports and format CSS/JSON/TypeScript:

~~~json
{
  "$schema": "https://biomejs.dev/schemas/2.5.6/schema.json",
  "files": {
    "includes": ["**", "!build", "!node_modules", "!playwright-report"]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
~~~

- [ ] **Step 4: Add the cloud lockfile workflow and generate package-lock.json**

~~~yaml
# .github/workflows/lockfile.yml
name: Refresh lockfile

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  lockfile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.ref_name }}
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm install --package-lock-only --ignore-scripts
      - name: Commit lockfile
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package-lock.json
          git diff --cached --quiet || git commit -m "chore: refresh npm lockfile"
          git push
~~~

Dispatch Refresh lockfile on codex/01-cloud-foundation. Expected result: package-lock.json is committed by github-actions[bot].

- [ ] **Step 5: Verify the ServiceId test passes and commit the scaffold**

GitHub Actions commands:

~~~bash
npm ci
npm run test:unit -- tests/unit/service-id.test.ts
npm run format:check
~~~

Expected result: all commands PASS.

Cloud commit:

~~~text
Message: feat: scaffold React Router 8 Cloudflare project
Paths: package.json, package-lock.json, .node-version, .gitignore,
       biome.json, tsconfig.json, react-router.config.ts, vite.config.ts,
       app/lib/services/service-id.ts, .github/workflows/lockfile.yml
~~~

---

### Task 2: Add the Worker request context and deterministic health route

**Files:**
- Create: wrangler.base.jsonc
- Create: app/lib/env.server.ts
- Create: app/root.tsx
- Create: app/routes.ts
- Create: app/routes/health.ts
- Create: app/routes/language-redirect.tsx
- Create: app/styles/tokens.css
- Create: app/styles/global.css
- Create: workers/app.ts
- Create: tests/unit/config-contract.test.ts
- Create: tests/e2e/smoke.spec.ts
- Create: playwright.config.ts

**Interfaces:**
- Consumes: React Router package scripts from Task 1.
- Produces: Env, React Router AppLoadContext and GET /health.

- [ ] **Step 1: Commit a failing configuration contract test**

~~~ts
// tests/unit/config-contract.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

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
});
~~~

Cloud commit message: test: require Worker SSR configuration.

- [ ] **Step 2: Run the config test and verify it fails**

~~~bash
npm run test:unit -- tests/unit/config-contract.test.ts
~~~

Expected result: FAIL because wrangler.base.jsonc does not exist.

- [ ] **Step 3: Create Worker, Env and health route**

~~~json
{
  "$schema": "https://unpkg.com/wrangler@4.114.0/config-schema.json",
  "name": "kamelkyp-com",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-08-10",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 0.1
  }
}
~~~

~~~ts
// app/lib/env.server.ts
export interface Env {
  DB: D1Database;
  SUBMISSION_RATE_LIMITER: RateLimit;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  CSRF_SECRET: string;
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ADMIN_EMAIL: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_HMAC_SECRET: string;
  FX_API_URL: string;
  APP_ORIGIN: string;
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
~~~

~~~ts
// workers/app.ts
import { createRequestHandler } from "react-router";
import type { Env } from "../app/lib/env.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
~~~

~~~ts
// app/routes/health.ts
export function loader() {
  return Response.json(
    { ok: true, data: { service: "kamelkyp-com", status: "healthy" } },
    { headers: { "cache-control": "no-store" } },
  );
}
~~~

~~~ts
// app/routes/language-redirect.tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return redirect(language.startsWith("zh") ? "/zh" : "/en");
}
~~~

~~~ts
// app/routes.ts
import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  index("routes/language-redirect.tsx"),
] satisfies RouteConfig;
~~~

~~~tsx
// app/root.tsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import globalStyles from "./styles/global.css?url";
import tokenStyles from "./styles/tokens.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: tokenStyles },
  { rel: "stylesheet", href: globalStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
~~~

~~~css
/* app/styles/tokens.css */
:root {
  --color-mineral: #071724;
  --color-console: #0b2030;
  --color-chalk: #f3f1ea;
  --color-cool-gray: #a9b3bc;
  --color-coral: #ff5c4d;
  --motion-fast: 140ms;
  --motion-normal: 220ms;
  --motion-panel: 320ms;
}
~~~

~~~css
/* app/styles/global.css */
* {
  box-sizing: border-box;
}

html {
  color-scheme: dark;
  background: var(--color-mineral);
}

body {
  min-width: 320px;
  margin: 0;
  color: var(--color-chalk);
  background: var(--color-mineral);
  font-family: "Noto Sans TC", system-ui, sans-serif;
}

:focus-visible {
  outline: 2px solid var(--color-coral);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
~~~

- [ ] **Step 4: Add Preview smoke coverage**

~~~ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.PREVIEW_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
~~~

~~~ts
// tests/e2e/smoke.spec.ts
import { expect, test } from "@playwright/test";

test("health endpoint is deterministic", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    data: { service: "kamelkyp-com", status: "healthy" },
  });
});

test("root chooses Chinese for zh browser language", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "zh-TW,zh;q=0.9" });
  await page.goto("/");
  await expect(page).toHaveURL(/\/zh$/);
});
~~~

- [ ] **Step 5: Run cloud checks and commit**

~~~bash
npm run test:unit -- tests/unit/config-contract.test.ts
npm run typecheck
npm run build
~~~

Expected result: PASS. The root E2E remains scheduled for the first Preview in Task 4.

Cloud commit message: feat: add Worker request context and health route.

---

### Task 3: Create the D1 schema and immutable content repository

**Files:**
- Create: migrations/0001_core.sql
- Create: app/lib/db/content-repository.server.ts
- Create: tests/helpers/apply-migrations.ts
- Create: tests/worker/migrations.test.ts
- Create: tests/worker/content-repository.test.ts
- Create: vitest.config.ts
- Create: vitest.worker.config.ts
- Modify: wrangler.base.jsonc
- Modify: workers/app.ts

**Interfaces:**
- Consumes: Env.DB and ServiceId.
- Produces: PublishedContent, getPublishedContent(), createDraftVersion(), publishVersion().

~~~ts
export interface PublishedContent {
  entryId: string;
  kind: "page" | "work" | "post";
  slug: string;
  locale: "zh" | "en";
  versionId: string;
  title: string;
  summary: string | null;
  body: unknown[];
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageUrl: string | null;
  publishedAt: string;
}
~~~

- [ ] **Step 1: Commit failing D1 privacy and publication tests**

~~~ts
// tests/worker/migrations.test.ts
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("D1 schema privacy boundary", () => {
  it("does not create PII columns in cases", async () => {
    const rows = await env.DB.prepare("PRAGMA table_info(cases)").all<{
      name: string;
    }>();
    const names = rows.results.map((row) => row.name);
    expect(names).toEqual([
      "case_id",
      "service_id",
      "locked_price_minor",
      "currency",
      "submitted_at",
      "status",
    ]);
  });
});
~~~

~~~ts
// tests/worker/content-repository.test.ts
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createDraftVersion,
  getPublishedContent,
  publishVersion,
} from "../../app/lib/db/content-repository.server";
describe("content publication", () => {
  it("keeps the previous publication live until the draft is published", async () => {
    const first = await createDraftVersion(env.DB, {
      entryId: "home",
      kind: "page",
      slug: "home",
      locale: "zh",
      title: "第一版",
      summary: null,
      body: [{ type: "paragraph", text: "first" }],
    });
    await publishVersion(env.DB, first.versionId, "2026-08-10T00:00:00Z");

    const second = await createDraftVersion(env.DB, {
      entryId: "home",
      kind: "page",
      slug: "home",
      locale: "zh",
      title: "第二版草稿",
      summary: null,
      body: [{ type: "paragraph", text: "second" }],
    });

    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
      .toBe("第一版");

    await publishVersion(env.DB, second.versionId, "2026-08-11T00:00:00Z");
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
      .toBe("第二版草稿");
  });
});
~~~

Cloud commit message: test: define D1 privacy and publication boundaries.

- [ ] **Step 2: Run Worker tests and verify they fail**

~~~bash
npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts
~~~

Expected result: FAIL because the repository and Worker test configuration do not exist.

- [ ] **Step 3: Create the core migration**

~~~sql
-- migrations/0001_core.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'work', 'post')),
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_listed INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, slug)
);

CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_number INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  title TEXT NOT NULL,
  summary TEXT,
  body_json TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  social_image_url TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (entry_id, locale, version_number)
);

CREATE TABLE IF NOT EXISTS content_publications (
  entry_id TEXT NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_id TEXT NOT NULL UNIQUE
    REFERENCES content_versions(id) ON DELETE RESTRICT,
  published_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, locale)
);

CREATE TABLE IF NOT EXISTS service_definitions (
  id TEXT PRIMARY KEY CHECK (
    id IN ('full_mix', 'vocal_mix', 'simple_transition', 'edit_transition')
  ),
  category TEXT NOT NULL CHECK (category IN ('mixing', 'song_transition')),
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_versions (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_definitions(id),
  base_twd INTEGER NOT NULL CHECK (base_twd > 0),
  per_song_after_five_twd INTEGER NOT NULL DEFAULT 0,
  student_discount_bps INTEGER NOT NULL DEFAULT 3000,
  rush_bps INTEGER NOT NULL DEFAULT 5000,
  consultation_bps INTEGER NOT NULL DEFAULT 5000,
  source_prep_bps INTEGER NOT NULL DEFAULT 500,
  effective_from TEXT NOT NULL,
  retired_at TEXT
);

CREATE TABLE IF NOT EXISTS term_documents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('common', 'service', 'privacy')),
  service_id TEXT REFERENCES service_definitions(id)
);

CREATE TABLE IF NOT EXISTS term_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES term_documents(id),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_number INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  effective_from TEXT,
  UNIQUE (document_id, locale, version_number)
);

CREATE TABLE IF NOT EXISTS term_publications (
  document_id TEXT NOT NULL REFERENCES term_documents(id),
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  version_id TEXT NOT NULL UNIQUE REFERENCES term_versions(id),
  effective_from TEXT NOT NULL,
  PRIMARY KEY (document_id, locale)
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  content_version_id TEXT NOT NULL
    REFERENCES content_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'youtube',
      'google_drive',
      'direct_audio',
      'github_raw_audio',
      'cloudflare_r2_audio',
      'external_link'
    )
  ),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  start_seconds INTEGER,
  end_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK (start_seconds IS NULL OR start_seconds >= 0),
  CHECK (
    end_seconds IS NULL OR
    start_seconds IS NULL OR
    end_seconds > start_seconds
  )
);

CREATE TABLE IF NOT EXISTS link_groups (
  id TEXT PRIMARY KEY,
  stable_key TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES link_groups(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS fx_rates (
  rate_date TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL CHECK (base_currency = 'TWD'),
  quote_currency TEXT NOT NULL CHECK (quote_currency = 'USD'),
  rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
  scale INTEGER NOT NULL CHECK (scale = 100000000),
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  case_id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_definitions(id),
  locked_price_minor INTEGER NOT NULL CHECK (locked_price_minor >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('TWD', 'USD')),
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending_review',
      'pending_deposit',
      'in_production',
      'preview_approval',
      'pending_balance',
      'delivered',
      'paused',
      'cancelled'
    )
  )
);

CREATE TABLE IF NOT EXISTS submission_attempts (
  case_id TEXT PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (
    state IN ('created', 'form_written', 'notified', 'complete', 'failed')
  ),
  payload_hash TEXT,
  terms_versions_json TEXT,
  terms_accepted_at TEXT,
  google_response_id TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO service_definitions (id, category, sort_order) VALUES
  ('full_mix', 'mixing', 10),
  ('vocal_mix', 'mixing', 20),
  ('simple_transition', 'song_transition', 30),
  ('edit_transition', 'song_transition', 40);
~~~

- [ ] **Step 4: Add migration and repository implementations**

~~~ts
// tests/helpers/apply-migrations.ts
import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

declare module "cloudflare:workers" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
~~~

Migration loading stays in the Node-evaluated Worker test configuration. Production application modules never import Cloudflare test packages.

~~~ts
// app/lib/db/content-repository.server.ts
import type { Locale } from "../i18n/locale";

type ContentKind = "page" | "work" | "post";

interface DraftInput {
  entryId: string;
  kind: ContentKind;
  slug: string;
  locale: Locale;
  title: string;
  summary: string | null;
  body: unknown[];
}

export interface PublishedContent {
  entryId: string;
  kind: ContentKind;
  slug: string;
  locale: Locale;
  versionId: string;
  title: string;
  summary: string | null;
  body: unknown[];
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageUrl: string | null;
  publishedAt: string;
}

export async function createDraftVersion(
  db: D1Database,
  input: DraftInput,
): Promise<{ versionId: string }> {
  const now = new Date().toISOString();
  const versionId = crypto.randomUUID();
  const version = await db
    .prepare(
      "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version " +
        "FROM content_versions WHERE entry_id = ? AND locale = ?",
    )
    .bind(input.entryId, input.locale)
    .first<{ next_version: number }>();

  await db.batch([
    db
      .prepare(
        "INSERT INTO content_entries " +
          "(id, kind, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
      )
      .bind(input.entryId, input.kind, input.slug, now, now),
    db
      .prepare(
        "INSERT INTO content_versions " +
          "(id, entry_id, locale, version_number, state, title, summary, " +
          "body_json, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
      )
      .bind(
        versionId,
        input.entryId,
        input.locale,
        version?.next_version ?? 1,
        input.title,
        input.summary,
        JSON.stringify(input.body),
        now,
      ),
  ]);

  return { versionId };
}

export async function publishVersion(
  db: D1Database,
  versionId: string,
  publishedAt: string,
): Promise<void> {
  const version = await db
    .prepare(
      "SELECT entry_id, locale FROM content_versions " +
        "WHERE id = ? AND state = 'draft'",
    )
    .bind(versionId)
    .first<{ entry_id: string; locale: Locale }>();

  if (!version) throw new Error("draft_version_not_found");

  await db.batch([
    db
      .prepare(
        "UPDATE content_versions SET state = 'published', published_at = ? " +
          "WHERE id = ? AND state = 'draft'",
      )
      .bind(publishedAt, versionId),
    db
      .prepare(
        "INSERT INTO content_publications " +
          "(entry_id, locale, version_id, published_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(entry_id, locale) DO UPDATE SET " +
          "version_id = excluded.version_id, published_at = excluded.published_at",
      )
      .bind(version.entry_id, version.locale, versionId, publishedAt),
  ]);
}

export async function getPublishedContent(
  db: D1Database,
  kind: ContentKind,
  slug: string,
  locale: Locale,
): Promise<PublishedContent | null> {
  const row = await db
    .prepare(
      "SELECT e.id AS entry_id, e.kind, e.slug, v.locale, v.id AS version_id, " +
        "v.title, v.summary, v.body_json, v.seo_title, v.seo_description, " +
        "v.social_image_url, p.published_at " +
        "FROM content_entries e " +
        "JOIN content_publications p ON p.entry_id = e.id AND p.locale = ? " +
        "JOIN content_versions v ON v.id = p.version_id " +
        "WHERE e.kind = ? AND e.slug = ?",
    )
    .bind(locale, kind, slug)
    .first<Record<string, string | null>>();

  if (!row) return null;

  return {
    entryId: String(row.entry_id),
    kind: row.kind as ContentKind,
    slug: String(row.slug),
    locale: row.locale as Locale,
    versionId: String(row.version_id),
    title: String(row.title),
    summary: row.summary,
    body: JSON.parse(String(row.body_json)),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    socialImageUrl: row.social_image_url,
    publishedAt: String(row.published_at),
  };
}
~~~

Create app/lib/i18n/locale.ts because the repository consumes it:

~~~ts
export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
~~~

Configure Node tests separately from the current Cloudflare Workers Vitest plugin so tests that import node:fs never run inside workerd:

~~~ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
~~~

~~~ts
// vitest.worker.config.ts
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.base.jsonc" },
      miniflare: {
        d1Databases: ["DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./tests/helpers/apply-migrations.ts"],
  },
});
~~~

- [ ] **Step 5: Run migration, privacy and repository tests, then commit**

~~~bash
npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts
npm run typecheck
npm run build
~~~

Expected result: all PASS. Verify PRAGMA table_info(cases) contains no PII field.

Cloud commit message: feat: add D1 schema and immutable content publications.

---

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

const required = [
  "D1_DATABASE_ID",
  "TURNSTILE_SITE_KEY",
  "ACCESS_AUD",
  "ACCESS_TEAM_DOMAIN",
  "ADMIN_EMAIL",
  "APP_ORIGIN",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`missing_${name.toLowerCase()}`);
}

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
    APP_ORIGIN: process.env.APP_ORIGIN,
  },
};

await writeFile(".wrangler.generated.jsonc", JSON.stringify(config, null, 2));
~~~

Secrets TURNSTILE_SECRET、APPS_SCRIPT_URL、APPS_SCRIPT_HMAC_SECRET are uploaded with Wrangler secret commands in Plans 04–06 and never written into generated JSON.

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
          TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}
          ACCESS_AUD: ${{ secrets.ACCESS_AUD }}
          ACCESS_TEAM_DOMAIN: ${{ secrets.ACCESS_TEAM_DOMAIN }}
          ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
          APP_ORIGIN: ${{ vars.APP_ORIGIN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: npm run deploy:preview
~~~

The preview Environment must contain the exact secrets named above before dispatch. The workflow fails closed when any value is missing.

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
