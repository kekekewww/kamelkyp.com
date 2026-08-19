import { z } from "zod";
import type { Locale } from "../i18n/locale";
import type { MediaKind } from "../media/media-schema";
import { parseMediaUrl } from "../media/parse-media-url";
import type { LocalizedText } from "../services/catalog";

const OptionalText = z.string().trim().max(2000).optional();
const OptionalHttpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:")
  .optional();

const AdminMediaInputSchema = z.strictObject({
  url: z.string().trim().min(1).max(3000),
  title: z.string().trim().max(200).optional(),
  description: OptionalText,
  thumbnailUrl: OptionalHttpsUrl,
  credit: z.string().trim().max(300).optional(),
  publishedAt: z.iso.datetime().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  startSeconds: z.number().int().nonnegative().nullable().optional(),
  endSeconds: z.number().int().positive().nullable().optional(),
});

const ExternalLinkSchema = z.strictObject({
  label: z.string().trim().min(1).max(200),
  url: z
    .url()
    .refine((value) => ["https:", "mailto:"].includes(new URL(value).protocol)),
  enabled: z.boolean().optional(),
});

const LinkGroupSchema = z.strictObject({
  key: z.enum([
    "social",
    "workRepository",
    "otherWebsite",
    "footer",
    "postReference",
  ]),
  label: z.strictObject({
    zh: z.string().trim().min(1).max(100),
    en: z.string().trim().min(1).max(100),
  }),
  links: z.array(ExternalLinkSchema).max(200),
});

export interface ParsedAdminMediaInput {
  url: string;
  kind: MediaKind;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  credit: string | null;
  publishedAt: string | null;
  tags: string[];
  startSeconds: number | null;
  endSeconds: number | null;
  embedUrl: string | null;
}

export type AdminLinkGroup = z.infer<typeof LinkGroupSchema>;

export function parseAdminMediaInput(
  input: unknown | null,
  r2Hosts: ReadonlySet<string>,
): ParsedAdminMediaInput | null {
  if (input === null || input === undefined) return null;
  const value = AdminMediaInputSchema.parse(input);
  const parsed = parseMediaUrl(value.url, {
    startSeconds: value.startSeconds ?? null,
    endSeconds: value.endSeconds ?? null,
    r2Hosts,
  });
  return {
    url: parsed.canonicalUrl,
    kind: parsed.kind,
    title: value.title || "Untitled",
    description: value.description || null,
    thumbnailUrl: value.thumbnailUrl ?? null,
    credit: value.credit || null,
    publishedAt: value.publishedAt ?? null,
    tags: value.tags ?? [],
    startSeconds: value.startSeconds ?? null,
    endSeconds: value.endSeconds ?? null,
    embedUrl: parsed.embedUrl,
  };
}

export function parseAdminLinkGroup(input: unknown): AdminLinkGroup {
  return LinkGroupSchema.parse(input);
}

export async function replaceDraftMedia(input: {
  db: D1Database;
  versionId: string;
  items: unknown[];
  r2Hosts: ReadonlySet<string>;
}): Promise<void> {
  const version = await input.db
    .prepare("SELECT state FROM content_versions WHERE id = ?")
    .bind(input.versionId)
    .first<{ state: string }>();
  if (version?.state !== "draft") throw new Error("draft_version_not_found");
  const items = input.items
    .map((item) => parseAdminMediaInput(item, input.r2Hosts))
    .filter((item): item is ParsedAdminMediaInput => item !== null);
  await input.db.batch([
    input.db
      .prepare("DELETE FROM media_items WHERE content_version_id = ?")
      .bind(input.versionId),
    ...items.map((item, sortOrder) =>
      input.db
        .prepare(
          "INSERT INTO media_items " +
            "(id, content_version_id, kind, url, title, start_seconds, end_seconds, " +
            "sort_order, description, thumbnail_url, credit, published_at, tags_json) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          input.versionId,
          item.kind,
          item.url,
          item.title,
          item.startSeconds,
          item.endSeconds,
          sortOrder,
          item.description,
          item.thumbnailUrl,
          item.credit,
          item.publishedAt,
          JSON.stringify(item.tags),
        ),
    ),
  ]);
}

export async function replaceLinkGroup(input: {
  db: D1Database;
  group: AdminLinkGroup;
  sortOrder?: number;
}): Promise<void> {
  const group = parseAdminLinkGroup(input.group);
  const groupId = `admin-${group.key}`;
  await input.db.batch([
    input.db
      .prepare(
        "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES (?, ?, ?, 1) " +
          "ON CONFLICT(id) DO UPDATE SET sort_order = excluded.sort_order, enabled = 1",
      )
      .bind(groupId, group.key, input.sortOrder ?? 100),
    ...(["zh", "en"] as const).map((locale) =>
      input.db
        .prepare(
          "INSERT INTO link_group_labels (group_id, locale, label) VALUES (?, ?, ?) " +
            "ON CONFLICT(group_id, locale) DO UPDATE SET label = excluded.label",
        )
        .bind(groupId, locale, group.label[locale]),
    ),
    input.db.prepare("DELETE FROM links WHERE group_id = ?").bind(groupId),
    ...(["zh", "en"] as Locale[]).flatMap((locale) =>
      group.links.map((link, sortOrder) =>
        input.db
          .prepare(
            "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            crypto.randomUUID(),
            groupId,
            locale,
            link.label,
            link.url,
            sortOrder,
            link.enabled === false ? 0 : 1,
          ),
      ),
    ),
  ]);
}

export async function listAdminLinkGroups(db: D1Database): Promise<
  Array<{
    key: string;
    label: LocalizedText;
    links: Array<{ label: string; url: string; enabled: boolean }>;
  }>
> {
  const rows = await db
    .prepare(
      "SELECT g.stable_key, l.locale, l.label, l.url, l.enabled, gl.label AS group_label " +
        "FROM link_groups g LEFT JOIN links l ON l.group_id = g.id " +
        "LEFT JOIN link_group_labels gl ON gl.group_id = g.id AND gl.locale = l.locale " +
        "WHERE g.id LIKE 'admin-%' ORDER BY g.sort_order, l.locale, l.sort_order",
    )
    .all<{
      stable_key: string;
      locale: Locale;
      label: string;
      url: string;
      enabled: number;
      group_label: string;
    }>();
  const groups = new Map<
    string,
    {
      key: string;
      label: LocalizedText;
      links: Array<{ label: string; url: string; enabled: boolean }>;
    }
  >();
  for (const row of rows.results) {
    const current = groups.get(row.stable_key) ?? {
      key: row.stable_key,
      label: { zh: row.stable_key, en: row.stable_key },
      links: [],
    };
    current.label[row.locale] = row.group_label;
    if (row.locale === "zh")
      current.links.push({
        label: row.label,
        url: row.url,
        enabled: row.enabled === 1,
      });
    groups.set(row.stable_key, current);
  }
  return [...groups.values()];
}
