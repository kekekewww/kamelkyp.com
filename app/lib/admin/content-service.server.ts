import { z } from "zod";
import {
  type ContentBlock,
  ContentBlocksSchema,
} from "../content/block-schema";
import type { ContentKind } from "../db/content-repository.server";
import type { Locale } from "../i18n/locale";

const NullableText = z.string().max(8000).nullable();
const NullableHttpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:")
  .nullable();

export const SeoFieldsSchema = z.object({
  title: z.string().max(300),
  summary: NullableText,
  seoTitle: z.string().max(300).nullable(),
  seoDescription: NullableText,
  socialImageUrl: NullableHttpsUrl,
});

export type SeoFields = z.infer<typeof SeoFieldsSchema>;

export interface ContentVersion {
  id: string;
  entryId: string;
  kind: ContentKind;
  slug: string;
  locale: Locale;
  versionNumber: number;
  state: "draft" | "published";
  revision: number;
  title: string;
  summary: string | null;
  body: ContentBlock[];
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
}

interface VersionRow {
  id: string;
  entry_id: string;
  kind: ContentKind;
  slug: string;
  locale: Locale;
  version_number: number;
  state: "draft" | "published";
  revision: number;
  title: string;
  summary: string | null;
  body_json: string;
  seo_title: string | null;
  seo_description: string | null;
  social_image_url: string | null;
  created_at: string;
  published_at: string | null;
}

const VERSION_SELECT =
  "SELECT v.id, v.entry_id, e.kind, e.slug, v.locale, v.version_number, " +
  "v.state, v.revision, v.title, v.summary, v.body_json, v.seo_title, " +
  "v.seo_description, v.social_image_url, v.created_at, v.published_at " +
  "FROM content_versions v JOIN content_entries e ON e.id = v.entry_id";

function mapVersion(row: VersionRow): ContentVersion {
  return {
    id: row.id,
    entryId: row.entry_id,
    kind: row.kind,
    slug: row.slug,
    locale: row.locale,
    versionNumber: row.version_number,
    state: row.state,
    revision: row.revision,
    title: row.title,
    summary: row.summary,
    body: ContentBlocksSchema.parse(JSON.parse(row.body_json)),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    socialImageUrl: row.social_image_url,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export async function getAdminContentVersion(
  db: D1Database,
  versionId: string,
): Promise<ContentVersion> {
  const row = await db
    .prepare(`${VERSION_SELECT} WHERE v.id = ?`)
    .bind(versionId)
    .first<VersionRow>();
  if (!row) throw new Error("content_version_not_found");
  return mapVersion(row);
}

export async function listAdminContent(
  db: D1Database,
): Promise<ContentVersion[]> {
  const rows = await db
    .prepare(
      `${VERSION_SELECT} ORDER BY e.kind, e.slug, v.locale, v.version_number DESC`,
    )
    .all<VersionRow>();
  return rows.results.map(mapVersion);
}

export async function ensureContentEntry(input: {
  db: D1Database;
  entryId: string;
  kind: ContentKind;
  slug: string;
  now?: Date;
}): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  await input.db
    .prepare(
      "INSERT INTO content_entries (id, kind, slug, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(input.entryId, input.kind, input.slug, now, now)
    .run();
}

export async function createDraft(input: {
  db: D1Database;
  entryId: string;
  locale: Locale;
  baseVersionId?: string;
}): Promise<ContentVersion> {
  const entry = await input.db
    .prepare("SELECT id FROM content_entries WHERE id = ?")
    .bind(input.entryId)
    .first<{ id: string }>();
  if (!entry) throw new Error("content_entry_not_found");

  const base = input.baseVersionId
    ? await input.db
        .prepare(
          `${VERSION_SELECT} WHERE v.id = ? AND v.entry_id = ? AND v.locale = ?`,
        )
        .bind(input.baseVersionId, input.entryId, input.locale)
        .first<VersionRow>()
    : await input.db
        .prepare(
          `${VERSION_SELECT} JOIN content_publications p ON p.version_id = v.id ` +
            "WHERE p.entry_id = ? AND p.locale = ?",
        )
        .bind(input.entryId, input.locale)
        .first<VersionRow>();
  if (input.baseVersionId && !base) throw new Error("base_version_not_found");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await input.db
    .prepare(
      "INSERT INTO content_versions " +
        "(id, entry_id, locale, version_number, state, revision, title, summary, " +
        "body_json, seo_title, seo_description, social_image_url, created_at) " +
        "SELECT ?, ?, ?, COALESCE(MAX(version_number), 0) + 1, 'draft', 0, ?, ?, ?, ?, ?, ?, ? " +
        "FROM content_versions WHERE entry_id = ? AND locale = ?",
    )
    .bind(
      id,
      input.entryId,
      input.locale,
      base?.title ?? "",
      base?.summary ?? null,
      base?.body_json ?? "[]",
      base?.seo_title ?? null,
      base?.seo_description ?? null,
      base?.social_image_url ?? null,
      now,
      input.entryId,
      input.locale,
    )
    .run();
  return getAdminContentVersion(input.db, id);
}

export async function saveDraft(input: {
  db: D1Database;
  versionId: string;
  expectedRevision: number;
  blocks: ContentBlock[];
  seo: SeoFields;
}): Promise<ContentVersion> {
  const blocks = ContentBlocksSchema.parse(input.blocks);
  const seo = SeoFieldsSchema.parse(input.seo);
  const result = await input.db
    .prepare(
      "UPDATE content_versions SET title = ?, summary = ?, body_json = ?, " +
        "seo_title = ?, seo_description = ?, social_image_url = ?, revision = revision + 1 " +
        "WHERE id = ? AND state = 'draft' AND revision = ?",
    )
    .bind(
      seo.title,
      seo.summary,
      JSON.stringify(blocks),
      seo.seoTitle,
      seo.seoDescription,
      seo.socialImageUrl,
      input.versionId,
      input.expectedRevision,
    )
    .run();
  if (result.meta.changes === 0) throw new Error("stale_revision");
  return getAdminContentVersion(input.db, input.versionId);
}

export async function publishDraft(input: {
  db: D1Database;
  versionId: string;
  now: Date;
}): Promise<void> {
  const version = await getAdminContentVersion(input.db, input.versionId);
  if (version.state === "published") {
    const pointer = await input.db
      .prepare(
        "SELECT version_id FROM content_publications WHERE entry_id = ? AND locale = ?",
      )
      .bind(version.entryId, version.locale)
      .first<{ version_id: string }>();
    if (pointer?.version_id === version.id) return;
    throw new Error("published_version_not_current");
  }
  const result = await input.db
    .prepare(
      "UPDATE content_versions SET state = 'published', published_at = ? " +
        "WHERE id = ? AND state = 'draft'",
    )
    .bind(input.now.toISOString(), input.versionId)
    .run();
  if (result.meta.changes === 0) throw new Error("draft_version_not_found");
}

export async function unpublishContent(input: {
  db: D1Database;
  entryId: string;
  locale: Locale;
}): Promise<void> {
  await input.db
    .prepare(
      "DELETE FROM content_publications WHERE entry_id = ? AND locale = ?",
    )
    .bind(input.entryId, input.locale)
    .run();
}
