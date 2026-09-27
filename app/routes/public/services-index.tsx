import {
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { SERVICE_AREA_PATHS } from "../../components/home/services-overview";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import {
  PriceFigure,
  PriceQuote,
} from "../../components/services/price-figure";
import { pageMeta } from "../../lib/cms/public/meta";
import { getAreaStartingPrices } from "../../lib/cms/public/services.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "large" },
};

export async function loader(args: LoaderFunctionArgs) {
  const { db } = getPublicLoaderContext(args);
  const [price, startingPrices] = await Promise.all([
    getPublicPriceContext(args),
    getAreaStartingPrices(db, new Date()),
  ]);
  return { ...price, startingPrices };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Services" : "服務",
  });

/**
 * Services overview (IA §4.4): the service areas from site settings, each
 * with its "from" price (the lowest active price rule of its published
 * commission services; never invented) or a quote note, then the process.
 */
export default function ServicesIndexRoute() {
  const { locale, fxSnapshot, startingPrices } = useLoaderData<typeof loader>();
  const { site } = usePublicSite();
  const isZh = locale === "zh";
  const areas = site.serviceAreas.filter((area) => area.name);
  const process = site.servicesPage.process;

  return (
    <main className="page services-page" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">SERVICES</p>
        <h1 className="page-header__title">{isZh ? "服務" : "Services"}</h1>
        <p className="page-header__intro">
          {isZh
            ? "三種合作方式：混音、歌曲銜接，以及軟體與互動開發。"
            : "Three ways to work together: mixing, song transitions, and software & interactive development."}
        </p>
      </header>

      {areas.length > 0 ? (
        <div className="grid">
          <ul className="services-groups col-content" data-reveal-group>
            {areas.map((area) => {
              const nameId = `services-group-${area.key}`;
              const path = SERVICE_AREA_PATHS[area.key];
              const from =
                area.key === "software" ? null : startingPrices[area.key];
              return (
                <li className="service-group" key={area.key} data-reveal-item>
                  <h2 className="service-group__name" id={nameId}>
                    <Link to={localePath(locale, path)}>{area.name}</Link>
                  </h2>
                  <div className="service-group__detail">
                    {area.summary ? (
                      <p className="service-group__body">{area.summary}</p>
                    ) : null}
                    {from === null ? (
                      <PriceQuote
                        quote={isZh ? "依專案報價" : "Contact for quote"}
                      />
                    ) : (
                      <PriceFigure
                        locale={locale}
                        twd={from}
                        fxSnapshot={fxSnapshot}
                        label={isZh ? "起價" : "Starting at"}
                        size="s"
                      />
                    )}
                    <Link
                      className="text-link service-group__link"
                      to={localePath(locale, path)}
                      aria-describedby={nameId}
                    >
                      {area.linkLabel || area.name}
                      <span className="text-link__arrow" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {process.length > 0 ? (
        <section
          className="services-process grid section-top-m"
          aria-labelledby="services-process-title"
        >
          <h2 className="services-process__title" id="services-process-title">
            {isZh ? "合作流程" : "How it works"}
          </h2>
          <ol className="step-list services-process__steps" data-reveal-group>
            {process.map((title, position) => (
              <li className="step-list__item" key={title} data-reveal-item>
                <span className="step-list__index" aria-hidden="true">
                  {String(position + 1).padStart(2, "0")}
                </span>
                <span className="step-list__title">{title}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
