import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { brandHomeLabel, getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import {
  isNavSectionActive,
  localePath,
  type NavSection,
} from "../../lib/i18n/path";
import { useMagnetic } from "../../lib/motion/use-magnetic";
import { NavigationProgress } from "../motion/navigation-progress";
import { LanguageSwitcher } from "./language-switcher";

type NavKey = Exclude<NavSection, "home" | "cta">;

/** Site structure: each navigation key's page. Labels stay UI copy. */
const NAV_PATHS: Record<NavKey, string> = {
  work: "/works",
  services: "/services",
  about: "/about",
  writing: "/writing",
};

const DEFAULT_NAVIGATION: ReadonlyArray<{ key: NavKey; visible: boolean }> = [
  { key: "work", visible: true },
  { key: "services", visible: true },
  { key: "about", visible: true },
  { key: "writing", visible: true },
];

/** Magnetic only on the four desktop nav links and the CTA (motion-system §2.5). */
function NavItem({
  href,
  label,
  current,
  onNavigate,
}: {
  href: string;
  label: string;
  current: boolean;
  onNavigate: () => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useMagnetic(ref);

  return (
    <li>
      <Link
        ref={ref}
        className="site-nav__link"
        to={href}
        viewTransition
        aria-current={current ? "page" : undefined}
        onClick={onNavigate}
      >
        <span className="site-nav__label" data-magnetic-label>
          {label}
        </span>
      </Link>
    </li>
  );
}

/**
 * Site header: the brand wordmark (brand settings, "Kamel" by default) and
 * the primary navigation in the order and visibility set in site settings.
 */
export function SiteHeader({
  locale,
  brandName = "Kamel",
  navigation = DEFAULT_NAVIGATION,
}: {
  locale: Locale;
  brandName?: string;
  navigation?: ReadonlyArray<{ key: NavKey; visible: boolean }>;
}) {
  const copy = getSiteCopy(locale);
  const navItems = navigation.filter(
    (item) => item.visible && item.key in NAV_PATHS,
  );
  const location = useLocation();
  const navigationId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  useMagnetic(ctaRef);

  const pathname = location.pathname;
  const ctaHref = localePath(locale, "/commission");

  // Navigating closes the panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every path change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Body scroll lock + Escape (disclosure, not a modal: no focus trap).
  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    root.setAttribute("data-menu-open", "");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeAttribute("data-menu-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Close the panel if the viewport grows into the desktop layout.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setMenuOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Compact after 24px of scroll (height only, never hidden).
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      header.toggleAttribute("data-scrolled", window.scrollY > 24);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => setMenuOpen(false);

  return (
    <header className="site-header" ref={headerRef} data-magnetic-scope>
      <div className="site-header__bar container">
        <Link
          className="site-header__brand"
          to={localePath(locale)}
          viewTransition
          aria-label={brandHomeLabel(locale, brandName || "Kamel")}
          aria-current={
            isNavSectionActive(pathname, "home") ? "page" : undefined
          }
        >
          {brandName || "Kamel"}
        </Link>

        <nav
          className="site-nav"
          id={navigationId}
          aria-label={copy.primaryNavigation}
          data-open={menuOpen || undefined}
        >
          <div className="site-nav__inner">
            <ul className="site-nav__list">
              {navItems.map((item) => (
                <NavItem
                  key={item.key}
                  href={localePath(locale, NAV_PATHS[item.key])}
                  label={copy[item.key]}
                  current={isNavSectionActive(pathname, item.key)}
                  onNavigate={close}
                />
              ))}
            </ul>
            <div className="site-nav__panel-actions">
              <Link
                className="button button--primary"
                to={ctaHref}
                onClick={close}
              >
                {copy.cta}
              </Link>
              <LanguageSwitcher locale={locale} />
            </div>
          </div>
        </nav>

        <Link
          ref={ctaRef}
          className="site-header__cta button button--inverse button--compact"
          to={ctaHref}
          aria-current={
            isNavSectionActive(pathname, "cta") ? "page" : undefined
          }
        >
          <span className="button__label" data-magnetic-label>
            {copy.cta}
          </span>
        </Link>

        <div className="site-header__language">
          <LanguageSwitcher locale={locale} />
        </div>

        <button
          ref={menuButtonRef}
          className="site-header__menu-button"
          type="button"
          aria-label={menuOpen ? copy.closeMenu : copy.openMenu}
          aria-expanded={menuOpen}
          aria-controls={navigationId}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>
      <NavigationProgress />
    </header>
  );
}
