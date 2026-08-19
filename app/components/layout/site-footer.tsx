import type { FooterGroup } from "../../lib/content/footer-repository.server";
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
              {external ? <span aria-hidden="true"> ↗</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function SiteFooter({
  locale,
  groups,
}: {
  locale: Locale;
  groups: FooterGroup[];
}) {
  return (
    <footer className="site-footer">
      <div className="site-footer__lead">
        <p className="eyebrow">KAMEL / CONTACT</p>
        <p>
          {locale === "zh"
            ? "需要混音或歌曲銜接？先選擇服務，再把作品需求說清楚。"
            : "Need a mix or a song transition? Choose a service, then tell me what the work needs."}
        </p>
        <a className="text-link" href="mailto:kevinyaungputra@gmail.com">
          kevinyaungputra@gmail.com
        </a>
      </div>

      <nav
        className="site-footer__desktop-groups"
        aria-label={locale === "zh" ? "頁尾連結" : "Footer links"}
      >
        {groups.map((group) => (
          <section className="footer-group" key={group.id}>
            <h2>{group.label}</h2>
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

      <div className="site-footer__base">
        <span>© {new Date().getUTCFullYear()} Kamel</span>
        <span>{locale === "zh" ? "臺灣 · 遠端合作" : "Taiwan · Remote"}</span>
      </div>
    </footer>
  );
}
