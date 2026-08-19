import type { CaseStatus } from "./case-repository.server";

const TERMINAL_STATUSES = new Set<CaseStatus>([
  "delivered",
  "cancelled",
  "paused",
]);

function isoDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("retention_date_invalid");
  return date;
}

export async function markCaseTerminal(
  db: D1Database,
  caseId: string,
  status: CaseStatus,
  terminalAt: string,
): Promise<void> {
  if (!TERMINAL_STATUSES.has(status)) {
    throw new Error("case_status_not_terminal");
  }
  const terminalDate = isoDate(terminalAt);
  const cleanupDueAt = new Date(
    terminalDate.getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [caseUpdate] = await db.batch([
    db
      .prepare("UPDATE cases SET status = ? WHERE case_id = ?")
      .bind(status, caseId),
    db
      .prepare(
        "INSERT INTO case_runtime " +
          "(case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) " +
          "SELECT ?, ?, 'none', NULL, NULL, ? WHERE EXISTS " +
          "(SELECT 1 FROM cases WHERE case_id = ?) " +
          "ON CONFLICT(case_id) DO UPDATE SET cleanup_due_at = excluded.cleanup_due_at, " +
          "updated_at = excluded.updated_at",
      )
      .bind(caseId, cleanupDueAt, terminalDate.toISOString(), caseId),
  ]);
  if (caseUpdate.meta.changes !== 1) throw new Error("case_not_found");
}

interface CleanupRow {
  case_id: string;
  service_id: string;
  status: CaseStatus;
  submitted_at: string;
  cleanup_due_at: string;
}

export async function listCleanupDue(db: D1Database, now: string) {
  const normalizedNow = isoDate(now).toISOString();
  const rows = await db
    .prepare(
      "SELECT c.case_id, c.service_id, c.status, c.submitted_at, r.cleanup_due_at " +
        "FROM cases c JOIN case_runtime r ON r.case_id = c.case_id " +
        "WHERE r.cleanup_due_at IS NOT NULL AND r.cleanup_due_at <= ? " +
        "ORDER BY r.cleanup_due_at, c.case_id",
    )
    .bind(normalizedNow)
    .all<CleanupRow>();
  return rows.results.map((row) => ({
    caseId: row.case_id,
    serviceId: row.service_id,
    status: row.status,
    submittedAt: row.submitted_at,
    cleanupDueAt: row.cleanup_due_at,
  }));
}

export async function confirmCleanup(
  db: D1Database,
  caseId: string,
  now: string,
): Promise<void> {
  const normalizedNow = isoDate(now).toISOString();
  const eligible = await db
    .prepare(
      "SELECT c.status FROM cases c JOIN case_runtime r ON r.case_id = c.case_id " +
        "WHERE c.case_id = ? AND r.cleanup_due_at IS NOT NULL AND r.cleanup_due_at <= ?",
    )
    .bind(caseId, normalizedNow)
    .first<{ status: CaseStatus }>();
  if (!eligible || !TERMINAL_STATUSES.has(eligible.status)) {
    throw new Error("cleanup_not_due");
  }
  await db.batch([
    db
      .prepare("DELETE FROM submission_attempts WHERE case_id = ?")
      .bind(caseId),
    db.prepare("DELETE FROM case_runtime WHERE case_id = ?").bind(caseId),
  ]);
}

export async function deleteOrphanAttempts(
  db: D1Database,
  now: string,
): Promise<number> {
  const cutoff = new Date(
    isoDate(now).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const result = await db
    .prepare(
      "DELETE FROM cases WHERE case_id IN (" +
        "SELECT a.case_id FROM submission_attempts a " +
        "JOIN cases c ON c.case_id = a.case_id " +
        "WHERE a.state != 'complete' AND c.status = 'pending_review' " +
        "AND a.updated_at < ?" +
        ") RETURNING case_id",
    )
    .bind(cutoff)
    .all<{ case_id: string }>();
  return result.results.length;
}
