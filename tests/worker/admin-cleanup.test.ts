import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { confirmVerifiedCleanup } from "../../app/lib/admin/cleanup-service.server";

async function seedDue(caseId: string, studentState: "none" | "pending" = "none") {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) VALUES (?, 'full_mix', 8000, 'TWD', '2026-08-01T00:00:00Z', 'delivered')",
    ).bind(caseId),
    env.DB.prepare(
      "INSERT INTO case_runtime (case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) VALUES (?, '2026-08-10T00:00:00Z', ?, ?, ?, '2026-08-01T00:00:00Z')",
    ).bind(caseId, studentState, studentState === "pending" ? 8000 : null, studentState === "pending" ? 5600 : null),
    env.DB.prepare(
      "INSERT INTO submission_attempts (case_id, state, payload_hash, terms_versions_json, terms_accepted_at, updated_at) VALUES (?, 'complete', 'hash', '[]', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')",
    ).bind(caseId),
  ]);
}

const checklist = {
  googleRecordsDeleted: true as const,
  gmailDeleted: true as const,
  otherSensitiveCopiesDeleted: true as const,
};

describe("verified sensitive-data cleanup", () => {
  it("deletes runtime only after all manual confirmations and ledger cleanup", async () => {
    const caseId = "KAM-20260819-FGHJKMNPQR";
    await seedDue(caseId);
    const cleanupLedger = vi.fn().mockResolvedValue(undefined);
    await confirmVerifiedCleanup({
      db: env.DB,
      caseId,
      checklist,
      gateway: { cleanupLedger },
      now: new Date("2026-08-19T00:00:00Z"),
    });
    expect(cleanupLedger).toHaveBeenCalledWith({ caseId, now: "2026-08-19T00:00:00.000Z" });
    expect(await env.DB.prepare("SELECT case_id FROM cases WHERE case_id = ?").bind(caseId).first("case_id")).toBe(caseId);
    expect(await env.DB.prepare("SELECT case_id FROM case_runtime WHERE case_id = ?").bind(caseId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT case_id FROM submission_attempts WHERE case_id = ?").bind(caseId).first()).toBeNull();
  });

  it("keeps runtime data when checklist, student review or gateway is incomplete", async () => {
    const caseId = "KAM-20260819-GHJKMNPQRS";
    await seedDue(caseId);
    await expect(confirmVerifiedCleanup({
      db: env.DB,
      caseId,
      checklist: { ...checklist, gmailDeleted: false as never },
      gateway: { cleanupLedger: vi.fn() },
      now: new Date("2026-08-19T00:00:00Z"),
    })).rejects.toThrow("cleanup_checklist_incomplete");
    await expect(confirmVerifiedCleanup({
      db: env.DB,
      caseId,
      checklist,
      gateway: { cleanupLedger: vi.fn().mockRejectedValue(new Error("down")) },
      now: new Date("2026-08-19T00:00:00Z"),
    })).rejects.toThrow("cleanup_gateway_failed");
    expect(await env.DB.prepare("SELECT case_id FROM case_runtime WHERE case_id = ?").bind(caseId).first("case_id")).toBe(caseId);
  });
});
