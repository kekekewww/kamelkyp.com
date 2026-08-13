# Task 3 Fix Round 2 re-review package

Repository: kekekewww/kamelkyp.com
Code branch: codex/01-cloud-foundation
Fix base: 5ae770bade4bf3db87adda151585ef144c5a577b
Fix head: bf67c394e5e4ea36228b47a2d710a6f44e2851e3
Temporary exact-diff PR: https://github.com/kekekewww/kamelkyp.com/pull/5
Original review package: task-3-review-package.md
Updated implementer report: task-3-report.md
RED config: https://github.com/kekekewww/kamelkyp.com/actions/runs/31407952019
RED behavior: https://github.com/kekekewww/kamelkyp.com/actions/runs/31408069559
GREEN: https://github.com/kekekewww/kamelkyp.com/actions/runs/31408461684

Original findings: publishVersion TOCTOU; draft number TOCTOU; committed all-zero database_id; publication tuple integrity; insufficient race/invariant tests.

```diff
diff --git a/.github/workflows/config-contract.yml b/.github/workflows/config-contract.yml
index 3dbe088..2c4a8f3 100644
--- a/.github/workflows/config-contract.yml
+++ b/.github/workflows/config-contract.yml
@@ -22,8 +22,8 @@ jobs:
           cache: npm
           cache-dependency-path: package-lock.json
       - run: npm ci
-      - run: npm run test:unit -- tests/unit/config-contract.test.ts
       - run: npm run test:worker -- tests/worker/migrations.test.ts tests/worker/content-repository.test.ts
+      - run: npm run test:unit
       - run: npm run typecheck
       - run: npm run build
       - run: npx wrangler deploy --dry-run --config build/server/wrangler.json
diff --git a/app/lib/db/content-repository.server.ts b/app/lib/db/content-repository.server.ts
index 5157467..77fd5da 100644
--- a/app/lib/db/content-repository.server.ts
+++ b/app/lib/db/content-repository.server.ts
@@ -33,13 +33,6 @@ export async function createDraftVersion(
 ): Promise<{ versionId: string }> {
   const now = new Date().toISOString();
   const versionId = crypto.randomUUID();
-  const version = await db
-    .prepare(
-      "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version " +
-        "FROM content_versions WHERE entry_id = ? AND locale = ?",
-    )
-    .bind(input.entryId, input.locale)
-    .first<{ next_version: number }>();
 
   await db.batch([
     db
@@ -53,17 +46,21 @@ export async function createDraftVersion(
       .prepare(
         "INSERT INTO content_versions " +
           "(id, entry_id, locale, version_number, state, title, summary, " +
-          "body_json, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
+          "body_json, created_at) " +
+          "SELECT ?, ?, ?, COALESCE(MAX(version_number), 0) + 1, 'draft', " +
+          "?, ?, ?, ? FROM content_versions " +
+          "WHERE entry_id = ? AND locale = ?",
       )
       .bind(
         versionId,
         input.entryId,
         input.locale,
-        version?.next_version ?? 1,
         input.title,
         input.summary,
         JSON.stringify(input.body),
         now,
+        input.entryId,
+        input.locale,
       ),
   ]);
 
@@ -75,32 +72,17 @@ export async function publishVersion(
   versionId: string,
   publishedAt: string,
 ): Promise<void> {
-  const version = await db
+  const result = await db
     .prepare(
-      "SELECT entry_id, locale FROM content_versions " +
+      "UPDATE content_versions SET state = 'published', published_at = ? " +
         "WHERE id = ? AND state = 'draft'",
     )
-    .bind(versionId)
-    .first<{ entry_id: string; locale: Locale }>();
+    .bind(publishedAt, versionId)
+    .run();
 
-  if (!version) throw new Error("draft_version_not_found");
-
-  await db.batch([
-    db
-      .prepare(
-        "UPDATE content_versions SET state = 'published', published_at = ? " +
-          "WHERE id = ? AND state = 'draft'",
-      )
-      .bind(publishedAt, versionId),
-    db
-      .prepare(
-        "INSERT INTO content_publications " +
-          "(entry_id, locale, version_id, published_at) VALUES (?, ?, ?, ?) " +
-          "ON CONFLICT(entry_id, locale) DO UPDATE SET " +
-          "version_id = excluded.version_id, published_at = excluded.published_at",
-      )
-      .bind(version.entry_id, version.locale, versionId, publishedAt),
-  ]);
+  if (result.meta.changes === 0) {
+    throw new Error("draft_version_not_found");
+  }
 }
 
 export async function getPublishedContent(
diff --git a/migrations/0001_core.sql b/migrations/0001_core.sql
index 1e7497f..462191e 100644
--- a/migrations/0001_core.sql
+++ b/migrations/0001_core.sql
@@ -25,7 +25,8 @@ CREATE TABLE IF NOT EXISTS content_versions (
   social_image_url TEXT,
   created_at TEXT NOT NULL,
   published_at TEXT,
-  UNIQUE (entry_id, locale, version_number)
+  UNIQUE (entry_id, locale, version_number),
+  UNIQUE (id, entry_id, locale)
 );
 
 CREATE TABLE IF NOT EXISTS content_publications (
@@ -34,9 +35,57 @@ CREATE TABLE IF NOT EXISTS content_publications (
   version_id TEXT NOT NULL UNIQUE
     REFERENCES content_versions(id) ON DELETE RESTRICT,
   published_at TEXT NOT NULL,
-  PRIMARY KEY (entry_id, locale)
+  PRIMARY KEY (entry_id, locale),
+  FOREIGN KEY (version_id, entry_id, locale)
+    REFERENCES content_versions(id, entry_id, locale) ON DELETE RESTRICT
 );
 
+CREATE TRIGGER content_versions_publish_pointer
+AFTER UPDATE OF state ON content_versions
+WHEN OLD.state = 'draft' AND NEW.state = 'published'
+BEGIN
+  INSERT INTO content_publications (
+    entry_id,
+    locale,
+    version_id,
+    published_at
+  ) VALUES (
+    NEW.entry_id,
+    NEW.locale,
+    NEW.id,
+    NEW.published_at
+  )
+  ON CONFLICT(entry_id, locale) DO UPDATE SET
+    version_id = excluded.version_id,
+    published_at = excluded.published_at;
+END;
+
+CREATE TRIGGER content_publications_require_matching_version_insert
+BEFORE INSERT ON content_publications
+WHEN NOT EXISTS (
+  SELECT 1
+  FROM content_versions
+  WHERE id = NEW.version_id
+    AND entry_id = NEW.entry_id
+    AND locale = NEW.locale
+)
+BEGIN
+  SELECT RAISE(ABORT, 'content_publication_version_mismatch');
+END;
+
+CREATE TRIGGER content_publications_require_matching_version_update
+BEFORE UPDATE OF entry_id, locale, version_id ON content_publications
+WHEN NOT EXISTS (
+  SELECT 1
+  FROM content_versions
+  WHERE id = NEW.version_id
+    AND entry_id = NEW.entry_id
+    AND locale = NEW.locale
+)
+BEGIN
+  SELECT RAISE(ABORT, 'content_publication_version_mismatch');
+END;
+
 CREATE TABLE IF NOT EXISTS service_definitions (
   id TEXT PRIMARY KEY CHECK (
     id IN ('full_mix', 'vocal_mix', 'simple_transition', 'edit_transition')
@@ -72,7 +121,8 @@ CREATE TABLE IF NOT EXISTS term_versions (
   body_json TEXT NOT NULL,
   created_at TEXT NOT NULL,
   effective_from TEXT,
-  UNIQUE (document_id, locale, version_number)
+  UNIQUE (document_id, locale, version_number),
+  UNIQUE (id, document_id, locale)
 );
 
 CREATE TABLE IF NOT EXISTS term_publications (
@@ -80,9 +130,37 @@ CREATE TABLE IF NOT EXISTS term_publications (
   locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
   version_id TEXT NOT NULL UNIQUE REFERENCES term_versions(id),
   effective_from TEXT NOT NULL,
-  PRIMARY KEY (document_id, locale)
+  PRIMARY KEY (document_id, locale),
+  FOREIGN KEY (version_id, document_id, locale)
+    REFERENCES term_versions(id, document_id, locale)
 );
 
+CREATE TRIGGER term_publications_require_matching_version_insert
+BEFORE INSERT ON term_publications
+WHEN NOT EXISTS (
+  SELECT 1
+  FROM term_versions
+  WHERE id = NEW.version_id
+    AND document_id = NEW.document_id
+    AND locale = NEW.locale
+)
+BEGIN
+  SELECT RAISE(ABORT, 'term_publication_version_mismatch');
+END;
+
+CREATE TRIGGER term_publications_require_matching_version_update
+BEFORE UPDATE OF document_id, locale, version_id ON term_publications
+WHEN NOT EXISTS (
+  SELECT 1
+  FROM term_versions
+  WHERE id = NEW.version_id
+    AND document_id = NEW.document_id
+    AND locale = NEW.locale
+)
+BEGIN
+  SELECT RAISE(ABORT, 'term_publication_version_mismatch');
+END;
+
 CREATE TABLE IF NOT EXISTS media_items (
   id TEXT PRIMARY KEY,
   content_version_id TEXT NOT NULL
diff --git a/tests/unit/config-contract.test.ts b/tests/unit/config-contract.test.ts
index 8c4b0e5..97ef2ce 100644
--- a/tests/unit/config-contract.test.ts
+++ b/tests/unit/config-contract.test.ts
@@ -12,4 +12,12 @@ describe("cloud project configuration", () => {
     expect(wranglerConfig.main).toBe("./workers/app.ts");
     expect(wranglerConfig.compatibility_flags).toContain("nodejs_compat");
   });
+
+  it("keeps production D1 identifiers out of the committed base config", async () => {
+    const wranglerConfig = JSON.parse(
+      await readFile("wrangler.base.jsonc", "utf8"),
+    );
+
+    expect(wranglerConfig.d1_databases[0]).not.toHaveProperty("database_id");
+  });
 });
diff --git a/tests/worker/content-repository.test.ts b/tests/worker/content-repository.test.ts
index c248b29..cc644ca 100644
--- a/tests/worker/content-repository.test.ts
+++ b/tests/worker/content-repository.test.ts
@@ -6,28 +6,27 @@ import {
   publishVersion,
 } from "../../app/lib/db/content-repository.server";
 
+function draftInput(entryId: string, title: string) {
+  return {
+    entryId,
+    kind: "page" as const,
+    slug: entryId,
+    locale: "zh" as const,
+    title,
+    summary: null,
+    body: [{ type: "paragraph", text: title }],
+  };
+}
+
 describe("content publication", () => {
   it("keeps the previous publication live until the draft is published", async () => {
-    const first = await createDraftVersion(env.DB, {
-      entryId: "home",
-      kind: "page",
-      slug: "home",
-      locale: "zh",
-      title: "第一版",
-      summary: null,
-      body: [{ type: "paragraph", text: "first" }],
-    });
+    const first = await createDraftVersion(env.DB, draftInput("home", "第一版"));
     await publishVersion(env.DB, first.versionId, "2026-08-10T00:00:00Z");
 
-    const second = await createDraftVersion(env.DB, {
-      entryId: "home",
-      kind: "page",
-      slug: "home",
-      locale: "zh",
-      title: "第二版草稿",
-      summary: null,
-      body: [{ type: "paragraph", text: "second" }],
-    });
+    const second = await createDraftVersion(
+      env.DB,
+      draftInput("home", "第二版草稿"),
+    );
 
     expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
       .toBe("第一版");
@@ -36,4 +35,99 @@ describe("content publication", () => {
     expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
       .toBe("第二版草稿");
   });
+
+  it("assigns unique sequential draft numbers to concurrent drafts", async () => {
+    const [first, second] = await Promise.all([
+      createDraftVersion(env.DB, draftInput("parallel-drafts", "first")),
+      createDraftVersion(env.DB, draftInput("parallel-drafts", "second")),
+    ]);
+
+    expect(first.versionId).not.toBe(second.versionId);
+    const rows = await env.DB
+      .prepare(
+        "SELECT version_number FROM content_versions " +
+          "WHERE entry_id = ? AND locale = ? ORDER BY version_number",
+      )
+      .bind("parallel-drafts", "zh")
+      .all<{ version_number: number }>();
+
+    expect(rows.results.map((row) => row.version_number)).toEqual([1, 2]);
+  });
+
+  it("publishes a draft only once when concurrent callers race", async () => {
+    const draft = await createDraftVersion(
+      env.DB,
+      draftInput("parallel-publication", "only once"),
+    );
+    const times = ["2026-08-12T00:00:00Z", "2026-08-13T00:00:00Z"];
+
+    const results = await Promise.allSettled(
+      times.map((publishedAt) =>
+        publishVersion(env.DB, draft.versionId, publishedAt),
+      ),
+    );
+
+    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
+    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
+
+    const pointer = await env.DB
+      .prepare(
+        "SELECT p.published_at AS pointer_published_at, " +
+          "v.published_at AS version_published_at " +
+          "FROM content_publications p " +
+          "JOIN content_versions v ON v.id = p.version_id " +
+          "WHERE p.entry_id = ? AND p.locale = ?",
+      )
+      .bind("parallel-publication", "zh")
+      .first<{
+        pointer_published_at: string;
+        version_published_at: string;
+      }>();
+
+    expect(pointer?.pointer_published_at).toBe(pointer?.version_published_at);
+    expect(times).toContain(pointer?.pointer_published_at);
+  });
+
+  it("rejects a content publication pointer with a mismatched version tuple", async () => {
+    await createDraftVersion(env.DB, draftInput("content-a", "A"));
+    const other = await createDraftVersion(env.DB, draftInput("content-b", "B"));
+
+    await expect(
+      env.DB
+        .prepare(
+          "INSERT INTO content_publications " +
+            "(entry_id, locale, version_id, published_at) VALUES (?, ?, ?, ?)",
+        )
+        .bind("content-a", "zh", other.versionId, "2026-08-14T00:00:00Z")
+        .run(),
+    ).rejects.toThrow();
+  });
+
+  it("rejects a term publication pointer with a mismatched version tuple", async () => {
+    await env.DB.batch([
+      env.DB
+        .prepare("INSERT INTO term_documents (id, kind) VALUES (?, ?)")
+        .bind("term-a", "common"),
+      env.DB
+        .prepare("INSERT INTO term_documents (id, kind) VALUES (?, ?)")
+        .bind("term-b", "common"),
+      env.DB
+        .prepare(
+          "INSERT INTO term_versions " +
+            "(id, document_id, locale, version_number, body_json, created_at) " +
+            "VALUES (?, ?, ?, ?, ?, ?)",
+        )
+        .bind("term-version-b", "term-b", "zh", 1, "[]", "2026-08-14T00:00:00Z"),
+    ]);
+
+    await expect(
+      env.DB
+        .prepare(
+          "INSERT INTO term_publications " +
+            "(document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
+        )
+        .bind("term-a", "zh", "term-version-b", "2026-08-14T00:00:00Z")
+        .run(),
+    ).rejects.toThrow();
+  });
 });
diff --git a/wrangler.base.jsonc b/wrangler.base.jsonc
index aed18e8..ddd3eb6 100644
--- a/wrangler.base.jsonc
+++ b/wrangler.base.jsonc
@@ -8,7 +8,6 @@
     {
       "binding": "DB",
       "database_name": "kamelkyp-com",
-      "database_id": "00000000-0000-0000-0000-000000000000",
       "migrations_dir": "migrations"
     }
   ],

```
