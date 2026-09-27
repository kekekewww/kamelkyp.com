import { describe, expect, it } from "vitest";
import {
  changedProjectSections,
  mergeIssues,
  PROJECT_SECTIONS,
  projectPublishIssues,
  projectSectionOf,
  readProjectForm,
  sameProjectContent,
  sectionIssueCounts,
} from "../../app/components/studio/projects/project-form";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import type { ValidationIssue } from "../../app/lib/cms/types";

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

const software = "term-project_category-software";
const ai = "term-project_category-ai";

describe("readProjectForm", () => {
  it("parses every editor group, localized fields and lists", () => {
    const result = readProjectForm(
      form([
        ["csrfToken", "token"],
        ["intent", "save"],
        ["expectedRevision", "3"],
        ["title.zh", "訊號花園"],
        ["title.en", "Signal Garden"],
        ["slug", "Signal-Garden"],
        ["year:number", "2026"],
        ["role.zh", "設計與開發"],
        ["role.en", "Design and development"],
        ["shortDescription.zh", "摘要"],
        ["shortDescription.en", "Summary"],
        ["description.zh", "段落一\n\n段落二"],
        ["description.en", "First\n\nSecond"],
        ["coverImageId", "asset-cover"],
        ["coverVideoId", ""],
        ["socialImageId", "asset-social"],
        ["gallery.0.assetId", "asset-g1"],
        ["gallery.0.caption.zh", "圖一"],
        ["gallery.0.caption.en", "Figure one"],
        ["gallery.1.assetId", "asset-g2"],
        ["gallery.1.caption.zh", ""],
        ["gallery.1.caption.en", ""],
        ["primaryCategoryId", ai],
        ["categoryIds:json", JSON.stringify([software, ai])],
        ["tools:json", JSON.stringify(["Ableton Live", "Figma"])],
        ["technologies:json", JSON.stringify(["TypeScript"])],
        ["story.context.zh", "背景"],
        ["story.context.en", "Context"],
        ["story.reflection.zh", "反思"],
        ["story.reflection.en", ""],
        ["links.0.label.zh", "原始碼"],
        ["links.0.label.en", "Source"],
        ["links.0.url", "https://github.com/example/signal"],
        ["credits.0.role.zh", "攝影"],
        ["credits.0.role.en", "Photography"],
        ["credits.0.name", "Studio North"],
        [
          "body:json",
          JSON.stringify({
            zh: [{ type: "paragraph", text: "舊內容" }],
            en: [],
          }),
        ],
        ["listed:bool", "false"],
        ["listed:bool", "true"],
        ["seo.title.zh", "SEO 標題"],
        ["seo.title.en", "SEO title"],
        ["seo.description.zh", ""],
        ["seo.description.en", ""],
        ["clearTodoContent:bool", "false"],
        ["clearTodoContent:bool", "true"],
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expectedRevision).toBe(3);
    expect(result.clearTodoContent).toBe(true);
    const content = result.content;
    expect(content.title).toEqual({ zh: "訊號花園", en: "Signal Garden" });
    expect(content.slug).toBe("signal-garden");
    expect(content.year).toBe(2026);
    expect(content.role.en).toBe("Design and development");
    expect(content.description.en).toBe("First\n\nSecond");
    expect(content.coverImageId).toBe("asset-cover");
    expect(content.coverVideoId).toBeNull();
    expect(content.socialImageId).toBe("asset-social");
    expect(content.gallery).toEqual([
      { assetId: "asset-g1", caption: { zh: "圖一", en: "Figure one" } },
      { assetId: "asset-g2", caption: { zh: "", en: "" } },
    ]);
    // The primary category always leads the chip order.
    expect(content.primaryCategoryId).toBe(ai);
    expect(content.categoryIds).toEqual([ai, software]);
    expect(content.tools).toEqual(["Ableton Live", "Figma"]);
    expect(content.technologies).toEqual(["TypeScript"]);
    expect(content.story.context).toEqual({ zh: "背景", en: "Context" });
    expect(content.story.reflection).toEqual({ zh: "反思", en: "" });
    expect(content.story.problem).toEqual({ zh: "", en: "" });
    expect(content.links).toEqual([
      {
        label: { zh: "原始碼", en: "Source" },
        url: "https://github.com/example/signal",
      },
    ]);
    expect(content.credits).toEqual([
      { role: { zh: "攝影", en: "Photography" }, name: "Studio North" },
    ]);
    expect(content.body.zh).toHaveLength(1);
    expect(content.listed).toBe(true);
    expect(content.seo.title.en).toBe("SEO title");
  });

  it("reads empty repeatable groups as empty lists", () => {
    const result = readProjectForm(
      form([
        ["expectedRevision", "0"],
        ["title.zh", "只有標題"],
        ["title.en", ""],
        ["gallery:json", "[]"],
        ["links:json", "[]"],
        ["credits:json", "[]"],
        ["categoryIds:json", "[]"],
        ["tools:json", "[]"],
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.gallery).toEqual([]);
    expect(result.content.links).toEqual([]);
    expect(result.content.credits).toEqual([]);
    expect(result.content.categoryIds).toEqual([]);
    expect(result.content.year).toBeNull();
    expect(result.clearTodoContent).toBe(false);
  });

  it("reports structural problems with the field and locale", () => {
    const result = readProjectForm(
      form([
        ["expectedRevision", "1"],
        ["title.zh", "長".repeat(201)],
        ["title.en", "Fine"],
        ["year:number", "1800"],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "title",
          locale: "zh",
          code: "too_long",
        }),
        expect.objectContaining({ field: "year", code: "invalid_value" }),
      ]),
    );
  });

  it("returns a null revision when the hidden field is missing", () => {
    const result = readProjectForm(form([["title.en", "No revision"]]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.expectedRevision).toBeNull();
  });
});

describe("publish readiness on the client", () => {
  it("lists the missing required fields for a title-only draft", () => {
    const content = ProjectDraftSchema.parse({
      slug: "title-only",
      title: { zh: "標題", en: "Title" },
    });
    const issues = projectPublishIssues(content, { todoContent: false });
    const blocking = issues.filter((issue) => issue.severity === "error");
    expect(blocking.map((issue) => issue.field).sort()).toEqual([
      "primaryCategoryId",
      "shortDescription",
      "shortDescription",
      "year",
    ]);
  });

  it("blocks seeded TODO_CONTENT rows", () => {
    const content = ProjectDraftSchema.parse({ slug: "seeded" });
    const issues = projectPublishIssues(content, { todoContent: true });
    expect(issues[0]?.code).toBe("todo_content");
  });

  it("keeps server-only findings next to fresh client findings", () => {
    const client: ValidationIssue[] = [
      {
        field: "year",
        code: "required",
        severity: "error",
        message: "Year is required.",
      },
    ];
    const server: ValidationIssue[] = [
      {
        field: "year",
        code: "required",
        severity: "error",
        message: "Year is required.",
      },
      {
        field: "shortDescription",
        code: "required_locale",
        locale: "en",
        severity: "error",
        message: "Short description is required in EN.",
      },
      {
        field: "coverImageId",
        code: "alt_required",
        locale: "en",
        severity: "error",
        message: "Add EN alt text to this image before publishing.",
      },
    ];
    // A dirty form trusts the client for model rules, the server for facts
    // the client cannot know (alt text, slug conflicts, brand guard).
    expect(mergeIssues(client, server, true).map((i) => i.code)).toEqual([
      "required",
      "alt_required",
    ]);
    // A clean form shows the server's full list.
    expect(mergeIssues(client, server, false)).toEqual(server);
  });
});

describe("sections", () => {
  it("names the seven editor groups in order", () => {
    expect(PROJECT_SECTIONS.map((section) => section.id)).toEqual([
      "basic",
      "media",
      "classification",
      "case-study",
      "links",
      "credits",
      "publication",
    ]);
  });

  it("maps issue fields to their section", () => {
    expect(projectSectionOf("title")).toBe("basic");
    expect(projectSectionOf("slug")).toBe("basic");
    expect(projectSectionOf("gallery.2.assetId")).toBe("media");
    expect(projectSectionOf("coverImageId")).toBe("media");
    expect(projectSectionOf("primaryCategoryId")).toBe("classification");
    expect(projectSectionOf("tools")).toBe("classification");
    expect(projectSectionOf("story.context")).toBe("case-study");
    expect(projectSectionOf("body.zh")).toBe("case-study");
    expect(projectSectionOf("links.0.url")).toBe("links");
    expect(projectSectionOf("credits.1.name")).toBe("credits");
    expect(projectSectionOf("todoContent")).toBe("publication");
    expect(projectSectionOf("seo.title")).toBe("publication");
    expect(projectSectionOf("snapshot")).toBe("publication");
  });

  it("counts blocking issues per section", () => {
    const counts = sectionIssueCounts([
      { field: "year", code: "required", severity: "error", message: "" },
      {
        field: "shortDescription",
        code: "required_locale",
        locale: "zh",
        severity: "error",
        message: "",
      },
      {
        field: "story.reflection",
        code: "one_locale_only",
        severity: "warning",
        message: "",
      },
      {
        field: "links.0.url",
        code: "invalid_url",
        severity: "error",
        message: "",
      },
    ]);
    expect(counts).toEqual({ basic: 2, links: 1 });
  });
});

describe("changedProjectSections", () => {
  it("names the sections whose working copy differs from the live one", () => {
    const live = ProjectDraftSchema.parse({
      slug: "live",
      title: { zh: "甲", en: "A" },
      year: 2026,
    });
    expect(changedProjectSections(live, null)).toEqual([]);
    expect(changedProjectSections(live, live)).toEqual([]);
    const working = ProjectDraftSchema.parse({
      ...live,
      year: 2025,
      story: { ...live.story, result: { zh: "成果", en: "Result" } },
      listed: false,
    });
    expect(changedProjectSections(working, live)).toEqual([
      "basic",
      "case-study",
      "publication",
    ]);
  });
});

describe("sameProjectContent", () => {
  it("ignores key order but not values", () => {
    const a = ProjectDraftSchema.parse({ title: { zh: "甲", en: "A" } });
    const reordered = JSON.parse(
      JSON.stringify({ ...a, title: { en: "A", zh: "甲" } }),
    );
    expect(sameProjectContent(a, reordered)).toBe(true);
    expect(sameProjectContent(a, { ...a, title: { zh: "甲", en: "B" } })).toBe(
      false,
    );
  });
});
