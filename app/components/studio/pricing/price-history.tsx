/**
 * Price history of one service (wp2 §4.3, §4.9): every immutable version
 * with its state in words. A cancelled change and its cancellation row are
 * never active. A scheduled change can be replaced (the editor
 * fills its form with that version) or cancelled; each cancel is its own
 * small form outside the price form, so no form is nested and a cancel
 * never posts the unsaved price fields.
 */
import type { FetcherWithComponents } from "react-router";
import type { StudioPriceVersion } from "../../../lib/cms/repositories/pricing.server";
import { bpsToPercentLabel } from "../../../lib/pricing/percent";
import type { PriceVersionState } from "../../../lib/pricing/price-history";
import { formatTwd } from "../../../lib/pricing/sample-quotes";
import { formatTaipei } from "../../../lib/time/taipei";
import { IntentButton, StudioForm } from "../ui";
import { ScrollRegion } from "./scroll-region";

const STATE_WORD: Record<PriceVersionState, string> = {
  active: "Active",
  scheduled: "Scheduled",
  superseded: "Superseded",
  replaced: "Replaced (never active)",
  cancelled: "Cancelled (never active)",
  retired: "Retired",
};

/** A cancellation row is a marker: the rule before its instant applies. */
function stateWord(
  version: Pick<StudioPriceVersion, "state" | "action">,
): string {
  return version.action === "cancel" && version.state === "cancelled"
    ? "Cancellation"
    : STATE_WORD[version.state];
}

function PriceStateBadge({
  version,
}: {
  version: Pick<StudioPriceVersion, "state" | "action" | "effectiveFrom">;
}) {
  return (
    <span className="studio-price-state">
      <span
        className={`studio-badge studio-price-state__badge studio-price-state__badge--${version.state}`}
      >
        {stateWord(version)}
      </span>
      {version.action === "cancel" ? (
        <span className="studio-price-state__note">
          Cancels the change of {formatTaipei(version.effectiveFrom)}
        </span>
      ) : null}
    </span>
  );
}

const percent = (bps: number) => `${bpsToPercentLabel(bps)}%`;

export function PriceHistoryTable({
  name,
  history,
  versionCount,
  cancelFetcher,
  onCancelClick,
  onReplace,
}: {
  /** English service name. */
  name: string;
  history: readonly StudioPriceVersion[];
  versionCount: number;
  cancelFetcher: FetcherWithComponents<unknown>;
  /** Runs before a cancel is sent; `preventDefault()` holds it back. */
  onCancelClick?: (
    event: React.MouseEvent<HTMLButtonElement>,
    version: StudioPriceVersion,
  ) => void;
  onReplace: (version: StudioPriceVersion) => void;
}) {
  const pendingCancel =
    cancelFetcher.state !== "idle"
      ? (cancelFetcher.formData?.get("versionId") as string | null)
      : null;
  return (
    <ScrollRegion label={`Price history for ${name}`}>
      <table className="studio-table studio-price-history">
        <caption className="studio-table__caption">
          Price history for {name}
        </caption>
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">Effective from (Taipei)</th>
            <th scope="col">Base</th>
            <th scope="col">Per song after 5</th>
            <th scope="col">Student</th>
            <th scope="col">Rush</th>
            <th scope="col">Consultation</th>
            <th scope="col">Source prep</th>
            <th scope="col">Published</th>
            <th scope="col">Version</th>
          </tr>
        </thead>
        <tbody>
          {history.map((version) => {
            const when = formatTaipei(version.effectiveFrom);
            return (
              <tr
                key={version.id}
                className={`studio-price-history__row studio-price-history__row--${version.state}`}
              >
                <th scope="row">
                  <PriceStateBadge version={version} />
                  {version.state === "scheduled" ? (
                    <div className="studio-price-history__actions">
                      <button
                        type="button"
                        className="studio-btn studio-btn--ghost studio-btn--compact"
                        onClick={() => onReplace(version)}
                      >
                        Replace…
                        <span className="visually-hidden">
                          {` the change of ${when}`}
                        </span>
                      </button>
                      <StudioForm
                        fetcher={cancelFetcher}
                        className="studio-price-history__cancel"
                      >
                        <input
                          type="hidden"
                          name="versionId"
                          value={version.id}
                        />
                        <input
                          type="hidden"
                          name="expectedVersionCount"
                          value={String(versionCount)}
                        />
                        <IntentButton
                          intent="cancel-scheduled"
                          variant="danger"
                          compact
                          pending={pendingCancel === version.id}
                          pendingLabel="Cancelling…"
                          onClick={(event) => onCancelClick?.(event, version)}
                        >
                          Cancel scheduled change
                          <span className="visually-hidden">{` of ${when}`}</span>
                        </IntentButton>
                      </StudioForm>
                    </div>
                  ) : null}
                </th>
                <td>{when}</td>
                <td>{formatTwd(version.baseTwd)}</td>
                <td>{formatTwd(version.perSongAfterFiveTwd)}</td>
                <td>{percent(version.studentDiscountBps)}</td>
                <td>{percent(version.rushBps)}</td>
                <td>{percent(version.consultationBps)}</td>
                <td>{percent(version.sourcePrepBps)}</td>
                <td>
                  {version.publishedAt
                    ? formatTaipei(version.publishedAt)
                    : "—"}
                </td>
                <td>
                  <code>{version.id}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
