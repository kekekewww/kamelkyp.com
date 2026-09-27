/**
 * Studio repository for Recognition (content-schema §2.4, §5.3; admin
 * §2.2, §4.3–4.5) plus the lifecycle intent handlers shared by the two
 * editorial types of package P3 (recognition and writing; `writing.server.ts`
 * reuses them).
 *
 * Route modules stay thin: `withOwner(loadX)` / `withOwnerMutation(handleX)`.
 * Every editor-form intent first saves the working copy when it changed (the
 * form carries `expectedRevision`), so "Archive", "Feature" or "Publish" never
 * silently drop unsaved edits; `revert` and `delete` skip that save on purpose.
 */
import { redirect } from "react-router";
import type { z } from "zod";
import { CmsError } from "../db/errors";
import {
  archiveEntity,
  createEntity,
  deleteEntity,
  duplicateEntity,
  getEntity,
  listEntityOptions,
  publishEntity,
  reorder,
  restoreEntity,
  revertToPublished,
  saveEntity,
  setFeatured,
  unpublishEntity,
  validateEntity,
} from "../db/lifecycle.server";
import { extractAssetRefs } from "../db/usage.server";
import { formDataToObject, readExpectedRevision, readString } from "../forms";
import { parseLocalizedText } from "../localized";
import { getAssets } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import { type MediaSummary, toMediaSummary } from "../media/summary";
import {
  type RecognitionContent,
  RecognitionDraftSchema,
} from "../schemas/recognition";
import type { Term, Vocabulary } from "../schemas/taxonomy";
import type { WritingContent } from "../schemas/writing";
import type { StudioActionArgs, StudioLoaderArgs } from "../studio/auth.server";
import {
  actionError,
  actionOk,
  unknownIntent,
  withCmsErrors,
} from "../studio/responses";
import { createTerm, listTerms } from "../taxonomy.server";
import type {
  EntityMeta,
  EntryStatus,
  LocalizedText,
  ValidationIssue,
} from "../types";
import { structuralIssues } from "../validation";

/* ---------------------------------------------------------------------------
 * Shared by recognition and writing
 * ------------------------------------------------------------------------- */

export type EditorialType = "recognition" | "writing";

export const STATUS_FILTER_VALUES = [
  "active",
  "draft",
  "published",
  "archived",
  "all",
] as const;
export type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

export type ListSort = "public" | "updated";

const LIST_PATH: Record<EditorialType, string> = {
  recognition: "/studio/recognition",
  writing: "/studio/writing",
};

/** Vocabularies each editor may extend inline ("Add type…", "Add category…"). */
const INLINE_VOCABULARIES: Record<EditorialType, readonly Vocabulary[]> = {
  recognition: ["recognition_type"],
  writing: ["writing_category"],
};

export function readStatusFilter(value: string | null): StatusFilterValue {
  return (STATUS_FILTER_VALUES as readonly string[]).includes(value ?? "")
    ? (value as StatusFilterValue)
    : "active";
}

export function readSort(value: string | null): ListSort {
  return value === "updated" ? "updated" : "public";
}

export function readQuery(value: string | null): string {
  return (value ?? "").trim().slice(0, 100);
}

/** SQL list of statuses for a status filter (bound as JSON). */
export function statusesFor(filter: StatusFilterValue): EntryStatus[] {
  switch (filter) {
    case "active":
      return ["draft", "published"];
    case "all":
      return ["draft", "published", "archived"];
    default:
      return [filter];
  }
}

/** JSON with sorted keys: equal content ⇒ equal text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

type ContentFor<T extends EditorialType> = T extends "recognition"
  ? RecognitionContent
  : WritingContent;

export type ParsedEntryForm<T extends EditorialType> = {
  content: ContentFor<T>;
  expectedRevision: number | null;
  clearTodoContent: boolean;
};

export type EntryFormParser<T extends EditorialType> = (
  formData: FormData,
) => ParsedEntryForm<T>;

type ActionArgs = Pick<
  StudioActionArgs,
  "db" | "formData" | "intent" | "now"
> & {
  params: { id?: string };
};

/**
 * Saves the posted working copy when it differs from the stored one (or the
 * TODO_CONTENT flag is being cleared). Returns the current meta either way.
 */
