import {
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { ServicePrice } from "../../components/pricing/service-price";
import { pageMeta } from "../../lib/cms/public/meta";
import { listPublicServices } from "../../lib/cms/public/services.server";
import { getCommissionReadiness } from "../../lib/commission/availability.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import { getService } from "../../lib/services/catalog";
import { isServiceId } from "../../lib/services/service-id";

const AREAS = {
  mixing: "mixing",
  "song-transition": "song_transition",
} as const;

// No contact band on commission pages (IA §5.1).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const category = args.params.category;
  if (category !== "mixing" && category !== "song-transition") {
    throw new Response("Not Found", { status: 404 });
  }
  const { locale, db, env } = getPublicLoaderContext(args);
  const now = new Date();
  const [priceContext, services, readiness] = await Promise.all([
    getPublicPriceContext(args),
    listPublicServices(db, env, locale, { area: AREAS[category], now }),
    getCommissionReadiness(db, now),
  ]);
  const open = new Set(
    readiness.filter((item) => item.open[locale]).map((item) => item.serviceId),
  );
  // Only published commission services that are open in this locale (an
  // active price and effective terms) can be commissioned.
  const commissionable = services.flatMap((service) => {
    const id = service.commissionServiceId;
    if (!id || !isServiceId(id) || service.price?.currency !== "TWD") return [];
    if (!open.has(id)) return [];
    return [
      {
        id,
        slug: getService(id).slug,
        name: service.name,
        shortDescription: service.shortDescription,
        baseTwd: service.price.amount,
      },
    ];
  });
  return { ...priceContext, category, services: commissionable };
}

export const meta: MetaFunction<typeof loader> = ({
  loaderData,
  matches,
  location,
}) =>
  pageMeta(
    { matches, location },
    {
      title: loaderData?.locale === "en" ? "Start a project" : "開始合作",
      // A workflow step: crawlable (to read this), never indexed.
      noindex: true,
    },
  );

export default function CommissionCategoryRoute() {
  const { category, locale, fxSnapshot, services } =
    useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const title =
    category === "mixing"
      ? isZh
        ? "選擇混音服務"
        : "Choose mixing service"
      : isZh
        ? "選擇歌曲銜接服務"
        : "Choose song-transition service";
  const categoryLabel =
    category === "mixing"
      ? isZh
        ? "混音"
        : "Mixing"
      : isZh
        ? "歌曲銜接"
        : "Song transition";

  return (
    <main className="page commission-category" id="main-content">
      <header className="page-header grid">
        <nav
          className="breadcrumb page-header__body"
          aria-label={isZh ? "頁面位置" : "Breadcrumb"}
        >
          <ol>
            <li>
              <Link to={localePath(locale, "/commission")}>
                {isZh ? "開始合作" : "Start a project"}
              </Link>
            </li>
            <li aria-current="page">{categoryLabel}</li>
          </ol>
        </nav>
        <p className="eyebrow col-rail">COMMISSION / SERVICE</p>
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__intro">
          {isZh
            ? "此頁只顯示目前類別的兩種服務，選擇後再填寫委託內容。"
            : "Only the two services in this category are shown. Choose one to continue."}
        </p>
      </header>
      <div className="grid">
        {services.length === 0 ? (
          <div className="col-content">
            <EmptyState
              locale={locale}
              title={
                isZh
                  ? "目前沒有開放線上委託的服務"
                  : "No services are open for online commissions right now"
              }
              description={
                isZh
                  ? "請稍後再回來，或透過頁尾的聯絡方式詢問。"
                  : "Please check back later, or get in touch using the contact details in the footer."
              }
            />
          </div>
        ) : (
          <section
            className="commission-services col-content"
            aria-label={title}
          >
            {services.map((service) => {
              const nameId = `commission-service-${service.slug}`;
              return (
                <article className="commission-service" key={service.id}>
                  <h2 className="commission-service__name" id={nameId}>
                    {service.name}
                  </h2>
                  {service.shortDescription ? (
                    <p className="commission-service__description">
                      {service.shortDescription}
                    </p>
                  ) : null}
                  <div className="price commission-service__price">
                    <p className="price__label">
                      {isZh ? "基礎價格" : "Base price"}
                    </p>
                    <p className="price__figure price__figure--s commission-category__price">
                      <ServicePrice
                        locale={locale}
                        twd={service.baseTwd}
                        fxSnapshot={fxSnapshot}
                      />
                    </p>
                  </div>
                  <Link
                    className="text-link commission-service__link"
                    to={localePath(
                      locale,
                      `/commission/${category}/${service.slug}`,
                    )}
                    aria-describedby={nameId}
                  >
                    {isZh ? "選擇此服務" : "Choose this service"}
                    <span className="text-link__arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
