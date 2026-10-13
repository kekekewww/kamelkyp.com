/**
 * A named region that scrolls a wide table on narrow screens. It is
 * focusable so keyboard users can scroll it (WCAG 2.1.1); the section's
 * accessible name makes it a landmark region.
 */
export function ScrollRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-reachable
    <section className="studio-scroll-region" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
