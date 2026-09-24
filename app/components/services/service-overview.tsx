import { Link } from "react-router";
import type { PublicServiceItem } from "../../lib/cms/public/view-models";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import type { ServiceDefinition } from "../../lib/services/catalog";
import { ServicePrice } from "../pricing/service-price";
import { studentDiscountNote } from "./price-figure";
import { ServiceBreadcrumb } from "./service-breadcrumb";

/**
 * Service detail (IA §4.5, design-system §6.13–6.14): document-style header on
 * the grid, the base price (the active price rule) as a large tabular figure,
 * turnaround, deliverables as a ruled list and the page's primary CTA
 * "Start a commission". Copy comes from the published service row; optional
 * groups (revisions, requirements, process, FAQ) render only when filled.
 */
export function ServiceOverview({
  service,
  category,
  locale,
  fxSnapshot,
  studentDiscountBps = null,
}: {
  service: PublicServiceItem;
  category: ServiceDefinition["category"];
  locale: Locale;
  fxSnapshot: FxSnapshot | null;
  /** From the active D1 price rule; the note renders only when present. */
  studentDiscountBps?: number | null;
}) {
  const isZh = locale === "zh";
  const priceUnavailable = locale === "en" && !fxSnapshot;
  const note = studentDiscountNote(locale, studentDiscountBps);
  const sectionId = (name: string) => `${service.slug}-${name}`;
  const twd = service.price?.currency === "TWD" ? service.price.amount : null;
  const commissionHref = service.commissionServiceId
    ? `${localePath(locale, "/commission")}?service=${service.commissionServiceId}`
    : null;

  return (
    <main className="page service-detail" id="main-content">
      <div className="grid">
        <ServiceBreadcrumb
          locale={locale}
          category={category}
          current={false}
        />
      </div>
      <header className="page-header grid">
        <p className="eyebrow col-rail">
          {isZh ? "服務內容" : "Service details"}
        </p>
        <h1 className="page-header__title">{service.name}</h1>
        {service.shortDescription ? (
          <p className="page-header__intro">{service.shortDescription}</p>
        ) : null}
      </header>

      <div className="service-detail__body grid">
        <dl className="service-detail__facts col-content">
          <div className="service-detail__fact service-detail__fact--price">
            <dt className="price__label">{isZh ? "基礎價格" : "Base price"}</dt>
            {twd === null ? (
              <dd className="price__quote">
                {isZh ? "依專案報價" : "Contact for quote"}
              </dd>
            ) : (
              <dd
                className={priceUnavailable ? "price__quote" : "price__figure"}
              >
                <ServicePrice
                  locale={locale}
                  twd={twd}
                  fxSnapshot={fxSnapshot}
                />
              </dd>
            )}
            {note ? <dd className="price__note">{note}</dd> : null}
          </div>
          {service.turnaround ? (
            <div className="service-detail__fact">
              <dt className="price__label">
                {isZh ? "標準工期" : "Standard timeline"}
              </dt>
              <dd className="service-detail__days">{service.turnaround}</dd>
            </div>
          ) : null}
          {service.revisions ? (
            <div className="service-detail__fact">
              <dt className="price__label">{isZh ? "修改" : "Revisions"}</dt>
              <dd className="service-detail__days">{service.revisions}</dd>
            </div>
          ) : null}
        </dl>

        {commissionHref ? (
          <div className="service-detail__action col-content">
            {twd === null ? (
              <span className="button button--primary" aria-disabled="true">
                {isZh
                  ? "開始委託 · 暫不開放"
                  : "Start a commission · unavailable"}
              </span>
            ) : priceUnavailable ? (
              <span className="button button--primary" aria-disabled="true">
                Start a commission · USD unavailable
              </span>
            ) : (
              <Link className="button button--primary" to={commissionHref}>
                {isZh ? "開始委託" : "Start a commission"}
                <span className="button__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            )}
          </div>
        ) : null}

        {service.deliverables.length > 0 ? (
          <section
            className="service-detail__deliverables subgrid"
            aria-labelledby={sectionId("deliverables")}
          >
            <h2
              className="service-detail__section-title"
              id={sectionId("deliverables")}
            >
              {isZh ? "交付內容" : "Deliverables"}
            </h2>
            <ul className="ruled-list service-detail__list">
              {service.deliverables.map((deliverable) => (
                <li key={deliverable}>{deliverable}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {service.requirements.length > 0 ? (
          <section
            className="service-detail__deliverables subgrid"
            aria-labelledby={sectionId("requirements")}
          >
            <h2
              className="service-detail__section-title"
              id={sectionId("requirements")}
            >
              {isZh ? "需要準備" : "What to prepare"}
            </h2>
            <ul className="ruled-list service-detail__list">
              {service.requirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {service.process.length > 0 ? (
          <section
            className="service-detail__deliverables subgrid"
            aria-labelledby={sectionId("process")}
          >
            <h2
              className="service-detail__section-title"
              id={sectionId("process")}
            >
              {isZh ? "流程" : "Process"}
            </h2>
            <ol className="ruled-list service-detail__list">
              {service.process.map((step) => (
                <li key={step.title}>
                  {step.title}
                  {step.body ? ` — ${step.body}` : ""}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {service.faq.length > 0 ? (
          <section
            className="service-detail__deliverables subgrid"
            aria-labelledby={sectionId("faq")}
          >
            <h2 className="service-detail__section-title" id={sectionId("faq")}>
              {isZh ? "常見問題" : "FAQ"}
            </h2>
            <dl className="ruled-list service-detail__list">
              {service.faq.map((item) => (
                <div key={item.question}>
                  <dt>{item.question}</dt>
                  <dd>{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </main>
  );
}
