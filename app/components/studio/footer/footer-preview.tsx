/**
 * The saved public footer, ZH or EN, composed by the same
 * `composeFooterGroups` the public layout uses (wp3 spec §4.5).
 */
import { useState } from "react";
import { composeFooterGroups } from "../../../lib/cms/public/footer";
import type {
  FooterScreenSources,
  StudioFooterGroup,
} from "../../../lib/cms/schemas/footer";
import type { Locale } from "../../../lib/cms/types";
import { localizeRecords } from "./footer-model";

export function FooterPreview({
  groups,
  sources,
}: {
  groups: readonly StudioFooterGroup[];
  sources: FooterScreenSources;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const lang = locale === "zh" ? "zh-Hant" : "en";
  const composed = composeFooterGroups(
    localizeRecords(groups, sources, locale),
  );
  return (
    <aside
      className="p3-footer-preview studio-footer__preview"
      aria-labelledby="studio-footer-preview"
    >
      <div className="p3-footer-preview__head">
        <h2 className="studio-section-label" id="studio-footer-preview">
          Public footer
        </h2>
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
      </div>
      {composed.length === 0 ? (
        <p className="studio-hint">No footer group is shown.</p>
      ) : (
        <div className="studio-footer__preview-groups" lang={lang}>
          {composed.map((group) => (
            <section className="studio-footer__preview-group" key={group.id}>
              <h3 className="p3-footer-preview__group">{group.label}</h3>
              <ul className="p3-footer-preview__list">
                {group.links.map((item) => (
                  <li key={item.id}>
                    {item.label}
                    {item.url.startsWith("https:") ? (
                      <span aria-hidden="true"> ↗</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="studio-hint">
        Shows the saved footer; unsaved edits appear after you save.
      </p>
    </aside>
  );
}
