/**
 * Recognition list (admin-architecture §4.3): filters year and type, status,
 * search in both locales; rows grouped in a year rail in public order
 * (year → date → manual order), with order controls where manual order
 * decides the public position.
 */
import { Link } from "react-router";
import { studioLabel } from "../../../lib/cms/localized";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type { EntryStatus, LocalizedText } from "../../../lib/cms/types";
import { StudioPage } from "../shell/studio-page";
import {
  EmptyState,
  EntryRow,
  FilterBar,
  type Flag,
  SegmentedControl,
  Select,
  type StatusFilter,
} from "../ui";
import { groupByYear, relativeTime } from "./kit/editorial";
import {
  NewEntryLink,
  RowMenu,
  submitFilters,
  TieOrderedRows,
  useListActions,
  YearRail,
} from "./kit/list-kit";
import { recognitionTieKey } from "./recognition-form";

export type RecognitionListRow = {
  id: string;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  hasUnpublishedChanges: boolean;
  event: LocalizedText;
  organization: LocalizedText;
  result: LocalizedText;
  year: number | null;
  date: string | null;
  typeTermId: string | null;
  updatedAt: string;
};

export type RecognitionListProps = {
  rows: readonly RecognitionListRow[];
  facets: { years: readonly number[]; types: readonly Term[] };
  filters: {
    q: string;
    status: StatusFilter;
    year: number | null;
    typeTermId: string | null;
    sort: "public" | "updated";
  };
  now: string;
};

const BASE = "/studio/recognition";

function secondary(text: LocalizedText): string | undefined {
  const zh = text.zh.trim();
  const en = text.en.trim();
  return zh && en && zh !== en ? en : undefined;
}

export function RecognitionList({
  rows,
  facets,
  filters,
  now,
}: RecognitionListProps) {
  const actions = useListActions({ editorBase: BASE });
  const typeLabel = new Map(
    facets.types.map((term) => [term.id, term.label.en || term.label.zh]),
  );
  const filtered =
    Boolean(filters.q) ||
    filters.status !== "active" ||
    filters.year !== null ||
    filters.typeTermId !== null;
  const reorderable = filters.sort === "public" && !filtered;
  const nowDate = new Date(now);

  const renderRow = (row: RecognitionListRow, handle: React.ReactNode) => {
    const title = studioLabel(row.event, "");
    const label = title || "Untitled";
    const flags: Flag[] = [];
    if (row.featured) flags.push("FEATURED");
    if (row.hasUnpublishedChanges) flags.push("CHANGES");
    if (row.todoContent) flags.push("TODO_CONTENT");
    const meta = [
      row.typeTermId ? typeLabel.get(row.typeTermId) : "No type",
      row.date ?? (filters.sort === "updated" ? row.year : null),
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <EntryRow
        key={row.id}
        href={`${BASE}/${row.id}`}
        title={title}
        secondary={secondary(row.event)}
        status={row.status}
        flags={flags}
        meta={meta}
        updated={relativeTime(row.updatedAt, nowDate)}
        handle={handle ?? undefined}
        menu={
          <RowMenu
            label={label}
            items={[
              { label: "Edit", href: `${BASE}/${row.id}` },
              {
                label: "Preview",
                href: `/studio/preview/recognition/${row.id}?locale=zh`,
                newTab: true,
              },
              {
                label: "Duplicate",
                onSelect: () => actions.submit("duplicate", { id: row.id }),
              },
              ...(row.status === "archived"
                ? [
                    {
                      label: "Restore to draft",
                      onSelect: () => actions.submit("restore", { id: row.id }),
                    },
                  ]
                : [
                    {
                      label: row.featured
                        ? "Remove from homepage"
                        : "Feature on homepage",
                      onSelect: () =>
                        actions.submit(row.featured ? "unfeature" : "feature", {
                          id: row.id,
                        }),
                    },
                    {
                      label: "Archive",
                      onSelect: () => actions.submit("archive", { id: row.id }),
                    },
                  ]),
            ]}
          />
        }
      />
    );
  };

  const list = (items: readonly RecognitionListRow[], label: string) => (
    <TieOrderedRows
      label={label}
      rows={items}
      reorderable={reorderable}
      tieKeyOf={recognitionTieKey}
      idOf={(row) => row.id}
      labelOf={(row) => studioLabel(row.event)}
      onCommit={(ids) =>
        actions.submit("reorder", { ids: JSON.stringify(ids) })
      }
      renderRow={renderRow}
      resetKey={actions.failures}
    />
  );

  return (
    <StudioPage
      title="Recognition"
      actions={<NewEntryLink href={`${BASE}/new`} label="New recognition" />}
    >
      <FilterBar
        q={filters.q}
        status={filters.status}
        label="Filter recognition"
      >
        <Select
          name="year"
          label="Year"
          placeholder="All years"
          defaultValue={filters.year ? String(filters.year) : ""}
          options={facets.years.map((year) => ({
            value: String(year),
            label: String(year),
          }))}
          onChange={submitFilters}
        />
        <Select
          name="type"
          label="Type"
          placeholder="All types"
          defaultValue={filters.typeTermId ?? ""}
          options={facets.types.map((term) => ({
            value: term.id,
            label: term.label.en || term.label.zh,
          }))}
          onChange={submitFilters}
        />
        <SegmentedControl
          name="sort"
          legend="Sort"
          defaultValue={filters.sort}
          options={[
            { value: "public", label: "Public order" },
            { value: "updated", label: "Last updated" },
          ]}
          onChange={submitFilters}
        />
      </FilterBar>

      <p className="p3-count" aria-live="polite">
        <span className="p3-count__n">
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </span>
        {reorderable && rows.length > 1 ? (
          <span>
            Newest year first. Entries that share a year and date can be
            reordered.
          </span>
        ) : null}
      </p>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title={
              filters.q
                ? `No results for “${filters.q}”`
                : "Nothing matches these filters"
            }
            action={
              <Link className="studio-link" to={BASE}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No recognition yet"
            body="Awards, publications, talks, events, competitions and research each get an entry here. Drafts stay private until you publish them."
            action={
              <Link
                className="studio-btn studio-btn--primary"
                to={`${BASE}/new`}
              >
                New recognition
              </Link>
            }
          />
        )
      ) : filters.sort === "updated" ? (
        <div className="studio-rows">
          {list(rows, "Recognition, last updated first")}
        </div>
      ) : (
        groupByYear(rows, (row) => row.year).map((group) => (
          <YearRail
            key={group.year ?? "none"}
            year={group.year}
            count={group.rows.length}
          >
            {list(group.rows, `Recognition ${group.year ?? "without a year"}`)}
          </YearRail>
        ))
      )}
    </StudioPage>
  );
}
