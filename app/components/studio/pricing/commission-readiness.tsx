/**
 * Commission form availability per service and locale (wp2 §4.6), shared by
 * the Pricing and Terms indexes. A form is open when the service has an
 * active price and the general terms, the privacy notice and its service
 * terms are in effect in that locale. Status is always a word.
 */

import type { FxStatus } from "../../../lib/cms/repositories/pricing.server";
import type { Locale } from "../../../lib/cms/types";
import type { CommissionReadiness } from "../../../lib/commission/availability.server";
import type { TermDocumentId } from "../../../lib/commission/term-outline";
import { ScrollRegion } from "./scroll-region";

const DOCUMENT_LABELS: Record<TermDocumentId, string> = {
  common: "General terms",
  privacy: "Privacy notice",
  "full-mix": "Service terms",
  "vocal-mix": "Service terms",
  "simple-transition": "Service terms",
  "edit-transition": "Service terms",
};

const LOCALES: readonly Locale[] = ["zh", "en"];

function closedReason(item: CommissionReadiness, locale: Locale): string {
  const reasons: string[] = [];
  if (!item.price) reasons.push("no active price");
  const missing = item.terms[locale].missing;
  if (missing.length > 0) {
    const tag = locale.toUpperCase();
    reasons.push(
      `terms missing: ${missing
        .map((id) => `${DOCUMENT_LABELS[id]} (${tag})`)
        .join(", ")}`,
    );
  }
  return reasons.join("; ");
}

function fxNote(fx: FxStatus | undefined): string | null {
  if (!fx || fx.state === "ok") return null;
  return `USD unavailable (FX ${fx.state}): English commissions cannot be submitted`;
}

export function CommissionReadinessTable({
  readiness,
  names,
  fx,
}: {
  readiness: readonly CommissionReadiness[];
  /** English service names by commission service id. */
  names: Partial<Record<string, string>>;
  /** When given, open English cells state a missing or stale FX rate. */
  fx?: FxStatus;
}) {
  const note = fxNote(fx);
  return (
    <div className="studio-readiness">
      <ScrollRegion label="Commission form availability">
        <table className="studio-table studio-readiness__table">
          <caption className="studio-table__caption">
            Commission form availability
          </caption>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">ZH</th>
              <th scope="col">EN</th>
            </tr>
          </thead>
          <tbody>
            {readiness.map((item) => (
              <tr key={item.serviceId}>
                <th scope="row">{names[item.serviceId] ?? item.serviceId}</th>
                {LOCALES.map((locale) => {
                  const open = item.open[locale];
                  return (
                    <td
                      key={locale}
                      className={`studio-readiness__cell studio-readiness__cell--${open ? "open" : "closed"}`}
                    >
                      <span className="studio-readiness__word">
                        {open ? "Open" : "Closed"}
                      </span>
                      {open ? (
                        locale === "en" && note ? (
                          <span className="studio-readiness__reason">
                            {` · ${note}`}
                          </span>
                        ) : null
                      ) : (
                        <span className="studio-readiness__reason">
                          {` · ${closedReason(item, locale)}`}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
