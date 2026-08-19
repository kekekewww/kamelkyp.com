import { z } from "zod";
import type { CaseStatus } from "../cases/case-repository.server";
import { markCaseTerminal } from "../cases/retention.server";
import { isServiceId, type ServiceId } from "../services/service-id";

export type AdminCaseRow = {
  caseId: string;
  serviceId: ServiceId;
  lockedPriceMinor: number;
  currency: "TWD" | "USD";
  submittedAt: string;
  status: CaseStatus;
};

const CaseStatusSchema = z.enum([
  "pending_review",
  "pending_deposit",
  "in_production",
  "preview_approval",
  "pending_balance",
  "paused",
  "delivered",
  "cancelled",
]);

const terminalStatuses = new Set<CaseStatus>([
  "paused",
  "delivered",
  "cancelled",
]);

interface CaseRow {
  case_id: string;
  service_id: ServiceId;
  locked_price_minor: number;
  currency: "TWD" | "USD";
  submitted_at: string;
  status: CaseStatus;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

async function cursorKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function encodeCursor(
  value: { submittedAt: string; caseId: string },
  secret: string,
) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await cursorKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function decodeCursor(value: string, secret: string) {
  try {
    const [payload, encodedSignature, extra] = value.split(".");
    if (!payload || !encodedSignature || extra) throw new Error();
    const signature = fromBase64Url(encodedSignature);
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await cursorKey(secret),
        signature.buffer as ArrayBuffer,
        encoder.encode(payload),
      ))
    )
      throw new Error();
    return z
      .object({ submittedAt: z.iso.datetime(), caseId: z.string().min(1) })
      .parse(JSON.parse(decoder.decode(fromBase64Url(payload))));
  } catch {
    throw new Error("invalid_case_cursor");
  }
}

function mapCase(row: CaseRow): AdminCaseRow {
  return {
    caseId: row.case_id,
    serviceId: row.service_id,
    lockedPriceMinor: row.locked_price_minor,
    currency: row.currency,
    submittedAt: row.submitted_at,
    status: row.status,
  };
}

export async function listCases(input: {
  db: D1Database;
  status?: CaseStatus;
  serviceId?: ServiceId;
  limit: number;
  cursor?: string;
  cursorSecret: string;
}): Promise<{ rows: AdminCaseRow[]; nextCursor?: string }> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
    throw new Error("invalid_case_limit");
  if (input.status) CaseStatusSchema.parse(input.status);
  if (input.serviceId && !isServiceId(input.serviceId))
    throw new Error("invalid_service_id");
  const cursor = input.cursor
    ? await decodeCursor(input.cursor, input.cursorSecret)
    : null;
  const where: string[] = [];
  const bindings: Array<string | number> = [];
  if (input.status) {
    where.push("status = ?");
    bindings.push(input.status);
  }
  if (input.serviceId) {
    where.push("service_id = ?");
    bindings.push(input.serviceId);
  }
  if (cursor) {
    where.push("(submitted_at < ? OR (submitted_at = ? AND case_id < ?))");
    bindings.push(cursor.submittedAt, cursor.submittedAt, cursor.caseId);
  }
  const result = await input.db
    .prepare(
      "SELECT case_id, service_id, locked_price_minor, currency, submitted_at, status " +
        "FROM cases " +
        (where.length ? `WHERE ${where.join(" AND ")} ` : "") +
        "ORDER BY submitted_at DESC, case_id DESC LIMIT ?",
    )
    .bind(...bindings, input.limit + 1)
    .all<CaseRow>();
  const hasMore = result.results.length > input.limit;
  const rows = result.results.slice(0, input.limit).map(mapCase);
  const last = rows.at(-1);
  return {
    rows,
    ...(hasMore && last
      ? {
          nextCursor: await encodeCursor(
            { submittedAt: last.submittedAt, caseId: last.caseId },
            input.cursorSecret,
          ),
        }
      : {}),
  };
}

export async function updateCaseStatus(input: {
  db: D1Database;
  caseId: string;
  status: CaseStatus;
  now: Date;
}): Promise<void> {
  const status = CaseStatusSchema.parse(input.status);
  if (terminalStatuses.has(status)) {
    return markCaseTerminal(
      input.db,
      input.caseId,
      status,
      input.now.toISOString(),
    );
  }
  const [updated] = await input.db.batch([
    input.db
      .prepare("UPDATE cases SET status = ? WHERE case_id = ?")
      .bind(status, input.caseId),
    input.db
      .prepare(
        "INSERT INTO case_runtime (case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) " +
          "VALUES (?, NULL, 'none', NULL, NULL, ?) ON CONFLICT(case_id) DO UPDATE SET cleanup_due_at = NULL, updated_at = excluded.updated_at",
      )
      .bind(input.caseId, input.now.toISOString()),
  ]);
  if (updated.meta.changes !== 1) throw new Error("case_not_found");
}

export async function listPendingStudentPriceReviews(db: D1Database) {
  const rows = await db
    .prepare(
      "SELECT c.case_id, c.currency, r.standard_price_minor, r.student_price_minor " +
        "FROM cases c JOIN case_runtime r ON r.case_id = c.case_id " +
        "WHERE r.student_review_state = 'pending' ORDER BY c.submitted_at DESC, c.case_id DESC",
    )
    .all<{
      case_id: string;
      currency: "TWD" | "USD";
      standard_price_minor: number;
      student_price_minor: number;
    }>();
  return rows.results.map((row) => ({
    caseId: row.case_id,
    currency: row.currency,
    standardPriceMinor: row.standard_price_minor,
    studentPriceMinor: row.student_price_minor,
  }));
}

export async function resolveStudentDiscount(input: {
  db: D1Database;
  caseId: string;
  accepted: boolean;
}): Promise<void> {
  const [caseResult, runtimeResult] = await input.db.batch([
    input.db
      .prepare(
        "UPDATE cases SET locked_price_minor = CASE WHEN ? = 1 THEN locked_price_minor ELSE " +
          "(SELECT standard_price_minor FROM case_runtime WHERE case_id = ? AND student_review_state = 'pending') END " +
          "WHERE case_id = ? AND EXISTS (SELECT 1 FROM case_runtime WHERE case_id = ? AND student_review_state = 'pending')",
      )
      .bind(input.accepted ? 1 : 0, input.caseId, input.caseId, input.caseId),
    input.db
      .prepare(
        "UPDATE case_runtime SET student_review_state = 'none', standard_price_minor = NULL, student_price_minor = NULL " +
          "WHERE case_id = ? AND student_review_state = 'pending'",
      )
      .bind(input.caseId),
  ]);
  if (caseResult.meta.changes !== 1 || runtimeResult.meta.changes !== 1)
    throw new Error("student_review_conflict");
}
