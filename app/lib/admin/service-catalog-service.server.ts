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

export interface AdminPriceVersion {
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

interface PriceRow {
  id: string;
  service_id: ServiceId;
  base_twd: number;
  per_song_after_five_twd: number;
  student_discount_bps: number;
  rush_bps: number;
  consultation_bps: number;
  source_prep_bps: number;
  effective_from: string;
}

function mapPrice(row: PriceRow): AdminPriceVersion {
  return {
    id: row.id,
    serviceId: row.service_id,
    baseTwd: row.base_twd,
    perSongAfterFiveTwd: row.per_song_after_five_twd,
    studentDiscountBps: row.student_discount_bps,
    rushBps: row.rush_bps,
    consultationBps: row.consultation_bps,
    sourcePrepBps: row.source_prep_bps,
    effectiveFrom: row.effective_from,
  };
}

export async function listPriceVersions(
  db: D1Database,
): Promise<AdminPriceVersion[]> {
  const rows = await db
    .prepare(
      "SELECT id, service_id, base_twd, per_song_after_five_twd, student_discount_bps, " +
        "rush_bps, consultation_bps, source_prep_bps, effective_from FROM price_versions " +
        "ORDER BY service_id, effective_from DESC, id DESC",
    )
    .all<PriceRow>();
  return rows.results.map(mapPrice);
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
}): Promise<AdminPriceVersion> {
  if (!isServiceId(input.serviceId)) throw new Error("invalid_service_id");
  const values = PriceInputSchema.parse(input);
  const id = crypto.randomUUID();
  await input.db
    .prepare(
      "INSERT INTO price_versions (id, service_id, base_twd, per_song_after_five_twd, " +
        "student_discount_bps, rush_bps, consultation_bps, source_prep_bps, effective_from) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    )
    .run();
  return {
    id,
    serviceId: input.serviceId,
    ...values,
  };
}
