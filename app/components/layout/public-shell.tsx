import { useMatches } from "react-router";
import type { PublicSiteContext } from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { ContactBand, type ContactBandVariant } from "./contact-band";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * Route `handle` contract for the shell's contact CTA slot:
 *
 *   export const handle: PublicRouteHandle = {
 *     contactBand: { variant: "project", size: "large" },
 *   };
 *
 * The deepest matching route wins; `contactBand: false` (or no handle) renders
 * nothing. The slot sits after the route's <main>, before the footer, as an
 * <aside> landmark. Pages that need a custom band (home) render
 * <ContactBand /> inline instead and leave the handle unset.
 */
export interface PublicRouteHandle {
  contactBand?:
    | false
    | { variant?: ContactBandVariant; size?: "large" | "small" };
}

function useContactBandSlot(): PublicRouteHandle["contactBand"] {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index]?.handle as PublicRouteHandle | undefined;
    if (handle && "contactBand" in handle) return handle.contactBand;
  }
  return false;
}

/**
 * Header, contact slot and footer around a public page. Identity, navigation,
 * footer groups and contact lines all come from the site context (brand and
 * site settings), which the public layout (and the Studio preview) provide.
 */
export function PublicShell({
  locale,
  site,
  children,
}: {
  locale: Locale;
  site: PublicSiteContext;
  children: React.ReactNode;
}) {
  const copy = getSiteCopy(locale);
  const band = useContactBandSlot();

  return (
    <div className="public-shell">
      <a className="skip-link" href="#main-content">
        {copy.skipToContent}
      </a>
      <SiteHeader
        locale={locale}
        brandName={site.brand.brandName}
        navigation={site.navigation}
      />
      {children}
      {band ? (
        <ContactBand
          locale={locale}
          heading={site.site.contactBand[band.variant ?? "default"]}
          email={site.brand.contactEmail}
          size={band.size}
          as="aside"
        />
      ) : null}
      <SiteFooter
        locale={locale}
        groups={site.footerGroups}
        brand={site.brand}
        site={site.site}
      />
    </div>
  );
}
