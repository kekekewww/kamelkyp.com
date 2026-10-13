/**
 * Status select + Update for one case. It owns no fetcher: the inbox does,
 * so the result toast and its Undo survive the row leaving a filtered list.
 * "Update" is `aria-disabled` (not `disabled`) while the selection equals
 * the current status, so focus stays on it after a change has landed.
 */
import { useEffect, useId, useState } from "react";
import {
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  type CaseStatus,
  isCaseStatus,
} from "../../../lib/cms/schemas/commission";

export function CaseStatusControl({
  caseId,
  status,
  busy,
  onSubmit,
}: {
  caseId: string;
  status: CaseStatus;
  /** This case's change is in flight. */
  busy: boolean;
  onSubmit: (status: CaseStatus) => void;
}) {
  const id = useId();
  const [value, setValue] = useState<CaseStatus>(status);

  // A revalidated list brings the stored status.
  useEffect(() => {
    setValue(status);
  }, [status]);

  const unchanged = value === status;
  return (
    <form
      className="commissions-status-control"
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged && !busy) onSubmit(value);
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        Status for {caseId}
      </label>
      <select
        id={id}
        name="status"
        className="studio-input studio-select commissions-status-control__select"
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (isCaseStatus(next)) setValue(next);
        }}
      >
        {CASE_STATUSES.map((option) => (
          <option key={option} value={option}>
            {CASE_STATUS_LABELS[option]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="studio-btn studio-btn--secondary studio-btn--compact"
        aria-disabled={unchanged || busy ? true : undefined}
        aria-busy={busy || undefined}
      >
        {busy ? "Updating…" : "Update"}
        <span className="visually-hidden"> status of {caseId}</span>
      </button>
    </form>
  );
}
