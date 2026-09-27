import { Link } from "react-router";
import type { PublicServiceItem } from "../../lib/cms/public/view-models";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import { commissionServicePath } from "../../lib/services/catalog";
import { isServiceId } from "../../lib/services/service-id";
import { ServiceItemPrice } from "./price-figure";

/**
 * Service choice (design-system §6.13, IA §4.5): the published services of
 * one area, side by side on lg+. Names, descriptions and timelines come from
 * the service rows; commission services show the active price rule and link
 * to their page, other services show their price mode. No reveal motion
 * here: prices never animate (motion-system §2.2).
 */
export function ServiceChoice({
  services,
  locale,
  fxSnapshot,
}: {
  services: readonly PublicServiceItem[];
  locale: Locale;
  fxSnapshot: FxSnapshot | null;
}) {
  const isZh = locale === "zh";
  const label = isZh ? "服務選擇" : "Choose a service";

  return (
    // `service-choice` alone on the section: unit tests match that markup.
    <section className="service-choice" aria-label={label}>
      <div className="service-select grid">
        <ul className="service-select__list col-content">
          {services.map((service) => {
            const nameId = `service-${service.id}-name`;
            const commissionId =
              service.commissionServiceId &&
              isServiceId(service.commissionServiceId)
                ? service.commissionServiceId
                : null;
            return (
              <li className="service-select__item" key={service.id}>
                <article
                  className="service-select__card"
                  aria-labelledby={nameId}
                >
                  <h2 className="service-select__name" id={nameId}>
                    {service.name}
                  </h2>
                  {service.shortDescription ? (
                    <p className="service-select__description">
                      {service.shortDescription}
                    </p>
                  ) : null}
                  <ServiceItemPrice
                    service={service}
                    locale={locale}
                    fxSnapshot={fxSnapshot}
                    label={
                      commissionId
                        ? isZh
                          ? "基礎價格"
                          : "Base price"
                        : undefined
                    }
                  />
                  {service.turnaround ? (
                    <p className="service-select__schedule" data-localized>
                      <span className="service-select__schedule-label">
                        {isZh ? "標準工期" : "Standard timeline"}
                      </span>{" "}
                      {service.turnaround}
                    </p>
                  ) : null}
                  {commissionId ? (
                    <Link
                      className="button button--ghost service-select__action"
                      to={localePath(
                        locale,
                        commissionServicePath(commissionId),
                      )}
                      aria-describedby={nameId}
                    >
                      {isZh ? "查看服務" : "View service"}
                      <span className="button__arrow" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
