import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

// TODO(Services + About + Writing page agent): complete per IA §4.6 using
// SOFTWARE_SERVICES from app/content (offerings, engagement models, process,
// related work, and the #contact block with the mailto: "Email me" button).

export async function loader(args: LoaderFunctionArgs) {
  const { locale } = getPublicLoaderContext(args);
  return { locale };
}

export default function ServicesSoftwareRoute() {
  const { locale } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="page" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">
          SERVICES / SOFTWARE &amp; INTERACTIVE
        </p>
        <h1 className="page-header__title">
          {isZh ? "軟體與互動開發" : "Software & Interactive"}
        </h1>
        <p className="page-header__intro">
          {isZh
            ? "從想法到可運作的系統：網站、原型、AI 整合與互動體驗。"
            : "From idea to working system: websites, prototypes, AI integrations and interactive experiences."}
        </p>
      </header>
    </main>
  );
}
