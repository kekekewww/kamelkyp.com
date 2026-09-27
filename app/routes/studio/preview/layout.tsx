/**
 * Studio preview layout (admin-architecture §2.4, content-architecture §3.8):
 * the real public shell (header and footer from the published site context)
 * around the real public page component, plus the fixed PREVIEW bar.
 *
 * Security: under the `/studio` root, so the owner middleware runs first; the
 * loader is also `withOwner`. Responses carry `Cache-Control: no-store`,
 * `X-Robots-Tag: noindex, nofollow` and the `frame-ancestors 'self'` CSP
 * variant (headers.server.ts); the page adds `<meta name="robots">`. Ids are
 * UUID/seed ids and nothing public links here.
 */
import { Outlet, useLoaderData, useLocation } from "react-router";
import { PreviewBar } from "../../../components/layout/preview-bar";
import { PublicShell } from "../../../components/layout/public-shell";
import { MediaConfigProvider } from "../../../lib/cms/media/media-config-context";
import { previewLocale } from "../../../lib/cms/public/preview.server";
import {
  fallbackSiteContext,
  getPublicSiteContext,
} from "../../../lib/cms/public/site.server";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(async ({ db, env, request }) => {
  const locale = previewLocale(request);
  try {
    return { locale, site: await getPublicSiteContext(db, env, locale) };
  } catch {
    return { locale, site: fallbackSiteContext(env, locale) };
  }
});

export default function PreviewLayoutRoute() {
  const { locale, site } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  return (
    <MediaConfigProvider value={site.mediaConfig}>
      <div className="preview-frame">
        <PublicShell locale={locale} site={site}>
          <Outlet />
        </PublicShell>
      </div>
      <PreviewBar locale={locale} search={search} />
    </MediaConfigProvider>
  );
}
