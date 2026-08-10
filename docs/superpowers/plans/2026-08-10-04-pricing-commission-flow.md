# Kamel Pricing and Commission Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付四種服務的精確報價、每日 USD 換算、瀏覽器草稿、服務特定表單、統一條款、完整複核與 Turnstile 驗證流程。

**Architecture:** 價格引擎是純函式，使用整數 TWD、basis points 與固定 8 位匯率計算，Worker 永遠重新計價。表單使用 ServiceId discriminated union；未送出資料只進 localStorage，Review 後才建立 Turnstile，Plan 05 再把已驗證 envelope 送到 Google。

**Tech Stack:** TypeScript 7.0.2、Zod 4.4.3、React Router 8.3.0、D1、Cloudflare Scheduled Handler、Turnstile Siteverify、Vitest、Playwright。

## Global Constraints

- 前置計畫 01–03 已合併 main。
- Branch：codex/04-commission-flow。
- 價格基準：
  - Full Mix：NT$8,000。
  - Vocal Mix：NT$4,000。
  - Simple Transition：1–5 首 NT$1,000，第 6 首起每首 NT$200。
  - Edited Transition：1–5 首 NT$4,000，第 6 首起每首 NT$800。
- 急件 50%、Simple 諮詢 50%、素材整理 5% 各自以服務基價計算，不複利。
- 服務基價與送出前附加費合計後，學生優惠減少 30%。
- 前 5 次小範圍修改免費，第 6 次起每次 10%；第 1 次重大修改免費，第 2 次起每次 50%；正式交付後工程檔 50%，三者各自以鎖定初始報價計算。
- 中文顯示 TWD；英文顯示 USD cents；送出時保存 TWD、USD、匯率值、日期與來源。
- 完整表單不得寫入 D1。
- 不接受任何 File Input；連結只允許 HTTPS。
- 不要求生日或法定本名。
- Email 必填；聯絡平台／帳號至少一組；未成年必須勾選監護人授權。
- 學生證明使用選填的外部連結；選擇學生優惠時該連結成為必填。
- 條款使用一個統一必填勾選，且保存版本 ID 與同意時間到清理日。
- 條款 fixture 與後台欄位必須覆蓋設計規格第 11–14 節：銀行匯款／PayPal、確認委託後 50% 訂金才開工、確認預覽後付尾款、排隊與時程、修改、取消、工程檔、所有權、credit、保密、作品集許可與聯絡進度；用途可說明但不得改變報價。
- 複核頁可返回任一區段；送出成功前不清除草稿。
- Plan 04 Preview 只完成 prepare 驗證，不建立正式案件；Plan 05 接上實際同步後才回傳正式成功畫面。

---

## File Map

### Create

- migrations/0002_price_terms.sql
- app/lib/pricing/types.ts
- app/lib/pricing/calculate-quote.ts
- app/lib/pricing/post-quote-fees.ts
- app/lib/pricing/fx.ts
- app/lib/pricing/fx-repository.server.ts
- app/lib/pricing/price-repository.server.ts
- app/lib/commission/schema.ts
- app/lib/commission/draft.client.ts
- app/lib/commission/steps.ts
- app/lib/commission/prepare-submission.server.ts
- app/lib/integrations/turnstile.server.ts
- app/components/commission/commission-wizard.tsx
- app/components/commission/common-fields.tsx
- app/components/commission/mix-fields.tsx
- app/components/commission/simple-transition-fields.tsx
- app/components/commission/edit-transition-fields.tsx
- app/components/commission/terms-step.tsx
- app/components/commission/review-step.tsx
- app/components/commission/turnstile-widget.tsx
- app/components/commission/quote-summary.tsx
- app/routes/public/commission-category.tsx
- app/routes/public/commission-service.tsx
- app/routes/api/commission-prepare.ts
- app/styles/commission.css
- tests/unit/pricing.test.ts
- tests/unit/fx.test.ts
- tests/unit/commission-schema.test.ts
- tests/unit/draft-storage.test.ts
- tests/worker/price-repository.test.ts
- tests/worker/turnstile.test.ts
- tests/worker/commission-prepare.test.ts
- tests/e2e/commission-navigation.spec.ts
- tests/e2e/commission-review.spec.ts
- tests/e2e/commission-mobile.spec.ts

### Modify

- app/routes.ts
- workers/app.ts
- wrangler.base.jsonc
- scripts/render-wrangler-config.mjs
- app/styles/global.css

### Produced Interfaces

~~~ts
export interface PriceRule {
  versionId: string;
  serviceId: ServiceId;
  baseTwd: number;
  includedSongs: number;
  perSongAfterIncludedTwd: number;
  studentDiscountBps: 3000;
  rushBps: 5000;
  consultationBps: 5000;
  sourcePrepBps: 500;
}

export interface QuoteInput {
  serviceId: ServiceId;
  songCount?: number;
  rush: boolean;
  consultation: boolean;
  sourcePrep: boolean;
  studentRequested: boolean;
}

export interface QuoteBreakdown {
  serviceBaseTwd: number;
  rushTwd: number;
  consultationTwd: number;
  sourcePrepTwd: number;
  beforeStudentDiscountTwd: number;
  studentDiscountTwd: number;
  lockedInitialTwd: number;
  studentStatus: "not_requested" | "pending_proof";
}

