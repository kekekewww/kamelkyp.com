import { CAPABILITIES, localize } from "../../content";
import type { Locale } from "../../lib/i18n/locale";

/** Home §3: four capability rows, not cards (design-system §6.12). */
export function Capabilities({ locale }: { locale: Locale }) {
  return (
    <section
      className="home-section home-capabilities"
      aria-labelledby="home-capabilities-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">CAPABILITIES / 04</p>
        <h2
          className="section-head__title t-h1"
          id="home-capabilities-title"
          data-reveal="mask"
        >
          {locale === "zh" ? "能力範圍" : "Capabilities"}
        </h2>
      </div>
      <div className="grid">
        <ul className="home-rows home-capabilities__list" data-reveal-group>
          {CAPABILITIES.map((capability) => (
            <li
              key={capability.id}
              className="home-capability"
              data-reveal-item
            >
              <span className="home-capability__index t-meta">
                {capability.index}
              </span>
              <h3 className="home-capability__title t-h1">
                {localize(capability.title, locale)}
              </h3>
              <div className="home-capability__body">
                <p className="t-lede t-secondary">
                  {localize(capability.description, locale)}
                </p>
                <ul className="home-capability__items t-body-s">
                  {capability.items.map((item) => (
                    <li key={item.en}>{localize(item, locale)}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
