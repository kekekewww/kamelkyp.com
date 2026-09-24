import { Link } from "react-router";
import type {
  PublicWritingDetail,
  PublicWritingItem,
} from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import { BlockRenderer } from "./block-renderer";
import { formatMetaDate, writingKind, writingSource } from "./writing-meta";

function WritingAction({
  item,
  locale,
  titleId,
}: {
  item: PublicWritingItem;
  locale: Locale;
  titleId: string;
}) {
  const isZh = locale === "zh";
  const arrow = item.external ? "↗" : "→";

  if (item.href === null) {
    return (
      <span className="link-pending writing-entry__action">
        {isZh ? "連結待補" : "Link pending"}
      </span>
    );
  }

  if (item.external) {
    const source = writingSource(item);
    return (
      <a
        className="text-link text-link--external writing-entry__action"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={titleId}
      >
        {isZh ? `在 ${source} 閱讀` : `Read on ${source}`}
        <span className="text-link__arrow" aria-hidden="true">
          {arrow}
        </span>
      </a>
    );
  }

  return (
    <Link
      className="text-link writing-entry__action"
      to={item.href}
      aria-describedby={titleId}
    >
      {isZh ? "閱讀全文" : "Read"}
      <span className="text-link__arrow" aria-hidden="true">
        {arrow}
      </span>
    </Link>
  );
}

/**
 * One writing row (IA §4.8): kind and date, title, source, and either an
 * internal "Read" link or an outbound "Read on …" link (no embedded feeds).
 */
export function WritingEntry({
  item,
  locale,
  reveal = false,
}: {
  item: PublicWritingItem;
  locale: Locale;
  reveal?: boolean;
}) {
  const copy = getSiteCopy(locale);
  const titleId = `writing-${item.id}`;
  return (
    <li className="writing-entry" data-reveal-item={reveal ? "" : undefined}>
      <article className="writing-entry__article" aria-labelledby={titleId}>
        <p className="meta-row writing-entry__meta">
          <span>{writingKind(item)}</span>
          {item.date ? (
            <span>
              <time dateTime={item.date}>{formatMetaDate(item.date)}</time>
            </span>
          ) : null}
        </p>
        <div className="writing-entry__main">
          <h2 className="writing-entry__title" id={titleId}>
            {item.title}
          </h2>
          <p className="writing-entry__source">
            {writingSource(item)}
            {item.todoContent ? (
              <span className="badge-placeholder">{copy.badgePlaceholder}</span>
            ) : null}
          </p>
        </div>
        <WritingAction item={item} locale={locale} titleId={titleId} />
      </article>
    </li>
  );
}

/** Writing detail in the document layout (IA §4.9, design-system §6.19). */
export function WritingArticle({
  writing,
  locale,
}: {
  writing: PublicWritingDetail;
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const copy = getSiteCopy(locale);
  return (
    <main className="page writing-detail" id="main-content">
      <div className="grid">
        <Link
          className="text-link text-link--back writing-detail__back col-content"
          to={localePath(locale, "/writing")}
        >
          <span className="text-link__arrow" aria-hidden="true">
            ←
          </span>
          {isZh ? "返回文章" : "Back to writing"}
        </Link>
      </div>
      <article className="writing-detail__article grid">
        <header className="writing-detail__header">
          <p className="meta-row">
            <span>{writingKind(writing)}</span>
            {writing.date ? (
              <span>
                <time dateTime={writing.date}>
                  {formatMetaDate(writing.date)}
                </time>
              </span>
            ) : null}
          </p>
          <h1 className="writing-detail__title">
            {writing.title || (isZh ? "未命名文章" : "Untitled")}
          </h1>
          {writing.todoContent ? (
            <span className="badge-placeholder">{copy.badgePlaceholder}</span>
          ) : null}
          {writing.excerpt ? (
            <p className="writing-detail__summary">{writing.excerpt}</p>
          ) : null}
        </header>
        <div className="writing-detail__body">
          <BlockRenderer
            blocks={writing.content}
            locale={locale}
            media={writing.media}
          />
        </div>
      </article>
    </main>
  );
}
