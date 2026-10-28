import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import termsFixture from "../fixtures/terms-e2e.sql?raw";
import termsCleanup from "../fixtures/terms-e2e-cleanup.sql?raw";

/**
 * The terms e2e fixture also runs against the shared, persistent preview D1
 * (scripts/e2e-fixtures.mjs). It must never take the place of a version or a
 * publication the owner made, and its cleanup must put the owner's
 * publications and both immutability triggers back.
 */

/** Statements end with `;` at a line end; a trigger body ends at `END;`. */
function statements(sql: string): string[] {
  const result: string[] = [];
  let current: string[] = [];
  let inTrigger = false;
  for (const line of sql.split("\n")) {
    if (line.trim().startsWith("--")) continue;
    current.push(line);
    if (/^\s*CREATE TRIGGER/i.test(line)) inTrigger = true;
    if (/;\s*$/.test(line) && (!inTrigger || /^\s*END;\s*$/i.test(line))) {
      result.push(current.join("\n").trim());
      current = [];
      inTrigger = false;
    }
  }
  return result.filter(Boolean);
}

async function run(sql: string) {
  for (const statement of statements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

async function publication(documentId: string, locale: string) {
  const row = await env.DB.prepare(
    "SELECT version_id FROM term_publications WHERE document_id = ? AND locale = ?",
  )
    .bind(documentId, locale)
    .first<{ version_id: string }>();
  return row?.version_id ?? null;
}

async function versionNumber(id: string) {
  const row = await env.DB.prepare(
    "SELECT version_number FROM term_versions WHERE id = ?",
  )
    .bind(id)
    .first<{ version_number: number }>();
  return row?.version_number ?? null;
}

async function count(sql: string) {
  const row = await env.DB.prepare(sql).first<{ total: number }>();
  return row?.total ?? 0;
}

const OWNER_BODY = '[{"key":"payment_methods","title":"Owner","text":"Owner"}]';

describe("terms e2e fixture", () => {
  it("never replaces the owner's terms and restores their publications", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) VALUES (?, 'common', 'zh', ?, ?, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')",
      ).bind("owner-common-zh-v1", 1, OWNER_BODY),
      env.DB.prepare(
        "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) VALUES (?, 'common', 'zh', ?, ?, '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z')",
      ).bind("owner-common-zh-v2", 2, OWNER_BODY),
      env.DB.prepare(
        "INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES ('common', 'zh', 'owner-common-zh-v2', '2026-09-02T00:00:00Z')",
      ),
    ]);

    // Twice: an interrupted run leaves its rows behind for the next seed.
    await run(termsFixture);
    await run(termsFixture);

    expect(await publication("common", "zh")).toBe("e2e-common-zh-v1");
    expect(await publication("common", "en")).toBe("e2e-common-en-v1");
    expect(await versionNumber("owner-common-zh-v1")).toBe(1);
    expect(await versionNumber("owner-common-zh-v2")).toBe(2);
    expect(await versionNumber("e2e-common-zh-v1")).toBe(3);
    expect(await versionNumber("e2e-common-en-v1")).toBe(1);

    await run(termsCleanup);

    expect(await publication("common", "zh")).toBe("owner-common-zh-v2");
    expect(await publication("common", "en")).toBeNull();
    expect(
      await count(
        "SELECT (SELECT COUNT(*) FROM term_versions WHERE id LIKE 'e2e-%') + (SELECT COUNT(*) FROM term_publications WHERE version_id LIKE 'e2e-%') AS total",
      ),
    ).toBe(0);
    expect(
      await count(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'e2e_term_publications_backup'",
      ),
    ).toBe(0);
    await expect(
      env.DB.prepare(
        "UPDATE term_versions SET body_json = '[]' WHERE id = 'owner-common-zh-v1'",
      ).run(),
    ).rejects.toThrow(/term_version_immutable/);
    await expect(
      env.DB.prepare(
        "DELETE FROM term_versions WHERE id = 'owner-common-zh-v1'",
      ).run(),
    ).rejects.toThrow(/term_version_immutable/);
  });

  it("cleans up without a seed and restores triggers a stopped seed dropped", async () => {
    await env.DB.prepare(
      "DROP TRIGGER IF EXISTS term_versions_immutable_update",
    ).run();

    await run(termsCleanup);
    await run(termsCleanup);

    expect(
      await count(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name IN ('term_versions_immutable_update', 'term_versions_immutable_delete')",
      ),
    ).toBe(2);
    expect(
      await count(
        "SELECT COUNT(*) AS total FROM term_publications WHERE version_id LIKE 'e2e-%'",
      ),
    ).toBe(0);
  });
});
