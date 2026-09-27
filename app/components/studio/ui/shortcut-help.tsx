/**
 * Keyboard shortcut help (admin-architecture §4.15), opened with `?`.
 * A non-modal panel: Escape or the close button dismisses it.
 */
import { useEffect, useRef } from "react";

export const STUDIO_SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ["Mod + S", "Save"],
  ["Mod + Shift + Enter", "Preview changes (editor)"],
  ["/", "Focus list search"],
  ["n", "New item (list pages)"],
  [
    "g then h p m r w s",
    "Home, Projects, Music, Recognition, Writing, Services",
  ],
  ["g then l d o ,", "Social links, Media, Homepage, Settings"],
  ["Alt + ↑ / ↓", "Move the focused row (manual order)"],
  ["Space / Enter on a handle", "Pick up and drop a row; arrows move it"],
  ["Escape", "Close a panel, dialog or menu"],
  ["?", "Show this help"],
];

export function ShortcutHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <section
      className="studio-shortcuts"
      role="dialog"
      aria-modal="false"
      aria-labelledby="studio-shortcuts-title"
    >
      <header className="studio-shortcuts__head">
        <h2 className="studio-section-label" id="studio-shortcuts-title">
          Keyboard shortcuts
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="studio-btn studio-btn--ghost studio-btn--compact"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <dl className="studio-shortcuts__list">
        {STUDIO_SHORTCUTS.map(([keys, action]) => (
          <div className="studio-shortcuts__row" key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <p className="studio-hint">
        Publishing has no shortcut: it is always a deliberate click.
      </p>
    </section>
  );
}
