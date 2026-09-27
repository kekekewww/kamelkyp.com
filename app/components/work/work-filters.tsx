import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { getReducedMotionSnapshot } from "../../lib/motion/reduced-motion";
import { formatIndex, getWorkCopy } from "./project-meta";

/** `"all"` or a `project_category` term slug (`/works?category=<slug>`). */
export type CategoryFilter = string;

export interface WorkFilterOption {
  value: CategoryFilter;
  label: string;
  count: number;
}

export function filterHref(locale: Locale, value: CategoryFilter): string {
  const base = localePath(locale, "/works");
  return value === "all"
    ? base
    : `${base}?category=${encodeURIComponent(value)}`;
}

/**
 * Work filter chips (design-system §6.9, IA §4.2): plain links, so filtering
 * works without JavaScript. The active chip carries aria-current="page".
 * With JS, navigation keeps the scroll position and cross-fades the root
 * (motion-system §2.9); on the phone strip the active chip scrolls into view.
 */
export function WorkFilters({
  options,
  active,
  locale,
}: {
  options: readonly WorkFilterOption[];
  active: CategoryFilter;
  locale: Locale;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const copy = getWorkCopy(locale);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the active filter changes
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const current = list.querySelector<HTMLElement>('[aria-current="page"]');
    const listRect = list.getBoundingClientRect();
    const rect = current?.getBoundingClientRect();
    if (!rect || (rect.left >= listRect.left && rect.right <= listRect.right)) {
      return;
    }
    list.scrollTo({
      left: list.scrollLeft + rect.left - listRect.left,
      behavior: getReducedMotionSnapshot() ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <nav className="work-filters" aria-label={copy.filterLabel}>
      <ul ref={listRef} className="chip-list chip-list--scroll">
        {options.map((option) => (
          <li key={option.value}>
            <Link
              className="chip"
              to={filterHref(locale, option.value)}
              aria-current={option.value === active ? "page" : undefined}
              viewTransition
              preventScrollReset
            >
              <span data-localized>{option.label}</span>
              <span className="chip__count">{formatIndex(option.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
