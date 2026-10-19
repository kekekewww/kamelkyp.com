/**
 * Studio → Terms (wp2 §4.9): the six legal documents per language with the
 * live version, a draft marker and commission form availability.
 */
import { Link } from "react-router";
import type {
  TermLocaleState,
  TermsIndexData,
} from "../../../lib/cms/repositories/terms.server";
import type { Locale } from "../../../lib/cms/types";
import { formatTaipei } from "../../../lib/time/taipei";
import { CommissionReadinessTable } from "../pricing/commission-readiness";
import { ScrollRegion } from "../pricing/scroll-region";
import { StudioPage } from "../shell/studio-page";

const LOCALES: readonly Locale[] = ["zh", "en"];

function LocaleCell({
  state,
  href,
  label,
}: {
  state: TermLocaleState;
  href: string;
  label: string;
}) {
  const { live, draft } = state;
  return (
    <Link className="studio-terms-cell" to={href}>
      <span className="visually-hidden">{`${label}: `}</span>
      {live ? (
        <span className="studio-terms-cell__live">
          {`v${live.versionNumber} · `}
          {state.liveEffective ? (
            `live since ${formatTaipei(live.effectiveFrom ?? live.createdAt)}`
          ) : (
            <span className="studio-terms-cell__future">
              {`Not yet effective (${formatTaipei(live.effectiveFrom ?? live.createdAt)})`}
            </span>
          )}
        </span>
      ) : (
        <span className="studio-terms-cell__none">Not published</span>
      )}
      {draft ? (
        <span className="studio-terms-cell__draft">
          {`Draft · edited ${formatTaipei(draft.updatedAt)}`}
        </span>
      ) : null}
    </Link>
  );
}

export function TermsIndex({ data }: { data: TermsIndexData }) {
  const names = Object.fromEntries(
    Object.entries(data.serviceNames).map(([id, name]) => [
      id,
      name?.en.trim() || id,
    ]),
  );
  return (
    <StudioPage title="Terms" width="narrow">
      <p className="studio-hint">
        Legal texts per language. Published versions never change: editing
        creates a draft, and each publish adds a new version that applies to new
        commissions only.
      </p>
      <ScrollRegion label="Legal documents">
        <table className="studio-table studio-terms-table">
          <caption className="studio-table__caption">Legal documents</caption>
          <thead>
            <tr>
              <th scope="col">Document</th>
              <th scope="col">ZH</th>
              <th scope="col">EN</th>
            </tr>
          </thead>
          <tbody>
            {data.documents.map((document) => (
              <tr key={document.id}>
                <th scope="row">
                  {document.label}
                  <span className="studio-terms-table__path">
                    {document.publicPath}
                  </span>
                </th>
                {LOCALES.map((locale) => (
                  <td key={locale}>
                    <LocaleCell
                      state={document.locales[locale]}
                      href={`/studio/services/terms/${document.id}/${locale}`}
                      label={`${document.label} ${locale.toUpperCase()}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <CommissionReadinessTable
        readiness={data.readiness}
        names={names}
        fx={data.fx}
      />
    </StudioPage>
  );
}
