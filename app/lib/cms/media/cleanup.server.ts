/**
 * Pending-upload cleanup (content-architecture §4.3 step 4, §4.7). The daily
 * cron calls it:
 *
 * 1. `pending` / `failed` rows older than 24 h lose their row, then their R2
 *    object (row first: a failed object delete leaves an orphan, never a row
 *    pointing at nothing).
 * 2. Orphan pass: upload-shaped keys (`media/<yyyy>/<mm>/<uuid>/<file>`) older
 *    than 24 h that no asset references are deleted. This retries object
 *    deletes that failed after an asset delete. Keys of any other shape, or
 *    referenced by an external (legacy) asset URL, are never touched.
 */

export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const ROW_BATCH = 500;
const LIST_PAGES = 5;
const UPLOAD_KEY =
  /^media\/[0-9]{4}\/[0-9]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/;

async function removeStaleRows(
  db: D1Database,
  bucket: R2Bucket | undefined,
  cutoff: string,
): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id, storage_key FROM media_assets
       WHERE state <> 'ready' AND created_at < ?1
         AND NOT EXISTS (
           SELECT 1 FROM media_usages u WHERE u.asset_id = media_assets.id AND u.scope = 'published'
         )
       ORDER BY created_at LIMIT ?2`,
    )
    .bind(cutoff, ROW_BATCH)
    .all<{ id: string; storage_key: string | null }>();
  if (rows.results.length === 0) return 0;
  await db
    .prepare(
      "DELETE FROM media_assets WHERE state <> 'ready' AND id IN (SELECT value FROM json_each(?))",
    )
    .bind(JSON.stringify(rows.results.map((row) => row.id)))
    .run();
  const keys = rows.results
    .map((row) => row.storage_key)
    .filter((key): key is string => Boolean(key));
  if (bucket && keys.length > 0) {
    try {
      await bucket.delete(keys);
    } catch {
      // Left as orphans; the orphan pass retries them next time.
    }
  }
  return rows.results.length;
}

async function referencedKeys(
  db: D1Database,
  keys: string[],
): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT j.value AS k FROM json_each(?1) j
       WHERE EXISTS (
         SELECT 1 FROM media_assets a
         WHERE a.storage_key = j.value
            OR (a.external_url IS NOT NULL
                AND substr(a.external_url, -length(j.value)) = j.value)
       )`,
    )
    .bind(JSON.stringify(keys))
    .all<{ k: string }>();
  return new Set(rows.results.map((row) => row.k));
}

async function removeOrphanObjects(
  db: D1Database,
  bucket: R2Bucket,
  cutoff: Date,
): Promise<number> {
  let removed = 0;
  let cursor: string | undefined;
  for (let page = 0; page < LIST_PAGES; page += 1) {
    const listing = await bucket.list({ prefix: "media/", cursor, limit: 500 });
    const candidates = listing.objects
      .filter((object) => UPLOAD_KEY.test(object.key))
      .filter((object) => object.uploaded.getTime() < cutoff.getTime())
      .map((object) => object.key);
    if (candidates.length > 0) {
      const known = await referencedKeys(db, candidates);
      const orphans = candidates.filter((key) => !known.has(key));
      if (orphans.length > 0) {
        try {
          await bucket.delete(orphans);
          removed += orphans.length;
        } catch {
          // Next run.
        }
      }
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  }
  return removed;
}

/** Returns how many stale rows and orphan objects were removed. */
export async function cleanupPendingUploads(
  db: D1Database,
  bucket: R2Bucket | undefined,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_TTL_MS);
  let removed = await removeStaleRows(db, bucket, cutoff.toISOString());
  if (bucket) removed += await removeOrphanObjects(db, bucket, cutoff);
  return removed;
}
