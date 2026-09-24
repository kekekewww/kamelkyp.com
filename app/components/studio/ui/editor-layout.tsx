/**
 * Editor layout (admin-architecture §4.4): ≥ 1200 px a sticky section index,
 * the form, and an optional preview column; single column below. Sections
 * are `<details>` (BASIC and PUBLICATION open by default; others remember
 * their state per type in localStorage).
 */
import { useEffect, useRef } from "react";

export interface EditorSectionInfo {
  id: string;
  label: string;
  /** Unsaved edits in this section. */
  dirty?: boolean;
  /** Blocking issue count. */
  issues?: number;
}

export function EditorLayout({
  sections,
  preview,
  children,
}: {
  sections: readonly EditorSectionInfo[];
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="studio-editor" data-preview={preview ? "" : undefined}>
      <nav className="studio-editor__index" aria-label="Sections">
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a
                className="studio-editor__index-link"
                href={`#section-${section.id}`}
                onClick={() => {
                  const details = document.getElementById(
                    `section-${section.id}`,
                  );
                  if (details instanceof HTMLDetailsElement)
                    details.open = true;
                }}
              >
                <span>{section.label}</span>
                {section.dirty ? (
                  <span className="studio-editor__dirty">
                    <span className="visually-hidden">, unsaved edits</span>
                  </span>
                ) : null}
                {section.issues ? (
                  <span className="studio-editor__issues">
                    <span aria-hidden="true">{section.issues}</span>
                    <span className="visually-hidden">
                      {`, ${section.issues} blocking ${section.issues === 1 ? "issue" : "issues"}`}
                    </span>
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="studio-editor__form">{children}</div>
      {preview ? (
        <aside className="studio-editor__preview">{preview}</aside>
      ) : null}
    </div>
  );
}

export function EditorSection({
  id,
  label,
  storageKey,
  defaultOpen = false,
  children,
}: {
  id: string;
  label: string;
  /** `studio:sections:<type>` — remembers open/closed per type. */
  storageKey?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!storageKey || !ref.current) return;
    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey) ?? "{}",
      ) as Record<string, boolean>;
      if (typeof stored[id] === "boolean") ref.current.open = stored[id];
    } catch {
      // Storage unavailable: keep the default.
    }
  }, [id, storageKey]);

  return (
    <details
      ref={ref}
      id={`section-${id}`}
      className="studio-section"
      open={defaultOpen}
      onToggle={(event) => {
        if (!storageKey) return;
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
          stored[id] = event.currentTarget.open;
          localStorage.setItem(storageKey, JSON.stringify(stored));
        } catch {
          // Storage unavailable: nothing to remember.
        }
      }}
    >
      <summary className="studio-section__summary">
        <span className="studio-section-label">{label}</span>
      </summary>
      <div className="studio-section__body">{children}</div>
    </details>
  );
}
