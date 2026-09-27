import { type ReactNode, useId, useRef } from "react";
import { Link } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { useMagnetic } from "../../lib/motion/use-magnetic";

/** Which settings line heads the band (`site.contactBand`). */
export type ContactBandVariant = "default" | "project" | "work";

/**
 * Contact CTA band (design-system §6.18, IA §5.1): the in-page
 * START A PROJECT instance. `large` = bg-2 zone with the measured line (home,
 * page ends); `small` = one line (writing, legal variants).
 *
 * The heading and email come from site/brand settings (the shell passes the
 * variant's line; home passes its own body). Without a heading the band is
 * not rendered; without an email only the CTA shows.
 */
export function ContactBand({
  locale,
  heading,
  size = "large",
  body,
  email = "",
  showEmail = size === "large",
  as: Tag = "section",
}: {
  locale: Locale;
  heading: ReactNode;
  size?: "large" | "small";
  body?: ReactNode;
  /** `brand.contactEmail`; empty hides the mail link. */
  email?: string;
  showEmail?: boolean;
  as?: "section" | "aside";
}) {
  const copy = getSiteCopy(locale);
  const headingId = useId();
  const ctaRef = useRef<HTMLAnchorElement>(null);
  useMagnetic(ctaRef);
  if (!heading) return null;
  const address = email.trim();

  return (
    <Tag
      className={`cta-band cta-band--${size}`}
      aria-labelledby={headingId}
      data-magnetic-scope
    >
      <div className="cta-band__inner grid">
        {size === "large" ? (
          <p className="cta-band__eyebrow eyebrow">START A PROJECT</p>
        ) : null}
        <h2 className="cta-band__heading" id={headingId} data-reveal="mask">
          {heading}
        </h2>
        {body ? <p className="cta-band__body">{body}</p> : null}
        <div className="cta-band__actions">
          <Link
            ref={ctaRef}
            className={`button button--primary${size === "large" ? " button--large" : ""}`}
            to={localePath(locale, "/commission")}
          >
            <span className="button__label" data-magnetic-label>
              {copy.cta}
            </span>
          </Link>
          {showEmail && address ? (
            <a className="text-link" href={`mailto:${address}`}>
              {address}
            </a>
          ) : null}
        </div>
      </div>
    </Tag>
  );
}
