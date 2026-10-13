/**
 * Version history of one legal document and locale (wp2 §4.9): immutable
 * versions, newest first, each readable in full and usable as the starting
 * point of a new draft.
 */
import type { TermVersionSummary } from "../../../lib/cms/repositories/terms.server";
import type { Locale } from "../../../lib/cms/types";
import { formatTaipei } from "../../../lib/time/taipei";

export function TermHistory({
  history,
  locale,
  onUseAsStart,
}: {
  history: readonly TermVersionSummary[];
  locale: Locale;
  onUseAsStart: (version: TermVersionSummary) => void;
}) {
  if (history.length === 0) {
    return <p className="studio-hint">No version has been published yet.</p>;
  }
  const lang = locale === "zh" ? "zh-Hant" : "en";
  return (
    <ol className="studio-term-history">
      {history.map((version) => (
        <li className="studio-term-history__item" key={version.id}>
          <details>
            <summary className="studio-term-history__summary">
              <span className="studio-term-history__version">
                {`v${version.versionNumber}`}
              </span>
              {version.live ? (
                <span className="studio-badge studio-badge--published">
                  LIVE
                </span>
              ) : null}
              <span className="studio-term-history__meta">
                {`published ${formatTaipei(version.effectiveFrom ?? version.createdAt)} · ${version.clauseCount} ${version.clauseCount === 1 ? "clause" : "clauses"}`}
              </span>
            </summary>
            <dl className="studio-term-history__clauses" lang={lang}>
              {version.clauses.map((clause) => (
                <div className="studio-term-history__clause" key={clause.key}>
                  <dt>
                    <code>{clause.key}</code> {clause.title}
                  </dt>
                  <dd>{clause.text}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => onUseAsStart(version)}
            >
              Use as starting point
              <span className="visually-hidden">{` (v${version.versionNumber})`}</span>
            </button>
          </details>
        </li>
      ))}
    </ol>
  );
}
