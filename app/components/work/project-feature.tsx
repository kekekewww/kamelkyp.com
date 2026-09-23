import { useId } from "react";
import { Link } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { useVtFlag } from "../../lib/motion/use-view-transition-flag";
import { ProjectCover } from "./project-cover";
import { type IndexedWork, workHref } from "./project-list";
import { getWorkCopy, MetaRow } from "./project-meta";

/**
 * Feature project block (design-system §6.7): one link wrapping a large
 * cover (3:2, left bleed on lg+; 4:5 full-bleed on phones) and a text column
 * bottom-aligned to it. The description is referenced by aria-describedby.
 */
export function ProjectFeature({
  entry,
  locale,
  headingLevel = 2,
  className,
}: {
  entry: IndexedWork;
  locale: Locale;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const { item, index } = entry;
  const href = workHref(locale, item.slug);
  const vt = useVtFlag(href);
  const descriptionId = useId();
  const copy = getWorkCopy(locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <Link
      className={["project-feature grid", className].filter(Boolean).join(" ")}
      to={href}
      viewTransition
      data-vt={vt}
      aria-describedby={item.description ? descriptionId : undefined}
      data-reveal="up"
    >
      <div className="project-feature__media bleed-start">
        <ProjectCover
          className="project-row__cover project-feature__cover"
          slug={item.slug}
          category={item.categories[0] ?? "music"}
          cover={item.cover}
          index={index}
          placeholder={item.placeholder}
          showBadge
          aspect="3:2"
          locale={locale}
        />
      </div>
      <div className="project-feature__text">
        <MetaRow
          index={index}
          categories={item.categories}
          year={item.year}
          locale={locale}
        />
        <div className="project-feature__head">
          <Heading className="project-row__title project-feature__title">
            {item.title || copy.untitled}
          </Heading>
          {item.placeholder ? (
            <span className="badge-placeholder">
              {getSiteCopy(locale).badgePlaceholder}
            </span>
          ) : null}
        </div>
        {item.role ? (
          <span className="project-feature__role">{item.role}</span>
        ) : null}
        {item.description ? (
          <span className="project-feature__description" id={descriptionId}>
            {item.description}
          </span>
        ) : null}
        <span className="project-feature__cta text-link">
          {copy.viewProject}
          <span className="text-link__arrow" aria-hidden="true">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
