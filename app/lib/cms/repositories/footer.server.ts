/**
 * Footer link groups (wp3 spec §4.6, §4.7; content-schema "Footer link
 * groups"). Studio → Settings → Footer reads and writes `link_groups`,
 * `link_group_labels` and `links`; the public footer is composed from the
 * same rows by `composeFooterGroups`.
 */
import {
  FOOTER_SYSTEM_GROUPS,
  FOOTER_SYSTEM_KEYS,
  type FooterSystemKey,
} from "../public/footer";

/** Groups other than the built-in ones and the legacy `social` group. */
const OTHER_GROUPS = `stable_key NOT IN (${[...FOOTER_SYSTEM_KEYS, "social"]
  .map((key) => `'${key}'`)
  .join(", ")})`;

/** Where migration 0010 puts a missing built-in row, around the other groups. */
const SEED_POSITION: Record<
  FooterSystemKey,
  { edge: "MIN" | "MAX"; offset: number }
> = {
  navigate: { edge: "MIN", offset: -20 },
  services: { edge: "MIN", offset: -10 },
  find_me: { edge: "MAX", offset: 10 },
  contact: { edge: "MAX", offset: 20 },
  legal: { edge: "MAX", offset: 30 },
};

/**
 * The statements of migration 0010: recreate a missing built-in row (and its
 * default labels) around the other groups. `INSERT OR IGNORE` only, so they
 * are safe at the start of any batch.
 */
export function ensureFooterSystemGroupStatements(
  db: D1Database,
): D1PreparedStatement[] {
  const groups = FOOTER_SYSTEM_KEYS.map((key) => {
    const { edge, offset } = SEED_POSITION[key];
    return db
      .prepare(
        `INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
         SELECT ?1, ?2,
           COALESCE((SELECT ${edge}(sort_order) FROM link_groups WHERE ${OTHER_GROUPS}), 30) + ?3,
           1`,
      )
      .bind(FOOTER_SYSTEM_GROUPS[key].seedId, key, offset);
  });
  const values = FOOTER_SYSTEM_KEYS.flatMap((key) =>
    (["zh", "en"] as const).map(
      (locale) =>
        `('${key}', '${locale}', '${FOOTER_SYSTEM_GROUPS[key].label[locale]}')`,
    ),
  ).join(", ");
  const labels = db.prepare(
    `WITH x(stable_key, locale, label) AS (VALUES ${values})
     INSERT OR IGNORE INTO link_group_labels (group_id, locale, label)
     SELECT g.id, x.locale, x.label
     FROM x JOIN link_groups g ON g.stable_key = x.stable_key`,
  );
  return [...groups, labels];
}
