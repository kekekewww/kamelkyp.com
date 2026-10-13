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

describe("price version tie-break (publish metadata)", () => {
  async function insertVersion(
    id: string,
    serviceId: string,
    base: number,
    effectiveFrom: string,
    publishedAt: string | null,
  ) {
    await env.DB.prepare(
      "INSERT INTO price_versions (id, service_id, base_twd, per_song_after_five_twd, " +
        "student_discount_bps, rush_bps, consultation_bps, source_prep_bps, effective_from) " +
        "VALUES (?, ?, ?, 0, 3000, 5000, 5000, 500, ?)",
    )
      .bind(id, serviceId, base, effectiveFrom)
      .run();
    if (publishedAt) {
      await env.DB.prepare(
        "INSERT INTO price_version_publications (version_id, published_at, action) " +
          "VALUES (?, ?, 'publish')",
      )
        .bind(id, publishedAt)
        .run();
    }
  }

  it("lets the later publish win two versions at the same instant", async () => {
    const at = "2027-03-01T00:00:00.000Z";
    // "zzz" sorts after "aaa": without metadata the id would decide.
    await insertVersion(
      "tie-zzz",
      "vocal_mix",
      4100,
      at,
      "2026-10-01T00:00:00.000Z",
    );
    await insertVersion(
      "tie-aaa",
      "vocal_mix",
      4200,
      at,
      "2026-10-02T00:00:00.000Z",
    );
    expect(
      (
        await getActivePriceRule(
          env.DB,
          "vocal_mix",
          "2027-02-28T23:59:59.000Z",
        )
      ).versionId,
    ).toBe("vocal-2026-08-10");
    expect((await getActivePriceRule(env.DB, "vocal_mix", at)).versionId).toBe(
      "tie-aaa",
    );
  });

  it("prefers a published row over a metadata-less row at the same instant", async () => {
    const at = "2027-04-01T00:00:00.000Z";
    await insertVersion("plain-zzz", "edit_transition", 4100, at, null);
    await insertVersion(
      "meta-aaa",
      "edit_transition",
      4200,
      at,
      "2026-10-01T00:00:00.000Z",
    );
    expect(
      (await getActivePriceRule(env.DB, "edit_transition", at)).versionId,
    ).toBe("meta-aaa");
  });

  it("keeps the seeds active without metadata", async () => {
    expect(
      (
        await getActivePriceRule(
          env.DB,
          "simple_transition",
          "2026-10-13T00:00:00.000Z",
        )
      ).versionId,
    ).toBe("simple-2026-08-10");
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM price_version_publications WHERE version_id LIKE '%-2026-08-10'",
      ).first("n"),
    ).toBe(0);
  });
});
