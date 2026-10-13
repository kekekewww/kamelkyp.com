import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { applyMigrationQueries } from "../helpers/cms";

const SEEDS = [
  ["edit-2026-08-10", "edit_transition", 4000, 800],
  ["full-2026-08-10", "full_mix", 8000, 0],
  ["simple-2026-08-10", "simple_transition", 1000, 200],
  ["vocal-2026-08-10", "vocal_mix", 4000, 0],
] as const;

async function count(table: string): Promise<number> {
  return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first(
    "n",
  )) as number;
}

async function tableNames(): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name",
  ).all<{ name: string }>();
  return rows.results.map((row) => row.name);
}

describe("migration 0009_pricing_terms_studio", () => {
  it("adds the two tables and inserts nothing", async () => {
    const names = await tableNames();
    expect(names).toContain("price_version_publications");
    expect(names).toContain("term_drafts");
    expect(names).toContain("price_version_publications_immutable_update");
    expect(names).toContain("price_version_publications_immutable_delete");
    expect(await count("price_version_publications")).toBe(0);
    expect(await count("term_drafts")).toBe(0);
  });

  it("keeps exactly the four seeded price versions", async () => {
    const rows = await env.DB.prepare(
      "SELECT id, service_id, base_twd, per_song_after_five_twd, student_discount_bps, " +
        "rush_bps, consultation_bps, source_prep_bps, effective_from, retired_at " +
        "FROM price_versions ORDER BY id",
    ).all();
    expect(rows.results).toEqual(
      SEEDS.map(([id, serviceId, base, perSong]) => ({
        id,
        service_id: serviceId,
        base_twd: base,
        per_song_after_five_twd: perSong,
        student_discount_bps: 3000,
        rush_bps: 5000,
        consultation_bps: 5000,
        source_prep_bps: 500,
        effective_from: "2026-08-10T00:00:00Z",
        retired_at: null,
      })),
    );
  });

  it("re-runs without changing anything", async () => {
    const before = await tableNames();
    await applyMigrationQueries(env.DB, env.TEST_MIGRATIONS, [
      "0009_pricing_terms_studio",
    ]);
    expect(await tableNames()).toEqual(before);
    expect(await count("price_versions")).toBe(4);
    expect(await count("price_version_publications")).toBe(0);
    expect(await count("term_drafts")).toBe(0);
  });

  it("keeps publish metadata immutable and requires a version id", async () => {
    await env.DB.prepare(
      "INSERT INTO price_versions (id, service_id, base_twd, effective_from) " +
        "VALUES ('mig-0009-v', 'full_mix', 8000, '2099-01-01T00:00:00.000Z')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO price_version_publications (version_id, published_at, action) " +
        "VALUES ('mig-0009-v', '2026-10-13T00:00:00.000Z', 'publish')",
    ).run();
    await expect(
      env.DB.prepare(
        "UPDATE price_version_publications SET published_at = 'x' WHERE version_id = 'mig-0009-v'",
      ).run(),
    ).rejects.toThrow(/price_version_immutable/);
    await expect(
      env.DB.prepare(
        "DELETE FROM price_version_publications WHERE version_id = 'mig-0009-v'",
      ).run(),
    ).rejects.toThrow(/price_version_immutable/);
    await expect(
      env.DB.prepare(
        "INSERT INTO price_version_publications (version_id, published_at) VALUES (NULL, 'x')",
      ).run(),
    ).rejects.toThrow(/NOT NULL/);
    // A replacement must name what it replaces; a plain publish must not.
    await expect(
      env.DB.prepare(
        "INSERT INTO price_version_publications (version_id, published_at, action) " +
          "VALUES ('full-2026-08-10', 'x', 'replace')",
      ).run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("enforces the term_drafts checks", async () => {
    const insert = (locale: string, body: string, revision: number) =>
      env.DB.prepare(
        "INSERT INTO term_drafts (document_id, locale, body_json, base_version_id, revision, created_at, updated_at) " +
          "VALUES ('common', ?, ?, NULL, ?, 'x', 'x')",
      )
        .bind(locale, body, revision)
        .run();
    await expect(insert("fr", "[]", 1)).rejects.toThrow(/CHECK/);
    await expect(insert("zh", "[]", 0)).rejects.toThrow(/CHECK/);
    await expect(insert("zh", "{}", 1)).rejects.toThrow(/CHECK/);
    await expect(insert("zh", "not json", 1)).rejects.toThrow();
    await insert("zh", "[]", 1);
    await expect(insert("zh", "[]", 1)).rejects.toThrow(/UNIQUE|PRIMARY/);
    await env.DB.prepare(
      "DELETE FROM term_drafts WHERE document_id = 'common'",
    ).run();
    expect(await count("term_drafts")).toBe(0);
  });
});
