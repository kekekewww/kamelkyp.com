import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  publishPriceVersion,
} from "../../app/lib/admin/service-catalog-service.server";
import { publishTermVersion } from "../../app/lib/admin/term-service.server";
import { listPublishedTerms } from "../../app/lib/content/public-content.server";
import { getActivePriceRule } from "../../app/lib/pricing/price-repository.server";

describe("admin price and term publication", () => {
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

  it("requires explicit legal review and publishes immutable locale versions", async () => {
    const input = {
      db: env.DB,
      documentId: "common",
      locale: "zh" as const,
      clauses: [{ key: "deposit", title: "訂金", text: "確認後支付 50%。" }],
      effectiveFrom: "2026-08-19T00:00:00Z",
    };
    await expect(
      publishTermVersion({ ...input, legalReviewConfirmed: false }),
    ).rejects.toThrow("legal_review_required");

    const version = await publishTermVersion({
      ...input,
      legalReviewConfirmed: true,
    });
    expect(version.versionNumber).toBe(1);
    await publishTermVersion({
      ...input,
      locale: "en",
      clauses: [{ key: "deposit", title: "Deposit", text: "Pay 50% after acceptance." }],
      legalReviewConfirmed: true,
    });

    const active = await listPublishedTerms(env.DB, "zh", "terms");
    expect(active.find((term) => term.documentId === "common")?.clauses[0]?.title).toBe("訂金");
    await expect(
      env.DB.prepare("UPDATE term_versions SET body_json = '[]' WHERE id = ?")
        .bind(version.id)
        .run(),
    ).rejects.toThrow();
  });
});
