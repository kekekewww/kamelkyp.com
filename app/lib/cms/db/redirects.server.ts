/**
 * Slug redirects (content-schema §2.10). Written at publish time when a
 * published slug changes; public detail loaders 301 old URLs to the current
 * published slug of the target when it is live.
 */

const TABLES = { project: "projects", writing: "writings" } as const;
export type RedirectEntityType = keyof typeof TABLES;

/** Current published slug for an old slug, when its target is live. */
export async function resolveRedirect(
  db: D1Database,
  entityType: RedirectEntityType,
  fromSlug: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT e.published_slug AS slug FROM slug_redirects r
       JOIN ${TABLES[entityType]} e ON e.id = r.entity_id
       WHERE r.entity_type = ? AND r.from_slug = ? AND e.status = 'published'
         AND e.published_slug IS NOT NULL AND e.published_slug <> r.from_slug`,
    )
    .bind(entityType, fromSlug)
    .first<{ slug: string }>();
  return row?.slug ?? null;
}

export async function listRedirects(
  db: D1Database,
  entityType: RedirectEntityType,
  entityId: string,
): Promise<Array<{ fromSlug: string; createdAt: string }>> {
  const rows = await db
    .prepare(
      "SELECT from_slug, created_at FROM slug_redirects WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
    )
    .bind(entityType, entityId)
    .all<{ from_slug: string; created_at: string }>();
  return rows.results.map((row) => ({
    fromSlug: row.from_slug,
    createdAt: row.created_at,
  }));
}

/**
 * Publish-time statements (guarded by the expected revision so a stale publish
 * writes nothing): keep the old live URL, and let a live URL beat a redirect.
 */
export function publishRedirectStatements(
  db: D1Database,
  entityType: RedirectEntityType,
  input: { id: string; expectedRevision: number; now: string },
): D1PreparedStatement[] {
  const table = TABLES[entityType];
  return [
    db
      .prepare(
        `INSERT OR REPLACE INTO slug_redirects (entity_type, from_slug, entity_id, created_at)
         SELECT ?4, published_slug, id, ?2 FROM ${table}
         WHERE id = ?1 AND revision = ?3 AND published_slug IS NOT NULL AND published_slug <> slug`,
      )
      .bind(input.id, input.now, input.expectedRevision, entityType),
    db
      .prepare(
        `DELETE FROM slug_redirects WHERE entity_type = ?3
         AND from_slug = (SELECT slug FROM ${table} WHERE id = ?1 AND revision = ?2)`,
      )
      .bind(input.id, input.expectedRevision, entityType),
  ];
}

export function deleteRedirectsStatement(
  db: D1Database,
  entityType: RedirectEntityType,
  entityId: string,
): D1PreparedStatement {
  return db
    .prepare(
      "DELETE FROM slug_redirects WHERE entity_type = ? AND entity_id = ?",
    )
    .bind(entityType, entityId);
}
