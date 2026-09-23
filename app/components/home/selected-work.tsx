import { useId, useRef } from "react";
import { Link } from "react-router";
import { categoryLabel, type WorkListItem } from "../../content";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { useParallax } from "../../lib/motion/use-parallax";
import { ProjectCover } from "../work/project-cover";
import { type IndexedWork, ProjectList } from "../work/project-list";

/** One metadata segment per category (meta-row adds the " / " separators). */
function categorySegments(item: WorkListItem, locale: Locale) {
  return item.categories.map((category) => (
    <span key={category} data-localized>
      {categoryLabel(category, locale)}
    </span>
  ));
}

function FeatureProject({
  item,
  locale,
}: {
  item: WorkListItem;
  locale: Locale;
}) {
  const copy = getSiteCopy(locale);
  const descriptionId = useId();
  const frameRef = useRef<HTMLElement>(null);
  useParallax(frameRef);

  return (
    <Link
      className="home-feature subgrid"
      to={localePath(locale, `/works/${item.slug}`)}
      aria-describedby={item.description ? descriptionId : undefined}
      data-reveal="up"
    >
      <figure className="home-feature__cover parallax" ref={frameRef}>
        <ProjectCover
          slug={item.slug}
          category={item.categories[0] ?? "music"}
          cover={item.cover}
          index={1}
          aspect="3:2"
          locale={locale}
          className="home-feature__media parallax__media"
        />
        {item.placeholder ? (
          <span className="badge-placeholder home-feature__badge">
            {copy.badgePlaceholder}
          </span>
        ) : null}
      </figure>
      <div className="home-feature__text">
        <p className="meta-row">
          <span>01</span>
          {categorySegments(item, locale)}
          {item.year ? <span>{item.year}</span> : null}
        </p>
        <h3 className="home-feature__title t-title-list">{item.title}</h3>
        {item.description ? (
          <p className="home-feature__description t-lede" id={descriptionId}>
            {item.description}
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

/** Home §2: feature block + editorial list with hover preview (IA §4.1). */
export function SelectedWork({
  items,
  locale,
}: {
  items: WorkListItem[];
  locale: Locale;
}) {
  const [feature, ...rest] = items;
  // Stable 1-based positions: the feature is 01, the rows continue from 02.
  const rows: IndexedWork[] = rest.map((item, position) => ({
    item,
    index: position + 2,
  }));
  const isZh = locale === "zh";

  return (
    <section
      className="home-section home-work"
      aria-labelledby="home-work-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">SELECTED WORK / 2024—2026</p>
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

      {feature ? (
        <div className="grid home-work__feature">
          <FeatureProject item={feature} locale={locale} />
        </div>
      ) : null}

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
