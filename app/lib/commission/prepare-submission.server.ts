import type { Locale } from "../i18n/locale";
import { verifyTurnstile } from "../integrations/turnstile.server";
import { calculateQuote } from "../pricing/calculate-quote";
import { convertTwdToUsdCents } from "../pricing/fx";
import {
  type FxSnapshot,
  getUsableFxSnapshot,
} from "../pricing/fx-repository.server";
import { getActivePriceRule } from "../pricing/price-repository.server";
import type { QuoteBreakdown } from "../pricing/types";
import { type CommissionDraft, CommissionDraftSchema } from "./schema";
import { getActiveTerms } from "./terms-repository.server";

interface PreparedSubmission {
  normalizedDraft: CommissionDraft;
  quote: QuoteBreakdown;
  displayPrice: {
    locale: Locale;
    currency: "TWD" | "USD";
    minor: number;
  };
  fx: FxSnapshot | null;
  /** The term versions in effect; for a `retry`, the ones submitted. */
  termVersionIds: string[];
  termsAcceptedAt: string;
}

/** The same set of term versions, each once (order does not matter). */
export function sameVersions(
  submitted: readonly string[],
  expected: readonly string[],
): boolean {
  if (submitted.length !== expected.length) return false;
  if (new Set(submitted).size !== submitted.length) return false;
  const known = new Set(expected);
  return submitted.every((versionId) => known.has(versionId));
}

async function activeTermVersionIds(
  db: D1Database,
  serviceId: CommissionDraft["serviceId"],
  locale: Locale,
  now: string,
  submitted: readonly string[],
): Promise<string[]> {
  const activeTerms = await getActiveTerms(db, serviceId, locale, now);
  const activeTermIds = activeTerms.map((term) => term.versionId);
  if (!sameVersions(submitted, activeTermIds)) {
    throw new Error("term_version_mismatch");
  }
  return activeTermIds;
}

export async function prepareSubmission(input: {
  db: D1Database;
  locale: Locale;
  rawDraft: unknown;
  clientClaimedTotal?: number;
  termVersionIds: string[];
  termsAccepted: boolean;
  turnstileToken: string;
  turnstileSecret: string;
  requestIp: string;
  now: string;
  fetcher: typeof fetch;
  allowedHostnames: ReadonlySet<string>;
  expectedAction: string;
  /**
   * A notification retry of a case stored at an earlier submit. That case
   * was accepted under the term versions in effect then, so a later
   * publication does not refuse it: the versions are returned as submitted,
   * and the caller checks them against the stored case (`submitCommission`).
   * Never set it for a submission that may create a case.
   */
  retry?: boolean;
}): Promise<PreparedSubmission> {
  const normalizedDraft = CommissionDraftSchema.parse(input.rawDraft);
  if (!input.termsAccepted) throw new Error("terms_not_accepted");

  const termVersionIds = input.retry
    ? [...input.termVersionIds]
    : await activeTermVersionIds(
        input.db,
        normalizedDraft.serviceId,
        input.locale,
        input.now,
        input.termVersionIds,
      );

  const priceRule = await getActivePriceRule(
    input.db,
    normalizedDraft.serviceId,
    input.now,
  );
  const quote = calculateQuote(priceRule, {
    serviceId: normalizedDraft.serviceId,
    songCount:
      "songs" in normalizedDraft ? normalizedDraft.songs.length : undefined,
    rush: normalizedDraft.rush,
    consultation:
      normalizedDraft.serviceId === "simple_transition"
        ? normalizedDraft.consultation
        : false,
    sourcePrep: normalizedDraft.sourcePrep,
    studentRequested: normalizedDraft.studentRequested,
  });

  const fx =
    input.locale === "en"
      ? await getUsableFxSnapshot(input.db, input.now.slice(0, 10))
      : null;

  await verifyTurnstile({
    token: input.turnstileToken,
    secret: input.turnstileSecret,
    remoteIp: input.requestIp,
    allowedHostnames: input.allowedHostnames,
    expectedAction: input.expectedAction,
    fetcher: input.fetcher,
  });

  return {
    normalizedDraft,
    quote,
    displayPrice:
      input.locale === "zh"
        ? {
            locale: input.locale,
            currency: "TWD",
            minor: quote.lockedInitialTwd,
          }
        : {
            locale: input.locale,
            currency: "USD",
            minor: convertTwdToUsdCents(
              quote.lockedInitialTwd,
              (fx as FxSnapshot).rateScaled,
            ),
          },
    fx,
    termVersionIds,
    termsAcceptedAt: input.now,
  };
}
