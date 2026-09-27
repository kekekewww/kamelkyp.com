import { describe, expect, it } from "vitest";
import { relativeTime } from "../../app/components/studio/home/format";
import { groupServices } from "../../app/components/studio/services/grouping";
import {
  formatMoney,
  PRICE_MODE_OPTIONS,
  servicePriceLabel,
} from "../../app/components/studio/services/price";
import type { Term } from "../../app/lib/cms/schemas/taxonomy";

describe("relativeTime", () => {
  const now = "2026-09-25T10:00:00.000Z";
  it("reads like a person would say it", () => {
    expect(relativeTime("2026-09-25T09:59:40.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-25T09:55:00.000Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-09-25T07:00:00.000Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-09-24T08:00:00.000Z", now)).toBe("yesterday");
    expect(relativeTime("2026-09-21T10:00:00.000Z", now)).toBe("4 days ago");
    expect(relativeTime("2026-09-02T10:00:00.000Z", now)).toBe("2 Sep");
    expect(relativeTime("2025-12-31T10:00:00.000Z", now)).toBe("31 Dec 2025");
  });

  it("never shows a time in the future", () => {
    expect(relativeTime("2026-09-25T10:05:00.000Z", now)).toBe("just now");
  });
});

describe("service prices", () => {
  it("formats whole currency units with the currency prefix", () => {
    expect(formatMoney(8000, "TWD")).toBe("NT$8,000");
    expect(formatMoney(1200, "USD")).toBe("US$1,200");
  });

  it("labels every price mode without inventing a number", () => {
    const base = {
      commissionServiceId: null,
      livePrice: null,
      priceAmount: null,
      currency: null,
    } as const;
    expect(servicePriceLabel({ ...base, priceMode: "custom_quote" })).toBe(
      "Custom quote",
    );
    expect(servicePriceLabel({ ...base, priceMode: "contact" })).toBe(
      "Contact",
    );
    expect(servicePriceLabel({ ...base, priceMode: "fixed" })).toBe(
      "Fixed · price not set",
    );
    expect(
      servicePriceLabel({
        ...base,
        priceMode: "starting_from",
        priceAmount: 500,
        currency: "USD",
      }),
    ).toBe("From US$500");
    expect(
      servicePriceLabel({
        ...base,
        priceMode: "fixed",
        priceAmount: 3000,
        currency: "TWD",
      }),
    ).toBe("NT$3,000");
  });

  it("reads commission prices only from the live price rule", () => {
    expect(
      servicePriceLabel({
        commissionServiceId: "full_mix",
        livePrice: { baseTwd: 4321, versionId: "v1" },
        priceMode: "starting_from",
        priceAmount: null,
        currency: null,
      }),
    ).toBe("From NT$4,321");
    expect(
      servicePriceLabel({
        commissionServiceId: "full_mix",
        livePrice: null,
        priceMode: "starting_from",
        priceAmount: null,
        currency: null,
      }),
    ).toBe("No active price");
  });

  it("offers the four price modes in the brief's order", () => {
    expect(PRICE_MODE_OPTIONS.map((option) => option.value)).toEqual([
      "fixed",
      "starting_from",
      "custom_quote",
      "contact",
    ]);
    expect(PRICE_MODE_OPTIONS.map((option) => option.label)).toEqual([
      "Fixed",
      "Starting from",
      "Custom quote",
      "Contact",
    ]);
  });
});

describe("groupServices", () => {
  const term = (id: string, en: string, archivedAt: string | null = null) =>
    ({
      id,
      vocabulary: "service_group",
      slug: id,
      label: { zh: en, en },
      data: {},
      sortOrder: 0,
      archivedAt,
    }) satisfies Term;

  it("groups rows in taxonomy order and keeps ungrouped rows last", () => {
    const groups = groupServices(
      [
        { id: "a", groupTermId: "g2" },
        { id: "b", groupTermId: null },
        { id: "c", groupTermId: "g1" },
        { id: "d", groupTermId: "g2" },
      ],
      [term("g1", "Mixing"), term("g2", "Software"), term("g3", "Empty")],
    );
    expect(
      groups.map((group) => [
        group.term?.id ?? null,
        group.rows.map((row) => row.id),
      ]),
    ).toEqual([
      ["g1", ["c"]],
      ["g2", ["a", "d"]],
      [null, ["b"]],
    ]);
  });
});
