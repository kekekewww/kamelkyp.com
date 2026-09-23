import { Link } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { ServiceDefinition } from "../../lib/services/catalog";

const GROUPS = {
  mixing: { path: "/mixing", zh: "混音", en: "Mixing" },
  song_transition: {
    path: "/song-transition",
    zh: "歌曲銜接",
    en: "Song Transition",
  },
} as const;

/**
 * Breadcrumb above service pages (IA §4.5): 服務 / 混音. On the group's own
 * selection page the group is the current page (plain text); on a detail page
 * it links back to the selection page.
 */
export function ServiceBreadcrumb({
  locale,
  category,
  current,
}: {
  locale: Locale;
  category: ServiceDefinition["category"];
  /** true on the selection page itself. */
  current: boolean;
}) {
  const group = GROUPS[category];
  const copy = getSiteCopy(locale);

  return (
    <nav
      className="breadcrumb col-content"
      aria-label={locale === "zh" ? "頁面路徑" : "Breadcrumb"}
    >
      <ol>
        <li>
          <Link to={localePath(locale, "/services")}>
            {copy.breadcrumbServices}
          </Link>
        </li>
        <li>
          {current ? (
            <span aria-current="page">{group[locale]}</span>
          ) : (
            <Link to={localePath(locale, group.path)}>{group[locale]}</Link>
          )}
        </li>
      </ol>
    </nav>
  );
}
