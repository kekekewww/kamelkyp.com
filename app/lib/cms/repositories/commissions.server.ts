/**
 * Studio Commissions inbox (admin-architecture §2.2, wp1 §4.4).
 *
 * Wraps the case services unchanged (`admin/case-service.server.ts`,
 * `admin/cleanup-service.server.ts`, `cases/retention.server.ts`); the route
 * modules stay thin. Privacy (site spec §16, plan 06): the loader returns the
 * six permanent case fields plus the runtime facts needed to act (student
 * price candidates, cleanup schedule) and nothing from
 * `submission_attempts`. Every SQL statement lists its columns.
 *
 * No price is computed here: amounts are the stored D1 values, and the only
 * price change is `resolveStudentDiscount` (keep the stored student price or
 * restore the stored standard price). The 7-day cleanup is never automatic:
 * the owner confirms the three-item checklist, the Apps Script ledger is
 * written first, then the temporary records go.
 */
import type { z } from "zod";
import {
  listCases,
  listPendingStudentPriceReviews,
  resolveStudentDiscount,
  updateCaseStatus,
} from "../../admin/case-service.server";
import { confirmVerifiedCleanup } from "../../admin/cleanup-service.server";
import { listCleanupDue } from "../../cases/retention.server";
import type { Env } from "../../env.server";
import { cleanupGoogleLedger } from "../../integrations/google-submission-gateway.server";
import { isServiceId } from "../../services/service-id";
import { parseLocalizedText } from "../localized";
import {
  type CaseStatus,
  CLEANUP_CHECKLIST_FIELDS,
  type CleanupDueItem,
  CleanupInputSchema,
  type CommissionCaseRow,
  type CommissionService,
  type CommissionsModel,
  parseCommissionQuery,
  SetStatusInputSchema,
  StudentDecisionInputSchema,
  type StudentReviewItem,
  TERMINAL_CASE_STATUSES,
} from "../schemas/commission";
import type { StudioActionArgs } from "../studio/auth.server";
import { actionError, actionOk, unknownIntent } from "../studio/responses";
import type { ValidationIssue } from "../types";

/** The case service's maximum page size (same as the legacy list). */
const COMMISSION_PAGE_SIZE = 100;

// ---- Loader -----------------------------------------------------------------------

type CaseFactsRow = {
  case_id: string;
  service_id: string;
  submitted_at: string;
  status: CaseStatus;
  has_runtime: number;
  cleanup_due_at: string | null;
  student_review_state: string | null;
};

type CaseFacts = {
  serviceId: string;
  submittedAt: string;
  status: CaseStatus;
  hasRuntime: boolean;
  cleanupDueAt: string | null;
  studentReviewPending: boolean;
};

/** Runtime facts for a set of cases, in one query (one bound JSON array). */
async function caseFacts(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, CaseFacts>> {
  const facts = new Map<string, CaseFacts>();
  if (ids.length === 0) return facts;
  const rows = await db
    .prepare(
      `SELECT c.case_id, c.service_id, c.submitted_at, c.status,
              r.case_id IS NOT NULL AS has_runtime,
              r.cleanup_due_at, r.student_review_state
       FROM cases c LEFT JOIN case_runtime r ON r.case_id = c.case_id
       WHERE c.case_id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify([...new Set(ids)]))
    .all<CaseFactsRow>();
  for (const row of rows.results) {
    facts.set(row.case_id, {
      serviceId: row.service_id,
      submittedAt: row.submitted_at,
      status: row.status,
      hasRuntime: Boolean(row.has_runtime),
      cleanupDueAt: row.cleanup_due_at,
      studentReviewPending: row.student_review_state === "pending",
    });
  }
  return facts;
}

/** The four commission services, named from `services.name_i18n`. */
async function serviceNames(db: D1Database): Promise<CommissionService[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, s.name_i18n
       FROM service_definitions d
       LEFT JOIN services s ON s.commission_service_id = d.id
       ORDER BY d.sort_order, d.id`,
    )
    .all<{ id: string; name_i18n: string | null }>();
  return rows.results.flatMap((row) =>
    isServiceId(row.id)
      ? [{ id: row.id, name: parseLocalizedText(row.name_i18n) }]
      : [],
  );
}

function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_CASE_STATUSES.has(status);
}

