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

export interface PreparedSubmission {
  normalizedDraft: CommissionDraft;
  quote: QuoteBreakdown;
  displayPrice: {
    locale: Locale;
    currency: "TWD" | "USD";
    minor: number;
  };
  fx: FxSnapshot | null;
  termVersionIds: string[];
  termsAcceptedAt: string;
}

function sameVersions(submitted: string[], active: string[]): boolean {
  if (submitted.length !== active.length) return false;
  if (new Set(submitted).size !== submitted.length) return false;
  const expected = new Set(active);
  return submitted.every((versionId) => expected.has(versionId));
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
}): Promise<PreparedSubmission> {
  const normalizedDraft = CommissionDraftSchema.parse(input.rawDraft);
  if (!input.termsAccepted) throw new Error("terms_not_accepted");

  const activeTerms = await getActiveTerms(
    input.db,
    normalizedDraft.serviceId,
    input.locale,
    input.now,
  );
  const activeTermIds = activeTerms.map((term) => term.versionId);
  if (!sameVersions(input.termVersionIds, activeTermIds)) {
    throw new Error("term_version_mismatch");
  }

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
    termVersionIds: activeTermIds,
    termsAcceptedAt: input.now,
  };
}
