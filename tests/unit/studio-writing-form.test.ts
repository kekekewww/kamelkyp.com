import { describe, expect, it } from "vitest";
import {
  platformDisplay,
  WRITING_SECTIONS,
  writingIssues,
  writingRoute,
  writingSectionOf,
} from "../../app/components/studio/writing/writing-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const complete = {
  "title.zh": "標題",
  "title.en": "Title",
  slug: "title",
  date: "2026-09-01",
  platform: "internal",
  "content.zh:json": JSON.stringify([{ type: "paragraph", text: "內文" }]),
  "content.en:json": JSON.stringify([{ type: "paragraph", text: "Body" }]),
};

describe("writing form (client checklist)", () => {
  it("is ready when an internal article is complete", () => {
    expect(
      writingIssues(form(complete)).filter(
        (issue) => issue.severity === "error",
      ),
    ).toEqual([]);
  });

  it("asks an external post for its link instead of content", () => {
    const issues = writingIssues(
      form({
        ...complete,
        platform: "instagram",
        "content.zh:json": "[]",
        "content.en:json": "[]",
        externalUrl: "https://instagram.com/p/abc",
      }),
    );
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const missing = writingIssues(
      form({ ...complete, platform: "instagram", externalUrl: "" }),
    );
    expect(missing.map((issue) => issue.field)).toContain("externalUrl");
  });

  it("reports structural problems as blocking issues", () => {
    const issues = writingIssues(form({ ...complete, date: "01/09/2026" }));
    expect(issues).toEqual([
      expect.objectContaining({ field: "date", severity: "error" }),
    ]);
  });

  it("maps fields to editor sections", () => {
    expect(WRITING_SECTIONS.map((section) => section.id)).toEqual([
      "basic",
      "source",
      "content",
      "media",
      "publication",
    ]);
    expect(writingSectionOf("title")).toBe("basic");
    expect(writingSectionOf("platformLabel")).toBe("basic");
    expect(writingSectionOf("externalUrl")).toBe("source");
    expect(writingSectionOf("content.en.2.url")).toBe("content");
    expect(writingSectionOf("coverImageId")).toBe("media");
    expect(writingSectionOf("seo.title")).toBe("publication");
    expect(writingSectionOf("todoContent")).toBe("publication");
  });
});

describe("where a writing entry goes", () => {
  it("publishes internal entries as article pages", () => {
    expect(
      writingRoute({ platform: "internal", slug: "notes", externalUrl: null }),
    ).toEqual({ kind: "article", path: "/writing/notes" });
  });

  it("publishes external entries as cards that link out", () => {
    expect(
      writingRoute({
        platform: "threads",
        slug: "x",
        externalUrl: "https://www.threads.net/@kamel/post/1",
      }),
    ).toEqual({
      kind: "link",
      url: "https://www.threads.net/@kamel/post/1",
    });
    expect(
      writingRoute({ platform: "medium", slug: "x", externalUrl: "" }),
    ).toEqual({ kind: "incomplete" });
  });

  it("names platforms, including a custom one", () => {
    expect(platformDisplay("internal", null)).toBe("Internal");
    expect(platformDisplay("devpost", null)).toBe("Devpost");
    expect(platformDisplay("other", "Substack")).toBe("Substack");
    expect(platformDisplay("other", "")).toBe("Other");
  });
});
