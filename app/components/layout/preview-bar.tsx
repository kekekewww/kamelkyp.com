import type { Locale } from "../../lib/i18n/locale";

/**
 * Fixed bar on every Studio preview page (admin-architecture §2.4): says the
 * page is not published, switches the previewed locale (the query string is
 * kept) and closes back to the Studio. Studio chrome, so English. In-page
 * links lead to the live public site; the bar says so.
 */
export function PreviewBar({
  locale,
  search,
}: {
  locale: Locale;
  /** Current query string (`?locale=en&drafts=1`), kept when switching. */
  search: string;
}) {
  const hrefFor = (next: Locale) => {
    const params = new URLSearchParams(search);
    params.set("locale", next);
    return `?${params.toString()}`;
  };
  return (
    <aside className="preview-bar" aria-label="Preview" lang="en">
      <p className="preview-bar__status">Preview · not published</p>
      <nav className="preview-bar__locales" aria-label="Preview language">
        {(["zh", "en"] as const).map((value) => (
          <a
            key={value}
            className="preview-bar__locale"
            href={hrefFor(value)}
            aria-current={value === locale ? "page" : undefined}
          >
            {value.toUpperCase()}
          </a>
        ))}
      </nav>
      <p className="preview-bar__note">
        Links on this page open the live site.
      </p>
      <a className="preview-bar__close" href="/studio">
        Close preview
      </a>
    </aside>
  );
}
