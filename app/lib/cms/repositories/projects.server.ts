/**
 * Studio projects repository (content-schema §5.3, admin-architecture §2.2).
 *
 * List queries, facets and form parsing for `/studio/projects/*`, plus the
 * route handlers (`loadX` / `handleX`) the thin route modules wrap with
 * `withOwner` / `withOwnerMutation`. Every content change goes through the
 * lifecycle engine; nothing here writes project columns directly.
 */
import { redirect } from "react-router";
import {
  changedProjectSections,
  readProjectForm,
  sameProjectContent,
} from "../../../components/studio/projects/project-form";
import {
  isManualOrder,
  type ProjectListQuery,
  parseProjectListParams,
} from "../../../components/studio/projects/project-list";
import type { StudioProjectRow } from "../../../components/studio/projects/types";
import type { Env } from "../../env.server";
import { CmsError } from "../db/errors";
import {
  archiveEntity,
  createEntity,
  deleteEntity,
  duplicateEntity,
  getEntity,
  publishEntity,
  reorder,
  restoreEntity,
  revertToPublished,
  saveEntity,
  setFeatured,
  unpublishEntity,
  validateEntity,
} from "../db/lifecycle.server";
import { listRedirects } from "../db/redirects.server";
import { formDataToObject, readExpectedRevision, readString } from "../forms";
import { localize, parseLocalizedText, studioLabel } from "../localized";
import { getAssets } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import { type MediaSummary, toMediaSummary } from "../media/summary";
import type { ProjectContent } from "../schemas/project";
import type { Term } from "../schemas/taxonomy";
import { getSiteSettings } from "../settings.server";
import {
  actionError,
  actionOk,
  unknownIntent,
  withCmsErrors,
} from "../studio/responses";
import { createTerm, listTerms } from "../taxonomy.server";
import type { EntityMeta, EntryStatus, LocalizedText } from "../types";

export type { StudioProjectRow };

const LIST_LIMIT = 500;
const REORDER_MAX = 1000;

type ProjectListRow = {
  id: string;
  title_i18n: string;
  slug: string;
  published_slug: string | null;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  featured_order: number | null;
  sort_order: number;
  revision: number;
  published_revision: number | null;
  has_snapshot: number;
  listed: number;
  year: number | null;
  primary_category_id: string | null;
  category_ids: string | null;
  updated_at: string;
};

const ROW_COLUMNS = `p.id, p.title_i18n, p.slug, p.published_slug, p.status, p.todo_content,
  p.featured, p.featured_order, p.sort_order, p.revision, p.published_revision,
  (p.published_json IS NOT NULL) AS has_snapshot, p.listed, p.year, p.primary_category_id,
  (SELECT json_group_array(term_id) FROM
    (SELECT pc.term_id FROM project_categories pc WHERE pc.project_id = p.id ORDER BY pc.position)
  ) AS category_ids,
  p.updated_at`;

const localized = (column: string) =>
  `COALESCE(json_extract(${column}, '$.zh'), '') || ' ' || COALESCE(json_extract(${column}, '$.en'), '')`;

/** Titles and metadata of both locales, lower-cased (`instr` search). */
const SEARCH_TEXT = `lower(${[
  localized("p.title_i18n"),
  localized("p.short_description_i18n"),
  localized("p.role_i18n"),
  "p.slug",
  "p.tools_json",
  "p.technologies_json",
  "COALESCE(p.year, '')",
].join(" || ' ' || ")})`;

const CATEGORY_SEARCH = `EXISTS (
  SELECT 1 FROM project_categories pc JOIN taxonomy_terms t ON t.id = pc.term_id
  WHERE pc.project_id = p.id AND instr(lower(${localized("t.label_i18n")}), ?2) > 0)`;

const ORDER_BY: Record<ProjectListQuery["sort"], string> = {
  order:
    "p.sort_order, p.year DESC, p.published_at DESC, p.updated_at DESC, p.id",
  updated: "p.updated_at DESC, p.id",
  year: "p.year IS NULL, p.year DESC, p.sort_order, p.id",
};

