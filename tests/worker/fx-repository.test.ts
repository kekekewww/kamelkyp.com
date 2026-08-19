import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  getUsableFxSnapshot,
  refreshFxRate,
} from "../../app/lib/pricing/fx-repository.server";

describe("daily FX snapshots", () => {
  it("stores a valid Frankfurter TWD to USD response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ date: "2026-08-19", rates: { USD: 0.0325 } }),
          { headers: { "content-type": "application/json" } },
        ),
      );

    const snapshot = await refreshFxRate(
      env.DB,
      "https://api.frankfurter.app/latest?from=TWD&to=USD",
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
      .mockResolvedValue(
        Response.json({ date: "2026-08-03", rates: { USD: 0.03 } }),
      );
    const second = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ date: "2026-08-03", rates: { USD: 0.031 } }),
      );
    await refreshFxRate(
      env.DB,
      "https://api.frankfurter.app/latest?from=TWD&to=USD",
      first,
      "2026-08-03T01:15:00Z",
    );
    await refreshFxRate(
      env.DB,
      "https://api.frankfurter.app/latest?from=TWD&to=USD",
      second,
      "2026-08-03T02:15:00Z",
    );

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
      refreshFxRate(
        env.DB,
        "https://api.frankfurter.app/latest?from=TWD&to=USD",
        malformed,
        "2026-08-18T01:15:00Z",
      ),
    ).rejects.toThrow("fx_response_invalid");

    const missingUsd = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ date: "2026-08-18", rates: {} }));
    await expect(
      refreshFxRate(
        env.DB,
        "https://api.frankfurter.app/latest?from=TWD&to=USD",
        missingUsd,
        "2026-08-18T01:15:00Z",
      ),
    ).rejects.toThrow("fx_response_invalid");
  });
});
