/**
 * Studio → Music list (brief §9, §25; admin-architecture §4.3, §4.12): the
 * homepage showreel slot, filters (search, status, artist, year, role,
 * featured, sort), ruled rows with flags and a row menu, and explicit order
 * controls (keyboard reorder) in manual order.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { studioLabel } from "../../../lib/cms/localized";
import { formatDuration } from "../../../lib/cms/media/summary";
import type {
  MusicListData,
  StudioMusicRow,
} from "../../../lib/cms/repositories/music.server";
import type { ActionResult } from "../../../lib/cms/studio/responses";
import type { LocalizedText } from "../../../lib/cms/types";
import { StudioPage } from "../shell/studio-page";
import { type Flag, StatusBadge } from "../ui/badges";
import {
  EmptyState,
  EntryRow,
  FilterBar,
  OrderControls,
  RowList,
  useKeyboardReorder,
} from "../ui/list";
import { useStudioSession } from "../ui/studio-session";
import { useToast } from "../ui/toast";

function label(text: LocalizedText): string {
  return text.en.trim() || text.zh.trim();
}

export function musicMeta(row: StudioMusicRow): string {
  return [
    label(row.artist),
    label(row.role),
    row.year ? String(row.year) : "",
    formatDuration(row.durationMs) ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function flagsOf(row: StudioMusicRow): Flag[] {
  const flags: Flag[] = [];
  if (row.isShowreel) flags.push("SHOWREEL");
  if (row.featured) flags.push("FEATURED");
  if (row.hasUnpublishedChanges) flags.push("CHANGES");
  if (row.todoContent) flags.push("TODO_CONTENT");
  return flags;
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  return new Date(then).toISOString().slice(0, 10);
}

type Submit = (fields: Record<string, string>) => void;

function useListActions() {
  const fetcher = useFetcher<ActionResult>();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const pending = useRef<string | null>(null);
  const submit: Submit = useCallback(
    (fields) => {
      pending.current = fields.intent ?? null;
      fetcher.submit({ ...fields, csrfToken }, { method: "post" });
    },
    [fetcher, csrfToken],
  );
  const previous = useRef(fetcher.state);
  useEffect(() => {
    if (previous.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data;
      if (result && !result.ok) {
        toast.show({ tone: "error", message: result.message });
      } else if (result?.ok) {
        const messages: Record<string, string> = {
          reorder: "Order saved",
          feature: "Featured on the homepage",
          unfeature: "Removed from the homepage",
          "set-showreel": "Homepage showreel set",
          "clear-showreel": "Homepage showreel cleared",
          archive: "Archived",
          restore: "Restored to draft",
          duplicate: "Duplicated as a draft",
        };
        const message = messages[pending.current ?? ""];
        if (message) toast.show({ message });
      }
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, toast]);
  return { submit, busy: fetcher.state !== "idle" };
}

function ShowreelSlot({
  showreel,
  submit,
}: {
  showreel: MusicListData["showreel"];
  submit: Submit;
}) {
  return (
    <section className="studio-showreel" aria-labelledby="showreel-label">
      <h2 className="studio-section-label" id="showreel-label">
        Homepage showreel
      </h2>
      <div className="studio-showreel__line">
        <span className="studio-showreel__trace" aria-hidden="true" />
        {showreel ? (
          <>
            <Link
              className="studio-showreel__title"
              to={`/studio/music/${showreel.id}`}
            >
              {showreel.title}
            </Link>
            <StatusBadge status={showreel.status} />
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() =>
                submit({ intent: "clear-showreel", id: showreel.id })
              }
            >
              Clear
            </button>
          </>
        ) : (
          <span className="studio-showreel__empty">No homepage showreel</span>
        )}
      </div>
      <p className="studio-hint">
        {showreel && showreel.status !== "published"
          ? "Not live until this track is published. "
          : ""}
        {showreel && !showreel.ready
          ? "It needs preview audio, full audio or a YouTube link. "
          : ""}
        {showreel
          ? "Never autoplays: visitors press play."
          : "Choose a track with “Set as showreel” in its row menu. Never autoplays: visitors press play."}
      </p>
    </section>
  );
}

function RowMenu({ row, submit }: { row: StudioMusicRow; submit: Submit }) {
  const title = studioLabel(row.title);
  const item = (intent: string, text: string) => (
    <li>
      <button
        type="button"
        className="studio-menu__item"
        onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          submit({ intent, id: row.id });
        }}
      >
        {text}
      </button>
    </li>
  );
  return (
    <details className="studio-menu">
      <summary
        className="studio-menu__toggle"
        aria-label={`Actions for ${title}`}
      >
        <span aria-hidden="true">⋯</span>
      </summary>
      <ul className="studio-menu__list">
        <li>
          <Link className="studio-menu__item" to={`/studio/music/${row.id}`}>
            Edit
          </Link>
        </li>
        {row.status !== "archived"
          ? item(
              row.featured ? "unfeature" : "feature",
              row.featured ? "Remove from homepage" : "Feature on homepage",
            )
          : null}
        {row.status !== "archived" && !row.isShowreel && row.showreelReady
          ? item("set-showreel", "Set as showreel")
          : null}
        {row.isShowreel ? item("clear-showreel", "Remove showreel") : null}
        {item("duplicate", "Duplicate")}
        {row.status === "archived"
          ? item("restore", "Restore to draft")
          : item("archive", "Archive")}
      </ul>
    </details>
  );
}

function Filters({ data }: { data: MusicListData }) {
  const { filters, facets } = data;
  return (
    <FilterBar q={filters.q} status={filters.status} label="Filter music">
      <label className="visually-hidden" htmlFor="music-filter-artist">
        Artist
      </label>
      <select
        id="music-filter-artist"
        className="studio-input studio-select"
        name="artist"
        defaultValue={filters.artist}
      >
        <option value="">All artists</option>
        {facets.artists.map((artist) => (
          <option key={artist} value={artist}>
            {artist}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor="music-filter-year">
        Year
      </label>
      <select
        id="music-filter-year"
        className="studio-input studio-select"
        name="year"
        defaultValue={filters.year ? String(filters.year) : ""}
      >
        <option value="">All years</option>
        {facets.years.map((year) => (
          <option key={year} value={String(year)}>
            {year}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor="music-filter-role">
        Role
      </label>
      <select
        id="music-filter-role"
        className="studio-input studio-select"
        name="role"
        defaultValue={filters.role}
      >
        <option value="">All roles</option>
        {facets.roles.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <label className="studio-check">
        <input
          type="checkbox"
          name="featured"
          value="1"
          defaultChecked={filters.featured}
        />
        <span>Featured</span>
      </label>
      <label className="visually-hidden" htmlFor="music-filter-sort">
        Sort
      </label>
      <select
        id="music-filter-sort"
        className="studio-input studio-select"
        name="sort"
        defaultValue={filters.sort}
      >
        <option value="order">Manual order</option>
        <option value="updated">Recently updated</option>
        <option value="year">Year</option>
      </select>
    </FilterBar>
  );
}

export function MusicListView({ data }: { data: MusicListData }) {
  const navigate = useNavigate();
  const { submit } = useListActions();
  const rows = data.rows;
  const byId = useMemo(
    () => new Map(rows.map((row) => [row.id, row] as const)),
    [rows],
  );
  const labelOf = useCallback(
    (id: string) => studioLabel(byId.get(id)?.title),
    [byId],
  );
  const reorder = useKeyboardReorder({
    ids: rows.map((row) => row.id),
    labelOf,
    onCommit: (order) =>
      submit({ intent: "reorder", ids: JSON.stringify(order) }),
  });
  const ordered = data.manualOrder
    ? reorder.order
        .map((id) => byId.get(id))
        .filter((row): row is StudioMusicRow => Boolean(row))
    : rows;

  // `n` opens a new entry (list pages, admin-architecture §4.15).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      ) {
        return;
      }
      event.preventDefault();
      navigate("/studio/music/new");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const { filters } = data;
  const filtered = Boolean(
    filters.q ||
      filters.artist ||
      filters.year ||
      filters.role ||
      filters.featured ||
      filters.status !== "active",
  );

  return (
    <StudioPage
      title="Music"
      actions={
        <Link
          className="studio-btn studio-btn--primary studio-btn--compact"
          to="/studio/music/new"
        >
          New music entry
        </Link>
      }
    >
      <div className="studio-music">
        <ShowreelSlot showreel={data.showreel} submit={submit} />
        <Filters data={data} />
        <p className="visually-hidden" aria-live="assertive">
          {reorder.announcement}
        </p>
        <RowList
          label="Music entries"
          rows={ordered}
          empty={
            filtered ? (
              <EmptyState
                title={
                  filters.q ? `No results for “${filters.q}”` : "No results"
                }
                action={
                  <Link className="studio-link" to="/studio/music">
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title="No music yet"
                body="Add a track, then choose one as the homepage showreel."
                action={
                  <Link
                    className="studio-btn studio-btn--secondary studio-btn--compact"
                    to="/studio/music/new"
                  >
                    New music entry
                  </Link>
                }
              />
            )
          }
          renderRow={(row, index) => {
            const title = studioLabel(row.title, "");
            const english = row.title.en.trim();
            return (
              <EntryRow
                key={row.id}
                href={`/studio/music/${row.id}`}
                title={title}
                secondary={english && english !== title ? english : undefined}
                status={row.status}
                flags={flagsOf(row)}
                meta={musicMeta(row)}
                updated={relativeTime(row.updatedAt)}
                highlighted={reorder.picked === row.id}
                handle={
                  data.manualOrder ? (
                    <OrderControls
                      label={studioLabel(row.title)}
                      index={index}
                      total={ordered.length}
                      picked={reorder.picked === row.id}
                      onMove={(delta) => reorder.move(row.id, delta)}
                      handleProps={reorder.handleProps(row.id)}
                    />
                  ) : undefined
                }
                menu={<RowMenu row={row} submit={submit} />}
              />
            );
          }}
        />
      </div>
    </StudioPage>
  );
}
