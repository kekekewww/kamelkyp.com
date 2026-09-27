/**
 * Services list (admin-architecture §4.3, §4.12): grouped by service group,
 * filters in the URL (search, status, group), live prices for commission
 * services, explicit order controls in manual order (no filters), and a row
 * menu for placement and status. `n` opens "New service".
 */
import { useCallback, useEffect, useMemo } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import type {
  ServiceStatusFilter,
  StudioServiceRow,
} from "../../../lib/cms/repositories/services.server";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import { relativeTime } from "../home/format";
import { type ActionData, useActionToasts } from "../settings/form-kit";
import { StudioPage } from "../shell/studio-page";
import {
  EmptyState,
  EntryRow,
  FilterBar,
  type Flag,
  OrderControls,
  RowList,
  useKeyboardReorder,
  useStudioSession,
} from "../ui";
import { groupServices } from "./grouping";
import { servicePriceLabel } from "./price";

type Filters = {
  q: string;
  status: ServiceStatusFilter;
  groupTermId: string;
};

function termLabel(term: Term) {
  return term.label.zh === term.label.en
    ? term.label.en
    : `${term.label.en} · ${term.label.zh}`;
}

function flagsOf(row: StudioServiceRow): Flag[] {
  const flags: Flag[] = [];
  if (row.hasUnpublishedChanges) flags.push("CHANGES");
  if (row.todoContent) flags.push("TODO_CONTENT");
  if (row.featured) flags.push("FEATURED");
  return flags;
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

type Submit = (fields: Record<string, string>) => void;

function RowMenu({ row, submit }: { row: StudioServiceRow; submit: Submit }) {
  const linked = Boolean(row.commissionServiceId);
  const name = row.name.en || row.name.zh || "service";
  const act = (intent: string) => () => submit({ intent, id: row.id });
  return (
    <details
      className="studio-rowmenu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className="studio-rowmenu__button"
        aria-label={`Actions for ${name}`}
      >
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="studio-rowmenu__panel">
        <Link
          className="studio-rowmenu__item"
          to={`/studio/services/${row.id}`}
        >
          Edit
        </Link>
        <a
          className="studio-rowmenu__item"
          href={`/studio/preview/services/${row.id}?locale=zh`}
          target="_blank"
          rel="noopener"
        >
          Preview
        </a>
        {row.status !== "archived" ? (
          <>
            <button
              type="button"
              className="studio-rowmenu__item"
              onClick={act("duplicate")}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="studio-rowmenu__item"
              onClick={act(row.featured ? "unfeature" : "feature")}
            >
              {row.featured
                ? "Remove homepage highlight"
                : "Highlight on homepage"}
            </button>
          </>
        ) : null}
        {row.status === "archived" ? (
          <button
            type="button"
            className="studio-rowmenu__item"
            onClick={act("restore")}
          >
            Restore to draft
          </button>
        ) : !linked ? (
          <button
            type="button"
            className="studio-rowmenu__item"
            onClick={act("archive")}
          >
            Archive
          </button>
        ) : null}
      </div>
    </details>
  );
}

function ServiceRowItem({
  row,
  now,
  submit,
  handle,
}: {
  row: StudioServiceRow;
  now: string;
  submit: Submit;
  handle?: React.ReactNode;
}) {
  const zh = row.name.zh.trim();
  const en = row.name.en.trim();
  return (
    <EntryRow
      href={`/studio/services/${row.id}`}
      title={zh || en}
      secondary={zh && en && zh !== en ? en : undefined}
      status={row.status}
      flags={flagsOf(row)}
      meta={
        <span className="studio-service-row__meta">
          <span className="studio-service-row__price">
            {servicePriceLabel(row)}
          </span>
          {row.commissionServiceId ? (
            <span className="studio-service-row__tag">Commission</span>
          ) : null}
        </span>
      }
      updated={relativeTime(row.updatedAt, now)}
      handle={handle}
      menu={<RowMenu row={row} submit={submit} />}
    />
  );
}

function GroupBlock({
  term,
  rows,
  now,
  manual,
  submit,
}: {
  term: Term | null;
  rows: StudioServiceRow[];
  now: string;
  manual: boolean;
  submit: Submit;
}) {
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const byId = useMemo(
    () => new Map(rows.map((row) => [row.id, row] as const)),
    [rows],
  );
  const labelOf = useCallback(
    (id: string) => {
      const row = byId.get(id);
      return row?.name.en || row?.name.zh || "service";
    },
    [byId],
  );
  const onCommit = useCallback(
    (order: string[]) =>
      submit({ intent: "reorder", ids: JSON.stringify(order) }),
    [submit],
  );
  const reorder = useKeyboardReorder({ ids, labelOf, onCommit });
  const ordered = reorder.order
    .map((id) => byId.get(id))
    .filter((row): row is StudioServiceRow => Boolean(row));
  const heading = term ? termLabel(term) : "No group";
  const area = typeof term?.data.area === "string" ? term.data.area : null;

  return (
    <section className="studio-service-group" aria-label={heading}>
      <header className="studio-service-group__head">
        <h2 className="studio-service-group__title">{heading}</h2>
        <span className="studio-service-group__count">{rows.length}</span>
        {area ? (
          <span className="studio-service-group__area">
            {area === "software"
              ? "Listed on /services/software"
              : area === "mixing"
                ? "Listed on /mixing"
                : "Listed on /song-transition"}
          </span>
        ) : null}
        {term?.archivedAt ? (
          <span className="studio-service-group__area">Archived group</span>
        ) : null}
      </header>
      <RowList
        label={`${heading} services`}
        rows={ordered}
        empty={null}
        renderRow={(row, index) => (
          <ServiceRowItem
            key={row.id}
            row={row}
            now={now}
            submit={submit}
            handle={
              manual ? (
                <OrderControls
                  label={labelOf(row.id)}
                  index={index}
                  total={ordered.length}
                  picked={reorder.picked === row.id}
                  onMove={(delta) => reorder.move(row.id, delta)}
                  handleProps={reorder.handleProps(row.id)}
                />
              ) : undefined
            }
          />
        )}
      />
      <p className="visually-hidden" aria-live="assertive">
        {reorder.announcement}
      </p>
    </section>
  );
}

export function ServiceList({
  rows,
  groups,
  filters,
  now,
}: {
  rows: StudioServiceRow[];
  groups: Term[];
  filters: Filters;
  now: string;
}) {
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const { csrfToken } = useStudioSession();
  useActionToasts(fetcher);

  const submit = useCallback<Submit>(
    (fields) => fetcher.submit({ csrfToken, ...fields }, { method: "post" }),
    [fetcher, csrfToken],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        return;
      }
      event.preventDefault();
      navigate("/studio/services/new");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const filtered =
    Boolean(filters.q) ||
    filters.status !== "active" ||
    Boolean(filters.groupTermId);
  const blocks = groupServices(rows, groups);

  return (
    <StudioPage
      title="Services"
      status={
        <span className="studio-service-total">
          {rows.length} {rows.length === 1 ? "service" : "services"}
        </span>
      }
      actions={
        <>
          <Link
            className="studio-btn studio-btn--ghost studio-btn--compact"
            to="/studio/services/pricing"
          >
            Pricing
          </Link>
          <Link
            className="studio-btn studio-btn--primary studio-btn--compact"
            to="/studio/services/new"
            aria-keyshortcuts="n"
          >
            New service
          </Link>
        </>
      }
    >
      <FilterBar q={filters.q} status={filters.status} label="Filter services">
        <label className="studio-field">
          <span className="studio-field__label">Group</span>
          <select
            name="group"
            className="studio-input studio-select"
            defaultValue={filters.groupTermId}
          >
            <option value="">All groups</option>
            {groups.map((term) => (
              <option key={term.id} value={term.id}>
                {termLabel(term)}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="studio-hint studio-service-note">
        Commission prices come from Pricing and are shown here read-only.
        {filtered
          ? " Clear the filters to change the order."
          : " Use the handles to change the order within a group."}
      </p>
      {blocks.length === 0 ? (
        filtered ? (
          <EmptyState
            title={
              filters.q ? `No results for “${filters.q}”` : "No services match"
            }
            action={
              <Link className="studio-link" to="/studio/services">
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No services yet"
            body="Add a service with a name and a group; pricing can wait."
            action={
              <Link
                className="studio-btn studio-btn--primary studio-btn--compact"
                to="/studio/services/new"
              >
                New service
              </Link>
            }
          />
        )
      ) : (
        <div className="studio-service-groups">
          {blocks.map((block) => (
            <GroupBlock
              key={block.term?.id ?? "none"}
              term={block.term}
              rows={block.rows}
              now={now}
              manual={!filtered}
              submit={submit}
            />
          ))}
        </div>
      )}
    </StudioPage>
  );
}
