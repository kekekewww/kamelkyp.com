/**
 * Sitemap entries from the published snapshots (WP4 §4.7). Published mode
 * only (drafts and archived rows never match), TODO_CONTENT filtered as
 * defence in depth, `listed` read from the snapshot (it takes effect on
 * publish), and the same locale predicates as the detail pages' hreflang.
 * No view context, no asset reads and no price reads.
 */
import { LOCALES } from "../../i18n/locale";
import { SITEMAP_STATIC_PATHS, type SitemapEntry } from "../../seo/sitemap";
import { commissionServicePath, SERVICE_CATALOG } from "../../services/catalog";
import { isServiceId } from "../../services/service-id";
import {
  isServiceVisible,
  projectLocales,
  writingDetailLocales,
} from "./build-views";
import { readEntities } from "./read.server";

const bySlug = (a: SitemapEntry, b: SitemapEntry) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

export async function listSitemapEntries(
  db: D1Database,
): Promise<SitemapEntry[]> {
  const [services, projects, writing] = await Promise.all([
    readEntities(db, "service", "published", {
      where: "t.commission_service_id IS NOT NULL AND t.todo_content = 0",
    }),
    readEntities(db, "project", "published", { where: "t.todo_content = 0" }),
    readEntities(db, "writing", "published", { where: "t.todo_content = 0" }),
  ]);

  const statics: SitemapEntry[] = SITEMAP_STATIC_PATHS.map((path) => ({
    path,
    locales: LOCALES,
    lastModified: null,
  }));

  const servicePages = SERVICE_CATALOG.flatMap((definition) => {
    const item = services.find(
      ({ content }) =>
        content.commissionServiceId !== null &&
        isServiceId(content.commissionServiceId) &&
        content.commissionServiceId === definition.id,
    );
    if (!item) return [];
    const locales = LOCALES.filter((locale) =>
      isServiceVisible(item.content, locale),
    );
    if (locales.length === 0) return [];
    return [
      {
        path: commissionServicePath(definition.id),
        locales,
        lastModified: item.row.published_at,
      },
    ];
  });

  const projectPages = projects
    .filter(({ content }) => content.listed)
    .map(({ content, row }) => ({
      path: `/works/${content.slug}`,
      locales: projectLocales(content),
      lastModified: row.published_at,
    }))
    .filter((entry) => entry.locales.length > 0)
    .sort(bySlug);

  const writingPages = writing
    .filter(({ content }) => content.listed)
    .map(({ content, row }) => ({
      path: `/writing/${content.slug}`,
      locales: writingDetailLocales(content),
      lastModified: row.published_at,
    }))
    .filter((entry) => entry.locales.length > 0)
    .sort(bySlug);

  return [...statics, ...servicePages, ...projectPages, ...writingPages];
}
