/**
 * Legacy /admin/links writer. Pending wp3: deleted once Studio -> Footer
 * replaces the panel (wp5 §4.7); the media half went with /admin/works.
 */
import { z } from "zod";
import type { Locale } from "../i18n/locale";
import type { LocalizedText } from "../services/catalog";

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

export type AdminLinkGroup = z.infer<typeof LinkGroupSchema>;

export function parseAdminLinkGroup(input: unknown): AdminLinkGroup {
  return LinkGroupSchema.parse(input);
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
