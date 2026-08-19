import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getActivePriceRule } from "../../app/lib/pricing/price-repository.server";

describe("versioned price repository", () => {
  it("loads the approved service prices from the active version", async () => {
    await expect(
      getActivePriceRule(env.DB, "full_mix", "2026-08-19T00:00:00Z"),
    ).resolves.toMatchObject({
      versionId: "full-2026-08-10",
      baseTwd: 8000,
      includedSongs: 0,
    });
    await expect(
      getActivePriceRule(env.DB, "simple_transition", "2026-08-19T00:00:00Z"),
    ).resolves.toMatchObject({
      versionId: "simple-2026-08-10",
      baseTwd: 1000,
      includedSongs: 5,
      perSongAfterIncludedTwd: 200,
    });
  });

  it("selects the newest immutable effective version", async () => {
    await env.DB.prepare(
      "INSERT INTO price_versions " +
        "(id, service_id, base_twd, per_song_after_five_twd, " +
        "student_discount_bps, rush_bps, consultation_bps, " +
        "source_prep_bps, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "full-2026-09-01",
        "full_mix",
        9000,
        0,
        3000,
        5000,
        5000,
        500,
        "2026-09-01T00:00:00Z",
      )
      .run();

    expect(
      (await getActivePriceRule(env.DB, "full_mix", "2026-08-31T23:59:59Z"))
        .versionId,
    ).toBe("full-2026-08-10");
    expect(
      (await getActivePriceRule(env.DB, "full_mix", "2026-09-01T00:00:00Z"))
        .versionId,
    ).toBe("full-2026-09-01");
  });
});
