/**
 * `/studio/projects` (admin-architecture §4.3, §4.12): homepage order,
 * URL-driven filters, ruled rows that open the editor, a `⋯` menu per row
 * and explicit ordering in manual mode. Reversible actions happen at once
 * and offer Undo; nothing on this page deletes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { StudioPage } from "../shell/studio-page";
import {
  EmptyState,
  EntryRow,
  FilterBar,
  type Flag,
  OrderControls,
  RowList,
  Select,
  useKeyboardReorder,
  useToast,
} from "../ui";
import { FeaturedStrip, withHighlight } from "./featured-strip";
import { hasActiveFilters, relativeTime } from "./project-list";
import { RowMenu } from "./row-menu";
import type {
  ProjectActionData,
  ProjectsListData,
  StudioProjectRow,
} from "./types";
import { type SentFields, useProjectSubmit } from "./use-project-submit";

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function rowFlags(row: StudioProjectRow): Flag[] {
  const flags: Flag[] = [];
  if (row.hasUnpublishedChanges) flags.push("CHANGES");
  if (row.todoContent) flags.push("TODO_CONTENT");
  if (row.featured) flags.push("FEATURED");
  return flags;
}

function rowMeta(
  row: StudioProjectRow,
  labels: ProjectsListData["categoryLabels"],
): string {
  const parts: string[] = [];
  if (row.year) parts.push(String(row.year));
  const primary = row.primaryCategoryId
    ? labels[row.primaryCategoryId]?.en
    : null;
  if (primary) {
    const others = row.categoryIds.filter(
      (id) => id !== row.primaryCategoryId,
    ).length;
    parts.push(others ? `${primary} +${others}` : primary);
  }
  if (!row.listed) parts.push("unlisted");
  return parts.join(" · ") || "No year or category";
}

const label = (row: { label: string }) => row.label || "Untitled";

/** Toast copy for a finished row action (and its Undo). */
function useRowFeedback(
  submitRef: { current: (fields: SentFields) => void },
  rowsById: Map<string, StudioProjectRow>,
) {
  const toast = useToast();
  const navigate = useNavigate();
  return useCallback(
    (data: ProjectActionData, sent: SentFields) => {
      const name = label(rowsById.get(sent.id ?? "") ?? { label: "" });
      if (!data.ok) {
        toast.show({
          tone: "error",
          message: data.message ?? "The action could not be completed.",
        });
        return;
      }
      const undo = (fields: SentFields) => ({
        label: "Undo",
        onAction: () => submitRef.current(fields),
      });
      switch (sent.intent) {
        case "feature":
          toast.show({
            message: `Featured “${name}” on the homepage`,
            action: undo({ intent: "unfeature", id: sent.id ?? "" }),
          });
          break;
        case "unfeature":
          toast.show({
            message: `Removed “${name}” from the homepage`,
            action: undo({ intent: "feature", id: sent.id ?? "" }),
          });
          break;
        case "archive":
          toast.show({
            message: `Archived “${name}”`,
            action: undo({
              intent: "restore",
              id: sent.id ?? "",
              republish: data.wasPublished ? "1" : "0",
            }),
          });
          break;
        case "restore":
          toast.show({
            message:
              data.status === "published"
                ? `Restored and published “${name}”`
                : data.republished === false
                  ? `Restored “${name}” as a draft; publishing needs fixes`
                  : `Restored “${name}” to draft`,
          });
          break;
        case "duplicate":
          toast.show({
            message: `Duplicated “${name}” as a draft`,
            action: {
              label: "Open copy",
              onAction: () => navigate(`/studio/projects/${data.id}`),
            },
          });
          break;
        default:
          break;
      }
    },
    [toast, navigate, rowsById, submitRef],
  );
}

