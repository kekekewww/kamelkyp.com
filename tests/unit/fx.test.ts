import { describe, expect, it } from "vitest";
import {
  businessDaysBetween,
  convertTwdToUsdCents,
  parseRateScaled,
} from "../../app/lib/pricing/fx";

describe("fixed-point FX", () => {
  it("converts NT$8,000 at 0.0325 to USD 260.00", () => {
    expect(parseRateScaled("0.0325")).toBe(3_250_000);
    expect(convertTwdToUsdCents(8000, 3_250_000)).toBe(26_000);
  });

  it("rounds to the nearest USD cent without binary floats", () => {
    expect(convertTwdToUsdCents(1000, 3_234_567)).toBe(3235);
  });

  it("counts weekdays only for staleness", () => {
    expect(businessDaysBetween("2026-08-07", "2026-08-10")).toBe(1);
    expect(businessDaysBetween("2026-08-03", "2026-08-07")).toBe(4);
  });

  it("rejects malformed rates and invalid date ranges", () => {
    expect(() => parseRateScaled("Infinity")).toThrow("invalid_fx_rate");
    expect(() => parseRateScaled("-0.1")).toThrow("invalid_fx_rate");
    expect(() => businessDaysBetween("2026-08-11", "2026-08-10")).toThrow(
      "invalid_fx_date_range",
    );
  });
});
