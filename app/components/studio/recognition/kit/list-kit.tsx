/**
 * List pieces shared by the Recognition and Writing screens (P3): the year
 * rail, rows grouped into sort ties with keyboard reordering, the row menu,
 * the `n` shortcut and list-level actions with toasts (admin-architecture
 * §4.3, §4.8, §4.12, §4.15).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import {
  OrderControls,
  useKeyboardReorder,
  useStudioSession,
  useToast,
} from "../../ui";
import { tieGroups } from "./editorial";

type ListResult =
  | {
      ok: true;
      intent?: string;
      id?: string;
      copyId?: string;
    }
  | { ok: false; message: string };

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Applies the list filter bar at once (selects, the sort switch). */
export function submitFilters() {
  document
    .querySelector<HTMLFormElement>("form.studio-filterbar")
    ?.requestSubmit();
}

/** `n` opens the new-entry page (ignored while typing). */
export function useNewItemShortcut(href: string) {
  const navigate = useNavigate();
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
      navigate(href);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [href, navigate]);
}

export function NewEntryLink({ href, label }: { href: string; label: string }) {
  useNewItemShortcut(href);
  return (
    <Link
      className="studio-btn studio-btn--primary"
      to={href}
      aria-keyshortcuts="n"
    >
      {label}
    </Link>
  );
}

/** A year block: the year sits in a rail beside its ruled rows. */
export function YearRail({
  year,
  count,
  emptyLabel = "No year",
  children,
}: {
  year: number | null;
  count: number;
  /** Rail label for rows without a year. */
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="p3-year" aria-labelledby={id}>
      <h2 className="p3-year__label" id={id}>
        <span
          className="p3-year__numeral"
          data-empty={year === null ? "" : undefined}
        >
          {year ?? emptyLabel}
        </span>
        <span className="p3-year__count">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </h2>
      <div className="p3-year__rows">{children}</div>
    </section>
  );
}

export type RowMenuItem = {
  label: string;
  href?: string;
  newTab?: boolean;
  onSelect?: () => void;
};

