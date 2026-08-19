import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import { getPublicContent } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const slug = args.params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  const item = await getPublicContent(db, "post", slug, locale);
  if (!item) throw new Response("Not Found", { status: 404 });
  return { locale, item };
}

export default function OtherDetailRoute() {
  const { locale, item } = useLoaderData<typeof loader>();
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
          <h1>{item.title}</h1>
          {item.summary ? <p>{item.summary}</p> : null}
        </header>
        <BlockRenderer blocks={item.body} />
      </article>
    </main>
  );
}
