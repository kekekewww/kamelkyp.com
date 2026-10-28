import {
  parseTermClauses,
  type TermClause,
} from "../commission/terms-repository.server";
import type { Locale } from "../i18n/locale";

export interface PublishedTerm {
  documentId: string;
  kind: "common" | "service" | "privacy";
  serviceId: string | null;
  locale: Locale;
  clauses: TermClause[];
  effectiveFrom: string;
}

interface TermRow {
  document_id: string;
  kind: PublishedTerm["kind"];
  service_id: string | null;
  locale: Locale;
  body_json: string;
  effective_from: string;
}

/**
 * The published legal documents of `/terms` or `/privacy` that are in effect
 * at `at` (the same "effective now" rule as the wizard's `getActiveTerms`).
 */
export async function listPublishedTerms(
  db: D1Database,
  locale: Locale,
  kind: "terms" | "privacy",
  at: string = new Date().toISOString(),
): Promise<PublishedTerm[]> {
  const kinds = kind === "privacy" ? ["privacy"] : ["common", "service"];
  const placeholders = kinds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT
        d.id AS document_id,
        d.kind,
        d.service_id,
        v.locale,
        v.body_json,
        p.effective_from
      FROM term_documents d
      JOIN term_publications p
        ON p.document_id = d.id AND p.locale = ?
      JOIN term_versions v ON v.id = p.version_id
      WHERE d.kind IN (${placeholders}) AND p.effective_from <= ?
      ORDER BY CASE d.kind WHEN 'common' THEN 0 ELSE 1 END, d.id`,
    )
    .bind(locale, ...kinds, at)
    .all<TermRow>();

  return rows.results.map((row) => ({
    documentId: row.document_id,
    kind: row.kind,
    serviceId: row.service_id,
    locale: row.locale,
    clauses: parseTermClauses(JSON.parse(row.body_json)),
    effectiveFrom: row.effective_from,
  }));
}