export function ProjectsListView({ data }: { data: ProjectsListData }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [listEpoch, setListEpoch] = useState(0);
  const filtered = hasActiveFilters(data.query);
  const rowsById = useMemo(
    () => new Map([...data.rows, ...data.featured].map((row) => [row.id, row])),
    [data.rows, data.featured],
  );

  // Row actions and their Undo share one fetcher.
  const submitRef = useRef<(fields: SentFields) => void>(() => {});
  const feedback = useRowFeedback(submitRef, rowsById);
  const rowAction = useProjectSubmit(feedback);
  submitRef.current = rowAction.submit;

  const orderAction = useProjectSubmit((result) => {
    if (result.ok) {
      toast.show({ message: "Order saved" });
    } else {
      toast.show({
        tone: "error",
        message: result.message ?? "The order was not saved. Try again.",
      });
      setListEpoch((epoch) => epoch + 1);
    }
  });

  // `n` starts a new project (single-key shortcuts ignore text fields).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented ||
        isTyping(event.target)
      ) {
        return;
      }
      event.preventDefault();
      navigate("/studio/projects/new");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const count = data.rows.length;
  const submitOnChange = (event: React.ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();

  return (
    <StudioPage
      title="Projects"
      status={
        <span className="projects-count">
          {count} {filtered ? "found" : count === 1 ? "project" : "projects"}
        </span>
      }
      actions={
        <Link
          className="studio-btn studio-btn--primary"
          to="/studio/projects/new"
        >
          New project
        </Link>
      }
    >
      <FeaturedStrip
        key={`home-${listEpoch}`}
        rows={data.featured}
        limit={data.featuredLimit}
        busy={orderAction.busy}
        onReorder={(ids) =>
          orderAction.submit({
            intent: "reorder",
            field: "featured_order",
            ids: JSON.stringify(ids),
          })
        }
        onRemove={(row) =>
          rowAction.submit({ intent: "unfeature", id: row.id })
        }
      />

      <FilterBar
        key={JSON.stringify(data.query)}
        q={data.query.q}
        status={data.query.status}
        label="Filter projects"
      >
        <Select
          name="category"
          label="Category"
          placeholder="All"
          defaultValue={data.query.categoryId ?? ""}
          options={data.facets.categories.map((term) => ({
            value: term.id,
            label: term.label.en,
          }))}
          onChange={submitOnChange}
        />
        <Select
          name="year"
          label="Year"
          placeholder="All"
          defaultValue={data.query.year ? String(data.query.year) : ""}
          options={data.facets.years.map((year) => ({
            value: String(year),
            label: String(year),
          }))}
          onChange={submitOnChange}
        />
        <Select
          name="featured"
          label="Homepage"
          placeholder="Any"
          defaultValue={
            data.query.featured === null ? "" : data.query.featured ? "1" : "0"
          }
          options={[
            { value: "1", label: "Featured" },
            { value: "0", label: "Not featured" },
          ]}
          onChange={submitOnChange}
        />
        <Select
          name="sort"
          label="Sort"
          defaultValue={data.query.sort}
          options={[
            { value: "order", label: "Manual order" },
            { value: "updated", label: "Last updated" },
            { value: "year", label: "Year" },
          ]}
          onChange={submitOnChange}
        />
      </FilterBar>

      {!data.manualOrder && data.rows.length > 1 ? (
        <p className="projects-order-hint">
          {filtered ? (
            <>
              Reordering needs the full list in manual order.{" "}
              <Link className="studio-link" to="/studio/projects">
                Clear filters
              </Link>
            </>
          ) : (
            "Switch Sort to Manual order to reorder projects."
          )}
        </p>
      ) : null}

      <ProjectRows
        key={`rows-${listEpoch}`}
        data={data}
        filtered={filtered}
        onRowAction={rowAction.submit}
        onReorder={(ids) =>
          orderAction.submit({
            intent: "reorder",
            field: "sort_order",
            ids: JSON.stringify(ids),
          })
        }
      />
    </StudioPage>
  );
}