export interface FxSnapshot {
  rateDate: string;
  rateScaled: number;
  scale: 100000000;
  source: "Frankfurter";
  fetchedAt: string;
}

export interface PreparedSubmission {
  normalizedDraft: CommissionDraft;
  quote: QuoteBreakdown;
  displayPrice: {
    locale: Locale;
    currency: "TWD" | "USD";
    minor: number;
  };
  fx: FxSnapshot | null;
  termVersionIds: string[];
  termsAcceptedAt: string;
}
~~~

---

### Task 1: Implement exact TWD pricing and post-quote fees

**Files:**
- Create: app/lib/pricing/types.ts
- Create: app/lib/pricing/calculate-quote.ts
- Create: app/lib/pricing/post-quote-fees.ts
- Create: tests/unit/pricing.test.ts
- Create: migrations/0002_price_terms.sql
- Create: app/lib/pricing/price-repository.server.ts
- Create: tests/worker/price-repository.test.ts

**Interfaces:**
- Consumes: ServiceId and D1 price_versions.
- Produces: calculateQuote(), calculatePostQuoteFee(), getActivePriceRule().

- [ ] **Step 1: Commit failing price boundary tests**

~~~ts
// tests/unit/pricing.test.ts
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
    expect(calculateQuote(rules.full_mix, {
      serviceId: "full_mix", rush: false, consultation: false,
      sourcePrep: false, studentRequested: false,
    }).lockedInitialTwd).toBe(8000);
    expect(calculateQuote(rules.vocal_mix, {
      serviceId: "vocal_mix", rush: false, consultation: false,
      sourcePrep: false, studentRequested: false,
    }).lockedInitialTwd).toBe(4000);
  });

  it("prices transition song 5 and 6 boundaries", () => {
    expect(calculateQuote(rules.simple_transition, {
      serviceId: "simple_transition", songCount: 5, rush: false,
      consultation: false, sourcePrep: false, studentRequested: false,
    }).serviceBaseTwd).toBe(1000);
    expect(calculateQuote(rules.simple_transition, {
      serviceId: "simple_transition", songCount: 6, rush: false,
      consultation: false, sourcePrep: false, studentRequested: false,
    }).serviceBaseTwd).toBe(1200);
    expect(calculateQuote(rules.edit_transition, {
      serviceId: "edit_transition", songCount: 6, rush: false,
      consultation: false, sourcePrep: false, studentRequested: false,
    }).serviceBaseTwd).toBe(4800);
  });

  it("calculates pre-submission fees from service base before student discount", () => {
    const quote = calculateQuote(rules.full_mix, {
      serviceId: "full_mix",
      rush: true,
      consultation: false,
      sourcePrep: true,
      studentRequested: true,
    });
    expect(quote.rushTwd).toBe(4000);
    expect(quote.sourcePrepTwd).toBe(400);
    expect(quote.beforeStudentDiscountTwd).toBe(12400);
    expect(quote.studentDiscountTwd).toBe(3720);
    expect(quote.lockedInitialTwd).toBe(8680);
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
});
~~~

- [ ] **Step 2: Run tests and verify failure**

~~~bash
npm run test:unit -- tests/unit/pricing.test.ts
~~~

Expected result: FAIL because pricing modules do not exist.

- [ ] **Step 3: Implement integer pricing**

~~~ts
// app/lib/pricing/calculate-quote.ts
import type {
  PriceRule,
  QuoteBreakdown,
  QuoteInput,
} from "./types";

const BASIS_POINTS = 10_000;

function applyBps(value: number, bps: number): number {
  return Math.round((value * bps) / BASIS_POINTS);
}

export function calculateQuote(
  rule: PriceRule,
  input: QuoteInput,
): QuoteBreakdown {
  if (rule.serviceId !== input.serviceId) {
    throw new Error("price_rule_service_mismatch");
  }

  const isTransition =
    input.serviceId === "simple_transition" ||
    input.serviceId === "edit_transition";

  if (isTransition && (!input.songCount || input.songCount < 1)) {
    throw new Error("song_count_required");
  }

  if (!isTransition && input.consultation) {
    throw new Error("consultation_not_available");
  }

  const additionalSongs = isTransition
    ? Math.max((input.songCount ?? 0) - rule.includedSongs, 0)
    : 0;
  const serviceBaseTwd =
    rule.baseTwd + additionalSongs * rule.perSongAfterIncludedTwd;
  const rushTwd = input.rush ? applyBps(serviceBaseTwd, rule.rushBps) : 0;
  const consultationTwd = input.consultation
    ? applyBps(serviceBaseTwd, rule.consultationBps)
    : 0;
  const sourcePrepTwd = input.sourcePrep
    ? applyBps(serviceBaseTwd, rule.sourcePrepBps)
    : 0;
  const beforeStudentDiscountTwd =
    serviceBaseTwd + rushTwd + consultationTwd + sourcePrepTwd;
  const studentDiscountTwd = input.studentRequested
    ? applyBps(beforeStudentDiscountTwd, rule.studentDiscountBps)
    : 0;

  return {
    serviceBaseTwd,
    rushTwd,
    consultationTwd,
    sourcePrepTwd,
    beforeStudentDiscountTwd,
    studentDiscountTwd,
    lockedInitialTwd:
      beforeStudentDiscountTwd - studentDiscountTwd,
    studentStatus: input.studentRequested
      ? "pending_proof"
      : "not_requested",
  };
}
~~~

