import { type ReactNode, useId, useRef } from "react";
import { Link } from "react-router";
import { CONTACT_EMAIL, getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { useMagnetic } from "../../lib/motion/use-magnetic";

export type ContactBandVariant = "default" | "project" | "work";

/**
 * Contact CTA band (design-system §6.18, IA §5.1): the in-page
 * START A PROJECT instance. `large` = bg-2 zone with the measured line (home,
 * page ends); `small` = one line (writing, legal variants).
 *
 * Use either inline inside a page's <main>, or via the shell slot by exporting
 * `handle = { contactBand: { variant, size } }` from the route module.
 */
export function ContactBand({
  locale,
  variant = "default",
  size = "large",
  heading,
  body,
  showEmail = size === "large",
  as: Tag = "section",
}: {
  locale: Locale;
  variant?: ContactBandVariant;
  size?: "large" | "small";
  /** Overrides the variant heading. */
  heading?: ReactNode;
  body?: ReactNode;
  showEmail?: boolean;
  as?: "section" | "aside";
}) {
  const copy = getSiteCopy(locale);
  const headingId = useId();
  const ctaRef = useRef<HTMLAnchorElement>(null);
  useMagnetic(ctaRef);

  const title =
    heading ??
    (variant === "project"
      ? copy.ctaBandProject
      : variant === "work"
        ? copy.ctaBandWork
        : copy.ctaBandDefault);

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
          {title}
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
          {showEmail ? (
            <a className="text-link" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          ) : null}
        </div>
      </div>
    </Tag>
  );
}
