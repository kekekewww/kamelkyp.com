/**
 * Studio → Pricing (wp2 §4.3-4.4, §6.2). Price versions are immutable and
 * this file shares one database, so every test passes its own `now`, works
 * on its own service or time window, and reads the state it builds on.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  handlePriceEditorAction,
  handlePricingIndexAction,
  loadPriceEditor,
  loadPricingIndex,
  type PriceEditorData,
} from "../../app/lib/cms/repositories/pricing.server";
import type { Env } from "../../app/lib/env.server";
import { classifyPriceVersions } from "../../app/lib/pricing/price-history";
import { getActivePriceRule } from "../../app/lib/pricing/price-repository.server";
import { SERVICE_IDS, type ServiceId } from "../../app/lib/services/service-id";

type Result = {
  data?: Record<string, unknown>;
  init?: { status?: number } | null;
};

function body(result: unknown): Record<string, unknown> {
  return ((result as Result).data ?? {}) as Record<string, unknown>;
}

function status(result: unknown): number {
  return (result as Result).init?.status ?? 200;
}

function issueCodes(result: unknown): string[] {
  const issues = (body(result).issues ?? []) as Array<{ code: string }>;
  return issues.map((issue) => issue.code);
}

const PERCENT_FIELDS = {
  studentDiscountBps: "studentDiscountPercent",
  rushBps: "rushPercent",
  consultationBps: "consultationPercent",
  sourcePrepBps: "sourcePrepPercent",
} as const;

function percentText(bps: number): string {
  return (bps / 100).toString();
}

/** The editor form as the page posts it: the active values, unchanged. */
function priceForm(
  data: PriceEditorData,
  overrides: Record<string, string> = {},
): FormData {
  const active = data.service.active;
  const fields: Record<string, string> = {
    basedOnVersionId: active?.id ?? "",
    expectedVersionCount: String(data.versionCount),
    effectiveMode: "now",
  };
  if (active) {
    for (const field of data.editable) {
      if (field === "baseTwd" || field === "perSongAfterFiveTwd") {
        fields[`${field}:number`] = String(active[field]);
      } else {
        fields[PERCENT_FIELDS[field]] = percentText(active[field]);
      }
    }
  }
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) {
    form.append(key, value);
  }
  return form;
}

async function publish(
  serviceId: ServiceId,
  now: Date,
  overrides: Record<string, string>,
  intent = "publish-price-version",
) {
  const data = await loadPriceEditor(env.DB, serviceId, now);
  return handlePriceEditorAction({
    db: env.DB,
    serviceId,
    formData: priceForm(data, overrides),
    intent,
    now,
  });
}

async function versionCount(serviceId: ServiceId): Promise<number> {
  return (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM price_versions WHERE service_id = ?",
  )
    .bind(serviceId)
    .first("n")) as number;
}

async function metadata(versionId: string) {
  return env.DB.prepare(
    "SELECT published_at, action, replaces_version_id FROM price_version_publications WHERE version_id = ?",
  )
    .bind(versionId)
    .first<{
      published_at: string;
      action: string;
      replaces_version_id: string | null;
    }>();
}

