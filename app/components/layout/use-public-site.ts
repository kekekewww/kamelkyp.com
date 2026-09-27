/**
 * The site context (brand + site settings, navigation, footer, media config)
 * for route modules, from the public layout or, on /studio/preview/*, from
 * the preview layout. Components receive the pieces they need as props.
 */
import { useRouteLoaderData } from "react-router";
import type { PublicSiteContext } from "../../lib/cms/public/view-models";

type LayoutData = { site?: PublicSiteContext | null } | undefined;

export function usePublicSite(): PublicSiteContext {
  const publicData = useRouteLoaderData("routes/public/layout") as LayoutData;
  const previewData = useRouteLoaderData(
    "routes/studio/preview/layout",
  ) as LayoutData;
  const site = publicData?.site ?? previewData?.site;
  if (!site) throw new Error("public_site_context_missing");
  return site;
}
