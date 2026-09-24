import { Link } from "react-router";
import type { PublicWritingItem } from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import {
  formatMetaDate,
  writingKind,
  writingSource,
} from "../content/writing-meta";

function Action({ item, locale }: { item: PublicWritingItem; locale: Locale }) {
  const isZh = locale === "zh";
  if (!item.href) {
    return (
      <span className="link-pending">{isZh ? "連結待補" : "Link pending"}</span>
    );
  }
  if (!item.external) {
    return (
      <Link className="text-link" to={item.href}>
        {isZh ? "閱讀全文" : "Read"}
        <span className="text-link__arrow" aria-hidden="true">
          →
        </span>
      </Link>
    );
  }
  const source = writingSource(item);
  return (
    <a
      className="text-link"
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {isZh ? `在 ${source} 閱讀` : `Read on ${source}`}
      <span className="text-link__arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}

/**
 * Home §8: featured, then newest writing entries as rows
 * (design-system §6.16). With none the section is not rendered.
 */
export function WritingPreview({
  items,
  locale,
}: {
  items: readonly PublicWritingItem[];
  locale: Locale;
}) {
  const copy = getSiteCopy(locale);
  const isZh = locale === "zh";
  if (items.length === 0) return null;

  return (
    <section
      className="home-section home-writing"
      aria-labelledby="home-writing-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">WRITING / NOTES</p>
        <h2
          className="section-head__title t-h1"
          id="home-writing-title"
          data-reveal="mask"
        >
          {isZh ? "文章與貼文" : "Writing"}
        </h2>
        <div className="section-head__aside">
          <Link className="text-link" to={localePath(locale, "/writing")}>
            {isZh ? "所有文章" : "All writing"}
            <span className="text-link__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>
      <div className="grid">
        <ul className="home-rows home-writing__list" data-reveal-group>
          {items.map((item) => (
            <li key={item.id} data-reveal-item>
              <article className="home-entry">
                <p className="home-entry__meta meta-row">
                  <span>{writingKind(item)}</span>
                  {item.date ? <span>{formatMetaDate(item.date)}</span> : null}
                </p>
                <div className="home-entry__main">
                  <h3 className="home-entry__title t-h2">{item.title}</h3>
                  {item.todoContent ? (
                    <span className="badge-placeholder">
                      {copy.badgePlaceholder}
                    </span>
                  ) : null}
                  <p className="home-entry__source t-body-s t-secondary">
                    {writingSource(item)}
                  </p>
                </div>
                <div className="home-entry__action">
                  <Action item={item} locale={locale} />
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
