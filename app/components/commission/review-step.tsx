import type { CommissionDraft } from "../../lib/commission/schema";
import type { PublishedTermDocument } from "../../lib/commission/terms-repository.server";
import type { Locale } from "../../lib/i18n/locale";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import type { QuoteBreakdown } from "../../lib/pricing/types";
import { QuoteSummary } from "./quote-summary";

export function ReviewStep({
  locale,
  draft,
  quote,
  fxSnapshot,
  terms,
  onEditDetails,
  onEditTerms,
  onContinue,
}: {
  locale: Locale;
  draft: CommissionDraft;
  quote: QuoteBreakdown;
  fxSnapshot: FxSnapshot | null;
  terms: PublishedTermDocument[];
  onEditDetails(): void;
  onEditTerms(): void;
  onContinue(): void;
}) {
  const isZh = locale === "zh";
  return (
    <section className="commission-step" aria-labelledby="review-step-title">
      <header>
        <p className="eyebrow">03 / REVIEW</p>
        <h2 id="review-step-title">
          {isZh ? "完整複核" : "Review everything"}
        </h2>
        <p>
          {isZh
            ? "送出前確認所有資料；工程與學生證明連結只會顯示給你自己。"
            : "Check every field before submission. Project and student-proof links remain visible to you here."}
        </p>
      </header>
      <article className="review-card">
        <div className="review-card__heading">
          <h3>{isZh ? "委託資料" : "Project details"}</h3>
          <button type="button" onClick={onEditDetails}>
            {isZh ? "編輯專案資料" : "Edit project details"}
          </button>
        </div>
        <dl>
          <div>
            <dt>{isZh ? "稱呼" : "Preferred name"}</dt>
            <dd>{draft.displayName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{draft.email}</dd>
          </div>
          <div>
            <dt>{isZh ? "聯絡方式" : "Contacts"}</dt>
            <dd>
              {draft.contacts
                .map((contact) => `${contact.platform}: ${contact.account}`)
                .join(" · ")}
            </dd>
          </div>
          <div>
            <dt>{isZh ? "工程連結" : "Project links"}</dt>
            <dd>{draft.projectLinks.join(" · ")}</dd>
          </div>
          <div>
            <dt>{isZh ? "用途" : "Purpose"}</dt>
            <dd>{draft.usagePurpose}</dd>
          </div>
          <div>
            <dt>{isZh ? "完整服務欄位" : "Complete service fields"}</dt>
            <dd>
              <pre>{JSON.stringify(draft, null, 2)}</pre>
            </dd>
          </div>
        </dl>
      </article>
      <article className="review-card">
        <div className="review-card__heading">
          <h3>{isZh ? "同意的條款版本" : "Accepted term versions"}</h3>
          <button type="button" onClick={onEditTerms}>
            {isZh ? "返回條款" : "Edit terms"}
          </button>
        </div>
        <ul>
          {terms.map((term) => (
            <li key={term.versionId}>{term.versionId}</li>
          ))}
        </ul>
      </article>
      <QuoteSummary locale={locale} quote={quote} fxSnapshot={fxSnapshot} />
      <div className="commission-actions">
        <button type="button" onClick={onEditTerms}>
          {isZh ? "上一步" : "Back"}
        </button>
        <button type="button" onClick={onContinue}>
          {isZh ? "繼續驗證" : "Continue to verification"}
        </button>
      </div>
    </section>
  );
}
