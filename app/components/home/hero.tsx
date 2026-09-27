import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { PublicBrand } from "../../lib/cms/public/view-models";
import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import { useMagnetic } from "../../lib/motion/use-magnetic";
import { HeroCanvas } from "../hero/hero-canvas";
import { MediaPreview } from "../media/media-preview";

/** UI strings only; identity, roles, statement and CTAs come from settings. */
const COPY = {
  zh: {
    label: "自我介紹",
    showreelEmpty: "尚無可播放的 Showreel",
    showreelPending: "作品待發布",
  },
  en: {
    label: "Introduction",
    showreelEmpty: "No showreel is available yet",
    showreelPending: "Showreel pending",
  },
} as const;

/** The CSS intro runs once per document load, never on client navigations (motion §2.1). */
let introPlayed = false;

function EmptyShowreel({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  return (
    <div className="home-showreel">
      <button
        className="home-showreel__play"
        type="button"
        disabled
        aria-label={copy.showreelEmpty}
      >
        <span className="home-showreel__glyph" aria-hidden="true" />
      </button>
      <div className="home-showreel__track">
        <span className="flat-line home-showreel__line" aria-hidden="true" />
        <p className="home-showreel__meta t-meta">
          <span>{copy.showreelPending}</span>
          <span className="t-tabular">00:00 / 00:00</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Home §1: the brand wordmark (the only public identity), roles, statement,
 * CTAs, showreel and field, all from brand settings. Never autoplay: the
 * showreel is the existing click-to-play player (or its empty state).
 */
export function Hero({
  locale,
  brand,
  showreel,
  showreelVisible = true,
}: {
  locale: Locale;
  brand: PublicBrand;
  showreel: MediaItem | null;
  /** Site setting `homepage.sections.showreel`. */
  showreelVisible?: boolean;
}) {
  const copy = COPY[locale];
  const heroRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  useMagnetic(ctaRef);
  const [intro, setIntro] = useState(() => !introPlayed);

  useEffect(() => {
    introPlayed = true;
    if (!intro) return;
    // Longest step: 400ms delay + 720ms; drop the class so later renders are static.
    const timer = window.setTimeout(() => setIntro(false), 1300);
    return () => window.clearTimeout(timer);
  }, [intro]);

  const actions = [brand.primaryCta, brand.secondaryCta].filter(
    (cta): cta is NonNullable<typeof cta> => cta !== null,
  );

  return (
    <section
      ref={heroRef}
      className={`home-hero${intro ? " hero-intro" : ""}`}
      aria-label={copy.label}
      data-magnetic-scope
    >
      <div className="home-hero__inner grid">
        <div className="home-hero__identity">
          <p className="eyebrow hero-intro__item" data-intro-step="0">
            SOUND × SOFTWARE × INTERACTION
          </p>
          <h1
            className="home-hero__wordmark t-wordmark hero-intro__item"
            data-intro-step="1"
          >
            {brand.brandName}
          </h1>
        </div>

        <div className="home-hero__intro">
          {brand.roles.length > 0 ? (
            <ul
              className="home-hero__roles t-lede hero-intro__item"
              data-intro-step="2"
            >
              {brand.roles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          ) : null}
          {brand.heroStatement ? (
            <p
              className="home-hero__statement t-h1 hero-intro__item"
              data-intro-step="3"
            >
              {brand.heroStatement}
            </p>
          ) : null}
          {brand.heroSubtext ? (
            <p
              className="home-hero__subtext t-lede t-secondary hero-intro__item"
              data-intro-step="4"
            >
              {brand.heroSubtext}
            </p>
          ) : null}
          {actions.length > 0 ? (
            <div
              className="home-hero__actions button-row button-row--stack hero-intro__item"
              data-intro-step="5"
            >
              {actions.map((cta, position) =>
                position === 0 ? (
                  <Link
                    key={cta.href}
                    ref={ctaRef}
                    className="button button--primary"
                    to={cta.href}
                  >
                    <span className="button__label" data-magnetic-label>
                      {cta.label}
                    </span>
                  </Link>
                ) : (
                  <Link
                    key={cta.href}
                    className="button button--ghost"
                    to={cta.href}
                  >
                    {cta.label}
                  </Link>
                ),
              )}
            </div>
          ) : null}
        </div>

        <HeroCanvas heroRef={heroRef} />

        {showreelVisible ? (
          <div className="home-hero__stage">
            {showreel ? (
              <MediaPreview item={showreel} locale={locale} />
            ) : (
              <EmptyShowreel locale={locale} />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
