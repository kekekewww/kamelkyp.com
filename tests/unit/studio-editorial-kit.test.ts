import { describe, expect, it } from "vitest";
import {
  countIssuesBySection,
  groupByYear,
  issueFieldError,
  mergeIssues,
  relativeTime,
  tieGroups,
} from "../../app/components/studio/recognition/kit/editorial";
import type { ValidationIssue } from "../../app/lib/cms/types";

const now = new Date("2026-09-24T12:00:00Z");

function issue(
  field: string,
  code: ValidationIssue["code"],
  severity: ValidationIssue["severity"] = "error",
  locale?: "zh" | "en",
): ValidationIssue {
  return {
    field,
    code,
    severity,
    message: `${field} ${code}`,
    ...(locale ? { locale } : {}),
  };
}

describe("relative time", () => {
  it.each([
    ["2026-09-24T11:59:40Z", "just now"],
    ["2026-09-24T11:55:00Z", "5 min ago"],
    ["2026-09-24T09:00:00Z", "3 h ago"],
    ["2026-09-22T12:00:00Z", "2 d ago"],
    ["2026-08-01T12:00:00Z", "2026-08-01"],
    ["not a date", ""],
  ])("describes %s as %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});

describe("list grouping", () => {
  const rows = [
    { id: "a", year: 2026, date: "2026-05-01" },
    { id: "b", year: 2026, date: null },
    { id: "c", year: 2026, date: null },
    { id: "d", year: 2025, date: null },
    { id: "e", year: null, date: null },
  ];

  it("groups consecutive rows by year, keeping order", () => {
    expect(
      groupByYear(rows, (row) => row.year).map((group) => [
        group.year,
        group.rows.map((row) => row.id),
      ]),
    ).toEqual([
      [2026, ["a", "b", "c"]],
      [2025, ["d"]],
      [null, ["e"]],
    ]);
  });

  it("finds the rows whose manual order decides their position", () => {
    const groups = tieGroups(rows, (row) => `${row.year}|${row.date}`);
    expect(groups.map((group) => group.map((row) => row.id))).toEqual([
      ["a"],
      ["b", "c"],
      ["d"],
      ["e"],
    ]);
  });
});

describe("issues", () => {
  it("keeps client model issues and adds server-only context issues", () => {
    const client = [issue("event", "required_locale", "error", "en")];
    const server = [
      issue("event", "required_locale", "error", "zh"),
      issue("imageId", "alt_required", "error", "en"),
      issue("slug", "slug_taken"),
      issue("todoContent", "todo_content"),
      issue("title", "brand_name"),
    ];
    const merged = mergeIssues(client, server);
    expect(merged.map((item) => `${item.field}:${item.code}`)).toEqual([
      "event:required_locale",
      "imageId:alt_required",
      "slug:slug_taken",
      "todoContent:todo_content",
      "title:brand_name",
    ]);
    expect(merged[0]?.locale).toBe("en");
  });

  it("counts blocking issues per editor section", () => {
    const sectionOf = (field: string) =>
      field.startsWith("content") ? "content" : "basic";
    expect(
      countIssuesBySection(
        [
          issue("title", "required_locale", "error", "zh"),
          issue("title", "required_locale", "error", "en"),
          issue("content", "required_locale", "error", "en"),
          issue("excerpt", "one_locale_only", "warning", "en"),
        ],
        sectionOf,
      ),
    ).toEqual({ basic: 2, content: 1 });
  });

  it("finds the message for one field and locale", () => {
    const issues = [
      issue("event", "required_locale", "error", "en"),
      issue("year", "required"),
      issue("url", "invalid_url", "warning"),
    ];
    expect(issueFieldError(issues, "event", "en")).toBe(
      "event required_locale",
    );
    expect(issueFieldError(issues, "event", "zh")).toBeUndefined();
    expect(issueFieldError(issues, "year")).toBe("year required");
    expect(issueFieldError(issues, "url")).toBeUndefined();
  });
});
