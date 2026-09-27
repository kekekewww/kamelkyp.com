import { describe, expect, it } from "vitest";
import {
  filterByCategory,
  filterCategories,
  formatMetaDate,
  getProject,
  listProjects,
  listRecognition,
  localize,
  mergeWorks,
  mergeWriting,
  PROJECTS,
  parseCategory,
  WRITING,
} from "../../../app/content";

const d1Works = [
  {
    slug: "real-older",
    title: "Real older",
    summary: null,
    publishedAt: "2023-05-01T00:00:00Z",
  },
  {
    slug: "real-newer",
    title: "Real newer",
    summary: "A mix",
    publishedAt: "2026-01-10T00:00:00Z",
  },
];

describe("content helpers", () => {
  it("localizes text", () => {
    expect(localize({ zh: "作品", en: "Work" }, "zh")).toBe("作品");
    expect(localize({ zh: "作品", en: "Work" }, "en")).toBe("Work");
  });

  it("lists and finds projects", () => {
    expect(listProjects()).toHaveLength(PROJECTS.length);
    expect(listProjects({ featured: true }).every((p) => p.featured)).toBe(
      true,
    );
    expect(
      listProjects({ category: "research" }).map((project) => project.slug),
    ).toEqual(["sample-realtime-audio-analysis-notes"]);
    expect(getProject("sample-full-song-mix")?.year).toBe(2025);
    expect(getProject("missing")).toBeNull();
  });

  it("parses the category query, falling back to all", () => {
    expect(parseCategory("ai")).toBe("ai");
    expect(parseCategory("nope")).toBe("all");
    expect(parseCategory(null)).toBe("all");
    expect(parseCategory(undefined)).toBe("all");
  });

  it("merges D1 works before placeholders, newest year first", () => {
    const merged = mergeWorks(d1Works, PROJECTS, "en");
    expect(merged.slice(0, 2).map((item) => item.slug)).toEqual([
      "real-newer",
      "real-older",
    ]);
    expect(merged[0]).toMatchObject({
      source: "d1",
      categories: ["music"],
      placeholder: false,
      year: 2026,
      description: "A mix",
    });
    const placeholders = merged.slice(2);
    expect(placeholders.every((item) => item.placeholder)).toBe(true);
    const years = placeholders.map((item) => item.year ?? 0);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
    // File order is preserved within a year.
    expect(
      placeholders
        .filter((item) => item.year === 2025)
        .map((item) => item.slug),
    ).toEqual([
      "sample-full-song-mix",
      "sample-interactive-projection-study",
      "sample-realtime-audio-analysis-notes",
    ]);
    expect(placeholders[0]?.title).toBe("Sample: Generative Audio-Visual Tool");
  });

  it("drops a file project whose slug collides with a D1 work", () => {
    const merged = mergeWorks(
      [{ ...d1Works[0], slug: "sample-full-song-mix" }],
      PROJECTS,
      "zh",
    );
    expect(
      merged.filter((item) => item.slug === "sample-full-song-mix"),
    ).toHaveLength(1);
    expect(merged[0]?.source).toBe("d1");
  });

  it("filters by category and counts every option", () => {
    const merged = mergeWorks([], PROJECTS, "zh");
    expect(filterByCategory(merged, "all")).toHaveLength(6);
    expect(
      filterByCategory(merged, "research").map((item) => item.title),
    ).toEqual(["示意：即時音訊分析筆記"]);
    expect(filterByCategory([], "mixing")).toEqual([]);

    const options = filterCategories(merged, "zh");
    expect(options.map((option) => option.value)).toEqual([
      "all",
      "software",
      "ai",
      "interactive",
      "music",
      "mixing",
      "research",
    ]);
    expect(options.find((option) => option.value === "ai")).toEqual({
      value: "ai",
      label: "AI",
      count: 2,
    });
    expect(options[0]).toMatchObject({ label: "全部", count: 6 });
  });

  it("lists recognition newest first", () => {
    expect(listRecognition().map((entry) => entry.year)).toEqual([
      2026, 2025, 2024,
    ]);
    expect(listRecognition(2)).toHaveLength(2);
  });

  it("merges writing newest first with D1 posts as internal links", () => {
    const merged = mergeWriting(
      [{ slug: "hello", title: "Hello", publishedAt: "2026-08-20T10:00:00Z" }],
      WRITING,
      "en",
    );
    expect(merged.map((item) => item.date)).toEqual([
      "2026-09-01",
      "2026-08-20",
      "2026-08-18",
      "2026-07-30",
      "2026-06-12",
    ]);
    expect(merged[1]).toMatchObject({
      kind: "article",
      href: "/en/writing/hello",
      external: false,
      placeholder: false,
    });
    expect(merged[0]).toMatchObject({ href: null, placeholder: true });
    expect(formatMetaDate("2026-09-01")).toBe("2026.09.01");
  });
});
