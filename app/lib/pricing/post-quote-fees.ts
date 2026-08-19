const FEE_BPS = {
  minor_revision: 1000,
  major_revision: 5000,
  project_file: 5000,
} as const;

export type PostQuoteFeeKind = keyof typeof FEE_BPS;

export function calculatePostQuoteFee(
  lockedInitialTwd: number,
  kind: PostQuoteFeeKind,
): number {
  if (!Number.isInteger(lockedInitialTwd) || lockedInitialTwd < 0) {
    throw new Error("invalid_locked_quote");
  }
  return Math.round((lockedInitialTwd * FEE_BPS[kind]) / 10_000);
}
