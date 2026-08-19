import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { enforceSubmissionRateLimit } from "../../lib/commission/submission-rate-limit.server";
import { submitCommission } from "../../lib/commission/submit.server";
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
  existingCaseId: z
    .string()
    .regex(/^KAM-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/)
    .optional(),
});

const SAFE_CODES = new Set([
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
  "case_not_found",
  "case_payload_mismatch",
]);

function safeCode(error: unknown): string {
  if (error instanceof z.ZodError) return "validation_failed";
  if (error instanceof Error && SAFE_CODES.has(error.message)) {
    return error.message;
  }
  return "service_unavailable";
}

function localizedMessage(locale: Locale, code: string): string {
  if (code === "submission_rate_limited") {
    return locale === "zh"
      ? "嘗試次數過多，請稍後再試。"
      : "Too many attempts. Try again later.";
  }
  if (code.startsWith("turnstile_")) {
    return locale === "zh"
      ? "防機器人驗證失敗，請重新驗證。"
      : "Bot verification failed. Verify again.";
  }
  return locale === "zh"
    ? "目前無法送出委託，請檢查資料後再試。"
    : "The commission could not be submitted. Check the details and try again.";
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.get(cloudflareContext).env;
  const requestIp = request.headers.get("CF-Connecting-IP");
  const rayId = request.headers.get("CF-Ray") ?? undefined;
  let locale: Locale = "zh";
  let serviceId: string | undefined;
  try {
    await enforceSubmissionRateLimit(env.SUBMISSION_RATE_LIMITER, requestIp);
    const parsed = EnvelopeSchema.parse(await request.json());
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
    const usesTestChallenge = env.TURNSTILE_SITE_KEY === TEST_SITE_KEY;
    const result = await submitCommission({
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
      turnstileFetcher: fetch,
      allowedHostnames: new Set([
        usesTestChallenge ? "localhost" : new URL(env.APP_ORIGIN).hostname,
      ]),
      expectedAction: usesTestChallenge ? "test" : "commission-submit",
      googleUrl: env.APPS_SCRIPT_URL,
      googleSecret: env.APPS_SCRIPT_HMAC_SECRET,
      googleFetcher: fetch,
      existingCaseId: parsed.existingCaseId,
    });
    if (result.state === "pending_retry") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "retry_required",
            message:
              locale === "zh"
                ? "表單或通知仍在同步中，請保留此頁並重試。"
                : "The form or notification is still syncing. Keep this page and retry.",
            retryCaseId: result.caseId,
          },
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      {
        ok: true,
        data: {
          caseId: result.caseId,
          serviceId: result.serviceId,
          submittedAt: result.submittedAt,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = safeCode(error);
    console.error(JSON.stringify({ code, serviceId, rayId }));
    const publicCode =
      code === "service_unavailable"
        ? "service_unavailable"
        : "validation_failed";
    return Response.json(
      {
        ok: false,
        error: { code: publicCode, message: localizedMessage(locale, code) },
      },
      {
        status: code === "submission_rate_limited" ? 429 : 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
