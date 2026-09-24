/**
 * Shared public-read plumbing: rows in published or preview mode, the view
 * context (media config, referenced assets, taxonomy labels).
 *
 * Published mode reads only `published_json` of rows whose status is
 * 'published' (drafts, archived rows and TODO_CONTENT samples are
 * unreachable). Preview mode reads the working copy of non-archived rows
 * through the same snapshot view and is only called from /studio/preview/*.
 */
import type { Env } from "../../env.server";
import { type ContentOf, descriptorFor } from "../db/tables.server";
import { extractAssetRefs } from "../db/usage.server";
import { parseLocalizedText } from "../localized";
import { getAssets } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import type { Term } from "../schemas/taxonomy";
import type { EntityType } from "../types";
import type { EntryFacts, ReadMode, ViewContext } from "./view-models";

export type EntityRow = {
  id: string;
  json: string;
  featured: number;
  featured_order: number | null;
  sort_order: number;
  todo_content: number;
  published_at: string | null;
  updated_at: string;
};

export type ParsedRow<T extends EntityType> = {
  row: EntityRow;
  content: ContentOf<T>;
  facts: EntryFacts;
};

export async function readEntities<T extends EntityType>(
  db: D1Database,
  type: T,
  mode: ReadMode,
  filter: { where?: string; binds?: unknown[] } = {},
): Promise<ParsedRow<T>[]> {
  const descriptor = descriptorFor(type);
  const common =
    "t.id, t.featured, t.featured_order, t.sort_order, t.todo_content, t.published_at, t.updated_at";
  const where = filter.where ? ` AND (${filter.where})` : "";
  const sql =
    mode === "published"
      ? `SELECT ${common}, t.published_json AS json FROM ${descriptor.table} t
         WHERE t.status = 'published' AND t.published_json IS NOT NULL${where}`
      : `SELECT ${common}, v.snapshot AS json FROM ${descriptor.table} t
         JOIN ${descriptor.view} v ON v.id = t.id
         WHERE t.status <> 'archived'${where}`;
  const rows = await db
    .prepare(sql)
    .bind(...(filter.binds ?? []))
    .all<EntityRow>();
  const parsed: ParsedRow<T>[] = [];
  for (const row of rows.results) {
    let raw: unknown;
    try {
      raw = JSON.parse(row.json);
    } catch {
      console.warn("cms_public_row_invalid", type, row.id);
      continue;
    }
    const result = descriptor.snapshotSchema.safeParse(raw);
    if (!result.success) {
      console.warn("cms_public_row_invalid", type, row.id);
      continue;
    }
    parsed.push({
      row,
      content: result.data,
      facts: {
        id: row.id,
        featured: row.featured === 1,
        todoContent: mode === "preview" && row.todo_content === 1,
        publishedAt: row.published_at,
      },
    });
  }
  return parsed;
}

type TermRow = {
  id: string;
  vocabulary: Term["vocabulary"];
  slug: string;
  label_i18n: string;
  data_json: string;
  sort_order: number;
  archived_at: string | null;
};

export function termsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    "SELECT id, vocabulary, slug, label_i18n, data_json, sort_order, archived_at FROM taxonomy_terms ORDER BY vocabulary, sort_order",
  );
}

export function termsFromRows(rows: readonly TermRow[]): Map<string, Term> {
  return new Map(
    rows.map((row) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(row.data_json);
      } catch {
        data = {};
      }
      return [
        row.id,
        {
          id: row.id,
          vocabulary: row.vocabulary,
          slug: row.slug,
          label: parseLocalizedText(row.label_i18n),
          data,
          sortOrder: row.sort_order,
          archivedAt: row.archived_at,
        },
      ] as const;
    }),
  );
}

export async function loadTerms(db: D1Database): Promise<Map<string, Term>> {
  const rows = await termsStatement(db).all<TermRow>();
  return termsFromRows(rows.results);
}

/** Media config + every asset the given contents reference + all terms. */
export async function buildViewContext<T extends EntityType>(
  db: D1Database,
  env: Env,
  type: T,
  contents: readonly ContentOf<T>[],
  mode: ReadMode,
): Promise<ViewContext> {
  const ids = contents.flatMap((content) =>
    extractAssetRefs(type, content).map((ref) => ref.assetId),
  );
  const [assets, terms] = await Promise.all([
    getAssets(db, ids),
    loadTerms(db),
  ]);
  return { mediaConfig: readMediaConfig(env), assets, terms, mode };
}

export function byPublicOrder<T extends { row: EntityRow }>(a: T, b: T) {
  return a.row.sort_order - b.row.sort_order;
}

export function byFeaturedOrder<T extends { row: EntityRow }>(a: T, b: T) {
  return (
    (a.row.featured_order ?? Number.MAX_SAFE_INTEGER) -
      (b.row.featured_order ?? Number.MAX_SAFE_INTEGER) ||
    a.row.sort_order - b.row.sort_order
  );
}

/** Featured rows first (in featured order), then the rest in public order. */
export function featuredFirst<T extends { row: EntityRow; facts: EntryFacts }>(
  items: readonly T[],
  limit: number,
): T[] {
  const featured = items.filter((item) => item.facts.featured);
  featured.sort(byFeaturedOrder);
  const rest = items.filter((item) => !item.facts.featured);
  return [...featured, ...rest].slice(0, Math.max(0, limit));
}
