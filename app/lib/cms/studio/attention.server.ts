/**
 * Sidebar counts for the Studio root loader (one `db.batch`).
 *
 * `attention` is the number of rows on the Studio home "Needs attention" list
 * (admin-architecture §4.2), built by the same rules
 * (`collectAttention`, repositories/studio-home.server.ts), so the badge next
 * to HOME always matches the list. `pendingCommissions` = cases waiting for
 * review.
 */
import { collectAttention } from "../repositories/studio-home.server";

export async function getStudioCounts(
  db: D1Database,
  now: Date = new Date(),
): Promise<{ attention: number; pendingCommissions: number }> {
  const facts = await collectAttention(db, now);
  return {
    attention: facts.attention.length,
    pendingCommissions: facts.commissions.pendingReview,
  };
}
