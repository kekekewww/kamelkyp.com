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
      // The versions at one effective_from form a group won by the latest
      // publish (NULL, i.e. seeds and legacy rows, sorts last under DESC).
      // A group won by a cancellation is no change: the newest other group
      // applies. `price-history.ts` mirrors this for the Studio.
      "SELECT id, service_id, base_twd, per_song_after_five_twd, " +
        "student_discount_bps, rush_bps, consultation_bps, source_prep_bps " +
        "FROM (SELECT v.id, v.service_id, v.base_twd, v.per_song_after_five_twd, " +
        "v.student_discount_bps, v.rush_bps, v.consultation_bps, v.source_prep_bps, " +
        "v.effective_from, p.action, " +
        "ROW_NUMBER() OVER (PARTITION BY v.effective_from " +
        "ORDER BY p.published_at DESC, v.id DESC) AS group_rank " +
        "FROM price_versions v " +
        "LEFT JOIN price_version_publications p ON p.version_id = v.id " +
        "WHERE v.service_id = ? AND v.effective_from <= ? " +
        "AND (v.retired_at IS NULL OR v.retired_at > ?)) " +
        "WHERE group_rank = 1 AND (action IS NULL OR action <> 'cancel') " +
        "ORDER BY effective_from DESC LIMIT 1",
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
