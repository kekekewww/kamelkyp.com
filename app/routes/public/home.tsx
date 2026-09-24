import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { HomePage } from "../../components/home/home-page";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import { loadHome } from "../../lib/cms/public/home.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";

/** The contact band is rendered inline (it carries the home body copy). */
export const handle: PublicRouteHandle = { contactBand: false };

/** Published content only; the head comes from the layout (site title). */
export async function loader(args: LoaderFunctionArgs) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const [home, price] = await Promise.all([
    loadHome(db, env, locale),
    getPublicPriceContext(args),
  ]);
  return { locale, data: { ...home, fxSnapshot: price.fxSnapshot } };
}

export default function HomeRoute() {
  const { locale, data } = useLoaderData<typeof loader>();
  const site = usePublicSite();
  return <HomePage locale={locale} site={site} data={data} />;
}
