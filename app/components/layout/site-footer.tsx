import type { FooterGroup } from "../../lib/content/footer-repository.server";
import { CONTACT_EMAIL, getSiteCopy } from "../../lib/i18n/copy";
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

/** Footer (IA §3; design-system §6.24). Never shows prices. */
export function SiteFooter({
  locale,
  groups,
}: {
  locale: Locale;
  groups: FooterGroup[];
}) {
  const copy = getSiteCopy(locale);

  return (
    <footer className="site-footer">
      <div className="site-footer__lead grid">
        <p className="eyebrow col-rail">KAMEL / CONTACT</p>
        <p className="site-footer__lead-text">{copy.footerLead}</p>
        <a
          className="site-footer__email text-link"
          href={`mailto:${CONTACT_EMAIL}`}
        >
          {CONTACT_EMAIL}
        </a>
      </div>

      <div className="site-footer__groups container">
        <nav
          className="site-footer__desktop-groups"
          aria-label={copy.footerNavigation}
        >
          {groups.map((group) => (
            <section className="footer-group" key={group.id}>
              <h2 data-localized>{group.label}</h2>
              <FooterLinkList group={group} />
            </section>
          ))}
        </nav>

        <div className="site-footer__mobile-groups">
          {groups.map((group) => (
            <details className="footer-group" key={group.id}>
              <summary>{group.label}</summary>
              <FooterLinkList group={group} />
            </details>
          ))}
        </div>
      </div>

      <div className="site-footer__base container">
        <span>© {new Date().getUTCFullYear()} Kamel</span>
        <span>{copy.footerBase}</span>
      </div>
    </footer>
  );
}
