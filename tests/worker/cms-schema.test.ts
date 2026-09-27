import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  insertExternalAsset,
  insertMusicTrack,
  insertProject,
  publishViaView,
  text,
  uniqueId,
} from "../helpers/cms";

const NOW = "2026-09-24T00:00:00Z";

describe("CMS schema (0005)", () => {
  it("creates every Content Studio table and snapshot view", async () => {
    const rows = await env.DB.prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
    ).all<{ name: string; type: string }>();
    const names = rows.results.map((row) => row.name);
    for (const table of [
      "taxonomy_terms",
      "media_assets",
      "media_usages",
      "projects",
      "project_categories",
      "music_tracks",
      "recognitions",
      "writings",
      "services",
      "social_links",
      "settings",
      "slug_redirects",
      "project_snapshots",
      "music_snapshots",
      "recognition_snapshots",
      "writing_snapshots",
      "service_snapshots",
    ]) {
      expect(names).toContain(table);
    }
    expect(names).not.toContain("legacy_latest_v");
    expect(names).not.toContain("legacy_initial_v");
  });

  it("forbids publishing a TODO_CONTENT row even with raw SQL", async () => {
    const id = await insertProject(env.DB, { todoContent: true });
    await expect(publishViaView(env.DB, "projects", id)).rejects.toThrow(
      /CHECK constraint failed/,
    );
    const row = await env.DB.prepare("SELECT status FROM projects WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();
    expect(row?.status).toBe("draft");
  });

  it("keeps a single homepage showreel and never on an archived track", async () => {
    await env.DB.prepare("UPDATE music_tracks SET is_showreel = 0").run();
    await insertMusicTrack(env.DB, { showreel: true });
    await expect(insertMusicTrack(env.DB, { showreel: true })).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
    const archived = await insertMusicTrack(env.DB);
    await expect(
      env.DB.prepare(
        "UPDATE music_tracks SET status = 'archived', is_showreel = 1 WHERE id = ?",
      )
        .bind(archived)
        .run(),
    ).rejects.toThrow(/constraint failed/);
  });

  it("refuses to delete a published entity", async () => {
    const id = await insertProject(env.DB);
    await publishViaView(env.DB, "projects", id);
    await expect(
      env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run(),
    ).rejects.toThrow(/published_entity_delete_forbidden/);
  });

  it("protects commission-linked services from delete, archive, re-link and prices", async () => {
    await expect(
      env.DB.prepare("DELETE FROM services WHERE id = 'svc-full_mix'").run(),
    ).rejects.toThrow(/published_entity_delete_forbidden|commission_service/);
    await env.DB.prepare(
      "UPDATE services SET status = 'draft' WHERE id = 'svc-vocal_mix'",
    ).run();
    await expect(
      env.DB.prepare("DELETE FROM services WHERE id = 'svc-vocal_mix'").run(),
    ).rejects.toThrow(/commission_service_delete_forbidden/);
    await expect(
      env.DB.prepare(
        "UPDATE services SET status = 'archived' WHERE id = 'svc-vocal_mix'",
      ).run(),
    ).rejects.toThrow(/commission_service_archive_forbidden/);
    await expect(
      env.DB.prepare(
        "UPDATE services SET commission_service_id = 'full_mix' WHERE id = 'svc-vocal_mix'",
      ).run(),
    ).rejects.toThrow(/commission_link_immutable/);
    await expect(
      env.DB.prepare(
        "UPDATE services SET price_amount = 5000, currency = 'TWD' WHERE id = 'svc-vocal_mix'",
      ).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("guards taxonomy references by vocabulary", async () => {
    await expect(
      insertProject(env.DB, { categoryId: "term-recognition_type-award" }),
    ).rejects.toThrow(/term_vocabulary_mismatch/);
    const project = await insertProject(env.DB);
    await expect(
      env.DB.prepare(
        "INSERT INTO project_categories (project_id, term_id, position) VALUES (?, 'term-service_group-mixing', 1)",
      )
        .bind(project)
        .run(),
    ).rejects.toThrow(/term_vocabulary_mismatch/);
    await expect(
      env.DB.prepare(
        "INSERT INTO recognitions (id, type_term_id, created_at, updated_at) VALUES (?, 'term-project_category-ai', ?, ?)",
      )
        .bind(uniqueId("recognition"), NOW, NOW)
        .run(),
    ).rejects.toThrow(/term_vocabulary_mismatch/);
    await expect(
      env.DB.prepare(
        "INSERT INTO services (id, slug, group_term_id, created_at, updated_at) VALUES (?, ?, 'term-project_category-ai', ?, ?)",
      )
        .bind("svc-wrong", "svc-wrong", NOW, NOW)
        .run(),
    ).rejects.toThrow(/term_vocabulary_mismatch/);
  });

  it("blocks deleting media in published use and clears draft references", async () => {
    const used = await insertExternalAsset(env.DB);
    const project = await insertProject(env.DB, { coverImageId: used });
    await env.DB.prepare(
      "INSERT INTO media_usages (asset_id, entity_type, entity_id, field, scope) VALUES (?, 'project', ?, 'coverImageId', 'published')",
    )
      .bind(used, project)
      .run();
    await expect(
      env.DB.prepare("DELETE FROM media_assets WHERE id = ?").bind(used).run(),
    ).rejects.toThrow(/media_asset_in_published_use/);

    const draftOnly = await insertExternalAsset(env.DB);
    const draftProject = await insertProject(env.DB, {
      coverImageId: draftOnly,
    });
    await env.DB.prepare(
      "INSERT INTO media_usages (asset_id, entity_type, entity_id, field, scope) VALUES (?, 'project', ?, 'coverImageId', 'working')",
    )
      .bind(draftOnly, draftProject)
      .run();
    await env.DB.prepare("DELETE FROM media_assets WHERE id = ?")
      .bind(draftOnly)
      .run();
    const row = await env.DB.prepare(
      "SELECT cover_image_id FROM projects WHERE id = ?",
    )
      .bind(draftProject)
      .first<{ cover_image_id: string | null }>();
    expect(row?.cover_image_id).toBeNull();
    const usages = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM media_usages WHERE asset_id = ?",
    )
      .bind(draftOnly)
      .first<{ n: number }>();
    expect(usages?.n).toBe(0);
  });

  it("requires https external media and valid social link URLs", async () => {
    await expect(
      insertExternalAsset(env.DB, { url: "http://insecure.example.com/a.jpg" }),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      env.DB.prepare(
        "INSERT INTO social_links (id, platform, label_i18n, url, created_at, updated_at) VALUES (?, 'github', ?, 'javascript:alert(1)', ?, ?)",
      )
        .bind(uniqueId("social"), text("GitHub"), NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("produces nested snapshot JSON through the view", async () => {
    const id = await insertProject(env.DB, { title: "Snapshot" });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO project_categories (project_id, term_id, position) VALUES (?, 'term-project_category-software', 0)",
      ).bind(id),
      env.DB.prepare(
        "INSERT INTO project_categories (project_id, term_id, position) VALUES (?, 'term-project_category-ai', 1)",
      ).bind(id),
    ]);
    const row = await env.DB.prepare(
      "SELECT snapshot FROM project_snapshots WHERE id = ?",
    )
      .bind(id)
      .first<{ snapshot: string }>();
    const snapshot = JSON.parse(row?.snapshot ?? "{}");
    expect(snapshot.schema_version).toBe(1);
    expect(snapshot.core.title_i18n).toEqual({
      zh: "Snapshot",
      en: "Snapshot",
    });
    expect(snapshot.core.categories).toEqual(
      expect.arrayContaining([
        [0, "term-project_category-software"],
        [1, "term-project_category-ai"],
      ]),
    );
    expect(snapshot.media.gallery).toEqual([]);
    expect(snapshot.story.context_i18n).toEqual({ zh: "", en: "" });
    expect(snapshot.extra.body_i18n).toEqual({ zh: [], en: [] });
  });
});

describe("CMS base seed (0006)", () => {
  it("seeds every vocabulary term", async () => {
    const rows = await env.DB.prepare(
      "SELECT vocabulary, COUNT(*) AS n FROM taxonomy_terms WHERE id GLOB 'term-*' GROUP BY vocabulary ORDER BY vocabulary",
    ).all<{ vocabulary: string; n: number }>();
    expect(rows.results).toEqual([
      { vocabulary: "project_category", n: 7 },
      { vocabulary: "recognition_type", n: 6 },
      { vocabulary: "service_group", n: 6 },
    ]);
    const group = await env.DB.prepare(
      "SELECT data_json FROM taxonomy_terms WHERE id = 'term-service_group-music-production'",
    ).first<{ data_json: string }>();
    expect(JSON.parse(group?.data_json ?? "{}")).toEqual({ area: "mixing" });
  });

  it("seeds brand settings as Kamel with the contact email flagged", async () => {
    const row = await env.DB.prepare(
      "SELECT data_json, revision FROM settings WHERE key = 'brand'",
    ).first<{ data_json: string; revision: number }>();
    const brand = JSON.parse(row?.data_json ?? "{}");
    expect(brand.schemaVersion).toBe(1);
    expect(brand.brandName).toBe("Kamel");
    expect(brand.contactEmailConfirmedAt).toBeNull();
    expect(brand.redesignCopyAcknowledgedAt).toBeNull();
    expect(brand.roles).toHaveLength(3);
    expect(brand.capabilities).toHaveLength(4);
    expect(brand.aboutSections).toHaveLength(4);
    expect(brand.primaryCta.href).toBe("/commission");
  });

  it("seeds site settings with sections visible and counts 4/3/3", async () => {
    const row = await env.DB.prepare(
      "SELECT data_json FROM settings WHERE key = 'site'",
    ).first<{ data_json: string }>();
    const site = JSON.parse(row?.data_json ?? "{}");
    expect(site.availability.status).toBe("unspecified");
    expect(site.homepage.featuredProjectCount).toBe(4);
    expect(site.homepage.writingCount).toBe(3);
    expect(site.homepage.recognitionCount).toBe(3);
    expect(Object.values(site.homepage.sections).every(Boolean)).toBe(true);
    expect(site.copyright).toEqual({
      zh: "© {year} {brand}",
      en: "© {year} {brand}",
    });
  });

  it("publishes the four commission services without their own prices", async () => {
    const rows = await env.DB.prepare(
      "SELECT id, commission_service_id, price_mode, price_amount, currency, published_json " +
        "FROM services WHERE commission_service_id IS NOT NULL ORDER BY sort_order",
    ).all<{
      id: string;
      commission_service_id: string;
      price_mode: string;
      price_amount: number | null;
      currency: string | null;
      published_json: string | null;
    }>();
    expect(rows.results.map((row) => row.commission_service_id)).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
    for (const row of rows.results) {
      expect(row.price_mode).toBe("starting_from");
      expect(row.price_amount).toBeNull();
      expect(row.currency).toBeNull();
      expect(row.published_json).not.toBeNull();
    }
    const full = JSON.parse(rows.results[0]?.published_json ?? "{}");
    expect(full.core.name_i18n.en).toBe("Full Song Mixing");
  });

  it("publishes the seven software offerings as custom quotes", async () => {
    const rows = await env.DB.prepare(
      "SELECT status, price_mode, price_amount FROM services WHERE legacy_source GLOB 'software-services:*'",
    ).all<{
      status: string;
      price_mode: string;
      price_amount: number | null;
    }>();
    expect(rows.results).toHaveLength(7);
    expect(
      rows.results.every(
        (row) =>
          row.status === "published" &&
          row.price_mode === "custom_quote" &&
          row.price_amount === null,
      ),
    ).toBe(true);
  });

  it("leaves the price source of truth in price_versions untouched", async () => {
    const row = await env.DB.prepare(
      "SELECT base_twd FROM price_versions WHERE id = 'full-2026-08-10'",
    ).first<{ base_twd: number }>();
    expect(row?.base_twd).toBe(8000);
  });
});

describe("CMS sample drafts (0008)", () => {
  it("seeds every file placeholder as a TODO_CONTENT draft that is never featured", async () => {
    for (const [table, count] of [
      ["projects", 6],
      ["recognitions", 3],
      ["writings", 4],
    ] as const) {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n, SUM(todo_content) AS todo, SUM(featured) AS featured, ` +
          `SUM(status <> 'draft') AS live FROM ${table} WHERE legacy_source GLOB 'file:*'`,
      ).first<{ n: number; todo: number; featured: number; live: number }>();
      expect(row).toEqual({ n: count, todo: count, featured: 0, live: 0 });
    }
    const categories = await env.DB.prepare(
      "SELECT term_id FROM project_categories WHERE project_id = 'seed-p-001' ORDER BY position",
    ).all<{ term_id: string }>();
    expect(categories.results.map((row) => row.term_id)).toEqual([
      "term-project_category-ai",
      "term-project_category-software",
    ]);
  });

  it("contains no personal-name variants in any seeded content", async () => {
    const deny = /楊子賢|子賢|kevin|yaung|\byang\b/i;
    const tables = [
      "projects",
      "recognitions",
      "writings",
      "services",
      "taxonomy_terms",
      "music_tracks",
      "social_links",
    ];
    for (const table of tables) {
      const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows.results) {
        expect(JSON.stringify(row)).not.toMatch(deny);
      }
    }
    const brand = await env.DB.prepare(
      "SELECT data_json FROM settings WHERE key = 'brand'",
    ).first<{ data_json: string }>();
    const { contactEmail: _email, ...rest } = JSON.parse(
      brand?.data_json ?? "{}",
    );
    expect(JSON.stringify(rest)).not.toMatch(deny);
    const site = await env.DB.prepare(
      "SELECT data_json FROM settings WHERE key = 'site'",
    ).first<{ data_json: string }>();
    expect(site?.data_json).not.toMatch(deny);
  });
});