function ProjectRows({
  data,
  filtered,
  onRowAction,
  onReorder,
}: {
  data: ProjectsListData;
  filtered: boolean;
  onRowAction: (fields: SentFields) => void;
  onReorder: (ids: string[]) => void;
}) {
  const byId = useMemo(
    () => new Map(data.rows.map((row) => [row.id, row])),
    [data.rows],
  );
  const labelOf = useCallback(
    (id: string) => label(byId.get(id) ?? { label: "" }),
    [byId],
  );
  const reorder = useKeyboardReorder({
    ids: data.rows.map((row) => row.id),
    labelOf,
    onCommit: onReorder,
  });
  const [moved, setMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!moved) return;
    const timer = window.setTimeout(() => setMoved(null), 700);
    return () => window.clearTimeout(timer);
  }, [moved]);

  const manual = data.manualOrder;
  const rows = manual
    ? reorder.order
        .map((id) => byId.get(id))
        .filter((row): row is StudioProjectRow => Boolean(row))
    : data.rows;

  const empty = filtered ? (
    <EmptyState
      title={
        data.query.q
          ? `No results for “${data.query.q}”`
          : "No projects match these filters"
      }
      body="Try another search, or show every active project."
      action={
        <Link
          className="studio-btn studio-btn--secondary"
          to="/studio/projects"
        >
          Clear filters
        </Link>
      }
    />
  ) : (
    <EmptyState
      title="No projects yet"
      body="Start with a title; everything else can wait. Drafts are never public."
      action={
        <Link
          className="studio-btn studio-btn--primary"
          to="/studio/projects/new"
        >
          New project
        </Link>
      }
    />
  );

  return (
    <>
      <RowList
        label="Projects"
        rows={rows}
        empty={empty}
        head={
          <>
            <span>Title</span>
            <span className="projects-rows__head-meta">
              Status · Year · Category · Updated
            </span>
          </>
        }
        renderRow={(row, index) => (
          <EntryRow
            key={row.id}
            href={`/studio/projects/${row.id}`}
            title={row.label}
            secondary={row.secondary ?? undefined}
            status={row.status}
            flags={rowFlags(row)}
            meta={rowMeta(row, data.categoryLabels)}
            updated={relativeTime(row.updatedAt, data.now)}
            highlighted={moved === row.id}
            handle={
              manual ? (
                <OrderControls
                  label={label(row)}
                  index={index}
                  total={rows.length}
                  picked={reorder.picked === row.id}
                  onMove={(delta) => {
                    setMoved(row.id);
                    reorder.move(row.id, delta);
                  }}
                  handleProps={withHighlight(reorder.handleProps(row.id), () =>
                    setMoved(row.id),
                  )}
                />
              ) : undefined
            }
            menu={
              <RowMenu label={label(row)}>
                <Link
                  className="projects-menu__item"
                  to={`/studio/projects/${row.id}`}
                >
                  Edit
                </Link>
                <a
                  className="projects-menu__item"
                  href={`/studio/preview/projects/${row.id}?locale=zh`}
                  target="_blank"
                  rel="noopener"
                >
                  Preview
                </a>
                <button
                  type="button"
                  className="projects-menu__item"
                  onClick={() =>
                    onRowAction({ intent: "duplicate", id: row.id })
                  }
                >
                  Duplicate
                </button>
                {row.status !== "archived" ? (
                  <button
                    type="button"
                    className="projects-menu__item"
                    onClick={() =>
                      onRowAction({
                        intent: row.featured ? "unfeature" : "feature",
                        id: row.id,
                      })
                    }
                  >
                    {row.featured
                      ? "Remove from homepage"
                      : "Feature on homepage"}
                  </button>
                ) : null}
                {row.status === "archived" ? (
                  <button
                    type="button"
                    className="projects-menu__item"
                    onClick={() =>
                      onRowAction({ intent: "restore", id: row.id })
                    }
                  >
                    Restore to draft
                  </button>
                ) : (
                  <button
                    type="button"
                    className="projects-menu__item"
                    onClick={() =>
                      onRowAction({ intent: "archive", id: row.id })
                    }
                  >
                    Archive
                  </button>
                )}
                {manual && rows.length > 1 ? (
                  <MoveToPosition
                    total={rows.length}
                    current={index}
                    onMove={(target) => {
                      setMoved(row.id);
                      reorder.move(row.id, target - index);
                    }}
                  />
                ) : null}
              </RowMenu>
            }
          />
        )}
      />
      <p className="visually-hidden" aria-live="assertive">
        {reorder.announcement}
      </p>
    </>
  );
}

/** "Move to position…" inside the row menu (manual order only). */
function MoveToPosition({
  total,
  current,
  onMove,
}: {
  total: number;
  current: number;
  onMove: (index: number) => void;
}) {
  const [value, setValue] = useState(String(current + 1));
  const target = Number(value);
  const valid = Number.isInteger(target) && target >= 1 && target <= total;
  return (
    <div className="projects-menu__move">
      <label className="projects-menu__move-label">
        Move to position
        <input
          className="studio-input projects-menu__move-input"
          type="number"
          inputMode="numeric"
          min={1}
          max={total}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && valid) {
              event.preventDefault();
              onMove(target - 1);
            }
          }}
        />
      </label>
      <button
        type="button"
        className="studio-btn studio-btn--secondary studio-btn--compact projects-menu__item"
        disabled={!valid || target === current + 1}
        onClick={() => onMove(target - 1)}
      >
        Move
      </button>
    </div>
  );
}
