import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import { listPublishedContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, items: await listPublishedContent(db, "work", locale) };
}

export default function WorksIndexRoute() {
  const { locale, items } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="content-index-page" id="main-content">
      <header className="content-index-page__header">
        <p className="eyebrow">SELECTED WORK / ARCHIVE</p>
        <h1>{isZh ? "作品" : "Works"}</h1>
        <p>
          {isZh
            ? "已發布的混音、歌曲銜接與其他聲音工作。"
            : "Published mixing, song-transition and related audio work."}
        </p>
      </header>
      {items.length === 0 ? (
        <EmptyState
          locale={locale}
          title={isZh ? "作品準備中" : "Works are coming"}
          description={
            isZh
              ? "Kamel 尚未發布作品，之後可直接在這裡預覽。"
              : "Kamel has not published a work yet. Previews will appear here."
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
              <Link to={localePath(locale, `/works/${item.slug}`)}>
                {isZh ? "查看作品" : "View work"} →
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
