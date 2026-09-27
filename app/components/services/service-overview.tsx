import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import { getService } from "../../lib/services/catalog";
import type { ServiceId } from "../../lib/services/service-id";
import { ServicePrice } from "../pricing/service-price";
import { studentDiscountNote } from "./price-figure";
import { ServiceBreadcrumb } from "./service-breadcrumb";

/**
 * Service detail (IA §4.5, design-system §6.13–6.14): document-style header on
 * the grid, the base price as a large tabular figure, turnaround, deliverables
 * as a ruled list and the page's primary CTA "Start a commission". All copy,
 * prices and targets are the existing ones.
 */
export function ServiceOverview({
  serviceId,
  locale,
  fxSnapshot,
  studentDiscountBps = null,
}: {
  serviceId: ServiceId;
  locale: Locale;
  fxSnapshot: FxSnapshot | null;
  /** From the active D1 price rule; the note renders only when present. */
  studentDiscountBps?: number | null;
}) {
  const service = getService(serviceId);
  const isZh = locale === "zh";
  const priceUnavailable = locale === "en" && !fxSnapshot;
  const note = studentDiscountNote(locale, studentDiscountBps);
  const deliverablesId = `${service.id}-deliverables`;

  return (
    <main className="page service-detail" id="main-content">
      <div className="grid">
        <ServiceBreadcrumb
          locale={locale}
          category={service.category}
          current={false}
        />
      </div>
      <header className="page-header grid">
        <p className="eyebrow col-rail">
          {isZh ? "服務內容" : "Service details"}
        </p>
        <h1 className="page-header__title">{service.name[locale]}</h1>
        <p className="page-header__intro">{service.shortDescription[locale]}</p>
      </header>

      <div className="service-detail__body grid">
        <dl className="service-detail__facts col-content">
          <div className="service-detail__fact service-detail__fact--price">
            <dt className="price__label">{isZh ? "基礎價格" : "Base price"}</dt>
            <dd className={priceUnavailable ? "price__quote" : "price__figure"}>
              <ServicePrice
                locale={locale}
                twd={service.basePriceTwd}
                fxSnapshot={fxSnapshot}
              />
            </dd>
            {note ? <dd className="price__note">{note}</dd> : null}
          </div>
          <div className="service-detail__fact">
            <dt className="price__label">
              {isZh ? "標準工期" : "Standard timeline"}
            </dt>
            <dd className="service-detail__days">
              {service.standardDays[locale]}
            </dd>
          </div>
        </dl>

        <div className="service-detail__action col-content">
          {priceUnavailable ? (
            <span className="button button--primary" aria-disabled="true">
              Start a commission · USD unavailable
            </span>
          ) : (
            <Link
              className="button button--primary"
              to={`${localePath(locale, "/commission")}?service=${service.id}`}
            >
              {isZh ? "開始委託" : "Start a commission"}
              <span className="button__arrow" aria-hidden="true">
                →
              </span>
            </Link>
          )}
        </div>

        <section
          className="service-detail__deliverables subgrid"
          aria-labelledby={deliverablesId}
        >
          <h2 className="service-detail__section-title" id={deliverablesId}>
            {isZh ? "交付內容" : "Deliverables"}
          </h2>
          <ul className="ruled-list service-detail__list">
            {service.deliverables.map((deliverable) => (
              <li key={deliverable.en}>{deliverable[locale]}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
