import { describe, expect, it } from "vitest";
import {
  classifyPriceVersions,
  compareForActive,
  type PriceHistoryRow,
  ruleActiveAt,
} from "../../app/lib/pricing/price-history";

function row(
  id: string,
  effectiveFrom: string,
  publishedAt: string | null = null,
  retiredAt: string | null = null,
): PriceHistoryRow {
  return { id, effectiveFrom, publishedAt, retiredAt };
}

const NOW = "2026-11-01T00:00:00.000Z";

describe("price version order", () => {
  it("mirrors ORDER BY effective_from DESC, published_at DESC (NULL last), id DESC", () => {
    const rows = [
      row("a", "2026-08-10T00:00:00Z"),
      row("b", "2026-09-01T00:00:00.000Z", "2026-08-20T00:00:00.000Z"),
      row("c", "2026-09-01T00:00:00.000Z", "2026-08-25T00:00:00.000Z"),
      row("d", "2026-09-01T00:00:00.000Z"),
      row("e", "2026-09-01T00:00:00.000Z"),
      row("f", "2026-08-10T00:00:00Z", "2026-08-01T00:00:00.000Z"),
    ];
    expect([...rows].sort(compareForActive).map((item) => item.id)).toEqual([
      "c",
      "b",
      "e",
      "d",
      "f",
      "a",
    ]);
  });

  it("finds the rule active before, at and after a boundary", () => {
    const rows = [
      row("seed", "2026-08-10T00:00:00Z"),
      row("next", "2026-12-31T16:00:00.000Z", "2026-10-01T00:00:00.000Z"),
    ];
    expect(ruleActiveAt(rows, "2026-12-31T15:59:59.999Z")?.id).toBe("seed");
    expect(ruleActiveAt(rows, "2026-12-31T16:00:00.000Z")?.id).toBe("next");
    expect(ruleActiveAt(rows, "2027-01-01T00:00:00.000Z")?.id).toBe("next");
    expect(ruleActiveAt(rows, "2026-08-01T00:00:00.000Z")).toBeNull();
    expect(
      ruleActiveAt(rows, "2026-12-31T16:00:00.000Z", { before: true })?.id,
    ).toBe("seed");
  });

  it("ignores retired rows from their retirement on", () => {
    const rows = [
      row("seed", "2026-08-10T00:00:00Z"),
      row(
        "legacy",
        "2026-09-01T00:00:00.000Z",
        null,
        "2026-10-01T00:00:00.000Z",
      ),
    ];
    expect(ruleActiveAt(rows, "2026-09-15T00:00:00.000Z")?.id).toBe("legacy");
    expect(ruleActiveAt(rows, "2026-10-01T00:00:00.000Z")?.id).toBe("seed");
  });
});

describe("price version states", () => {
  it("classifies active, superseded, scheduled, replaced and retired rows", () => {
    const rows = [
      row("seed", "2026-08-10T00:00:00Z"),
      row("now", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"),
      row("old-plan", "2027-01-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"),
      row("new-plan", "2027-01-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z"),
      row("later", "2027-06-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z"),
      row(
        "retired",
        "2026-09-01T00:00:00.000Z",
        null,
        "2026-09-15T00:00:00.000Z",
      ),
    ];
    const states = Object.fromEntries(
      classifyPriceVersions(rows, NOW).map((item) => [item.id, item.state]),
    );
    expect(states).toEqual({
      seed: "superseded",
      now: "active",
      "old-plan": "replaced",
      "new-plan": "scheduled",
      later: "scheduled",
      retired: "retired",
    });
  });

  it("lets a later publish win a tie and a published row beat a seed", () => {
    const rows = [
      row("seed", "2026-08-10T00:00:00Z"),
      row("same", "2026-08-10T00:00:00Z", "2026-08-01T00:00:00.000Z"),
    ];
    const states = classifyPriceVersions(rows, NOW);
    expect(states.find((item) => item.state === "active")?.id).toBe("same");
    expect(states.find((item) => item.id === "seed")?.state).toBe("replaced");
  });

  it("returns rows in the SQL order", () => {
    const rows = [
      row("seed", "2026-08-10T00:00:00Z"),
      row("later", "2027-06-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z"),
    ];
    expect(classifyPriceVersions(rows, NOW).map((item) => item.id)).toEqual([
      "later",
      "seed",
    ]);
  });
});
