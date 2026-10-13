import type { ServiceId } from "../services/service-id";
import { includedSongsFor } from "./sample-quotes";
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
      // Ties at the same effective_from go to the latest publish (NULL, i.e.
      // seeds and legacy rows, sorts last under DESC); `price-history.ts`
      // mirrors this order for the Studio.
      "SELECT v.id, v.service_id, v.base_twd, v.per_song_after_five_twd, " +
        "v.student_discount_bps, v.rush_bps, v.consultation_bps, v.source_prep_bps " +
        "FROM price_versions v " +
        "LEFT JOIN price_version_publications p ON p.version_id = v.id " +
        "WHERE v.service_id = ? AND v.effective_from <= ? " +
        "AND (v.retired_at IS NULL OR v.retired_at > ?) " +
        "ORDER BY v.effective_from DESC, p.published_at DESC, v.id DESC LIMIT 1",
    )
    .bind(serviceId, at, at)
    .first<PriceRow>();

  if (!row) throw new Error("active_price_rule_not_found");

  return {
    versionId: row.id,
    serviceId: row.service_id,
    baseTwd: row.base_twd,
    includedSongs: includedSongsFor(row.service_id),
    perSongAfterIncludedTwd: row.per_song_after_five_twd,
    studentDiscountBps: row.student_discount_bps,
    rushBps: row.rush_bps,
    consultationBps: row.consultation_bps,
    sourcePrepBps: row.source_prep_bps,
  };
}
