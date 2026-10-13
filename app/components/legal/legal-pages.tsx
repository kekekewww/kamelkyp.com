/**
 * Public legal pages (`/terms`, `/privacy`): the page bodies, shared by the
 * public routes and the Studio preview (`/studio/preview/terms/:documentId`),
 * so the preview renders exactly the public markup.
 */
import type { PublishedTerm } from "../../lib/content/public-content.server";
import type { Locale } from "../../lib/i18n/locale";
import { isServiceId } from "../../lib/services/service-id";
import { EmptyState } from "../content/empty-state";
import {
  formatLegalDate,
  LegalClosing,
  LegalToc,
  latestEffectiveDate,
  legalAnchorId,
} from "./legal-document";

export function TermsPage({
  locale,
  terms,
  serviceNames,
  brandName,
}: {
  locale: Locale;
  terms: PublishedTerm[];
  serviceNames: Partial<Record<string, string>>;
  brandName: string;
}) {
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

export function PrivacyPage({
  locale,
  terms,
  brandName,
}: {
  locale: Locale;
  terms: PublishedTerm[];
  brandName: string;
}) {
  const isZh = locale === "zh";
  const effective = latestEffectiveDate(
    terms.map((document) => document.effectiveFrom),
  );
  const documents = terms.map((document) => ({
    document,
    clauses: document.clauses.map((clause) => ({
      clause,
      anchorId: legalAnchorId(document.documentId, clause.key),
    })),
  }));

  return (
    <main className="page legal-doc" id="main-content">
      <header className="page-header grid legal-doc__header">
        <p className="eyebrow col-rail">PRIVACY / DATA LIFECYCLE</p>
        <h1 className="page-header__title">{isZh ? "隱私說明" : "Privacy"}</h1>
        <p className="page-header__intro">
          {isZh
            ? "說明委託資料的用途、保存方式與刪除時程。"
            : "How commission data is used, retained and deleted."}
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
              title={
                isZh
                  ? "隱私說明尚未發布"
                  : "Privacy notice is not published yet"
              }
              description={
                isZh
                  ? `正式收集委託資料前，${brandName} 會從後台發布完整隱私說明。`
                  : `${brandName} will publish the full privacy notice before collecting commission data.`
              }
            />
          </div>
        </div>
      ) : (
        <div className="grid legal-doc__layout">
          <LegalToc
            locale={locale}
            entries={documents.flatMap(({ clauses }) =>
              clauses.map(({ clause, anchorId }) => ({
                id: anchorId,
                label: clause.title,
              })),
            )}
          />
          <div className="legal-doc__body">
            {documents.map(({ document, clauses }) => (
              <section className="legal-doc__section" key={document.documentId}>
                <div className="content-blocks">
                  {clauses.map(({ clause, anchorId }) => (
                    <section key={clause.key}>
                      <h2 id={anchorId}>{clause.title}</h2>
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
