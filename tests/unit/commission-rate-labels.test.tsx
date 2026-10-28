import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommonFields } from "../../app/components/commission/common-fields";
import { SimpleTransitionFields } from "../../app/components/commission/simple-transition-fields";
import { studentDiscountNote } from "../../app/components/services/price-figure";
import type { CommissionDraft } from "../../app/lib/commission/schema";
import type { PriceRule } from "../../app/lib/pricing/types";

// The seeded simple-transition rule (migrations/0002_price_terms.sql).
const SEED_RULE: PriceRule = {
  versionId: "simple-2026-08-10",
  serviceId: "simple_transition",
  baseTwd: 1000,
  includedSongs: 5,
  perSongAfterIncludedTwd: 200,
  studentDiscountBps: 3000,
  rushBps: 5000,
  consultationBps: 5000,
  sourcePrepBps: 500,
};

const draft = {
  serviceId: "simple_transition",
  displayName: "",
  email: "",
  contacts: [],
  projectLinks: [""],
  usagePurpose: "",
  desiredDate: "",
  adultStatus: "adult",
  guardianAuthorized: false,
  studentRequested: false,
  studentProofUrl: "",
  creditAccountId: "",
  portfolioConsent: false,
  rush: false,
  sourcePrep: false,
  songs: [{ order: 1, url: "", transitionAt: "" }],
  sequenceConfirmed: false,
  targetDuration: "",
  seamless: false,
  transitionStyle: "",
  consultation: false,
} as CommissionDraft;

function render(locale: "zh" | "en", priceRule: PriceRule) {
  const props = { draft, locale, priceRule, updateField: () => {} };
  return renderToStaticMarkup(
    <>
      <CommonFields {...props} />
      <SimpleTransitionFields {...props} />
    </>,
  );
}

describe("wizard rate labels", () => {
  it("read exactly as before for the seeded rule", () => {
    const zh = render("zh", SEED_RULE);
    expect(zh).toContain("申請學生優惠（所有計價 -30%）");
    expect(zh).toContain("詢問急件（服務基價 +50%）");
    expect(zh).toContain("需要素材整理（服務基價 +5%）");
    expect(zh).toContain("需要協助決定順序或銜接點（服務基價 +50%）");
    const en = render("en", SEED_RULE);
    expect(en).toContain("Request student discount (30% off)");
    expect(en).toContain("Request rush scheduling (+50% of service base)");
    expect(en).toContain("Source preparation needed (+5% of service base)");
    expect(en).toContain(
      "Need help choosing order or transition points (+50% of service base)",
    );
  });

  it("follow the active rule's rates", () => {
    const rule = {
      ...SEED_RULE,
      studentDiscountBps: 2500,
      rushBps: 6000,
      sourcePrepBps: 750,
      consultationBps: 4000,
    };
    const zh = render("zh", rule);
    expect(zh).toContain("申請學生優惠（所有計價 -25%）");
    expect(zh).toContain("詢問急件（服務基價 +60%）");
    expect(zh).toContain("需要素材整理（服務基價 +7.5%）");
    expect(zh).toContain("需要協助決定順序或銜接點（服務基價 +40%）");
    const en = render("en", rule);
    expect(en).toContain("Request student discount (25% off)");
    expect(en).toContain("(+60% of service base)");
    expect(en).toContain("(+7.5% of service base)");
    expect(en).toContain("(+40% of service base)");
  });

  it("states the student note without rounding", () => {
    expect(studentDiscountNote("en", 1250)).toContain("12.5%");
    expect(studentDiscountNote("zh", 3000)).toBe(
      "學生可申請 30% 優惠，需提供學生身分證明。",
    );
    expect(studentDiscountNote("en", 0)).toBeUndefined();
  });
});
