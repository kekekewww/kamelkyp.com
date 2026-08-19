import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ServicePrice } from "../../components/pricing/service-price";
import { localePath } from "../../lib/i18n/path";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import {
  getCategoryServices,
  type ServiceDefinition,
} from "../../lib/services/catalog";

const CATEGORIES = new Set(["mixing", "song-transition"]);

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
  const catalogCategory: ServiceDefinition["category"] =
    category === "mixing" ? "mixing" : "song_transition";
  const title =
    category === "mixing"
      ? locale === "zh"
        ? "選擇混音服務"
        : "Choose mixing service"
      : locale === "zh"
        ? "選擇歌曲銜接服務"
        : "Choose song-transition service";

  return (
    <main className="commission-category" id="main-content">
      <header>
        <p className="eyebrow">COMMISSION / SERVICE</p>
        <h1>{title}</h1>
        <p>
          {locale === "zh"
            ? "此頁只顯示目前類別的兩種服務，選擇後再填寫委託內容。"
            : "Only the two services in this category are shown. Choose one to continue."}
        </p>
      </header>
      <section className="commission-category__choices" aria-label={title}>
        {getCategoryServices(catalogCategory).map((service) => (
          <article key={service.id}>
            <h2>{service.name[locale]}</h2>
            <p>{service.shortDescription[locale]}</p>
            <p className="commission-category__price">
              <ServicePrice
                locale={locale}
                twd={service.basePriceTwd}
                fxSnapshot={fxSnapshot}
              />
            </p>
            <Link
              to={localePath(locale, `/commission/${category}/${service.slug}`)}
            >
              {locale === "zh" ? "選擇此服務" : "Choose this service"}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
