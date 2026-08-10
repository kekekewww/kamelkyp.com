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