describe("pricing index", () => {
  it("lists the four services with the exact seeded values and row names", async () => {
    const data = await loadPricingIndex(
      env.DB,
      new Date("2026-10-13T00:00:00.000Z"),
    );
    expect(data.services.map((service) => service.serviceId)).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
    const values = data.services.map((service) => [
      service.active?.id,
      service.active?.baseTwd,
      service.active?.perSongAfterFiveTwd,
      service.active?.studentDiscountBps,
      service.active?.rushBps,
      service.active?.consultationBps,
      service.active?.sourcePrepBps,
    ]);
    expect(values).toEqual([
      ["full-2026-08-10", 8000, 0, 3000, 5000, 5000, 500],
      ["vocal-2026-08-10", 4000, 0, 3000, 5000, 5000, 500],
      ["simple-2026-08-10", 1000, 200, 3000, 5000, 5000, 500],
      ["edit-2026-08-10", 4000, 800, 3000, 5000, 5000, 500],
    ]);
    const fullMix = data.services[0];
    expect(fullMix?.name).toEqual({
      zh: "完整歌曲混音",
      en: "Full Song Mixing",
    });
    expect(fullMix?.category).toBe("mixing");
    expect(fullMix?.serviceRow?.status).toBe("published");
    expect(fullMix?.livePath).toBe("/mixing/full");
    expect(fullMix?.next).toBeNull();
    expect(fullMix?.active?.state).toBe("active");
    expect(data.readiness).toHaveLength(4);
    expect(data.now).toBe("2026-10-13T00:00:00.000Z");
  });

  it("reports the FX state on the public readers' date basis", async () => {
    const missing = await loadPricingIndex(
      env.DB,
      new Date("2026-10-13T01:00:00.000Z"),
    );
    expect(missing.fx).toEqual({
      state: "missing",
      rateDate: null,
      rateScaled: null,
      fetchedAt: null,
    });

    await env.DB.prepare(
      "INSERT INTO fx_rates (rate_date, base_currency, quote_currency, rate_scaled, scale, source, fetched_at) " +
        "VALUES ('2026-10-12', 'TWD', 'USD', 3250000, 100000000, 'Frankfurter', '2026-10-13T01:15:00.000Z')",
    ).run();
    const ok = await loadPricingIndex(
      env.DB,
      new Date("2026-10-13T02:00:00.000Z"),
    );
    expect(ok.fx).toEqual({
      state: "ok",
      rateDate: "2026-10-12",
      rateScaled: 3250000,
      fetchedAt: "2026-10-13T01:15:00.000Z",
    });

    const stale = await loadPricingIndex(
      env.DB,
      new Date("2026-10-20T02:00:00.000Z"),
    );
    expect(stale.fx.state).toBe("stale");
    expect(stale.fx.rateDate).toBe("2026-10-12");
  });

  it("refreshes FX through an injected fetcher and maps upstream failures to 503", async () => {
    const now = new Date("2026-10-15T03:00:00.000Z");
    const testEnv = { FX_API_URL: "https://fx.example/latest" } as Env;
    const ok = await handlePricingIndexAction({
      db: env.DB,
      env: testEnv,
      intent: "refresh-fx",
      now,
      fetcher: vi.fn(async () =>
        Response.json({ date: "2026-10-14", rates: { USD: 0.0326 } }),
      ) as unknown as typeof fetch,
    });
    expect(status(ok)).toBe(200);
    expect(String(body(ok).message)).toContain("2026-10-14");
    expect(
      await env.DB.prepare(
        "SELECT rate_scaled FROM fx_rates WHERE rate_date = '2026-10-14'",
      ).first("rate_scaled"),
    ).toBe(3260000);

    for (const fetcher of [
      async () => new Response("down", { status: 502 }),
      async () => Response.json({ nope: true }),
    ]) {
      const failed = await handlePricingIndexAction({
        db: env.DB,
        env: testEnv,
        intent: "refresh-fx",
        now,
        fetcher: fetcher as unknown as typeof fetch,
      });
      expect(status(failed)).toBe(503);
      expect(body(failed).code).toBe("fx_refresh_failed");
    }

    const unknown = await handlePricingIndexAction({
      db: env.DB,
      env: testEnv,
      intent: "bogus",
      now,
    });
    expect(status(unknown)).toBe(422);
    expect(body(unknown).code).toBe("unknown_intent");
  });
});

