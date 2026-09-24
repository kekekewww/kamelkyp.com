import { Link } from "react-router";
import type { PublicSite } from "../../lib/cms/public/view-models";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

export type ServiceArea = PublicSite["serviceAreas"][number];

/** Public page of each service area (site structure, not content). */
export const SERVICE_AREA_PATHS: Record<ServiceArea["key"], string> = {
  mixing: "/mixing",
  song_transition: "/song-transition",
  software: "/services/software",
};

/**
 * Home §5: open service-area rows (design-system §6.13). Names, blurbs and
 * link labels come from site settings; with none the section is not rendered.
 */
export function ServicesOverview({
  areas,
  locale,
}: {
  areas: readonly ServiceArea[];
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const rows = areas.filter((area) => area.name);
  if (rows.length === 0) return null;
  return (
    <section
      className="home-section home-services"
      aria-labelledby="home-services-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">
          SERVICES / {String(rows.length).padStart(2, "0")}
        </p>
        <h2
          className="section-head__title t-h1"
          id="home-services-title"
          data-reveal="mask"
        >
          {isZh ? "服務" : "Services"}
        </h2>
        <div className="section-head__aside">
          <Link className="text-link" to={localePath(locale, "/services")}>
            {isZh ? "查看全部服務" : "All services"}
            <span className="text-link__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>
      <div className="grid">
        <ul className="home-rows home-services__list" data-reveal-group>
          {rows.map((area, position) => (
            <li key={area.key} className="home-service" data-reveal-item>
              <span className="home-service__index t-meta">
                {String(position + 1).padStart(2, "0")}
              </span>
              <h3 className="home-service__name t-h2">{area.name}</h3>
              <p className="home-service__body t-secondary">{area.summary}</p>
              <Link
                className="home-service__link text-link"
                to={localePath(locale, SERVICE_AREA_PATHS[area.key])}
              >
                {area.linkLabel || area.name}
                <span className="text-link__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
