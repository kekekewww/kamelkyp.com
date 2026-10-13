/**
 * Legal term drafts (client-safe; wp2 §4.5).
 *
 * - `TermDraftSchema` is lenient: a draft saves with empty fields or no
 *   clauses; only structural problems (over a limit, more than 100 clauses,
 *   a malformed key) block a save.
 * - `validateTermClausesForPublish` is the strict pass. A draft that passes
 *   it also passes `parseTermClauses` (the stored-version parser, which the
 *   server runs once more before inserting); the limits are re-declared here
 *   because a `.server` module cannot reach the client bundle.
 */
import { z } from "zod";
import type { TermClause } from "../../commission/terms-repository.server";
import {
  type ActiveAmounts,
  extractTwdAmounts,
  formatTwd,
} from "../../pricing/sample-quotes";
import type { ValidationIssue } from "../types";

export const TERM_KEY_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

export const TERM_LIMITS = {
  key: 100,
  title: 200,
  text: 8000,
  clauses: 100,
  /** Serialized body, guarding the D1 row size. */
  bodyBytes: 1_000_000,
} as const;

const KEY_FORMAT_MESSAGE =
  "Use lowercase letters and digits, with single - or _ between them (for example deposit_terms).";

export const TermDraftClauseSchema = z.object({
  key: z
    .string()
    .trim()
    .max(TERM_LIMITS.key, `At most ${TERM_LIMITS.key} characters.`)
    .refine((value) => value === "" || TERM_KEY_PATTERN.test(value), {
      message: KEY_FORMAT_MESSAGE,
    }),
  title: z
    .string()
    .trim()
    .max(TERM_LIMITS.title, `At most ${TERM_LIMITS.title} characters.`),
  text: z.string().trim().max(TERM_LIMITS.text, "At most 8,000 characters."),
});

export type TermDraftClause = z.infer<typeof TermDraftClauseSchema>;

export const TermDraftSchema = z
  .array(TermDraftClauseSchema)
  .max(TERM_LIMITS.clauses, `At most ${TERM_LIMITS.clauses} clauses.`);

/** UTF-8 size of the stored body. */
export function serializedBytes(clauses: readonly TermDraftClause[]): number {
  return new TextEncoder().encode(JSON.stringify(clauses)).length;
}

function isEmptyRow(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["key", "title", "text"].every(
    (field) =>
      row[field] === undefined ||
      (typeof row[field] === "string" && row[field].trim() === ""),
  );
}

function issueField(path: ReadonlyArray<PropertyKey>): string {
  return ["clauses", ...path.map(String)].join(".");
}

/**
 * Lenient parse of posted clauses (rows with three empty fields dropped),
 * with structural problems as issues on `clauses.<i>.<field>`.
 */
export function parseDraftClauses(
  raw: unknown,
):
  | { ok: true; clauses: TermDraftClause[] }
  | { ok: false; issues: ValidationIssue[] } {
  const rows = Array.isArray(raw) ? raw.filter((row) => !isEmptyRow(row)) : raw;
  const parsed = TermDraftSchema.safeParse(rows ?? []);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issueField(issue.path),
        code: issue.code === "too_big" ? "too_long" : "invalid_value",
        severity: "error",
        message: issue.message,
      })),
    };
  }
  if (serializedBytes(parsed.data) > TERM_LIMITS.bodyBytes) {
    return { ok: false, issues: [tooLarge()] };
  }
  return { ok: true, clauses: parsed.data };
}

function tooLarge(): ValidationIssue {
  return {
    field: "clauses",
    code: "too_long",
    severity: "error",
    message: "The text is too large to store (over 1,000,000 bytes).",
  };
}

/** Same clauses in the same order (the "unchanged" rule). */
export function sameClauses(
  a: readonly TermClause[],
  b: readonly TermClause[],
): boolean {
  const plain = (list: readonly TermClause[]) =>
    JSON.stringify(list.map(({ key, title, text }) => ({ key, title, text })));
  return plain(a) === plain(b);
}

export type TermPublishContext = {
  /** Clauses of the live version (null when nothing is published). */
  live: readonly TermClause[] | null;
  /** Expected clause keys of the document (term-outline.ts). */
  expected: ReadonlyArray<{ key: string; topic: string }>;
  /** Service documents only: the amounts of the service's active rule. */
  activePrice: ActiveAmounts | null;
  /** Set when the draft started from an older version than the live one. */
  baseOutdated: {
    baseVersionNumber: number | null;
    liveVersionNumber: number;
  } | null;
};

