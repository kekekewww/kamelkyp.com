/**
 * Public project reads (content-schema §2.2, §5.4).
 * List order: sort_order, then year DESC, then published_at DESC.
 * Home: published, listed, featured, by featured_order; no automatic fill.
 */
import type { Env } from "../../env.server";
import { resolveRedirect } from "../db/redirects.server";
import { localize } from "../localized";
import type { Locale } from "../types";
import {
  buildProjectCard,
  buildProjectView,
  isProjectVisible,
  projectHref,
} from "./build-views";
import {
  buildViewContext,
  byFeaturedOrder,
  loadTerms,
  type ParsedRow,
  readEntities,
} from "./read.server";
import type {
  CategoryFilterOption,
  DetailResult,
  PublicProjectCard,
  PublicProjectDetail,
  ReadMode,
} from "./view-models";

type Options = { mode?: ReadMode };

function publicOrder(a: ParsedRow<"project">, b: ParsedRow<"project">) {
  return (
    a.row.sort_order - b.row.sort_order ||
    (b.content.year ?? 0) - (a.content.year ?? 0) ||
    (b.row.published_at ?? "").localeCompare(a.row.published_at ?? "")
  );
}

export async function listPublicProjects(
  db: D1Database,
  env: Env,
  locale: Locale,
  query: Options & { category?: string } = {},
): Promise<PublicProjectCard[]> {
  const mode = query.mode ?? "published";
  const rows = (await readEntities(db, "project", mode))
    .filter(
      (item) =>
        (mode === "preview" || item.content.listed) &&
        isProjectVisible(item.content, locale),
    )
    .sort(publicOrder);
  const context = await buildViewContext(
    db,
    env,
    "project",
    rows.map((item) => item.content),
    mode,
  );
  const categoryId = query.category
    ? [...context.terms.values()].find(
        (term) =>
          term.vocabulary === "project_category" &&
          term.slug === query.category,
      )?.id
    : undefined;
  return rows
    .filter(
      (item) =>
        !query.category ||
        (categoryId !== undefined &&
          item.content.categoryIds.includes(categoryId)),
    )
    .map((item) => buildProjectCard(item.content, locale, context, item.facts));
}

export async function listHomeProjects(
  db: D1Database,
  env: Env,
  locale: Locale,
  count: number,
  options: Options = {},
): Promise<PublicProjectCard[]> {
  const mode = options.mode ?? "published";
  const rows = (
    await readEntities(db, "project", mode, { where: "t.featured = 1" })
  )
    .filter(
      (item) => item.content.listed && isProjectVisible(item.content, locale),
    )
    .sort(byFeaturedOrder)
    .slice(0, Math.max(0, count));
  const context = await buildViewContext(
    db,
    env,
    "project",
    rows.map((item) => item.content),
    mode,
  );
  return rows.map((item) =>
    buildProjectCard(item.content, locale, context, item.facts),
  );
}

/**
 * Detail by live slug. An old slug 301s to the current one; a row without
 * the locale's required text is missing in that locale. Preview reads by id.
 */
export async function getPublicProject(
  db: D1Database,
  env: Env,
  locale: Locale,
  slug: string,
  options: Options & { id?: string } = {},
): Promise<DetailResult<"project", PublicProjectDetail>> {
  const mode = options.mode ?? "published";
  const rows =
    mode === "preview" && options.id
      ? await readEntities(db, "project", mode, {
          where: "t.id = ?",
          binds: [options.id],
        })
      : await readEntities(db, "project", "published", {
          where: "t.published_slug = ?",
          binds: [slug],
        });
  const item = rows[0];
  if (!item) {
    if (mode === "published") {
      const target = await resolveRedirect(db, "project", slug);
      if (target) return { kind: "redirect", to: projectHref(locale, target) };
    }
    return { kind: "missing" };
  }
  if (!isProjectVisible(item.content, locale)) return { kind: "missing" };
  const context = await buildViewContext(
    db,
    env,
    "project",
    [item.content],
    mode,
  );
  return {
    kind: "found",
    project: buildProjectView(item.content, locale, context, item.facts),
  };
}

/** Category chips with counts over the given cards (zero-count terms included). */
export async function listCategoryFilters(
  db: D1Database,
  locale: Locale,
  items: readonly PublicProjectCard[],
): Promise<CategoryFilterOption[]> {
  const terms = await loadTerms(db);
  return [...terms.values()]
    .filter(
      (term) => term.vocabulary === "project_category" && !term.archivedAt,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((term) => ({
      id: term.id,
      slug: term.slug,
      label: localize(term.label, locale),
      count: items.filter((item) =>
        item.categories.some((category) => category.id === term.id),
      ).length,
    }));
}
