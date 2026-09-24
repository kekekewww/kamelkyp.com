import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  isManualOrder,
  parseProjectListParams,
  relativeTime,
} from "../../app/components/studio/projects/project-list";

const params = (query: string) => new URLSearchParams(query);

describe("parseProjectListParams", () => {
  it("defaults to active entries in manual order", () => {
    expect(parseProjectListParams(params(""))).toEqual({
      q: "",
      status: "active",
      categoryId: null,
      year: null,
      featured: null,
      sort: "order",
    });
  });

  it("reads every filter from the URL", () => {
    expect(
      parseProjectListParams(
        params(
          "q=%20Signal%20&status=archived&category=term-project_category-ai&year=2025&featured=1&sort=updated",
        ),
      ),
    ).toEqual({
      q: "Signal",
      status: "archived",
      categoryId: "term-project_category-ai",
      year: 2025,
      featured: true,
      sort: "updated",
    });
    expect(parseProjectListParams(params("featured=0")).featured).toBe(false);
  });

  it("ignores values it does not understand", () => {
    expect(
      parseProjectListParams(
        params(
          "status=deleted&year=nineteen&sort=random&featured=maybe&category=",
        ),
      ),
    ).toEqual({
      q: "",
      status: "active",
      categoryId: null,
      year: null,
      featured: null,
      sort: "order",
    });
    expect(parseProjectListParams(params("year=1800")).year).toBeNull();
    expect(
      parseProjectListParams(params(`q=${"x".repeat(300)}`)).q,
    ).toHaveLength(200);
  });
});

describe("manual order", () => {
  it("is available only without search, filters or another sort", () => {
    const base = parseProjectListParams(params(""));
    expect(isManualOrder(base)).toBe(true);
    expect(hasActiveFilters(base)).toBe(false);
    for (const query of [
      "q=signal",
      "status=draft",
      "category=term-project_category-ai",
      "year=2026",
      "featured=1",
      "sort=year",
    ]) {
      expect(isManualOrder(parseProjectListParams(params(query))), query).toBe(
        false,
      );
    }
    expect(hasActiveFilters(parseProjectListParams(params("sort=year")))).toBe(
      false,
    );
    expect(hasActiveFilters(parseProjectListParams(params("q=x")))).toBe(true);
  });
});

describe("relativeTime", () => {
  const now = "2026-09-24T12:00:00Z";
  it("reads like a studio log", () => {
    expect(relativeTime("2026-09-24T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-24T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-09-24T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-09-22T12:00:00Z", now)).toBe("2 d ago");
    expect(relativeTime("2026-08-01T12:00:00Z", now)).toBe("2026-08-01");
  });
});
