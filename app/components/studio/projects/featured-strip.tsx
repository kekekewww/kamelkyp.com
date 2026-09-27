/**
 * "On the homepage": featured projects in featured order (a real sequence,
 * hence the position numerals), with the site's homepage limit drawn as a
 * measured line. Drafts and unlisted rows keep their place but take no
 * slot. Reordering saves at once; Remove unfeatures (live immediately).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { OrderControls, StatusBadge, useKeyboardReorder } from "../ui";
import { homepageSlots } from "./project-list";
import type { StudioProjectRow } from "./types";

const MOVE_KEYS = new Set([" ", "Enter", "ArrowUp", "ArrowDown"]);

/** Flash the row after a keyboard move or drop (admin §4.12). */
export function withHighlight(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
  highlight: () => void,
): React.ButtonHTMLAttributes<HTMLButtonElement> {
  return {
    ...props,
    onKeyDown: (event) => {
      props.onKeyDown?.(event);
      if (MOVE_KEYS.has(event.key)) highlight();
    },
  };
}

const NOTE = {
  shown: null,
  over: "Over the limit",
  draft: "Not live until published",
  unlisted: "Unlisted: not shown",
} as const;

function cutLabel(limit: number): string {
  return limit === 1
    ? "Homepage shows the first one"
    : `Homepage shows the first ${limit}`;
}

export function FeaturedStrip({
  rows,
  limit,
  onReorder,
  onRemove,
  busy,
}: {
  rows: StudioProjectRow[];
  limit: number;
  onReorder: (ids: string[]) => void;
  onRemove: (row: StudioProjectRow) => void;
  busy?: boolean;
}) {
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const labelOf = useCallback(
    (id: string) => byId.get(id)?.label || "Untitled",
    [byId],
  );
  const [moved, setMoved] = useState<string | null>(null);
  const reorder = useKeyboardReorder({
    ids: rows.map((row) => row.id),
    labelOf,
    onCommit: onReorder,
  });
  const ordered = reorder.order
    .map((id) => byId.get(id))
    .filter((row): row is StudioProjectRow => Boolean(row));
  const slots = homepageSlots(ordered, limit);
  const shown = slots.filter((slot) => slot.state === "shown").length;

  useEffect(() => {
    if (!moved) return;
    const timer = window.setTimeout(() => setMoved(null), 700);
    return () => window.clearTimeout(timer);
  }, [moved]);

  return (
    <section className="projects-home" aria-labelledby="projects-home-title">
      <div className="projects-home__head">
        <h2 className="studio-section-label" id="projects-home-title">
          On the homepage
        </h2>
        <p className="projects-home__meta">
          Selected work · {shown} of {limit} {limit === 1 ? "slot" : "slots"}{" "}
          used
        </p>
      </div>
      {ordered.length === 0 ? (
        <p className="projects-home__empty">
          No featured projects. The homepage hides Selected work until you
          feature one from a project’s ⋯ menu.
        </p>
      ) : (
        <ol className="projects-home__list" aria-busy={busy || undefined}>
          {ordered.map((row, index) => {
            const slot = slots[index] ?? { state: "shown", cutBefore: false };
            const note = NOTE[slot.state];
            return (
              <li
                className="projects-home__item"
                key={row.id}
                data-state={slot.state}
                data-cut={slot.cutBefore ? cutLabel(limit) : undefined}
                data-highlight={moved === row.id ? "" : undefined}
              >
                <span className="projects-home__pos" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <OrderControls
                  label={row.label || "Untitled"}
                  index={index}
                  total={ordered.length}
                  picked={reorder.picked === row.id}
                  onMove={(delta) => {
                    setMoved(row.id);
                    reorder.move(row.id, delta);
                  }}
                  handleProps={withHighlight(reorder.handleProps(row.id), () =>
                    setMoved(row.id),
                  )}
                />
                <Link
                  className="projects-home__title"
                  to={`/studio/projects/${row.id}`}
                >
                  {row.label || (
                    <span className="studio-row__untitled">Untitled</span>
                  )}
                </Link>
                <span className="projects-home__state">
                  <StatusBadge status={row.status} />
                  {note ? (
                    <span className="projects-home__note">{note}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost studio-btn--compact projects-home__remove"
                  onClick={() => onRemove(row)}
                >
                  Remove from homepage
                  <span className="visually-hidden">
                    : {row.label || "Untitled"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="visually-hidden" aria-live="assertive">
        {reorder.announcement}
      </p>
    </section>
  );
}