async function saveIfChanged<T extends EditorialType>(
  db: D1Database,
  type: T,
  id: string,
  formData: FormData,
  now: Date,
  parse: EntryFormParser<T>,
): Promise<{ meta: EntityMeta; saved: boolean }> {
  const form = parse(formData);
  if (form.expectedRevision === null) {
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
  const current = await getEntity(db, type, id);
  if (!current) throw new CmsError("not_found");
  const changed =
    stableStringify(form.content) !== stableStringify(current.content);
  if (!changed && !(form.clearTodoContent && current.meta.todoContent)) {
    return { meta: current.meta, saved: false };
  }
  const meta = await saveEntity(
    db,
    type,
    id,
    form.expectedRevision,
    form.content as never,
    now,
    { clearTodoContent: form.clearTodoContent },
  );
  return { meta, saved: true };
}

/**
 * Parses an editor form with a model's draft schema (unknown keys such as
 * `intent` are dropped; structural errors → 422 with inline issues).
 */
export function parseDraftForm<T extends EditorialType>(
  formData: FormData,
  schema: z.ZodType<ContentFor<T>>,
): ParsedEntryForm<T> {
  const raw = formDataToObject(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new CmsError("invalid_content", {
      issues: structuralIssues(parsed.error),
    });
  }
  return {
    content: parsed.data,
    expectedRevision: readExpectedRevision(formData),
    clearTodoContent: raw.clearTodoContent === true,
  };
}

/** `ids` form field: a JSON array of up to 500 id strings, or null. */
function readIds(formData: FormData): string[] | null {
  const raw = readString(formData, "ids");
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Array.isArray(value) &&
      value.length <= 500 &&
      value.every((item) => typeof item === "string" && item.length <= 100)
    ) {
      return value;
    }
  } catch {
    // Malformed list.
  }
  return null;
}

async function createTermInline(
  db: D1Database,
  type: EditorialType,
  formData: FormData,
  now: Date,
) {
  const vocabulary = readString(formData, "vocabulary") ?? "";
  if (!(INLINE_VOCABULARIES[type] as readonly string[]).includes(vocabulary)) {
    return actionError("invalid_request", {
      message: "That list cannot be extended here.",
    });
  }
  const raw = formDataToObject(formData);
  const term = await createTerm(
    db,
    vocabulary as Vocabulary,
    { label: parseLocalizedText(raw.label ?? null) },
    now,
  );
  return actionOk({ intent: "create-term", term });
}

/** List-page intents (admin §2.2): reorder, feature, archive, duplicate… */
export async function handleEntryListIntent(
  type: EditorialType,
  { db, formData, intent, now }: ActionArgs,
  create: (formData: FormData) => Record<string, unknown>,
) {
  if (!formData) return unknownIntent(intent);
  return withCmsErrors(async () => {
    const id = readString(formData, "id") ?? "";
    switch (intent) {
      case "create": {
        const meta = await createEntity(db, type, create(formData), { now });
        return redirect(`${LIST_PATH[type]}/${meta.id}`, 303);
      }
      case "reorder": {
        const ids = readIds(formData);
        if (!ids) {
          return actionError("invalid_request", {
            message: "The new order could not be read. Reload and try again.",
          });
        }
        await reorder(db, type, ids, "sort_order");
        return actionOk({ intent });
      }
      case "feature":
      case "unfeature":
        await setFeatured(db, type, id, intent === "feature");
        return actionOk({ intent, id });
      case "archive":
        return actionOk({
          intent,
          id,
          meta: await archiveEntity(db, type, id, now),
        });
      case "restore":
        return actionOk({
          intent,
          id,
          meta: await restoreEntity(db, type, id, now),
        });
      case "duplicate": {
        const copy = await duplicateEntity(db, type, id, now);
        return actionOk({ intent, id, copyId: copy.id });
      }
      default:
        return unknownIntent(intent);
    }
  });
}

