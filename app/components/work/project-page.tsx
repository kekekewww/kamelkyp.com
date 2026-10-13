import { type ReactNode, useRef } from "react";
import { Link } from "react-router";
import type {
  PublicImage,
  PublicMusicItem,
  PublicProjectCard,
  PublicProjectDetail,
} from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { useParallax } from "../../lib/motion/use-parallax";
import { BlockRenderer } from "../content/block-renderer";
import { MediaPreview } from "../media/media-preview";
import {
  CaseStudySection,
  CaseStudyToc,
  type CaseStudyTocEntry,
  FormattedText,
  TrackSheet,
} from "./case-study-section";
import { ProjectCover } from "./project-cover";
import { workHref } from "./project-list";
import {
  type CaseSectionKey,
  type CategoryRef,
  categoryText,
  getWorkCopy,
  MetaRow,
  type ProjectFact,
  ProjectFacts,
} from "./project-meta";

export interface NextWork {
  slug: string;
  title: string;
  categories: CategoryRef[];
  year: number | null;
  index: number;
}

/** Position in the public Work order and the next project (wrapping). */
export function projectNeighbours(
  all: readonly PublicProjectCard[],
  slug: string,
): { index: number | undefined; next: NextWork | null } {
  const position = all.findIndex((item) => item.slug === slug);
  if (position < 0) return { index: undefined, next: null };
  const nextPosition = (position + 1) % all.length;
  const candidate = all[nextPosition];
  const next: NextWork | null =
    candidate && nextPosition !== position
      ? {
          slug: candidate.slug,
          title: candidate.title,
          categories: candidate.categories,
          year: candidate.year,
          index: nextPosition + 1,
        }
      : null;
  return { index: position + 1, next };
}

