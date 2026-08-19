import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { prepareSubmission } from "../../lib/commission/prepare-submission.server";
import { enforceSubmissionRateLimit } from "../../lib/commission/submission-rate-limit.server";
import { isLocale, type Locale } from "../../lib/i18n/locale";
import { isServiceId } from "../../lib/services/service-id";

const TEST_SITE_KEY = "1x00000000000000000000AA";
const EnvelopeSchema = z.object({
  locale: z.string(),
  draft: z.unknown(),
  clientClaimedTotal: z.number().optional(),
  termVersionIds: z.array(z.string().min(1)),
  termsAccepted: z.literal(true),
  turnstileToken: z.string().min(1),
});

function errorMessage(locale: Locale, code: string): string {
  const zh: Record<string, string> = {
    submission_rate_limited: "嘗試次數過多，請稍後再試。",
    request_ip_missing: "目前無法驗證請求來源，請稍後再試。",
    turnstile_expired: "驗證已過期，請重新驗證。",
    turnstile_failed: "防機器人驗證失敗，請再試一次。",
    term_version_mismatch: "條款已更新，請重新閱讀並同意。",
    fx_rate_stale: "目前無法鎖定美金價格，請稍後再試。",
  };
  const en: Record<string, string> = {
    submission_rate_limited: "Too many attempts. Please try again later.",
    request_ip_missing:
      "The request source could not be verified. Try again later.",
    turnstile_expired: "The verification expired. Please verify again.",
    turnstile_failed: "Bot verification failed. Please try again.",
    term_version_mismatch:
      "The terms changed. Please review and accept them again.",
    fx_rate_stale: "The USD price cannot be locked right now. Try again later.",
  };
  return (
    (locale === "zh" ? zh : en)[code] ??
    (locale === "zh"
      ? "目前無法驗證委託內容，請檢查資料後再試。"
      : "The commission could not be validated. Check the details and try again.")
  );
}

function responseError(locale: Locale, code: string, status: number) {
  return Response.json(
    { ok: false, error: { code, message: errorMessage(locale, code) } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

const SAFE_ERROR_CODES = new Set([
  "request_ip_missing",
  "submission_rate_limited",
  "terms_not_accepted",
  "term_version_mismatch",
  "price_rule_not_found",
  "fx_rate_missing",
  "fx_rate_stale",
  "turnstile_missing",
  "turnstile_unavailable",
  "turnstile_expired",
  "turnstile_failed",
  "turnstile_hostname_mismatch",
  "turnstile_action_mismatch",
]);

function safeErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return "draft_invalid";
  if (error instanceof Error && SAFE_ERROR_CODES.has(error.message)) {
    return error.message;
  }
  return "prepare_failed";
}

export async function action({ request, context }: ActionFunctionArgs) {
  let locale: Locale = "zh";
  let serviceId: string | undefined;
  const rayId = request.headers.get("CF-Ray") ?? undefined;

  try {
    const rawEnvelope = await request.json();
    const parsed = EnvelopeSchema.parse(rawEnvelope);
    if (!isLocale(parsed.locale)) throw new Error("locale_invalid");
    locale = parsed.locale;
    if (
      typeof parsed.draft === "object" &&
      parsed.draft !== null &&
      "serviceId" in parsed.draft &&
      typeof parsed.draft.serviceId === "string" &&
      isServiceId(parsed.draft.serviceId)
    ) {
      serviceId = parsed.draft.serviceId;
    }

    const env = context.get(cloudflareContext).env;
    const requestIp = request.headers.get("CF-Connecting-IP");
    await enforceSubmissionRateLimit(env.SUBMISSION_RATE_LIMITER, requestIp);

    const usesTestChallenge = env.TURNSTILE_SITE_KEY === TEST_SITE_KEY;
    const originHostname = new URL(env.APP_ORIGIN).hostname;
    const prepared = await prepareSubmission({
      db: env.DB,
      locale,
      rawDraft: parsed.draft,
      clientClaimedTotal: parsed.clientClaimedTotal,
      termVersionIds: parsed.termVersionIds,
      termsAccepted: parsed.termsAccepted,
      turnstileToken: parsed.turnstileToken,
      turnstileSecret: env.TURNSTILE_SECRET,
      requestIp: requestIp ?? "",
      now: new Date().toISOString(),
      fetcher: fetch,
      allowedHostnames: new Set([
        usesTestChallenge ? "localhost" : originHostname,
      ]),
      expectedAction: usesTestChallenge ? "test" : "commission-submit",
    });

    return Response.json(
      {
        ok: true,
        data: {
          readyToSubmit: true,
          quote: prepared.quote,
          displayMinor: prepared.displayPrice.minor,
          currency: prepared.displayPrice.currency,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = safeErrorCode(error);
    const status = code === "submission_rate_limited" ? 429 : 400;
    console.error(JSON.stringify({ code, serviceId, rayId }));
    return responseError(locale, code, status);
  }
}
