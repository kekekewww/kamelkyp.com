import {
  type LoaderFunctionArgs,
  type MetaFunction,
  Outlet,
  useLoaderData,
} from "react-router";
import { PublicShell } from "../../components/layout/public-shell";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { MediaConfigProvider } from "../../lib/cms/media/media-config-context";
import { publicMeta } from "../../lib/cms/public/meta";
import {
  fallbackSiteContext,
  getPublicSiteContext,
} from "../../lib/cms/public/site.server";
import type { PublicSiteContext } from "../../lib/cms/public/view-models";
import { isLocale, type Locale } from "../../lib/i18n/locale";

export interface PublicOutletContext {
  locale: Locale;
}

/** Default head for pages without their own meta (home uses `siteTitle`). */
export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  loaderData?.site ? publicMeta({ site: loaderData.site }) : [];

/**
 * Site context for every public page (content-architecture §3.6): brand, site
 * settings, navigation, footer groups, social links and media config, read
 * from the Content Studio tables. Child routes read it with `usePublicSite()`
 * and `siteFromMatches()` (meta). A missing context (unit tests) or a failed
 * read falls back to the settings defaults so a public page never renders
 * broken.
 */
export async function loader({
  params,
  context,
}: LoaderFunctionArgs): Promise<{ locale: Locale; site: PublicSiteContext }> {
  if (!params.lang || !isLocale(params.lang)) {
    throw new Response("Not Found", { status: 404 });
  }

  const locale = params.lang;
  const provider = context as typeof context | undefined;
  if (!provider) return { locale, site: fallbackSiteContext(null, locale) };

  const { env } = provider.get(cloudflareContext);
  try {
    return { locale, site: await getPublicSiteContext(env.DB, env, locale) };
  } catch {
    console.warn("public_site_context_unavailable");
    return { locale, site: fallbackSiteContext(env, locale) };
  }
}

export default function PublicLayoutRoute() {
  const data = useLoaderData<typeof loader>();
  const outletContext: PublicOutletContext = { locale: data.locale };

  return (
    <MediaConfigProvider value={data.site.mediaConfig}>
      <PublicShell locale={data.locale} site={data.site}>
        <Outlet context={outletContext} />
      </PublicShell>
    </MediaConfigProvider>
  );
}