/** Editor intents (admin §2.2, §4.5). */
export async function handleEntryEditorIntent<T extends EditorialType>(
  type: T,
  { db, formData, intent, now, params }: ActionArgs,
  parse: EntryFormParser<T>,
) {
  const id = params.id ?? "";
  if (!formData) return unknownIntent(intent);
  const withContent = formData.has("expectedRevision");
  const saveFirst = async () =>
    withContent
      ? saveIfChanged(db, type, id, formData, now, parse)
      : { meta: null, saved: false };

  return withCmsErrors(async () => {
    switch (intent) {
      case "save": {
        const result = await saveIfChanged(db, type, id, formData, now, parse);
        return actionOk({ intent, ...result });
      }
      case "publish": {
        const { meta, saved } = await saveIfChanged(
          db,
          type,
          id,
          formData,
          now,
          parse,
        );
        const outcome = await publishEntity(db, type, id, meta.revision, now);
        if (!outcome.ok) {
          // The draft is saved; publishing lists what is missing.
          return actionOk({
            intent,
            meta,
            saved,
            published: false,
            issues: outcome.issues,
          });
        }
        return actionOk({ intent, meta: outcome.meta, saved, published: true });
      }
      case "unpublish":
        await saveFirst();
        return actionOk({
          intent,
          meta: await unpublishEntity(db, type, id, now),
        });
      case "archive":
        await saveFirst();
        return actionOk({
          intent,
          meta: await archiveEntity(db, type, id, now),
        });
      case "restore":
        await saveFirst();
        return actionOk({
          intent,
          meta: await restoreEntity(db, type, id, now),
        });
      case "revert": {
        const revision = readExpectedRevision(formData);
        if (revision === null) {
          return actionError("invalid_request", {
            message: "Reload the page, then revert again.",
          });
        }
        return actionOk({
          intent,
          meta: await revertToPublished(db, type, id, revision, now),
        });
      }
      case "duplicate": {
        await saveFirst();
        const copy = await duplicateEntity(db, type, id, now);
        return actionOk({ intent, copyId: copy.id });
      }
      case "delete":
        await deleteEntity(db, type, id, readString(formData, "confirm") ?? "");
        return actionOk({ intent, redirectTo: LIST_PATH[type] });
      case "feature":
      case "unfeature":
        await saveFirst();
        await setFeatured(db, type, id, intent === "feature");
        return actionOk({ intent });
      case "create-term":
        return createTermInline(db, type, formData, now);
      default:
        return unknownIntent(intent);
    }
  });
}

/** Summaries of the assets an entry references (editor fields, pickers). */
export async function assetSummaries(
  db: D1Database,
  env: StudioLoaderArgs["env"],
  type: EditorialType,
  content: RecognitionContent | WritingContent,
): Promise<MediaSummary[]> {
  const ids = [
    ...new Set(extractAssetRefs(type, content).map((ref) => ref.assetId)),
  ];
  if (ids.length === 0) return [];
  const assets = await getAssets(db, ids);
  const config = readMediaConfig(env);
  return [...assets.values()].map((asset) => toMediaSummary(asset, config));
}

export function notFound(): never {
  throw new Response("Not Found", { status: 404 });
}

/* ---------------------------------------------------------------------------
 * Recognition
 * ------------------------------------------------------------------------- */

export type StudioRecognitionRow = {
  id: string;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  hasUnpublishedChanges: boolean;
  sortOrder: number;
  event: LocalizedText;
  organization: LocalizedText;
  result: LocalizedText;
  year: number | null;
  date: string | null;
  typeTermId: string | null;
  updatedAt: string;
};

export type RecognitionListFilters = {
  q: string;
  status: StatusFilterValue;
  year: number | null;
  typeTermId: string | null;
  sort: ListSort;
};

type RecognitionRow = {
  id: string;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  sort_order: number;
  revision: number;
  published_revision: number | null;
  has_snapshot: number;
  event_i18n: string;
  organization_i18n: string;
  result_i18n: string;
  year: number | null;
  date: string | null;
  type_term_id: string | null;
  updated_at: string;
};

function localizedSearch(column: string): string {
  return `COALESCE(json_extract(${column}, '$.zh'), '') || ' ' || COALESCE(json_extract(${column}, '$.en'), '')`;
}

export async function listStudioRecognition(
  db: D1Database,
  filters: Partial<RecognitionListFilters> = {},
): Promise<StudioRecognitionRow[]> {
  const q = filters.q?.trim().toLowerCase() || null;
  const order =
    filters.sort === "updated"
      ? "r.updated_at DESC, r.id"
      : "COALESCE(r.year, -1) DESC, COALESCE(r.date, '') DESC, r.sort_order, r.id";
  const search = [
    localizedSearch("r.event_i18n"),
    localizedSearch("r.organization_i18n"),
    localizedSearch("r.result_i18n"),
    localizedSearch("r.description_i18n"),
    localizedSearch("t.label_i18n"),
    "COALESCE(CAST(r.year AS TEXT), '')",
  ].join(" || ' ' || ");
  const rows = await db
    .prepare(
      `SELECT r.id, r.status, r.todo_content, r.featured, r.sort_order, r.revision,
              r.published_revision, (r.published_json IS NOT NULL) AS has_snapshot,
              r.event_i18n, r.organization_i18n, r.result_i18n, r.year, r.date,
              r.type_term_id, r.updated_at
       FROM recognitions r
       LEFT JOIN taxonomy_terms t ON t.id = r.type_term_id
       WHERE r.status IN (SELECT value FROM json_each(?1))
         AND (?2 IS NULL OR instr(lower(${search}), ?2) > 0)
         AND (?3 IS NULL OR r.year = ?3)
         AND (?4 IS NULL OR r.type_term_id = ?4)
       ORDER BY ${order}
       LIMIT 1000`,
    )
    .bind(
      JSON.stringify(statusesFor(filters.status ?? "active")),
      q,
      filters.year ?? null,
      filters.typeTermId ?? null,
    )
    .all<RecognitionRow>();
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
    event: parseLocalizedText(row.event_i18n),
    organization: parseLocalizedText(row.organization_i18n),
    result: parseLocalizedText(row.result_i18n),
    year: row.year,
    date: row.date,
    typeTermId: row.type_term_id,
    updatedAt: row.updated_at,
  }));
}

