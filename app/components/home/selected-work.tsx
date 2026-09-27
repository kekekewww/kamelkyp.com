import { useId, useRef } from "react";
import { Link } from "react-router";
import type { PublicProjectCard } from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { useParallax } from "../../lib/motion/use-parallax";
import { ProjectCover } from "../work/project-cover";
import { type IndexedWork, ProjectList } from "../work/project-list";

/** One metadata segment per category (meta-row adds the " / " separators). */
function categorySegments(item: PublicProjectCard) {
  return item.categories.map((category) => (
    <span key={category.id} data-localized>
      {category.label}
    </span>
  ));
}

/** `SELECTED WORK / 2024—2026` from the featured projects' years. */
function yearSpan(items: readonly PublicProjectCard[]): string | null {
  const years = items
    .map((item) => item.year)
    .filter((year): year is number => typeof year === "number");
  if (years.length === 0) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}—${last}`;
}

function FeatureProject({
  item,
  locale,
}: {
  item: PublicProjectCard;
  locale: Locale;
}) {
  const copy = getSiteCopy(locale);
  const descriptionId = useId();
  const frameRef = useRef<HTMLElement>(null);
  useParallax(frameRef);

  return (
    <Link
      className="home-feature subgrid"
      to={item.href}
      aria-describedby={item.shortDescription ? descriptionId : undefined}
      data-reveal="up"
    >
      <figure className="home-feature__cover parallax" ref={frameRef}>
        <ProjectCover
          slug={item.slug}
          category={item.primaryCategory?.slug ?? item.categories[0]?.slug}
          cover={item.cover}
          index={1}
          aspect="3:2"
          locale={locale}
          className="home-feature__media parallax__media"
        />
        {item.todoContent ? (
          <span className="badge-placeholder home-feature__badge">
            {copy.badgePlaceholder}
          </span>
        ) : null}
      </figure>
      <div className="home-feature__text">
        <p className="meta-row">
          <span>01</span>
          {categorySegments(item)}
          {item.year ? <span>{item.year}</span> : null}
        </p>
        <h3 className="home-feature__title t-title-list">{item.title}</h3>
        {item.shortDescription ? (
          <p className="home-feature__description t-lede" id={descriptionId}>
            {item.shortDescription}
          </p>
        ) : null}
        <span className="home-feature__more text-link">
          {locale === "zh" ? "查看專案" : "View project"}
          <span className="text-link__arrow" aria-hidden="true">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}

/**
 * Home §2: feature block + editorial list with hover preview (IA §4.1). The
 * featured projects come from the Studio (featured, in featured order); with
 * none the section is not rendered.
 */
export function SelectedWork({
  items,
  locale,
}: {
  items: readonly PublicProjectCard[];
  locale: Locale;
}) {
  const [feature, ...rest] = items;
  if (!feature) return null;
  // Stable 1-based positions: the feature is 01, the rows continue from 02.
  const rows: IndexedWork[] = rest.map((item, position) => ({
    item,
    index: position + 2,
  }));
  const isZh = locale === "zh";
  const years = yearSpan(items);

  return (
    <section
      className="home-section home-work"
      aria-labelledby="home-work-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">
          {years ? `SELECTED WORK / ${years}` : "SELECTED WORK"}
        </p>
        <h2
          className="section-head__title t-h1"
          id="home-work-title"
          data-reveal="mask"
        >
          {isZh ? "精選作品" : "Selected Work"}
        </h2>
        <div className="section-head__aside">
          <Link className="text-link" to={localePath(locale, "/works")}>
            {isZh ? "所有作品" : "All work"}
            <span className="text-link__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>

      <div className="grid home-work__feature">
        <FeatureProject item={feature} locale={locale} />
      </div>

      {rows.length > 0 ? (
        <div className="grid">
          <ProjectList
            entries={rows}
            locale={locale}
            headingLevel={3}
            showDescription={false}
            className="home-work__list"
          />
        </div>
      ) : null}
    </section>
  );
}