export async function loadCommissions(input: {
  db: D1Database;
  url: URL;
  cursorSecret: string;
  now: Date;
  /** Tests only; defaults to the page size. */
  limit?: number;
}): Promise<CommissionsModel> {
  const { db, now } = input;
  const parsed = parseCommissionQuery(input.url.searchParams);
  const pageOf = (cursor: string | null) =>
    listCases({
      db,
      status: parsed.status ?? undefined,
      serviceId: parsed.service ?? undefined,
      limit: input.limit ?? COMMISSION_PAGE_SIZE,
      cursor: cursor ?? undefined,
      cursorSecret: input.cursorSecret,
    });

  // A cursor that parsing dropped (longer than any the list issues) is a
  // rejected page link too, so the owner sees the same notice (wp1 §8).
  let cursorRejected =
    parsed.cursor === null && Boolean(input.url.searchParams.get("cursor"));
  const page = pageOf(parsed.cursor).catch((error: unknown) => {
    // A rotated secret or an edited link: show the newest cases instead.
    if (
      parsed.cursor &&
      error instanceof Error &&
      error.message === "invalid_case_cursor"
    ) {
      cursorRejected = true;
      return pageOf(null);
    }
    throw error;
  });
  const [cases, reviews, due, services] = await Promise.all([
    page,
    listPendingStudentPriceReviews(db),
    listCleanupDue(db, now.toISOString()),
    serviceNames(db),
  ]);
  const facts = await caseFacts(db, [
    ...cases.rows.map((row) => row.caseId),
    ...reviews.map((item) => item.caseId),
    ...due.map((item) => item.caseId),
  ]);

  const rows: CommissionCaseRow[] = cases.rows.map((row) => {
    const fact = facts.get(row.caseId);
    return {
      caseId: row.caseId,
      serviceId: row.serviceId,
      lockedPriceMinor: row.lockedPriceMinor,
      currency: row.currency,
      submittedAt: row.submittedAt,
      status: row.status,
      cleanupDueAt: fact?.cleanupDueAt ?? null,
      studentReviewPending: fact?.studentReviewPending ?? false,
      // Derived from case_runtime only (wp1 §4.4, §4.7). A terminal case
      // from before migration 0003 whose status never changed since would
      // match too, but 0003 predates every deploy.
      temporaryRecords:
        fact && !fact.hasRuntime && isTerminal(row.status) ? "removed" : "kept",
    };
  });

  const studentReviews: StudentReviewItem[] = reviews.flatMap((item) => {
    const fact = facts.get(item.caseId);
    if (!fact || !isServiceId(fact.serviceId)) return [];
    return [
      {
        caseId: item.caseId,
        serviceId: fact.serviceId,
        submittedAt: fact.submittedAt,
        currency: item.currency,
        standardPriceMinor: item.standardPriceMinor,
        studentPriceMinor: item.studentPriceMinor,
      },
    ];
  });

  const cleanupDue: CleanupDueItem[] = due.flatMap((item) => {
    if (!isServiceId(item.serviceId)) return [];
    return [
      {
        caseId: item.caseId,
        serviceId: item.serviceId,
        status: item.status,
        submittedAt: item.submittedAt,
        cleanupDueAt: item.cleanupDueAt,
        studentReviewPending:
          facts.get(item.caseId)?.studentReviewPending ?? false,
      },
    ];
  });

  return {
    now: now.toISOString(),
    query: cursorRejected ? { ...parsed, cursor: null } : parsed,
    cursorRejected,
    services,
    cases: rows,
    nextCursor: cases.nextCursor ?? null,
    studentReviews,
    cleanupDue,
  };
}

// ---- Gateway ----------------------------------------------------------------------

export type CleanupGateway = {
  cleanupLedger(input: { caseId: string; now: string }): Promise<void>;
};

/** Apps Script `cleanup_ledger` (signed, idempotent). */
export function appsScriptCleanupGateway(
  env: Pick<Env, "APPS_SCRIPT_URL" | "APPS_SCRIPT_HMAC_SECRET">,
  fetcher: typeof fetch = fetch,
): CleanupGateway {
  // A plain call: the runtime's fetch must not run with another `this`.
  const call: typeof fetch = (resource, init) => fetcher(resource, init);
  return {
    cleanupLedger: ({ caseId, now }) =>
      cleanupGoogleLedger({
        url: env.APPS_SCRIPT_URL,
        secret: env.APPS_SCRIPT_HMAC_SECRET,
        caseId,
        now,
        fetcher: call,
      }),
  };
}

// ---- Errors -----------------------------------------------------------------------

