import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  clearDraft,
  clearRetryCaseId,
  loadDraft,
  loadRetryCaseId,
  saveDraft,
  saveRetryCaseId,
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

const WIZARD_STEPS: WizardStep[] = ["details", "terms", "review", "verify"];

function stepIndex(index: number) {
  return String(index + 1).padStart(2, "0");
}

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
  serviceName,
  priceRule,
  terms,
  fxSnapshot,
  turnstileSiteKey,
  turnstileAction,
}: {
  locale: Locale;
  serviceId: ServiceId;
  /** The service's display name from its `services` row (route loader). */
  serviceName: string;
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
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [retryCaseId, setRetryCaseId] = useState<string | null>(null);
  const navigate = useNavigate();
  const saveTimer = useRef<number | undefined>(undefined);
  const versionKey = terms.map((term) => term.versionId).join("|");

  useEffect(() => {
    const saved = loadDraft(locale, serviceId);
    if (saved) setDraft(saved);
    setRetryCaseId(loadRetryCaseId(serviceId));
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
    saveTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [draft, loaded, locale]);

  // Clearing storage alone is not enough: a still-pending autosave would write
  // the discarded draft back (e.g. while the success route is loading).
  function discardStoredDraft() {
    window.clearTimeout(saveTimer.current);
    clearDraft(locale, serviceId);
  }

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
    discardStoredDraft();
    clearRetryCaseId(serviceId);
    setRetryCaseId(null);
    setDraft(createEmptyDraft(serviceId));
    setTermsAccepted(false);
    setErrors([]);
    setStep("details");
  }

  async function submitEnvelope() {
    if (!turnstileToken || submitState === "submitting") return;
    setSubmitState("submitting");
    setSubmitMessage("");
    try {
      const response = await fetch("/api/commission/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          draft,
          clientClaimedTotal: quote.lockedInitialTwd,
          termVersionIds: terms.map((term) => term.versionId),
          termsAccepted,
          turnstileToken,
          existingCaseId: retryCaseId ?? undefined,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: {
          caseId: string;
          serviceId: ServiceId;
          submittedAt: string;
        };
        error?: { code?: string; message?: string; retryCaseId?: string };
      };
      if (!response.ok || !result.ok) {
        if (
          result.error?.code === "retry_required" &&
          result.error.retryCaseId
        ) {
          saveRetryCaseId(serviceId, result.error.retryCaseId);
          setRetryCaseId(result.error.retryCaseId);
        }
        throw new Error(result.error?.message ?? "submission_failed");
      }
      if (!result.data) throw new Error("submission_failed");
      discardStoredDraft();
      clearRetryCaseId(serviceId);
      setTermsAccepted(false);
      setTurnstileToken("");
      navigate(`/${locale}/commission/success`, {
        replace: true,
        state: { ...result.data, serviceName },
      });
    } catch (error) {
      setSubmitState("idle");
      setTurnstileToken("");
      setChallengeKey((current) => current + 1);
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : isZh
            ? "送出失敗，請再試一次。"
            : "Submission failed. Please try again.",
      );
    }
  }

  const isZh = locale === "zh";
  const currentIndex = WIZARD_STEPS.indexOf(step);
  return (
    <main
      className="page grid commission-wizard"
      data-draft-ready={loaded ? "true" : "false"}
      id="main-content"
    >
      <header className="commission-wizard__header">
        <p className="eyebrow col-rail">COMMISSION / {serviceId}</p>
        <h1>{serviceName}</h1>
        {/* < md: compact "02 / 04 TERMS"; the full list stays for screen readers. */}
        <p className="stepper__compact" aria-hidden="true">
          <span className="stepper__count">
            {stepIndex(currentIndex)} / {stepIndex(WIZARD_STEPS.length - 1)}
          </span>
          <span className="stepper__compact-label">{step}</span>
        </p>
        <ol
          className="stepper"
          aria-label={isZh ? "委託步驟" : "Commission steps"}
        >
          {WIZARD_STEPS.map((item, index) => (
            <li
              className="stepper__item"
              aria-current={step === item ? "step" : undefined}
              data-state={
                index < currentIndex
                  ? "done"
                  : index === currentIndex
                    ? "current"
                    : "upcoming"
              }
              key={item}
            >
              <span className="stepper__index">{stepIndex(index)}</span>
              <span className="stepper__label">{item}</span>
              {index < currentIndex ? (
                <span className="stepper__check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
              <span className="stepper__bar" aria-hidden="true" />
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
            <p className="commission-step__intro">
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
            <button
              className="button button--ghost"
              type="button"
              onClick={resetCurrentDraft}
            >
              {isZh ? "清除本服務草稿" : "Clear this draft"}
            </button>
            <button
              className="button button--inverse"
              type="button"
              onClick={validateDetails}
            >
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
          <header>
            <p className="eyebrow">04 / VERIFY</p>
            <h2 id="verify-step-title">
              {isZh ? "驗證並送出" : "Verify and submit"}
            </h2>
            <p className="commission-step__intro">
              {isZh
                ? "資料已準備完成。下一階段會在此驗證防機器人並安全送出。"
                : "The envelope is ready. Turnstile is verified immediately before secure submission."}
            </p>
          </header>
          {turnstileSiteKey ? (
            <TurnstileWidget
              key={challengeKey}
              siteKey={turnstileSiteKey}
              action={turnstileAction}
              onToken={setTurnstileToken}
              onError={() => setTurnstileToken("")}
            />
          ) : (
            <p className="commission-notice" role="alert">
              {isZh
                ? "目前無法載入防機器人驗證。"
                : "Bot verification is currently unavailable."}
            </p>
          )}
          {submitMessage ? (
            <p
              className="commission-notice commission-submit-status"
              role="alert"
            >
              {submitMessage}
            </p>
          ) : null}
          <div className="commission-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setStep("review")}
            >
              {isZh ? "返回複核" : "Back to review"}
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={!turnstileToken || submitState === "submitting"}
              onClick={submitEnvelope}
            >
              {submitState === "submitting"
                ? isZh
                  ? "送出中…"
                  : "Submitting…"
                : retryCaseId
                  ? isZh
                    ? "重試通知"
                    : "Retry notification"
                  : isZh
                    ? "送出委託"
                    : "Submit commission"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
