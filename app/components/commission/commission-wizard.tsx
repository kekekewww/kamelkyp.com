import { useEffect, useMemo, useState } from "react";
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from "../../lib/commission/draft.client";
import {
  type CommissionDraft,
  CommissionDraftSchema,
} from "../../lib/commission/schema";
import type { PublishedTermDocument } from "../../lib/commission/terms-repository.server";
import type { Locale } from "../../lib/i18n/locale";
import { calculateQuote } from "../../lib/pricing/calculate-quote";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import type { PriceRule } from "../../lib/pricing/types";
import { getService } from "../../lib/services/catalog";
import type { ServiceId } from "../../lib/services/service-id";
import { CommonFields } from "./common-fields";
import { EditTransitionFields } from "./edit-transition-fields";
import { MixFields } from "./mix-fields";
import { QuoteSummary } from "./quote-summary";
import { ReviewStep } from "./review-step";
import { SimpleTransitionFields } from "./simple-transition-fields";
import { TermsStep } from "./terms-step";
import { TurnstileWidget } from "./turnstile-widget";

type WizardStep = "details" | "terms" | "review" | "verify";

function commonDraft(serviceId: ServiceId) {
  return {
    serviceId,
    displayName: "",
    email: "",
    contacts: [],
    projectLinks: [""],
    usagePurpose: "",
    desiredDate: "",
    adultStatus: "adult" as const,
    guardianAuthorized: false,
    studentRequested: false,
    studentProofUrl: "",
    creditAccountId: "",
    portfolioConsent: false,
    rush: false,
    sourcePrep: false,
  };
}

function createEmptyDraft(serviceId: ServiceId): CommissionDraft {
  const common = commonDraft(serviceId);
  if (serviceId === "full_mix" || serviceId === "vocal_mix") {
    return {
      ...common,
      serviceId,
      genre: "",
      referenceUrls: [""],
      bpm: "",
      key: "",
      direction: "",
    };
  }
  if (serviceId === "simple_transition") {
    return {
      ...common,
      serviceId,
      songs: [{ order: 1, url: "", transitionAt: "" }],
      sequenceConfirmed: false,
      targetDuration: "",
      seamless: false,
      transitionStyle: "",
      consultation: false,
    };
  }
  return {
    ...common,
    serviceId,
    songs: [{ order: 1, url: "", segmentDuration: "", transitionPoint: "" }],
    targetDuration: "",
    transitionStyle: "",
    referenceUrls: [],
    cuts: "",
    reorderNotes: "",
    tempoPitchNotes: "",
    introOutroNotes: "",
    effectNotes: "",
  };
}

function errorFieldId(path: PropertyKey[]): string {
  const field = String(path[0] ?? "displayName");
  if (field === "contacts") return "contact-platform-0";
  if (field === "projectLinks") return "project-link-0";
  if (field === "referenceUrls") return "referenceUrl";
  if (field === "songs") return "song-url-0";
  return field;
}

