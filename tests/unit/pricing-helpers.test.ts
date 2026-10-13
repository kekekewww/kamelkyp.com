import { describe, expect, it } from "vitest";
import { calculateQuote } from "../../app/lib/pricing/calculate-quote";
import {
  bpsToPercentLabel,
  percentInputToBps,
} from "../../app/lib/pricing/percent";
import {
  EDITABLE_PRICE_FIELDS,
  extractTwdAmounts,
  includedSongsFor,
  type PriceValues,
  priceChangeWarnings,
  priceRuleFromValues,
  sampleQuotes,
} from "../../app/lib/pricing/sample-quotes";

// The seeded rules (migrations/0002_price_terms.sql), asserted as carried.
const FULL_SEED: PriceValues = {
  baseTwd: 8000,
  perSongAfterFiveTwd: 0,
  studentDiscountBps: 3000,
  rushBps: 5000,
  consultationBps: 5000,
  sourcePrepBps: 500,
};
const SIMPLE_SEED: PriceValues = {
  ...FULL_SEED,
  baseTwd: 1000,
  perSongAfterFiveTwd: 200,
};

describe("percent conversion", () => {
  it("converts percent text to integer basis points without float error", () => {
    expect(percentInputToBps("30")).toBe(3000);
    expect(percentInputToBps("5")).toBe(500);
    expect(percentInputToBps("12.5")).toBe(1250);
    expect(percentInputToBps("7.25")).toBe(725);
    expect(percentInputToBps("0.07")).toBe(7);
    expect(percentInputToBps("100")).toBe(10000);
    expect(percentInputToBps("0")).toBe(0);
    expect(percentInputToBps(" 50 ")).toBe(5000);
  });

  it("refuses anything that is not 0-100 with at most two decimals", () => {
    for (const value of [
      "12.345",
      "-1",
      "101",
      "100.01",
      "abc",
      "",
      "1e1",
      ".5",
      "5.",
    ]) {
      expect(percentInputToBps(value), value).toBeNull();
    }
  });

  it("labels basis points as percent without rounding", () => {
    expect(bpsToPercentLabel(3000)).toBe("30");
    expect(bpsToPercentLabel(1250)).toBe("12.5");
    expect(bpsToPercentLabel(725)).toBe("7.25");
    expect(bpsToPercentLabel(7)).toBe("0.07");
    expect(bpsToPercentLabel(500)).toBe("5");
    expect(bpsToPercentLabel(10000)).toBe("100");
    expect(bpsToPercentLabel(0)).toBe("0");
  });
});

describe("sample quotes", () => {
  it("counts included songs for transitions only", () => {
    expect(includedSongsFor("full_mix")).toBe(0);
    expect(includedSongsFor("vocal_mix")).toBe(0);
    expect(includedSongsFor("simple_transition")).toBe(5);
    expect(includedSongsFor("edit_transition")).toBe(5);
  });

  it("builds a price rule from stored values", () => {
    expect(priceRuleFromValues("simple_transition", SIMPLE_SEED, "v1")).toEqual(
      {
        versionId: "v1",
        serviceId: "simple_transition",
        baseTwd: 1000,
        includedSongs: 5,
        perSongAfterIncludedTwd: 200,
        studentDiscountBps: 3000,
        rushBps: 5000,
        consultationBps: 5000,
        sourcePrepBps: 500,
      },
    );
  });

  it("matches the wizard quote for the full mix seed (non-compounding surcharges)", () => {
    const rule = priceRuleFromValues("full_mix", FULL_SEED, "seed");
    const samples = sampleQuotes("full_mix", rule);
    expect(samples.map((sample) => sample.label)).toEqual([
      "Base",
      "Base + rush",
      "Base + rush + source prep + student",
    ]);
    const all = samples[2];
    expect(all?.quote.beforeStudentDiscountTwd).toBe(12400);
    expect(all?.quote.studentDiscountTwd).toBe(3720);
    expect(all?.quote.lockedInitialTwd).toBe(8680);
    expect(all?.quote).toEqual(
      calculateQuote(rule, {
        serviceId: "full_mix",
        rush: true,
        consultation: false,
        sourcePrep: true,
        studentRequested: true,
      }),
    );
  });

  it("prices extra transition songs per song after the fifth", () => {
    const rule = priceRuleFromValues("simple_transition", SIMPLE_SEED, "seed");
    const samples = sampleQuotes("simple_transition", rule);
    expect(samples.map((sample) => sample.label)).toEqual([
      "5 songs",
      "8 songs",
      "8 songs + consultation + rush",
      "5 songs + student",
    ]);
    expect(samples[1]?.quote.lockedInitialTwd).toBe(1000 + 3 * 200);
    const edited = sampleQuotes(
      "edit_transition",
      priceRuleFromValues(
        "edit_transition",
        { ...FULL_SEED, baseTwd: 4000, perSongAfterFiveTwd: 800 },
        "seed",
      ),
    );
    expect(edited.map((sample) => sample.label)).toEqual([
      "5 songs",
      "8 songs",
      "8 songs + rush + source prep + student",
    ]);
  });

  it("knows which fields each service's quote uses", () => {
    expect(EDITABLE_PRICE_FIELDS.full_mix).toEqual([
      "baseTwd",
      "studentDiscountBps",
      "rushBps",
      "sourcePrepBps",
    ]);
    expect(EDITABLE_PRICE_FIELDS.vocal_mix).toEqual(
      EDITABLE_PRICE_FIELDS.full_mix,
    );
    expect(EDITABLE_PRICE_FIELDS.simple_transition).toHaveLength(6);
    expect(EDITABLE_PRICE_FIELDS.edit_transition).toEqual([
      "baseTwd",
      "perSongAfterFiveTwd",
      "studentDiscountBps",
      "rushBps",
      "sourcePrepBps",
    ]);
  });
});

describe("price change warnings", () => {
  it("flags only changes of more than 50 %", () => {
    expect(
      priceChangeWarnings(FULL_SEED, { ...FULL_SEED, baseTwd: 12000 }),
    ).toEqual([]);
    const big = priceChangeWarnings(FULL_SEED, {
      ...FULL_SEED,
      baseTwd: 18000,
    });
    expect(big).toHaveLength(1);
    expect(big[0]?.field).toBe("baseTwd");
    expect(big[0]?.message).toBe(
      "Base price changes by +125 %: NT$8,000 → NT$18,000. Check the number.",
    );
    const down = priceChangeWarnings(FULL_SEED, {
      ...FULL_SEED,
      rushBps: 2000,
    });
    expect(down.map((warning) => warning.message)).toEqual([
      "Rush changes by -60 %: 50% → 20%. Check the number.",
    ]);
    expect(priceChangeWarnings(FULL_SEED, FULL_SEED)).toEqual([]);
  });
});

describe("TWD amounts in legal text", () => {
  it("reads NT$, 新臺幣/新台幣 and TWD amounts and ignores other figures", () => {
    expect(
      extractTwdAmounts(
        "NT$8,000 … NT$ 1,000 … NT$200 … 新臺幣 4,000 元 … TWD 800 … US$260.00 … 50%",
      ),
    ).toEqual([8000, 1000, 200, 4000, 800]);
    expect(extractTwdAmounts("新台幣8000元與 NT$8,000")).toEqual([8000]);
    expect(extractTwdAmounts("No amount here; 30% off.")).toEqual([]);
  });
});