export function baseOutdatedMessage(
  outdated: NonNullable<TermPublishContext["baseOutdated"]>,
): string {
  const base =
    outdated.baseVersionNumber === null
      ? "before any version was published"
      : `from v${outdated.baseVersionNumber}`;
  return `This draft started ${base}; v${outdated.liveVersionNumber} has been published since. Compare before publishing.`;
}

/** Strict publish validation: errors block publishing, warnings never do. */
export function validateTermClausesForPublish(
  clauses: readonly TermDraftClause[],
  context: TermPublishContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (
    field: string,
    code: ValidationIssue["code"],
    message: string,
  ) => issues.push({ field, code, severity: "error", message });
  const warning = (
    field: string,
    code: ValidationIssue["code"],
    message: string,
  ) => issues.push({ field, code, severity: "warning", message });

  if (clauses.length === 0) {
    error("clauses", "required", "Add at least one clause before publishing.");
  }
  if (clauses.length > TERM_LIMITS.clauses) {
    error("clauses", "too_long", `At most ${TERM_LIMITS.clauses} clauses.`);
  }

  const seen = new Map<string, number>();
  clauses.forEach((clause, index) => {
    const n = index + 1;
    const at = (field: string) => `clauses.${index}.${field}`;
    if (!clause.key) {
      error(at("key"), "required", `Clause ${n}: the key is required.`);
    } else if (clause.key.length > TERM_LIMITS.key) {
      error(at("key"), "too_long", `Clause ${n}: the key is too long.`);
    } else if (!TERM_KEY_PATTERN.test(clause.key)) {
      error(at("key"), "invalid_value", `Clause ${n}: ${KEY_FORMAT_MESSAGE}`);
    } else if (seen.has(clause.key)) {
      error(
        at("key"),
        "duplicate_key",
        `Clause ${n}: the key “${clause.key}” is already used by clause ${seen.get(clause.key)}.`,
      );
    } else {
      seen.set(clause.key, n);
    }
    if (!clause.title) {
      error(at("title"), "required", `Clause ${n}: the title is required.`);
    } else if (clause.title.length > TERM_LIMITS.title) {
      error(at("title"), "too_long", `Clause ${n}: the title is too long.`);
    }
    if (!clause.text) {
      error(at("text"), "required", `Clause ${n}: the text is required.`);
    } else if (clause.text.length > TERM_LIMITS.text) {
      error(at("text"), "too_long", `Clause ${n}: the text is too long.`);
    }
  });

  if (serializedBytes(clauses) > TERM_LIMITS.bodyBytes) issues.push(tooLarge());

  if (
    context.live &&
    clauses.length > 0 &&
    sameClauses(clauses, context.live)
  ) {
    error(
      "clauses",
      "unchanged",
      "Nothing to publish: this matches the live version.",
    );
  }

  const keys = new Set(clauses.map((clause) => clause.key));
  for (const item of context.expected) {
    if (keys.has(item.key)) continue;
    warning(
      "clauses",
      "expected_clause",
      `Expected clause “${item.key}” (${item.topic}) is missing.`,
    );
  }

  if (context.activePrice) {
    const known = new Set(context.activePrice.amounts);
    const mentioned = extractTwdAmounts(
      clauses.map((clause) => `${clause.title}\n${clause.text}`).join("\n"),
    ).filter((amount) => !known.has(amount));
    if (mentioned.length > 0) {
      warning(
        "clauses",
        "price_mention",
        `Mentions ${mentioned.map(formatTwd).join(", ")}; ${context.activePrice.text}.`,
      );
    }
  }

  if (context.baseOutdated) {
    warning(
      "clauses",
      "base_outdated",
      baseOutdatedMessage(context.baseOutdated),
    );
  }
  return issues;
}

export type ClauseDiff = {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
};

/** Live → draft by clause key. */
export function diffClauses(
  live: readonly TermClause[] | null,
  draft: readonly TermDraftClause[],
): ClauseDiff {
  const before = new Map<string, TermClause>();
  for (const clause of live ?? []) {
    if (!before.has(clause.key)) before.set(clause.key, clause);
  }
  const after = new Map<string, TermDraftClause>();
  for (const clause of draft) {
    if (clause.key && !after.has(clause.key)) after.set(clause.key, clause);
  }
  const diff: ClauseDiff = {
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
  };
  for (const [key, clause] of after) {
    const old = before.get(key);
    if (!old) diff.added.push(key);
    else if (old.title !== clause.title || old.text !== clause.text) {
      diff.changed.push(key);
    } else diff.unchanged += 1;
  }
  for (const key of before.keys()) {
    if (!after.has(key)) diff.removed.push(key);
  }
  return diff;
}
