/**
 * Studio Commissions inbox: pure helpers and input schemas (wp1 §4.3, §4.5).
 * Prices are only displayed, never computed: the strict NT$ / US$ strings
 * below are the public formats of `service-price.tsx`.
 */
import { describe, expect, it } from "vitest";
import {
  caseMarkers,
  cleanupLabel,
  formatCaseDate,
  formatCaseMoney,
  formatShortDate,
  serviceName,
} from "../../app/components/studio/commissions/format";
import { createCaseId } from "../../app/lib/cases/case-id";
import {
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  CaseIdSchema,
  CleanupInputSchema,
  commissionQueryHref,
  parseCommissionQuery,
  TERMINAL_CASE_STATUSES,
} from "../../app/lib/cms/schemas/commission";
import coreMigration from "../../migrations/0001_core.sql?raw";

describe("formatCaseMoney", () => {
  it("prints whole NT$ with thousands separators", () => {
    expect(formatCaseMoney(8000, "TWD")).toBe("NT$8,000");
    expect(formatCaseMoney(5600, "TWD")).toBe("NT$5,600");
    expect(formatCaseMoney(1000, "TWD")).toBe("NT$1,000");
  });

  it("prints USD cents as dollars with two decimals", () => {
    expect(formatCaseMoney(26000, "USD")).toBe("US$260.00");
    expect(formatCaseMoney(18200, "USD")).toBe("US$182.00");
  });
});

describe("case statuses", () => {
  it("match the cases.status CHECK list and keep the legacy order", () => {
    const table = coreMigration.slice(
      coreMigration.indexOf("CREATE TABLE IF NOT EXISTS cases"),
    );
    const start = table.indexOf("status IN (");
    const check = table.slice(start, table.indexOf(")", start));
    const fromMigration = [...check.matchAll(/'([a-z_]+)'/g)].map(
      (match) => match[1],
    );
    expect(fromMigration).toHaveLength(8);
    expect(new Set(CASE_STATUSES)).toEqual(new Set(fromMigration));
    expect(CASE_STATUSES).toEqual([
      "pending_review",
      "pending_deposit",
      "in_production",
      "preview_approval",
      "pending_balance",
      "paused",
      "delivered",
      "cancelled",
    ]);
  });

  it("has a label for every status", () => {
    for (const status of CASE_STATUSES) {
      expect(CASE_STATUS_LABELS[status]).toMatch(/\S/);
    }
    expect(CASE_STATUS_LABELS.pending_deposit).toBe("Awaiting deposit");
    expect(CASE_STATUS_LABELS.pending_balance).toBe("Awaiting balance");
  });

  it("treats paused, delivered and cancelled as terminal", () => {
    expect([...TERMINAL_CASE_STATUSES].sort()).toEqual([
      "cancelled",
      "delivered",
      "paused",
    ]);
  });
});

describe("CaseIdSchema", () => {
  it("accepts generated case IDs", () => {
    const id = createCaseId(
      new Date("2026-10-01T03:00:00Z"),
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );
    expect(CaseIdSchema.safeParse(id).success).toBe(true);
    expect(CaseIdSchema.safeParse("KAM-20261001-E2E0000001").success).toBe(
      true,
    );
  });

  it.each([
    "KAM-1",
    "kam-20261001-ABCDEFGHJK",
    "KAM-20261001-abcdefghjk",
    "KAM-20261001-ABCDEFGHJI",
    "KAM-20261001-ABCDEFGHJL",
    "KAM-20261001-ABCDEFGHJO",
    "KAM-20261001-ABCDEFGHJU",
    "KAM-2026101-ABCDEFGHJK",
    " KAM-20261001-ABCDEFGHJK",
  ])("rejects %s", (value) => {
    expect(CaseIdSchema.safeParse(value).success).toBe(false);
  });
});

