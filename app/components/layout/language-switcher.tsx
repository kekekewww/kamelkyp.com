import { Link, useLocation } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { switchLocalePath } from "../../lib/i18n/path";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const location = useLocation();
  const nextLocale: Locale = locale === "zh" ? "en" : "zh";
  const returnTo = switchLocalePath(
    `${location.pathname}${location.search}${location.hash}`,
    nextLocale,
  );

  return (
    <Link
      className="language-switcher"
      to={`/language/${nextLocale}?returnTo=${encodeURIComponent(returnTo)}`}
      aria-label={locale === "zh" ? "Switch to English" : "切換至繁體中文"}
    >
      <span className={locale === "zh" ? "is-current" : undefined}>中文</span>
      <span aria-hidden="true"> / </span>
      <span className={locale === "en" ? "is-current" : undefined}>EN</span>
    </Link>
  );
}
