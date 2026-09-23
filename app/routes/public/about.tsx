import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { ABOUT } from "../../content";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

// TODO(Services + About + Writing page agent): complete per IA §4.7 and
// design-system §6.17 using ABOUT and CAPABILITIES from app/content.

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "large" },
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale } = getPublicLoaderContext(args);
  return { locale };
}

export default function AboutRoute() {
  const { locale } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="page" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">ABOUT</p>
        <h1 className="page-header__title">{isZh ? "關於" : "About"}</h1>
        <p className="page-header__intro">{ABOUT.lede[locale]}</p>
      </header>
    </main>
  );
}
