/**
 * Exchange rate status (wp2 §4.3, §4.9). English prices follow the daily
 * TWD→USD snapshot; after three business days without an update they show
 * as unavailable and English commissions cannot be submitted (design spec
 * §4.2). "Refresh now" asks the upstream again; rates are never typed in.
 */
import { useFetcher } from "react-router";
import type { FxStatus } from "../../../lib/cms/repositories/pricing.server";
import { formatFxRate } from "../../../lib/pricing/fx";
import { formatTaipei } from "../../../lib/time/taipei";
import { type ActionData, useActionToasts } from "../settings/form-kit";
import { IntentButton, StudioForm } from "../ui";

const STATE_TEXT: Record<FxStatus["state"], string> = {
  ok: "Current",
  stale:
    "Stale (older than 3 business days): English prices show as unavailable and English commissions cannot be submitted",
  missing:
    "Missing: English prices show as unavailable and English commissions cannot be submitted",
};

export function FxStatusPanel({ fx }: { fx: FxStatus }) {
  const fetcher = useFetcher<ActionData>();
  useActionToasts(fetcher);
  const pending = fetcher.state !== "idle";
  return (
    <section className="studio-fx" aria-labelledby="fx-status-title">
      <h2 className="studio-section-label" id="fx-status-title">
        Exchange rate
      </h2>
      <p className={`studio-fx__state studio-fx__state--${fx.state}`}>
        {STATE_TEXT[fx.state]}
      </p>
      {fx.rateScaled !== null && fx.rateDate ? (
        <p className="studio-fx__rate">
          1 TWD = {formatFxRate(fx.rateScaled)} USD · rate date {fx.rateDate}
          {fx.fetchedAt
            ? ` · fetched ${formatTaipei(fx.fetchedAt)} Taipei`
            : null}
        </p>
      ) : null}
      <StudioForm fetcher={fetcher} className="studio-fx__form">
        <IntentButton
          intent="refresh-fx"
          compact
          pending={pending}
          pendingLabel="Refreshing…"
        >
          Refresh now
        </IntentButton>
      </StudioForm>
    </section>
  );
}
