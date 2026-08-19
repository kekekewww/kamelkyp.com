import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";
import { ServicePrice } from "../pricing/service-price";

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
  const label = locale === "zh" ? "服務選擇" : "Choose a service";

  return (
    <section className="service-choice" aria-label={label}>
      {getCategoryServices(category).map((service) => (
        <article className="service-choice__item" key={service.id}>
          <p className="eyebrow">{label}</p>
          <h2>{service.name[locale]}</h2>
          <p>{service.shortDescription[locale]}</p>
          <p className="service-choice__price">
            <ServicePrice
              locale={locale}
              twd={service.basePriceTwd}
              fxSnapshot={fxSnapshot}
            />
          </p>
          <p className="service-choice__schedule">
            {service.standardDays[locale]}
          </p>
          <Link to={localePath(locale, `${base}/${service.slug}`)}>
            {locale === "zh" ? "查看服務" : "View service"}
          </Link>
        </article>
      ))}
    </section>
  );
}