const ERRORS = new Map<string, { status: number; message: string }>([
  [
    "case_not_found",
    {
      status: 404,
      message: "This case no longer exists. The list has been refreshed.",
    },
  ],
  [
    "student_review_conflict",
    {
      status: 409,
      message:
        "This student price was already decided. The list is up to date now.",
    },
  ],
  [
    "cleanup_checklist_incomplete",
    { status: 422, message: "Confirm all three deletions first." },
  ],
  [
    "cleanup_not_due",
    { status: 409, message: "Cleanup is not due for this case." },
  ],
  [
    "student_review_pending",
    { status: 409, message: "Decide the student price before the cleanup." },
  ],
  [
    "cleanup_gateway_failed",
    {
      status: 503,
      message:
        "Nothing was deleted: the Apps Script ledger did not confirm. Try again in a moment.",
    },
  ],
  [
    "cleanup_failed",
    {
      status: 503,
      message:
        "The cleanup did not finish and nothing was marked as done. Try again in a moment.",
    },
  ],
  [
    "case_record_missing",
    {
      status: 500,
      message:
        "Temporary records were removed, but the case record is missing. Check the database before anything else.",
    },
  ],
  // Not in the wp1 §4.4 table: the outcome of a cleanup whose state could
  // not be read back after the ledger confirmed (see cleanupAfterFailure).
  [
    "cleanup_unverified",
    {
      status: 503,
      message:
        "The Studio could not check whether the cleanup finished. Reload the page: if the case is still in Cleanup due, confirm it again.",
    },
  ],
]);

function errorCode(error: unknown): string | null {
  return error instanceof Error && ERRORS.has(error.message)
    ? error.message
    : null;
}

function errorResult(code: string, issues?: ValidationIssue[]) {
  const known = ERRORS.get(code);
  return actionError(code, {
    status: known?.status ?? 500,
    ...(known ? { message: known.message } : {}),
    ...(issues ? { issues } : {}),
  });
}

/** A coded case-service error → action result; anything else is rethrown. */
function commissionErrorResult(error: unknown) {
  const code = errorCode(error);
  if (!code) throw error;
  return errorResult(code);
}

// ---- Input --------------------------------------------------------------------------

const FIELD_MESSAGES: Record<string, string> = {
  caseId: "The case ID is missing or not valid.",
  status: "Choose one of the eight case statuses.",
  googleRecordsDeleted:
    "Confirm that the Google Form response and its Sheet row are deleted.",
  gmailDeleted: "Confirm that the Gmail notification is deleted.",
  otherSensitiveCopiesDeleted:
    "Confirm that other copies with personal data are deleted.",
};

/** The named form fields; an empty value counts as missing. */
function readFields(
  formData: FormData,
  names: readonly string[],
): Record<string, string | undefined> {
  return Object.fromEntries(
    names.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" && value ? value : undefined];
    }),
  );
}

function toIssues(
  error: z.ZodError,
  input: Record<string, string | undefined>,
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const issue of error.issues) {
    const field = issue.path.join(".");
    if (seen.has(field)) continue;
    seen.add(field);
    const missing = input[field] === undefined;
    issues.push({
      field,
      code: missing ? "required" : "invalid_value",
      severity: "error",
      message: FIELD_MESSAGES[field] ?? "This value is not valid.",
    });
  }
  return issues;
}

function invalidRequest(issues: ValidationIssue[]) {
  return actionError("invalid_request", {
    status: 422,
    message: "This request could not be read. Reload the page and try again.",
    issues,
  });
}

// ---- Handlers -------------------------------------------------------------------

async function currentCase(db: D1Database, caseId: string) {
  return db
    .prepare(
      `SELECT c.status, r.cleanup_due_at
       FROM cases c LEFT JOIN case_runtime r ON r.case_id = c.case_id
       WHERE c.case_id = ?`,
    )
    .bind(caseId)
    .first<{ status: CaseStatus; cleanup_due_at: string | null }>();
}

/** `POST /studio/commissions/status` — intent `set-status`. */
export async function handleCommissionStatus({
  db,
  formData,
  intent,
  now,
}: Pick<StudioActionArgs, "db" | "formData" | "intent" | "now">) {
  if (!formData) return unknownIntent(intent);
  switch (intent) {
    case "set-status": {
      const raw = readFields(formData, ["caseId", "status"]);
      const parsed = SetStatusInputSchema.safeParse(raw);
      if (!parsed.success) return invalidRequest(toIssues(parsed.error, raw));
      const { caseId, status } = parsed.data;
      const before = await currentCase(db, caseId);
      if (!before) return errorResult("case_not_found");
      if (before.status === status) {
        // Re-sending a terminal status is not "entering" it: the cleanup
        // date must not move, so nothing is written.
        return actionOk({
          intent,
          caseId,
          status,
          previousStatus: before.status,
          cleanupDueAt: before.cleanup_due_at,
          unchanged: true,
        });
      }
      try {
        await updateCaseStatus({ db, caseId, status, now });
      } catch (error) {
        return commissionErrorResult(error);
      }
      const after = await currentCase(db, caseId);
      return actionOk({
        intent,
        caseId,
        status,
        previousStatus: before.status,
        cleanupDueAt: after?.cleanup_due_at ?? null,
        unchanged: false,
      });
    }
    default:
      return unknownIntent(intent);
  }
}

