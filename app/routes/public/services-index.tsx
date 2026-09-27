import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import {
  PriceFigure,
  PriceQuote,
} from "../../components/services/price-figure";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "large" },
};

export async function loader(args: LoaderFunctionArgs) {
  return getPublicPriceContext(args);
}

/** Lowest catalog base price in a category ("starting at"); never invented. */
function startingPriceTwd(category: ServiceDefinition["category"]): number {
  return Math.min(
    ...getCategoryServices(category).map((service) => service.basePriceTwd),
  );
}

interface Group {
  id: ServiceDefinition["category"] | "software";
  path: string;
  name: Record<Locale, string>;
  body: Record<Locale, string>;
  link: Record<Locale, string>;
}

const GROUPS: readonly Group[] = [
  {
    id: "mixing",
    path: "/mixing",
    name: { zh: "混音", en: "Mixing" },
    body: {
      zh: "完整歌曲或 Vocal 混音，含母帶。",
      en: "Full-song or vocal mixing, mastering included.",
    },
    link: { zh: "查看混音服務", en: "View mixing" },
  },
  {
    id: "song_transition",
    path: "/song-transition",
    name: { zh: "歌曲銜接", en: "Song Transition" },
    body: {
      zh: "舞蹈、活動與表演用的歌曲銜接與剪輯。",
      en: "Transitions and edits for dance, events and performance.",
    },
    link: { zh: "查看歌曲銜接服務", en: "View song transition" },
  },
  {
    id: "software",
    path: "/services/software",
    name: { zh: "軟體與互動", en: "Software & Interactive" },
    body: {
      zh: "網站、原型、AI 整合、互動裝置。",
      en: "Websites, prototypes, AI integrations, interactive installations.",
    },
    link: { zh: "查看軟體與互動服務", en: "View software & interactive" },
  },
];

const PROCESS: readonly { index: string; title: Record<Locale, string> }[] = [
  { index: "01", title: { zh: "需求", en: "Brief" } },
  { index: "02", title: { zh: "報價與確認", en: "Quote & confirm" } },
  { index: "03", title: { zh: "製作", en: "Production" } },
  { index: "04", title: { zh: "交付與修改", en: "Delivery & revisions" } },
];

export default function ServicesIndexRoute() {
  const { locale, fxSnapshot } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

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

      <div className="grid">
        <ul className="services-groups col-content" data-reveal-group>
          {GROUPS.map((group) => {
            const nameId = `services-group-${group.id}`;
            return (
              <li className="service-group" key={group.id} data-reveal-item>
                <h2 className="service-group__name" id={nameId}>
                  <Link to={localePath(locale, group.path)}>
                    {group.name[locale]}
                  </Link>
                </h2>
                <div className="service-group__detail">
                  <p className="service-group__body">{group.body[locale]}</p>
                  {group.id === "software" ? (
                    <PriceQuote
                      quote={isZh ? "依專案報價" : "Contact for quote"}
                    />
                  ) : (
                    <PriceFigure
                      locale={locale}
                      twd={startingPriceTwd(group.id)}
                      fxSnapshot={fxSnapshot}
                      label={isZh ? "起價" : "Starting at"}
                      size="s"
                    />
                  )}
                  <Link
                    className="text-link service-group__link"
                    to={localePath(locale, group.path)}
                    aria-describedby={nameId}
                  >
                    {group.link[locale]}
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

      <section
        className="services-process grid section-top-m"
        aria-labelledby="services-process-title"
      >
        <h2 className="services-process__title" id="services-process-title">
          {isZh ? "合作流程" : "How it works"}
        </h2>
        <ol className="step-list services-process__steps" data-reveal-group>
          {PROCESS.map((step) => (
            <li className="step-list__item" key={step.index} data-reveal-item>
              <span className="step-list__index" aria-hidden="true">
                {step.index}
              </span>
              <span className="step-list__title">{step.title[locale]}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
