import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import cmsFixture from "../fixtures/cms-e2e.sql?raw";
import cmsCleanup from "../fixtures/cms-e2e-cleanup.sql?raw";
import mediaFixture from "../fixtures/media-e2e.sql?raw";
import mediaCleanup from "../fixtures/media-e2e-cleanup.sql?raw";

/**
 * The CMS e2e fixture also runs against the shared, persistent preview D1
 * (scripts/e2e-fixtures.mjs), where an owner track may hold the one showreel
 * slot (music_tracks_single_showreel; a draft legacy-showreel from migration
 * 0007 counts too). The seed must not fail on it, and the cleanup must give
 * the slot back.
 */

/** Statements end with `;` at a line end; `--` lines are comments. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function run(sql: string) {
  for (const statement of statements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

async function showreels(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT id FROM music_tracks WHERE is_showreel = 1 ORDER BY id",
  ).all<{ id: string }>();
  return results.map((row) => row.id);
}

async function count(sql: string) {
  const row = await env.DB.prepare(sql).first<{ total: number }>();
  return row?.total ?? 0;
}

async function ownerTrack(id: string, showreel: boolean) {
  await env.DB.prepare(
    "INSERT INTO music_tracks (id, title_i18n, is_showreel, created_at, updated_at) VALUES (?, ?, ?, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')",
  )
    .bind(id, JSON.stringify({ zh: "Owner", en: "Owner" }), showreel ? 1 : 0)
    .run();
}

async function seed() {
  await run(mediaFixture);
  await run(cmsFixture);
}

async function cleanup() {
  await run(cmsCleanup);
  await run(mediaCleanup);
}

beforeEach(async () => {
  await cleanup();
  await env.DB.prepare(
    "DELETE FROM music_tracks WHERE id GLOB 'owner-*'",
  ).run();
});

describe("cms e2e fixture and the showreel slot", () => {
  it("borrows the owner's showreel slot for the run and gives it back", async () => {
    await ownerTrack("owner-showreel", true);

    // Twice: an interrupted run leaves its rows behind for the next seed.
    await seed();
    await seed();
    expect(await showreels()).toEqual(["e2e-cms-showreel"]);

    await cleanup();
    expect(await showreels()).toEqual(["owner-showreel"]);
    expect(
      await count(
        "SELECT COUNT(*) AS total FROM music_tracks WHERE id GLOB 'e2e-*'",
      ),
    ).toBe(0);
    expect(
      await count(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'e2e_cms_showreel_backup'",
      ),
    ).toBe(0);
  });

  it("keeps a showreel the owner chose while the fixture was in place", async () => {
    await ownerTrack("owner-showreel", true);
    await ownerTrack("owner-newer", false);
    await seed();

    // What the Studio does when the owner picks a showreel.
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE music_tracks SET is_showreel = 0 WHERE is_showreel = 1",
      ),
      env.DB.prepare(
        "UPDATE music_tracks SET is_showreel = 1 WHERE id = 'owner-newer'",
      ),
    ]);

    // A later seed saves the owner's newer choice, not the first one.
    await seed();
    expect(await showreels()).toEqual(["e2e-cms-showreel"]);
    await cleanup();
    expect(await showreels()).toEqual(["owner-newer"]);
  });

  it("restores nothing when no owner track held the slot, and cleans up without a seed", async () => {
    await ownerTrack("owner-plain", false);
    await cleanup();
    await seed();
    expect(await showreels()).toEqual(["e2e-cms-showreel"]);
    await cleanup();
    await cleanup();
    expect(await showreels()).toEqual([]);
  });

  it("does not flag an owner track archived during the run", async () => {
    await ownerTrack("owner-showreel", true);
    await seed();
    await env.DB.prepare(
      "UPDATE music_tracks SET status = 'archived', archived_at = '2026-09-02T00:00:00Z' WHERE id = 'owner-showreel'",
    ).run();
    await cleanup();
    expect(await showreels()).toEqual([]);
    expect(
      await count(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'e2e_cms_showreel_backup'",
      ),
    ).toBe(0);
  });
});
