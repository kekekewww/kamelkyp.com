import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ServiceBreadcrumb } from "../../components/services/service-breadcrumb";
import { ServiceChoice } from "../../components/services/service-choice";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";

export async function loader(args: LoaderFunctionArgs) {
  return getPublicPriceContext(args);
}

export default function MixingIndexRoute() {
  const { locale, fxSnapshot } = useLoaderData<typeof loader>();
  return (
    <main className="page service-select-page" id="main-content">
      <div className="grid">
        <ServiceBreadcrumb locale={locale} category="mixing" current />
      </div>
      <header className="page-header grid">
        <p className="eyebrow col-rail">MIXING</p>
        <h1 className="page-header__title">
          {locale === "zh" ? "選擇混音服務" : "Choose mixing service"}
        </h1>
        <p className="page-header__intro">
          {locale === "zh"
            ? "依你的素材範圍，選擇完整歌曲混音或 Vocal 混音。"
            : "Choose full-song or vocal mixing based on your source material."}
        </p>
      </header>
      <ServiceChoice
        category="mixing"
        locale={locale}
        fxSnapshot={fxSnapshot}
      />
    </main>
  );
}