~~~ts
// app/lib/pricing/post-quote-fees.ts
const FEE_BPS = {
  minor_revision: 1000,
  major_revision: 5000,
  project_file: 5000,
} as const;

export function calculatePostQuoteFee(
  lockedInitialTwd: number,
  kind: keyof typeof FEE_BPS,
): number {
  return Math.round((lockedInitialTwd * FEE_BPS[kind]) / 10_000);
}
~~~

- [ ] **Step 4: Seed immutable price versions and test repository selection**

~~~sql
-- migrations/0002_price_terms.sql
INSERT INTO price_versions (
  id, service_id, base_twd, per_song_after_five_twd,
  student_discount_bps, rush_bps, consultation_bps,
  source_prep_bps, effective_from
) VALUES
  ('full-2026-08-10', 'full_mix', 8000, 0, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z'),
  ('vocal-2026-08-10', 'vocal_mix', 4000, 0, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z'),
  ('simple-2026-08-10', 'simple_transition', 1000, 200, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z'),
  ('edit-2026-08-10', 'edit_transition', 4000, 800, 3000, 5000, 5000, 500, '2026-08-10T00:00:00Z');

INSERT INTO term_documents (id, kind, service_id) VALUES
  ('common', 'common', NULL),
  ('privacy', 'privacy', NULL),
  ('full-mix', 'service', 'full_mix'),
  ('vocal-mix', 'service', 'vocal_mix'),
  ('simple-transition', 'service', 'simple_transition'),
  ('edit-transition', 'service', 'edit_transition');
~~~

getActivePriceRule(db, serviceId, submittedAt) selects the newest effective_from <= submittedAt with retired_at null or later than submittedAt. The repository maps includedSongs to 5 only for transition services.

Run:

~~~bash
npm run test:unit -- tests/unit/pricing.test.ts
npm run test:worker -- tests/worker/price-repository.test.ts
~~~

Expected result: PASS.

- [ ] **Step 5: Commit**

Cloud commit message: feat: implement versioned commission pricing.

---

### Task 2: Add daily FX snapshots and exact USD cents conversion

**Files:**
- Create: app/lib/pricing/fx.ts
- Create: app/lib/pricing/fx-repository.server.ts
- Create: app/components/pricing/service-price.tsx
- Create: tests/unit/fx.test.ts
- Create: tests/e2e/service-currency.spec.ts
- Modify: app/components/services/service-choice.tsx
- Modify: app/components/services/service-overview.tsx
- Modify: workers/app.ts
- Modify: wrangler.base.jsonc
- Create: tests/worker/fx-repository.test.ts

**Interfaces:**
- Consumes: D1 fx_rates, Env.FX_API_URL.
- Produces: parseRateScaled(), convertTwdToUsdCents(), refreshFxRate(), getUsableFxSnapshot().

- [ ] **Step 1: Commit failing fixed-point tests**

~~~ts
// tests/unit/fx.test.ts
import { describe, expect, it } from "vitest";
import {
  businessDaysBetween,
  convertTwdToUsdCents,
  parseRateScaled,
} from "../../app/lib/pricing/fx";

describe("fixed-point FX", () => {
  it("converts NT$8,000 at 0.0325 to USD 260.00", () => {
    expect(parseRateScaled("0.0325")).toBe(3_250_000);
    expect(convertTwdToUsdCents(8000, 3_250_000)).toBe(26_000);
  });

  it("rounds to the nearest USD cent without binary floats", () => {
    expect(convertTwdToUsdCents(1000, 3_234_567)).toBe(3235);
  });

  it("counts weekdays only for staleness", () => {
    expect(businessDaysBetween("2026-08-07", "2026-08-10")).toBe(1);
    expect(businessDaysBetween("2026-08-03", "2026-08-07")).toBe(4);
  });
});
~~~

- [ ] **Step 2: Run tests and verify failure**

~~~bash
npm run test:unit -- tests/unit/fx.test.ts
~~~

Expected result: FAIL because fx.ts does not exist.

- [ ] **Step 3: Implement exact conversion**

~~~ts
// app/lib/pricing/fx.ts
const SCALE = 100_000_000n;

export function parseRateScaled(rate: string): number {
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new Error("invalid_fx_rate");
  const [whole, fraction = ""] = rate.split(".");
  const padded = (fraction + "00000000").slice(0, 8);
  const scaled = BigInt(whole) * SCALE + BigInt(padded);
  if (scaled <= 0n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("invalid_fx_rate");
  }
  return Number(scaled);
}

export function convertTwdToUsdCents(
  twd: number,
  rateScaled: number,
): number {
  if (!Number.isInteger(twd) || twd < 0) throw new Error("invalid_twd");
  const numerator = BigInt(twd) * BigInt(rateScaled) * 100n;
  return Number((numerator + SCALE / 2n) / SCALE);
}

export function businessDaysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let count = 0;
  for (
    let cursor = new Date(start.getTime() + 86_400_000);
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}
~~~

- [ ] **Step 4: Add scheduled refresh and stale-rate blocking**

refreshFxRate receives fetch as an injected dependency for tests. It calls Frankfurter, reads rates.USD, converts String(rates.USD) with parseRateScaled, and upserts by rate_date. getUsableFxSnapshot throws fx_rate_stale when businessDaysBetween(rateDate, submissionDate) > 3.

service-price.tsx receives locale、TWD minor amount 與 FxSnapshot：

- zh renders NT$ with integer grouping。
- en converts with convertTwdToUsdCents and renders US$ with two decimals。
- en labels the public value Estimated today; the exact rate is locked when the form is submitted。
- service-choice 與 service-overview loaders read the same usable FX snapshot，so every English public service price is USD rather than TWD。
- stale／missing FX does not silently show TWD on an English page；it shows a localized USD temporarily unavailable state and keeps the commission button disabled until the server can calculate a trusted USD quote。
- tests/e2e/service-currency.spec.ts visits /zh/mixing and /en/mixing，asserts Chinese shows NT$，English shows US$ and no NT$，then confirms the submission response stores the FX date、source、scaled rate and locked USD cents。

~~~ts
// workers/app.ts addition
export default {
  fetch(request, env, ctx) {
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(refreshFxRate(env.DB, env.FX_API_URL, fetch));
  },
} satisfies ExportedHandler<Env>;
~~~

~~~json
// wrangler.base.jsonc addition
"triggers": {
  "crons": ["15 1 * * *"]
}
~~~

Run:

~~~bash
npm run test:unit -- tests/unit/fx.test.ts
npm run test:worker -- tests/worker/fx-repository.test.ts
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/service-currency.spec.ts
~~~

Expected result: PASS, including upstream invalid JSON, missing USD, duplicate date, stale rate, TWD display and USD display cases.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add locked daily USD exchange rates.

---

### Task 3: Define complete service-specific form schemas and browser drafts

**Files:**
- Create: app/lib/commission/schema.ts
- Create: app/lib/commission/draft.client.ts
- Create: app/lib/commission/steps.ts
- Create: tests/unit/commission-schema.test.ts
- Create: tests/unit/draft-storage.test.ts

**Interfaces:**
- Consumes: ServiceId, Locale.
- Produces: CommissionDraftSchema, CommissionDraft, saveDraft(), loadDraft(), clearDraft().

- [ ] **Step 1: Commit failing schema tests**

~~~ts
// tests/unit/commission-schema.test.ts
import { describe, expect, it } from "vitest";
import { CommissionDraftSchema } from "../../app/lib/commission/schema";

const common = {
  displayName: "Artist K",
  email: "artist@example.com",
  contacts: [{ platform: "Discord", account: "artist-k" }],
  projectLinks: ["https://drive.google.com/file/d/example/view"],
  usagePurpose: "Dance performance",
  desiredDate: "",
  adultStatus: "adult",
  guardianAuthorized: false,
  studentRequested: false,
  studentProofUrl: "",
  creditAccountId: "instagram",
  portfolioConsent: false,
  rush: false,
  sourcePrep: false,
};

describe("commission schema", () => {
  it("accepts full mix fields and allows unknown BPM or key", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "full_mix",
      genre: "Pop",
      referenceUrls: ["https://youtu.be/example"],
      bpm: "unknown",
      key: "unknown",
      direction: "Clear vocal and wide instruments",
    });
    expect(result.success).toBe(true);
  });

  it("requires guardian authorization for a minor", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "vocal_mix",
      adultStatus: "minor",
      genre: "Pop",
      referenceUrls: ["https://youtu.be/example"],
      bpm: "120",
      key: "C major",
      direction: "Natural",
    });
    expect(result.success).toBe(false);
  });

  it("requires student proof only when requesting the discount", () => {
    const result = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "simple_transition",
      studentRequested: true,
      songs: [{ order: 1, url: "https://example.com/one.wav", transitionAt: "00:45" }],
      targetDuration: "03:00",
      seamless: true,
      transitionStyle: "Smooth",
      sequenceConfirmed: true,
      consultation: false,
    });
    expect(result.success).toBe(false);
  });

  it("requires the 50% consultation option when simple transition order or points are missing", () => {
    const withoutConsultation = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "simple_transition",
      songs: [{ order: 1, url: "https://example.com/one.wav", transitionAt: "" }],
      sequenceConfirmed: false,
      targetDuration: "03:00",
      seamless: true,
      transitionStyle: "Smooth",
      consultation: false,
    });
    expect(withoutConsultation.success).toBe(false);

    const withConsultation = CommissionDraftSchema.safeParse({
      ...common,
      serviceId: "simple_transition",
      songs: [{ order: 1, url: "https://example.com/one.wav", transitionAt: "" }],
      sequenceConfirmed: false,
      targetDuration: "03:00",
      seamless: true,
      transitionStyle: "Smooth",
      consultation: true,
    });
    expect(withConsultation.success).toBe(true);
  });

  it("does not contain birthday, legal name or file fields", () => {
    const keys = Object.keys(common);
    expect(keys).not.toContain("birthday");
    expect(keys).not.toContain("legalName");
    expect(keys).not.toContain("file");
  });
});
~~~