function statusList(status: ProjectListQuery["status"]): EntryStatus[] {
  switch (status) {
    case "active":
      return ["draft", "published"];
    case "all":
      return ["draft", "published", "archived"];
    default:
      return [status];
  }
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function rowFromDb(row: ProjectListRow): StudioProjectRow {
  const title = parseLocalizedText(row.title_i18n);
  const label = studioLabel(title, "");
  const en = localize(title, "en");
  return {
    id: row.id,
    title,
    label,
    secondary: en && en !== label ? en : null,
    slug: row.slug,
    publishedSlug: row.published_slug,
    status: row.status,
    todoContent: row.todo_content === 1,
    featured: row.featured === 1,
    featuredOrder: row.featured_order,
    sortOrder: row.sort_order,
    hasUnpublishedChanges:
      row.has_snapshot === 1 &&
      row.published_revision !== null &&
      row.revision !== row.published_revision,
    listed: row.listed === 1,
    year: row.year,
    primaryCategoryId: row.primary_category_id,
    categoryIds: parseIds(row.category_ids),
    updatedAt: row.updated_at,
  };
}

/** Studio list: search (both locales), status, category, year, featured, sort. */
export async function listStudioProjects(
  db: D1Database,
  filters: Partial<ProjectListQuery>,
): Promise<StudioProjectRow[]> {
  const q = filters.q?.trim().toLowerCase() || null;
  const sort = filters.sort ?? "order";
  const featured =
    filters.featured === true ? 1 : filters.featured === false ? 0 : null;
  const rows = await db
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM projects p
       WHERE p.status IN (SELECT value FROM json_each(?1))
         AND (?2 IS NULL OR instr(${SEARCH_TEXT}, ?2) > 0 OR ${CATEGORY_SEARCH})
         AND (?3 IS NULL OR p.primary_category_id = ?3 OR EXISTS (
           SELECT 1 FROM project_categories pc WHERE pc.project_id = p.id AND pc.term_id = ?3))
         AND (?4 IS NULL OR p.year = ?4)
         AND (?5 IS NULL OR p.featured = ?5)
       ORDER BY ${ORDER_BY[sort]}
       LIMIT ${LIST_LIMIT}`,
    )
    .bind(
      JSON.stringify(statusList(filters.status ?? "active")),
      q,
      filters.categoryId ?? null,
      filters.year ?? null,
      featured,
    )
    .all<ProjectListRow>();
  return rows.results.map(rowFromDb);
}

/** Homepage "Selected work" candidates in featured order (archived rows never hold a slot). */
export async function listFeaturedProjects(
  db: D1Database,
): Promise<StudioProjectRow[]> {
  const rows = await db
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM projects p
       WHERE p.featured = 1 AND p.status <> 'archived'
       ORDER BY p.featured_order IS NULL, p.featured_order, p.sort_order, p.id`,
    )
    .all<ProjectListRow>();
  return rows.results.map(rowFromDb);
}

export async function getProjectFacets(
  db: D1Database,
): Promise<{ years: number[]; categories: Term[] }> {
  const [years, categories] = await Promise.all([
    db
      .prepare(
        "SELECT DISTINCT year FROM projects WHERE year IS NOT NULL ORDER BY year DESC",
      )
      .all<{ year: number }>(),
    listTerms(db, "project_category"),
  ]);
  return { years: years.results.map((row) => row.year), categories };
}

/**
 * FormData → working copy + expected revision (throws `invalid_content`
 * with inline issues for values that cannot be stored).
 */
export function parseProjectForm(formData: FormData): {
  content: ProjectContent;
  expectedRevision: number;
  clearTodoContent: boolean;
} {
  const parsed = readProjectForm(formData);
  if (!parsed.ok)
    throw new CmsError("invalid_content", { issues: parsed.issues });
  if (parsed.expectedRevision === null) {
    throw new CmsError("invalid_content", {
      issues: [
        {
          field: "expectedRevision",
          code: "invalid_value",
          severity: "error",
          message: "Reload the page, then save again.",
        },
      ],
    });
  }
  return {
    content: parsed.content,
    expectedRevision: parsed.expectedRevision,
    clearTodoContent: parsed.clearTodoContent,
  };
}