/** `⋯` menu: arrow keys move, Escape closes and returns focus. */
export function RowMenu({
  label,
  items,
}: {
  label: string;
  items: readonly RowMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const entries = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ??
        []),
    ];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      entries[(index + delta + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      entries[event.key === "Home" ? 0 : entries.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <div className="p3-menu">
      <button
        ref={buttonRef}
        type="button"
        className="p3-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Actions for ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="p3-menu__list"
          role="menu"
          id={id}
          aria-label={`Actions for ${label}`}
          tabIndex={-1}
          onKeyDown={onMenuKey}
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                className="p3-menu__item"
                href={item.href}
                target={item.newTab ? "_blank" : undefined}
                rel={item.newTab ? "noopener" : undefined}
                onClick={() => close(false)}
              >
                {item.label}
                {item.newTab ? (
                  <span className="visually-hidden"> (opens a new tab)</span>
                ) : null}
              </a>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                type="button"
                className="p3-menu__item"
                onClick={() => {
                  close(true);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * List-level actions through one fetcher, with the toasts of admin §4.8
 * ("Archived · Undo", "Order saved", …). Posts to the list route's action.
 */
export function useListActions({ editorBase }: { editorBase: string }) {
  const fetcher = useFetcher<ListResult>();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const handled = useRef<unknown>(null);
  const [failures, setFailures] = useState(0);

  const submit = useCallback(
    (intent: string, fields: Record<string, string> = {}) => {
      fetcher.submit(
        { csrfToken, intent, ...fields },
        { method: "post", preventScrollReset: true },
      );
    },
    [fetcher, csrfToken],
  );

  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) {
      return;
    }
    handled.current = result;
    if (!result.ok) {
      setFailures((count) => count + 1);
      toast.show({ tone: "error", message: result.message });
      return;
    }
    const id = result.id ?? "";
    switch (result.intent) {
      case "reorder":
        toast.show({ message: "Order saved" });
        break;
      case "feature":
        toast.show({ message: "Featured on the homepage" });
        break;
      case "unfeature":
        toast.show({ message: "Removed from the homepage" });
        break;
      case "archive":
        toast.show({
          message: "Archived",
          action: { label: "Undo", onAction: () => submit("restore", { id }) },
        });
        break;
      case "restore":
        toast.show({ message: "Restored to draft" });
        break;
      case "duplicate":
        toast.show({
          message: "Duplicated as a draft",
          action: result.copyId
            ? { label: "Open copy", href: `${editorBase}/${result.copyId}` }
            : undefined,
        });
        break;
    }
  }, [fetcher.state, fetcher.data, toast, submit, editorBase]);

  return {
    submit,
    busy: fetcher.state !== "idle",
    /** Bumps after a failed action (reorder groups reset to the server order). */
    failures,
  };
}

type RowRender<T> = (row: T, handle: React.ReactNode | null) => React.ReactNode;

function TieGroup<T>({
  rows,
  idOf,
  labelOf,
  onCommit,
  onAnnounce,
  renderRow,
}: {
  rows: readonly T[];
  idOf: (row: T) => string;
  labelOf: (row: T) => string;
  onCommit: (ids: string[]) => void;
  onAnnounce: (message: string) => void;
  renderRow: RowRender<T>;
}) {
  const byId = new Map(rows.map((row) => [idOf(row), row]));
  const labels = (id: string) => {
    const row = byId.get(id);
    return row ? labelOf(row) : id;
  };
  const reorder = useKeyboardReorder({
    ids: rows.map(idOf),
    labelOf: labels,
    onCommit,
  });
  useEffect(() => {
    if (reorder.announcement) onAnnounce(reorder.announcement);
  }, [reorder.announcement, onAnnounce]);
  return (
    <>
      {reorder.order.map((id, index) => {
        const row = byId.get(id);
        if (!row) return null;
        return renderRow(
          row,
          <OrderControls
            label={labels(id)}
            index={index}
            total={reorder.order.length}
            picked={reorder.picked === id}
            onMove={(delta) => reorder.move(id, delta)}
            handleProps={reorder.handleProps(id)}
          />,
        );
      })}
    </>
  );
}

/**
 * Rows in public order. With `reorderable`, runs of rows that share a sort
 * key get order controls (only their manual order is public); single rows
 * get a spacer so columns stay aligned.
 */
export function TieOrderedRows<T>({
  label,
  rows,
  reorderable,
  tieKeyOf,
  idOf,
  labelOf,
  onCommit,
  renderRow,
  resetKey = 0,
}: {
  label: string;
  rows: readonly T[];
  reorderable: boolean;
  tieKeyOf: (row: T) => string;
  idOf: (row: T) => string;
  labelOf: (row: T) => string;
  onCommit: (ids: string[]) => void;
  renderRow: RowRender<T>;
  /** Changing it resets every group to the server order (after a failure). */
  resetKey?: number;
}) {
  const [announcement, setAnnouncement] = useState("");
  return (
    <>
      <ul className="studio-rows__list" aria-label={label}>
        {reorderable
          ? tieGroups(rows, tieKeyOf).map((group) =>
              group.length > 1 ? (
                <TieGroup
                  // Stable across reorders (keeps focus on the moved handle).
                  key={`${group.map(idOf).sort().join("|")}:${resetKey}`}
                  rows={group}
                  idOf={idOf}
                  labelOf={labelOf}
                  onCommit={onCommit}
                  onAnnounce={setAnnouncement}
                  renderRow={renderRow}
                />
              ) : (
                renderRow(
                  group[0] as T,
                  <span className="p3-handle-spacer" aria-hidden="true" />,
                )
              ),
            )
          : rows.map((row) => renderRow(row, null))}
      </ul>
      <p className="visually-hidden" aria-live="assertive">
        {announcement}
      </p>
    </>
  );
}
