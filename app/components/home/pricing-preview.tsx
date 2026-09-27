import { useRef } from "react";
import { Link } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { useMagnetic } from "../../lib/motion/use-magnetic";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import { ServicePrice } from "../pricing/service-price";

export interface HomePricing {
  /** Lowest catalog base price per category, TWD. */
  mixingFromTwd: number;
  transitionFromTwd: number;
  fxSnapshot: FxSnapshot | null;
}

/**
 * Home §6: category-level "starting at" strip on a bg-2 zone
 * (design-system §6.15). Not a selection page: rows are not links.
 */
export function PricingPreview({
  locale,
  pricing,
}: {
  locale: Locale;
  pricing: HomePricing;
}) {
  const copy = getSiteCopy(locale);
  const isZh = locale === "zh";
  const ctaRef = useRef<HTMLAnchorElement>(null);
  useMagnetic(ctaRef);
  const startingAt = isZh ? "起價" : "Starting at";

  const rows = [
    {
      id: "mixing",
      name: isZh ? "混音" : "Mixing",
      twd: pricing.mixingFromTwd,
    },
    {
      id: "transition",
      name: isZh ? "歌曲銜接" : "Song Transition",
      twd: pricing.transitionFromTwd,
    },
    {
      id: "software",
      name: isZh ? "軟體與互動" : "Software & Interactive",
      twd: null,
    },
  ];

  return (
    <section
      className="home-section home-pricing zone-2"
      aria-labelledby="home-pricing-title"
      data-magnetic-scope
    >
      <div className="grid section-head">
        <p className="eyebrow">PRICING</p>
        <h2
          className="section-head__title t-h1"
          id="home-pricing-title"
          data-reveal="mask"
        >
          {isZh ? "價格參考" : "Pricing"}
        </h2>
      </div>
      <div className="grid">
        <ul className="home-rows home-pricing__list" data-reveal-group>
          {rows.map((row) => (
            <li key={row.id} className="home-price" data-reveal-item>
              <h3 className="home-price__name t-h2">{row.name}</h3>
              {row.twd === null ? (
                <p className="home-price__quote price__quote">
                  {isZh ? "依專案報價" : "Contact for quote"}
                </p>
              ) : (
                <>
                  <p className="home-price__label price__label">{startingAt}</p>
                  <p className="home-price__figure price__figure price__figure--s">
                    <ServicePrice
                      locale={locale}
                      twd={row.twd}
                      fxSnapshot={pricing.fxSnapshot}
                    />
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="home-pricing__note price__note">
          {isZh
            ? "實際價格依素材與需求確認後報價。"
            : "Final price is confirmed after reviewing the material and scope."}
        </p>
        <div className="home-pricing__action">
          <Link
            ref={ctaRef}
            className="button button--primary"
            to={localePath(locale, "/commission")}
          >
            <span className="button__label" data-magnetic-label>
              {copy.cta}
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
