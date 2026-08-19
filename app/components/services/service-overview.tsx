import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import { getService } from "../../lib/services/catalog";
import type { ServiceId } from "../../lib/services/service-id";
import { ServicePrice } from "../pricing/service-price";

export function ServiceOverview({
  serviceId,
  locale,
  fxSnapshot,
}: {
  serviceId: ServiceId;
  locale: Locale;
  fxSnapshot: FxSnapshot | null;
}) {
  const service = getService(serviceId);

  return (
    <main className="service-overview" id="main-content">
      <p className="eyebrow">
        {locale === "zh" ? "服務內容" : "Service details"}
      </p>
      <h1>{service.name[locale]}</h1>
      <p>{service.shortDescription[locale]}</p>
      <dl className="service-overview__facts">
        <div>
          <dt>{locale === "zh" ? "基礎價格" : "Base price"}</dt>
          <dd>
            <ServicePrice
              locale={locale}
              twd={service.basePriceTwd}
              fxSnapshot={fxSnapshot}
            />
          </dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "標準工期" : "Standard timeline"}</dt>
          <dd>{service.standardDays[locale]}</dd>
        </div>
      </dl>
      <section aria-labelledby={`${service.id}-deliverables`}>
        <h2 id={`${service.id}-deliverables`}>
          {locale === "zh" ? "交付內容" : "Deliverables"}
        </h2>
        <ul>
          {service.deliverables.map((deliverable) => (
            <li key={deliverable.en}>{deliverable[locale]}</li>
          ))}
        </ul>
      </section>
      {locale === "en" && !fxSnapshot ? (
        <span className="button" aria-disabled="true">
          Start a commission · USD unavailable
        </span>
      ) : (
        <Link
          className="button"
          to={`${localePath(locale, "/commission")}?service=${service.id}`}
        >
          {locale === "zh" ? "開始委託" : "Start a commission"}
        </Link>
      )}
    </main>
  );
}
