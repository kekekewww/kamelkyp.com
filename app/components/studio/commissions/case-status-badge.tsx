/**
 * Case status and marker badges (admin-architecture §5.8 badge geometry).
 * The word is always present: status is never shown by colour alone.
 */
import {
  CASE_STATUS_LABELS,
  type CaseStatus,
} from "../../../lib/cms/schemas/commission";
import type { CaseMarker } from "./format";

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`studio-badge commissions-status commissions-status--${status.replaceAll("_", "-")}`}
    >
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}

const MARKER_TITLE: Record<CaseMarker["kind"], string> = {
  student: "A student price is waiting for your decision",
  "cleanup-due": "Delete the Google and Gmail records, then confirm",
  "cleanup-scheduled": "Date the temporary records can be cleaned up (UTC)",
  cleaned: "Temporary records removed; the permanent record stays",
};

export function CaseMarkerBadge({ marker }: { marker: CaseMarker }) {
  return (
    <span
      className={`studio-badge commissions-marker commissions-marker--${marker.kind}`}
      title={MARKER_TITLE[marker.kind]}
    >
      {marker.label}
    </span>
  );
}
