import { z } from "zod";
import type { Locale } from "../i18n/locale";
import type { ServiceId } from "../services/service-id";

const TermClauseSchema = z.object({
  key: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(8000),
});

const TermBodySchema = z.array(TermClauseSchema).min(1).max(100);

export type TermClause = z.infer<typeof TermClauseSchema>;

export function parseTermClauses(value: unknown): TermClause[] {
  return TermBodySchema.parse(value);
}

export interface PublishedTermDocument {
  documentId: string;
  versionId: string;
  kind: "common" | "service" | "privacy";
  clauses: TermClause[];
  effectiveFrom: string;
}

const SERVICE_DOCUMENTS: Record<ServiceId, string> = {
  full_mix: "full-mix",
  vocal_mix: "vocal-mix",
  simple_transition: "simple-transition",
  edit_transition: "edit-transition",
};

interface TermRow {
  document_id: string;
  version_id: string;
  kind: PublishedTermDocument["kind"];
  body_json: string;
  effective_from: string;
}

export async function getActiveTerms(
  db: D1Database,
  serviceId: ServiceId,
  locale: Locale,
  at: string,
): Promise<PublishedTermDocument[]> {
  const serviceDocument = SERVICE_DOCUMENTS[serviceId];
  const rows = await db
    .prepare(
      "SELECT d.id AS document_id, d.kind, p.version_id, v.body_json, " +
        "p.effective_from FROM term_documents d " +
        "JOIN term_publications p ON p.document_id = d.id AND p.locale = ? " +
        "JOIN term_versions v ON v.id = p.version_id " +
        "WHERE d.id IN ('common', 'privacy', ?) AND p.effective_from <= ? " +
        "ORDER BY CASE d.kind WHEN 'common' THEN 1 WHEN 'service' THEN 2 ELSE 3 END",
    )
    .bind(locale, serviceDocument, at)
    .all<TermRow>();

  if (rows.results.length !== 3) throw new Error("active_terms_unavailable");
  return rows.results.map((row) => ({
    documentId: row.document_id,
    versionId: row.version_id,
    kind: row.kind,
    clauses: parseTermClauses(JSON.parse(row.body_json)),
    effectiveFrom: row.effective_from,
  }));
}
