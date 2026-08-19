import type { FooterGroup } from "../../lib/content/footer-repository.server";
import type { Locale } from "../../lib/i18n/locale";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function PublicShell({
  locale,
  footerGroups,
  children,
}: {
  locale: Locale;
  footerGroups: FooterGroup[];
  children: React.ReactNode;
}) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#main-content">
        {locale === "zh" ? "跳至主要內容" : "Skip to main content"}
      </a>
      <SiteHeader locale={locale} />
      {children}
      <SiteFooter locale={locale} groups={footerGroups} />
    </div>
  );
}
