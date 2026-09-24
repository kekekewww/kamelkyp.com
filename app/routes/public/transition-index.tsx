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
  return loadServiceArea(args, "song_transition");
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Song Transition" : "歌曲銜接",
  });

export default function TransitionIndexRoute() {
  const { locale, fxSnapshot, services } = useLoaderData<typeof loader>();
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
        services={services}
        locale={locale}
        fxSnapshot={fxSnapshot}
      />
    </main>
  );
}
