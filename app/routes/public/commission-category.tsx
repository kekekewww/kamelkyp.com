import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { ServicePrice } from "../../components/pricing/service-price";
import { localePath } from "../../lib/i18n/path";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";

const CATEGORIES = new Set(["mixing", "song-transition"]);

// No contact band on commission pages (IA §5.1).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const category = args.params.category;
  if (!category || !CATEGORIES.has(category)) {
    throw new Response("Not Found", { status: 404 });
  }
  return {
    ...(await getPublicPriceContext(args)),
    category,
  };
}

export default function CommissionCategoryRoute() {
  const { category, locale, fxSnapshot } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const catalogCategory: ServiceDefinition["category"] =
    category === "mixing" ? "mixing" : "song_transition";
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
        <section className="commission-services col-content" aria-label={title}>
          {getCategoryServices(catalogCategory).map((service) => {
            const nameId = `commission-service-${service.slug}`;
            return (
              <article className="commission-service" key={service.id}>
                <h2 className="commission-service__name" id={nameId}>
                  {service.name[locale]}
                </h2>
                <p className="commission-service__description">
                  {service.shortDescription[locale]}
                </p>
                <div className="price commission-service__price">
                  <p className="price__label">
                    {isZh ? "基礎價格" : "Base price"}
                  </p>
                  <p className="price__figure price__figure--s commission-category__price">
                    <ServicePrice
                      locale={locale}
                      twd={service.basePriceTwd}
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
      </div>
    </main>
  );
}
