/**
 * Studio → Terms (wp2 §4.5; admin-architecture §2.2; design spec §14, §17.3).
 *
 * Six legal documents x two locales. Editing works on one mutable server
 * draft per document and locale (`term_drafts`); publishing copies the
 * stored, validated draft into a new immutable `term_versions` row, moves the
 * publication pointer with `effective_from = now` and deletes the draft, all
 * in one batch. Publishing needs the legal-review confirmation, which the
 * server re-checks. Drafts are never read by a public route.
 *
 * Legal texts are not brand-blocked (content-architecture §6.5): a
 * personal-name variant is a warning, and the owner's legal reviewer decides.
 */
import {
  type CommissionReadiness,
  getCommissionReadiness,
} from "../../commission/availability.server";
import {
  isTermDocumentId,
  type OutlineItem,
  TERM_DOCUMENT_IDS,
  TERM_DOCUMENT_SERVICE,
  TERM_OUTLINE,
  type TermDocumentId,
} from "../../commission/term-outline";
import {
  parseTermClauses,
  type TermClause,
} from "../../commission/terms-repository.server";
import { getActivePriceRule } from "../../pricing/price-repository.server";
import {
  type ActiveAmounts,
  describeActiveAmounts,
} from "../../pricing/sample-quotes";
import type { ServiceId } from "../../services/service-id";
import { findBrandViolations } from "../brand-guard.server";
import { CmsError, isCmsError } from "../db/errors";
import { readExpectedRevision, readString } from "../forms";
import { parseLocalizedText } from "../localized";
import {
  type ClauseDiff,
  diffClauses,
  parseDraftClauses,
  readDraftClauseRows,
  sameClauses,
  type TermDraftClause,
  validateTermClausesForPublish,
} from "../schemas/term-draft";
import {
  actionError,
  actionOk,
  cmsErrorResult,
  unknownIntent,
} from "../studio/responses";
import type { Locale, LocalizedText, ValidationIssue } from "../types";

export type { TermDocumentId } from "../../commission/term-outline";

export type TermDocumentKind = "common" | "service" | "privacy";

export type TermDocumentInfo = {
  id: TermDocumentId;
  kind: TermDocumentKind;
  serviceId: ServiceId | null;
  /** English Studio label: "General terms", "Service terms · Full Song Mixing". */
  label: string;
  publicPath: "/terms" | "/privacy";
};

export type TermVersionInfo = {
  id: string;
  versionNumber: number;
  createdAt: string;
  /** For the live version: the pointer's effective time. */
  effectiveFrom: string | null;
  clauseCount: number;
  live: boolean;
};

export type TermVersionSummary = TermVersionInfo & { clauses: TermClause[] };

export type TermLocaleState = {
  live: TermVersionInfo | null;
  /** The pointer is in effect now (a legacy pointer may lie in the future). */
  liveEffective: boolean;
  draft: {
    revision: number;
    updatedAt: string;
    baseVersionId: string | null;
    clauseCount: number;
  } | null;
};

export type TermsIndexData = {
  documents: Array<
    TermDocumentInfo & { locales: Record<Locale, TermLocaleState> }
  >;
  readiness: CommissionReadiness[];
  serviceNames: Partial<Record<ServiceId, LocalizedText>>;
  now: string;
};

export type TermEditorData = {
  document: TermDocumentInfo;
  locale: Locale;
  otherLocale: Locale;
  live: TermVersionSummary | null;
  liveEffective: boolean;
  draft: {
    clauses: TermDraftClause[];
    revision: number;
    updatedAt: string;
    baseVersionId: string | null;
  } | null;
  /** Keys of the other locale's draft, else of its live version. */
  otherLocaleKeys: string[];
  /** Newest first. */
  history: TermVersionSummary[];
  /** Publish validation of the draft (else of the live text). */
  issues: ValidationIssue[];
  diff: ClauseDiff | null;
  expected: readonly OutlineItem[];
  /** Service documents: the amounts of the service's active price rule. */
  activeAmounts: ActiveAmounts | null;
  now: string;
};

const LOCALES: readonly Locale[] = ["zh", "en"];