- [ ] **Step 2: Run tests and verify failure**

~~~bash
npm run test:unit -- tests/unit/commission-schema.test.ts
~~~

Expected result: FAIL because schema.ts does not exist.

- [ ] **Step 3: Implement discriminated schemas**

~~~ts
// app/lib/commission/schema.ts
import { z } from "zod";

const HttpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "https_required");

const Common = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  contacts: z
    .array(z.object({
      platform: z.string().trim().min(1).max(80),
      account: z.string().trim().min(1).max(200),
    }))
    .min(1)
    .max(10),
  projectLinks: z.array(HttpsUrl).min(1).max(50),
  usagePurpose: z.string().trim().min(1).max(2000),
  desiredDate: z.string().max(40),
  adultStatus: z.enum(["adult", "minor"]),
  guardianAuthorized: z.boolean(),
  studentRequested: z.boolean(),
  studentProofUrl: z.union([z.literal(""), HttpsUrl]),
  creditAccountId: z.string().trim().min(1).max(100),
  portfolioConsent: z.boolean(),
  rush: z.boolean(),
  sourcePrep: z.boolean(),
});

const MixFields = {
  genre: z.string().trim().min(1).max(200),
  referenceUrls: z.array(HttpsUrl).min(1).max(20),
  bpm: z.string().trim().min(1).max(40),
  key: z.string().trim().min(1).max(80),
  direction: z.string().trim().min(1).max(4000),
};

