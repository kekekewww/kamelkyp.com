import {
  parseTermClauses,
  type TermClause,
} from "../commission/terms-repository.server";
import {
  type ContentKind,
  getPublishedContent,
  listPublishedContentRecords,
  type PublishedContent,
} from "../db/content-repository.server";
import type { Locale } from "../i18n/locale";
import { type ContentBlock, ContentBlocksSchema } from "./block-schema";

export interface PublicContent extends Omit<PublishedContent, "body"> {
  body: ContentBlock[];
}

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

function parseBlocks(value: unknown): ContentBlock[] {
  const parsed = ContentBlocksSchema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_published_content");
  return parsed.data;
}

function toPublicContent(content: PublishedContent): PublicContent {
  return { ...content, body: parseBlocks(content.body) };
}

export async function listPublishedContent(
  db: D1Database,
  kind: Extract<ContentKind, "work" | "post">,
  locale: Locale,
): Promise<PublicContent[]> {
  const records = await listPublishedContentRecords(db, kind, locale);
  return records.map(toPublicContent);
}

export async function getPublicContent(
  db: D1Database,
  kind: Extract<ContentKind, "work" | "post">,
  slug: string,
  locale: Locale,
): Promise<PublicContent | null> {
  const content = await getPublishedContent(db, kind, slug, locale);
  return content ? toPublicContent(content) : null;
}

export async function listPublishedTerms(
  db: D1Database,
  locale: Locale,
  kind: "terms" | "privacy",
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
      WHERE d.kind IN (${placeholders})
      ORDER BY CASE d.kind WHEN 'common' THEN 0 ELSE 1 END, d.id`,
    )
    .bind(locale, ...kinds)
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
