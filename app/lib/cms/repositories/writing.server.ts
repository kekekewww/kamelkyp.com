/**
 * Studio repository for Writing (content-schema §2.5, §5.3; admin §2.2,
 * §4.3–4.5, §4.11). Lifecycle intents are the shared editorial handlers in
 * `recognition.server.ts`.
 *
 * Publish rule (validation.ts, brief §23): title, date, platform, and either
 * internal content in both locales (platform Internal, or no external link) or
 * an https link to the original post. An external entry without internal
 * content becomes a card that links out and has no detail page.
 */

import { CmsError } from "../db/errors";
import { getEntity, validateEntity } from "../db/lifecycle.server";
import { formDataToObject } from "../forms";
import { parseLocalizedText } from "../localized";
import type { Term } from "../schemas/taxonomy";
import {
  WRITING_PLATFORMS,
  type WritingContent,
  WritingDraftSchema,
  type WritingPlatform,
} from "../schemas/writing";
import type { StudioActionArgs, StudioLoaderArgs } from "../studio/auth.server";
import { listTerms } from "../taxonomy.server";
import type { EntryStatus, LocalizedText } from "../types";
import { structuralIssues } from "../validation";
import {
  assetSummaries,
  handleEntryEditorIntent,
  handleEntryListIntent,
  type ListSort,
  notFound,
  type ParsedEntryForm,
  parseDraftForm,
  readQuery,
  readSort,
  readStatusFilter,
  type StatusFilterValue,
  statusesFor,
} from "./recognition.server";

export type StudioWritingRow = {
  id: string;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  hasUnpublishedChanges: boolean;
  sortOrder: number;
  listed: boolean;
  title: LocalizedText;
  slug: string;
  date: string | null;
  platform: WritingPlatform;
  platformLabel: string | null;
  categoryTermId: string | null;
  externalUrl: string | null;
  hasContent: { zh: boolean; en: boolean };
  updatedAt: string;
};

export type WritingListFilters = {
  q: string;
  platform: WritingPlatform | null;
  categoryTermId: string | null;
  status: StatusFilterValue;
  sort: ListSort;
};

type WritingRow = {
  id: string;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  sort_order: number;
  listed: number;
  revision: number;
  published_revision: number | null;
  has_snapshot: number;
  title_i18n: string;
  slug: string;
  date: string | null;
  platform: WritingPlatform;
  platform_label: string | null;
  category_term_id: string | null;
  external_url: string | null;
  zh_blocks: number;
  en_blocks: number;
  updated_at: string;
};

type ActionArgs = Pick<
  StudioActionArgs,
  "db" | "formData" | "intent" | "now"
> & {
  params: { id?: string };
};

export function isWritingPlatform(value: string): value is WritingPlatform {
  return (WRITING_PLATFORMS as readonly string[]).includes(value);
}

function localizedSearch(column: string): string {
  return `COALESCE(json_extract(${column}, '$.zh'), '') || ' ' || COALESCE(json_extract(${column}, '$.en'), '')`;
}

export async function listStudioWriting(
  db: D1Database,
  filters: Partial<WritingListFilters> = {},
): Promise<StudioWritingRow[]> {
  const q = filters.q?.trim().toLowerCase() || null;
  const order =
    filters.sort === "updated"
      ? "w.updated_at DESC, w.id"
      : "COALESCE(w.date, '') DESC, w.sort_order, w.id";
  const search = [
    localizedSearch("w.title_i18n"),
    localizedSearch("w.excerpt_i18n"),
    localizedSearch("t.label_i18n"),
    "w.slug",
    "w.platform",
    "COALESCE(w.platform_label, '')",
    "COALESCE(w.external_url, '')",
  ].join(" || ' ' || ");
  const rows = await db
    .prepare(
      `SELECT w.id, w.status, w.todo_content, w.featured, w.sort_order, w.listed, w.revision,
              w.published_revision, (w.published_json IS NOT NULL) AS has_snapshot,
              w.title_i18n, w.slug, w.date, w.platform, w.platform_label, w.category_term_id,
              w.external_url, w.updated_at,
              COALESCE(json_array_length(w.content_i18n, '$.zh'), 0) AS zh_blocks,
              COALESCE(json_array_length(w.content_i18n, '$.en'), 0) AS en_blocks
       FROM writings w
       LEFT JOIN taxonomy_terms t ON t.id = w.category_term_id
       WHERE w.status IN (SELECT value FROM json_each(?1))
         AND (?2 IS NULL OR instr(lower(${search}), ?2) > 0)
         AND (?3 IS NULL OR w.platform = ?3)
         AND (?4 IS NULL OR w.category_term_id = ?4)
       ORDER BY ${order}
       LIMIT 1000`,
    )
    .bind(
      JSON.stringify(statusesFor(filters.status ?? "active")),
      q,
      filters.platform ?? null,
      filters.categoryTermId ?? null,
    )
    .all<WritingRow>();
  return rows.results.map((row) => ({
    id: row.id,
    status: row.status,
    todoContent: row.todo_content === 1,
    featured: row.featured === 1,
    hasUnpublishedChanges:
      row.has_snapshot === 1 &&
      row.published_revision !== null &&
      row.revision !== row.published_revision,
    sortOrder: row.sort_order,
    listed: row.listed === 1,
    title: parseLocalizedText(row.title_i18n),
    slug: row.slug,
    date: row.date,
    platform: row.platform,
    platformLabel: row.platform_label,
    categoryTermId: row.category_term_id,
    externalUrl: row.external_url,
    hasContent: { zh: row.zh_blocks > 0, en: row.en_blocks > 0 },
    updatedAt: row.updated_at,
  }));
}

