import { createRandomCaseId } from "../cases/case-id";
import {
  createCaseAttempt,
  getSubmissionAttempt,
  updateSubmissionAttempt,
} from "../cases/case-repository.server";
import { sendToGoogle } from "../integrations/google-submission-gateway.server";
import { convertTwdToUsdCents } from "../pricing/fx";
import { prepareSubmission } from "./prepare-submission.server";

export interface SubmissionSuccess {
  caseId: string;
  serviceId: "full_mix" | "vocal_mix" | "simple_transition" | "edit_transition";
  submittedAt: string;
}

export type SubmitCommissionResult =
  | ({ state: "complete" } & SubmissionSuccess)
  | ({ state: "pending_retry" } & SubmissionSuccess);

async function sha256Json(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function submitCommission(input: {
  db: D1Database;
  locale: "zh" | "en";
  rawDraft: unknown;
  clientClaimedTotal?: number;
  termVersionIds: string[];
  termsAccepted: boolean;
  turnstileToken: string;
  turnstileSecret: string;
  requestIp: string;
  now: string;
  turnstileFetcher: typeof fetch;
  allowedHostnames: ReadonlySet<string>;
  expectedAction: string;
  googleUrl: string;
  googleSecret: string;
  googleFetcher: typeof fetch;
  existingCaseId?: string;
  caseIdFactory?: () => string;
}): Promise<SubmitCommissionResult> {
  const prepared = await prepareSubmission({
    db: input.db,
    locale: input.locale,
    rawDraft: input.rawDraft,
    clientClaimedTotal: input.clientClaimedTotal,
    termVersionIds: input.termVersionIds,
    termsAccepted: input.termsAccepted,
    turnstileToken: input.turnstileToken,
    turnstileSecret: input.turnstileSecret,
    requestIp: input.requestIp,
    now: input.now,
    fetcher: input.turnstileFetcher,
    allowedHostnames: input.allowedHostnames,
    expectedAction: input.expectedAction,
  });

  const hashBasis = {
    locale: input.locale,
    normalizedDraft: prepared.normalizedDraft,
    quote: prepared.quote,
    displayPrice: prepared.displayPrice,
    fx: prepared.fx,
    termVersionIds: prepared.termVersionIds,
  };
  const payloadHash = await sha256Json(hashBasis);
  const existing = input.existingCaseId
    ? await getSubmissionAttempt(input.db, input.existingCaseId)
    : null;
  if (input.existingCaseId && !existing) throw new Error("case_not_found");
  if (existing && existing.payloadHash !== payloadHash) {
    throw new Error("case_payload_mismatch");
  }
  if (existing?.state === "complete") {
    return {
      state: "complete",
      caseId: existing.caseId,
      serviceId: existing.serviceId,
      submittedAt: existing.submittedAt,
    };
  }

  const caseId =
    existing?.caseId ??
    (input.caseIdFactory ?? (() => createRandomCaseId(new Date(input.now))))();
  const submittedAt = existing?.submittedAt ?? input.now;
  const termsAcceptedAt = existing?.termsAcceptedAt ?? prepared.termsAcceptedAt;
  const lockedPriceMinor =
    existing?.lockedPriceMinor ?? prepared.displayPrice.minor;
  const currency = existing?.currency ?? prepared.displayPrice.currency;

  if (!existing) {
    const studentRequested = prepared.normalizedDraft.studentRequested;
    const standardPriceMinor =
      input.locale === "zh"
        ? prepared.quote.beforeStudentDiscountTwd
        : convertTwdToUsdCents(
            prepared.quote.beforeStudentDiscountTwd,
            prepared.fx?.rateScaled ?? 0,
          );
    await createCaseAttempt(input.db, {
      caseId,
      serviceId: prepared.normalizedDraft.serviceId,
      lockedPriceMinor,
      currency,
      submittedAt,
      payloadHash,
      termVersionIds: prepared.termVersionIds,
      termsAcceptedAt,
      studentReviewState: studentRequested ? "pending" : "none",
      standardPriceMinor: studentRequested ? standardPriceMinor : null,
      studentPriceMinor: studentRequested ? lockedPriceMinor : null,
    });
  }

  const googlePayload = {
    caseId,
    submittedAt,
    locale: input.locale,
    serviceId: prepared.normalizedDraft.serviceId,
    lockedPrice: { minor: lockedPriceMinor, currency },
    normalizedDraft: prepared.normalizedDraft,
    quote: prepared.quote,
    fx: prepared.fx,
    terms: {
      versionIds: prepared.termVersionIds,
      acceptedAt: termsAcceptedAt,
    },
  };

  try {
    const google = await sendToGoogle({
      url: input.googleUrl,
      secret: input.googleSecret,
      caseId,
      payload: googlePayload,
      now: input.now,
      fetcher: input.googleFetcher,
    });
    await updateSubmissionAttempt(input.db, {
      caseId,
      state: "complete",
      googleResponseId: google.googleResponseId,
      updatedAt: input.now,
    });
    return {
      state: "complete",
      caseId,
      serviceId: prepared.normalizedDraft.serviceId,
      submittedAt,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "google_sync_failed";
    if (
      ![
        "google_mail_pending",
        "google_transport_failed",
        "google_sync_failed",
      ].includes(code)
    ) {
      throw error;
    }
    await updateSubmissionAttempt(input.db, {
      caseId,
      state: code === "google_mail_pending" ? "form_written" : "failed",
      lastErrorCode: code,
      updatedAt: input.now,
    });
    return {
      state: "pending_retry",
      caseId,
      serviceId: prepared.normalizedDraft.serviceId,
      submittedAt,
    };
  }
}
