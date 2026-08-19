import type { PublishedTermDocument } from "../../lib/commission/terms-repository.server";
import type { Locale } from "../../lib/i18n/locale";

export function TermsStep({
  locale,
  terms,
  accepted,
  onAccepted,
  onBack,
  onReview,
}: {
  locale: Locale;
  terms: PublishedTermDocument[];
  accepted: boolean;
  onAccepted(value: boolean): void;
  onBack(): void;
  onReview(): void;
}) {
  const isZh = locale === "zh";
  return (
    <section className="commission-step" aria-labelledby="terms-step-title">
      <header>
        <p className="eyebrow">02 / TERMS</p>
        <h2 id="terms-step-title">{isZh ? "服務條款" : "Service terms"}</h2>
        <p>
          {isZh
            ? "以下文字是目前發布版本；正式上線前仍需完成專業法律審閱。"
            : "These are the currently published versions. Professional legal review remains required before production release."}
        </p>
      </header>
      <div className="commission-terms">
        {terms.map((document) => (
          <article key={document.versionId}>
            <p className="commission-terms__version">
              {document.kind.toUpperCase()} · {document.versionId}
            </p>
            {document.clauses.map((clause) => (
              <section key={clause.key}>
                <h3>{clause.title}</h3>
                <p>{clause.text}</p>
              </section>
            ))}
          </article>
        ))}
      </div>
      <div className="terms-acceptance">
        <input
          id="termsAccepted"
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAccepted(event.target.checked)}
        />
        <label htmlFor="termsAccepted">
          {isZh
            ? "我已閱讀並同意以上服務條款與隱私說明"
            : "I have read and agree to the service terms and privacy notice"}
        </label>
      </div>
      <div className="commission-actions">
        <button type="button" onClick={onBack}>
          {isZh ? "返回資料" : "Back to details"}
        </button>
        <button type="button" disabled={!accepted} onClick={onReview}>
          {isZh ? "複核" : "Review"}
        </button>
      </div>
    </section>
  );
}
