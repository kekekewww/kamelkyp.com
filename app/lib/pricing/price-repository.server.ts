import type { ServiceId } from "../services/service-id";
import type { PriceRule } from "./types";

interface PriceRow {
  id: string;
  service_id: ServiceId;
  base_twd: number;
  per_song_after_five_twd: number;
  student_discount_bps: number;
  rush_bps: number;
  consultation_bps: number;
  source_prep_bps: number;
}

export async function getActivePriceRule(
  db: D1Database,
  serviceId: ServiceId,
  at: string,
): Promise<PriceRule> {
  const row = await db
    .prepare(
      "SELECT id, service_id, base_twd, per_song_after_five_twd, " +
        "student_discount_bps, rush_bps, consultation_bps, source_prep_bps " +
        "FROM price_versions WHERE service_id = ? AND effective_from <= ? " +
        "AND (retired_at IS NULL OR retired_at > ?) " +
        "ORDER BY effective_from DESC, id DESC LIMIT 1",
    )
    .bind(serviceId, at, at)
    .first<PriceRow>();

  if (!row) throw new Error("active_price_rule_not_found");

  const isTransition =
    row.service_id === "simple_transition" ||
    row.service_id === "edit_transition";
  return {
    versionId: row.id,
    serviceId: row.service_id,
    baseTwd: row.base_twd,
    includedSongs: isTransition ? 5 : 0,
    perSongAfterIncludedTwd: row.per_song_after_five_twd,
    studentDiscountBps: row.student_discount_bps,
    rushBps: row.rush_bps,
    consultationBps: row.consultation_bps,
    sourcePrepBps: row.source_prep_bps,
  };
}
