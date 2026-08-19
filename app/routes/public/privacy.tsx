import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import { EmptyState } from "../../components/content/empty-state";
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, terms: await listPublishedTerms(db, locale, "privacy") };
}

export default function PrivacyRoute() {
  const { locale, terms } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="legal-page" id="main-content">
      <header>
        <p className="eyebrow">PRIVACY / DATA LIFECYCLE</p>
        <h1>{isZh ? "隱私說明" : "Privacy"}</h1>
        <p>
          {isZh
            ? "說明委託資料的用途、保存方式與刪除時程。"
            : "How commission data is used, retained and deleted."}
        </p>
      </header>
      {terms.length === 0 ? (
        <EmptyState
          locale={locale}
          title={
            isZh ? "隱私說明尚未發布" : "Privacy notice is not published yet"
          }
          description={
            isZh
              ? "正式收集委託資料前，Kamel 會從後台發布完整隱私說明。"
              : "Kamel will publish the full privacy notice before collecting commission data."
          }
        />
      ) : (
        <div className="legal-page__documents">
          {terms.map((document) => (
            <section key={document.documentId}>
              <BlockRenderer blocks={document.body} />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
