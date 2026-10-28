import { z } from "zod";
import { isServiceId, type ServiceId } from "../services/service-id";

const PriceInputSchema = z.object({
  baseTwd: z.number().int().positive(),
  perSongAfterFiveTwd: z.number().int().nonnegative(),
  studentDiscountBps: z.number().int().min(0).max(10000),
  rushBps: z.number().int().min(0).max(10000),
  consultationBps: z.number().int().min(0).max(10000),
  sourcePrepBps: z.number().int().min(0).max(10000),
  effectiveFrom: z.iso.datetime(),
});

export type PublishAction = "publish" | "replace" | "cancel";

interface AdminPriceVersion {
  id: string;
  serviceId: ServiceId;
  baseTwd: number;
  perSongAfterFiveTwd: number;
  studentDiscountBps: number;
  rushBps: number;
  consultationBps: number;
  sourcePrepBps: number;
  effectiveFrom: string;
}

export async function publishPriceVersion(input: {
  db: D1Database;
  serviceId: ServiceId;
  baseTwd: number;
  perSongAfterFiveTwd: number;
  studentDiscountBps: number;
  rushBps: number;
  consultationBps: number;
  sourcePrepBps: number;
  effectiveFrom: string;
  /** Publish time; breaks ties between versions at the same effective time. */
  publishedAt?: string;
  /** `replace` / `cancel` supersede a scheduled version at the same time. */
  action?: PublishAction;
  replacesVersionId?: string | null;
  /**
   * Concurrency token: insert only while the service has exactly this many
   * versions (checked inside the batch); otherwise nothing is inserted and
   * `price_history_changed` is thrown.
   */
  expectedVersionCount?: number;
}): Promise<AdminPriceVersion> {
  if (!isServiceId(input.serviceId)) throw new Error("invalid_service_id");
  const values = PriceInputSchema.parse(input);
  const action = input.action ?? "publish";
  const replacesVersionId = input.replacesVersionId ?? null;
  if ((action === "publish") !== (replacesVersionId === null)) {
    throw new Error("invalid_publish_action");
  }
  const id = crypto.randomUUID();
  // One batch (a D1 transaction): the version and its publish metadata.
  const [inserted] = await input.db.batch([
    input.db
      .prepare(
        "INSERT INTO price_versions (id, service_id, base_twd, per_song_after_five_twd, " +
          "student_discount_bps, rush_bps, consultation_bps, source_prep_bps, effective_from) " +
          "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 " +
          "WHERE ?10 IS NULL OR " +
          "(SELECT COUNT(*) FROM price_versions WHERE service_id = ?2) = ?10",
      )
      .bind(
        id,
        input.serviceId,
        values.baseTwd,
        values.perSongAfterFiveTwd,
        values.studentDiscountBps,
        values.rushBps,
        values.consultationBps,
        values.sourcePrepBps,
        values.effectiveFrom,
        input.expectedVersionCount ?? null,
      ),
    input.db
      .prepare(
        "INSERT INTO price_version_publications " +
          "(version_id, published_at, action, replaces_version_id) " +
          "SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM price_versions WHERE id = ?1)",
      )
      .bind(
        id,
        input.publishedAt ?? new Date().toISOString(),
        action,
        replacesVersionId,
      ),
  ]);
  if (!inserted?.meta.changes) throw new Error("price_history_changed");
  return {
    id,
    serviceId: input.serviceId,
    ...values,
  };
}
