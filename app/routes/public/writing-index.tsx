import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import {
  formatMetaDate,
  mergeWriting,
  WRITING,
  type WritingKind,
  type WritingListItem,
} from "../../content";
import { listPublishedContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "small" },
};

/** Only the first cards take part in the scroll reveal (motion-system §2.2). */
const REVEAL_LIMIT = 8;

const KIND_LABELS: Record<WritingKind, string> = {
  article: "ARTICLE",
  thread: "THREAD",
  post: "POST",
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const posts = await listPublishedContent(db, "post", locale);
  const untitled = locale === "zh" ? "未命名文章" : "Untitled";
  const items = mergeWriting(
    posts.map((post) => ({
      slug: post.slug,
      title: post.title || untitled,
      publishedAt: post.publishedAt,
    })),
    WRITING,
    locale,
  );
  return { locale, items };
}

function WritingAction({
  item,
  locale,
  titleId,
}: {
  item: WritingListItem;
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
    return (
      <a
        className="text-link text-link--external writing-entry__action"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={titleId}
      >
        {isZh ? `在 ${item.sourceLabel} 閱讀` : `Read on ${item.sourceLabel}`}
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

export default function WritingIndexRoute() {
  const { locale, items } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const copy = getSiteCopy(locale);

  return (
    <main className="page writing-page" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">WRITING / NOTES / LINKS</p>
        <h1 className="page-header__title">{isZh ? "文章" : "Writing"}</h1>
        <p className="page-header__intro">
          {isZh
            ? "文章、技術筆記與社群上的短文。"
            : "Articles, technical notes and short posts from social platforms."}
        </p>
      </header>

      <div className="grid">
        {items.length === 0 ? (
          <div className="col-content">
            <EmptyState
              locale={locale}
              title={isZh ? "目前沒有已發布內容" : "Nothing published yet"}
              description={
                isZh
                  ? "新文章、相關網站與公告會在發布後顯示於此。"
                  : "New posts, related websites and announcements will appear here."
              }
            />
          </div>
        ) : (
          <ul className="writing-list" data-reveal-group>
            {items.map((item, index) => {
              const titleId = `writing-${item.id}`;
              return (
                <li
                  className="writing-entry"
                  key={item.id}
                  data-reveal-item={index < REVEAL_LIMIT ? "" : undefined}
                >
                  <article
                    className="writing-entry__article"
                    aria-labelledby={titleId}
                  >
                    <p className="meta-row writing-entry__meta">
                      <span>{KIND_LABELS[item.kind]}</span>
                      <span>
                        <time dateTime={item.date}>
                          {formatMetaDate(item.date)}
                        </time>
                      </span>
                    </p>
                    <div className="writing-entry__main">
                      <h2 className="writing-entry__title" id={titleId}>
                        {item.title}
                      </h2>
                      <p className="writing-entry__source">
                        {item.sourceLabel}
                        {item.placeholder ? (
                          <span className="badge-placeholder">
                            {copy.badgePlaceholder}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <WritingAction
                      item={item}
                      locale={locale}
                      titleId={titleId}
                    />
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
