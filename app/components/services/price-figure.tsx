import type { Locale } from "../../lib/i18n/locale";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import { ServicePrice } from "../pricing/service-price";

/**
 * Price display (design-system §6.14). Wraps the shared `ServicePrice` (the
 * only place that formats NT$ / US$) in the label + figure + note slots. The
 * currency string stays contiguous inside one element so strict e2e matches
 * such as `getByText("NT$4,000")` keep working.
 *
 * en without an FX snapshot renders the unavailable message in the quiet
 * "quote" style instead of the large figure.
 */
export function PriceFigure({
  locale,
  twd,
  fxSnapshot,
  label,
  note,
  size = "l",
}: {
  locale: Locale;
  twd: number;
  fxSnapshot: FxSnapshot | null;
  label?: string;
  note?: string;
  size?: "l" | "s";
}) {
  const unavailable = locale === "en" && !fxSnapshot;
  const figureClass = unavailable
    ? "price__quote"
    : `price__figure${size === "s" ? " price__figure--s" : ""}`;

  return (
    <div className="price">
      {label ? <p className="price__label">{label}</p> : null}
      <p className={figureClass}>
        <ServicePrice locale={locale} twd={twd} fxSnapshot={fxSnapshot} />
      </p>
      {note ? <p className="price__note">{note}</p> : null}
    </div>
  );
}

/** "Contact for quote" in the price slot (software / interactive). */
export function PriceQuote({
  label,
  quote,
}: {
  label?: string;
  quote: string;
}) {
  return (
    <div className="price">
      {label ? <p className="price__label">{label}</p> : null}
      <p className="price__quote">{quote}</p>
    </div>
  );
}

/** Student-discount note, only when the price repository provides a rate. */
export function studentDiscountNote(
  locale: Locale,
  studentDiscountBps: number | null,
): string | undefined {
  if (!studentDiscountBps || studentDiscountBps <= 0) return undefined;
  const percent = Math.round(studentDiscountBps / 100);
  return locale === "zh"
    ? `學生可申請 ${percent}% 優惠，需提供學生身分證明。`
    : `Students can request ${percent}% off with proof of enrollment.`;
}
