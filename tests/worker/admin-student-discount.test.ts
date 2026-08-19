import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  listPendingStudentPriceReviews,
  resolveStudentDiscount,
} from "../../app/lib/admin/case-service.server";

async function seedPending(caseId: string) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) VALUES (?, 'full_mix', 5600, 'TWD', '2026-08-19T00:00:00Z', 'pending_review')",
    ).bind(caseId),
    env.DB.prepare(
      "INSERT INTO case_runtime (case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) VALUES (?, NULL, 'pending', 8000, 5600, '2026-08-19T00:00:00Z')",
    ).bind(caseId),
  ]);
}

describe("manual student discount review", () => {
  it("exposes only candidate prices then preserves the accepted student price", async () => {
    const caseId = "KAM-20260819-DEFGHJKMNP";
    await seedPending(caseId);
    expect(await listPendingStudentPriceReviews(env.DB)).toEqual([
      { caseId, currency: "TWD", standardPriceMinor: 8000, studentPriceMinor: 5600 },
    ]);
    await resolveStudentDiscount({ db: env.DB, caseId, accepted: true });
    expect(await listPendingStudentPriceReviews(env.DB)).toEqual([]);
    expect(await env.DB.prepare("SELECT locked_price_minor FROM cases WHERE case_id = ?").bind(caseId).first("locked_price_minor")).toBe(5600);
    await expect(resolveStudentDiscount({ db: env.DB, caseId, accepted: false })).rejects.toThrow("student_review_conflict");
  });

  it("restores the same-currency standard price when rejected", async () => {
    const caseId = "KAM-20260819-EFGHJKMNPQ";
    await seedPending(caseId);
    await resolveStudentDiscount({ db: env.DB, caseId, accepted: false });
    expect(await env.DB.prepare("SELECT locked_price_minor, currency FROM cases WHERE case_id = ?").bind(caseId).first()).toMatchObject({ locked_price_minor: 8000, currency: "TWD" });
  });
});
