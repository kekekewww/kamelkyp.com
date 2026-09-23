import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { formatMetaDate } from "../../content";
import { getPublicContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";
import { listMediaForVersion } from "../../lib/media/media-repository.server";

const R2_HOSTS = new Set(["media.kamelkyp.com"]);

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "small" },
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const slug = args.params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  const item = await getPublicContent(db, "post", slug, locale);
  if (!item) throw new Response("Not Found", { status: 404 });
  const media = await listMediaForVersion(db, item.versionId, R2_HOSTS);
  return { locale, item, media };
}

/** Writing detail in the document layout (IA §4.9, design-system §6.19). */
export default function WritingDetailRoute() {
  const { locale, item, media } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const date = item.publishedAt.slice(0, 10);

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
            <span>ARTICLE</span>
            <span>
              <time dateTime={date}>{formatMetaDate(date)}</time>
            </span>
          </p>
          <h1 className="writing-detail__title">
            {item.title || (isZh ? "未命名文章" : "Untitled")}
          </h1>
          {item.summary ? (
            <p className="writing-detail__summary">{item.summary}</p>
          ) : null}
        </header>
        <div className="writing-detail__body">
          <BlockRenderer
            blocks={item.body}
            locale={locale}
            media={media}
            r2Hosts={R2_HOSTS}
          />
        </div>
      </article>
    </main>
  );
}
