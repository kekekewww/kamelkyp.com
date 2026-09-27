import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { ServiceBreadcrumb } from "../../components/services/service-breadcrumb";
import { ServiceChoice } from "../../components/services/service-choice";
import { loadServiceArea } from "../../components/services/service-detail-loader.server";
import { pageMeta } from "../../lib/cms/public/meta";

export async function loader(args: LoaderFunctionArgs) {
  return loadServiceArea(args, "mixing");
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Mixing" : "混音",
  });

export default function MixingIndexRoute() {
  const { locale, fxSnapshot, services } = useLoaderData<typeof loader>();
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
        services={services}
        locale={locale}
        fxSnapshot={fxSnapshot}
      />
    </main>
  );
}
