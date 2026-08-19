import type { Locale } from "../../lib/i18n/locale";
import { convertTwdToUsdCents } from "../../lib/pricing/fx";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import type { QuoteBreakdown } from "../../lib/pricing/types";

function formatTwd(value: number) {
  return `NT$${new Intl.NumberFormat("en-US").format(value)}`;
}

export function QuoteSummary({
  locale,
  quote,
  fxSnapshot,
}: {
  locale: Locale;
  quote: QuoteBreakdown;
  fxSnapshot: FxSnapshot | null;
}) {
  const format = (value: number) => {
    if (locale === "zh") return formatTwd(value);
    if (!fxSnapshot) return "USD unavailable";
    return `US$${(
      convertTwdToUsdCents(value, fxSnapshot.rateScaled) / 100
    ).toFixed(2)}`;
  };
  const rows = [
    [locale === "zh" ? "服務基價" : "Service base", quote.serviceBaseTwd],
    [locale === "zh" ? "急件" : "Rush", quote.rushTwd],
    [locale === "zh" ? "諮詢" : "Consultation", quote.consultationTwd],
    [locale === "zh" ? "素材整理" : "Source preparation", quote.sourcePrepTwd],
    [
      locale === "zh" ? "學生優惠" : "Student discount",
      -quote.studentDiscountTwd,
    ],
  ] as const;

  return (
    <aside className="quote-summary" aria-labelledby="quote-summary-title">
      <h2 id="quote-summary-title">
        {locale === "zh" ? "目前報價" : "Current quote"}
      </h2>
      <dl>
        {rows
          .filter(([, value]) => value !== 0)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{format(value)}</dd>
            </div>
          ))}
        <div className="quote-summary__total">
          <dt>{locale === "zh" ? "鎖定初始報價" : "Locked initial quote"}</dt>
          <dd>{format(quote.lockedInitialTwd)}</dd>
        </div>
      </dl>
      <p>
        {locale === "zh"
          ? "送出時由伺服器重新計價；學生資格將人工確認。"
          : "The server recalculates this at submission. Student status is reviewed manually."}
      </p>
    </aside>
  );
}