describe("price editor", () => {
  it("answers 404 for an unknown service", async () => {
    await expect(
      loadPriceEditor(env.DB, "mastering", new Date()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("loads the editable fields, history and version count", async () => {
    const data = await loadPriceEditor(
      env.DB,
      "full_mix",
      new Date("2026-10-13T00:00:00.000Z"),
    );
    expect(data.editable).toEqual([
      "baseTwd",
      "studentDiscountBps",
      "rushBps",
      "sourcePrepBps",
    ]);
    expect(data.versionCount).toBe(data.history.length);
    expect(data.history[0]?.id).toBe("full-2026-08-10");
    expect(
      (await loadPriceEditor(env.DB, "simple_transition", new Date())).editable,
    ).toHaveLength(6);
  });

  it("publishes now: the new rule is active at once, metadata `publish`, locked cases untouched", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    await env.DB.prepare(
      "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) " +
        "VALUES ('KAM-20261031-PRICINGWP2', 'vocal_mix', 4000, 'TWD', '2026-10-31T00:00:00Z', 'pending_review')",
    ).run();
    const result = await publish("vocal_mix", now, {
      "baseTwd:number": "4500",
    });
    expect(status(result)).toBe(200);
    expect(body(result).ok).toBe(true);
    const rule = await getActivePriceRule(
      env.DB,
      "vocal_mix",
      now.toISOString(),
    );
    expect(rule.baseTwd).toBe(4500);
    expect(rule.studentDiscountBps).toBe(3000);
    expect(rule.consultationBps).toBe(5000);
    expect(await metadata(rule.versionId)).toEqual({
      published_at: now.toISOString(),
      action: "publish",
      replaces_version_id: null,
    });
    expect(
      await env.DB.prepare(
        "SELECT locked_price_minor FROM cases WHERE case_id = 'KAM-20261031-PRICINGWP2'",
      ).first("locked_price_minor"),
    ).toBe(4000);
  });

  it("refuses an immediate publish with unchanged values (422 unchanged)", async () => {
    const now = new Date("2026-11-02T00:00:00.000Z");
    const before = await versionCount("vocal_mix");
    const result = await publish("vocal_mix", now, {});
    expect(status(result)).toBe(422);
    expect(body(result).code).toBe("invalid_content");
    expect(issueCodes(result)).toContain("unchanged");
    expect(await versionCount("vocal_mix")).toBe(before);
  });

  it("refuses a scheduled time in the past or under 5 minutes ahead", async () => {
    // 2026-11-03T00:00Z is 08:00 Taipei.
    const now = new Date("2026-11-03T00:00:00.000Z");
    for (const effectiveAt of ["2026-11-03T08:02", "2026-11-02T08:00"]) {
      const result = await publish("vocal_mix", now, {
        "baseTwd:number": "4700",
        effectiveMode: "scheduled",
        effectiveAt,
      });
      expect(status(result)).toBe(422);
      expect(issueCodes(result)).toContain("effective_in_past");
    }
    const malformed = await publish("vocal_mix", now, {
      "baseTwd:number": "4700",
      effectiveMode: "scheduled",
      effectiveAt: "next tuesday",
    });
    expect(status(malformed)).toBe(422);
    expect(issueCodes(malformed)).toContain("invalid_value");
  });

  it("copies carried fields from the baseline and ignores posted ones", async () => {
    const now = new Date("2026-11-10T00:00:00.000Z");
    const result = await publish("full_mix", now, {
      "baseTwd:number": "8800",
      "perSongAfterFiveTwd:number": "999",
      consultationPercent: "99",
    });
    expect(status(result)).toBe(200);
    const rule = await getActivePriceRule(
      env.DB,
      "full_mix",
      now.toISOString(),
    );
    expect(rule.baseTwd).toBe(8800);
    expect(rule.perSongAfterIncludedTwd).toBe(0);
    expect(rule.consultationBps).toBe(5000);
  });

  it("validates amounts and percentages (no float rounding)", async () => {
    const now = new Date("2026-11-20T00:00:00.000Z");
    const invalid: Array<Record<string, string>> = [
      { studentDiscountPercent: "12.345" },
      { rushPercent: "101" },
      { sourcePrepPercent: "-1" },
      { "baseTwd:number": "0" },
      { "baseTwd:number": "1.5" },
      { "baseTwd:number": "" },
    ];
    for (const overrides of invalid) {
      const result = await publish("full_mix", now, overrides);
      expect(status(result), JSON.stringify(overrides)).toBe(422);
      expect(body(result).code).toBe("invalid_content");
    }
    const exact = await publish("full_mix", now, { sourcePrepPercent: "0.07" });
    expect(status(exact)).toBe(200);
    expect(
      (await getActivePriceRule(env.DB, "full_mix", now.toISOString()))
        .sourcePrepBps,
    ).toBe(7);
  });

  it("schedules, replaces and cancels a change without touching existing rows", async () => {
    // 2027-01-01 00:00 Taipei = 2026-12-31T16:00Z.
    const at = "2026-12-31T16:00:00.000Z";
    const day1 = new Date("2026-12-01T00:00:00.000Z");
    const scheduled = await publish("edit_transition", day1, {
      "baseTwd:number": "4200",
      effectiveMode: "scheduled",
      effectiveAt: "2027-01-01T00:00",
    });
    expect(status(scheduled)).toBe(200);
    expect(String(body(scheduled).message)).toMatch(
      /^Scheduled for 2027-01-01 00:00/,
    );
    let data = await loadPriceEditor(env.DB, "edit_transition", day1);
    expect(data.service.active?.id).toBe("edit-2026-08-10");
    expect(data.service.next?.baseTwd).toBe(4200);
    expect(data.service.next?.state).toBe("scheduled");
    expect(data.service.next?.effectiveFrom).toBe(at);
    const first = data.service.next?.id as string;

    // Same instant again: a replacement wins its group.
    const day2 = new Date("2026-12-02T00:00:00.000Z");
    const replaced = await publish("edit_transition", day2, {
      "baseTwd:number": "4300",
      effectiveMode: "scheduled",
      effectiveAt: "2027-01-01T00:00",
    });
    expect(status(replaced)).toBe(200);
    expect(String(body(replaced).message)).toContain(
      "replaces the earlier change",
    );
    data = await loadPriceEditor(env.DB, "edit_transition", day2);
    const second = data.service.next?.id as string;
    expect(await metadata(second)).toMatchObject({
      action: "replace",
      replaces_version_id: first,
    });
    expect(data.history.find((row) => row.id === first)?.state).toBe(
      "replaced",
    );
    expect(
      (await getActivePriceRule(env.DB, "edit_transition", at)).baseTwd,
    ).toBe(4300);

    // Cancel: a copy of the baseline at the exact same instant.
    const day3 = new Date("2026-12-03T00:00:00.000Z");
    const before = await versionCount("edit_transition");
    const cancelForm = new FormData();
    cancelForm.append("versionId", second);
    cancelForm.append("expectedVersionCount", String(before));
    const cancelled = await handlePriceEditorAction({
      db: env.DB,
      serviceId: "edit_transition",
      formData: cancelForm,
      intent: "cancel-scheduled",
      now: day3,
    });
    expect(status(cancelled)).toBe(200);
    expect(await versionCount("edit_transition")).toBe(before + 1);
    const atRule = await getActivePriceRule(env.DB, "edit_transition", at);
    expect(atRule.baseTwd).toBe(4000);
    expect(atRule.perSongAfterIncludedTwd).toBe(800);
    expect(await metadata(atRule.versionId)).toMatchObject({
      action: "cancel",
      replaces_version_id: second,
    });
    expect(
      await env.DB.prepare(
        "SELECT effective_from FROM price_versions WHERE id = ?",
      )
        .bind(atRule.versionId)
        .first("effective_from"),
    ).toBe(at);
    // Seeds and earlier versions are untouched.
    expect(
      await env.DB.prepare(
        "SELECT base_twd FROM price_versions WHERE id = 'edit-2026-08-10'",
      ).first("base_twd"),
    ).toBe(4000);

    // Cancelling the active version is not possible.
    const activeForm = new FormData();
    activeForm.append("versionId", "edit-2026-08-10");
    activeForm.append("expectedVersionCount", String(before + 1));
    const refused = await handlePriceEditorAction({
      db: env.DB,
      serviceId: "edit_transition",
      formData: activeForm,
      intent: "cancel-scheduled",
      now: day3,
    });
    expect(status(refused)).toBe(409);
    expect(body(refused).code).toBe("invalid_state");
  });

  it("refuses stale pages (409) and inserts nothing", async () => {
    const now = new Date("2027-01-10T00:00:00.000Z");
    const before = await versionCount("simple_transition");

    const staleBase = await publish("simple_transition", now, {
      "baseTwd:number": "1100",
      basedOnVersionId: "some-older-version",
    });
    expect(status(staleBase)).toBe(409);
    expect(body(staleBase).code).toBe("stale_revision");

    const staleCount = await publish("simple_transition", now, {
      "baseTwd:number": "1100",
      expectedVersionCount: String(before - 1),
    });
    expect(status(staleCount)).toBe(409);
    expect(body(staleCount).code).toBe("stale_revision");

    const cancelForm = new FormData();
    cancelForm.append("versionId", "simple-2026-08-10");
    cancelForm.append("expectedVersionCount", String(before + 3));
    const staleCancel = await handlePriceEditorAction({
      db: env.DB,
      serviceId: "simple_transition",
      formData: cancelForm,
      intent: "cancel-scheduled",
      now,
    });
    expect(status(staleCancel)).toBe(409);
    expect(body(staleCancel).code).toBe("stale_revision");
    expect(await versionCount("simple_transition")).toBe(before);
  });

  it("publishes a scheduled version with baseline values, with an `unchanged` warning", async () => {
    const now = new Date("2027-02-01T00:00:00.000Z");
    const result = await publish("simple_transition", now, {
      effectiveMode: "scheduled",
      effectiveAt: "2027-03-01T00:00",
    });
    expect(status(result)).toBe(200);
    const warnings = (body(result).issues ?? []) as Array<{
      code: string;
      severity: string;
    }>;
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unchanged", severity: "warning" }),
    );
    const data = await loadPriceEditor(env.DB, "simple_transition", now);
    expect(data.service.next?.baseTwd).toBe(1000);
    expect(data.service.next?.perSongAfterFiveTwd).toBe(200);
  });

  it("never invents a price: no baseline before the first version → 409 invalid_state", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const before = await versionCount("simple_transition");
    const data = await loadPriceEditor(env.DB, "simple_transition", now);
    expect(data.service.active).toBeNull();
    const form = new FormData();
    form.append("basedOnVersionId", "");
    form.append("expectedVersionCount", String(data.versionCount));
    form.append("effectiveMode", "scheduled");
    form.append("effectiveAt", "2026-02-01T00:00");
    form.append("baseTwd:number", "1000");
    form.append("perSongAfterFiveTwd:number", "200");
    form.append("studentDiscountPercent", "30");
    form.append("rushPercent", "50");
    form.append("consultationPercent", "50");
    form.append("sourcePrepPercent", "5");
    const result = await handlePriceEditorAction({
      db: env.DB,
      serviceId: "simple_transition",
      formData: form,
      intent: "publish-price-version",
      now,
    });
    expect(status(result)).toBe(409);
    expect(body(result).code).toBe("invalid_state");
    expect(String(body(result).message)).toBe(
      "There is no price to base this version on.",
    );
    expect(await versionCount("simple_transition")).toBe(before);
  });

  it("answers 422 for an unknown intent", async () => {
    const result = await handlePriceEditorAction({
      db: env.DB,
      serviceId: "full_mix",
      formData: new FormData(),
      intent: "delete",
      now: new Date(),
    });
    expect(status(result)).toBe(422);
    expect(body(result).code).toBe("unknown_intent");
  });

  it("classifies exactly like getActivePriceRule for every service and time", async () => {
    const times = [
      "2026-08-09T23:59:59.000Z",
      "2026-08-10T00:00:00.000Z",
      "2026-10-13T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-11-20T00:00:00.000Z",
      "2026-12-31T15:59:59.999Z",
      "2026-12-31T16:00:00.000Z",
      "2027-03-01T00:00:00.000Z",
      "2099-01-01T00:00:00.000Z",
    ];
    for (const serviceId of SERVICE_IDS) {
      const data = await loadPriceEditor(env.DB, serviceId, new Date());
      for (const at of times) {
        const classified = classifyPriceVersions(data.history, at);
        const active = classified.find((row) => row.state === "active");
        let expected: string | null = null;
        try {
          expected = (await getActivePriceRule(env.DB, serviceId, at))
            .versionId;
        } catch {
          expected = null;
        }
        expect(active?.id ?? null, `${serviceId} @ ${at}`).toBe(expected);
      }
    }
  });
});