/** `POST /studio/commissions/student-discount` — keep or refuse the student price. */
export async function handleStudentDiscount({
  db,
  formData,
  intent,
}: Pick<StudioActionArgs, "db" | "formData" | "intent">) {
  if (!formData) return unknownIntent(intent);
  switch (intent) {
    case "accept-student-price":
    case "reject-student-price": {
      const raw = readFields(formData, ["caseId"]);
      const parsed = StudentDecisionInputSchema.safeParse(raw);
      if (!parsed.success) return invalidRequest(toIssues(parsed.error, raw));
      const { caseId } = parsed.data;
      try {
        await resolveStudentDiscount({
          db,
          caseId,
          accepted: intent === "accept-student-price",
        });
      } catch (error) {
        return commissionErrorResult(error);
      }
      const stored = await db
        .prepare(
          "SELECT locked_price_minor, currency FROM cases WHERE case_id = ?",
        )
        .bind(caseId)
        .first<{ locked_price_minor: number; currency: "TWD" | "USD" }>();
      if (!stored) return errorResult("case_not_found");
      return actionOk({
        intent,
        caseId,
        lockedPriceMinor: stored.locked_price_minor,
        currency: stored.currency,
      });
    }
    default:
      return unknownIntent(intent);
  }
}

/** `POST /studio/commissions/cleanup` — the owner-confirmed 7-day cleanup. */
export async function handleCommissionCleanup({
  db,
  formData,
  intent,
  now,
  gateway,
}: Pick<StudioActionArgs, "db" | "formData" | "intent" | "now"> & {
  gateway: CleanupGateway;
}) {
  if (!formData) return unknownIntent(intent);
  switch (intent) {
    case "confirm-cleanup": {
      const raw = readFields(formData, ["caseId", ...CLEANUP_CHECKLIST_FIELDS]);
      const parsed = CleanupInputSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = toIssues(parsed.error, raw);
        // Checked before any D1 read or ledger call: nothing happens until
        // all three deletions are confirmed.
        return issues.some((issue) => issue.field === "caseId")
          ? invalidRequest(issues)
          : errorResult("cleanup_checklist_incomplete", issues);
      }
      const { caseId } = parsed.data;
      // The service deletes only after the ledger confirmed, so this tells
      // where an uncoded error came from.
      let ledgerConfirmed = false;
      try {
        await confirmVerifiedCleanup({
          db,
          caseId,
          checklist: {
            googleRecordsDeleted: true,
            gmailDeleted: true,
            otherSensitiveCopiesDeleted: true,
          },
          gateway: {
            cleanupLedger: async (input) => {
              await gateway.cleanupLedger(input);
              ledgerConfirmed = true;
            },
          },
          now,
        });
      } catch (error) {
        const code = errorCode(error);
        if (code) return errorResult(code);
        // An uncoded (D1) error before the ledger confirmed: nothing was
        // deleted (wp1 §4.4).
        if (!ledgerConfirmed) return errorResult("cleanup_failed");
        // After it, the error can come before the delete batch or after it
        // committed: what is left decides what the owner is told.
        return cleanupAfterFailure(db, intent, caseId);
      }
      return actionOk({ intent, caseId });
    }
    default:
      return unknownIntent(intent);
  }
}

/**
 * The cleanup failed without a coded error after the ledger confirmed, so
 * the due check had found the case's runtime row. The delete batch removes
 * the attempt and runtime rows atomically: a runtime row still there means
 * nothing was removed (a retry is safe: the ledger write is idempotent),
 * none left means the cleanup went through and only a later read failed.
 * If even this read fails, the outcome is unknown and the answer says so.
 *
 * Deliberate deviation from wp1 §4.4 (which maps every uncoded cleanup
 * error to 503 `cleanup_failed`): that message says nothing was marked as
 * done, which is false once the batch has committed. Like all new SQL here,
 * this never reads `submission_attempts` (§4.7).
 */
async function cleanupAfterFailure(
  db: D1Database,
  intent: string,
  caseId: string,
) {
  let left: { has_case: number; has_runtime: number } | null;
  try {
    left = await db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM cases WHERE case_id = ?1) AS has_case,
                EXISTS (SELECT 1 FROM case_runtime WHERE case_id = ?1) AS has_runtime`,
      )
      .bind(caseId)
      .first();
  } catch {
    return errorResult("cleanup_unverified");
  }
  if (!left) return errorResult("cleanup_unverified");
  if (left.has_runtime) return errorResult("cleanup_failed");
  if (!left.has_case) return errorResult("case_record_missing");
  return actionOk({ intent, caseId });
}
