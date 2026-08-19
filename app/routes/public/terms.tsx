import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import { EmptyState } from "../../components/content/empty-state";
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getService } from "../../lib/services/catalog";
import { isServiceId } from "../../lib/services/service-id";

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, terms: await listPublishedTerms(db, locale, "terms") };
}

export default function TermsRoute() {
  const { locale, terms } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="legal-page" id="main-content">
      <header>
        <p className="eyebrow">LEGAL / CURRENT TERMS</p>
        <h1>{isZh ? "服務條款" : "Terms of service"}</h1>
        <p>
          {isZh
            ? "此頁只顯示目前已發布的條款版本。"
            : "This page shows only the currently published terms."}
        </p>
      </header>
      {terms.length === 0 ? (
        <EmptyState
          locale={locale}
          title={isZh ? "條款尚未發布" : "Terms are not published yet"}
          description={
            isZh
              ? "正式開放委託前，Kamel 會從後台發布完整條款。"
              : "Kamel will publish the complete terms before commissions open."
          }
        />
      ) : (
        <div className="legal-page__documents">
          {terms.map((document) => {
            const service =
              document.serviceId && isServiceId(document.serviceId)
                ? getService(document.serviceId)
                : null;
            const title = service
              ? service.name[locale]
              : isZh
                ? "通用委託條款"
                : "General commission terms";

            return (
              <section
                key={document.documentId}
                aria-labelledby={`${document.documentId}-title`}
              >
                <div className="legal-page__document-header">
                  <h2 id={`${document.documentId}-title`}>{title}</h2>
                  <time dateTime={document.effectiveFrom}>
                    {isZh ? "生效日" : "Effective"} {document.effectiveFrom}
                  </time>
                </div>
                <BlockRenderer blocks={document.body} />
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
