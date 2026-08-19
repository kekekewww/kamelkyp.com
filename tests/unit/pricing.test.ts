import { describe, expect, it } from "vitest";
import { calculateQuote } from "../../app/lib/pricing/calculate-quote";
import { calculatePostQuoteFee } from "../../app/lib/pricing/post-quote-fees";
import type { PriceRule } from "../../app/lib/pricing/types";

const rules: Record<string, PriceRule> = {
  full_mix: {
    versionId: "full-2026-08-10",
    serviceId: "full_mix",
    baseTwd: 8000,
    includedSongs: 0,
    perSongAfterIncludedTwd: 0,
    studentDiscountBps: 3000,
    rushBps: 5000,
    consultationBps: 5000,
    sourcePrepBps: 500,
  },
  vocal_mix: {
    versionId: "vocal-2026-08-10",
    serviceId: "vocal_mix",
    baseTwd: 4000,
    includedSongs: 0,
    perSongAfterIncludedTwd: 0,
    studentDiscountBps: 3000,
    rushBps: 5000,
    consultationBps: 5000,
    sourcePrepBps: 500,
  },
  simple_transition: {
    versionId: "simple-2026-08-10",
    serviceId: "simple_transition",
    baseTwd: 1000,
    includedSongs: 5,
    perSongAfterIncludedTwd: 200,
    studentDiscountBps: 3000,
    rushBps: 5000,
    consultationBps: 5000,
    sourcePrepBps: 500,
  },
  edit_transition: {
    versionId: "edit-2026-08-10",
    serviceId: "edit_transition",
    baseTwd: 4000,
    includedSongs: 5,
    perSongAfterIncludedTwd: 800,
    studentDiscountBps: 3000,
    rushBps: 5000,
    consultationBps: 5000,
    sourcePrepBps: 500,
  },
};

describe("approved quote rules", () => {
  it("prices full and vocal mixing", () => {
    expect(
      calculateQuote(rules.full_mix, {
        serviceId: "full_mix",
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }).lockedInitialTwd,
    ).toBe(8000);
    expect(
      calculateQuote(rules.vocal_mix, {
        serviceId: "vocal_mix",
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }).lockedInitialTwd,
    ).toBe(4000);
  });

  it("prices transition song 5 and 6 boundaries", () => {
    expect(
      calculateQuote(rules.simple_transition, {
        serviceId: "simple_transition",
        songCount: 5,
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }).serviceBaseTwd,
    ).toBe(1000);
    expect(
      calculateQuote(rules.simple_transition, {
        serviceId: "simple_transition",
        songCount: 6,
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }).serviceBaseTwd,
    ).toBe(1200);
    expect(
      calculateQuote(rules.edit_transition, {
        serviceId: "edit_transition",
        songCount: 6,
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }).serviceBaseTwd,
    ).toBe(4800);
  });

  it("calculates fees from the service base before the student discount", () => {
    const quote = calculateQuote(rules.full_mix, {
      serviceId: "full_mix",
      rush: true,
      consultation: false,
      sourcePrep: true,
      studentRequested: true,
    });
    expect(quote).toMatchObject({
      rushTwd: 4000,
      sourcePrepTwd: 400,
      beforeStudentDiscountTwd: 12400,
      studentDiscountTwd: 3720,
      lockedInitialTwd: 8680,
      studentStatus: "pending_proof",
    });
  });

  it("does not compound consultation and rush", () => {
    const quote = calculateQuote(rules.simple_transition, {
      serviceId: "simple_transition",
      songCount: 5,
      rush: true,
      consultation: true,
      sourcePrep: false,
      studentRequested: true,
    });
    expect(quote.beforeStudentDiscountTwd).toBe(2000);
    expect(quote.lockedInitialTwd).toBe(1400);
  });

  it("uses the locked initial quote for later fixed fees", () => {
    expect(calculatePostQuoteFee(5600, "minor_revision")).toBe(560);
    expect(calculatePostQuoteFee(5600, "major_revision")).toBe(2800);
    expect(calculatePostQuoteFee(5600, "project_file")).toBe(2800);
  });

  it("rejects impossible or mismatched quote inputs", () => {
    expect(() =>
      calculateQuote(rules.full_mix, {
        serviceId: "vocal_mix",
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }),
    ).toThrow("price_rule_service_mismatch");
    expect(() =>
      calculateQuote(rules.simple_transition, {
        serviceId: "simple_transition",
        songCount: 0,
        rush: false,
        consultation: false,
        sourcePrep: false,
        studentRequested: false,
      }),
    ).toThrow("song_count_required");
  });
});
