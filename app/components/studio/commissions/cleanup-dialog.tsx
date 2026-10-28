/**
 * Owner-confirmed 7-day cleanup (port of the legacy cleanup checklist).
 * Deleting the Google Form response, its Sheet row and the Gmail copies is
 * done by hand; this only records the confirmation: the Apps Script ledger
 * first, then the case's temporary records here. The permanent record stays.
 *
 * `ConfirmDialog` renders its actions outside the body, so the confirm
 * button reaches the checklist form through `form={formId}` and carries the
 * intent itself.
 *
 * The form posts through the queue's `submit`, not natively: Cancel stays
 * usable while a cleanup runs, so the owner can confirm another case before
 * the first has answered, and a second post on the one fetcher would abort
 * the first. The queue sends it once the first has settled.
 */
import { useEffect, useId, useState } from "react";
import type {
  CleanupDueItem,
  CommissionService,
} from "../../../lib/cms/schemas/commission";
import { ConfirmDialog, StudioForm } from "../ui";
import { CaseIdText, ServiceNameText } from "./case-row";
import { CaseStatusBadge } from "./case-status-badge";
import { formatCaseDate } from "./format";
import type { CommissionAction, SentFields } from "./use-commission-action";

const CHECKLIST = [
  {
    name: "googleRecordsDeleted",
    label: "Google Form response and its Sheet row are deleted",
  },
  {
    name: "gmailDeleted",
    label: "Gmail notification is deleted, including Trash",
  },
  {
    name: "otherSensitiveCopiesDeleted",
    label:
      "Other copies with personal data are deleted (downloads, forwards, Drive)",
  },
] as const;

type ChecklistName = (typeof CHECKLIST)[number]["name"];

const CLEANUP_ACTION = "/studio/commissions/cleanup";

/**
 * The fields to post for a confirmed checklist, or null: nothing before all
 * three are checked, and nothing twice for a case already in flight or
 * waiting. Another case in flight is no reason to refuse, the queue holds it.
 */
export function cleanupSubmission(
  caseId: string,
  allChecked: boolean,
  pendingCaseIds: ReadonlySet<string>,
): SentFields | null {
  if (!allChecked || pendingCaseIds.has(caseId)) return null;
  const fields: SentFields = { intent: "confirm-cleanup", caseId };
  for (const entry of CHECKLIST) fields[entry.name] = "on";
  return fields;
}

function Checklist({
  item,
  services,
  action,
  formId,
  onChecked,
}: {
  item: CleanupDueItem;
  services: readonly CommissionService[];
  action: CommissionAction;
  formId: string;
  onChecked: (all: boolean) => void;
}) {
  const [checked, setChecked] = useState<Record<ChecklistName, boolean>>({
    googleRecordsDeleted: false,
    gmailDeleted: false,
    otherSensitiveCopiesDeleted: false,
  });
  const all = CHECKLIST.every((entry) => checked[entry.name]);
  return (
    <StudioForm
      fetcher={action.fetcher}
      id={formId}
      action={CLEANUP_ACTION}
      className="commissions-cleanup"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = cleanupSubmission(
          item.caseId,
          all,
          action.pendingCaseIds,
        );
        if (fields) action.submit(fields);
      }}
    >
      <input type="hidden" name="caseId" value={item.caseId} />
      <p className="commissions-queue__facts">
        <CaseIdText caseId={item.caseId} />
        <time className="commissions-mono" dateTime={item.submittedAt}>
          {formatCaseDate(item.submittedAt)}
        </time>
        <ServiceNameText services={services} serviceId={item.serviceId} />
        <CaseStatusBadge status={item.status} />
      </p>
      <fieldset className="commissions-checklist">
        <legend className="commissions-checklist__legend">
          Delete these yourself first. The site cannot reach Google or Gmail
          data.
        </legend>
        {CHECKLIST.map((entry) => (
          <label className="commissions-checklist__item" key={entry.name}>
            <input
              type="checkbox"
              name={entry.name}
              required
              checked={checked[entry.name]}
              onChange={(event) => {
                const next = {
                  ...checked,
                  [entry.name]: event.currentTarget.checked,
                };
                setChecked(next);
                onChecked(CHECKLIST.every((field) => next[field.name]));
              }}
            />
            <span>{entry.label}</span>
          </label>
        ))}
      </fieldset>
    </StudioForm>
  );
}

export function CleanupDialog({
  item,
  services,
  open,
  action,
  error,
  onClose,
}: {
  /** The case being confirmed; kept while the dialog closes. */
  item: CleanupDueItem | null;
  services: readonly CommissionService[];
  open: boolean;
  /** The cleanup fetcher, owned by the queue (it outlives this item). */
  action: CommissionAction;
  /** A failure to show in place, so Retry is one click. */
  error: string | null;
  onClose: () => void;
}) {
  const formId = useId();
  const hintId = useId();
  const [ready, setReady] = useState(false);
  const shown = open && item !== null;
  // Only this case's own cleanup: another case may be in flight meanwhile.
  const confirming = item !== null && action.pendingCaseIds.has(item.caseId);

  // Every opening starts from an empty checklist.
  useEffect(() => {
    if (!shown) setReady(false);
  }, [shown]);

  return (
    <ConfirmDialog
      open={shown}
      title={item ? `Confirm cleanup for ${item.caseId}` : "Confirm cleanup"}
      tone="danger"
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className="studio-btn studio-btn--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            name="intent"
            value="confirm-cleanup"
            className="studio-btn studio-btn--danger-filled"
            disabled={!ready}
            aria-describedby={ready ? undefined : hintId}
            aria-busy={confirming || undefined}
          >
            {confirming ? "Confirming…" : "Confirm cleanup"}
          </button>
        </>
      }
    >
      {shown && item ? (
        <>
          <Checklist
            item={item}
            services={services}
            action={action}
            formId={formId}
            onChecked={setReady}
          />
          <p className="studio-hint">
            Confirming removes this case's temporary records here and its Apps
            Script ledger entry. The permanent record stays: case ID, service,
            locked price, date and status. Gmail and Drive Trash and Google
            backups may keep data for their own retention period.
          </p>
          {ready ? null : (
            <p className="commissions-dialog__hint" id={hintId}>
              Check all three to continue.
            </p>
          )}
          {error ? (
            <p className="studio-field__error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </ConfirmDialog>
  );
}
