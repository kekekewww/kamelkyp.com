import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import { listPublishedContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, items: await listPublishedContent(db, "post", locale) };
}

export default function OtherIndexRoute() {
  const { locale, items } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="content-index-page" id="main-content">
      <header className="content-index-page__header">
        <p className="eyebrow">NOTES / LINKS / UPDATES</p>
        <h1>{isZh ? "其他內容" : "Other Work"}</h1>
        <p>
          {isZh
            ? "網站、社群貼文、個人公告與工作相關內容。"
            : "Web projects, social posts, announcements and work notes."}
        </p>
      </header>
      {items.length === 0 ? (
        <EmptyState
          locale={locale}
          title={isZh ? "目前沒有已發布內容" : "Nothing published yet"}
          description={
            isZh
              ? "新文章、相關網站與公告會在發布後顯示於此。"
              : "New posts, related websites and announcements will appear here."
          }
        />
      ) : (
        <div className="content-index">
          {items.map((item, index) => (
            <article key={item.entryId}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{item.title}</h2>
                {item.summary ? <p>{item.summary}</p> : null}
              </div>
              <Link to={localePath(locale, `/other/${item.slug}`)}>
                {isZh ? "閱讀內容" : "Read"} →
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
