/**
 * CHECK section of the price editor (wp2 §4.3, §4.9): sample quotes for the
 * baseline rule and the new values, computed with the wizard's own
 * `calculateQuote`, plus the warnings. Not a live region: it would announce
 * on every keystroke.
 */
import type { PriceValues } from "../../../lib/pricing/sample-quotes";
import {
  formatTwd,
  priceRuleFromValues,
  sampleQuotes,
} from "../../../lib/pricing/sample-quotes";
import type { ServiceId } from "../../../lib/services/service-id";
import { ScrollRegion } from "./scroll-region";

function difference(before: number, after: number): string {
  const delta = after - before;
  if (delta === 0) return "±0";
  return `${delta > 0 ? "+" : "−"}${formatTwd(Math.abs(delta))}`;
}

export function QuoteCheck({
  serviceId,
  baseline,
  next,
  warnings,
  notes,
}: {
  serviceId: ServiceId;
  /** The rule this version is compared with (null when there is none). */
  baseline: PriceValues | null;
  /** The form's values (null while a field is invalid). */
  next: PriceValues | null;
  warnings: readonly string[];
  /** Informational lines above the table (e.g. a later scheduled change). */
  notes?: React.ReactNode;
}) {
  const before = baseline
    ? sampleQuotes(
        serviceId,
        priceRuleFromValues(serviceId, baseline, "current"),
      )
    : null;
  const after = next
    ? sampleQuotes(serviceId, priceRuleFromValues(serviceId, next, "new"))
    : null;
  const rows = (after ?? before ?? []).map((sample, index) => ({
    key: sample.key,
    label: sample.label,
    current: before?.[index]?.quote.lockedInitialTwd ?? null,
    next: after?.[index]?.quote.lockedInitialTwd ?? null,
  }));
  return (
    <div className="studio-quote-check">
      {notes}
      <ScrollRegion label="Sample quotes">
        <table className="studio-table studio-quote-check__table">
          <caption className="studio-table__caption">
            Sample quotes (what the commission form would lock)
          </caption>
          <thead>
            <tr>
              <th scope="col">Sample</th>
              <th scope="col">Current</th>
              <th scope="col">New</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.current === null ? "—" : formatTwd(row.current)}</td>
                <td>{row.next === null ? "—" : formatTwd(row.next)}</td>
                <td>
                  {row.current === null || row.next === null
                    ? "—"
                    : difference(row.current, row.next)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      {next === null ? (
        <p className="studio-hint">
          Fix the highlighted values to see the new quotes.
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="studio-quote-check__warnings" aria-label="Warnings">
          {warnings.map((warning) => (
            <li className="studio-quote-check__warning" key={warning}>
              <span className="studio-quote-check__tag">Warning</span> {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
