/**
 * One case: only the permanent fields (ID, submitted date in UTC, service,
 * locked price, status) plus the markers needed to act. No detail page and
 * no link to Google records (plan 06). Cell labels are visually hidden on
 * wide screens, where the column head names them, and show when rows stack.
 */
import type {
  CaseStatus,
  CommissionCaseRow,
  CommissionService,
} from "../../../lib/cms/schemas/commission";
import { CaseMarkerBadge, CaseStatusBadge } from "./case-status-badge";
import { CaseStatusControl } from "./case-status-control";
import {
  caseMarkers,
  formatCaseDate,
  formatCaseMoney,
  serviceName,
} from "./format";

function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`commissions-cell ${className}`}>
      <span className="commissions-cell__label">{label}</span>
      {children}
    </div>
  );
}

export function ServiceNameText({
  services,
  serviceId,
}: {
  services: readonly CommissionService[];
  serviceId: CommissionCaseRow["serviceId"];
}) {
  const name = serviceName(services, serviceId);
  return (
    <span className="commissions-service">
      <span lang={name.primaryLang}>{name.primary}</span>
      {name.secondary ? (
        <span className="commissions-service__secondary" lang="en">
          {name.secondary}
        </span>
      ) : null}
    </span>
  );
}

export function CaseIdText({ caseId }: { caseId: string }) {
  return (
    <span className="commissions-id" translate="no">
      {caseId}
    </span>
  );
}

export function CaseRow({
  row,
  services,
  now,
  busy,
  onStatus,
}: {
  row: CommissionCaseRow;
  services: readonly CommissionService[];
  now: string;
  busy: boolean;
  onStatus: (caseId: string, status: CaseStatus) => void;
}) {
  const markers = caseMarkers(row, now);
  return (
    <li className="commissions-row" aria-label={`Case ${row.caseId}`}>
      <Cell label="Case ID" className="commissions-cell--id">
        <CaseIdText caseId={row.caseId} />
      </Cell>
      <Cell label="Submitted (UTC)" className="commissions-cell--date">
        <time className="commissions-mono" dateTime={row.submittedAt}>
          {formatCaseDate(row.submittedAt)}
        </time>
      </Cell>
      <Cell label="Service" className="commissions-cell--service">
        <ServiceNameText services={services} serviceId={row.serviceId} />
      </Cell>
      <Cell label="Locked price" className="commissions-cell--price">
        <span className="commissions-mono">
          {formatCaseMoney(row.lockedPriceMinor, row.currency)}
        </span>
      </Cell>
      <Cell label="Status" className="commissions-cell--status">
        <span className="commissions-badges">
          <CaseStatusBadge status={row.status} />
          {markers.map((marker) => (
            <CaseMarkerBadge key={marker.kind} marker={marker} />
          ))}
        </span>
      </Cell>
      <div className="commissions-cell commissions-cell--control">
        <CaseStatusControl
          caseId={row.caseId}
          status={row.status}
          busy={busy}
          onSubmit={(status) => onStatus(row.caseId, status)}
        />
      </div>
    </li>
  );
}
