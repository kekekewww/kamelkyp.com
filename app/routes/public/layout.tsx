import {
  type LoaderFunctionArgs,
  type MetaFunction,
  Outlet,
  useLoaderData,
} from "react-router";
import { PublicShell } from "../../components/layout/public-shell";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { MediaConfigProvider } from "../../lib/cms/media/media-config-context";
import { getPublicSiteContext } from "../../lib/cms/public/site.server";
import type { PublicSiteContext } from "../../lib/cms/public/view-models";
import { getDefaultFooterGroups } from "../../lib/content/footer-repository.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import { isLocale, type Locale } from "../../lib/i18n/locale";

export interface PublicOutletContext {
  locale: Locale;
}

export const meta: MetaFunction = ({ params }) => {
  const copy = getSiteCopy(params.lang === "en" ? "en" : "zh");

  return [
    { title: copy.metaTitleHome },
    { name: "description", content: copy.metaDescription },
  ];
};

/**
 * Site context for every public page (content-architecture §3.6): brand, site
 * settings, navigation, footer groups, social links and media config, read
 * from the Content Studio tables. Child routes read it with
 * `useRouteLoaderData("routes/public/layout")` (`site`). A missing context
 * (unit tests) or a failed read falls back to the code defaults so a public
 * page never renders broken.
 */
export async function loader({ params, context }: LoaderFunctionArgs) {
  if (!params.lang || !isLocale(params.lang)) {
    throw new Response("Not Found", { status: 404 });
  }

  const locale = params.lang;
  const provider = context as typeof context | undefined;
  if (!provider) {
    return {
      locale,
      footerGroups: getDefaultFooterGroups(locale),
      site: null as PublicSiteContext | null,
    };
  }

  const { env } = provider.get(cloudflareContext);
  try {
    const site = await getPublicSiteContext(env.DB, env, locale);
    return { locale, footerGroups: site.footerGroups, site };
  } catch {
    console.warn("public_site_context_unavailable");
    return {
      locale,
      footerGroups: getDefaultFooterGroups(locale),
      site: null as PublicSiteContext | null,
    };
  }
}

export default function PublicLayoutRoute() {
  const data = useLoaderData<typeof loader>();
  const outletContext: PublicOutletContext = { locale: data.locale };

  return (
    <MediaConfigProvider value={data.site?.mediaConfig}>
      <PublicShell locale={data.locale} footerGroups={data.footerGroups}>
        <Outlet context={outletContext} />
      </PublicShell>
    </MediaConfigProvider>
  );
}
