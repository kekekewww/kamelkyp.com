/**
 * Price display for the Studio (client-safe). Numbers only ever come from
 * the database: the active price rule for commission services, the row's own
 * amount otherwise. Nothing here invents or suggests a price.
 */
import type { Currency, PriceMode } from "../../../lib/cms/schemas/service";

export const PRICE_MODE_OPTIONS: ReadonlyArray<{
  value: PriceMode;
  label: string;
  description: string;
}> = [
  {
    value: "fixed",
    label: "Fixed",
    description: "One price for the whole service.",
  },
  {
    value: "starting_from",
    label: "Starting from",
    description: "The lowest price; the final quote depends on the project.",
  },
  {
    value: "custom_quote",
    label: "Custom quote",
    description: "No number is shown. Visitors ask for a quote.",
  },
  {
    value: "contact",
    label: "Contact",
    description: "No number is shown. Visitors get in touch first.",
  },
];

export const CURRENCY_OPTIONS: ReadonlyArray<{
  value: Currency;
  label: string;
}> = [
  { value: "TWD", label: "NT$ (TWD)" },
  { value: "USD", label: "US$ (USD)" },
];

const PREFIX: Record<Currency, string> = { TWD: "NT$", USD: "US$" };

export function formatMoney(amount: number, currency: Currency): string {
  return `${PREFIX[currency]}${Math.round(amount).toLocaleString("en-US")}`;
}

export type PriceLabelInput = {
  commissionServiceId: string | null;
  livePrice: { baseTwd: number; versionId: string } | null;
  priceMode: PriceMode;
  priceAmount: number | null;
  currency: Currency | null;
};

/** One-line price for list rows. */
export function servicePriceLabel(row: PriceLabelInput): string {
  if (row.commissionServiceId) {
    return row.livePrice
      ? `From ${formatMoney(row.livePrice.baseTwd, "TWD")}`
      : "No active price";
  }
  switch (row.priceMode) {
    case "custom_quote":
      return "Custom quote";
    case "contact":
      return "Contact";
    case "fixed":
    case "starting_from": {
      if (row.priceAmount === null || row.currency === null) {
        return `${row.priceMode === "fixed" ? "Fixed" : "Starting from"} · price not set`;
      }
      const money = formatMoney(row.priceAmount, row.currency);
      return row.priceMode === "fixed" ? money : `From ${money}`;
    }
  }
}
