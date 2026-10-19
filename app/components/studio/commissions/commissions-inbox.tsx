/**
 * `/studio/commissions` (admin-architecture §2.2, wp1 §4.5): the queues that
 * need a decision, then every case with filters and pagination. The page
 * shows only the permanent case fields; the full request stays in the
 * Google Form, its Sheet and Gmail.
 *
 * The inbox owns the one status fetcher, so a change's toast and its Undo
 * survive the row leaving a filtered list.
 */
import { useCallback, useRef } from "react";
import { useRouteLoaderData } from "react-router";
import {
  CASE_STATUS_LABELS,
  type CaseStatus,
  type CommissionsModel,
  isCaseStatus,
  TERMINAL_CASE_STATUSES,
} from "../../../lib/cms/schemas/commission";
import { StudioPage } from "../shell/studio-page";
import { useToast } from "../ui";
import { CaseList } from "./case-list";
import { formatShortDate } from "./format";
import { NeedsAction } from "./needs-action";
import {
  type CommissionResult,
  type SentFields,
  useCommissionAction,
} from "./use-commission-action";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function Summary({ data }: { data: CommissionsModel }) {
  const root = useRouteLoaderData("routes/studio/root") as
    | { pendingCommissions?: number }
    | undefined;
  const parts = [
    `${root?.pendingCommissions ?? 0} pending review`,
    plural(data.studentReviews.length, "student price", "student prices"),
    plural(data.cleanupDue.length, "cleanup due", "cleanups due"),
  ];
  return <span className="commissions-summary">{parts.join(" · ")}</span>;
}

/** Toasts for a finished status change (and its Undo). */
function useStatusFeedback(
  submitRef: { current: (fields: SentFields) => void },
  /** The Undo submissions, by identity: a change can wait behind another. */
  undoing: { current: Set<SentFields> },
  headingRef: { current: HTMLHeadingElement | null },
) {
  const toast = useToast();
  return useCallback(
    (result: CommissionResult, sent: SentFields) => {
      const caseId = sent.caseId ?? "";
      const wasUndo = undoing.current.delete(sent);
      // The row may have left a filtered list: never leave focus on <body>.
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) headingRef.current?.focus();
      });
      if (!result.ok) {
        toast.show({ tone: "error", message: result.message });
        return;
      }
      const status = String(result.status);
      const previous = String(result.previousStatus);
      if (!isCaseStatus(status) || !isCaseStatus(previous)) return;
      const label = CASE_STATUS_LABELS[status];
      const due =
        TERMINAL_CASE_STATUSES.has(status) &&
        typeof result.cleanupDueAt === "string"
          ? ` Cleanup due ${formatShortDate(result.cleanupDueAt)}.`
          : "";
      if (result.unchanged) {
        toast.show({
          tone: "info",
          message: `${caseId} is already “${label}”`,
        });
      } else if (wasUndo) {
        toast.show({
          message: due
            ? `${caseId} is back to “${label}”.${due}`
            : `${caseId} is back to “${label}”`,
        });
      } else {
        toast.show({
          message: due
            ? `${caseId} is now “${label}”.${due}`
            : `${caseId} is now “${label}”`,
          action: {
            label: "Undo",
            onAction: () => {
              const undo = { intent: "set-status", caseId, status: previous };
              undoing.current.add(undo);
              submitRef.current(undo);
            },
          },
        });
      }
    },
    [toast, submitRef, undoing, headingRef],
  );
}

export function CommissionsInbox({ data }: { data: CommissionsModel }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const undoing = useRef(new Set<SentFields>());
  // Status changes and their Undo share one fetcher.
  const submitRef = useRef<(fields: SentFields) => void>(() => {});
  const feedback = useStatusFeedback(submitRef, undoing, heading);
  const status = useCommissionAction("/studio/commissions/status", feedback);
  submitRef.current = status.submit;

  const onStatus = (caseId: string, next: CaseStatus) => {
    status.submit({ intent: "set-status", caseId, status: next });
  };

  return (
    <StudioPage title="Commissions" status={<Summary data={data} />}>
      <p className="commissions-privacy">
        The site keeps only the case ID, service, locked price, date and status.
        Read the full request in the Google Form, its Sheet or Gmail. Seven days
        after a case is delivered, cancelled or paused, delete those records and
        confirm the cleanup here.
      </p>
      <NeedsAction data={data} />
      <CaseList
        data={data}
        busyCaseIds={status.pendingCaseIds}
        onStatus={onStatus}
        headingRef={heading}
      />
    </StudioPage>
  );
}
