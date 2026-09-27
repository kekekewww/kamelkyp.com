import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";
import { PriceFigure } from "./price-figure";

/**
 * Service choice (design-system §6.13, IA §4.5): exactly the two services of
 * one category, side by side on lg+. Each block keeps the existing copy: `h2`
 * service name, description, `ServicePrice`, schedule and "View service".
 * No reveal motion here: prices never animate (motion-system §2.2).
 */
export function ServiceChoice({
  category,
  locale,
  fxSnapshot,
}: {
  category: ServiceDefinition["category"];
  locale: Locale;
  fxSnapshot: FxSnapshot | null;
}) {
  const base = category === "mixing" ? "/mixing" : "/song-transition";
  const isZh = locale === "zh";
  const label = isZh ? "服務選擇" : "Choose a service";

  return (
    // `service-choice` alone on the section: unit tests match that markup.
    <section className="service-choice" aria-label={label}>
      <div className="service-select grid">
        <ul className="service-select__list col-content">
          {getCategoryServices(category).map((service) => {
            const nameId = `service-${service.id}-name`;
            return (
              <li className="service-select__item" key={service.id}>
                <article
                  className="service-select__card"
                  aria-labelledby={nameId}
                >
                  <h2 className="service-select__name" id={nameId}>
                    {service.name[locale]}
                  </h2>
                  <p className="service-select__description">
                    {service.shortDescription[locale]}
                  </p>
                  <PriceFigure
                    locale={locale}
                    twd={service.basePriceTwd}
                    fxSnapshot={fxSnapshot}
                    label={isZh ? "基礎價格" : "Base price"}
                    size="s"
                  />
                  <p className="service-select__schedule" data-localized>
                    <span className="service-select__schedule-label">
                      {isZh ? "標準工期" : "Standard timeline"}
                    </span>{" "}
                    {service.standardDays[locale]}
                  </p>
                  <Link
                    className="button button--ghost service-select__action"
                    to={localePath(locale, `${base}/${service.slug}`)}
                    aria-describedby={nameId}
                  >
                    {isZh ? "查看服務" : "View service"}
                    <span className="button__arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