const FullMix = Common.extend({
  serviceId: z.literal("full_mix"),
  ...MixFields,
});

const VocalMix = Common.extend({
  serviceId: z.literal("vocal_mix"),
  ...MixFields,
});

const SimpleTransition = Common.extend({
  serviceId: z.literal("simple_transition"),
  songs: z.array(z.object({
    order: z.number().int().positive(),
    url: HttpsUrl,
    transitionAt: z.string().trim().max(40),
  })).min(1).max(100),
  sequenceConfirmed: z.boolean(),
  targetDuration: z.string().trim().min(1).max(40),
  seamless: z.boolean(),
  transitionStyle: z.string().trim().min(1).max(1000),
  consultation: z.boolean(),
});

const EditedTransition = Common.extend({
  serviceId: z.literal("edit_transition"),
  songs: z.array(z.object({
    order: z.number().int().positive(),
    url: HttpsUrl,
    segmentDuration: z.string().trim().min(1).max(40),
    transitionPoint: z.string().trim().min(1).max(40),
  })).min(1).max(100),
  targetDuration: z.string().trim().min(1).max(40),
  transitionStyle: z.string().trim().min(1).max(1000),
  referenceUrls: z.array(HttpsUrl).max(20),
  cuts: z.string().max(4000),
  reorderNotes: z.string().max(4000),
  tempoPitchNotes: z.string().max(4000),
  introOutroNotes: z.string().max(4000),
  effectNotes: z.string().max(4000),
});

export const CommissionDraftSchema = z
  .discriminatedUnion("serviceId", [
    FullMix,
    VocalMix,
    SimpleTransition,
    EditedTransition,
  ])
  .superRefine((draft, context) => {
    if (draft.adultStatus === "minor" && !draft.guardianAuthorized) {
      context.addIssue({
        code: "custom",
        path: ["guardianAuthorized"],
        message: "guardian_authorization_required",
      });
    }
    if (draft.studentRequested && !draft.studentProofUrl) {
      context.addIssue({
        code: "custom",
        path: ["studentProofUrl"],
        message: "student_proof_required",
      });
    }
    if (
      draft.serviceId === "simple_transition" &&
      (!draft.sequenceConfirmed ||
        draft.songs.some((song) => !song.transitionAt)) &&
      !draft.consultation
    ) {
      context.addIssue({
        code: "custom",
        path: ["consultation"],
        message: "consultation_required_without_sequence_and_points",
      });
    }
  });

export type CommissionDraft = z.infer<typeof CommissionDraftSchema>;
~~~

Simple transition 的歌曲順序由可拖曳清單及 order 欄位表示；若 sequenceConfirmed=false 或任何 transitionAt 為空，consultation 必須為 true，報價引擎才加收服務基價 50%。

- [ ] **Step 4: Implement local-only versioned draft storage**

~~~ts
// app/lib/commission/draft.client.ts
import {
  CommissionDraftSchema,
  type CommissionDraft,
} from "./schema";
import type { Locale } from "../i18n/locale";

const PREFIX = "kamel:commission:v1";

function key(locale: Locale, serviceId: CommissionDraft["serviceId"]) {
  return `${PREFIX}:${locale}:${serviceId}`;
}

export function saveDraft(locale: Locale, draft: CommissionDraft): void {
  const parsed = CommissionDraftSchema.parse(draft);
  localStorage.setItem(key(locale, parsed.serviceId), JSON.stringify(parsed));
}

export function loadDraft(
  locale: Locale,
  serviceId: CommissionDraft["serviceId"],
): CommissionDraft | null {
  const raw = localStorage.getItem(key(locale, serviceId));
  if (!raw) return null;
  const parsed = CommissionDraftSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    localStorage.removeItem(key(locale, serviceId));
    return null;
  }
  return parsed.data;
}

