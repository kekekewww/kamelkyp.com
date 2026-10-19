/**
 * Cases, newest first: status and service filters (GET, legacy parameter
 * names), the rows, and cursor pagination. The filter form carries no
 * cursor, so changing a filter always returns to the newest page.
 */
import { useEffect, useRef, useState } from "react";
import { Form, Link } from "react-router";
import {
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  type CaseStatus,
  type CommissionsModel,
  commissionQueryHref,
} from "../../../lib/cms/schemas/commission";
import { EmptyState, RowList, Select } from "../ui";
import { CaseRow } from "./case-row";
import { serviceOptionLabel } from "./format";

export const CASES_HEADING_ID = "commission-cases-heading";

const PHONE = "(max-width: 767px)";

function Filters({ data }: { data: CommissionsModel }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { query } = data;
  const active = [query.status, query.service].filter(Boolean).length;
  // Controlled, so a navigation updates the same selects instead of
  // replacing them: the one in use keeps focus.
  const [status, setStatus] = useState(query.status ?? "");
  const [service, setService] = useState(query.service ?? "");
  useEffect(() => {
    setStatus(query.status ?? "");
  }, [query.status]);
  useEffect(() => {
    setService(query.service ?? "");
  }, [query.service]);

  // Open on wide screens; folded into a disclosure on phones.
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const media = window.matchMedia(PHONE);
    const apply = () => {
      details.open = !media.matches;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const submitOnChange =
    (set: (value: string) => void) =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      set(event.currentTarget.value);
      event.currentTarget.form?.requestSubmit();
    };

  return (
    <details className="commissions-filters" ref={ref} open>
      <summary className="commissions-filters__toggle">
        {active ? `Filters · ${active}` : "Filters"}
      </summary>
      <Form
        method="get"
        action="/studio/commissions"
        role="search"
        aria-label="Filter cases"
        className="commissions-filters__form"
        preventScrollReset
      >
        <Select
          name="status"
          label="Status"
          placeholder="All"
          value={status}
          options={CASE_STATUSES.map((option) => ({
            value: option,
            label: CASE_STATUS_LABELS[option],
          }))}
          onChange={submitOnChange(setStatus)}
        />
        <Select
          name="service"
          label="Service"
          placeholder="All"
          value={service}
          options={data.services.map((option) => ({
            value: option.id,
            label: serviceOptionLabel(option),
          }))}
          onChange={submitOnChange(setService)}
        />
        <button
          type="submit"
          className="studio-btn studio-btn--ghost studio-btn--compact"
        >
          Apply
        </button>
        {active ? (
          <Link className="studio-link" to="/studio/commissions">
            Clear filters
          </Link>
        ) : null}
      </Form>
    </details>
  );
}

export function CaseList({
  data,
  busyCaseIds,
  onStatus,
  headingRef,
}: {
  data: CommissionsModel;
  /** Cases whose status change is in flight or waiting. */
  busyCaseIds: ReadonlySet<string>;
  onStatus: (caseId: string, status: CaseStatus) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const { query } = data;
  const filtered = Boolean(query.status || query.service);

  const empty = filtered ? (
    <EmptyState
      title="No cases match these filters"
      body="Try another status or service, or show every case."
      action={
        <Link
          className="studio-btn studio-btn--secondary"
          to="/studio/commissions"
        >
          Clear filters
        </Link>
      }
    />
  ) : (
    <EmptyState
      title="No commissions yet"
      body="Cases appear here when someone submits the commission form."
    />
  );

  return (
    <section className="commissions-cases" aria-labelledby={CASES_HEADING_ID}>
      <h2
        className="commissions-heading"
        id={CASES_HEADING_ID}
        tabIndex={-1}
        ref={headingRef}
      >
        Cases
      </h2>
      <Filters data={data} />
      {data.cursorRejected ? (
        <p className="commissions-notice" role="status">
          That page link is no longer valid. Showing the newest cases.
        </p>
      ) : null}
      <RowList
        label="Cases"
        rows={data.cases}
        empty={empty}
        head={
          <>
            <span>Case ID</span>
            <span>Submitted (UTC)</span>
            <span>Service</span>
            <span>Locked price</span>
            <span>Status</span>
          </>
        }
        renderRow={(row) => (
          <CaseRow
            key={row.caseId}
            row={row}
            services={data.services}
            now={data.now}
            busy={busyCaseIds.has(row.caseId)}
            onStatus={onStatus}
          />
        )}
      />
      {query.cursor || data.nextCursor ? (
        <nav className="commissions-pages" aria-label="Case pages">
          {query.cursor ? (
            <Link
              className="studio-btn studio-btn--secondary studio-btn--compact"
              to={commissionQueryHref({
                status: query.status,
                service: query.service,
              })}
            >
              Newest cases
            </Link>
          ) : null}
          {data.nextCursor ? (
            <Link
              className="studio-btn studio-btn--secondary studio-btn--compact"
              to={commissionQueryHref({ ...query, cursor: data.nextCursor })}
            >
              Older cases
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
