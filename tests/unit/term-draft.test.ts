import { describe, expect, it } from "vitest";
import {
  diffClauses,
  parseDraftClauses,
  TermDraftSchema,
  type TermPublishContext,
  validateTermClausesForPublish,
} from "../../app/lib/cms/schemas/term-draft";
import {
  TERM_DOCUMENT_IDS,
  TERM_OUTLINE,
} from "../../app/lib/commission/term-outline";
import { parseTermClauses } from "../../app/lib/commission/terms-repository.server";
import { describeActiveAmounts } from "../../app/lib/pricing/sample-quotes";

const clause = (key: string, title = `Title ${key}`, text = `Text ${key}`) => ({
  key,
  title,
  text,
});

const NO_CONTEXT: TermPublishContext = {
  live: null,
  expected: [],
  activePrice: null,
  baseOutdated: null,
};

function codes(issues: { code: string; severity: string }[]) {
  return issues.map((issue) => `${issue.severity}:${issue.code}`);
}

describe("term outline", () => {
  it("lists the six documents and the expected clause keys", () => {
    expect(TERM_DOCUMENT_IDS).toEqual([
      "common",
      "privacy",
      "full-mix",
      "vocal-mix",
      "simple-transition",
      "edit-transition",
    ]);
    expect(TERM_OUTLINE.common.map((item) => item.key)).toContain(
      "payment_methods",
    );
    expect(TERM_OUTLINE.common).toHaveLength(17);
    expect(TERM_OUTLINE["full-mix"].map((item) => item.key)).toEqual([
      "full_mix",
      "mixing_source",
    ]);
    expect(TERM_OUTLINE["edit-transition"].map((item) => item.key)).toEqual([
      "edit_transition",
      "transition_delivery",
      "schedule_adjustment",
    ]);
    expect(TERM_OUTLINE.privacy).toEqual([]);
    for (const items of Object.values(TERM_OUTLINE)) {
      for (const item of items) expect(item.topic).not.toMatch(/\d/);
    }
  });
});

describe("term draft schema (save)", () => {
  it("accepts empty rows and no clauses", () => {
    expect(TermDraftSchema.safeParse([]).success).toBe(true);
    expect(
      TermDraftSchema.safeParse([{ key: "", title: "", text: "" }]).success,
    ).toBe(true);
    expect(
      TermDraftSchema.safeParse([{ key: "deposit", title: "", text: "x" }])
        .success,
    ).toBe(true);
  });

  it("refuses structural problems", () => {
    expect(
      TermDraftSchema.safeParse(
        Array.from({ length: 101 }, (_, index) => clause(`k${index}`)),
      ).success,
    ).toBe(false);
    expect(
      TermDraftSchema.safeParse([clause("deposit", "t", "x".repeat(8001))])
        .success,
    ).toBe(false);
    for (const key of ["Deposit", "dep osit", "deposit_", "-deposit", "a__b"]) {
      expect(TermDraftSchema.safeParse([clause(key)]).success, key).toBe(false);
    }
  });

  it("drops rows whose three fields are empty and reports issues by field", () => {
    const parsed = parseDraftClauses([
      { key: " deposit ", title: " Deposit ", text: "Pay." },
      { key: "", title: "", text: "" },
      { key: "final", title: "", text: "" },
    ]);
    expect(parsed).toEqual({
      ok: true,
      clauses: [
        { key: "deposit", title: "Deposit", text: "Pay." },
        { key: "final", title: "", text: "" },
      ],
    });
    const invalid = parseDraftClauses([clause("Bad Key")]);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues[0]).toMatchObject({
        field: "clauses.0.key",
        code: "invalid_value",
        severity: "error",
      });
    }
  });
});

