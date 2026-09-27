import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { PublicProjectCard } from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { getMotionTier } from "../../lib/motion/reduced-motion";
import { DUR, EASE } from "../../lib/motion/tokens";
import { useHoverPreview } from "../../lib/motion/use-hover-preview";
import { useVtFlag } from "../../lib/motion/use-view-transition-flag";
import { ProjectCover } from "./project-cover";
import { formatIndex, getWorkCopy } from "./project-meta";

export interface IndexedWork {
  item: PublicProjectCard;
  /** Stable 1-based position in the full, unfiltered Work order. */
  index: number;
}

export function workHref(locale: Locale, slug: string): string {
  return localePath(locale, `/works/${slug}`);
}

/** First 8 rows reveal as a group (motion-system §2.2); the rest are static. */
const REVEAL_CAP = 8;
const FILTER_STAGGER = 30;

function ProjectRow({
  entry,
  locale,
  headingLevel,
  showDescription,
  reveal,
}: {
  entry: IndexedWork;
  locale: Locale;
  headingLevel: 2 | 3;
  showDescription: boolean;
  reveal: boolean;
}) {
  const { item, index } = entry;
  const href = workHref(locale, item.slug);
  const vt = useVtFlag(href);
  const copy = getWorkCopy(locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const primary = item.primaryCategory?.slug ?? item.categories[0]?.slug;
  const sub = [
    item.role,
    showDescription ? item.shortDescription : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <li className="project-list__item" data-reveal-item={reveal || undefined}>
      <Link
        className="project-row"
        to={href}
        viewTransition
        data-preview-id={item.slug}
        data-vt={vt}
      >
        <span className="project-row__index project-row__meta">
          {formatIndex(index)}
        </span>
        <div className="project-row__head">
          <Heading className="project-row__title">
            {item.title || copy.untitled}
          </Heading>
          {item.todoContent ? (
            <span className="badge-placeholder">
              {getSiteCopy(locale).badgePlaceholder}
            </span>
          ) : null}
        </div>
        <span className="project-row__cats project-row__meta meta-row">
          {item.categories.map((category) => (
            <span key={category.id} data-localized>
              {category.label}
            </span>
          ))}
        </span>
        {item.year ? (
          <span className="project-row__year project-row__meta">
            {item.year}
          </span>
        ) : null}
        {sub.length > 0 ? (
          <span className="project-row__sub">
            {sub.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ) : null}
        <div className="project-row__thumb project-row__cover">
          <ProjectCover
            slug={item.slug}
            category={primary}
            cover={item.cover}
            aspect="4:3"
            locale={locale}
          />
        </div>
      </Link>
    </li>
  );
}

function PreviewItem({
  entry,
  locale,
  active,
}: {
  entry: IndexedWork;
  locale: Locale;
  active: boolean;
}) {
  const { item, index } = entry;
  const vt = useVtFlag(workHref(locale, item.slug));
  return (
    <div
      className="hover-preview__item"
      data-preview-for={item.slug}
      data-vt={active ? vt : undefined}
    >
      <ProjectCover
        slug={item.slug}
        category={item.primaryCategory?.slug ?? item.categories[0]?.slug}
        cover={item.cover}
        index={index}
        placeholder={item.todoContent}
        showBadge
        aspect="4:3"
        locale={locale}
      />
    </div>
  );
}

/**
 * Editorial project list with a hover-preview slot (design-system §6.8,
 * motion-system §2.4). Title, metadata and link are always visible; the
 * preview appears on hover and keyboard focus (desktop, fine pointer) and
 * becomes an inline thumbnail on touch and small screens.
 */
export function ProjectList({
  entries,
  locale,
  headingLevel = 2,
  showDescription = true,
  filterKey,
  className,
}: {
  entries: readonly IndexedWork[];
  locale: Locale;
  headingLevel?: 2 | 3;
  showDescription?: boolean;
  /** When this changes (Work filter), the rows re-enter (motion-system §2.9). */
  filterKey?: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { previewRef, activeId } = useHoverPreview(listRef);
  const firstKey = useRef(filterKey);

  useEffect(() => {
    if (filterKey === firstKey.current) return;
    firstKey.current = filterKey;
    const list = listRef.current;
    if (!list || getMotionTier() === "static") return;
    const cap = getMotionTier() === "lite" ? 4 : REVEAL_CAP;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>(".project-list__item"),
    ).slice(0, REVEAL_CAP);
    rows.forEach((row, position) => {
      if (typeof row.animate !== "function") return;
      row.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: DUR.d3,
          easing: EASE.outExpo,
          delay: Math.min(position, cap - 1) * FILTER_STAGGER,
          fill: "backwards",
        },
      );
    });
  }, [filterKey]);

  return (
    <div
      ref={listRef}
      className={["project-list", className].filter(Boolean).join(" ")}
    >
      <ul
        className="project-list__rows"
        data-reveal-group
        data-filter-key={filterKey}
      >
        {entries.map((entry, position) => (
          <ProjectRow
            key={entry.item.slug}
            entry={entry}
            locale={locale}
            headingLevel={headingLevel}
            showDescription={showDescription}
            reveal={position < REVEAL_CAP}
          />
        ))}
      </ul>
      <div ref={previewRef} className="hover-preview" aria-hidden="true">
        {entries.map((entry) => (
          <PreviewItem
            key={entry.item.slug}
            entry={entry}
            locale={locale}
            active={activeId === entry.item.slug}
          />
        ))}
      </div>
    </div>
  );
}
