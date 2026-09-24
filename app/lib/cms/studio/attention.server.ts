/**
 * Sidebar counts for the Studio root loader (one statement).
 *
 * `attention` is a coarse count of the highest-signal items on the Studio
 * home "Needs attention" list (admin-architecture §4.2): contact email
 * unconfirmed, redesign copy unacknowledged, no live showreel, no featured
 * live project, published items with unpublished changes. The full list with
 * links is built by the Studio home (P4), which may refine this count.
 * `pendingCommissions` = cases waiting for review.
 */
export async function getStudioCounts(
  db: D1Database,
): Promise<{ attention: number; pendingCommissions: number }> {
  const row = await db
    .prepare(
      `SELECT
        COALESCE((SELECT json_extract(data_json, '$.contactEmailConfirmedAt') IS NULL
                  FROM settings WHERE key = 'brand'), 0) +
        COALESCE((SELECT json_extract(data_json, '$.redesignCopyAcknowledgedAt') IS NULL
                  FROM settings WHERE key = 'brand'), 0) +
        (NOT EXISTS (SELECT 1 FROM music_tracks WHERE is_showreel = 1 AND status = 'published')) +
        (NOT EXISTS (SELECT 1 FROM projects WHERE featured = 1 AND status = 'published')) +
        (SELECT COUNT(*) FROM projects WHERE status = 'published' AND revision <> published_revision) +
        (SELECT COUNT(*) FROM music_tracks WHERE status = 'published' AND revision <> published_revision) +
        (SELECT COUNT(*) FROM recognitions WHERE status = 'published' AND revision <> published_revision) +
        (SELECT COUNT(*) FROM writings WHERE status = 'published' AND revision <> published_revision) +
        (SELECT COUNT(*) FROM services WHERE status = 'published' AND revision <> published_revision)
        AS attention,
        (SELECT COUNT(*) FROM cases WHERE status = 'pending_review') AS pending`,
    )
    .first<{ attention: number; pending: number }>();
  return {
    attention: row?.attention ?? 0,
    pendingCommissions: row?.pending ?? 0,
  };
}
