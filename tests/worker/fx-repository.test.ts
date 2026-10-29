import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  getUsableFxSnapshot,
  refreshFxRate,
} from "../../app/lib/pricing/fx-repository.server";

const FX_URL = "https://api.frankfurter.dev/v2/rate/TWD/USD";

function pair(date: string, rate: number, base = "TWD", quote = "USD") {
  return { date, base, quote, rate };
}

describe("daily FX snapshots", () => {
  it("stores a valid Frankfurter TWD to USD response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(pair("2026-08-19", 0.0325)), {
        headers: { "content-type": "application/json" },
      }),
    );

    const snapshot = await refreshFxRate(
      env.DB,
      FX_URL,
      fetcher,
      "2026-08-19T01:15:00Z",
    );

    expect(snapshot).toMatchObject({
      rateDate: "2026-08-19",
      rateScaled: 3_250_000,
      scale: 100_000_000,
      source: "Frankfurter",
      fetchedAt: "2026-08-19T01:15:00Z",
    });
    await expect(getUsableFxSnapshot(env.DB, "2026-08-20")).resolves.toEqual(
      snapshot,
    );
  });

  it("upserts duplicate dates and rejects an FX rate older than 3 business days", async () => {
    const first = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(pair("2026-08-03", 0.03)));
    const second = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(pair("2026-08-03", 0.031)));
    await refreshFxRate(env.DB, FX_URL, first, "2026-08-03T01:15:00Z");
    await refreshFxRate(env.DB, FX_URL, second, "2026-08-03T02:15:00Z");

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM fx_rates WHERE rate_date = ?",
    )
      .bind("2026-08-03")
      .first<{ total: number }>();
    expect(count?.total).toBe(1);
    await expect(getUsableFxSnapshot(env.DB, "2026-08-07")).rejects.toThrow(
      "fx_rate_stale",
    );
  });

  it("rejects invalid upstream responses without persisting them", async () => {
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json"));
    await expect(
      refreshFxRate(env.DB, FX_URL, malformed, "2026-08-18T01:15:00Z"),
    ).rejects.toThrow("fx_response_invalid");

    const missingRate = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ date: "2026-08-18", base: "TWD", quote: "USD" }),
      );
    await expect(
      refreshFxRate(env.DB, FX_URL, missingRate, "2026-08-18T01:15:00Z"),
    ).rejects.toThrow("fx_response_invalid");

    // A rate for another pair must never be stored as TWD to USD.
    const otherPair = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(pair("2026-08-18", 1.12, "EUR")));
    await expect(
      refreshFxRate(env.DB, FX_URL, otherPair, "2026-08-18T01:15:00Z"),
    ).rejects.toThrow("fx_response_invalid");

    // The v1 shape (`rates.USD`) is not the configured endpoint's response.
    const v1Shape = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ date: "2026-08-18", rates: { USD: 0.0325 } }),
      );
    await expect(
      refreshFxRate(env.DB, FX_URL, v1Shape, "2026-08-18T01:15:00Z"),
    ).rejects.toThrow("fx_response_invalid");

    const stored = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM fx_rates WHERE rate_date = ?",
    )
      .bind("2026-08-18")
      .first<{ total: number }>();
    expect(stored?.total).toBe(0);
  });
});
