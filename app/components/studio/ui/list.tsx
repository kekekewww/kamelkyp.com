/**
 * List primitives (admin-architecture §4.3, §4.12, §5.5): filter bar driven by
 * URL search params, 40 px ruled rows, empty states that invite the next
 * action, and explicit ordering controls with a keyboard reorder model.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Form, Link } from "react-router";
import type { EntryStatus } from "../../../lib/cms/types";
import { type Flag, FlagBadge, StatusBadge } from "./badges";
import {
  keyboardReorderReducer,
  moveItem,
  reorderAnnouncement,
} from "./reorder";

export const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Search (`/` focuses it) + status segmented control + type filters. */
export function FilterBar({
  q = "",
  status = "active",
  label,
  children,
}: {
  q?: string;
  status?: StatusFilter;
  /** e.g. "Filter projects". */
  label: string;
  children?: React.ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || isTyping(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Form
      ref={formRef}
      method="get"
      role="search"
      aria-label={label}
      className="studio-filterbar"
      preventScrollReset
    >
      <div className="studio-filterbar__search">
        <label className="visually-hidden" htmlFor="studio-filter-q">
          Search
        </label>
        <input
          ref={searchRef}
          id="studio-filter-q"
          className="studio-input"
          type="search"
          name="q"
          placeholder="Search titles and details  /"
          defaultValue={q}
        />
      </div>
      <fieldset className="studio-segmented">
        <legend className="visually-hidden">Status</legend>
        {STATUS_FILTERS.map((option) => (
          <label className="studio-segmented__option" key={option.value}>
            <input
              type="radio"
              name="status"
              value={option.value}
              defaultChecked={status === option.value}
              onChange={() => formRef.current?.requestSubmit()}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      {children ? (
        <div className="studio-filterbar__extra">{children}</div>
      ) : null}
      <button
        type="submit"
        className="studio-btn studio-btn--ghost studio-btn--compact"
      >
        Apply
      </button>
    </Form>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="studio-empty">
      <span className="studio-empty__trace" aria-hidden="true" />
      <p className="studio-empty__title">{title}</p>
      {body ? <p className="studio-hint">{body}</p> : null}
      {action ? <div className="studio-empty__action">{action}</div> : null}
    </div>
  );
}

export function RowList<T>({
  label,
  rows,
  renderRow,
  empty,
  head,
}: {
  label: string;
  rows: readonly T[];
  renderRow: (row: T, index: number) => React.ReactNode;
  empty: React.ReactNode;
  /** Optional column header row. */
  head?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="studio-rows">
      {head ? (
        <div className="studio-rows__head" aria-hidden="true">
          {head}
        </div>
      ) : null}
      <ul className="studio-rows__list" aria-label={label}>
        {rows.map((row, index) => renderRow(row, index))}
      </ul>
    </div>
  );
}

/** One entry row: whole row links to the editor; menu and handle are separate stops. */
export function EntryRow({
  href,
  title,
  secondary,
  status,
  flags = [],
  meta,
  updated,
  handle,
  menu,
  highlighted,
}: {
  href: string;
  title: string;
  /** EN value when it differs from the ZH title. */
  secondary?: string;
  status?: EntryStatus;
  flags?: Flag[];
  meta?: React.ReactNode;
  updated?: string;
  handle?: React.ReactNode;
  menu?: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <li className="studio-row" data-highlight={highlighted ? "" : undefined}>
      {handle ? <div className="studio-row__handle">{handle}</div> : null}
      <Link className="studio-row__link" to={href}>
        <span className="studio-row__title">
          {title || <span className="studio-row__untitled">Untitled</span>}
          {secondary ? (
            <span className="studio-row__secondary" lang="en">
              {secondary}
            </span>
          ) : null}
        </span>
        <span className="studio-row__badges">
          {status ? <StatusBadge status={status} /> : null}
          {flags.map((flag) => (
            <FlagBadge key={flag} flag={flag} />
          ))}
        </span>
        {meta ? <span className="studio-row__meta">{meta}</span> : null}
        {updated ? (
          <span className="studio-row__updated">{updated}</span>
        ) : null}
      </Link>
      {menu ? <div className="studio-row__menu">{menu}</div> : null}
    </li>
  );
}

export function OrderControls({
  label,
  index,
  total,
  onMove,
  picked = false,
  handleProps,
}: {
  label: string;
  index: number;
  total: number;
  /** -1 up, +1 down. */
  onMove: (delta: number) => void;
  picked?: boolean;
  handleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div className="studio-order" data-picked={picked ? "" : undefined}>
      <button
        type="button"
        className="studio-order__handle"
        aria-label={`Reorder: ${label}, position ${index + 1} of ${total}`}
        aria-pressed={picked}
        {...handleProps}
      >
        <span aria-hidden="true" className="studio-order__grip" />
      </button>
      <button
        type="button"
        className="studio-order__step"
        onClick={() => onMove(-1)}
        disabled={index === 0}
      >
        <span className="visually-hidden">Move up</span>
        <span aria-hidden="true">↑</span>
      </button>
      <button
        type="button"
        className="studio-order__step"
        onClick={() => onMove(1)}
        disabled={index === total - 1}
      >
        <span className="visually-hidden">Move down</span>
        <span aria-hidden="true">↓</span>
      </button>
    </div>
  );
}

/**
 * Keyboard reorder: Space/Enter on a handle picks up and drops, arrows move,
 * Escape cancels, Alt+↑/↓ moves at once. `onCommit` receives the full ordered
 * id list after each drop (one request per drop).
 */
export function useKeyboardReorder({
  ids,
  labelOf,
  onCommit,
}: {
  ids: string[];
  labelOf: (id: string) => string;
  onCommit: (order: string[]) => void;
}) {
  const [state, dispatch] = useReducer(keyboardReorderReducer, {
    order: ids,
    picked: null,
    originIndex: null,
  });
  const [announcement, setAnnouncement] = useState("");
  const idsKey = ids.join("\u0000");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the server order changes
  useEffect(() => {
    dispatch({ type: "reset", order: ids });
  }, [idsKey]);

  const move = useCallback(
    (id: string, delta: number) => {
      const index = state.order.indexOf(id);
      const next = moveItem(state.order, index, index + delta);
      dispatch({ type: "reset", order: next });
      const newIndex = next.indexOf(id);
      setAnnouncement(
        reorderAnnouncement("moved", labelOf(id), newIndex, next.length),
      );
      onCommit(next);
    },
    [state.order, labelOf, onCommit],
  );

  const handleProps = useCallback(
    (id: string): React.ButtonHTMLAttributes<HTMLButtonElement> => ({
      onKeyDown: (event) => {
        const total = state.order.length;
        if (
          event.altKey &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          event.preventDefault();
          move(id, event.key === "ArrowUp" ? -1 : 1);
          return;
        }
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (state.picked === id) {
            dispatch({ type: "drop" });
            setAnnouncement(
              reorderAnnouncement(
                "dropped",
                labelOf(id),
                state.order.indexOf(id),
                total,
              ),
            );
            onCommit(state.order);
          } else {
            dispatch({ type: "pick", id });
            setAnnouncement(
              reorderAnnouncement(
                "picked",
                labelOf(id),
                state.order.indexOf(id),
                total,
              ),
            );
          }
          return;
        }
        if (state.picked !== id) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const delta = event.key === "ArrowUp" ? -1 : 1;
          dispatch({ type: "move", delta });
          const index = Math.max(
            0,
            Math.min(total - 1, state.order.indexOf(id) + delta),
          );
          setAnnouncement(
            reorderAnnouncement("moved", labelOf(id), index, total),
          );
        } else if (event.key === "Escape") {
          event.preventDefault();
          dispatch({ type: "cancel" });
          setAnnouncement(
            reorderAnnouncement(
              "cancelled",
              labelOf(id),
              state.originIndex ?? 0,
              total,
            ),
          );
        }
      },
    }),
    [state, labelOf, move, onCommit],
  );

  return {
    order: state.order,
    picked: state.picked,
    move,
    handleProps,
    /** Render inside a visually hidden `aria-live="assertive"` region. */
    announcement,
  };
}
