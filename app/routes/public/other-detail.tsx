import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import { getPublicContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";
import { listMediaForVersion } from "../../lib/media/media-repository.server";

const R2_HOSTS = new Set(["media.kamelkyp.com"]);

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const slug = args.params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  const item = await getPublicContent(db, "post", slug, locale);
  if (!item) throw new Response("Not Found", { status: 404 });
  const media = await listMediaForVersion(db, item.versionId, R2_HOSTS);
  return { locale, item, media };
}

export default function OtherDetailRoute() {
  const { locale, item, media } = useLoaderData<typeof loader>();
  return (
    <main className="content-detail-page" id="main-content">
      <Link
        className="content-detail-page__back"
        to={localePath(locale, "/other")}
      >
        ← {locale === "zh" ? "返回其他內容" : "Back to other work"}
      </Link>
      <article>
        <header>
          <p className="eyebrow">NOTE / {item.slug}</p>
          <h1>{item.title || (locale === "zh" ? "未命名文章" : "Untitled")}</h1>
          {item.summary ? <p>{item.summary}</p> : null}
        </header>
        <BlockRenderer
          blocks={item.body}
          locale={locale}
          media={media}
          r2Hosts={R2_HOSTS}
        />
      </article>
    </main>
  );
}
