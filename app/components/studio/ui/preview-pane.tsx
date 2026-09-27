/**
 * Preview pane (admin-architecture §2.4, §4.4): frames
 * `/studio/preview/<type>/<id>?locale=…` (the Studio CSP allows framing only
 * its own preview route). ZH/EN and Desktop/Mobile toggles; `reloadKey`
 * refreshes it after each save. "Preview changes" in the editor posts the
 * unsaved form into this frame by name (`studio-preview`).
 */
import { useState } from "react";

export const PREVIEW_FRAME_NAME = "studio-preview";

export function previewSrc(src: string, locale: "zh" | "en"): string {
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}locale=${locale}`;
}

export function PreviewPane({
  src,
  title,
  reloadKey = 0,
  defaultLocale = "zh",
  onHide,
}: {
  /** Preview route without the locale parameter. */
  src: string;
  title: string;
  reloadKey?: number | string;
  defaultLocale?: "zh" | "en";
  onHide?: () => void;
}) {
  const [locale, setLocale] = useState<"zh" | "en">(defaultLocale);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <section className="studio-preview" aria-label="Preview">
      <div className="studio-preview__toolbar">
        <fieldset className="studio-segmented" aria-label="Preview language">
          {(["zh", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="studio-segmented__button"
              aria-pressed={locale === value}
              onClick={() => setLocale(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </fieldset>
        <fieldset className="studio-segmented" aria-label="Preview width">
          {(["desktop", "mobile"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="studio-segmented__button"
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
            >
              {value === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </fieldset>
        <a
          className="studio-link studio-preview__open"
          href={previewSrc(src, locale)}
          target="_blank"
          rel="noopener"
        >
          Open in new tab
        </a>
        {onHide ? (
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={onHide}
          >
            Hide preview
          </button>
        ) : null}
      </div>
      <div className={`studio-preview__stage studio-preview__stage--${device}`}>
        <iframe
          key={`${locale}-${reloadKey}`}
          className="studio-preview__frame"
          name={PREVIEW_FRAME_NAME}
          title={`Preview: ${title}`}
          src={previewSrc(src, locale)}
        />
      </div>
    </section>
  );
}
