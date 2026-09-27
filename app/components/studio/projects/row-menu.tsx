/**
 * Row menu (`⋯`, admin-architecture §4.3): a native disclosure with real
 * buttons and links. Escape and an outside click close it; choosing an item
 * closes it too. Not an ARIA menu: every item is an ordinary tab stop.
 */
import { useEffect, useRef } from "react";

export function RowMenu({
  label,
  children,
}: {
  /** Row title, for the accessible name "Actions for <title>". */
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = (focusToggle: boolean) => {
      details.open = false;
      if (focusToggle) details.querySelector("summary")?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) close(false);
    };
    const onClick = (event: MouseEvent) => {
      const item = (event.target as Element).closest(".projects-menu__item");
      if (item) close(false);
    };
    details.addEventListener("keydown", onKeyDown);
    details.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      details.removeEventListener("keydown", onKeyDown);
      details.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <details ref={ref} className="projects-menu">
      <summary
        className="projects-menu__toggle"
        aria-label={`Actions for ${label}`}
      >
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="projects-menu__panel">{children}</div>
    </details>
  );
}
