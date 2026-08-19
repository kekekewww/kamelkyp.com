import type { ServiceId } from "../services/service-id";

export type CaseStatus =
  | "pending_review"
  | "pending_deposit"
  | "in_production"
  | "preview_approval"
  | "pending_balance"
  | "delivered"
  | "paused"
  | "cancelled";

export interface SubmissionAttemptRecord {
  caseId: string;
  serviceId: ServiceId;
  lockedPriceMinor: number;
  currency: "TWD" | "USD";
  submittedAt: string;
  status: CaseStatus;
  state: "created" | "form_written" | "notified" | "complete" | "failed";
  payloadHash: string;
  termVersionIds: string[];
  termsAcceptedAt: string;
  googleResponseId: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
}

export async function createCaseAttempt(
  db: D1Database,
  input: {
    caseId: string;
    serviceId: ServiceId;
    lockedPriceMinor: number;
    currency: "TWD" | "USD";
    submittedAt: string;
    payloadHash: string;
    termVersionIds: string[];
    termsAcceptedAt: string;
    studentReviewState: "none" | "pending";
    standardPriceMinor: number | null;
    studentPriceMinor: number | null;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO cases " +
          "(case_id, service_id, locked_price_minor, currency, submitted_at, status) " +
          "VALUES (?, ?, ?, ?, ?, 'pending_review')",
      )
      .bind(
        input.caseId,
        input.serviceId,
        input.lockedPriceMinor,
        input.currency,
        input.submittedAt,
      ),
    db
      .prepare(
        "INSERT INTO case_runtime " +
          "(case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) " +
          "VALUES (?, NULL, ?, ?, ?, ?)",
      )
      .bind(
        input.caseId,
        input.studentReviewState,
        input.standardPriceMinor,
        input.studentPriceMinor,
        input.submittedAt,
      ),
    db
      .prepare(
        "INSERT INTO submission_attempts " +
          "(case_id, state, payload_hash, terms_versions_json, terms_accepted_at, google_response_id, last_error_code, updated_at) " +
          "VALUES (?, 'created', ?, ?, ?, NULL, NULL, ?)",
      )
      .bind(
        input.caseId,
        input.payloadHash,
        JSON.stringify(input.termVersionIds),
        input.termsAcceptedAt,
        input.submittedAt,
      ),
  ]);
}

interface AttemptRow {
  case_id: string;
  service_id: ServiceId;
  locked_price_minor: number;
  currency: "TWD" | "USD";
  submitted_at: string;
  status: CaseStatus;
  state: SubmissionAttemptRecord["state"];
  payload_hash: string;
  terms_versions_json: string;
  terms_accepted_at: string;
  google_response_id: string | null;
  last_error_code: string | null;
  updated_at: string;
}

export async function getSubmissionAttempt(
  db: D1Database,
  caseId: string,
): Promise<SubmissionAttemptRecord | null> {
  const row = await db
    .prepare(
      "SELECT c.case_id, c.service_id, c.locked_price_minor, c.currency, " +
        "c.submitted_at, c.status, a.state, a.payload_hash, a.terms_versions_json, " +
        "a.terms_accepted_at, a.google_response_id, a.last_error_code, a.updated_at " +
        "FROM cases c JOIN submission_attempts a ON a.case_id = c.case_id " +
        "WHERE c.case_id = ?",
    )
    .bind(caseId)
    .first<AttemptRow>();
  if (!row) return null;
  return {
    caseId: row.case_id,
    serviceId: row.service_id,
    lockedPriceMinor: row.locked_price_minor,
    currency: row.currency,
    submittedAt: row.submitted_at,
    status: row.status,
    state: row.state,
    payloadHash: row.payload_hash,
    termVersionIds: JSON.parse(row.terms_versions_json) as string[],
    termsAcceptedAt: row.terms_accepted_at,
    googleResponseId: row.google_response_id,
    lastErrorCode: row.last_error_code,
    updatedAt: row.updated_at,
  };
}

export async function updateSubmissionAttempt(
  db: D1Database,
  input: {
    caseId: string;
    state: SubmissionAttemptRecord["state"];
    googleResponseId?: string | null;
    lastErrorCode?: string | null;
    updatedAt: string;
  },
): Promise<void> {
  const result = await db
    .prepare(
      "UPDATE submission_attempts SET state = ?, google_response_id = ?, " +
        "last_error_code = ?, updated_at = ? WHERE case_id = ?",
    )
    .bind(
      input.state,
      input.googleResponseId ?? null,
      input.lastErrorCode ?? null,
      input.updatedAt,
      input.caseId,
    )
    .run();
  if (result.meta.changes !== 1)
    throw new Error("submission_attempt_not_found");
}
