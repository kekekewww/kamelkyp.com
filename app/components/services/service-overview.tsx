import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { getService } from "../../lib/services/catalog";
import type { ServiceId } from "../../lib/services/service-id";

function formatTwd(amount: number): string {
  return `NT$${new Intl.NumberFormat("en-US").format(amount)}`;
}

export function ServiceOverview({
  serviceId,
  locale,
}: {
  serviceId: ServiceId;
  locale: Locale;
}) {
  const service = getService(serviceId);

  return (
    <article className="service-overview">
      <p className="eyebrow">
        {locale === "zh" ? "服務內容" : "Service details"}
      </p>
      <h1>{service.name[locale]}</h1>
      <p>{service.shortDescription[locale]}</p>
      <dl className="service-overview__facts">
        <div>
          <dt>{locale === "zh" ? "基礎價格" : "Base price"}</dt>
          <dd>
            {locale === "zh"
              ? formatTwd(service.basePriceTwd)
              : "USD · daily exchange rate"}
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
      <Link
        className="button"
        to={`${localePath(locale, "/commission")}?service=${service.id}`}
      >
        {locale === "zh" ? "開始委託" : "Start a commission"}
      </Link>
    </article>
  );
}
