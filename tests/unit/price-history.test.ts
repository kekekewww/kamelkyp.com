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

/** A Studio publish with its metadata action (`cancel` = a cancellation). */
function published(
  id: string,
  effectiveFrom: string,
  publishedAt: string,
  action: "publish" | "replace" | "cancel" = "publish",
): PriceHistoryRow {
  return { id, effectiveFrom, publishedAt, retiredAt: null, action };
}

describe("cancelled changes", () => {
  const JAN = "2026-12-31T16:00:00.000Z"; // 2027-01-01 00:00 Taipei
  const FEB = "2027-01-31T16:00:00.000Z"; // 2027-02-01 00:00 Taipei

  it("leaves the rule before a cancelled instant in force, whatever the cancel order", () => {
    // Active A; S0 scheduled for Jan, S for Feb; S cancelled first, then S0.
    const rows = [
      row("a", "2026-08-10T00:00:00Z"),
      published("s0", JAN, "2026-10-01T00:00:00.000Z"),
      published("s", FEB, "2026-10-02T00:00:00.000Z"),
      published("c", FEB, "2026-10-03T00:00:00.000Z", "cancel"),
      published("c0", JAN, "2026-10-04T00:00:00.000Z", "cancel"),
    ];
    expect(ruleActiveAt(rows, "2027-01-15T00:00:00.000Z")?.id).toBe("a");
    expect(ruleActiveAt(rows, "2027-02-05T00:00:00.000Z")?.id).toBe("a");
    expect(ruleActiveAt(rows, FEB, { before: true })?.id).toBe("a");
  });

  it("never reverts a later publish at the cancelled instant", () => {
    // B scheduled for Jan and cancelled; D then scheduled before it.
    const rows = [
      row("a", "2026-08-10T00:00:00Z"),
      published("b", JAN, "2026-10-01T00:00:00.000Z"),
      published("c", JAN, "2026-10-02T00:00:00.000Z", "cancel"),
      published("d", "2026-12-14T16:00:00.000Z", "2026-10-03T00:00:00.000Z"),
    ];
    expect(ruleActiveAt(rows, "2027-01-02T00:00:00.000Z")?.id).toBe("d");
  });

  it("lets a new publish at a cancelled instant take effect again", () => {
    const rows = [
      row("a", "2026-08-10T00:00:00Z"),
      published("b", JAN, "2026-10-01T00:00:00.000Z"),
      published("c", JAN, "2026-10-02T00:00:00.000Z", "cancel"),
      published("r", JAN, "2026-10-03T00:00:00.000Z"),
    ];
    expect(ruleActiveAt(rows, "2027-01-02T00:00:00.000Z")?.id).toBe("r");
    const states = Object.fromEntries(
      classifyPriceVersions(rows, NOW).map((item) => [item.id, item.state]),
    );
    expect(states).toEqual({
      a: "active",
      b: "replaced",
      c: "replaced",
      r: "scheduled",
    });
  });

  it("classifies a cancelled group as cancelled, never scheduled or active", () => {
    const rows = [
      row("a", "2026-08-10T00:00:00Z"),
      published("s0", JAN, "2026-10-01T00:00:00.000Z"),
      published("c0", JAN, "2026-10-04T00:00:00.000Z", "cancel"),
      published("later", FEB, "2026-10-05T00:00:00.000Z"),
    ];
    const states = (at: string) =>
      Object.fromEntries(
        classifyPriceVersions(rows, at).map((item) => [item.id, item.state]),
      );
    expect(states(NOW)).toEqual({
      a: "active",
      s0: "cancelled",
      c0: "cancelled",
      later: "scheduled",
    });
    // Once the cancelled instant has passed, the group never became active.
    expect(states("2027-01-15T00:00:00.000Z")).toEqual({
      a: "active",
      s0: "cancelled",
      c0: "cancelled",
      later: "scheduled",
    });
  });
});
