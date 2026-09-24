/**
 * Taxonomy store (content-schema §2.1, §5.2). Vocabulary values are rows,
 * editable in Studio → Settings → Taxonomies; archive is the normal path,
 * delete only when nothing references the term.
 */
import { CmsError } from "./db/errors";
import { parseLocalizedText } from "./localized";
import {
  ServiceGroupDataSchema,
  type Term,
  TermLabelSchema,
  type Vocabulary,
} from "./schemas/taxonomy";
import { fallbackSlug, isValidSlug, slugify, uniqueSlug } from "./slug";
import type { LocalizedText } from "./types";

type TermRow = {
  id: string;
  vocabulary: Vocabulary;
  slug: string;
  label_i18n: string;
  data_json: string;
  sort_order: number;
  archived_at: string | null;
};

const COLUMNS =
  "id, vocabulary, slug, label_i18n, data_json, sort_order, archived_at";

function termFromRow(row: TermRow): Term {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {
    data = {};
  }
  return {
    id: row.id,
    vocabulary: row.vocabulary,
    slug: row.slug,
    label: parseLocalizedText(row.label_i18n),
    data,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}

function invalid(field: string, message: string): CmsError {
  return new CmsError("invalid_content", {
    issues: [{ field, code: "invalid_value", severity: "error", message }],
  });
}

function parseLabel(label: LocalizedText): LocalizedText {
  const parsed = TermLabelSchema.safeParse(label);
  if (!parsed.success) throw invalid("label", "Both labels are required.");
  return parsed.data;
}

function parseData(vocabulary: Vocabulary, data: object | undefined) {
  if (vocabulary !== "service_group") return data ?? {};
  const parsed = ServiceGroupDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw invalid(
      "data.area",
      "Choose the service area this group belongs to.",
    );
  }
  return parsed.data;
}

export async function listTerms(
  db: D1Database,
  vocabulary: Vocabulary,
  options: { includeArchived?: boolean } = {},
): Promise<Term[]> {
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM taxonomy_terms
       WHERE vocabulary = ? AND (? = 1 OR archived_at IS NULL)
       ORDER BY sort_order, slug`,
    )
    .bind(vocabulary, options.includeArchived ? 1 : 0)
    .all<TermRow>();
  return rows.results.map(termFromRow);
}

export async function getTerm(
  db: D1Database,
  id: string,
): Promise<Term | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM taxonomy_terms WHERE id = ?`)
    .bind(id)
    .first<TermRow>();
  return row ? termFromRow(row) : null;
}

/** Terms by id (one statement), e.g. to label categories on public pages. */
export async function getTermsByIds(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, Term>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM taxonomy_terms WHERE id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(unique))
    .all<TermRow>();
  return new Map(
    rows.results.map((row) => [row.id, termFromRow(row)] as const),
  );
}

async function takenSlugs(
  db: D1Database,
  vocabulary: Vocabulary,
  base: string,
) {
  const rows = await db
    .prepare(
      "SELECT slug FROM taxonomy_terms WHERE vocabulary = ? AND (slug = ? OR slug GLOB ?)",
    )
    .bind(vocabulary, base, `${base}-*`)
    .all<{ slug: string }>();
  return new Set(rows.results.map((row) => row.slug));
}

export async function createTerm(
  db: D1Database,
  vocabulary: Vocabulary,
  input: { label: LocalizedText; slug?: string; data?: object },
  now: Date = new Date(),
): Promise<Term> {
  const label = parseLabel(input.label);
  const data = parseData(vocabulary, input.data);
  const requested = input.slug?.trim().toLowerCase();
  if (requested && !isValidSlug(requested)) {
    throw invalid("slug", "Use lowercase letters, digits and hyphens only.");
  }
  const base = requested || slugify(label.en) || fallbackSlug("term");
  const slug = uniqueSlug(base, await takenSlugs(db, vocabulary, base));
  const id = `term-${vocabulary}-${slug}`;
  const timestamp = now.toISOString();
  await db
    .prepare(
      `INSERT INTO taxonomy_terms (id, vocabulary, slug, label_i18n, data_json, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5,
         (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM taxonomy_terms WHERE vocabulary = ?2), ?6, ?6)`,
    )
    .bind(
      id,
      vocabulary,
      slug,
      JSON.stringify(label),
      JSON.stringify(data),
      timestamp,
    )
    .run();
  const term = await getTerm(db, id);
  if (!term) throw new CmsError("not_found");
  return term;
}