// ---- Handlers -------------------------------------------------------------

type ActionArgs = {
  db: D1Database;
  formData: FormData | null;
  intent: string | null;
  now: Date;
};
type Params = { params: Readonly<Record<string, string | undefined>> };
type MediaEnv = Pick<
  Env,
  | "MEDIA"
  | "MEDIA_PUBLIC_BASE_URL"
  | "MEDIA_CORS_HOSTS"
  | "IMAGE_TRANSFORMATIONS"
>;

async function featuredLimit(db: D1Database): Promise<number> {
  return (await getSiteSettings(db)).value.homepage.featuredProjectCount;
}

/** `/studio/projects` loader. */
export async function loadProjectsList({
  db,
  request,
  now,
}: {
  db: D1Database;
  request: Request;
  now: Date;
}) {
  const query = parseProjectListParams(new URL(request.url).searchParams);
  const [rows, featured, facets, allTerms, limit] = await Promise.all([
    listStudioProjects(db, query),
    listFeaturedProjects(db),
    getProjectFacets(db),
    listTerms(db, "project_category", { includeArchived: true }),
    featuredLimit(db),
  ]);
  const categoryLabels: Record<string, LocalizedText> = Object.fromEntries(
    allTerms.map((term) => [term.id, term.label]),
  );
  return {
    query,
    rows,
    featured,
    facets,
    categoryLabels,
    manualOrder: isManualOrder(query),
    featuredLimit: limit,
    now: now.toISOString(),
  };
}

function requireId(formData: FormData | null): string {
  const id = formData ? readString(formData, "id") : null;
  if (!id) throw new CmsError("not_found");
  return id;
}

async function createFromForm(
  db: D1Database,
  formData: FormData | null,
  now: Date,
) {
  const raw = formData ? formDataToObject(formData) : {};
  const primary =
    typeof raw.primaryCategoryId === "string" && raw.primaryCategoryId.trim()
      ? raw.primaryCategoryId.trim()
      : null;
  const meta = await createEntity(
    db,
    "project",
    {
      title: raw.title,
      slug: typeof raw.slug === "string" ? raw.slug : "",
      primaryCategoryId: primary,
      categoryIds: primary ? [primary] : [],
    },
    { now },
  );
  return redirect(`/studio/projects/${meta.id}`, 303);
}

/** Archived → draft; `republish` puts a previously live row back online (Undo). */
async function restoreProject(
  db: D1Database,
  id: string,
  republish: boolean,
  now: Date,
) {
  const meta = await restoreEntity(db, "project", id, now);
  if (!republish)
    return actionOk({ intent: "restore", id, status: meta.status, meta });
  const outcome = await publishEntity(db, "project", id, meta.revision, now);
  return outcome.ok
    ? actionOk({
        intent: "restore",
        id,
        status: outcome.meta.status,
        republished: true,
        meta: outcome.meta,
      })
    : actionOk({
        intent: "restore",
        id,
        status: meta.status,
        republished: false,
        issues: outcome.issues,
        meta,
      });
}

async function archiveProject(db: D1Database, id: string, now: Date) {
  const before = await getEntity(db, "project", id);
  if (!before) throw new CmsError("not_found");
  const meta = await archiveEntity(db, "project", id, now);
  return actionOk({
    intent: "archive",
    id,
    status: meta.status,
    wasPublished: before.meta.status === "published",
    meta,
  });
}

async function duplicateProject(db: D1Database, id: string, now: Date) {
  const copy = await duplicateEntity(db, "project", id, now);
  return actionOk({
    intent: "duplicate",
    id: copy.id,
    slug: copy.slug,
    redirectTo: `/studio/projects/${copy.id}`,
  });
}

