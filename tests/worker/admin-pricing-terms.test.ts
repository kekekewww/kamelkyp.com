import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { publishPriceVersion } from "../../app/lib/admin/service-catalog-service.server";
import { getActivePriceRule } from "../../app/lib/pricing/price-repository.server";

describe("admin price publication", () => {
  it("inserts a new price version without changing locked case prices", async () => {
    await env.DB.prepare(
      "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) VALUES ('KAM-20260819-ABCDEFGHJK', 'full_mix', 8000, 'TWD', '2026-08-19T00:00:00Z', 'pending_review')",
    ).run();

    await publishPriceVersion({
      db: env.DB,
      serviceId: "full_mix",
      baseTwd: 9000,
      perSongAfterFiveTwd: 0,
      studentDiscountBps: 3000,
      rushBps: 5000,
      consultationBps: 5000,
      sourcePrepBps: 500,
      effectiveFrom: "2026-08-20T00:00:00Z",
    });

    expect(
      (await getActivePriceRule(env.DB, "full_mix", "2026-08-19T12:00:00Z"))
        .baseTwd,
    ).toBe(8000);
    expect(
      (await getActivePriceRule(env.DB, "full_mix", "2026-08-20T00:00:00Z"))
        .baseTwd,
    ).toBe(9000);
    expect(
      await env.DB.prepare(
        "SELECT locked_price_minor FROM cases WHERE case_id = 'KAM-20260819-ABCDEFGHJK'",
      ).first("locked_price_minor"),
    ).toBe(8000);
  });

  it("writes publish metadata with the version in one batch", async () => {
    const version = await publishPriceVersion({
      db: env.DB,
      serviceId: "vocal_mix",
      baseTwd: 4500,
      perSongAfterFiveTwd: 0,
      studentDiscountBps: 3000,
      rushBps: 5000,
      consultationBps: 5000,
      sourcePrepBps: 500,
      effectiveFrom: "2026-08-21T00:00:00Z",
    });
    const rows = await env.DB.prepare(
      "SELECT version_id, action, replaces_version_id, published_at " +
        "FROM price_version_publications WHERE version_id = ?",
    )
      .bind(version.id)
      .all<{
        version_id: string;
        action: string;
        replaces_version_id: string | null;
        published_at: string;
      }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({
      version_id: version.id,
      action: "publish",
      replaces_version_id: null,
    });
    expect(Date.parse(rows.results[0]?.published_at ?? "")).not.toBeNaN();
  });
});
