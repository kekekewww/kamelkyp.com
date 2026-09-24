import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import { WritingEntry } from "../../components/content/writing-entries";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { pageMeta } from "../../lib/cms/public/meta";
import { listPublicWriting } from "../../lib/cms/public/writing.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "small" },
};

/** Only the first cards take part in the scroll reveal (motion-system §2.2). */
const REVEAL_LIMIT = 8;

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db, env } = getPublicLoaderContext(args);
  return { locale, items: await listPublicWriting(db, env, locale) };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Writing" : "文章",
  });

export default function WritingIndexRoute() {
  const { locale, items } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

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
            {items.map((item, index) => (
              <WritingEntry
                key={item.id}
                item={item}
                locale={locale}
                reveal={index < REVEAL_LIMIT}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
