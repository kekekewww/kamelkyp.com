import type {
  FooterGroup,
  PublicBrand,
  PublicSite,
} from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";

function isExternal(url: string): boolean {
  return url.startsWith("https://");
}

function FooterLinkList({ group }: { group: FooterGroup }) {
  return (
    <ul>
      {group.links.map((link) => {
        const external = isExternal(link.url);
        return (
          <li key={link.id}>
            <a
              href={link.url}
              rel={external ? "noreferrer noopener" : undefined}
              target={external ? "_blank" : undefined}
            >
              {link.label}
              {external ? <span aria-hidden="true">↗</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Footer (IA §3; design-system §6.24). Never shows prices. The lead line,
 * contact email, copyright and location line come from brand and site
 * settings; empty groups and a missing email are omitted.
 */
export function SiteFooter({
  locale,
  groups,
  brand,
  site,
}: {
  locale: Locale;
  groups: readonly FooterGroup[];
  brand: Pick<PublicBrand, "brandName" | "contactEmail" | "locationDisplay">;
  site: Pick<PublicSite, "footerMessage" | "copyright">;
}) {
  const copy = getSiteCopy(locale);
  const visibleGroups = groups.filter((group) => group.links.length > 0);
  const email = brand.contactEmail.trim();
  const copyright =
    site.copyright || `© ${new Date().getUTCFullYear()} ${brand.brandName}`;

  return (
    <footer className="site-footer">
      <div className="site-footer__lead grid">
        <p className="eyebrow col-rail">
          {`${brand.brandName.toUpperCase()} / CONTACT`}
        </p>
        {site.footerMessage ? (
          <p className="site-footer__lead-text">{site.footerMessage}</p>
        ) : null}
        {email ? (
          <a className="site-footer__email text-link" href={`mailto:${email}`}>
            {email}
          </a>
        ) : null}
      </div>

      <div className="site-footer__groups container">
        <nav
          className="site-footer__desktop-groups"
          aria-label={copy.footerNavigation}
        >
          {visibleGroups.map((group) => (
            <section className="footer-group" key={group.id}>
              <h2 data-localized>{group.label}</h2>
              <FooterLinkList group={group} />
            </section>
          ))}
        </nav>

        <div className="site-footer__mobile-groups">
          {visibleGroups.map((group) => (
            <details className="footer-group" key={group.id}>
              <summary>{group.label}</summary>
              <FooterLinkList group={group} />
            </details>
          ))}
        </div>
      </div>

      <div className="site-footer__base container">
        <span>{copyright}</span>
        {brand.locationDisplay ? <span>{brand.locationDisplay}</span> : null}
      </div>
    </footer>
  );
}
