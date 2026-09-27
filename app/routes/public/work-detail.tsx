import { type ReactNode, useRef } from "react";
import {
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import {
  CaseStudySection,
  CaseStudyToc,
  type CaseStudyTocEntry,
  TrackSheet,
} from "../../components/work/case-study-section";
import { ProjectCover } from "../../components/work/project-cover";
import { workHref } from "../../components/work/project-list";
import {
  categoryText,
  getWorkCopy,
  MetaRow,
  type ProjectFact,
  ProjectFacts,
} from "../../components/work/project-meta";
import {
  getProject,
  mergeWorks,
  PROJECT_SECTION_KINDS,
  PROJECTS,
  type Project,
  type ProjectCategory,
  type ProjectSectionKind,
  type WorkListItem,
} from "../../content";
import {
  getPublicContent,
  listPublishedContent,
} from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { listMediaForVersion } from "../../lib/media/media-repository.server";
import { useParallax } from "../../lib/motion/use-parallax";

const R2_HOSTS = new Set(["media.kamelkyp.com"]);

export const handle: PublicRouteHandle = {
  contactBand: { variant: "project", size: "large" },
};

export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  if (!data) return [{ title: "Kamel" }];
  const copy = getWorkCopy(data.locale);
  const title =
    data.kind === "file"
      ? data.project.title[data.locale]
      : data.item.title || copy.untitled;
  const description =
    data.kind === "file"
      ? data.project.description[data.locale]
      : (data.item.summary ?? "");
  const tags: ReturnType<MetaFunction> = [
    { title: `${title} — Kamel` },
    { name: "description", content: description },
  ];
  if (data.kind === "file" && data.project.placeholder) {
    tags.push({ name: "robots", content: "noindex" });
  }
  return tags;
};

interface NextWork {
  slug: string;
  title: string;
  categories: ProjectCategory[];
  year: number | null;
  index: number;
}

function neighbours(all: readonly WorkListItem[], slug: string) {
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

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const slug = args.params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  // D1 first, then the file source (IA §4.2: slug collisions resolve to D1).
  const [item, d1Works] = await Promise.all([
    getPublicContent(db, "work", slug, locale),
    listPublishedContent(db, "work", locale),
  ]);
  const { index, next } = neighbours(
    mergeWorks(d1Works, PROJECTS, locale),
    slug,
  );

  if (item) {
    const media = await listMediaForVersion(db, item.versionId, R2_HOSTS);
    return { kind: "d1" as const, locale, item, media, index, next };
  }

  const project = getProject(slug);
  if (!project) throw new Response("Not Found", { status: 404 });
  return { kind: "file" as const, locale, project, index, next };
}

/** Eyebrow `WORK / AI / 2026`: Latin codes in both locales (design-system §6.5). */
function eyebrowText(category: ProjectCategory, year: number | null): string {
  return ["WORK", category.toUpperCase(), year ? String(year) : null]
    .filter(Boolean)
    .join(" / ");
}

