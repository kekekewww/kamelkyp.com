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
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

// Legal pages close with a text link, not the contact band (IA §4.11).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, terms: await listPublishedTerms(db, locale, "privacy") };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Privacy" : "隱私說明",
  });

export default function PrivacyRoute() {
  const { locale, terms } = useLoaderData<typeof loader>();
  const { brandName } = usePublicSite().brand;
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
