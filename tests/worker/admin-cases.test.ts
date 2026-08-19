import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  listCases,
  updateCaseStatus,
} from "../../app/lib/admin/case-service.server";

async function seedCase(caseId: string, serviceId = "full_mix") {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) VALUES (?, ?, 8000, 'TWD', '2026-08-19T00:00:00Z', 'pending_review')",
    ).bind(caseId, serviceId),
    env.DB.prepare(
      "INSERT INTO case_runtime (case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) VALUES (?, NULL, 'none', NULL, NULL, '2026-08-19T00:00:00Z')",
    ).bind(caseId),
  ]);
}

describe("minimal admin case listing", () => {
  it("returns only the six approved fields with filters", async () => {
    await seedCase("KAM-20260819-ABCDEFGHJK");
    await seedCase("KAM-20260819-BCDEFGHJKM", "vocal_mix");
    const result = await listCases({
      db: env.DB,
      serviceId: "full_mix",
      limit: 20,
      cursorSecret: "cursor-secret-with-at-least-32-characters",
    });
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0] ?? {}).sort()).toEqual([
      "caseId",
      "currency",
      "lockedPriceMinor",
      "serviceId",
      "status",
      "submittedAt",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /email|proof|contact|purpose|project/i,
    );
  });

  it("updates only status and schedules terminal cleanup", async () => {
    const caseId = "KAM-20260819-CDEFGHJKMN";
    await seedCase(caseId);
    await updateCaseStatus({
      db: env.DB,
      caseId,
      status: "delivered",
      now: new Date("2026-08-19T12:00:00Z"),
    });
    expect(
      await env.DB.prepare("SELECT status FROM cases WHERE case_id = ?")
        .bind(caseId)
        .first("status"),
    ).toBe("delivered");
    expect(
      await env.DB.prepare(
        "SELECT cleanup_due_at FROM case_runtime WHERE case_id = ?",
      )
        .bind(caseId)
        .first("cleanup_due_at"),
    ).toBe("2026-08-26T12:00:00.000Z");
    await expect(
      updateCaseStatus({
        db: env.DB,
        caseId: "missing",
        status: "paused",
        now: new Date(),
      }),
    ).rejects.toThrow("case_not_found");
  });
});
