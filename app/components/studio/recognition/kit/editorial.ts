/**
 * Pure helpers shared by the Recognition and Writing screens (package P3):
 * list grouping, relative times and publish-issue bookkeeping. Client-safe.
 * Candidates for `app/components/studio/ui` once the parallel packages merge.
 */
import type { ValidationIssue } from "../../../../lib/cms/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" · "5 min ago" · "3 h ago" · "2 d ago" · then the date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const elapsed = Math.max(0, now.getTime() - time);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} d ago`;
  return new Date(time).toISOString().slice(0, 10);
}

/** Consecutive rows with the same year (rows arrive in public order). */
export function groupByYear<T>(
  rows: readonly T[],
  yearOf: (row: T) => number | null,
): Array<{ year: number | null; rows: T[] }> {
  const groups: Array<{ year: number | null; rows: T[] }> = [];
  for (const row of rows) {
    const year = yearOf(row);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.rows.push(row);
    else groups.push({ year, rows: [row] });
  }
  return groups;
}

/**
 * Runs of consecutive rows that share a sort key (year + date, or date).
 * Public order sorts by that key first, so the manual order only decides
 * positions inside a run: the list offers reordering there and nowhere else.
 */
export function tieGroups<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): T[][] {
  const groups: T[][] = [];
  let lastKey: string | null = null;
  for (const row of rows) {
    const key = keyOf(row);
    const last = groups[groups.length - 1];
    if (last && key === lastKey) last.push(row);
    else groups.push([row]);
    lastKey = key;
  }
  return groups;
}

/** Issues only the server can judge (assets, slugs, brand, size, TODO flag). */
export const CONTEXT_ISSUE_CODES: ReadonlySet<ValidationIssue["code"]> =
  new Set([
    "alt_required",
    "missing_asset",
    "wrong_asset_kind",
    "slug_taken",
    "brand_name",
    "snapshot_too_large",
    "todo_content",
  ]);

/**
 * The checklist for a form being edited: model rules computed on the client
 * from the current fields, plus the server's context issues from the last
 * load (which the client cannot recompute).
 */
export function mergeIssues(
  client: readonly ValidationIssue[],
  server: readonly ValidationIssue[],
): ValidationIssue[] {
  return [
    ...client,
    ...server.filter((issue) => CONTEXT_ISSUE_CODES.has(issue.code)),
  ];
}

/** Blocking issue count per editor section. */
export function countIssuesBySection(
  issues: readonly ValidationIssue[],
  sectionOf: (field: string) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    const section = sectionOf(issue.field);
    counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}

/** The first blocking message for a field (and locale, when given). */
export function issueFieldError(
  issues: readonly ValidationIssue[],
  field: string,
  locale?: "zh" | "en",
): string | undefined {
  return issues.find(
    (issue) =>
      issue.severity === "error" &&
      issue.field === field &&
      (locale ? issue.locale === locale : true),
  )?.message;
}
