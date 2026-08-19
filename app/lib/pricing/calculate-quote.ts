import type { PriceRule, QuoteBreakdown, QuoteInput } from "./types";

const BASIS_POINTS = 10_000;

function applyBps(value: number, bps: number): number {
  return Math.round((value * bps) / BASIS_POINTS);
}

export function calculateQuote(
  rule: PriceRule,
  input: QuoteInput,
): QuoteBreakdown {
  if (rule.serviceId !== input.serviceId) {
    throw new Error("price_rule_service_mismatch");
  }

  const isTransition =
    input.serviceId === "simple_transition" ||
    input.serviceId === "edit_transition";

  if (
    isTransition &&
    (!Number.isInteger(input.songCount) || (input.songCount ?? 0) < 1)
  ) {
    throw new Error("song_count_required");
  }

  if (!isTransition && input.consultation) {
    throw new Error("consultation_not_available");
  }

  const additionalSongs = isTransition
    ? Math.max((input.songCount ?? 0) - rule.includedSongs, 0)
    : 0;
  const serviceBaseTwd =
    rule.baseTwd + additionalSongs * rule.perSongAfterIncludedTwd;
  const rushTwd = input.rush ? applyBps(serviceBaseTwd, rule.rushBps) : 0;
  const consultationTwd = input.consultation
    ? applyBps(serviceBaseTwd, rule.consultationBps)
    : 0;
  const sourcePrepTwd = input.sourcePrep
    ? applyBps(serviceBaseTwd, rule.sourcePrepBps)
    : 0;
  const beforeStudentDiscountTwd =
    serviceBaseTwd + rushTwd + consultationTwd + sourcePrepTwd;
  const studentDiscountTwd = input.studentRequested
    ? applyBps(beforeStudentDiscountTwd, rule.studentDiscountBps)
    : 0;

  return {
    serviceBaseTwd,
    rushTwd,
    consultationTwd,
    sourcePrepTwd,
    beforeStudentDiscountTwd,
    studentDiscountTwd,
    lockedInitialTwd: beforeStudentDiscountTwd - studentDiscountTwd,
    studentStatus: input.studentRequested ? "pending_proof" : "not_requested",
  };
}