describe("term publish validation", () => {
  it("blocks empty, duplicate, unchanged and malformed drafts", () => {
    expect(codes(validateTermClausesForPublish([], NO_CONTEXT))).toEqual([
      "error:required",
    ]);
    const blank = validateTermClausesForPublish(
      [{ key: "", title: "", text: "" }],
      NO_CONTEXT,
    );
    expect(blank.map((issue) => issue.field)).toEqual([
      "clauses.0.key",
      "clauses.0.title",
      "clauses.0.text",
    ]);
    const duplicate = validateTermClausesForPublish(
      [clause("deposit"), clause("deposit")],
      NO_CONTEXT,
    );
    expect(codes(duplicate)).toEqual(["error:duplicate_key"]);
    expect(duplicate[0]?.field).toBe("clauses.1.key");
    const live = [clause("deposit")];
    expect(
      codes(validateTermClausesForPublish(live, { ...NO_CONTEXT, live })),
    ).toEqual(["error:unchanged"]);
    expect(
      validateTermClausesForPublish([clause("deposit", "New title")], {
        ...NO_CONTEXT,
        live,
      }),
    ).toEqual([]);
    const huge = Array.from({ length: 100 }, (_, index) =>
      clause(`k${index}`, "t", "字".repeat(4000)),
    );
    expect(codes(validateTermClausesForPublish(huge, NO_CONTEXT))).toContain(
      "error:too_long",
    );
  });

  it("warns about missing expected clauses (common and service, none for privacy)", () => {
    const common = validateTermClausesForPublish([clause("payment_methods")], {
      ...NO_CONTEXT,
      expected: TERM_OUTLINE.common,
    });
    expect(common.every((issue) => issue.severity === "warning")).toBe(true);
    expect(
      common.filter((issue) => issue.code === "expected_clause"),
    ).toHaveLength(16);
    const service = validateTermClausesForPublish([clause("full_mix")], {
      ...NO_CONTEXT,
      expected: TERM_OUTLINE["full-mix"],
    });
    expect(codes(service)).toEqual(["warning:expected_clause"]);
    expect(service[0]?.message).toContain("mixing_source");
    expect(
      validateTermClausesForPublish([clause("privacy_processing")], {
        ...NO_CONTEXT,
        expected: TERM_OUTLINE.privacy,
      }),
    ).toEqual([]);
  });

  it("warns about NT$ amounts that are not in the service's active rule", () => {
    const fullMix = describeActiveAmounts("Full Song Mixing", "full_mix", {
      baseTwd: 8000,
      perSongAfterFiveTwd: 0,
      studentDiscountBps: 3000,
      rushBps: 5000,
      consultationBps: 5000,
      sourcePrepBps: 500,
    });
    const ok = validateTermClausesForPublish(
      [clause("full_mix", "Full", "NT$8,000 base.")],
      { ...NO_CONTEXT, activePrice: fullMix },
    );
    expect(ok).toEqual([]);
    const stale = validateTermClausesForPublish(
      [clause("full_mix", "Full", "NT$9,000 base.")],
      { ...NO_CONTEXT, activePrice: fullMix },
    );
    expect(codes(stale)).toEqual(["warning:price_mention"]);
    expect(stale[0]?.message).toBe(
      "Mentions NT$9,000; the active Full Song Mixing base price is NT$8,000.",
    );
    expect(stale[0]?.message).not.toContain("per song");

    const simple = describeActiveAmounts(
      "Simple Song Transition",
      "simple_transition",
      {
        baseTwd: 1000,
        perSongAfterFiveTwd: 200,
        studentDiscountBps: 3000,
        rushBps: 5000,
        consultationBps: 5000,
        sourcePrepBps: 500,
      },
    );
    const transition = validateTermClausesForPublish(
      [clause("simple_transition", "Simple", "NT$1,000 then NT$300 each.")],
      { ...NO_CONTEXT, activePrice: simple },
    );
    expect(transition[0]?.message).toBe(
      "Mentions NT$300; the active Simple Song Transition price is base NT$1,000, NT$200 per song after the 5th.",
    );
  });

  it("warns when the draft started from an older live version", () => {
    const issues = validateTermClausesForPublish([clause("deposit")], {
      ...NO_CONTEXT,
      baseOutdated: { baseVersionNumber: 2, liveVersionNumber: 3 },
    });
    expect(codes(issues)).toEqual(["warning:base_outdated"]);
    expect(issues[0]?.message).toBe(
      "This draft started from v2; v3 has been published since. Compare before publishing.",
    );
  });

  it("keeps parity with the stored-version parser", () => {
    const valid = [clause("deposit", "Deposit", "Pay 50%.")];
    expect(validateTermClausesForPublish(valid, NO_CONTEXT)).toEqual([]);
    expect(parseTermClauses(valid)).toEqual(valid);

    const overLimit = [
      [clause("a".repeat(101))],
      [clause("deposit", "t".repeat(201))],
      [clause("deposit", "t", "x".repeat(8001))],
      Array.from({ length: 101 }, (_, index) => clause(`k${index}`)),
    ];
    for (const clauses of overLimit) {
      expect(TermDraftSchema.safeParse(clauses).success).toBe(false);
      expect(
        validateTermClausesForPublish(clauses, NO_CONTEXT).some(
          (issue) => issue.severity === "error",
        ),
      ).toBe(true);
      expect(() => parseTermClauses(clauses)).toThrow();
    }
  });
});

describe("clause diff", () => {
  it("compares by key", () => {
    expect(
      diffClauses(
        [clause("a"), clause("b"), clause("c")],
        [clause("a"), clause("b", "Changed"), clause("d")],
      ),
    ).toEqual({ added: ["d"], removed: ["c"], changed: ["b"], unchanged: 1 });
    expect(diffClauses(null, [clause("a")])).toEqual({
      added: ["a"],
      removed: [],
      changed: [],
      unchanged: 0,
    });
  });
});
