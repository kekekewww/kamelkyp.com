import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  confirmCleanup,
  deleteOrphanAttempts,
  listCleanupDue,
  markCaseTerminal,
} from "../../app/lib/cases/retention.server";

async function seedCase(caseId: string, updatedAt: string) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO cases " +
        "(case_id, service_id, locked_price_minor, currency, submitted_at, status) " +
        "VALUES (?, 'full_mix', 8000, 'TWD', ?, 'pending_review')",
    ).bind(caseId, updatedAt),
    env.DB.prepare(
      "INSERT INTO case_runtime " +
        "(case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) " +
        "VALUES (?, NULL, 'none', NULL, NULL, ?)",
    ).bind(caseId, updatedAt),
    env.DB.prepare(
      "INSERT INTO submission_attempts " +
        "(case_id, state, payload_hash, terms_versions_json, terms_accepted_at, updated_at) " +
        "VALUES (?, 'failed', 'hash', '[]', ?, ?)",
    ).bind(caseId, updatedAt, updatedAt),
  ]);
}

describe("commission metadata retention", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM cases WHERE case_id LIKE 'KAM-RET-%'").run();
  });

  it("sets cleanup seven days after delivered, cancelled or paused", async () => {
    await seedCase("KAM-RET-1", "2026-08-10T12:00:00Z");
    await markCaseTerminal(
      env.DB,
      "KAM-RET-1",
      "delivered",
      "2026-08-10T12:00:00Z",
    );
    const due = await listCleanupDue(env.DB, "2026-08-17T12:00:00.000Z");
    expect(due).toEqual([
      expect.objectContaining({
        caseId: "KAM-RET-1",
        status: "delivered",
        cleanupDueAt: "2026-08-17T12:00:00.000Z",
      }),
    ]);
  });

  it("confirmed cleanup removes temporary metadata only", async () => {
    await seedCase("KAM-RET-2", "2026-08-10T12:00:00Z");
    await markCaseTerminal(
      env.DB,
      "KAM-RET-2",
      "cancelled",
      "2026-08-10T12:00:00Z",
    );
    await confirmCleanup(env.DB, "KAM-RET-2", "2026-08-18T00:00:00Z");
    expect(
      await env.DB.prepare(
        "SELECT * FROM submission_attempts WHERE case_id = 'KAM-RET-2'",
      ).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT * FROM case_runtime WHERE case_id = 'KAM-RET-2'",
      ).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT case_id, status FROM cases WHERE case_id = 'KAM-RET-2'",
      ).first(),
    ).toMatchObject({ case_id: "KAM-RET-2", status: "cancelled" });
  });

  it("deletes incomplete attempts older than 24 hours", async () => {
    await seedCase("KAM-RET-ORPHAN", "2026-08-10T12:00:00Z");
    expect(
      await deleteOrphanAttempts(env.DB, "2026-08-11T13:00:00Z"),
    ).toBe(1);
    expect(
      await env.DB.prepare(
        "SELECT * FROM cases WHERE case_id = 'KAM-RET-ORPHAN'",
      ).first(),
    ).toBeNull();
  });
});
