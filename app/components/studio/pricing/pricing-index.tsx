/**
 * Studio → Pricing (wp2 §4.9): the active price rule of each commission
 * service, its next scheduled change, commission form availability and the
 * exchange rate. Every figure comes from `price_versions`.
 */
import { Link } from "react-router";
import type {
  PricingIndexData,
  PricingServiceSummary,
} from "../../../lib/cms/repositories/pricing.server";
import { bpsToPercentLabel } from "../../../lib/pricing/percent";
import {
  EDITABLE_PRICE_FIELDS,
  formatTwd,
  type PriceValues,
} from "../../../lib/pricing/sample-quotes";
import { formatTaipei } from "../../../lib/time/taipei";
import { StudioPage } from "../shell/studio-page";
import { StatusBadge } from "../ui";
import { CommissionReadinessTable } from "./commission-readiness";
import { FxStatusPanel } from "./fx-status";

const RATE_ORDER: ReadonlyArray<[keyof PriceValues, string]> = [
  ["studentDiscountBps", "Student"],
  ["rushBps", "Rush"],
  ["sourcePrepBps", "Source prep"],
  ["consultationBps", "Consultation"],
];

export function priceFigure(
  service: Pick<PricingServiceSummary, "serviceId">,
  values: PriceValues,
): string {
  const perSong = EDITABLE_PRICE_FIELDS[service.serviceId].includes(
    "perSongAfterFiveTwd",
  );
  return perSong
    ? `${formatTwd(values.baseTwd)} + ${formatTwd(values.perSongAfterFiveTwd)} per song after the 5th`
    : formatTwd(values.baseTwd);
}

export function rateLine(
  service: Pick<PricingServiceSummary, "serviceId">,
  values: PriceValues,
): string {
  const editable = EDITABLE_PRICE_FIELDS[service.serviceId];
  return RATE_ORDER.filter(([field]) => editable.includes(field))
    .map(([field, label]) => `${label} ${bpsToPercentLabel(values[field])}%`)
    .join(" · ");
}

function ServiceRow({ service }: { service: PricingServiceSummary }) {
  const { active, next } = service;
  const headingId = `pricing-${service.serviceId}`;
  return (
    <article className="studio-pricing-row" aria-labelledby={headingId}>
      <div className="studio-pricing-row__head">
        <h2 className="studio-pricing-row__name" id={headingId}>
          {service.name.en}
        </h2>
        <span className="studio-pricing-row__zh" lang="zh-Hant">
          {service.name.zh}
        </span>
        {service.serviceRow ? (
          <StatusBadge status={service.serviceRow.status} />
        ) : null}
      </div>
      {active ? (
        <>
          <p className="studio-pricing-row__figure">
            {priceFigure(service, active)}
          </p>
          <p className="studio-pricing-row__rates">
            {rateLine(service, active)}
          </p>
          <p className="studio-pricing-row__meta">
            since {formatTaipei(active.effectiveFrom)} Taipei ·{" "}
            <code>{active.id}</code>
          </p>
        </>
      ) : (
        <p className="studio-pricing-row__missing">
          <strong>No active price.</strong> The commission form for this service
          is closed.
        </p>
      )}
      <p className="studio-pricing-row__next">
        {next
          ? `Scheduled: ${priceFigure(service, next)} from ${formatTaipei(next.effectiveFrom)}`
          : "No scheduled change"}
      </p>
      <p className="studio-pricing-row__links">
        <Link
          className="studio-link"
          to={`/studio/services/pricing/${service.serviceId}`}
        >
          Change price
        </Link>
        <a
          className="studio-link"
          href={`/zh${service.livePath}`}
          target="_blank"
          rel="noopener"
        >
          View live
        </a>
        {service.serviceRow ? (
          <Link
            className="studio-link"
            to={`/studio/services/${service.serviceRow.id}`}
          >
            Edit service page
          </Link>
        ) : null}
      </p>
    </article>
  );
}

export function PricingIndex({ data }: { data: PricingIndexData }) {
  const names = Object.fromEntries(
    data.services.map((service) => [service.serviceId, service.name.en]),
  );
  return (
    <StudioPage title="Pricing" width="narrow">
      <p className="studio-hint">
        Commission prices. Each change adds an immutable price version;
        submitted cases keep the price they locked.
      </p>
      <div className="studio-pricing-list">
        {data.services.map((service) => (
          <ServiceRow key={service.serviceId} service={service} />
        ))}
      </div>
      <CommissionReadinessTable
        readiness={data.readiness}
        names={names}
        fx={data.fx}
      />
      <FxStatusPanel fx={data.fx} />
    </StudioPage>
  );
}
