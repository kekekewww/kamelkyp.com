import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { ProjectFeature } from "../../components/work/project-feature";
import {
  type IndexedWork,
  ProjectList,
} from "../../components/work/project-list";
import { getWorkCopy } from "../../components/work/project-meta";
import {
  type WorkFilterOption,
  WorkFilters,
} from "../../components/work/work-filters";
import { pageMeta } from "../../lib/cms/public/meta";
import {
  listCategoryFilters,
  listPublicProjects,
} from "../../lib/cms/public/projects.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "work", size: "large" },
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) => {
  const copy = getWorkCopy(loaderData?.locale === "en" ? "en" : "zh");
  return pageMeta(matches, {
    title: copy.metaTitle,
    description: copy.metaDescription,
  });
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const requested = new URL(args.request.url).searchParams.get("category");
  const all = await listPublicProjects(db, env, locale);
  const terms = await listCategoryFilters(db, locale, all);
  // Unknown values render "all" (IA §1).
  const category =
    requested && terms.some((term) => term.slug === requested)
      ? requested
      : "all";
  // Stable numbering: a project keeps its index across filters and on its page.
  const indexed: IndexedWork[] = all.map((item, position) => ({
    item,
    index: position + 1,
  }));
  const options: WorkFilterOption[] = [
    {
      value: "all",
      label: getWorkCopy(locale).filterAll,
      count: all.length,
    },
    ...terms.map((term) => ({
      value: term.slug,
      label: term.label,
      count: term.count,
    })),
  ];

  return {
    locale,
    category,
    total: all.length,
    options,
    entries:
      category === "all"
        ? indexed
        : indexed.filter((entry) =>
            entry.item.categories.some((term) => term.slug === category),
          ),
  };
}

export default function WorksIndexRoute() {
  const { locale, category, total, options, entries } =
    useLoaderData<typeof loader>();
  const copy = getWorkCopy(locale);
  const feature = entries.find((entry) => entry.item.featured) ?? null;
  const rest = feature ? entries.filter((entry) => entry !== feature) : entries;

  return (
    <main className="page work-index" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">WORK / INDEX</p>
        <h1 className="page-header__title" data-reveal="mask">
          {copy.h1}
        </h1>
        <p className="page-header__intro">{copy.intro}</p>
      </header>

      <div className="work-index__bar grid">
        <div className="work-index__filters">
          <WorkFilters options={options} active={category} locale={locale} />
          <p className="work-index__count" role="status">
            {copy.count(entries.length)}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="work-index__empty grid">
          {total === 0 ? (
            <EmptyState
              locale={locale}
              title={copy.noneTitle}
              description={copy.noneBody}
            />
          ) : (
            <EmptyState
              locale={locale}
              title={copy.emptyTitle}
              description={copy.emptyBody}
              linkLabel={copy.emptyLink}
              linkTo="/works"
            />
          )}
        </div>
      ) : (
        <>
          {feature ? (
            <div className="work-index__feature">
              <ProjectFeature entry={feature} locale={locale} />
            </div>
          ) : null}
          {rest.length > 0 ? (
            <div className="work-index__list grid">
              <ProjectList
                entries={rest}
                locale={locale}
                filterKey={category}
              />
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
