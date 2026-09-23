import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { MediaItem } from "../../lib/media/media-schema";
import { useMagnetic } from "../../lib/motion/use-magnetic";
import { HeroCanvas } from "../hero/hero-canvas";
import { MediaPreview } from "../media/media-preview";

const COPY = {
  zh: {
    label: "自我介紹",
    realName: "楊子賢",
    roles: ["音樂製作人", "軟體開發者", "創意科技"],
    statement: "打造系統、聲音與互動體驗。",
    viewWork: "查看作品",
    showreelEmpty: "尚無可播放的 Showreel",
    showreelPending: "作品待發布",
  },
  en: {
    label: "Introduction",
    realName: "Kevin Yang",
    roles: ["Music Producer", "Software Developer", "Creative Technologist"],
    statement: "Building systems, sound, and interactive experiences.",
    viewWork: "View work",
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

/** Home §1: wordmark, the single real-name line, roles, statement, CTAs, showreel, field. */
export function Hero({
  locale,
  showreel,
  r2Hosts,
}: {
  locale: Locale;
  showreel: MediaItem | null;
  r2Hosts: ReadonlySet<string>;
}) {
  const copy = COPY[locale];
  const site = getSiteCopy(locale);
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
          <p
            className="home-hero__real-name hero-intro__item"
            data-intro-step="1"
          >
            {copy.realName}
          </p>
          <h1
            className="home-hero__wordmark t-wordmark hero-intro__item"
            data-intro-step="2"
          >
            Kamel
          </h1>
        </div>

        <div className="home-hero__intro">
          <ul
            className="home-hero__roles t-lede hero-intro__item"
            data-intro-step="3"
          >
            {copy.roles.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
          <p
            className="home-hero__statement t-h1 hero-intro__item"
            data-intro-step="4"
          >
            {copy.statement}
          </p>
          <div
            className="home-hero__actions button-row button-row--stack hero-intro__item"
            data-intro-step="5"
          >
            <Link
              ref={ctaRef}
              className="button button--primary"
              to={localePath(locale, "/commission")}
            >
              <span className="button__label" data-magnetic-label>
                {site.cta}
              </span>
            </Link>
            <Link
              className="button button--ghost"
              to={localePath(locale, "/works")}
            >
              {copy.viewWork}
            </Link>
          </div>
        </div>

        <HeroCanvas heroRef={heroRef} />

        <div className="home-hero__stage">
          {showreel ? (
            <MediaPreview item={showreel} locale={locale} r2Hosts={r2Hosts} />
          ) : (
            <EmptyShowreel locale={locale} />
          )}
        </div>
      </div>
    </section>
  );
}