function isLocale(value: string): value is Locale {
  return value === "zh" || value === "en";
}

const notFound = () => new Response("Not Found", { status: 404 });

// ---- Documents -----------------------------------------------------------------

async function serviceNamesOf(
  db: D1Database,
): Promise<Partial<Record<ServiceId, LocalizedText>>> {
  const rows = await db
    .prepare(
      `SELECT commission_service_id AS id,
              COALESCE(json_extract(published_json, '$.core.name_i18n'), name_i18n) AS name
       FROM services WHERE commission_service_id IS NOT NULL`,
    )
    .all<{ id: ServiceId; name: string }>();
  const names: Partial<Record<ServiceId, LocalizedText>> = {};
  for (const row of rows.results) names[row.id] = parseLocalizedText(row.name);
  return names;
}

export function termDocumentInfo(
  id: TermDocumentId,
  serviceNames: Partial<Record<ServiceId, LocalizedText>>,
): TermDocumentInfo {
  if (id === "common") {
    return {
      id,
      kind: "common",
      serviceId: null,
      label: "General terms",
      publicPath: "/terms",
    };
  }
  if (id === "privacy") {
    return {
      id,
      kind: "privacy",
      serviceId: null,
      label: "Privacy notice",
      publicPath: "/privacy",
    };
  }
  const serviceId = TERM_DOCUMENT_SERVICE[id] ?? null;
  const name =
    (serviceId && serviceNames[serviceId]?.en.trim()) || serviceId || id;
  return {
    id,
    kind: "service",
    serviceId,
    label: `Service terms · ${name}`,
    publicPath: "/terms",
  };
}

// ---- Rows ----------------------------------------------------------------------

type PointerRow = {
  document_id: TermDocumentId;
  locale: Locale;
  pointer_from: string;
  id: string;
  version_number: number;
  created_at: string;
  body_json: string;
};

type DraftRow = {
  document_id: TermDocumentId;
  locale: Locale;
  body_json: string;
  base_version_id: string | null;
  revision: number;
  updated_at: string;
};

function clausesOf(body: string): TermClause[] {
  try {
    return parseTermClauses(JSON.parse(body));
  } catch {
    return [];
  }
}

function draftClausesOf(body: string): TermDraftClause[] {
  try {
    const parsed = parseDraftClauses(JSON.parse(body));
    return parsed.ok ? parsed.clauses : [];
  } catch {
    return [];
  }
}

async function pointerRow(
  db: D1Database,
  documentId: TermDocumentId,
  locale: Locale,
): Promise<PointerRow | null> {
  return db
    .prepare(
      `SELECT p.document_id, p.locale, p.effective_from AS pointer_from,
              v.id, v.version_number, v.created_at, v.body_json
       FROM term_publications p JOIN term_versions v ON v.id = p.version_id
       WHERE p.document_id = ? AND p.locale = ?`,
    )
    .bind(documentId, locale)
    .first<PointerRow>();
}

async function draftRow(
  db: D1Database,
  documentId: TermDocumentId,
  locale: Locale,
): Promise<DraftRow | null> {
  return db
    .prepare(
      `SELECT document_id, locale, body_json, base_version_id, revision, updated_at
       FROM term_drafts WHERE document_id = ? AND locale = ?`,
    )
    .bind(documentId, locale)
    .first<DraftRow>();
}

// ---- Loaders -------------------------------------------------------------------