describe("commission query", () => {
  const params = (value: string) => new URLSearchParams(value);

  it("keeps a valid status, service and cursor", () => {
    expect(
      parseCommissionQuery(
        params("status=delivered&service=vocal_mix&cursor=abc.def"),
      ),
    ).toEqual({ status: "delivered", service: "vocal_mix", cursor: "abc.def" });
  });

  it("ignores unknown statuses and services and empty values", () => {
    expect(parseCommissionQuery(params("status=accepted&service=x"))).toEqual({
      status: null,
      service: null,
      cursor: null,
    });
    expect(parseCommissionQuery(params("status=&service=&cursor="))).toEqual({
      status: null,
      service: null,
      cursor: null,
    });
  });

  it("drops an oversized cursor", () => {
    expect(
      parseCommissionQuery(params(`cursor=${"a".repeat(513)}`)).cursor,
    ).toBeNull();
    expect(
      parseCommissionQuery(params(`cursor=${"a".repeat(512)}`)).cursor,
    ).toHaveLength(512);
  });

  it("builds hrefs that round-trip and omit empty values", () => {
    expect(commissionQueryHref({})).toBe("/studio/commissions");
    expect(commissionQueryHref({ status: null, service: null })).toBe(
      "/studio/commissions",
    );
    const query = {
      status: "pending_review",
      service: "full_mix",
      cursor: "a-b_c.d",
    } as const;
    const href = commissionQueryHref(query);
    expect(href).toBe(
      "/studio/commissions?status=pending_review&service=full_mix&cursor=a-b_c.d",
    );
    expect(
      parseCommissionQuery(new URL(href, "https://studio.test").searchParams),
    ).toEqual(query);
  });
});

describe("CleanupInputSchema", () => {
  const complete = {
    caseId: "KAM-20261001-E2E0000004",
    googleRecordsDeleted: "on",
    gmailDeleted: "on",
    otherSensitiveCopiesDeleted: "on",
  };

  it("accepts all three confirmations", () => {
    expect(CleanupInputSchema.safeParse(complete).success).toBe(true);
  });

  it.each([
    "googleRecordsDeleted",
    "gmailDeleted",
    "otherSensitiveCopiesDeleted",
  ] as const)("fails without %s", (field) => {
    const rest: Record<string, string> = { ...complete };
    delete rest[field];
    expect(CleanupInputSchema.safeParse(rest).success).toBe(false);
    expect(
      CleanupInputSchema.safeParse({ ...complete, [field]: "true" }).success,
    ).toBe(false);
  });
});

describe("dates and markers", () => {
  const now = "2026-10-13T10:00:00.000Z";

  it("prints the UTC submission date and a short day-month", () => {
    expect(formatCaseDate("2026-10-01T23:30:00.000Z")).toBe("2026-10-01");
    expect(formatShortDate("2026-10-20T10:00:00.000Z")).toBe("20 Oct");
    expect(formatShortDate("2026-09-08T00:00:00.000Z")).toBe("8 Sep");
  });

  it("labels cleanups as due or scheduled", () => {
    expect(cleanupLabel("2026-10-08T00:00:00.000Z", now)).toBe("CLEANUP DUE");
    expect(cleanupLabel(now, now)).toBe("CLEANUP DUE");
    expect(cleanupLabel("2026-10-20T10:00:00.000Z", now)).toBe(
      "CLEANUP 20 Oct",
    );
  });

  it("derives the row markers", () => {
    const row = {
      studentReviewPending: false,
      cleanupDueAt: null,
      temporaryRecords: "kept" as const,
    };
    expect(caseMarkers(row, now)).toEqual([]);
    expect(caseMarkers({ ...row, studentReviewPending: true }, now)).toEqual([
      { kind: "student", label: "STUDENT PRICE" },
    ]);
    expect(
      caseMarkers({ ...row, cleanupDueAt: "2026-10-08T00:00:00.000Z" }, now),
    ).toEqual([{ kind: "cleanup-due", label: "CLEANUP DUE" }]);
    expect(
      caseMarkers({ ...row, cleanupDueAt: "2026-10-20T10:00:00.000Z" }, now),
    ).toEqual([{ kind: "cleanup-scheduled", label: "CLEANUP 20 Oct" }]);
    expect(caseMarkers({ ...row, temporaryRecords: "removed" }, now)).toEqual([
      { kind: "cleaned", label: "CLEANED" },
    ]);
  });
});

describe("serviceName", () => {
  const services = [
    {
      id: "full_mix" as const,
      name: { zh: "完整歌曲混音", en: "Full Song Mixing" },
    },
    { id: "vocal_mix" as const, name: { zh: "", en: "" } },
    { id: "simple_transition" as const, name: { zh: "銜接", en: "銜接" } },
  ];

  it("returns zh with a different EN secondary", () => {
    expect(serviceName(services, "full_mix")).toEqual({
      primary: "完整歌曲混音",
      primaryLang: "zh-Hant",
      secondary: "Full Song Mixing",
    });
  });

  it("drops an identical EN name and falls back to the id", () => {
    expect(serviceName(services, "simple_transition")).toEqual({
      primary: "銜接",
      primaryLang: "zh-Hant",
      secondary: null,
    });
    expect(serviceName(services, "vocal_mix")).toEqual({
      primary: "vocal_mix",
      primaryLang: "en",
      secondary: null,
    });
    expect(serviceName(services, "edit_transition").primary).toBe(
      "edit_transition",
    );
  });
});