export async function getWritingFacets(
  db: D1Database,
): Promise<{ categories: Term[] }> {
  return { categories: await listTerms(db, "writing_category") };
}

export function parseWritingFilters(url: URL): WritingListFilters {
  const params = url.searchParams;
  const platform = params.get("platform") ?? "";
  const category = params.get("category")?.trim() ?? "";
  return {
    q: readQuery(params.get("q")),
    platform: isWritingPlatform(platform) ? platform : null,
    categoryTermId: category && category.length <= 100 ? category : null,
    status: readStatusFilter(params.get("status")),
    sort: readSort(params.get("sort")),
  };
}

export function parseWritingForm(
  formData: FormData,
): ParsedEntryForm<"writing"> {
  return parseDraftForm<"writing">(formData, WritingDraftSchema);
}

export async function loadWritingList({
  db,
  request,
}: Pick<StudioLoaderArgs, "db" | "request">) {
  const filters = parseWritingFilters(new URL(request.url));
  const [rows, facets] = await Promise.all([
    listStudioWriting(db, filters),
    getWritingFacets(db),
  ]);
  return { rows, facets, filters };
}

export async function loadWritingNew({ db }: Pick<StudioLoaderArgs, "db">) {
  return { categories: await listTerms(db, "writing_category") };
}

/** An entry links out when it is external and has no internal content. */
function isLinkCard(content: WritingContent): boolean {
  return content.platform !== "internal" && Boolean(content.externalUrl);
}

export async function loadWritingEditor({
  db,
  env,
  params,
}: Pick<StudioLoaderArgs, "db" | "env"> & { params: { id?: string } }) {
  const id = params.id ?? "";
  const loaded = await getEntity(db, "writing", id);
  if (!loaded) notFound();
  const [issues, categories, assets] = await Promise.all([
    validateEntity(db, "writing", id),
    listTerms(db, "writing_category", { includeArchived: true }),
    assetSummaries(db, env, "writing", loaded.content),
  ]);
  const live = loaded.meta.status === "published" ? loaded.published : null;
  const liveSlug = loaded.meta.publishedSlug ?? live?.slug ?? null;
  return {
    meta: loaded.meta,
    content: loaded.content,
    hasPublished: loaded.published !== null,
    issues,
    categories,
    assets,
    previewPath: `/studio/preview/writing/${id}`,
    liveUrls:
      live && liveSlug && !isLinkCard(live)
        ? { zh: `/zh/writing/${liveSlug}`, en: `/en/writing/${liveSlug}` }
        : null,
    outboundUrl: live && isLinkCard(live) ? live.externalUrl : null,
  };
}

function createInput(formData: FormData): Record<string, unknown> {
  const raw = formDataToObject(formData);
  const parsed = WritingDraftSchema.safeParse({
    title: raw.title,
    platform: raw.platform,
    platformLabel: raw.platformLabel,
    externalUrl: raw.externalUrl,
    date: raw.date,
    categoryTermId: raw.categoryTermId,
  });
  if (!parsed.success) {
    throw new CmsError("invalid_content", {
      issues: structuralIssues(parsed.error),
    });
  }
  // An empty slug is generated from the English title by the engine.
  return parsed.data;
}

export async function handleWritingListAction(args: ActionArgs) {
  return handleEntryListIntent("writing", args, createInput);
}

/** `/studio/writing/new`: quick create → 303 to the editor. */
export async function handleWritingCreate(args: ActionArgs) {
  if (args.intent === "create-term") {
    return handleEntryEditorIntent("writing", args, parseWritingForm);
  }
  return handleEntryListIntent(
    "writing",
    { ...args, intent: "create" },
    createInput,
  );
}

export async function handleWritingEditorAction(args: ActionArgs) {
  return handleEntryEditorIntent("writing", args, parseWritingForm);
}
