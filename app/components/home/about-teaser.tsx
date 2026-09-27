import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

/**
 * Home §7: small heading, pull text (brand short bio), link
 * (design-system §6.17). No "Kamel" in the heading. Hidden without a bio.
 */
export function AboutTeaser({
  body,
  locale,
}: {
  body: string;
  locale: Locale;
}) {
  if (!body.trim()) return null;
  return (
    <section
      className="home-section home-about"
      aria-labelledby="home-about-title"
    >
      <div className="grid">
        <p className="eyebrow col-rail">ABOUT</p>
        <div className="home-about__body" data-reveal="up">
          <h2 className="home-about__title t-h2" id="home-about-title">
            {locale === "zh" ? "關於" : "About"}
          </h2>
          <p className="home-about__pull t-h1">{body}</p>
          <Link className="text-link" to={localePath(locale, "/about")}>
            {locale === "zh" ? "更多關於我" : "More about me"}
            <span className="text-link__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
