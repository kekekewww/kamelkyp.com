import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import {
  formatLegalDate,
  LegalClosing,
  LegalToc,
  latestEffectiveDate,
  legalAnchorId,
} from "../../components/legal/legal-document";
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getService } from "../../lib/services/catalog";
import { isServiceId } from "../../lib/services/service-id";

// Legal pages close with a text link, not the contact band (IA §4.11).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, terms: await listPublishedTerms(db, locale, "terms") };
}

export default function TermsRoute() {
  const { locale, terms } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const effective = latestEffectiveDate(
    terms.map((document) => document.effectiveFrom),
  );

  const documents = terms.map((document) => {
    const service =
      document.serviceId && isServiceId(document.serviceId)
        ? getService(document.serviceId)
        : null;
    return {
      document,
      anchorId: legalAnchorId(document.documentId, "title"),
      title: service
        ? service.name[locale]
        : isZh
          ? "通用委託條款"
          : "General commission terms",
    };
  });

  return (
    <main className="page legal-doc" id="main-content">
      <header className="page-header grid legal-doc__header">
        <p className="eyebrow col-rail">LEGAL / CURRENT TERMS</p>
        <h1 className="page-header__title">
          {isZh ? "服務條款" : "Terms of service"}
        </h1>
        <p className="page-header__intro">
          {isZh
            ? "此頁只顯示目前已發布的條款版本。"
            : "This page shows only the currently published terms."}
        </p>
        {effective ? (
          <p className="page-header__body legal-doc__effective">
            <time dateTime={effective}>
              {isZh ? "生效日" : "Effective"} {formatLegalDate(effective)}
            </time>
          </p>
        ) : null}
      </header>
      {documents.length === 0 ? (
        <div className="grid">
          <div className="col-content">
            <EmptyState
              locale={locale}
              title={isZh ? "條款尚未發布" : "Terms are not published yet"}
              description={
                isZh
                  ? "正式開放委託前，Kamel 會從後台發布完整條款。"
                  : "Kamel will publish the complete terms before commissions open."
              }
            />
          </div>
        </div>
      ) : (
        <div className="grid legal-doc__layout">
          <LegalToc
            locale={locale}
            entries={documents.map(({ anchorId, title }) => ({
              id: anchorId,
              label: title,
            }))}
          />
          <div className="legal-doc__body">
            {documents.map(({ document, anchorId, title }) => (
              <section
                className="legal-doc__section"
                key={document.documentId}
                aria-labelledby={anchorId}
              >
                <div className="legal-doc__section-header">
                  <h2 id={anchorId}>{title}</h2>
                  <time
                    className="legal-doc__section-date"
                    dateTime={document.effectiveFrom}
                  >
                    {isZh ? "生效日" : "Effective"}{" "}
                    {formatLegalDate(document.effectiveFrom)}
                  </time>
                </div>
                <div className="content-blocks">
                  {document.clauses.map((clause) => (
                    <section key={clause.key}>
                      <h3>{clause.title}</h3>
                      <p>{clause.text}</p>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      <LegalClosing locale={locale} />
    </main>
  );
}