export function clearDraft(
  locale: Locale,
  serviceId: CommissionDraft["serviceId"],
): void {
  localStorage.removeItem(key(locale, serviceId));
}
~~~

Draft storage never receives Turnstile token, term acceptance time or generated case ID.

Run:

~~~bash
npm run test:unit -- tests/unit/commission-schema.test.ts tests/unit/draft-storage.test.ts
~~~

Expected result: PASS.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add service-specific commission drafts.

---

### Task 4: Build the category, form, terms and Review wizard

**Files:**
- Create: app/components/commission/commission-wizard.tsx
- Create: app/components/commission/common-fields.tsx
- Create: app/components/commission/mix-fields.tsx
- Create: app/components/commission/simple-transition-fields.tsx
- Create: app/components/commission/edit-transition-fields.tsx
- Create: app/components/commission/terms-step.tsx
- Create: app/components/commission/review-step.tsx
- Create: app/components/commission/quote-summary.tsx
- Create: app/routes/public/commission-category.tsx
- Create: app/routes/public/commission-service.tsx
- Create: app/styles/commission.css
- Create: tests/fixtures/term-publications.ts
- Create: tests/fixtures/term-publications.ts
- Create: tests/e2e/commission-navigation.spec.ts
- Create: tests/e2e/commission-review.spec.ts
- Create: tests/e2e/commission-mobile.spec.ts
- Modify: app/routes.ts

**Interfaces:**
- Consumes: CommissionDraft, QuoteBreakdown, active term versions.
- Produces: CommissionWizard steps service → details → terms → review → validation.

- [ ] **Step 1: Commit failing navigation and Review E2E**

~~~ts
// tests/e2e/commission-navigation.spec.ts
import { expect, test } from "@playwright/test";

test("commission selection never exposes four services together", async ({ page }) => {
  await page.goto("/zh/commission");
  await expect(page.getByRole("link", { name: "混音" })).toBeVisible();
  await expect(page.getByRole("link", { name: "歌曲銜接" })).toBeVisible();
  await expect(page.getByText("完整歌曲混音")).toHaveCount(0);

  await page.getByRole("link", { name: "混音" }).click();
  await expect(page).toHaveURL(/\/zh\/commission\/mixing$/);
  await expect(page.getByText("完整歌曲混音")).toBeVisible();
  await expect(page.getByText("Vocal 混音")).toBeVisible();
  await expect(page.getByText("單純歌曲銜接")).toHaveCount(0);
});
~~~

~~~ts
// tests/e2e/commission-review.spec.ts
test("full mix can be reviewed and edited before validation", async ({ page }) => {
  await page.goto("/en/commission/mixing/full");
  await page.getByLabel("Preferred name").fill("Artist K");
  await page.getByLabel("Email").fill("artist@example.com");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Contact platform").fill("Discord");
  await page.getByLabel("Contact account").fill("artist-k");
  await page.getByLabel("Project link").fill("https://drive.google.com/file/d/example/view");
  await page.getByLabel("Purpose").fill("Single release");
  await page.getByLabel("Genre").fill("Pop");
  await page.getByLabel("Reference link").fill("https://youtu.be/example");
  await page.getByLabel("BPM").fill("unknown");
  await page.getByLabel("Key").fill("unknown");
  await page.getByLabel("Direction").fill("Clear vocal");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText(/Bank transfer|銀行匯款/)).toBeVisible();
  await expect(page.getByText(/PayPal/)).toBeVisible();
  await expect(page.getByText(/first 5|前 5 次/)).toBeVisible();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Artist K")).toBeVisible();
  await expect(page.getByText("NT$8,000")).toBeVisible();

  await page.getByRole("button", { name: "Edit project details" }).click();
  await expect(page.getByLabel("Direction")).toHaveValue("Clear vocal");
});
~~~

- [ ] **Step 2: Run E2E and verify failure**

Expected: FAIL because nested commission routes and Wizard are absent.

- [ ] **Step 3: Register unambiguous nested routes and implement Wizard state**

~~~ts
route("commission", "routes/public/commission-index.tsx"),
route("commission/:category", "routes/public/commission-category.tsx"),
route(
  "commission/:category/:service",
  "routes/public/commission-service.tsx",
),
~~~

commission-category validates only mixing or song-transition and passes one category to ServiceChoice. commission-service accepts only:

- mixing/full → full_mix
- mixing/vocal → vocal_mix
- song-transition/simple → simple_transition
- song-transition/edit → edit_transition

All other pairs return 404.

CommissionWizard state:

~~~ts
type WizardStep = "details" | "terms" | "review" | "verify";

const ORDER: readonly WizardStep[] = [
  "details",
  "terms",
  "review",
  "verify",
];

function nextStep(current: WizardStep): WizardStep {
  return ORDER[Math.min(ORDER.indexOf(current) + 1, ORDER.length - 1)];
}

function previousStep(current: WizardStep): WizardStep {
  return ORDER[Math.max(ORDER.indexOf(current) - 1, 0)];
}
~~~

On each valid details change, debounce saveDraft by 300ms. On validation errors, focus the first invalid control and link error summary anchors to field IDs.

