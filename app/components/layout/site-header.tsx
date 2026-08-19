import { useId, useState } from "react";
import { Link, NavLink } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { LanguageSwitcher } from "./language-switcher";

interface NavigationGroupProps {
  label: string;
  locale: Locale;
  path: string;
  disclosureLabel: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  items: Array<{ label: string; path: string }>;
}

function NavigationGroup({
  label,
  locale,
  path,
  disclosureLabel,
  open,
  onToggle,
  onNavigate,
  items,
}: NavigationGroupProps) {
  const menuId = useId();

  return (
    <li className="nav-group" data-mobile-open={open || undefined}>
      <div className="nav-group__trigger">
        <NavLink to={localePath(locale, path)} onClick={onNavigate}>
          {label}
        </NavLink>
        <button
          className="nav-group__disclosure"
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={disclosureLabel}
          onClick={onToggle}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <ul className="nav-group__menu" id={menuId}>
        {items.map((item) => (
          <li key={item.path}>
            <Link to={localePath(locale, item.path)} onClick={onNavigate}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const copy = getSiteCopy(locale);
  const navigationId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<"mixing" | "transition" | null>(
    null,
  );

  function closeNavigation() {
    setMenuOpen(false);
    setOpenGroup(null);
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" to={localePath(locale)}>
          Kamel
        </Link>
        <button
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
        <nav
          className="site-navigation"
          id={navigationId}
          aria-label={copy.primaryNavigation}
          data-open={menuOpen || undefined}
        >
          <ul className="site-navigation__list">
            <li>
              <NavLink end to={localePath(locale)} onClick={closeNavigation}>
                {copy.home}
              </NavLink>
            </li>
            <NavigationGroup
              label={copy.mixing}
              locale={locale}
              path="/mixing"
              disclosureLabel={
                openGroup === "mixing" ? copy.collapseMixing : copy.expandMixing
              }
              open={openGroup === "mixing"}
              onNavigate={closeNavigation}
              onToggle={() =>
                setOpenGroup((current) =>
                  current === "mixing" ? null : "mixing",
                )
              }
              items={[
                {
                  label: locale === "zh" ? "完整歌曲混音" : "Full Song Mixing",
                  path: "/mixing/full",
                },
                {
                  label: locale === "zh" ? "Vocal 混音" : "Vocal Mixing",
                  path: "/mixing/vocal",
                },
              ]}
            />
            <NavigationGroup
              label={copy.transition}
              locale={locale}
              path="/song-transition"
              disclosureLabel={
                openGroup === "transition"
                  ? copy.collapseTransition
                  : copy.expandTransition
              }
              open={openGroup === "transition"}
              onNavigate={closeNavigation}
              onToggle={() =>
                setOpenGroup((current) =>
                  current === "transition" ? null : "transition",
                )
              }
              items={[
                {
                  label: locale === "zh" ? "單純歌曲銜接" : "Simple Transition",
                  path: "/song-transition/simple",
                },
                {
                  label:
                    locale === "zh" ? "編輯／剪輯銜接" : "Edited Transition",
                  path: "/song-transition/edit",
                },
              ]}
            />
            <li>
              <NavLink
                to={localePath(locale, "/other")}
                onClick={closeNavigation}
              >
                {copy.other}
              </NavLink>
            </li>
            <li className="site-navigation__language">
              <LanguageSwitcher locale={locale} />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
