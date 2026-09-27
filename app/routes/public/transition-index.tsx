import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ServiceBreadcrumb } from "../../components/services/service-breadcrumb";
import { ServiceChoice } from "../../components/services/service-choice";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";

export async function loader(args: LoaderFunctionArgs) {
  return getPublicPriceContext(args);
}

export default function TransitionIndexRoute() {
  const { locale, fxSnapshot } = useLoaderData<typeof loader>();
  return (
    <main className="page service-select-page" id="main-content">
      <div className="grid">
        <ServiceBreadcrumb locale={locale} category="song_transition" current />
      </div>
      <header className="page-header grid">
        <p className="eyebrow col-rail">SONG TRANSITION</p>
        <h1 className="page-header__title">
          {locale === "zh"
            ? "選擇歌曲銜接服務"
            : "Choose song-transition service"}
        </h1>
        <p className="page-header__intro">
          {locale === "zh"
            ? "依是否需要剪輯與結構調整，選擇單純銜接或編輯式銜接。"
            : "Choose a simple or edited transition based on whether structural editing is needed."}
        </p>
      </header>
      <ServiceChoice
        category="song_transition"
        locale={locale}
        fxSnapshot={fxSnapshot}
      />
    </main>
  );
}