export async function getRecognitionFacets(
  db: D1Database,
): Promise<{ years: number[]; types: Term[] }> {
  const [years, types] = await Promise.all([
    db
      .prepare(
        "SELECT DISTINCT year FROM recognitions WHERE year IS NOT NULL ORDER BY year DESC",
      )
      .all<{ year: number }>(),
    listTerms(db, "recognition_type"),
  ]);
  return { years: years.results.map((row) => row.year), types };
}

export function parseRecognitionFilters(url: URL): RecognitionListFilters {
  const params = url.searchParams;
  const year = Number(params.get("year"));
  const type = params.get("type")?.trim() ?? "";
  return {
    q: readQuery(params.get("q")),
    year: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : null,
    typeTermId: type && type.length <= 100 ? type : null,
    status: readStatusFilter(params.get("status")),
    sort: readSort(params.get("sort")),
  };
}

export function parseRecognitionForm(
  formData: FormData,
): ParsedEntryForm<"recognition"> {
  return parseDraftForm<"recognition">(formData, RecognitionDraftSchema);
}

export async function loadRecognitionList({
  db,
  request,
}: Pick<StudioLoaderArgs, "db" | "request">) {
  const filters = parseRecognitionFilters(new URL(request.url));
  const [rows, facets] = await Promise.all([
    listStudioRecognition(db, filters),
    getRecognitionFacets(db),
  ]);
  return { rows, facets, filters };
}

export async function loadRecognitionNew({ db }: Pick<StudioLoaderArgs, "db">) {
  return { types: await listTerms(db, "recognition_type") };
}

export async function loadRecognitionEditor({
  db,
  env,
  params,
}: Pick<StudioLoaderArgs, "db" | "env"> & { params: { id?: string } }) {
  const id = params.id ?? "";
  const loaded = await getEntity(db, "recognition", id);
  if (!loaded) notFound();
  const [issues, types, disciplines, projects, assets] = await Promise.all([
    validateEntity(db, "recognition", id),
    listTerms(db, "recognition_type", { includeArchived: true }),
    listTerms(db, "project_category", { includeArchived: true }),
    listEntityOptions(db, "project", {
      statuses: ["draft", "published", "archived"],
      limit: 200,
    }),
    assetSummaries(db, env, "recognition", loaded.content),
  ]);
  return {
    meta: loaded.meta,
    content: loaded.content,
    hasPublished: loaded.published !== null,
    issues,
    types,
    disciplines,
    projects,
    assets,
    previewPath: `/studio/preview/recognition/${id}`,
  };
}

function createInput(formData: FormData): Record<string, unknown> {
  const raw = formDataToObject(formData);
  const parsed = RecognitionDraftSchema.safeParse({
    event: raw.event,
    typeTermId: raw.typeTermId,
    year: raw.year,
  });
  if (!parsed.success) {
    throw new CmsError("invalid_content", {
      issues: structuralIssues(parsed.error),
    });
  }
  return parsed.data;
}

export async function handleRecognitionListAction(args: ActionArgs) {
  return handleEntryListIntent("recognition", args, createInput);
}

/** `/studio/recognition/new`: quick create → 303 to the editor. */
export async function handleRecognitionCreate(args: ActionArgs) {
  if (args.intent === "create-term") {
    return handleEntryEditorIntent("recognition", args, parseRecognitionForm);
  }
  return handleEntryListIntent(
    "recognition",
    { ...args, intent: "create" },
    createInput,
  );
}

export async function handleRecognitionEditorAction(args: ActionArgs) {
  return handleEntryEditorIntent("recognition", args, parseRecognitionForm);
}

export type { ValidationIssue };
