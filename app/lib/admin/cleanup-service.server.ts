import type { CaseStatus } from "../cases/case-repository.server";

const terminalStatuses = new Set<CaseStatus>([
  "delivered",
  "cancelled",
  "paused",
]);

export async function confirmVerifiedCleanup(input: {
  db: D1Database;
  caseId: string;
  checklist: {
    googleRecordsDeleted: true;
    gmailDeleted: true;
    otherSensitiveCopiesDeleted: true;
  };
  gateway: {
    cleanupLedger(input: { caseId: string; now: string }): Promise<void>;
  };
  now: Date;
}): Promise<void> {
  if (
    input.checklist.googleRecordsDeleted !== true ||
    input.checklist.gmailDeleted !== true ||
    input.checklist.otherSensitiveCopiesDeleted !== true
  ) {
    throw new Error("cleanup_checklist_incomplete");
  }
  const now = input.now.toISOString();
  const row = await input.db
    .prepare(
      "SELECT c.status, r.cleanup_due_at, r.student_review_state FROM cases c " +
        "JOIN case_runtime r ON r.case_id = c.case_id WHERE c.case_id = ?",
    )
    .bind(input.caseId)
    .first<{
      status: CaseStatus;
      cleanup_due_at: string | null;
      student_review_state: string;
    }>();
  if (
    !row ||
    !terminalStatuses.has(row.status) ||
    !row.cleanup_due_at ||
    row.cleanup_due_at > now
  )
    throw new Error("cleanup_not_due");
  if (row.student_review_state === "pending")
    throw new Error("student_review_pending");
  try {
    await input.gateway.cleanupLedger({ caseId: input.caseId, now });
  } catch {
    throw new Error("cleanup_gateway_failed");
  }
  await input.db.batch([
    input.db
      .prepare("DELETE FROM submission_attempts WHERE case_id = ?")
      .bind(input.caseId),
    input.db
      .prepare("DELETE FROM case_runtime WHERE case_id = ?")
      .bind(input.caseId),
  ]);
  const stillExists = await input.db
    .prepare("SELECT case_id FROM cases WHERE case_id = ?")
    .bind(input.caseId)
    .first("case_id");
  if (stillExists !== input.caseId) throw new Error("case_record_missing");
}