export function CommissionWizard({
  locale,
  serviceId,
  priceRule,
  terms,
  fxSnapshot,
  turnstileSiteKey,
  turnstileAction,
}: {
  locale: Locale;
  serviceId: ServiceId;
  priceRule: PriceRule;
  terms: PublishedTermDocument[];
  fxSnapshot: FxSnapshot | null;
  turnstileSiteKey: string;
  turnstileAction: string;
}) {
  const [draft, setDraft] = useState<CommissionDraft>(() =>
    createEmptyDraft(serviceId),
  );
  const [step, setStep] = useState<WizardStep>("details");
  const [loaded, setLoaded] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "ready"
  >("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const service = getService(serviceId);
  const versionKey = terms.map((term) => term.versionId).join("|");

  useEffect(() => {
    const saved = loadDraft(locale, serviceId);
    if (saved) setDraft(saved);
    setLoaded(true);
  }, [locale, serviceId]);

  useEffect(() => {
    if (versionKey) setTermsAccepted(false);
  }, [versionKey]);

  useEffect(() => {
    if (!loaded) return;
    const parsed = CommissionDraftSchema.safeParse(draft);
    if (!parsed.success) return;
    const timer = window.setTimeout(() => saveDraft(locale, parsed.data), 300);
    return () => window.clearTimeout(timer);
  }, [draft, loaded, locale]);

  const quote = useMemo(
    () =>
      calculateQuote(priceRule, {
        serviceId,
        songCount: "songs" in draft ? draft.songs.length : undefined,
        rush: draft.rush,
        consultation:
          draft.serviceId === "simple_transition" ? draft.consultation : false,
        sourcePrep: draft.sourcePrep,
        studentRequested: draft.studentRequested,
      }),
    [draft, priceRule, serviceId],
  );

  function updateField(name: string, value: unknown) {
    setDraft((current) => ({ ...current, [name]: value }) as CommissionDraft);
  }

  function validateDetails() {
    const result = CommissionDraftSchema.safeParse(draft);
    if (result.success) {
      setDraft(result.data);
      setErrors([]);
      setStep("terms");
      return;
    }

    const messages = result.error.issues.map((issue) => issue.message);
    setErrors([...new Set(messages)]);
    const firstId = errorFieldId(result.error.issues[0]?.path ?? []);
    window.setTimeout(() => document.getElementById(firstId)?.focus(), 0);
  }

  function resetCurrentDraft() {
    clearDraft(locale, serviceId);
    setDraft(createEmptyDraft(serviceId));
    setTermsAccepted(false);
    setErrors([]);
    setStep("details");
  }

  async function validateEnvelope() {
    if (!turnstileToken || submitState === "submitting") return;
    setSubmitState("submitting");
    setSubmitMessage("");
    try {
      const response = await fetch("/api/commission/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          draft,
          clientClaimedTotal: quote.lockedInitialTwd,
          termVersionIds: terms.map((term) => term.versionId),
          termsAccepted,
          turnstileToken,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? "prepare_failed");
      }
      setSubmitState("ready");
      setSubmitMessage(
        isZh
          ? "驗證完成。草稿仍保留在此裝置，待安全送出閘道啟用。"
          : "Validation complete. Your draft remains on this device until the secure submission gateway is enabled.",
      );
    } catch (error) {
      setSubmitState("idle");
      setTurnstileToken("");
      setChallengeKey((current) => current + 1);
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : isZh
            ? "驗證失敗，請再試一次。"
            : "Verification failed. Please try again.",
      );
    }
  }

  const isZh = locale === "zh";
  return (
    <main className="commission-wizard" id="main-content">
      <header className="commission-wizard__header">
        <p className="eyebrow">COMMISSION / {serviceId}</p>
        <h1>{service.name[locale]}</h1>
        <ol aria-label={isZh ? "委託步驟" : "Commission steps"}>
          {["details", "terms", "review", "verify"].map((item, index) => (
            <li aria-current={step === item ? "step" : undefined} key={item}>
              {String(index + 1).padStart(2, "0")} · {item}
            </li>
          ))}
        </ol>
      </header>

      {step === "details" ? (
        <section
          className="commission-step"
          aria-labelledby="details-step-title"
        >
          <header>
            <p className="eyebrow">01 / DETAILS</p>
            <h2 id="details-step-title">
              {isZh ? "填寫委託內容" : "Project details"}
            </h2>
            <p>
              {isZh
                ? "不接受檔案上傳；請提供 Google Drive、Dropbox、MediaFire 或其他 HTTPS 下載連結。"
                : "Files cannot be uploaded here. Provide Google Drive, Dropbox, MediaFire or another HTTPS download link."}
            </p>
          </header>
          {errors.length ? (
            <div className="error-summary" role="alert">
              <h3>{isZh ? "請修正以下內容" : "Please fix the following"}</h3>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <form noValidate onSubmit={(event) => event.preventDefault()}>
            <CommonFields
              draft={draft}
              locale={locale}
              updateField={updateField}
            />
            <MixFields
              draft={draft}
              locale={locale}
              updateField={updateField}
            />
            <SimpleTransitionFields
              draft={draft}
              locale={locale}
              updateField={updateField}
            />
            <EditTransitionFields
              draft={draft}
              locale={locale}
              updateField={updateField}
            />
          </form>
          <QuoteSummary locale={locale} quote={quote} fxSnapshot={fxSnapshot} />
          <div className="commission-actions">
            <button type="button" onClick={resetCurrentDraft}>
              {isZh ? "清除本服務草稿" : "Clear this draft"}
            </button>
            <button type="button" onClick={validateDetails}>
              {isZh ? "下一步" : "Next"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "terms" ? (
        <TermsStep
          locale={locale}
          terms={terms}
          accepted={termsAccepted}
          onAccepted={setTermsAccepted}
          onBack={() => setStep("details")}
          onReview={() => setStep("review")}
        />
      ) : null}

      {step === "review" ? (
        <ReviewStep
          locale={locale}
          draft={draft}
          quote={quote}
          fxSnapshot={fxSnapshot}
          terms={terms}
          onEditDetails={() => setStep("details")}
          onEditTerms={() => setStep("terms")}
          onContinue={() => setStep("verify")}
        />
      ) : null}

      {step === "verify" ? (
        <section
          className="commission-step"
          aria-labelledby="verify-step-title"
        >
          <p className="eyebrow">04 / VERIFY</p>
          <h2 id="verify-step-title">
            {isZh ? "驗證並送出" : "Verify and submit"}
          </h2>
          <p>
            {isZh
              ? "資料已準備完成。下一階段會在此驗證防機器人並安全送出。"
              : "The envelope is ready. The next stage verifies Turnstile and submits it securely."}
          </p>
          {turnstileSiteKey ? (
            <TurnstileWidget
              key={challengeKey}
              siteKey={turnstileSiteKey}
              action={turnstileAction}
              onToken={setTurnstileToken}
              onError={() => setTurnstileToken("")}
            />
          ) : (
            <p role="alert">
              {isZh
                ? "目前無法載入防機器人驗證。"
                : "Bot verification is currently unavailable."}
            </p>
          )}
          {submitMessage ? (
            <p
              className="commission-submit-status"
              role={submitState === "ready" ? "status" : "alert"}
            >
              {submitMessage}
            </p>
          ) : null}
          <div className="commission-actions">
            <button type="button" onClick={() => setStep("review")}>
              {isZh ? "返回複核" : "Back to review"}
            </button>
            <button
              type="button"
              disabled={!turnstileToken || submitState === "submitting"}
              onClick={validateEnvelope}
            >
              {submitState === "submitting"
                ? isZh
                  ? "驗證中…"
                  : "Validating…"
                : isZh
                  ? "驗證委託"
                  : "Validate commission"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
