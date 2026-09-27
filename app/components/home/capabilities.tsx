import type { PublicBrand } from "../../lib/cms/public/view-models";
import type { Locale } from "../../lib/i18n/locale";

export type CapabilityItem = PublicBrand["capabilities"][number];

/**
 * Home §3: capability rows, not cards (design-system §6.12). Content comes
 * from brand settings; with none the section is not rendered.
 */
export function Capabilities({
  items,
  locale,
}: {
  items: readonly CapabilityItem[];
  locale: Locale;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className="home-section home-capabilities"
      aria-labelledby="home-capabilities-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">
          CAPABILITIES / {String(items.length).padStart(2, "0")}
        </p>
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
          {items.map((capability) => (
            <li
              key={capability.key}
              className="home-capability"
              data-reveal-item
            >
              <span className="home-capability__index t-meta">
                {capability.index}
              </span>
              <h3 className="home-capability__title t-h1">
                {capability.title}
              </h3>
              <div className="home-capability__body">
                {capability.description ? (
                  <p className="t-lede t-secondary">{capability.description}</p>
                ) : null}
                {capability.items.length > 0 ? (
                  <ul className="home-capability__items t-body-s">
                    {capability.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
