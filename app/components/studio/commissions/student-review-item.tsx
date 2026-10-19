/**
 * One pending student price: the two stored candidate prices and the two
 * decisions, each confirmed in place (not a modal: nothing is deleted).
 * The decision keeps the stored student price or restores the stored
 * standard price; nothing is computed or editable here.
 */
import { useEffect, useRef, useState } from "react";
import type {
  CommissionService,
  StudentReviewItem as StudentReview,
} from "../../../lib/cms/schemas/commission";
import { CaseIdText, ServiceNameText } from "./case-row";
import { formatCaseDate, formatCaseMoney } from "./format";

export type StudentDecision = "accept-student-price" | "reject-student-price";

export function StudentReviewItem({
  item,
  services,
  busy,
  onDecide,
}: {
  item: StudentReview;
  services: readonly CommissionService[];
  /** This case's decision is in flight. */
  busy: boolean;
  onDecide: (intent: StudentDecision, caseId: string) => void;
}) {
  const [confirming, setConfirming] = useState<StudentDecision | null>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<StudentDecision | null>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const student = formatCaseMoney(item.studentPriceMinor, item.currency);
  const standard = formatCaseMoney(item.standardPriceMinor, item.currency);

  const open = (decision: StudentDecision) => {
    opener.current = decision;
    setConfirming(decision);
  };
  const cancel = () => {
    setConfirming(null);
    const from = opener.current;
    // Back to the button that opened the confirmation.
    window.requestAnimationFrame(() =>
      (from === "reject-student-price"
        ? rejectRef
        : acceptRef
      ).current?.focus(),
    );
  };

  return (
    <li
      className="commissions-queue__item"
      aria-label={`Student price, case ${item.caseId}`}
    >
      <div className="commissions-queue__facts">
        <CaseIdText caseId={item.caseId} />
        <time className="commissions-mono" dateTime={item.submittedAt}>
          {formatCaseDate(item.submittedAt)}
        </time>
        <ServiceNameText services={services} serviceId={item.serviceId} />
      </div>
      <dl className="commissions-prices">
        <div className="commissions-prices__item">
          <dt>Standard price</dt>
          <dd className="commissions-mono">{standard}</dd>
        </div>
        <div className="commissions-prices__item">
          <dt>Student price</dt>
          <dd className="commissions-mono">{student}</dd>
        </div>
      </dl>
      {confirming ? (
        <fieldset
          className="commissions-confirm"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <legend className="visually-hidden">
            Confirm student price decision for {item.caseId}
          </legend>
          <p className="commissions-confirm__text">
            {confirming === "accept-student-price"
              ? `Keep the student price ${student} for ${item.caseId}? This cannot be undone.`
              : `Charge the standard price ${standard} for ${item.caseId}? This cannot be undone.`}
          </p>
          <div className="commissions-actions">
            <button
              ref={confirmRef}
              type="button"
              className="studio-btn studio-btn--primary studio-btn--compact"
              aria-busy={busy || undefined}
              onClick={() => {
                if (!busy) onDecide(confirming, item.caseId);
              }}
            >
              {busy ? "Saving…" : "Confirm"}
              <span className="visually-hidden">
                {" "}
                decision for {item.caseId}
              </span>
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={cancel}
            >
              Cancel
              <span className="visually-hidden">
                {" "}
                decision for {item.caseId}
              </span>
            </button>
          </div>
        </fieldset>
      ) : (
        <div className="commissions-actions">
          <button
            ref={acceptRef}
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            onClick={() => open("accept-student-price")}
          >
            Accept student price
            <span className="visually-hidden"> for {item.caseId}</span>
          </button>
          <button
            ref={rejectRef}
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            onClick={() => open("reject-student-price")}
          >
            Charge standard price
            <span className="visually-hidden"> for {item.caseId}</span>
          </button>
        </div>
      )}
    </li>
  );
}
