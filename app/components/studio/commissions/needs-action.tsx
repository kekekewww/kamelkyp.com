/**
 * The two queues that need a decision, independent of the case filters and
 * page: pending student prices and due cleanups. Both always render (the
 * home deep links land on `#student-reviews` and `#cleanup-due`). This
 * component owns the student-decision fetcher and the single cleanup dialog
 * with its fetcher, so a result is still reported after its item has left
 * the queue; focus then moves to the queue heading.
 */
import { useRef, useState } from "react";
import type {
  CleanupDueItem,
  CommissionsModel,
} from "../../../lib/cms/schemas/commission";
import { useStudioSession, useToast } from "../ui";
import { CaseIdText, ServiceNameText } from "./case-row";
import { CaseMarkerBadge, CaseStatusBadge } from "./case-status-badge";
import { CleanupDialog } from "./cleanup-dialog";
import { cleanupLabel, formatCaseDate, formatCaseMoney } from "./format";
import { StudentReviewItem } from "./student-review-item";
import {
  type CommissionResult,
  type SentFields,
  STALE_PAGE_CODES,
  useCommissionAction,
} from "./use-commission-action";

export const STUDENT_REVIEWS_ID = "student-reviews";
export const CLEANUP_DUE_ID = "cleanup-due";

function QueueHeading({
  id,
  count,
  headingRef,
  children,
}: {
  id: string;
  count: number;
  headingRef: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}) {
  return (
    <h2
      className="commissions-heading"
      id={`${id}-heading`}
      tabIndex={-1}
      ref={headingRef}
    >
      {children} <span className="commissions-heading__count">{count}</span>
    </h2>
  );
}

function StudentReviews({ data }: { data: CommissionsModel }) {
  const toast = useToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const decide = useCommissionAction(
    "/studio/commissions/student-discount",
    (result: CommissionResult, sent: SentFields) => {
      if (!result.ok) {
        toast.show({ tone: "error", message: result.message });
        if (STALE_PAGE_CODES.has(result.code)) heading.current?.focus();
        return;
      }
      const price = formatCaseMoney(
        Number(result.lockedPriceMinor),
        result.currency === "USD" ? "USD" : "TWD",
      );
      toast.show({
        message:
          sent.intent === "accept-student-price"
            ? `Student price kept for ${sent.caseId}: ${price}. Email the client with the result.`
            : `Standard price set for ${sent.caseId}: ${price}. Email the client with the result.`,
      });
      // The decided item has left the queue.
      heading.current?.focus();
    },
  );
  const items = data.studentReviews;
  return (
    <section
      className="commissions-queue"
      id={STUDENT_REVIEWS_ID}
      aria-labelledby={`${STUDENT_REVIEWS_ID}-heading`}
    >
      <QueueHeading
        id={STUDENT_REVIEWS_ID}
        count={items.length}
        headingRef={heading}
      >
        Student prices to check
      </QueueHeading>
      {items.length === 0 ? (
        <p className="commissions-queue__empty">No student prices to check.</p>
      ) : (
        <>
          <p className="studio-hint">
            Check the student proof in the Google Form first. The site never
            sees it.
          </p>
          <ul className="commissions-queue__list">
            {items.map((item) => (
              <StudentReviewItem
                key={item.caseId}
                item={item}
                services={data.services}
                busy={decide.sent?.caseId === item.caseId}
                onDecide={(intent, caseId) => decide.submit({ intent, caseId })}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CleanupQueueItem({
  item,
  data,
  onOpen,
}: {
  item: CleanupDueItem;
  data: CommissionsModel;
  onOpen: (item: CleanupDueItem) => void;
}) {
  const blockedId = `${item.caseId}-cleanup-blocked`;
  return (
    <li
      className="commissions-queue__item"
      aria-label={`Cleanup, case ${item.caseId}`}
    >
      <div className="commissions-queue__facts">
        <CaseIdText caseId={item.caseId} />
        <time className="commissions-mono" dateTime={item.submittedAt}>
          {formatCaseDate(item.submittedAt)}
        </time>
        <ServiceNameText services={data.services} serviceId={item.serviceId} />
        <span className="commissions-badges">
          <CaseStatusBadge status={item.status} />
          <CaseMarkerBadge
            marker={{
              kind: "cleanup-due",
              label: cleanupLabel(item.cleanupDueAt, data.now),
            }}
          />
        </span>
      </div>
      <div className="commissions-actions">
        <button
          type="button"
          className="studio-btn studio-btn--danger studio-btn--compact"
          disabled={item.studentReviewPending}
          aria-describedby={item.studentReviewPending ? blockedId : undefined}
          onClick={() => onOpen(item)}
        >
          Confirm cleanup
          <span className="visually-hidden"> for {item.caseId}</span>
        </button>
        {item.studentReviewPending ? (
          <p className="commissions-queue__blocked" id={blockedId}>
            <a className="studio-link" href={`#${STUDENT_REVIEWS_ID}`}>
              Decide the student price first
            </a>
          </p>
        ) : null}
      </div>
    </li>
  );
}

function CleanupQueue({ data }: { data: CommissionsModel }) {
  const toast = useToast();
  const session = useStudioSession();
  const heading = useRef<HTMLHeadingElement>(null);
  const [dialog, setDialog] = useState<{
    item: CleanupDueItem;
    open: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where focus goes once the dialog has closed (its opener may be gone).
  const focusAfterClose = useRef<HTMLElement | null>(null);

  const close = () => {
    setDialog((current) => (current ? { ...current, open: false } : null));
    setError(null);
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    target?.focus();
  };

  const confirm = useCommissionAction(
    "/studio/commissions/cleanup",
    (result: CommissionResult, sent: SentFields) => {
      if (result.ok) {
        focusAfterClose.current = heading.current;
        setDialog((current) => (current ? { ...current, open: false } : null));
        setError(null);
        toast.show({
          message: `Temporary records removed for ${sent.caseId}. The permanent record stays.`,
        });
        return;
      }
      if (STALE_PAGE_CODES.has(result.code)) {
        // The queue is out of date: it is being refreshed.
        focusAfterClose.current = heading.current;
        setDialog((current) => (current ? { ...current, open: false } : null));
        setError(null);
        toast.show({ tone: "error", message: result.message });
        return;
      }
      setError(result.message);
    },
  );

  const items = data.cleanupDue;
  return (
    <section
      className="commissions-queue"
      id={CLEANUP_DUE_ID}
      aria-labelledby={`${CLEANUP_DUE_ID}-heading`}
    >
      <QueueHeading
        id={CLEANUP_DUE_ID}
        count={items.length}
        headingRef={heading}
      >
        Cleanup due
      </QueueHeading>
      {items.length === 0 ? (
        <p className="commissions-queue__empty">No cleanup due.</p>
      ) : (
        <ul className="commissions-queue__list">
          {items.map((item) => (
            <CleanupQueueItem
              key={item.caseId}
              item={item}
              data={data}
              onOpen={(next) => {
                setError(null);
                setDialog({ item: next, open: true });
                // A long checklist session must not post an expired token.
                void session.refresh();
              }}
            />
          ))}
        </ul>
      )}
      <CleanupDialog
        item={dialog?.item ?? null}
        services={data.services}
        open={dialog?.open ?? false}
        action={confirm}
        error={error}
        onClose={close}
      />
    </section>
  );
}

export function NeedsAction({ data }: { data: CommissionsModel }) {
  return (
    <div className="commissions-needs">
      <StudentReviews data={data} />
      <CleanupQueue data={data} />
    </div>
  );
}
