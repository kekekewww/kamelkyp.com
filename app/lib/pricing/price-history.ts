/**
 * Price version history (client-safe). Mirrors `getActivePriceRule` exactly:
 *
 *   - the versions at one `effective_from` form a group whose winner is the
 *     latest publish: ORDER BY published_at DESC (NULL last), id DESC;
 *   - a group whose winner is a cancellation (`action = 'cancel'`) is no
 *     change at all: the rule in force before that instant stays in force;
 *   - the active rule is the winner of the newest remaining group with
 *     `effective_from <= at` that is not retired.
 *
 * Strings compare as SQLite compares the TEXT columns. The Studio and the
 * repository classify rows with the same functions, so the "Active" badge is
 * always the rule the wizard quotes with.
 */

export type PriceVersionState =
  | "active"
  | "scheduled"
  | "superseded"
  | "replaced"
  | "cancelled"
  | "retired";

export type PriceHistoryRow = {
  id: string;
  effectiveFrom: string;
  retiredAt: string | null;
  /** From `price_version_publications`; null for seeds and legacy rows. */
  publishedAt: string | null;
  /** Publish metadata action; null/absent for seeds and legacy rows. */
  action?: "publish" | "replace" | "cancel" | null;
};

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/** Sort comparator: the row that wins comes first. */
export function compareForActive(
  a: PriceHistoryRow,
  b: PriceHistoryRow,
): number {
  const effective = desc(a.effectiveFrom, b.effectiveFrom);
  if (effective !== 0) return effective;
  if (a.publishedAt !== b.publishedAt) {
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return desc(a.publishedAt, b.publishedAt);
  }
  return desc(a.id, b.id);
}

function retiredAt(row: PriceHistoryRow, at: string, before: boolean) {
  if (row.retiredAt === null) return false;
  return before ? row.retiredAt < at : row.retiredAt <= at;
}

const isCancel = (row: PriceHistoryRow) => row.action === "cancel";

/** The winner of each `effective_from` group, newest group first. */
function groupWinners<T extends PriceHistoryRow>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const winners: T[] = [];
  for (const row of [...rows].sort(compareForActive)) {
    if (seen.has(row.effectiveFrom)) continue;
    seen.add(row.effectiveFrom);
    winners.push(row);
  }
  return winners;
}

/**
 * The rule active at `at` (`effective_from <= at`, not retired), or with
 * `before` the rule active just before that instant (`effective_from < at`).
 * Cancelled instants are skipped.
 */
export function ruleActiveAt<T extends PriceHistoryRow>(
  rows: readonly T[],
  at: string,
  options: { before?: boolean } = {},
): T | null {
  const before = options.before ?? false;
  const eligible = rows.filter(
    (row) =>
      (before ? row.effectiveFrom < at : row.effectiveFrom <= at) &&
      !retiredAt(row, at, before),
  );
  return groupWinners(eligible).find((row) => !isCancel(row)) ?? null;
}

/** Every row with its state, in the SQL order (newest effective first). */
export function classifyPriceVersions<T extends PriceHistoryRow>(
  rows: readonly T[],
  now: string,
): Array<T & { state: PriceVersionState }> {
  const active = ruleActiveAt(rows, now);
  const winners = new Map<string, T>();
  for (const row of groupWinners(
    rows.filter((row) => !retiredAt(row, now, false)),
  )) {
    winners.set(row.effectiveFrom, row);
  }
  return [...rows].sort(compareForActive).map((row) => {
    const winner = winners.get(row.effectiveFrom);
    let state: PriceVersionState;
    if (retiredAt(row, now, false)) state = "retired";
    else if (active && row.id === active.id) state = "active";
    else if (winner && isCancel(winner)) state = "cancelled";
    else if (winner?.id !== row.id) state = "replaced";
    else if (row.effectiveFrom > now) state = "scheduled";
    else state = "superseded";
    return { ...row, state };
  });
}