TermsStep receives full common, service-specific and privacy blocks plus immutable version IDs. The unified checkbox is not persisted to localStorage and resets whenever any version ID changes.

tests/fixtures/term-publications.ts 建立 zh／en 測試版本，內容直接依設計規格第 11–14 節，不作自動翻譯，並至少包含以下穩定 clause key：

- payment_methods：銀行匯款或 PayPal。
- deposit：確認委託後支付鎖定初始報價 50% 才開始。
- final_payment：確認預覽後支付尾款。
- minor_revisions：前 5 次小範圍修改免費，第 6 次起每次為鎖定初始報價 10%。
- major_revisions：第 1 次重大修改免費，第 2 次起每次為鎖定初始報價 50%，重大變更先告知。
- client_cancellation：中途取消不退訂金。
- provider_delay_completed：Kamel 因自身原因延遲但仍完成時，總價調整為原應付總額的 60%。
- provider_failure：Kamel 因自身原因確定無法完成時，退還訂金。
- client_inactivity：委託者連續 7 天未回覆、未提供素材或未付款時暫停，恢復後重新排隊。
- queue_and_timing：須排隊，預估工作日依服務，完工時間依實際情況調整。
- delivery_and_retention：正式成品交付後工程至少保存 7 日，不保證永久保存。
- project_file_purchase：正式交付後要求工程檔為鎖定初始報價 50%。
- ownership：甲方保有其人聲、原創歌曲、伴奏與分軌；Kamel 保有工程檔。
- confidentiality：作品發布前或甲方同意前保密。
- credit_and_portfolio：公開使用只需 credit；是否允許 Kamel 放入作品集由委託者選擇。
- progress_contact：甲方可用任何有效聯絡方式詢問進度。
- purpose_no_price_effect：說明用途不影響報價。

每個 service fixture 另有完整欄位與義務：

- full_mix：不限軌、完整混音與母帶、Vocal 完整編輯／修音；交付 24-bit / 48 kHz WAV Final Master、Vocal Stem、Instrumental Mix Stem；預估 7–14 工作日。
- vocal_mix：不限軌、和音編輯、修音、對拍、效果設計、與既有伴奏融合及混音／母帶；同樣交付三種 24-bit / 48 kHz WAV；預估 5–7 工作日。
- mixing_source：提交乾／原始未處理檔案，盡可能使用 24-bit / 48 kHz WAV 並正確命名；其他格式造成的音質下降由委託者承擔；未整理素材可退回，或經同意後加收服務基價 5%。
- simple_transition：1–5 首 NT$1,000，第 6 首起每首 NT$200；只做銜接與必要效果，不做結構編輯；順序與銜接時間點必填，若需要 Kamel 協助決策，加收服務基價 50% 諮詢費；目標總長度、是否無縫、銜接風格必填；預估 3–5 工作日。
- edit_transition：1–5 首 NT$4,000，第 6 首起每首 NT$800；包含刪減、重排、速度／音高、音效、延長開頭／結尾、混音平衡與重新母帶；時長、銜接點、總長度、風格必填，參考連結選填；預估 7–14 工作日。
- transition_delivery：來源需盡可能高音質；因來源品質造成的損失由委託者承擔；交付 24-bit / 48 kHz WAV、MP3、AAC。
- schedule_adjustment：所有完工日會依實際排程與素材狀態調整；急件需先協議並加收服務基價 50%。

這個 fixture 只供 Preview／E2E；Production 不自動發布法律文字。Kamel 必須在 Plan 06 後台輸入或審閱同內容，通過法務 gate 後自行發布。

ReviewStep displays every entered field, selected options, price components, term version labels and separate Edit buttons. It does not hide project links or student proof from the submitting client.

- [ ] **Step 4: Implement responsive push motion and run E2E**

~~~css
.commission-step {
  animation: commission-enter var(--motion-normal) ease both;
}