/** Eyebrow `WORK / AI / 2026`: Latin codes in both locales (design-system §6.5). */
function eyebrowText(category: string | null, year: number | null): string {
  return [
    "WORK",
    category ? category.replaceAll("-", " ").toUpperCase() : null,
    year ? String(year) : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function ProjectHero({
  project,
  locale,
  index,
}: {
  project: PublicProjectDetail;
  locale: Locale;
  index: number | undefined;
}) {
  const site = getSiteCopy(locale);
  const copy = getWorkCopy(locale);
  const frameRef = useRef<HTMLElement>(null);
  useParallax(frameRef);
  const category = project.primaryCategory?.slug ?? null;

  return (
    <>
      <header className="project-hero grid">
        <p className="eyebrow col-rail">
          {eyebrowText(category, project.year)}
        </p>
        <div className="project-hero__head col-content">
          <h1 className="project-hero__title">
            {project.title || copy.untitled}
          </h1>
          {project.todoContent ? (
            <span className="badge-placeholder">{site.badgePlaceholder}</span>
          ) : null}
        </div>
        {project.todoContent ? (
          <p className="placeholder-notice col-content">
            {site.noticePlaceholder}
          </p>
        ) : null}
        {project.shortDescription ? (
          <p className="project-hero__lede col-content">
            {project.shortDescription}
          </p>
        ) : null}
      </header>
      <figure ref={frameRef} className="project-hero__cover parallax">
        <ProjectCover
          className="parallax__media"
          slug={project.slug}
          category={category}
          cover={project.cover}
          index={index}
          placeholder={project.todoContent}
          showBadge
          aspect="hero"
          locale={locale}
          decorative={false}
          priority
        />
      </figure>
    </>
  );
}

function NextProject({ next, locale }: { next: NextWork; locale: Locale }) {
  const copy = getWorkCopy(locale);
  return (
    <nav className="project-next grid" aria-label={copy.next}>
      <p className="eyebrow col-rail">{copy.next}</p>
      <Link
        className="project-next__link col-content"
        to={workHref(locale, next.slug)}
        viewTransition
      >
        <MetaRow
          index={next.index}
          categories={next.categories}
          year={next.year}
        />
        <span className="project-next__title">
          {next.title || copy.untitled}
          <span className="project-next__arrow" aria-hidden="true">
            →
          </span>
        </span>
      </Link>
    </nav>
  );
}

function GalleryImage({
  image,
  caption,
}: {
  image: PublicImage;
  caption: string;
}) {
  return (
    <figure className="case-media">
      <img
        className={image.focalClass || undefined}
        src={image.src}
        srcSet={image.srcSet}
        sizes={image.sizes}
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading="lazy"
        decoding="async"
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function trackRows(
  track: PublicMusicItem,
  locale: Locale,
): { term: string; value: string }[] {
  const copy = getWorkCopy(locale).track;
  return [
    { term: copy.track, value: track.title },
    { term: copy.artist, value: track.artist },
    { term: copy.role, value: track.role },
    { term: copy.year, value: track.year ? String(track.year) : "" },
    {
      term: copy.credits,
      value: track.credits
        .map((credit) => [credit.role, credit.name].filter(Boolean).join(" "))
        .join(" / "),
    },
  ];
}

/**
 * Project detail (IA §4.3): hero, facts, the project's published music, then
 * the case study as a document. Every group is optional: no description, no
 * story field, no gallery, no links, no credits and no music simply omit
 * their section (and TOC entry); a missing cover draws the procedural one.
 */
export function ProjectPage({
  project,
  music,
  locale,
  index,
  next,
}: {
  project: PublicProjectDetail;
  music: readonly PublicMusicItem[];
  locale: Locale;
  index: number | undefined;
  next: NextWork | null;
}) {
  const copy = getWorkCopy(locale);
  const technology = [...project.tools, ...project.technologies];

  const facts: ProjectFact[] = [
    { term: copy.meta.year, value: project.year ? String(project.year) : null },
    {
      term: copy.meta.category,
      value:
        project.categories.length > 0 ? categoryText(project.categories) : null,
    },
    { term: copy.meta.role, value: project.role || null },
    {
      term: copy.meta.tech,
      value:
        technology.length > 0 ? (
          <ul className="project-facts__list">
            {technology.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        ) : null,
    },
  ];

  const sections: ReactNode[] = [];
  const toc: CaseStudyTocEntry[] = [];
  const add = (key: CaseSectionKey | "links" | "credits", body: ReactNode) => {
    const id = `section-${key}`;
    const heading =
      key === "links"
        ? copy.links
        : key === "credits"
          ? copy.credits
          : copy.section[key];
    toc.push({ id, label: heading });
    sections.push(
      <CaseStudySection key={key} id={id} heading={heading}>
        {body}
      </CaseStudySection>,
    );
  };

  if (project.description.length > 0) {
    add("overview", <FormattedText blocks={project.description} />);
  }
  const story = new Map(project.story.map((section) => [section.key, section]));
  const storyOrder = [
    "context",
    "problem",
    "approach",
    "process",
    "architecture",
    "result",
  ] as const;
  for (const key of storyOrder) {
    const section = story.get(key);
    if (section) add(key, <FormattedText blocks={section.blocks} />);
  }
  if (project.coverVideo || project.gallery.length > 0) {
    add(
      "media",
      <>
        {project.coverVideo ? (
          <MediaPreview item={project.coverVideo} locale={locale} />
        ) : null}
        {project.gallery.map((item) => (
          <GalleryImage
            key={item.image.assetId}
            image={item.image}
            caption={item.caption}
          />
        ))}
      </>,
    );
  }
  const reflection = story.get("reflection");
  if (reflection) {
    add("reflection", <FormattedText blocks={reflection.blocks} />);
  }
  if (project.links.length > 0) {
    add(
      "links",
      <ul className="case-links">
        {project.links.map((link) => (
          <li key={link.url}>
            <a
              className="text-link"
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {link.label}
              <span className="text-link__arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>,
    );
  }
  if (project.credits.length > 0) {
    add(
      "credits",
      <dl className="case-credits">
        {project.credits.map((credit) => (
          <div key={`${credit.role}-${credit.name}`}>
            <dt>{credit.role}</dt>
            <dd>{credit.name}</dd>
          </div>
        ))}
      </dl>,
    );
  }

  const hasBody = project.body.length > 0;

  return (
    <main className="page project-page" id="main-content">
      <div className="project-page__back grid">
        <Link
          className="text-link project-page__back-link"
          to={localePath(locale, "/works")}
          viewTransition
        >
          <span className="text-link__arrow" aria-hidden="true">
            ←
          </span>
          {copy.back}
        </Link>
      </div>
      <ProjectHero project={project} locale={locale} index={index} />
      <div className="project-summary grid">
        <ProjectFacts facts={facts} className="col-content" />
        {music.length > 0 ? (
          <div className="project-summary__audio col-content">
            {music.map((track) => (
              <TrackSheet
                key={track.id}
                label={
                  track.title
                    ? `${copy.track.label}${locale === "zh" ? "：" : ": "}${track.title}`
                    : copy.track.label
                }
                pending={copy.track.pending}
                rows={trackRows(track, locale)}
                player={
                  track.media ? (
                    <MediaPreview item={track.media} locale={locale} />
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : null}
      </div>
      {sections.length > 0 || hasBody ? (
        <div className="project-doc grid">
          <CaseStudyToc entries={toc} label={copy.contents} />
          <div className="project-doc__body">
            {sections}
            {hasBody ? (
              <BlockRenderer
                blocks={project.body}
                locale={locale}
                media={project.bodyMedia}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {next ? <NextProject next={next} locale={locale} /> : null}
    </main>
  );
}
