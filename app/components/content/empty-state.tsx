import { useId } from "react";
import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

/**
 * Empty state (design-system §6.20): the flat line is the waveform with no
 * signal; heading, one sentence of direction, one text link.
 */
export function EmptyState({
  locale,
  title,
  description,
  linkLabel,
  linkTo,
}: {
  locale: Locale;
  title: string;
  description: string;
  linkLabel?: string;
  /** Path after `/:lang` (defaults to home). */
  linkTo?: string;
}) {
  const titleId = useId();

  return (
    <section className="empty-state" aria-labelledby={titleId}>
      <span className="flat-line" aria-hidden="true" />
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      <Link className="text-link" to={localePath(locale, linkTo ?? "")}>
        {linkLabel ?? (locale === "zh" ? "返回主頁" : "Back to home")}
        <span className="text-link__arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </section>
  );
}
