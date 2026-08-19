import {
  parseTermClauses,
  type TermClause,
} from "../commission/terms-repository.server";
import type { Locale } from "../i18n/locale";

export interface AdminTermVersion {
  id: string;
  documentId: string;
  locale: Locale;
  versionNumber: number;
  clauses: TermClause[];
  effectiveFrom: string;
}

export async function listTermVersions(
  db: D1Database,
): Promise<AdminTermVersion[]> {
  const rows = await db
    .prepare(
      "SELECT id, document_id, locale, version_number, body_json, effective_from " +
        "FROM term_versions ORDER BY document_id, locale, version_number DESC",
    )
    .all<{
      id: string;
      document_id: string;
      locale: Locale;
      version_number: number;
      body_json: string;
      effective_from: string;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    locale: row.locale,
    versionNumber: row.version_number,
    clauses: parseTermClauses(JSON.parse(row.body_json)),
    effectiveFrom: row.effective_from,
  }));
}

export async function publishTermVersion(input: {
  db: D1Database;
  documentId: string;
  locale: Locale;
  clauses: TermClause[];
  effectiveFrom: string;
  legalReviewConfirmed: boolean;
}): Promise<AdminTermVersion> {
  if (!input.legalReviewConfirmed) throw new Error("legal_review_required");
  const clauses = parseTermClauses(input.clauses);
  if (!Number.isFinite(Date.parse(input.effectiveFrom))) {
    throw new Error("invalid_effective_from");
  }
  const document = await input.db
    .prepare("SELECT id FROM term_documents WHERE id = ?")
    .bind(input.documentId)
    .first<{ id: string }>();
  if (!document) throw new Error("term_document_not_found");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await input.db.batch([
    input.db
      .prepare(
        "INSERT INTO term_versions " +
          "(id, document_id, locale, version_number, body_json, created_at, effective_from) " +
          "SELECT ?, ?, ?, COALESCE(MAX(version_number), 0) + 1, ?, ?, ? " +
          "FROM term_versions WHERE document_id = ? AND locale = ?",
      )
      .bind(
        id,
        input.documentId,
        input.locale,
        JSON.stringify(clauses),
        now,
        input.effectiveFrom,
        input.documentId,
        input.locale,
      ),
    input.db
      .prepare(
        "INSERT INTO term_publications (document_id, locale, version_id, effective_from) " +
          "VALUES (?, ?, ?, ?) ON CONFLICT(document_id, locale) DO UPDATE SET " +
          "version_id = excluded.version_id, effective_from = excluded.effective_from",
      )
      .bind(input.documentId, input.locale, id, input.effectiveFrom),
  ]);
  const row = await input.db
    .prepare("SELECT version_number FROM term_versions WHERE id = ?")
    .bind(id)
    .first<{ version_number: number }>();
  if (!row) throw new Error("term_publish_failed");
  return {
    id,
    documentId: input.documentId,
    locale: input.locale,
    versionNumber: row.version_number,
    clauses,
    effectiveFrom: input.effectiveFrom,
  };
}