@keyframes commission-enter {
  from {
    opacity: 0;
    transform: translateX(1rem) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.commission-actions {
  position: sticky;
  inset-block-end: 0;
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--color-mineral) 94%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .commission-step {
    animation: none;
  }
}
~~~

Run:

~~~bash
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/commission-navigation.spec.ts tests/e2e/commission-review.spec.ts tests/e2e/commission-mobile.spec.ts
~~~

Expected:

- No screen expands four services.
- Mobile 390 px has no horizontal overflow.
- Back／Edit preserves fields.
- Refresh restores the local draft.
- Clearing draft removes only the current locale and service draft.
- Terms must be checked again after refresh.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add reviewable commission wizard.

---

### Task 5: Validate Turnstile and prepare a server-trusted submission envelope

**Files:**
- Create: app/lib/integrations/turnstile.server.ts
- Create: app/lib/commission/prepare-submission.server.ts
- Create: app/components/commission/turnstile-widget.tsx
- Create: app/routes/api/commission-prepare.ts
- Create: tests/worker/turnstile.test.ts
- Create: tests/worker/commission-prepare.test.ts
- Modify: app/routes.ts
- Modify: scripts/render-wrangler-config.mjs

**Interfaces:**
- Consumes: CommissionDraftSchema, PriceRule, FxSnapshot, term publications.
- Produces: verifyTurnstile(), prepareSubmission(), POST /api/commission/prepare.

- [ ] **Step 1: Commit failing server-trust tests**

~~~ts
// tests/worker/commission-prepare.test.ts
it("ignores client totals and recomputes the locked quote", async () => {
  const result = await prepareSubmission({
    db: env.DB,
    locale: "zh",
    rawDraft: validFullMixDraft,
    clientClaimedTotal: 1,
    termVersionIds: activeTermIds,
    termsAccepted: true,
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    turnstileSecret: "1x0000000000000000000000000000000AA",
    requestIp: "203.0.113.10",
    now: "2026-08-10T12:00:00Z",
    fetcher: fetch,
  });
  expect(result.quote.lockedInitialTwd).toBe(8000);
});

it("rejects stale English FX before calling the submission gateway", async () => {
  await expect(prepareSubmission(staleEnglishInput)).rejects.toThrow(
    "fx_rate_stale",
  );
});

it("rejects a term version that is no longer the active publication", async () => {
  await expect(prepareSubmission(oldTermsInput)).rejects.toThrow(
    "term_version_mismatch",
  );
});
~~~

- [ ] **Step 2: Run Worker tests and verify failure**

~~~bash
npm run test:worker -- tests/worker/turnstile.test.ts tests/worker/commission-prepare.test.ts
~~~

Expected result: FAIL because integration modules do not exist.

- [ ] **Step 3: Implement server-side Turnstile verification**

~~~ts
// app/lib/integrations/turnstile.server.ts
interface TurnstileResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(input: {
  token: string;
  secret: string;
  remoteIp: string | null;
  allowedHostnames: ReadonlySet<string>;
  expectedAction: string;
  fetcher: typeof fetch;
}): Promise<void> {
  const response = await input.fetcher(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: input.secret,
        response: input.token,
        remoteip: input.remoteIp,
        idempotency_key: crypto.randomUUID(),
      }),
    },
  );

  if (!response.ok) throw new Error("turnstile_unavailable");
  const result = (await response.json()) as TurnstileResponse;
  if (!result.success) {
    const duplicate = result["error-codes"]?.includes("timeout-or-duplicate");
    throw new Error(duplicate ? "turnstile_expired" : "turnstile_failed");
  }

  if (!result.hostname || !input.allowedHostnames.has(result.hostname)) {
    throw new Error("turnstile_hostname_mismatch");
  }
  if (result.action !== input.expectedAction) {
    throw new Error("turnstile_action_mismatch");
  }
}
~~~

Preview keys:

- Sitekey: 1x00000000000000000000AA
- Secret: 1x0000000000000000000000000000000AA

Production workflow must reject these exact values.

The official dummy validation response reports hostname localhost and action test, so Preview passes allowedHostnames = new Set(["localhost"]) and expectedAction = "test". Production passes only new Set(["kamelkyp.com"]) and expectedAction = "commission-submit". There is no workers.dev suffix bypass. tests/worker/turnstile.test.ts must reject a missing hostname, an unlisted hostname and a wrong action even when success is true.

- [ ] **Step 4: Implement prepare endpoint without storing the full form**

prepareSubmission sequence:

1. Parse CommissionDraftSchema.
2. Validate active common, service and privacy version IDs.
3. Load active PriceRule at now.
4. Recompute QuoteBreakdown.
5. For en, load usable FX and compute USD cents.
6. Verify Turnstile.
7. Return PreparedSubmission in Worker memory.
8. Do not INSERT any draft or form value into D1.
9. Log only error code, serviceId and Cloudflare Ray ID.

POST /api/commission/prepare uses SUBMISSION_RATE_LIMITER with a one-way SHA-256 digest of CF-Connecting-IP as the Rate Limit key. Response:

~~~ts
type PrepareResponse =
  | { ok: true; data: { readyToSubmit: true; quote: QuoteBreakdown; displayMinor: number; currency: "TWD" | "USD" } }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };
~~~

The Preview UI labels this result as validation complete and keeps the draft. Plan 05 replaces the final action with the real submit gateway; no Production deploy occurs before then.

- [ ] **Step 5: Run security, form and E2E checks, then commit**

~~~bash
npm run test:unit -- tests/unit/pricing.test.ts tests/unit/fx.test.ts tests/unit/commission-schema.test.ts tests/unit/draft-storage.test.ts
npm run test:worker -- tests/worker/price-repository.test.ts tests/worker/fx-repository.test.ts tests/worker/turnstile.test.ts tests/worker/commission-prepare.test.ts
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/commission-navigation.spec.ts tests/e2e/commission-review.spec.ts tests/e2e/commission-mobile.spec.ts
~~~

Expected:

- Client total 1 is ignored and correct quote returned.
- Failed or duplicate Turnstile preserves draft.
- English stale FX blocks prepare; Chinese remains available.
- No D1 row contains email, contact, project URL, student proof or form JSON.
- No full form value appears in Worker logs.

Cloud commit message: feat: validate commission envelopes with Turnstile.

Create PR codex/04-commission-flow → main. Attach quote test output for all boundary cases and Preview links for all four service flows. Merge only after pricing and privacy review.