function readReorder(formData: FormData | null) {
  const field = (formData && readString(formData, "field")) || "sort_order";
  if (field !== "sort_order" && field !== "featured_order") return null;
  let ids: unknown;
  try {
    ids = JSON.parse((formData && readString(formData, "ids")) || "");
  } catch {
    return null;
  }
  if (
    !Array.isArray(ids) ||
    ids.length > REORDER_MAX ||
    !ids.every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 100,
    )
  ) {
    return null;
  }
  return { field, ids: ids as string[] } as const;
}

/** `/studio/projects` action: create, reorder, feature, archive, restore, duplicate. */
export async function handleProjectsListAction({
  db,
  formData,
  intent,
  now,
}: ActionArgs) {
  return withCmsErrors(async () => {
    switch (intent) {
      case "create":
        return createFromForm(db, formData, now);
      case "reorder": {
        const request = readReorder(formData);
        if (!request) {
          return actionError("invalid_order", {
            status: 422,
            message: "The new order could not be read. Reload and try again.",
          });
        }
        await reorder(db, "project", request.ids, request.field);
        return actionOk({
          intent,
          field: request.field,
          count: request.ids.length,
        });
      }
      case "feature":
      case "unfeature": {
        const id = requireId(formData);
        await setFeatured(db, "project", id, intent === "feature");
        return actionOk({ intent, id, featured: intent === "feature" });
      }
      case "archive":
        return archiveProject(db, requireId(formData), now);
      case "restore":
        return restoreProject(
          db,
          requireId(formData),
          formData?.get("republish") === "1",
          now,
        );
      case "duplicate":
        return duplicateProject(db, requireId(formData), now);
      default:
        return unknownIntent(intent);
    }
  });
}

/** `/studio/projects/new` loader. */
export async function loadProjectNew({ db }: { db: D1Database }) {
  return { categories: await listTerms(db, "project_category") };
}

/** `/studio/projects/new` action: quick create → 303 to the editor. */
export async function handleProjectCreate({
  db,
  formData,
  intent,
  now,
}: ActionArgs) {
  if (intent !== "create") return unknownIntent(intent);
  return withCmsErrors(() => createFromForm(db, formData, now));
}

function referencedAssetIds(content: ProjectContent): string[] {
  return [
    content.coverImageId,
    content.coverVideoId,
    content.socialImageId,
    ...content.gallery.map((item) => item.assetId),
  ].filter((id): id is string => Boolean(id));
}

/** `/studio/projects/:id` loader. */
export async function loadProjectEditor({
  db,
  env,
  params,
  now,
}: { db: D1Database; env: MediaEnv; now: Date } & Params) {
  const id = params.id ?? "";
  const loaded = id ? await getEntity(db, "project", id) : null;
  if (!loaded) throw new Response("Not Found", { status: 404 });
  const { meta, content, published } = loaded;
  const config = readMediaConfig(env);
  const [issues, terms, assets, music, redirects, limit] = await Promise.all([
    validateEntity(db, "project", id),
    listTerms(db, "project_category", { includeArchived: true }),
    getAssets(db, referencedAssetIds(content)),
    db
      .prepare(
        "SELECT id, title_i18n, status FROM music_tracks WHERE project_id = ? ORDER BY sort_order, updated_at DESC",
      )
      .bind(id)
      .all<{ id: string; title_i18n: string; status: EntryStatus }>(),
    listRedirects(db, "project", id),
    featuredLimit(db),
  ]);
  const summaries: Record<string, MediaSummary> = Object.fromEntries(
    [...assets.values()].map((asset) => [
      asset.id,
      toMediaSummary(asset, config),
    ]),
  );
  const live =
    meta.status === "published" && meta.publishedSlug
      ? {
          zh: `/zh/works/${meta.publishedSlug}`,
          en: `/en/works/${meta.publishedSlug}`,
        }
      : null;
  return {
    meta,
    content,
    issues,
    terms,
    assets: summaries,
    music: music.results.map((row) => ({
      id: row.id,
      label: studioLabel(parseLocalizedText(row.title_i18n)),
      status: row.status,
    })),
    redirects,
    changedSections: meta.hasUnpublishedChanges
      ? changedProjectSections(content, published)
      : [],
    urls: { preview: `/studio/preview/projects/${id}`, live },
    featuredLimit: limit,
    now: now.toISOString(),
  };
}

