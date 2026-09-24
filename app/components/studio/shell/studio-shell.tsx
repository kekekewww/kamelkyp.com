/**
 * Studio shell (admin-architecture §4.1, §4.14, §5): fixed sidebar with the
 * KAMEL STUDIO wordmark, grouped navigation, preview/live links and the
 * account menu; one main column. Below 768 px the sidebar becomes a menu
 * panel opened from a compact top bar. Keyboard: `g` + key goes to a
 * section, `?` opens the shortcut help.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ShortcutHelp } from "../ui/shortcut-help";
import { activeNavItem, GO_TO_SHORTCUTS, STUDIO_NAV } from "./nav";

export function StudioWordmark() {
  return (
    <Link className="studio-wordmark" to="/studio" aria-label="KAMEL STUDIO">
      <span className="studio-wordmark__brand" aria-hidden="true">
        Kamel
      </span>
      <span className="studio-wordmark__product" aria-hidden="true">
        Studio
      </span>
    </Link>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/** `g` then a section key (within 1.5 s) navigates; `?` toggles help. */
function useStudioShortcuts(onHelp: () => void) {
  const navigate = useNavigate();
  useEffect(() => {
    let pendingGo = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        onHelp();
        return;
      }
      if (pendingGo && Date.now() - pendingGo < 1500) {
        pendingGo = 0;
        const target = GO_TO_SHORTCUTS.get(event.key.toLowerCase());
        if (target) {
          event.preventDefault();
          navigate(target);
        }
        return;
      }
      pendingGo = event.key === "g" ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, onHelp]);
}

export function StudioShell({
  ownerEmail,
  attentionCount = 0,
  pendingCommissions = 0,
  children,
}: {
  ownerEmail: string;
  attentionCount?: number;
  pendingCommissions?: number;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuId = useId();
  const active = activeNavItem(location.pathname);
  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  useStudioShortcuts(toggleHelp);

  // Close the mobile menu after navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on path change only
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const counts = {
    attention: attentionCount,
    commissions: pendingCommissions,
  } as const;

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-main">
        Skip to content
      </a>

      <header className="studio-mobilebar">
        <StudioWordmark />
        <button
          type="button"
          className="studio-btn studio-btn--ghost studio-btn--compact"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>

      <aside
        className="studio-sidebar"
        id={menuId}
        data-open={menuOpen ? "" : undefined}
        aria-label="Studio"
      >
        <div className="studio-sidebar__head">
          <StudioWordmark />
        </div>
        <nav className="studio-nav" aria-label="Studio sections">
          {STUDIO_NAV.map((group) => (
            <div className="studio-nav__group" key={group.label || "home"}>
              {group.label ? (
                <p className="studio-nav__label">{group.label}</p>
              ) : null}
              <ul className="studio-nav__list">
                {group.items.map((item) => {
                  const count = item.count ? counts[item.count] : 0;
                  const current = active?.to === item.to;
                  return (
                    <li key={item.to}>
                      <Link
                        className="studio-nav__link"
                        to={item.to}
                        aria-current={current ? "page" : undefined}
                      >
                        <span>{item.label}</span>
                        {count > 0 ? (
                          <span className="studio-nav__count">
                            <span aria-hidden="true">{count}</span>
                            <span className="visually-hidden">
                              {item.count === "attention"
                                ? `, ${count} items need attention`
                                : `, ${count} pending review`}
                            </span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="studio-sidebar__foot">
          <a
            className="studio-nav__link"
            href="/studio/preview/home?drafts=1"
            target="_blank"
            rel="noopener"
          >
            <span>Preview site</span>
            <span aria-hidden="true">↗</span>
          </a>
          <a
            className="studio-nav__link"
            href="/zh"
            target="_blank"
            rel="noopener"
          >
            <span>Live site</span>
            <span aria-hidden="true">↗</span>
          </a>
          <details className="studio-account">
            <summary className="studio-account__summary">
              <span className="studio-account__email">{ownerEmail}</span>
            </summary>
            <div className="studio-account__menu">
              <button
                type="button"
                className="studio-account__item"
                onClick={() => setHelpOpen(true)}
              >
                Keyboard shortcuts
              </button>
              <a className="studio-account__item" href="/cdn-cgi/access/logout">
                Sign out
              </a>
            </div>
          </details>
        </div>
      </aside>

      <main className="studio-main" id="studio-main" tabIndex={-1}>
        {children}
      </main>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