export async function updateTerm(
  db: D1Database,
  id: string,
  input: { label?: LocalizedText; slug?: string; data?: object },
  now: Date = new Date(),
): Promise<Term> {
  const current = await getTerm(db, id);
  if (!current) throw new CmsError("not_found");
  const label = input.label ? parseLabel(input.label) : current.label;
  const data =
    input.data !== undefined
      ? parseData(current.vocabulary, input.data)
      : current.data;
  let slug = current.slug;
  if (input.slug !== undefined && input.slug.trim() !== current.slug) {
    const requested = input.slug.trim().toLowerCase();
    if (!isValidSlug(requested)) {
      throw invalid("slug", "Use lowercase letters, digits and hyphens only.");
    }
    const taken = await takenSlugs(db, current.vocabulary, requested);
    if (taken.has(requested)) throw new CmsError("slug_taken");
    slug = requested;
  }
  await db
    .prepare(
      "UPDATE taxonomy_terms SET label_i18n = ?, slug = ?, data_json = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      JSON.stringify(label),
      slug,
      JSON.stringify(data),
      now.toISOString(),
      id,
    )
    .run();
  const term = await getTerm(db, id);
  if (!term) throw new CmsError("not_found");
  return term;
}

/** Hidden from pickers and public filters; references stay valid. */
export async function archiveTerm(
  db: D1Database,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const result = await db
    .prepare(
      "UPDATE taxonomy_terms SET archived_at = COALESCE(archived_at, ?1), updated_at = ?1 WHERE id = ?2",
    )
    .bind(now.toISOString(), id)
    .run();
  if (result.meta.changes === 0) throw new CmsError("not_found");
}

export async function restoreTerm(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE taxonomy_terms SET archived_at = NULL WHERE id = ?")
    .bind(id)
    .run();
}

/** Number of references (content rows and brand capabilities). */
export async function countTermUsage(
  db: D1Database,
  id: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE primary_category_id = ?1) +
         (SELECT COUNT(*) FROM project_categories WHERE term_id = ?1) +
         (SELECT COUNT(*) FROM recognitions WHERE type_term_id = ?1 OR discipline_term_id = ?1) +
         (SELECT COUNT(*) FROM writings WHERE category_term_id = ?1) +
         (SELECT COUNT(*) FROM services WHERE group_term_id = ?1) +
         (SELECT COUNT(*) FROM settings s, json_each(s.data_json, '$.capabilities') c,
            json_each(c.value, '$.categoryIds') x
          WHERE s.key = 'brand' AND x.value = ?1) AS n`,
    )
    .bind(id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Permanent delete of an unused term (throws `term_in_use`). */
export async function deleteTerm(db: D1Database, id: string): Promise<void> {
  if ((await countTermUsage(db, id)) > 0) throw new CmsError("term_in_use");
  try {
    await db.prepare("DELETE FROM taxonomy_terms WHERE id = ?").bind(id).run();
  } catch (error) {
    if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) {
      throw new CmsError("term_in_use");
    }
    throw error;
  }
}

export async function reorderTerms(
  db: D1Database,
  vocabulary: Vocabulary,
  ids: string[],
): Promise<void> {
  await db
    .prepare(
      `UPDATE taxonomy_terms
       SET sort_order = (SELECT (CAST(j.key AS INTEGER) + 1) * 10 FROM json_each(?1) j WHERE j.value = taxonomy_terms.id)
       WHERE vocabulary = ?2 AND id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify([...new Set(ids)]), vocabulary)
    .run();
}
