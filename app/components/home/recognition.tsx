import { listRecognition, localize } from "../../content";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";

/** Home §4: newest three, YEAR / EVENT / RESULT rows (design-system §6.11). */
export function Recognition({ locale }: { locale: Locale }) {
  const copy = getSiteCopy(locale);
  const entries = listRecognition(3);
  if (entries.length === 0) return null;

  return (
    <section
      className="home-section home-recognition"
      aria-labelledby="home-recognition-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">RECOGNITION</p>
        <h2
          className="section-head__title t-h1"
          id="home-recognition-title"
          data-reveal="mask"
        >
          {locale === "zh" ? "獲獎與肯定" : "Recognition"}
        </h2>
      </div>
      <div className="grid">
        <ul className="home-rows home-recognition__list" data-reveal-group>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="home-recognition__row"
              data-reveal-item
            >
              <span className="home-recognition__year t-meta">
                {entry.year}
              </span>
              <span className="home-recognition__event">
                {entry.url ? (
                  <a
                    className="text-link"
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {localize(entry.event, locale)}
                    <span className="text-link__arrow" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                ) : (
                  localize(entry.event, locale)
                )}
              </span>
              <span className="home-recognition__result t-secondary">
                {localize(entry.result, locale)}
              </span>
              <span className="home-recognition__badge">
                {entry.placeholder ? (
                  <span className="badge-placeholder">
                    {copy.badgePlaceholder}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