export async function loadTermsIndex(
  db: D1Database,
  now: Date,
): Promise<TermsIndexData> {
  const at = now.toISOString();
  const [names, pointers, drafts, readiness] = await Promise.all([
    serviceNamesOf(db),
    db
      .prepare(
        `SELECT p.document_id, p.locale, p.effective_from AS pointer_from,
                v.id, v.version_number, v.created_at,
                json_array_length(v.body_json) AS clause_count
         FROM term_publications p JOIN term_versions v ON v.id = p.version_id`,
      )
      .all<Omit<PointerRow, "body_json"> & { clause_count: number }>(),
    db
      .prepare(
        `SELECT document_id, locale, revision, updated_at, base_version_id,
                json_array_length(body_json) AS clause_count
         FROM term_drafts`,
      )
      .all<Omit<DraftRow, "body_json"> & { clause_count: number }>(),
    getCommissionReadiness(db, now),
  ]);
  const pointerOf = new Map(
    pointers.results.map((row) => [`${row.document_id}:${row.locale}`, row]),
  );
  const draftOf = new Map(
    drafts.results.map((row) => [`${row.document_id}:${row.locale}`, row]),
  );
  const documents = TERM_DOCUMENT_IDS.map((id) => {
    const locales = {} as Record<Locale, TermLocaleState>;
    for (const locale of LOCALES) {
      const pointer = pointerOf.get(`${id}:${locale}`);
      const draft = draftOf.get(`${id}:${locale}`);
      locales[locale] = {
        live: pointer
          ? {
              id: pointer.id,
              versionNumber: pointer.version_number,
              createdAt: pointer.created_at,
              effectiveFrom: pointer.pointer_from,
              clauseCount: pointer.clause_count,
              live: true,
            }
          : null,
        liveEffective: pointer ? pointer.pointer_from <= at : false,
        draft: draft
          ? {
              revision: draft.revision,
              updatedAt: draft.updated_at,
              baseVersionId: draft.base_version_id,
              clauseCount: draft.clause_count,
            }
          : null,
      };
    }
    return { ...termDocumentInfo(id, names), locales };
  });
  return { documents, readiness, serviceNames: names, now: at };
}

