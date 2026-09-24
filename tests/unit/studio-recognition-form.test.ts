import { describe, expect, it } from "vitest";
import {
  RECOGNITION_SECTIONS,
  recognitionIssues,
  recognitionSectionOf,
  recognitionTieKey,
  yearFromDate,
} from "../../app/components/studio/recognition/recognition-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

describe("recognition form (client checklist)", () => {
  it("lists year, type and both event locales as blocking", () => {
    const issues = recognitionIssues(form({ "event.zh": "展覽" }));
    expect(
      issues
        .filter((issue) => issue.severity === "error")
        .map(
          (issue) => `${issue.field}${issue.locale ? `.${issue.locale}` : ""}`,
        )
        .sort(),
    ).toEqual(["event.en", "typeTermId", "year"]);
  });

  it("is ready when year, type and event are filled", () => {
    const issues = recognitionIssues(
      form({
        "event.zh": "展覽",
        "event.en": "Exhibition",
        "year:number": "2026",
        typeTermId: "term-recognition_type-event",
        "organization.zh": "美術館",
      }),
    );
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(issues).toEqual([
      expect.objectContaining({
        field: "organization",
        code: "one_locale_only",
        severity: "warning",
      }),
    ]);
  });

  it("reports an out-of-range year as a structural problem", () => {
    expect(recognitionIssues(form({ "year:number": "1800" }))).toEqual([
      expect.objectContaining({ field: "year", severity: "error" }),
    ]);
  });

  it("maps fields to sections and rows to sort ties", () => {
    expect(RECOGNITION_SECTIONS.map((section) => section.id)).toEqual([
      "basic",
      "details",
      "publication",
    ]);
    expect(recognitionSectionOf("event")).toBe("basic");
    expect(recognitionSectionOf("typeTermId")).toBe("basic");
    expect(recognitionSectionOf("imageId")).toBe("details");
    expect(recognitionSectionOf("url")).toBe("details");
    expect(recognitionSectionOf("todoContent")).toBe("publication");
    expect(recognitionTieKey({ year: 2026, date: null })).toBe("2026|");
    expect(recognitionTieKey({ year: null, date: null })).toBe("|");
  });

  it("reads the year from a date", () => {
    expect(yearFromDate("2025-11-02")).toBe(2025);
    expect(yearFromDate("")).toBeNull();
    expect(yearFromDate("1850-01-01")).toBeNull();
  });
});