/**
 * Saves the posted working copy when it differs from the stored one (or the
 * owner confirmed real content). `required` = the intent is a save; other
 * intents save only when the form carried content.
 */
async function saveFromForm(
  db: D1Database,
  id: string,
  formData: FormData | null,
  now: Date,
  required: boolean,
): Promise<EntityMeta> {
  const current = await getEntity(db, "project", id);
  if (!current) throw new CmsError("not_found");
  if (!formData || (!required && readExpectedRevision(formData) === null)) {
    return current.meta;
  }
  const form = parseProjectForm(formData);
  const content = form.content.slug
    ? form.content
    : { ...form.content, slug: current.meta.slug ?? "" };
  if (!form.clearTodoContent && sameProjectContent(content, current.content)) {
    return current.meta;
  }
  return saveEntity(db, "project", id, form.expectedRevision, content, now, {
    clearTodoContent: form.clearTodoContent,
  });
}

/** `/studio/projects/:id` action, dispatched by `intent`. */
export async function handleProjectEditorAction({
  db,
  formData,
  intent,
  params,
  now,
}: ActionArgs & Params) {
  const id = params.id ?? "";
  return withCmsErrors(async () => {
    switch (intent) {
      case "save": {
        const meta = await saveFromForm(db, id, formData, now, true);
        return actionOk({
          intent,
          meta,
          issues: await validateEntity(db, "project", id),
        });
      }
      case "publish": {
        const saved = await saveFromForm(db, id, formData, now, true);
        if (saved.status === "archived") throw new CmsError("invalid_state");
        const outcome = await publishEntity(
          db,
          "project",
          id,
          saved.revision,
          now,
        );
        if (!outcome.ok) {
          return actionOk({
            intent,
            published: false,
            meta: saved,
            issues: outcome.issues,
          });
        }
        return actionOk({
          intent,
          published: true,
          meta: outcome.meta,
          issues: await validateEntity(db, "project", id),
        });
      }
      case "unpublish": {
        await saveFromForm(db, id, formData, now, false);
        const meta = await unpublishEntity(db, "project", id, now);
        return actionOk({ intent, id, status: meta.status, meta });
      }
      case "archive":
        await saveFromForm(db, id, formData, now, false);
        return archiveProject(db, id, now);
      case "restore":
        await saveFromForm(db, id, formData, now, false);
        return restoreProject(db, id, formData?.get("republish") === "1", now);
      case "duplicate":
        await saveFromForm(db, id, formData, now, false);
        return duplicateProject(db, id, now);
      case "revert": {
        const expected = formData ? readExpectedRevision(formData) : null;
        if (expected === null) throw new CmsError("stale_revision");
        const meta = await revertToPublished(db, "project", id, expected, now);
        return actionOk({ intent, meta });
      }
      case "delete": {
        await deleteEntity(
          db,
          "project",
          id,
          (formData && readString(formData, "confirm")) ?? "",
        );
        return actionOk({
          intent,
          deleted: true,
          redirectTo: "/studio/projects",
        });
      }
      case "feature":
      case "unfeature":
        await setFeatured(db, "project", id, intent === "feature");
        return actionOk({ intent, id, featured: intent === "feature" });
      case "create-term": {
        const raw = formData ? formDataToObject(formData) : {};
        if (raw.vocabulary !== "project_category") {
          return actionError("invalid_vocabulary", {
            status: 422,
            message: "Only project categories can be added here.",
          });
        }
        const term = await createTerm(
          db,
          "project_category",
          { label: parseLocalizedText(raw.label) },
          now,
        );
        return actionOk({
          intent,
          id: term.id,
          label: studioLabel(term.label),
        });
      }
      default:
        return unknownIntent(intent);
    }
  });
}
