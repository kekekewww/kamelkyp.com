import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrationQueries } from "../helpers/cms";

const T0 = "2026-08-20T00:00:00Z";
const T1 = "2026-08-21T00:00:00Z";

function body(...blocks: object[]): string {
  return JSON.stringify(blocks);
}

async function seedLegacy(db: D1Database) {
  const statements: D1PreparedStatement[] = [];
  const entry = (id: string, kind: string, slug: string, listed = 1) =>
    statements.push(
      db
        .prepare(
          "INSERT INTO content_entries (id, kind, slug, sort_order, is_listed, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
        )
        .bind(id, kind, slug, listed, T0, T1),
    );
  const version = (
    id: string,
    entryId: string,
    locale: "zh" | "en",
    number: number,
    state: "draft" | "published",
    title: string,
    bodyJson = body({ type: "paragraph", text: title }),
    social: string | null = null,
  ) =>
    statements.push(
      db
        .prepare(
          "INSERT INTO content_versions (id, entry_id, locale, version_number, state, title, summary, body_json, social_image_url, created_at, published_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          entryId,
          locale,
          number,
          state,
          title,
          `${title} summary`,
          bodyJson,
          social,
          T0,
          state === "published" ? T1 : null,
        ),
    );
  const publication = (entryId: string, locale: string, versionId: string) =>
    statements.push(
      db
        .prepare(
          "INSERT INTO content_publications (entry_id, locale, version_id, published_at) VALUES (?, ?, ?, ?)",
        )
        .bind(entryId, locale, versionId, T1),
    );
  const media = (
    id: string,
    versionId: string,
    kind: string,
    url: string,
    sort = 0,
  ) =>
    statements.push(
      db
        .prepare(
          "INSERT INTO media_items (id, content_version_id, kind, url, title, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, versionId, kind, url, `Media ${id}`, sort),
    );

  // Work A: published zh + en, newer zh draft, a media block and a social image.
  entry("work-a", "work", "legacy-work-a");
  version(
    "wa-zh-1",
    "work-a",
    "zh",
    1,
    "published",
    "作品 A",
    body(
      { type: "paragraph", text: "作品 A" },
      { type: "media", mediaId: "media-a" },
    ),
    "https://images.example.com/work-a/cover.jpg",
  );
  version("wa-en-1", "work-a", "en", 1, "published", "Work A");
  version("wa-zh-2", "work-a", "zh", 2, "draft", "作品 A（修訂）");
  media(
    "media-a",
    "wa-zh-1",
    "github_raw_audio",
    "https://raw.githubusercontent.com/o/r/main/a.wav",
  );
  publication("work-a", "zh", "wa-zh-1");
  publication("work-a", "en", "wa-en-1");

  // Work B: never published (zh draft only).
  entry("work-b", "work", "legacy-work-b", 0);
  version("wb-zh-1", "work-b", "zh", 1, "draft", "作品 B");

  // Work C: published in zh only.
  entry("work-c", "work", "legacy-work-c");
  version("wc-zh-1", "work-c", "zh", 1, "published", "作品 C");
  publication("work-c", "zh", "wc-zh-1");

  // Post D: published in both locales.
  entry("post-d", "post", "legacy-post-d");
  version("pd-zh-1", "post-d", "zh", 1, "published", "文章 D");
  version("pd-en-1", "post-d", "en", 1, "published", "Post D");
  publication("post-d", "zh", "pd-zh-1");
  publication("post-d", "en", "pd-en-1");

  // Home page: the first media item is the showreel.
  entry("page-home", "page", "home");
  version("home-zh-1", "page-home", "zh", 1, "published", "首頁");
  media(
    "home-reel",
    "home-zh-1",
    "direct_audio",
    "https://audio.example.com/reel.mp3",
    0,
  );
  media(
    "home-video",
    "home-zh-1",
    "youtube",
    "https://www.youtube.com/watch?v=abc123",
    1,
  );
  publication("page-home", "zh", "home-zh-1");

  // Admin "social" link group.
  statements.push(
    db.prepare(
      "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('admin-social', 'social', 10, 1)",
    ),
  );
  for (const [id, locale, label, url, sort] of [
    ["l-ig-zh", "zh", "IG", "https://www.instagram.com/kamel", 0],
    ["l-ig-en", "en", "Instagram", "https://www.instagram.com/kamel", 0],
    ["l-mail-zh", "zh", "信箱", "mailto:hello@example.com", 1],
  ] as const) {
    statements.push(
      db
        .prepare(
          "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES (?, 'admin-social', ?, ?, ?, ?, 1)",
        )
        .bind(id, locale, label, url, sort),
    );
  }

  await db.batch(statements);
}

async function count(db: D1Database, sql: string): Promise<number> {
  const row = await db.prepare(sql).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("legacy import (0007) against a populated legacy database", () => {
  beforeAll(async () => {
    await applyMigrationQueries(env.LEGACY_DB, env.TEST_MIGRATIONS, [
      "0001",
      "0002",
      "0003",
      "0004",
    ]);
    await seedLegacy(env.LEGACY_DB);
    await applyMigrationQueries(env.LEGACY_DB, env.TEST_MIGRATIONS, [
      "0005",
      "0006",
      "0007",
      "0008",
    ]);
  });

  it("imports every legacy work and post with its id and slug", async () => {
    const works = await env.LEGACY_DB.prepare(
      "SELECT id, slug, status, listed, primary_category_id FROM projects WHERE legacy_source GLOB 'content_entries:*' ORDER BY id",
    ).all();
    expect(works.results).toEqual([
      expect.objectContaining({
        id: "work-a",
        slug: "legacy-work-a",
        status: "published",
        primary_category_id: "term-project_category-music",
      }),
      expect.objectContaining({ id: "work-b", status: "draft", listed: 0 }),
      expect.objectContaining({ id: "work-c", status: "published" }),
    ]);
    expect(
      await count(
        env.LEGACY_DB,
        "SELECT COUNT(*) AS n FROM writings WHERE legacy_source GLOB 'content_entries:*'",
      ),
    ).toBe(1);
  });

  it("freezes published values and overlays newer drafts on the working copy", async () => {
    const row = await env.LEGACY_DB.prepare(
      "SELECT title_i18n, revision, published_revision, published_json, published_slug FROM projects WHERE id = 'work-a'",
    ).first<{
      title_i18n: string;
      revision: number;
      published_revision: number;
      published_json: string;
      published_slug: string;
    }>();
    expect(JSON.parse(row?.title_i18n ?? "{}")).toEqual({
      zh: "作品 A（修訂）",
      en: "Work A",
    });
    expect(row?.revision).toBe(1);
    expect(row?.published_revision).toBe(0);
    expect(row?.published_slug).toBe("legacy-work-a");
    const snapshot = JSON.parse(row?.published_json ?? "{}");
    expect(snapshot.core.title_i18n).toEqual({ zh: "作品 A", en: "Work A" });
    expect(snapshot.extra.body_i18n.zh).toContainEqual({
      type: "media",
      mediaId: "media-a",
    });
  });

  it("keeps one-locale publications as they are", async () => {
    const row = await env.LEGACY_DB.prepare(
      "SELECT published_json FROM projects WHERE id = 'work-c'",
    ).first<{ published_json: string }>();
    const snapshot = JSON.parse(row?.published_json ?? "{}");
    expect(snapshot.core.title_i18n).toEqual({ zh: "作品 C", en: "" });
  });

  it("imports media items as external assets and indexes their usage", async () => {
    const asset = await env.LEGACY_DB.prepare(
      "SELECT kind, provider, source, state, external_url FROM media_assets WHERE id = 'media-a'",
    ).first();
    expect(asset).toEqual({
      kind: "audio",
      provider: "github_raw",
      source: "external",
      state: "ready",
      external_url: "https://raw.githubusercontent.com/o/r/main/a.wav",
    });
    const usages = await env.LEGACY_DB.prepare(
      "SELECT field, scope FROM media_usages WHERE asset_id = 'media-a' ORDER BY scope",
    ).all();
    expect(usages.results).toEqual([{ field: "body.zh", scope: "published" }]);
    const social = await env.LEGACY_DB.prepare(
      "SELECT social_image_id FROM projects WHERE id = 'work-a'",
    ).first<{ social_image_id: string }>();
    expect(social?.social_image_id).toBe("legacy-social-wa-zh-1");
  });

  it("publishes the legacy home showreel as the single showreel track", async () => {
    const track = await env.LEGACY_DB.prepare(
      "SELECT status, is_showreel, audio_preview_id, artist_i18n FROM music_tracks WHERE id = 'legacy-showreel'",
    ).first<{
      status: string;
      is_showreel: number;
      audio_preview_id: string;
      artist_i18n: string;
    }>();
    expect(track).toMatchObject({
      status: "published",
      is_showreel: 1,
      audio_preview_id: "home-reel",
    });
    expect(JSON.parse(track?.artist_i18n ?? "{}")).toEqual({
      zh: "Kamel",
      en: "Kamel",
    });
  });

  it("turns the admin social group into social links", async () => {
    const links = await env.LEGACY_DB.prepare(
      "SELECT platform, label_i18n, url, enabled FROM social_links ORDER BY sort_order",
    ).all<{ platform: string; label_i18n: string; url: string }>();
    expect(
      links.results.map((link) => ({
        platform: link.platform,
        label: JSON.parse(link.label_i18n),
      })),
    ).toEqual([
      { platform: "instagram", label: { zh: "IG", en: "Instagram" } },
      { platform: "email", label: { zh: "信箱", en: "信箱" } },
    ]);
    expect(
      await count(
        env.LEGACY_DB,
        "SELECT COUNT(*) AS n FROM link_groups WHERE id = 'seed-work-resources'",
      ),
    ).toBe(0);
  });

  it("changes nothing when the import runs again", async () => {
    const before = await env.LEGACY_DB.prepare(
      "SELECT (SELECT COUNT(*) FROM projects) AS p, (SELECT COUNT(*) FROM writings) AS w, " +
        "(SELECT COUNT(*) FROM media_assets) AS a, (SELECT COUNT(*) FROM media_usages) AS u, " +
        "(SELECT COUNT(*) FROM social_links) AS s, (SELECT group_concat(revision) FROM projects) AS r",
    ).first();
    await applyMigrationQueries(env.LEGACY_DB, env.TEST_MIGRATIONS, [
      "0006",
      "0007",
      "0008",
    ]);
    const after = await env.LEGACY_DB.prepare(
      "SELECT (SELECT COUNT(*) FROM projects) AS p, (SELECT COUNT(*) FROM writings) AS w, " +
        "(SELECT COUNT(*) FROM media_assets) AS a, (SELECT COUNT(*) FROM media_usages) AS u, " +
        "(SELECT COUNT(*) FROM social_links) AS s, (SELECT group_concat(revision) FROM projects) AS r",
    ).first();
    expect(after).toEqual(before);
    expect(
      await count(
        env.LEGACY_DB,
        "SELECT COUNT(*) AS n FROM projects WHERE todo_content = 1 AND status = 'published'",
      ),
    ).toBe(0);
  });
});

describe("legacy import (0007) against an empty legacy database", () => {
  it("seeds the footer resources group with the repository link disabled", async () => {
    const links = await env.DB.prepare(
      "SELECT locale, label, url, enabled FROM links WHERE group_id = 'seed-work-resources' ORDER BY sort_order, locale",
    ).all();
    expect(links.results).toEqual([
      {
        locale: "en",
        label: "GitHub",
        url: "https://github.com/kekekewww",
        enabled: 1,
      },
      {
        locale: "zh",
        label: "GitHub",
        url: "https://github.com/kekekewww",
        enabled: 1,
      },
      {
        locale: "en",
        label: "Website repository",
        url: "https://github.com/kekekewww/kamelkyp.com",
        enabled: 0,
      },
      {
        locale: "zh",
        label: "網站專案",
        url: "https://github.com/kekekewww/kamelkyp.com",
        enabled: 0,
      },
    ]);
    expect(
      await count(
        env.DB,
        "SELECT COUNT(*) AS n FROM music_tracks WHERE legacy_source IS NOT NULL",
      ),
    ).toBe(0);
  });
});
