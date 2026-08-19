import type { Locale } from "../../lib/i18n/locale";
import { convertTwdToUsdCents } from "../../lib/pricing/fx";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";

export function ServicePrice({
  locale,
  twd,
  fxSnapshot,
}: {
  locale: Locale;
  twd: number;
  fxSnapshot: FxSnapshot | null;
}) {
  if (locale === "zh") {
    return <span>{`NT$${new Intl.NumberFormat("en-US").format(twd)}`}</span>;
  }
  if (!fxSnapshot) {
    return <span>USD temporarily unavailable</span>;
  }

  const cents = convertTwdToUsdCents(twd, fxSnapshot.rateScaled);
  return (
    <span title={`Estimated today · ${fxSnapshot.rateDate}`}>
      {`US$${(cents / 100).toFixed(2)}`}
      <small> Estimated today</small>
    </span>
  );
}
