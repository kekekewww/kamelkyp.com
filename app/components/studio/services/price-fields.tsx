/**
 * PRICING section of the service editor (brief §13–14, content-schema §2.6).
 *
 * Commission services show the active price rule read-only, with a pointer to
 * Pricing, where prices change by publishing a new price version. Other
 * services pick one of four modes; only Fixed and Starting from take a number,
 * and no field ever suggests one.
 */
import { useId, useState } from "react";
import { Link } from "react-router";
import type { Currency, PriceMode } from "../../../lib/cms/schemas/service";
import { Select, TextInput } from "../ui";
import { CURRENCY_OPTIONS, formatMoney, PRICE_MODE_OPTIONS } from "./price";

export function PriceFields({
  commissionLinked,
  livePrice,
  defaultMode,
  defaultAmount,
  defaultCurrency,
  errors = {},
}: {
  commissionLinked: boolean;
  livePrice: { baseTwd: number; versionId: string } | null;
  defaultMode: PriceMode;
  defaultAmount: number | null;
  defaultCurrency: Currency | null;
  errors?: {
    priceMode?: string | null;
    priceAmount?: string | null;
    currency?: string | null;
  };
}) {
  const [mode, setMode] = useState<PriceMode>(defaultMode);
  const id = useId();

  if (commissionLinked) {
    return (
      <div className="studio-price-plate">
        <p className="studio-price-plate__label">Price shown on the site</p>
        {livePrice ? (
          <p className="studio-price-plate__figure">
            From {formatMoney(livePrice.baseTwd, "TWD")}
          </p>
        ) : (
          <p className="studio-price-plate__figure studio-price-plate__figure--missing">
            No active price
          </p>
        )}
        <p className="studio-hint">
          {livePrice ? (
            <>
              From price version <code>{livePrice.versionId}</code>, the same
              rule the commission form uses for quotes.
            </>
          ) : (
            "Publish a price version before visitors can start a commission."
          )}
        </p>
        <Link className="studio-link" to="/studio/services/pricing">
          Change in Pricing
        </Link>
      </div>
    );
  }

  const priced = mode === "fixed" || mode === "starting_from";
  const describedBy = `${id}-mode-hint`;
  return (
    <div className="studio-price">
      <fieldset className="studio-price__modes" aria-describedby={describedBy}>
        <legend className="studio-field__label">
          Price mode
          <span className="studio-field__required">Required to publish</span>
        </legend>
        {PRICE_MODE_OPTIONS.map((option) => (
          <label className="studio-price__mode" key={option.value}>
            <input
              type="radio"
              name="priceMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
            />
            <span className="studio-price__mode-name">{option.label}</span>
            <span className="studio-price__mode-text">
              {option.description}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="studio-hint" id={describedBy}>
        A number is never required. Choose Custom quote or Contact when there is
        no confirmed price.
      </p>
      {errors.priceMode ? (
        <p className="studio-field__error" role="alert">
          {errors.priceMode}
        </p>
      ) : null}
      {priced ? (
        <div className="studio-price__amount">
          <TextInput
            name="priceAmount:number"
            label={mode === "fixed" ? "Price" : "Starting price"}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            defaultValue={defaultAmount ?? ""}
            hint="Whole currency units, as confirmed by you."
            required
            error={errors.priceAmount}
          />
          <Select
            name="currency"
            label="Currency"
            placeholder="Choose…"
            defaultValue={defaultCurrency ?? ""}
            options={CURRENCY_OPTIONS}
            required
            error={errors.currency}
          />
        </div>
      ) : null}
    </div>
  );
}
