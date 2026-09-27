/**
 * Writing list (admin-architecture §4.3): filters platform, status and
 * category, search in both locales; rows in a year rail in public order
 * (date → manual order). Each row says whether it is an article page or a
 * card that links out.
 */
import { Link } from "react-router";
import { studioLabel } from "../../../lib/cms/localized";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type { WritingPlatform } from "../../../lib/cms/schemas/writing";
import type { EntryStatus, LocalizedText } from "../../../lib/cms/types";
import { groupByYear, relativeTime } from "../recognition/kit/editorial";
import {
  NewEntryLink,
  RowMenu,
  submitFilters,
  TieOrderedRows,
  useListActions,
  YearRail,
} from "../recognition/kit/list-kit";
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
import {
  PLATFORM_OPTIONS,
  platformDisplay,
  writingRoute,
  writingTieKey,
} from "./writing-form";

export type WritingListRow = {
  id: string;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  hasUnpublishedChanges: boolean;
  listed: boolean;
  title: LocalizedText;
  slug: string;
  date: string | null;
  platform: WritingPlatform;
  platformLabel: string | null;
  categoryTermId: string | null;
  externalUrl: string | null;
  hasContent: { zh: boolean; en: boolean };
  updatedAt: string;
};

export type WritingListProps = {
  rows: readonly WritingListRow[];
  facets: { categories: readonly Term[] };
  filters: {
    q: string;
    platform: WritingPlatform | null;
    categoryTermId: string | null;
    status: StatusFilter;
    sort: "public" | "updated";
  };
  now: string;
};

const BASE = "/studio/writing";

function secondary(text: LocalizedText): string | undefined {
  const zh = text.zh.trim();
  const en = text.en.trim();
  return zh && en && zh !== en ? en : undefined;
}

function yearOf(date: string | null): number | null {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function routeLabel(row: WritingListRow): string {
  const route = writingRoute(row);
  if (route.kind === "article") return "Article";
  if (route.kind === "link") return "Links out ↗";
  return "Link missing";
}

export function WritingList({ rows, facets, filters, now }: WritingListProps) {
  const actions = useListActions({ editorBase: BASE });
  const categoryLabel = new Map(
    facets.categories.map((term) => [term.id, term.label.en || term.label.zh]),
  );
  const filtered =
    Boolean(filters.q) ||
    filters.status !== "active" ||
    filters.platform !== null ||
    filters.categoryTermId !== null;
  const reorderable = filters.sort === "public" && !filtered;
  const nowDate = new Date(now);

  const renderRow = (row: WritingListRow, handle: React.ReactNode) => {
    const title = studioLabel(row.title, "");
    const label = title || "Untitled";
    const flags: Flag[] = [];
    if (row.featured) flags.push("FEATURED");
    if (row.hasUnpublishedChanges) flags.push("CHANGES");
    if (row.todoContent) flags.push("TODO_CONTENT");
    const meta = [
      row.date ? row.date.replaceAll("-", ".") : "No date",
      platformDisplay(row.platform, row.platformLabel),
      routeLabel(row),
      row.categoryTermId ? categoryLabel.get(row.categoryTermId) : null,
      row.listed ? null : "Unlisted",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <EntryRow
        key={row.id}
        href={`${BASE}/${row.id}`}
        title={title}
        secondary={secondary(row.title)}
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
                href: `/studio/preview/writing/${row.id}?locale=zh`,
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

  const list = (items: readonly WritingListRow[], label: string) => (
    <TieOrderedRows
      label={label}
      rows={items}
      reorderable={reorderable}
      tieKeyOf={writingTieKey}
      idOf={(row) => row.id}
      labelOf={(row) => studioLabel(row.title)}
      onCommit={(ids) =>
        actions.submit("reorder", { ids: JSON.stringify(ids) })
      }
      renderRow={renderRow}
      resetKey={actions.failures}
    />
  );

  return (
    <StudioPage
      title="Writing"
      actions={<NewEntryLink href={`${BASE}/new`} label="New writing" />}
    >
      <FilterBar q={filters.q} status={filters.status} label="Filter writing">
        <Select
          name="platform"
          label="Platform"
          placeholder="All platforms"
          defaultValue={filters.platform ?? ""}
          options={PLATFORM_OPTIONS}
          onChange={submitFilters}
        />
        <Select
          name="category"
          label="Category"
          placeholder="All categories"
          defaultValue={filters.categoryTermId ?? ""}
          options={facets.categories.map((term) => ({
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
          <span>Newest first. Entries on the same date can be reordered.</span>
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
            title="No writing yet"
            body="Write an article here, or add a card that links to a post on Threads, Instagram, Medium or Devpost. Drafts stay private until you publish them."
            action={
              <Link
                className="studio-btn studio-btn--primary"
                to={`${BASE}/new`}
              >
                New writing
              </Link>
            }
          />
        )
      ) : filters.sort === "updated" ? (
        <div className="studio-rows">
          {list(rows, "Writing, last updated first")}
        </div>
      ) : (
        groupByYear(rows, (row) => yearOf(row.date)).map((group) => (
          <YearRail
            key={group.year ?? "none"}
            year={group.year}
            count={group.rows.length}
            emptyLabel="No date"
          >
            {list(group.rows, `Writing ${group.year ?? "without a date"}`)}
          </YearRail>
        ))
      )}
    </StudioPage>
  );
}
