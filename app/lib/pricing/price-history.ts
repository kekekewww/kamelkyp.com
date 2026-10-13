/**
 * Price version history (client-safe). Mirrors the order of
 * `getActivePriceRule` exactly:
 *
 *   ORDER BY effective_from DESC, published_at DESC (NULL last), id DESC
 *
 * with plain string comparison, as SQLite compares the TEXT columns. The
 * Studio and the repository classify rows with the same functions, so the
 * "Active" badge is always the rule the wizard quotes with.
 */

export type PriceVersionState =
  | "active"
  | "scheduled"
  | "superseded"
  | "replaced"
  | "retired";

export type PriceHistoryRow = {
  id: string;
  effectiveFrom: string;
  retiredAt: string | null;
  /** From `price_version_publications`; null for seeds and legacy rows. */
  publishedAt: string | null;
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

/**
 * The rule active at `at` (`effective_from <= at`, not retired), or with
 * `before` the rule active just before that instant (`effective_from < at`).
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
  return [...eligible].sort(compareForActive)[0] ?? null;
}

/** Every row with its state, in the SQL order (newest effective first). */
export function classifyPriceVersions<T extends PriceHistoryRow>(
  rows: readonly T[],
  now: string,
): Array<T & { state: PriceVersionState }> {
  const active = ruleActiveAt(rows, now);
  const groupWinner = new Map<string, string>();
  for (const row of [...rows].sort(compareForActive)) {
    if (retiredAt(row, now, false)) continue;
    if (!groupWinner.has(row.effectiveFrom)) {
      groupWinner.set(row.effectiveFrom, row.id);
    }
  }
  return [...rows].sort(compareForActive).map((row) => {
    let state: PriceVersionState;
    if (retiredAt(row, now, false)) state = "retired";
    else if (active && row.id === active.id) state = "active";
    else if (groupWinner.get(row.effectiveFrom) !== row.id) state = "replaced";
    else if (row.effectiveFrom > now) state = "scheduled";
    else state = "superseded";
    return { ...row, state };
  });
}