async function activeAmountsFor(
  db: D1Database,
  document: TermDocumentInfo,
  names: Partial<Record<ServiceId, LocalizedText>>,
  now: Date,
): Promise<ActiveAmounts | null> {
  if (!document.serviceId) return null;
  try {
    const rule = await getActivePriceRule(
      db,
      document.serviceId,
      now.toISOString(),
    );
    return describeActiveAmounts(
      names[document.serviceId]?.en.trim() || document.serviceId,
      document.serviceId,
      {
        baseTwd: rule.baseTwd,
        perSongAfterFiveTwd: rule.perSongAfterIncludedTwd,
        studentDiscountBps: rule.studentDiscountBps,
        rushBps: rule.rushBps,
        consultationBps: rule.consultationBps,
        sourcePrepBps: rule.sourcePrepBps,
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "active_price_rule_not_found"
    ) {
      return null;
    }
    throw error;
  }
}

function brandWarnings(clauses: readonly TermDraftClause[]): ValidationIssue[] {
  return findBrandViolations(clauses).map((hit) => ({
    field: `clauses.${hit.field}`,
    code: "brand_name" as const,
    severity: "warning" as const,
    message: `Contains a personal-name variant ("${hit.term}"). Legal texts are exempt from the brand guard; keep it only if your legal reviewer requires an operator identity.`,
  }));
}

type PublishCheck = {
  document: TermDocumentInfo;
  pointer: PointerRow | null;
  history: TermVersionSummary[];
  activeAmounts: ActiveAmounts | null;
};

async function publishCheck(
  db: D1Database,
  documentId: TermDocumentId,
  locale: Locale,
  now: Date,
): Promise<PublishCheck> {
  const [names, pointer, versions] = await Promise.all([
    serviceNamesOf(db),
    pointerRow(db, documentId, locale),
    db
      .prepare(
        `SELECT id, version_number, created_at, effective_from, body_json
         FROM term_versions WHERE document_id = ? AND locale = ?
         ORDER BY version_number DESC`,
      )
      .bind(documentId, locale)
      .all<{
        id: string;
        version_number: number;
        created_at: string;
        effective_from: string | null;
        body_json: string;
      }>(),
  ]);
  const document = termDocumentInfo(documentId, names);
  const history = versions.results.map((row) => {
    const clauses = clausesOf(row.body_json);
    return {
      id: row.id,
      versionNumber: row.version_number,
      createdAt: row.created_at,
      effectiveFrom: row.effective_from,
      clauseCount: clauses.length,
      live: pointer?.id === row.id,
      clauses,
    };
  });
  return {
    document,
    pointer,
    history,
    activeAmounts: await activeAmountsFor(db, document, names, now),
  };
}

/** Errors block publishing; warnings (outline, NT$, names, base) never do. */
function publishIssues(
  clauses: readonly TermDraftClause[],
  check: PublishCheck,
  baseVersionId: string | null | undefined,
): ValidationIssue[] {
  const live = check.pointer ? clausesOf(check.pointer.body_json) : null;
  const outdated =
    baseVersionId !== undefined &&
    check.pointer &&
    baseVersionId !== check.pointer.id
      ? {
          baseVersionNumber:
            check.history.find((version) => version.id === baseVersionId)
              ?.versionNumber ?? null,
          liveVersionNumber: check.pointer.version_number,
        }
      : null;
  return [
    ...validateTermClausesForPublish(clauses, {
      live,
      expected: TERM_OUTLINE[check.document.id],
      activePrice: check.activeAmounts,
      baseOutdated: outdated,
    }),
    ...brandWarnings(clauses),
  ];
}

export async function loadTermEditor(
  db: D1Database,
  documentId: string,
  locale: string,
  now: Date,
): Promise<TermEditorData> {
  if (!isTermDocumentId(documentId) || !isLocale(locale)) throw notFound();
  const otherLocale: Locale = locale === "zh" ? "en" : "zh";
  const [check, draft, otherDraft, otherPointer] = await Promise.all([
    publishCheck(db, documentId, locale, now),
    draftRow(db, documentId, locale),
    draftRow(db, documentId, otherLocale),
    pointerRow(db, documentId, otherLocale),
  ]);
  const liveSummary = check.history.find((version) => version.live) ?? null;
  const live = liveSummary
    ? { ...liveSummary, effectiveFrom: check.pointer?.pointer_from ?? null }
    : null;
  const draftClauses = draft ? draftClausesOf(draft.body_json) : null;
  const otherLocaleKeys = (
    otherDraft
      ? draftClausesOf(otherDraft.body_json)
      : otherPointer
        ? clausesOf(otherPointer.body_json)
        : []
  )
    .map((clause) => clause.key)
    .filter(Boolean);
  return {
    document: check.document,
    locale,
    otherLocale,
    live,
    liveEffective: check.pointer
      ? check.pointer.pointer_from <= now.toISOString()
      : false,
    draft:
      draft && draftClauses
        ? {
            clauses: draftClauses,
            revision: draft.revision,
            updatedAt: draft.updated_at,
            baseVersionId: draft.base_version_id,
          }
        : null,
    otherLocaleKeys,
    history: check.history,
    issues: publishIssues(
      draftClauses ?? live?.clauses ?? [],
      check,
      draft ? draft.base_version_id : undefined,
    ),
    diff: draftClauses
      ? diffClauses(live?.clauses ?? null, draftClauses)
      : null,
    expected: TERM_OUTLINE[documentId],
    activeAmounts: check.activeAmounts,
    now: now.toISOString(),
  };
}

// ---- Form ----------------------------------------------------------------------

/**
 * The posted editor form: `clauses.<i>.{key,title,text}` (lenient: rows with
 * three empty fields are dropped, structural problems are issues),
 * `expectedRevision` and the legal-review checkbox.
 */
export function parseTermDraftForm(formData: FormData): {
  parsed: ReturnType<typeof parseDraftClauses>;
  expectedRevision: number | null;
  legalReviewConfirmed: boolean;
} {
  return {
    parsed: parseDraftClauses(readDraftClauseRows(formData)),
    expectedRevision: readExpectedRevision(formData),
    legalReviewConfirmed: readString(formData, "legalReviewConfirmed") === "on",
  };
}

// ---- Writes --------------------------------------------------------------------

type DraftKey = { documentId: TermDocumentId; locale: Locale };

/**
 * Saves the posted clauses into the draft. `expectedRevision` 0 creates the
 * draft (unless the clauses equal the live version); otherwise the update is
 * revision-checked. An identical body does not bump the revision.
 */
export async function saveTermDraft(
  db: D1Database,
  input: DraftKey & {
    clauses: TermDraftClause[];
    expectedRevision: number;
    now: Date;
  },
): Promise<{ revision: number; updatedAt: string | null; changed: boolean }> {
  const { documentId, locale } = input;
  const body = JSON.stringify(input.clauses);
  const at = input.now.toISOString();
  if (input.expectedRevision === 0) {
    const [existing, pointer] = await Promise.all([
      draftRow(db, documentId, locale),
      pointerRow(db, documentId, locale),
    ]);
    if (existing) throw new CmsError("stale_revision");
    if (pointer && sameClauses(input.clauses, clausesOf(pointer.body_json))) {
      return { revision: 0, updatedAt: null, changed: false };
    }
    const result = await db
      .prepare(
        `INSERT INTO term_drafts
           (document_id, locale, body_json, base_version_id, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(document_id, locale) DO NOTHING`,
      )
      .bind(documentId, locale, body, pointer?.id ?? null, at, at)
      .run();
    if (!result.meta.changes) throw new CmsError("stale_revision");
    return { revision: 1, updatedAt: at, changed: true };
  }
  const current = await draftRow(db, documentId, locale);
  if (!current || current.revision !== input.expectedRevision) {
    throw new CmsError("stale_revision");
  }
  if (current.body_json === body) {
    return {
      revision: current.revision,
      updatedAt: current.updated_at,
      changed: false,
    };
  }
  const result = await db
    .prepare(
      `UPDATE term_drafts SET body_json = ?, revision = revision + 1, updated_at = ?
       WHERE document_id = ? AND locale = ? AND revision = ?`,
    )
    .bind(body, at, documentId, locale, input.expectedRevision)
    .run();
  if (!result.meta.changes) throw new CmsError("stale_revision");
  return { revision: input.expectedRevision + 1, updatedAt: at, changed: true };
}

const PUBLISH_CONFLICT =
  /term_publication_version_mismatch|FOREIGN KEY constraint failed|UNIQUE constraint failed: term_versions/i;

/**
 * Copies the stored draft (at `revision`) into the next immutable version,
 * moves the pointer to it at `now` and deletes the draft, in one batch (a
 * D1 transaction). A moved revision inserts nothing, so the pointer
 * statement fails and the batch rolls back: 409 `stale_revision`.
 */
export async function publishTermDraft(
  db: D1Database,
  input: DraftKey & { revision: number; now: Date },
): Promise<{
  versionId: string;
  versionNumber: number;
  effectiveFrom: string;
}> {
  const id = crypto.randomUUID();
  const at = input.now.toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO term_versions
             (id, document_id, locale, version_number, body_json, created_at, effective_from)
           SELECT ?1, d.document_id, d.locale,
                  COALESCE((SELECT MAX(v.version_number) FROM term_versions v
                            WHERE v.document_id = d.document_id AND v.locale = d.locale), 0) + 1,
                  d.body_json, ?2, ?2
           FROM term_drafts d
           WHERE d.document_id = ?3 AND d.locale = ?4 AND d.revision = ?5`,
        )
        .bind(id, at, input.documentId, input.locale, input.revision),
      db
        .prepare(
          `INSERT INTO term_publications (document_id, locale, version_id, effective_from)
           VALUES (?3, ?4, ?1, ?2)
           ON CONFLICT(document_id, locale) DO UPDATE SET
             version_id = excluded.version_id, effective_from = excluded.effective_from`,
        )
        .bind(id, at, input.documentId, input.locale),
      db
        .prepare(
          "DELETE FROM term_drafts WHERE document_id = ?1 AND locale = ?2 AND revision = ?3",
        )
        .bind(input.documentId, input.locale, input.revision),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (PUBLISH_CONFLICT.test(message)) throw new CmsError("stale_revision");
    throw error;
  }
  const row = await db
    .prepare("SELECT version_number FROM term_versions WHERE id = ?")
    .bind(id)
    .first<{ version_number: number }>();
  if (!row) throw new CmsError("stale_revision");
  return {
    versionId: id,
    versionNumber: row.version_number,
    effectiveFrom: at,
  };
}

export async function discardTermDraft(
  db: D1Database,
  input: DraftKey & { revision: number },
): Promise<void> {
  const result = await db
    .prepare(
      "DELETE FROM term_drafts WHERE document_id = ? AND locale = ? AND revision = ?",
    )
    .bind(input.documentId, input.locale, input.revision)
    .run();
  if (!result.meta.changes) throw new CmsError("stale_revision");
}

/** The stored draft of a document and locale (clauses parsed leniently). */
export async function readTermDraft(
  db: D1Database,
  documentId: TermDocumentId,
  locale: Locale,
): Promise<{
  clauses: TermDraftClause[];
  revision: number;
  baseVersionId: string | null;
} | null> {
  const row = await draftRow(db, documentId, locale);
  return row
    ? {
        clauses: draftClausesOf(row.body_json),
        revision: row.revision,
        baseVersionId: row.base_version_id,
      }
    : null;
}

// ---- Actions -------------------------------------------------------------------

const TERM_INTENTS = new Set(["save", "publish-term-version", "discard-draft"]);

const staleDraft = () =>
  actionError("stale_revision", {
    status: 409,
    message: "This draft changed elsewhere. Reload to see the latest version.",
  });

function blockedMessage(count: number): string {
  return `Saved. Publishing is blocked by ${count} ${count === 1 ? "issue" : "issues"}.`;
}

export async function handleTermEditorAction({
  db,
  documentId,
  locale,
  formData,
  intent,
  now,
}: {
  db: D1Database;
  documentId: string;
  locale: string;
  formData: FormData | null;
  intent: string | null;
  now: Date;
}) {
  if (!isTermDocumentId(documentId) || !isLocale(locale)) throw notFound();
  if (!intent || !TERM_INTENTS.has(intent)) return unknownIntent(intent);
  const form = parseTermDraftForm(formData ?? new FormData());
  const key = { documentId, locale };
  try {
    if (intent === "discard-draft") {
      if (!form.expectedRevision) return staleDraft();
      await discardTermDraft(db, { ...key, revision: form.expectedRevision });
      return actionOk({ discarded: true, message: "Draft discarded" });
    }

    // 1. The legal gate comes first: without it nothing is saved.
    if (intent === "publish-term-version" && !form.legalReviewConfirmed) {
      const message =
        "Confirm that a qualified legal professional has reviewed this version.";
      return actionError("legal_review_required", {
        status: 422,
        message,
        issues: [
          {
            field: "legalReviewConfirmed",
            code: "legal_review_required",
            severity: "error",
            message,
          },
        ],
      });
    }
    if (!form.parsed.ok) {
      return actionError("invalid_content", {
        status: 422,
        message: form.parsed.issues[0]?.message ?? "Check the clauses.",
        issues: form.parsed.issues,
      });
    }
    if (form.expectedRevision === null) return staleDraft();

    // 2. Save the posted form into the draft (revision-checked).
    const saved = await saveTermDraft(db, {
      ...key,
      clauses: form.parsed.clauses,
      expectedRevision: form.expectedRevision,
      now,
    });
    if (intent === "save") {
      return actionOk({
        revision: saved.revision,
        message: saved.changed ? "Saved" : "No changes",
      });
    }

    // 3. Validate the stored draft.
    const [draft, check] = await Promise.all([
      readTermDraft(db, documentId, locale),
      publishCheck(db, documentId, locale, now),
    ]);
    if (!draft) {
      const message = "Nothing to publish: this matches the live version.";
      return actionOk({
        published: false,
        issues: [
          {
            field: "clauses",
            code: "unchanged",
            severity: "error",
            message,
          } satisfies ValidationIssue,
        ],
        message,
      });
    }
    const issues = publishIssues(draft.clauses, check, draft.baseVersionId);
    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length > 0) {
      return actionOk({
        published: false,
        revision: draft.revision,
        issues,
        message: blockedMessage(blocking.length),
      });
    }

    // 4. One batch: version, pointer, draft gone.
    parseTermClauses(draft.clauses);
    const published = await publishTermDraft(db, {
      ...key,
      revision: draft.revision,
      now,
    });
    return actionOk({
      published: true,
      versionId: published.versionId,
      versionNumber: published.versionNumber,
      issues,
      message: `Published ${locale.toUpperCase()} v${published.versionNumber}`,
    });
  } catch (error) {
    if (isCmsError(error) && error.code === "stale_revision") {
      return staleDraft();
    }
    return cmsErrorResult(error);
  }
}
