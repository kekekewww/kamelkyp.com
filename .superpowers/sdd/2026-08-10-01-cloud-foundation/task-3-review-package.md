# Task 3 independent review package

Repository: kekekewww/kamelkyp.com
Code branch: codex/01-cloud-foundation
Base: 63491ea4528365c2ae65f37c1f6054447d3f933a
Head: 5ae770bade4bf3db87adda151585ef144c5a577b
Temporary exact-diff PR: https://github.com/kekekewww/kamelkyp.com/pull/4
Required brief: .superpowers/sdd/2026-08-10-01-cloud-foundation/task-3-brief.md
Implementer report: .superpowers/sdd/2026-08-10-01-cloud-foundation/task-3-report.md
Final GREEN: https://github.com/kekekewww/kamelkyp.com/actions/runs/31406872525
Official updated API source: https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-pool-workers-examples/d1/vitest.config.ts

Review the exact diff below. The brief's /config import was superseded by the official package-root API; user authorized updates to stale APIs. Treat the test-only Miniflare compatibility date separately from the production compatibility date.

```diff
diff --git a/.github/workflows/config-contract.yml b/.github/workflows/config-contract.yml
index 0a85152..3dbe088 100644
--- a/.github/workflows/config-contract.yml
+++ b/.github/workflows/config-contract.yml
@@ -23,6 +23,7 @@ jobs:
           cache-dependency-path: package-lock.json
       - run: npm ci
       - run: npm run test:unit -- tests/unit/config-contract.test.ts
+      - run: npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts
       - run: npm run typecheck
       - run: npm run build
       - run: npx wrangler deploy --dry-run --config build/server/wrangler.json
diff --git a/app/lib/db/content-repository.server.ts b/app/lib/db/content-repository.server.ts
new file mode 100644
index 0000000..5157467
--- /dev/null
+++ b/app/lib/db/content-repository.server.ts
@@ -0,0 +1,141 @@
+import type { Locale } from "../i18n/locale";
+
+type ContentKind = "page" | "work" | "post";
+
+interface DraftInput {
+  entryId: string;
+  kind: ContentKind;
+  slug: string;
+  locale: Locale;
+  title: string;
+  summary: string | null;
+  body: unknown[];
+}
+
+export interface PublishedContent {
+  entryId: string;
+  kind: ContentKind;
+  slug: string;
+  locale: Locale;
+  versionId: string;
+  title: string;
+  summary: string | null;
+  body: unknown[];
+  seoTitle: string | null;
+  seoDescription: string | null;
+  socialImageUrl: string | null;
+  publishedAt: string;
+}
+
+export async function createDraftVersion(
+  db: D1Database,
+  input: DraftInput,
+): Promise<{ versionId: string }> {
+  const now = new Date().toISOString();
+  const versionId = crypto.randomUUID();
+  const version = await db
+    .prepare(
+      "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version " +
+        "FROM content_versions WHERE entry_id = ? AND locale = ?",
+    )
+    .bind(input.entryId, input.locale)
+    .first<{ next_version: number }>();
+
+  await db.batch([
+    db
+      .prepare(
+        "INSERT INTO content_entries " +
+          "(id, kind, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
+          "ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
+      )
+      .bind(input.entryId, input.kind, input.slug, now, now),
+    db
+      .prepare(
+        "INSERT INTO content_versions " +
+          "(id, entry_id, locale, version_number, state, title, summary, " +
+          "body_json, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
+      )
+      .bind(
+        versionId,
+        input.entryId,
+        input.locale,
+        version?.next_version ?? 1,
+        input.title,
+        input.summary,
+        JSON.stringify(input.body),
+        now,
+      ),
+  ]);
+
+  return { versionId };
+}
+
+export async function publishVersion(
+  db: D1Database,
+  versionId: string,
+  publishedAt: string,
+): Promise<void> {
+  const version = await db
+    .prepare(
+      "SELECT entry_id, locale FROM content_versions " +
+        "WHERE id = ? AND state = 'draft'",
+    )
+    .bind(versionId)
+    .first<{ entry_id: string; locale: Locale }>();
+
+  if (!version) throw new Error("draft_version_not_found");
+
+  await db.batch([
+    db
+      .prepare(
+        "UPDATE content_versions SET state = 'published', published_at = ? " +
+          "WHERE id = ? AND state = 'draft'",
+      )
+      .bind(publishedAt, versionId),
+    db
+      .prepare(
+        "INSERT INTO content_publications " +
+          "(entry_id, locale, version_id, published_at) VALUES (?, ?, ?, ?) " +
+          "ON CONFLICT(entry_id, locale) DO UPDATE SET " +
+          "version_id = excluded.version_id, published_at = excluded.published_at",
+      )
+      .bind(version.entry_id, version.locale, versionId, publishedAt),
+  ]);
+}
+
+export async function getPublishedContent(
+  db: D1Database,
+  kind: ContentKind,
+  slug: string,
+  locale: Locale,
+): Promise<PublishedContent | null> {
+  const row = await db
+    .prepare(
+      "SELECT e.id AS entry_id, e.kind, e.slug, v.locale, v.id AS version_id, " +
+        "v.title, v.summary, v.body_json, v.seo_title, v.seo_description, " +
+        "v.social_image_url, p.published_at " +
+        "FROM content_entries e " +
+        "JOIN content_publications p ON p.entry_id = e.id AND p.locale = ? " +
+        "JOIN content_versions v ON v.id = p.version_id " +
+        "WHERE e.kind = ? AND e.slug = ?",
+    )
+    .bind(locale, kind, slug)
+    .first<Record<string, string | null>>();
+
+  if (!row) return null;
+
+  return {
+    entryId: String(row.entry_id),
+    kind: row.kind as ContentKind,
+    slug: String(row.slug),
+    locale: row.locale as Locale,
+    versionId: String(row.version_id),
+    title: String(row.title),
+    summary: row.summary,
+    body: JSON.parse(String(row.body_json)),
+    seoTitle: row.seo_title,
+    seoDescription: row.seo_description,
+    socialImageUrl: row.social_image_url,
+    publishedAt: String(row.published_at),
+  };
+}
diff --git a/app/lib/i18n/locale.ts b/app/lib/i18n/locale.ts
new file mode 100644
index 0000000..bac440a
--- /dev/null
+++ b/app/lib/i18n/locale.ts
@@ -0,0 +1,6 @@
+export const LOCALES = ["zh", "en"] as const;
+export type Locale = (typeof LOCALES)[number];
+
+export function isLocale(value: string): value is Locale {
+  return (LOCALES as readonly string[]).includes(value);
+}
diff --git a/migrations/0001_core.sql b/migrations/0001_core.sql
new file mode 100644
index 0000000..1e7497f
--- /dev/null
+++ b/migrations/0001_core.sql
@@ -0,0 +1,177 @@
+PRAGMA foreign_keys = ON;
+
+CREATE TABLE IF NOT EXISTS content_entries (
+  id TEXT PRIMARY KEY,
+  kind TEXT NOT NULL CHECK (kind IN ('page', 'work', 'post')),
+  slug TEXT NOT NULL,
+  sort_order INTEGER NOT NULL DEFAULT 0,
+  is_listed INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1)),
+  created_at TEXT NOT NULL,
+  updated_at TEXT NOT NULL,
+  UNIQUE (kind, slug)
+);
+
+CREATE TABLE IF NOT EXISTS content_versions (
+  id TEXT PRIMARY KEY,
+  entry_id TEXT NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
+  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
+  version_number INTEGER NOT NULL,
+  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
+  title TEXT NOT NULL,
+  summary TEXT,
+  body_json TEXT NOT NULL,
+  seo_title TEXT,
+  seo_description TEXT,
+  social_image_url TEXT,
+  created_at TEXT NOT NULL,
+  published_at TEXT,
+  UNIQUE (entry_id, locale, version_number)
+);
+
+CREATE TABLE IF NOT EXISTS content_publications (
+  entry_id TEXT NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
+  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
+  version_id TEXT NOT NULL UNIQUE
+    REFERENCES content_versions(id) ON DELETE RESTRICT,
+  published_at TEXT NOT NULL,
+  PRIMARY KEY (entry_id, locale)
+);
+
+CREATE TABLE IF NOT EXISTS service_definitions (
+  id TEXT PRIMARY KEY CHECK (
+    id IN ('full_mix', 'vocal_mix', 'simple_transition', 'edit_transition')
+  ),
+  category TEXT NOT NULL CHECK (category IN ('mixing', 'song_transition')),
+  sort_order INTEGER NOT NULL
+);
+
+CREATE TABLE IF NOT EXISTS price_versions (
+  id TEXT PRIMARY KEY,
+  service_id TEXT NOT NULL REFERENCES service_definitions(id),
+  base_twd INTEGER NOT NULL CHECK (base_twd > 0),
+  per_song_after_five_twd INTEGER NOT NULL DEFAULT 0,
+  student_discount_bps INTEGER NOT NULL DEFAULT 3000,
+  rush_bps INTEGER NOT NULL DEFAULT 5000,
+  consultation_bps INTEGER NOT NULL DEFAULT 5000,
+  source_prep_bps INTEGER NOT NULL DEFAULT 500,
+  effective_from TEXT NOT NULL,
+  retired_at TEXT
+);
+
+CREATE TABLE IF NOT EXISTS term_documents (
+  id TEXT PRIMARY KEY,
+  kind TEXT NOT NULL CHECK (kind IN ('common', 'service', 'privacy')),
+  service_id TEXT REFERENCES service_definitions(id)
+);
+
+CREATE TABLE IF NOT EXISTS term_versions (
+  id TEXT PRIMARY KEY,
+  document_id TEXT NOT NULL REFERENCES term_documents(id),
+  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
+  version_number INTEGER NOT NULL,
+  body_json TEXT NOT NULL,
+  created_at TEXT NOT NULL,
+  effective_from TEXT,
+  UNIQUE (document_id, locale, version_number)
+);
+
+CREATE TABLE IF NOT EXISTS term_publications (
+  document_id TEXT NOT NULL REFERENCES term_documents(id),
+  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
+  version_id TEXT NOT NULL UNIQUE REFERENCES term_versions(id),
+  effective_from TEXT NOT NULL,
+  PRIMARY KEY (document_id, locale)
+);
+
+CREATE TABLE IF NOT EXISTS media_items (
+  id TEXT PRIMARY KEY,
+  content_version_id TEXT NOT NULL
+    REFERENCES content_versions(id) ON DELETE CASCADE,
+  kind TEXT NOT NULL CHECK (
+    kind IN (
+      'youtube',
+      'google_drive',
+      'direct_audio',
+      'github_raw_audio',
+      'cloudflare_r2_audio',
+      'external_link'
+    )
+  ),
+  url TEXT NOT NULL,
+  title TEXT NOT NULL,
+  start_seconds INTEGER,
+  end_seconds INTEGER,
+  sort_order INTEGER NOT NULL DEFAULT 0,
+  CHECK (start_seconds IS NULL OR start_seconds >= 0),
+  CHECK (
+    end_seconds IS NULL OR
+    start_seconds IS NULL OR
+    end_seconds > start_seconds
+  )
+);
+
+CREATE TABLE IF NOT EXISTS link_groups (
+  id TEXT PRIMARY KEY,
+  stable_key TEXT NOT NULL UNIQUE,
+  sort_order INTEGER NOT NULL,
+  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
+);
+
+CREATE TABLE IF NOT EXISTS links (
+  id TEXT PRIMARY KEY,
+  group_id TEXT NOT NULL REFERENCES link_groups(id) ON DELETE CASCADE,
+  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
+  label TEXT NOT NULL,
+  url TEXT NOT NULL,
+  sort_order INTEGER NOT NULL,
+  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
+);
+
+CREATE TABLE IF NOT EXISTS fx_rates (
+  rate_date TEXT PRIMARY KEY,
+  base_currency TEXT NOT NULL CHECK (base_currency = 'TWD'),
+  quote_currency TEXT NOT NULL CHECK (quote_currency = 'USD'),
+  rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
+  scale INTEGER NOT NULL CHECK (scale = 100000000),
+  source TEXT NOT NULL,
+  fetched_at TEXT NOT NULL
+);
+
+CREATE TABLE IF NOT EXISTS cases (
+  case_id TEXT PRIMARY KEY,
+  service_id TEXT NOT NULL REFERENCES service_definitions(id),
+  locked_price_minor INTEGER NOT NULL CHECK (locked_price_minor >= 0),
+  currency TEXT NOT NULL CHECK (currency IN ('TWD', 'USD')),
+  submitted_at TEXT NOT NULL,
+  status TEXT NOT NULL CHECK (
+    status IN (
+      'pending_review',
+      'pending_deposit',
+      'in_production',
+      'preview_approval',
+      'pending_balance',
+      'delivered',
+      'paused',
+      'cancelled'
+    )
+  )
+);
+
+CREATE TABLE IF NOT EXISTS submission_attempts (
+  case_id TEXT PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
+  state TEXT NOT NULL CHECK (
+    state IN ('created', 'form_written', 'notified', 'complete', 'failed')
+  ),
+  payload_hash TEXT,
+  terms_versions_json TEXT,
+  terms_accepted_at TEXT,
+  google_response_id TEXT,
+  last_error_code TEXT,
+  updated_at TEXT NOT NULL
+);
+
+INSERT OR IGNORE INTO service_definitions (id, category, sort_order) VALUES
+  ('full_mix', 'mixing', 10),
+  ('vocal_mix', 'mixing', 20),
+  ('simple_transition', 'song_transition', 30),
+  ('edit_transition', 'song_transition', 40);
diff --git a/tests/helpers/apply-migrations.ts b/tests/helpers/apply-migrations.ts
new file mode 100644
index 0000000..ee96e59
--- /dev/null
+++ b/tests/helpers/apply-migrations.ts
@@ -0,0 +1,7 @@
+import { env } from "cloudflare:workers";
+import { applyD1Migrations } from "cloudflare:test";
+import { beforeAll } from "vitest";
+
+beforeAll(async () => {
+  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
+});
diff --git a/tests/worker/content-repository.test.ts b/tests/worker/content-repository.test.ts
new file mode 100644
index 0000000..c248b29
--- /dev/null
+++ b/tests/worker/content-repository.test.ts
@@ -0,0 +1,39 @@
+import { env } from "cloudflare:workers";
+import { describe, expect, it } from "vitest";
+import {
+  createDraftVersion,
+  getPublishedContent,
+  publishVersion,
+} from "../../app/lib/db/content-repository.server";
+
+describe("content publication", () => {
+  it("keeps the previous publication live until the draft is published", async () => {
+    const first = await createDraftVersion(env.DB, {
+      entryId: "home",
+      kind: "page",
+      slug: "home",
+      locale: "zh",
+      title: "第一版",
+      summary: null,
+      body: [{ type: "paragraph", text: "first" }],
+    });
+    await publishVersion(env.DB, first.versionId, "2026-08-10T00:00:00Z");
+
+    const second = await createDraftVersion(env.DB, {
+      entryId: "home",
+      kind: "page",
+      slug: "home",
+      locale: "zh",
+      title: "第二版草稿",
+      summary: null,
+      body: [{ type: "paragraph", text: "second" }],
+    });
+
+    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
+      .toBe("第一版");
+
+    await publishVersion(env.DB, second.versionId, "2026-08-11T00:00:00Z");
+    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
+      .toBe("第二版草稿");
+  });
+});
diff --git a/tests/worker/env.d.ts b/tests/worker/env.d.ts
new file mode 100644
index 0000000..23aa133
--- /dev/null
+++ b/tests/worker/env.d.ts
@@ -0,0 +1,5 @@
+declare namespace Cloudflare {
+  interface Env {
+    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
+  }
+}
diff --git a/tests/worker/migrations.test.ts b/tests/worker/migrations.test.ts
new file mode 100644
index 0000000..c470090
--- /dev/null
+++ b/tests/worker/migrations.test.ts
@@ -0,0 +1,20 @@
+import { env } from "cloudflare:workers";
+import { describe, expect, it } from "vitest";
+
+describe("D1 schema privacy boundary", () => {
+  it("does not create PII columns in cases", async () => {
+    const rows = await env.DB.prepare("PRAGMA table_info(cases)").all<{
+      name: string;
+    }>();
+    const names = rows.results.map((row) => row.name);
+
+    expect(names).toEqual([
+      "case_id",
+      "service_id",
+      "locked_price_minor",
+      "currency",
+      "submitted_at",
+      "status",
+    ]);
+  });
+});
diff --git a/tsconfig.json b/tsconfig.json
index cc535cf..b875524 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -9,7 +9,7 @@
     "skipLibCheck": true,
     "noEmit": true,
     "rootDirs": [".", "./.react-router/types"],
-    "types": ["vite/client"]
+    "types": ["vite/client", "@cloudflare/vitest-pool-workers/types"]
   },
   "include": [
     "app/**/*.ts",
diff --git a/vitest.config.ts b/vitest.config.ts
index 8fb6f2d..1bd203e 100644
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -1,3 +1,5 @@
 import { defineConfig } from "vitest/config";
 
-export default defineConfig({});
+export default defineConfig({
+  test: { environment: "node" },
+});
diff --git a/vitest.worker.config.ts b/vitest.worker.config.ts
new file mode 100644
index 0000000..e579bcf
--- /dev/null
+++ b/vitest.worker.config.ts
@@ -0,0 +1,23 @@
+import {
+  cloudflareTest,
+  readD1Migrations,
+} from "@cloudflare/vitest-pool-workers";
+import { defineConfig } from "vitest/config";
+
+export default defineConfig({
+  plugins: [
+    cloudflareTest(async () => ({
+      wrangler: { configPath: "./wrangler.base.jsonc" },
+      miniflare: {
+        compatibilityDate: "2026-06-30",
+        d1Databases: ["DB"],
+        bindings: {
+          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
+        },
+      },
+    })),
+  ],
+  test: {
+    setupFiles: ["./tests/helpers/apply-migrations.ts"],
+  },
+});
diff --git a/wrangler.base.jsonc b/wrangler.base.jsonc
index 7b68bd0..aed18e8 100644
--- a/wrangler.base.jsonc
+++ b/wrangler.base.jsonc
@@ -4,6 +4,14 @@
   "main": "./workers/app.ts",
   "compatibility_date": "2026-08-10",
   "compatibility_flags": ["nodejs_compat"],
+  "d1_databases": [
+    {
+      "binding": "DB",
+      "database_name": "kamelkyp-com",
+      "database_id": "00000000-0000-0000-0000-000000000000",
+      "migrations_dir": "migrations"
+    }
+  ],
   "observability": {
     "enabled": true,
     "head_sampling_rate": 0.1

```
