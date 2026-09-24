/**
 * Pending-upload cleanup (content-architecture §4.3 step 4).
 *
 * STUB owned by the foundation, handed to P2 (uploads). The daily cron
 * already calls it; P2 replaces the body: pending/failed rows older than 24 h
 * lose their R2 object and row, and orphan R2 keys are retried. Until then it
 * is a no-op, which is correct while uploads do not exist.
 */
export async function cleanupPendingUploads(
  _db: D1Database,
  _bucket: R2Bucket | undefined,
  _now: Date,
): Promise<number> {
  return 0;
}
