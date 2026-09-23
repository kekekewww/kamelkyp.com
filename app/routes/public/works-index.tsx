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
import { WorkFilters } from "../../components/work/work-filters";
import {
  filterByCategory,
  filterCategories,
  mergeWorks,
  PROJECTS,
  parseCategory,
} from "../../content";
import { listPublishedContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "work", size: "large" },
};

export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const copy = getWorkCopy(data?.locale === "en" ? "en" : "zh");
  return [
    { title: copy.metaTitle },
    { name: "description", content: copy.metaDescription },
  ];
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const category = parseCategory(
    new URL(args.request.url).searchParams.get("category"),
  );
  const d1Works = await listPublishedContent(db, "work", locale);
  const all = mergeWorks(d1Works, PROJECTS, locale);
  // Stable numbering: a project keeps its index across filters and on its page.
  const indexed: IndexedWork[] = all.map((item, position) => ({
    item,
    index: position + 1,
  }));
  const visible = new Set(
    filterByCategory(all, category).map((item) => item.slug),
  );

  return {
    locale,
    category,
    options: filterCategories(all, locale),
    entries: indexed.filter((entry) => visible.has(entry.item.slug)),
  };
}

export default function WorksIndexRoute() {
  const { locale, category, options, entries } = useLoaderData<typeof loader>();
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
          <EmptyState
            locale={locale}
            title={copy.emptyTitle}
            description={copy.emptyBody}
            linkLabel={copy.emptyLink}
            linkTo="/works"
          />
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
