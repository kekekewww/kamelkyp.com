/**
 * Studio Commissions inbox (wp1 §4.3, admin-architecture §2.2): case
 * statuses, action inputs, the list query and the loader model.
 * Client-safe: components import it; only types come from `.server`
 * modules.
 *
 * The query keeps the legacy parameter names (`status`, `service`,
 * `cursor`) so a forwarded legacy link lands on the same view.
 */
import { z } from "zod";
import type { AdminCaseRow } from "../../admin/case-service.server";
import type { CaseStatus } from "../../cases/case-repository.server";
import { isServiceId, type ServiceId } from "../../services/service-id";
import type { LocalizedText } from "../types";

export type { CaseStatus, ServiceId };

/** Same order as the case service's status list. */
export const CASE_STATUSES = [
  "pending_review",
  "pending_deposit",
  "in_production",
  "preview_approval",
  "pending_balance",
  "paused",
  "delivered",
  "cancelled",
] as const satisfies readonly CaseStatus[];

/** Entering one of these schedules the 7-day cleanup reminder. */
export const TERMINAL_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set([
  "paused",
  "delivered",
  "cancelled",
]);

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  pending_review: "Pending review",
  pending_deposit: "Awaiting deposit",
  in_production: "In production",
  preview_approval: "Preview approval",
  pending_balance: "Awaiting balance",
  paused: "Paused",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const CaseStatusSchema = z.enum(CASE_STATUSES);

/** `KAM-<UTC yyyymmdd>-<10 Crockford base32>` (cases/case-id.ts). */
export const CaseIdSchema = z
  .string()
  .regex(/^KAM-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/);

export const SetStatusInputSchema = z.object({
  caseId: CaseIdSchema,
  status: CaseStatusSchema,
});

export const StudentDecisionInputSchema = z.object({ caseId: CaseIdSchema });

/** Field names of the legacy cleanup checklist; a checked box posts "on". */
export const CLEANUP_CHECKLIST_FIELDS = [
  "googleRecordsDeleted",
  "gmailDeleted",
  "otherSensitiveCopiesDeleted",
] as const;

export const CleanupInputSchema = z.object({
  caseId: CaseIdSchema,
  googleRecordsDeleted: z.literal("on"),
  gmailDeleted: z.literal("on"),
  otherSensitiveCopiesDeleted: z.literal("on"),
});

export function isCaseStatus(value: string): value is CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(value);
}

export type CommissionQuery = {
  status: CaseStatus | null;
  service: ServiceId | null;
  cursor: string | null;
};

export const COMMISSION_CURSOR_MAX_LENGTH = 512;

/** Invalid or empty values are ignored (null), never an error. */
export function parseCommissionQuery(params: URLSearchParams): CommissionQuery {
  const status = params.get("status") ?? "";
  const service = params.get("service") ?? "";
  const cursor = params.get("cursor") ?? "";
  return {
    status: isCaseStatus(status) ? status : null,
    service: isServiceId(service) ? service : null,
    cursor:
      cursor && cursor.length <= COMMISSION_CURSOR_MAX_LENGTH ? cursor : null,
  };
}

export const COMMISSIONS_PATH = "/studio/commissions";

export function commissionQueryHref(query: Partial<CommissionQuery>): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.service) params.set("service", query.service);
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return search ? `${COMMISSIONS_PATH}?${search}` : COMMISSIONS_PATH;
}

// ---- Loader model (only these fields reach the browser) ----------------------

export type CommissionCaseRow = AdminCaseRow & {
  /** case_runtime.cleanup_due_at */
  cleanupDueAt: string | null;
  /** case_runtime.student_review_state = 'pending' */
  studentReviewPending: boolean;
  /** "removed" only when the runtime row is gone and the status is terminal. */
  temporaryRecords: "kept" | "removed";
};

export type StudentReviewItem = {
  caseId: string;
  serviceId: ServiceId;
  submittedAt: string;
  currency: "TWD" | "USD";
  standardPriceMinor: number;
  studentPriceMinor: number;
};

export type CleanupDueItem = {
  caseId: string;
  serviceId: ServiceId;
  status: CaseStatus;
  submittedAt: string;
  cleanupDueAt: string;
  studentReviewPending: boolean;
};

export type CommissionService = { id: ServiceId; name: LocalizedText };

export type CommissionsModel = {
  now: string;
  query: CommissionQuery;
  cursorRejected: boolean;
  services: CommissionService[];
  cases: CommissionCaseRow[];
  nextCursor: string | null;
  /** Every pending student price, independent of filters and page. */
  studentReviews: StudentReviewItem[];
  /** Every due cleanup, independent of filters and page. */
  cleanupDue: CleanupDueItem[];
};
