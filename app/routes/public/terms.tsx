import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import { EmptyState } from "../../components/content/empty-state";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import {
  formatLegalDate,
  LegalClosing,
  LegalToc,
  latestEffectiveDate,
  legalAnchorId,
} from "../../components/legal/legal-document";
import { pageMeta } from "../../lib/cms/public/meta";
import { getCommissionServiceNames } from "../../lib/cms/public/services.server";
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { isServiceId } from "../../lib/services/service-id";

// Legal pages close with a text link, not the contact band (IA §4.11).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const [terms, serviceNames] = await Promise.all([
    listPublishedTerms(db, locale, "terms"),
    getCommissionServiceNames(db, locale),
  ]);
  return { locale, terms, serviceNames };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Terms of service" : "服務條款",
  });

export default function TermsRoute() {
  const { locale, terms, serviceNames } = useLoaderData<typeof loader>();
  const { brandName } = usePublicSite().brand;
  const isZh = locale === "zh";
  const effective = latestEffectiveDate(
    terms.map((document) => document.effectiveFrom),
  );

  const documents = terms.map((document) => {
    const serviceName =
      document.serviceId && isServiceId(document.serviceId)
        ? (serviceNames[document.serviceId] ?? document.serviceId)
        : null;
    return {
      document,
      anchorId: legalAnchorId(document.documentId, "title"),
      title: serviceName
        ? serviceName
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
                  ? `正式開放委託前，${brandName} 會從後台發布完整條款。`
                  : `${brandName} will publish the complete terms before commissions open.`
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
