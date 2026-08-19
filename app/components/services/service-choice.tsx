import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";

export function ServiceChoice({
  category,
  locale,
}: {
  category: ServiceDefinition["category"];
  locale: Locale;
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