function yearOf(iso: string): number | null {
  const year = Number.parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function ProjectHero({
  locale,
  slug,
  title,
  description,
  category,
  year,
  index,
  placeholder,
  cover,
}: {
  locale: Locale;
  slug: string;
  title: string;
  description: string | null;
  category: ProjectCategory;
  year: number | null;
  index: number | undefined;
  placeholder: boolean;
  cover: { src: string; alt: string } | null;
}) {
  const site = getSiteCopy(locale);
  const frameRef = useRef<HTMLElement>(null);
  useParallax(frameRef);

  return (
    <>
      <header className="project-hero grid">
        <p className="eyebrow col-rail">{eyebrowText(category, year)}</p>
        <div className="project-hero__head col-content">
          <h1 className="project-hero__title">{title}</h1>
          {placeholder ? (
            <span className="badge-placeholder">{site.badgePlaceholder}</span>
          ) : null}
        </div>
        {placeholder ? (
          <p className="placeholder-notice col-content">
            {site.noticePlaceholder}
          </p>
        ) : null}
        {description ? (
          <p className="project-hero__lede col-content">{description}</p>
        ) : null}
      </header>
      <figure ref={frameRef} className="project-hero__cover parallax">
        <ProjectCover
          className="parallax__media"
          slug={slug}
          category={category}
          cover={cover}
          index={index}
          placeholder={placeholder}
          showBadge
          aspect="hero"
          locale={locale}
          decorative={false}
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
          locale={locale}
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

function BackLink({ locale }: { locale: Locale }) {
  return (
    <div className="project-page__back grid">
      <Link
        className="text-link project-page__back-link"
        to={localePath(locale, "/works")}
        viewTransition
      >
        <span className="text-link__arrow" aria-hidden="true">
          ←
        </span>
        {getWorkCopy(locale).back}
      </Link>
    </div>
  );
}

function DocumentLayout({
  toc,
  tocLabel,
  children,
}: {
  toc: readonly CaseStudyTocEntry[];
  tocLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="project-doc grid">
      <CaseStudyToc entries={toc} label={tocLabel} />
      <div className="project-doc__body">{children}</div>
    </div>
  );
}

function FileProjectPage({
  project,
  locale,
  index,
}: {
  project: Project;
  locale: Locale;
  index: number | undefined;
}) {
  const copy = getWorkCopy(locale);
  const primary = project.categories[0] ?? "software";
  const isAudio =
    project.categories.includes("music") ||
    project.categories.includes("mixing");

  const facts: ProjectFact[] = [
    { term: copy.meta.year, value: String(project.year) },
    {
      term: copy.meta.category,
      value: categoryText(project.categories, locale),
    },
    { term: copy.meta.role, value: project.role[locale] },
    {
      term: copy.meta.tech,
      value:
        project.technologies.length > 0 ? (
          <ul className="project-facts__list">
            {project.technologies.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        ) : null,
    },
    {
      term: copy.meta.services,
      value:
        project.services.length > 0
          ? project.services.map((service) => service[locale]).join(" / ")
          : null,
    },
  ];

  const byKind = new Map(
    project.sections.map((section) => [section.kind, section]),
  );
  const order: (ProjectSectionKind | "media")[] = [
    ...PROJECT_SECTION_KINDS.slice(
      0,
      PROJECT_SECTION_KINDS.indexOf("result") + 1,
    ),
    "media",
    "reflection",
  ];
  const sections: ReactNode[] = [];
  const toc: CaseStudyTocEntry[] = [];

  for (const kind of order) {
    const id = `section-${kind}`;
    if (kind === "media") {
      if (project.media.length === 0) continue;
      toc.push({ id, label: copy.section.media });
      sections.push(
        <CaseStudySection key={kind} id={id} heading={copy.section.media}>
          {project.media.map((media) => (
            <figure className="case-media" key={media.src}>
              <img
                src={media.src}
                alt={media.alt[locale]}
                loading="lazy"
                decoding="async"
              />
              {media.caption ? (
                <figcaption>{media.caption[locale]}</figcaption>
              ) : null}
            </figure>
          ))}
        </CaseStudySection>,
      );
      continue;
    }
    const section = byKind.get(kind);
    if (!section) continue;
    const heading = section.heading?.[locale] ?? copy.section[kind];
    toc.push({ id, label: heading });
    sections.push(
      <CaseStudySection
        key={kind}
        id={id}
        heading={heading}
        paragraphs={section.body.map((paragraph) => paragraph[locale])}
        items={section.items?.map((item) => item[locale])}
      />,
    );
  }

  if (project.links.length > 0) {
    toc.push({ id: "section-links", label: copy.links });
    sections.push(
      <CaseStudySection key="links" id="section-links" heading={copy.links}>
        <ul className="case-links">
          {project.links.map((link) => (
            <li key={link.url}>
              <a
                className="text-link"
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {link.label[locale]}
                <span className="text-link__arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </CaseStudySection>,
    );
  }

  if (project.credits.length > 0) {
    toc.push({ id: "section-credits", label: copy.credits });
    sections.push(
      <CaseStudySection
        key="credits"
        id="section-credits"
        heading={copy.credits}
      >
        <dl className="case-credits">
          {project.credits.map((credit) => (
            <div key={`${credit.role.en}-${credit.name}`}>
              <dt>{credit.role[locale]}</dt>
              <dd>{credit.name}</dd>
            </div>
          ))}
        </dl>
      </CaseStudySection>,
    );
  }

  const artist = project.credits.find((credit) =>
    /artist/i.test(credit.role.en),
  );

  return (
    <>
      <ProjectHero
        locale={locale}
        slug={project.slug}
        title={project.title[locale]}
        description={project.description[locale]}
        category={primary}
        year={project.year}
        index={index}
        placeholder={project.placeholder}
        cover={
          project.cover
            ? { src: project.cover.src, alt: project.cover.alt[locale] }
            : null
        }
      />
      <div className="project-summary grid">
        <ProjectFacts facts={facts} className="col-content" />
        {isAudio ? (
          <div className="project-summary__audio col-content">
            <TrackSheet
              label={copy.track.label}
              pending={copy.track.pending}
              rows={[
                { term: copy.track.track, value: project.title[locale] },
                { term: copy.track.artist, value: artist?.name ?? "—" },
                { term: copy.track.role, value: project.role[locale] },
                { term: copy.track.year, value: String(project.year) },
                {
                  term: copy.track.credits,
                  value:
                    project.credits.length > 0
                      ? project.credits
                          .map(
                            (credit) => `${credit.role[locale]} ${credit.name}`,
                          )
                          .join(" / ")
                      : "—",
                },
              ]}
            />
          </div>
        ) : null}
      </div>
      <DocumentLayout toc={toc} tocLabel={copy.contents}>
        {sections}
      </DocumentLayout>
    </>
  );
}

export default function WorkDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const { locale, next, index } = data;
  const copy = getWorkCopy(locale);

  return (
    <main className="page project-page" id="main-content">
      <BackLink locale={locale} />
      {data.kind === "file" ? (
        <FileProjectPage project={data.project} locale={locale} index={index} />
      ) : (
        <>
          <ProjectHero
            locale={locale}
            slug={data.item.slug}
            title={data.item.title || copy.untitled}
            description={data.item.summary}
            category="music"
            year={yearOf(data.item.publishedAt)}
            index={index}
            placeholder={false}
            cover={null}
          />
          <div className="project-summary grid">
            <ProjectFacts
              className="col-content"
              facts={[
                {
                  term: copy.meta.year,
                  value: String(yearOf(data.item.publishedAt) ?? ""),
                },
                {
                  term: copy.meta.category,
                  value: categoryText(["music"], locale),
                },
              ]}
            />
          </div>
          <DocumentLayout toc={[]} tocLabel={copy.contents}>
            <BlockRenderer
              blocks={data.item.body}
              locale={locale}
              media={data.media}
              r2Hosts={R2_HOSTS}
            />
          </DocumentLayout>
        </>
      )}
      {next ? <NextProject next={next} locale={locale} /> : null}
    </main>
  );
}
